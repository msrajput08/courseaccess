import AxeBuilder from '@axe-core/playwright';
import {test,expect,type Page} from '@playwright/test';

async function virtualPasskey(page:Page):Promise<void>{
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator',{
    options:{
      protocol:'ctap2',transport:'internal',hasResidentKey:true,
      hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,
    },
  });
}
async function register(page:Page,name:string):Promise<string>{
  await virtualPasskey(page);
  await page.goto('/account');
  await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible({timeout:20000});
  await page.getByLabel('Your display name').fill(name);
  await page.getByRole('button',{name:/Create with passkey/}).click();
  await expect(page.getByText('Account created and verified with your passkey.')).toBeVisible({timeout:30000});
  const res=await page.request.get('/api/auth/me');
  expect(res.status()).toBe(200);
  const data=await res.json();
  expect(data.authenticated).toBe(true);
  return data.account.id;
}
test('passkey registration, login, session cookie and verified account deletion',async({page})=>{
  const verifiedBodies:Record<string,unknown>[]=[];
  page.on('request',request=>{
    if(/\/api\/auth\/(?:register|login)\/verify$/.test(new URL(request.url()).pathname)){
      const body=request.postDataJSON();
      if(body&&typeof body==='object')verifiedBodies.push(body);
    }
  });
  await register(page,'Accessibility Lecturer');
  const replaySignup=await page.request.post('/api/auth/register/verify',{
    headers:{origin:'http://localhost:8789'},data:verifiedBodies[0],
  });
  expect(replaySignup.status()).toBe(400);
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(accessibility.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))).toEqual([]);
  const first=await page.request.get('/api/auth/me');
  expect(first.headers()['cache-control']).toBe('no-store');
  const cookie=page.context().cookies();
  expect((await cookie).some(c=>c.name==='__Host-courseaccess'&&c.httpOnly&&c.secure)).toBe(true);

  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.getByRole('heading',{name:'Already registered?'})).toBeVisible();
  await page.getByRole('button',{name:/Sign in with passkey/}).click();
  await expect(page.getByText('Passkey verified. You are signed in.')).toBeVisible({timeout:30000});
  const replayLogin=await page.request.post('/api/auth/login/verify',{
    headers:{origin:'http://localhost:8789'},data:verifiedBodies.at(-1),
  });
  expect(replayLogin.status()).toBe(400);

  await page.getByLabel('Type DELETE MY ACCOUNT').fill('DELETE MY ACCOUNT');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:/Permanently delete account/}).click();
  await expect(page.getByText('Your account has been deleted.')).toBeVisible({timeout:30000});
  expect((await (await page.request.get('/api/auth/me')).json()).authenticated).toBe(false);
});
test('institutional admin/owner roles restrict cross-organization changes',async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext(),guest=await browser.newContext();
  try{
    const owner=await a.newPage(),viewer=await b.newPage();
    const ownerId=await register(owner,'Organization Owner');
    const viewerId=await register(viewer,'Institution Viewer');
    expect(ownerId).not.toBe(viewerId);
    await owner.getByLabel('New organization name').fill('Science School');
    await owner.getByRole('button',{name:'Create organization'}).click();
    await expect(owner.getByRole('heading',{name:/Members/})).toBeVisible({timeout:10000});
    const mine=await (await owner.request.get('/api/auth/me')).json();
    const organization=mine.organizations.find((x:{display_name:string})=>x.display_name==='Science School');
    expect(organization.role).toBe('owner');
    await owner.getByLabel('Registered member’s account ID').fill(viewerId);
    await owner.getByRole('button',{name:'Add member',exact:true}).click();
    await expect(owner.getByText('Member added with the selected role.')).toBeVisible();

    // Guest and viewer cannot elevate their own roles or add arbitrary accounts.
    const anonymous=await guest.request.get('http://localhost:8789/api/organizations/'+organization.id+'/members');
    expect(anonymous.status()).toBe(401);
    const viewResp=await viewer.request.get('http://localhost:8789/api/organizations/'+organization.id+'/members');
    expect(viewResp.status()).toBe(200);
    const forbidden=await viewer.request.post('http://localhost:8789/api/organizations/'+organization.id+'/members',{
      headers:{origin:'http://localhost:8789','content-type':'application/json'},
      data:{accountId:ownerId,role:'admin'},
    });
    expect(forbidden.status()).toBe(403);
    const csrf=await owner.request.post('http://localhost:8789/api/organizations/'+organization.id+'/members',{
      headers:{origin:'https://attacker.example','content-type':'application/json'},
      data:{accountId:viewerId,role:'admin'},
    });
    expect(csrf.status()).toBe(403);
    const selfElevate=await viewer.request.patch('http://localhost:8789/api/organizations/'+organization.id+'/members/'+viewerId,{
      headers:{origin:'http://localhost:8789','content-type':'application/json'},
      data:{role:'owner'},
    });
    expect(selfElevate.status()).toBe(403);
    const ownership=await owner.request.post('http://localhost:8789/api/organizations/'+organization.id+'/transfer',{
      headers:{origin:'http://localhost:8789'},data:{accountId:viewerId},
    });
    expect(ownership.status()).toBe(200);
    const oldMember=await (await owner.request.get('http://localhost:8789/api/auth/me')).json();
    const newMember=await (await viewer.request.get('http://localhost:8789/api/auth/me')).json();
    expect(oldMember.organizations.find((o:{id:string})=>o.id===organization.id).role).toBe('admin');
    expect(newMember.organizations.find((o:{id:string})=>o.id===organization.id).role).toBe('owner');
    const oldDelete=await owner.request.post('http://localhost:8789/api/organizations/'+organization.id+'/delete',{
      headers:{origin:'http://localhost:8789'},data:{confirmName:'Science School'},
    });
    expect(oldDelete.status()).toBe(403);
    const newDelete=await viewer.request.post('http://localhost:8789/api/organizations/'+organization.id+'/delete',{
      headers:{origin:'http://localhost:8789'},data:{confirmName:'Science School'},
    });
    expect(newDelete.status()).toBe(200);
  }finally{await a.close();await b.close();await guest.close();}
});
test('unconfigured or untrusted-origin authentication is fail closed',async({request})=>{
  const res=await request.get('/api/auth/status');
  expect(res.status()).toBe(200);
  expect((await res.json()).enabled).toBe(true);
  const withoutOrigin=await request.post('/api/auth/register/options',{data:{displayName:'Blocked'}});
  expect(withoutOrigin.status()).toBe(403);
  const crossOrigin=await request.post('/api/auth/register/options',{
    headers:{origin:'https://malicious.invalid'},
    data:{displayName:'Blocked'},
  });
  expect(crossOrigin.status()).toBe(403);
  const badBody=await request.post('/api/auth/register/options',{
    headers:{origin:'http://localhost:8789'},
    data:{displayName:''},
  });
  expect(badBody.status()).toBe(400);
});
