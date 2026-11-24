import {test,expect} from '@playwright/test';

test('real production D1 passkey account registration, login and deletion',async({page,request})=>{
  test.setTimeout(90_000);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',transport:'internal',hasResidentKey:true,
    hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,
  }});
  const status=await request.get('/api/auth/status');
  expect(status.status()).toBe(200);
  expect(await status.json()).toMatchObject({enabled:true,method:'passkey',billingEnabled:process.env.COURSEACCESS_EXPECT_COMMERCIAL==='true'});
  const unauthenticated=await request.get('/api/auth/me');
  expect((await unauthenticated.json()).authenticated).toBe(false);
  await page.goto('/account');
  await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible({timeout:25_000});
  await page.getByLabel('Your display name').fill('CourseAccess Release Smoke Test');
  await page.getByRole('button',{name:/Create with passkey/}).click();
  await expect(page.getByText('Account created and verified with your passkey.'))
    .toBeVisible({timeout:40_000});
  const me=await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({authenticated:true});
  const cookie=await page.context().cookies();
  expect(cookie.some(x=>x.name==='__Host-courseaccess'&&x.httpOnly&&x.secure)).toBe(true);
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.getByRole('heading',{name:'Already registered?'})).toBeVisible();
  await page.getByRole('button',{name:/Sign in with passkey/}).click();
  await expect(page.getByText('Passkey verified. You are signed in.'))
    .toBeVisible({timeout:40_000});
  await page.getByLabel('Type DELETE MY ACCOUNT').fill('DELETE MY ACCOUNT');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:/Permanently delete account/}).click();
  await expect(page.getByText('Your account has been deleted.')).toBeVisible({timeout:25_000});
  expect((await (await page.request.get('/api/auth/me')).json()).authenticated).toBe(false);
});
test('live accounts reject CSRF, invalid registration and unprovisioned billing',async({request})=>{
  const status=await request.get('/api/auth/status');
  expect((await status.json()).enabled).toBe(true);
  const denied=await request.post('/api/auth/register/options',{
    headers:{origin:'https://attacker.invalid'},
    data:{displayName:'CSRF Attempt'},
  });
  expect(denied.status()).toBe(403);
  const plans=await request.get('/api/plans');
  expect(plans.status()).toBe(200);
  expect((await plans.json()).billingEnabled).toBe(process.env.COURSEACCESS_EXPECT_COMMERCIAL==='true');
});
