import {useCallback,useEffect,useState} from 'react';
import BillingManagement from './BillingManagement';
import {startRegistration,startAuthentication} from '@simplewebauthn/browser';
import {ArrowRight,CheckCircle2,Copy,KeyRound,LockKeyhole,ShieldCheck,Users,UserPlus} from 'lucide-react';

type Role='owner'|'admin'|'editor'|'viewer';
interface Organization {id:string;display_name:string;role:Role}
interface Member {id:string;display_name:string;role:Role;joined_at_ms:number}
interface AccountState {
  enabled:boolean;authenticated:boolean;
  account?:{id:string;name:string};passkeyCount?:number;organizations?:Organization[];
}
async function requestJSON(path:string,body?:Record<string,unknown>,method='POST'):Promise<Record<string,any>> {
  const res=await fetch(path,{
    method:body?method:'GET',credentials:'same-origin',
    headers:body?{'content-type':'application/json'}:undefined,
    body:body?JSON.stringify(body):undefined,
    cache:'no-store',
  });
  const value=await res.json().catch(()=>({error:'Unexpected server response.'}));
  if(!res.ok)throw new Error(value.error||'Request failed.');
  return value;
}
export default function AccountPage(){
  const [me,setMe]=useState<AccountState|null>(null);
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState('');
  const [problem,setProblem]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [orgName,setOrgName]=useState('');
  const [activeOrg,setActiveOrg]=useState<string>('');
  const [members,setMembers]=useState<Member[]>([]);
  const [inviteId,setInviteId]=useState('');
  const [inviteRole,setInviteRole]=useState<Exclude<Role,'owner'>>('viewer');
  const [deletePhrase,setDeletePhrase]=useState('');
  const [deletedOrgName,setDeletedOrgName]=useState('');

  const refresh=useCallback(async()=>{
    let status:Record<string,any>;
    try{status=await requestJSON('/api/auth/status');}
    catch{
      // Vite preview/static hosting does not provide the Worker API.
      setMe({enabled:false,authenticated:false});return;
    }
    if(!status.enabled){setMe({enabled:false,authenticated:false});return;}
    setMe(await requestJSON('/api/auth/me') as unknown as AccountState);
  },[]);
  useEffect(()=>{let cancelled=false;(async()=>{
    try{await refresh();}catch(e){if(!cancelled)setProblem(e instanceof Error?e.message:'Unable to load account.');}
  })();return()=>{cancelled=true;};},[refresh]);
  const run=async(action:()=>Promise<void>,success:string)=>{
    setWorking(true);setProblem('');setMessage('');
    try{await action();await refresh();setMessage(success);}
    catch(e){setProblem(e instanceof Error?e.message:'Operation failed.');}
    finally{setWorking(false);}
  };
  const signup=()=>run(async()=>{
    if(displayName.trim().length<2)throw new Error('Enter a display name of at least 2 characters.');
    const pending=await requestJSON('/api/auth/register/options',{displayName});
    const response=await startRegistration({optionsJSON:pending.options});
    await requestJSON('/api/auth/register/verify',{challengeId:pending.challengeId,response});
  },'Account created and verified with your passkey.');
  const login=()=>run(async()=>{
    const pending=await requestJSON('/api/auth/login/options',{});
    const response=await startAuthentication({optionsJSON:pending.options});
    await requestJSON('/api/auth/login/verify',{challengeId:pending.challengeId,response});
  },'Passkey verified. You are signed in.');
  const anotherPasskey=()=>run(async()=>{
    const pending=await requestJSON('/api/auth/passkeys/options',{});
    const response=await startRegistration({optionsJSON:pending.options});
    await requestJSON('/api/auth/passkeys/verify',{challengeId:pending.challengeId,response});
  },'Another passkey was added to your account.');
  const loadMembers=async(id:string)=>{
    setActiveOrg(id);
    try{
      const result=await requestJSON('/api/organizations/'+id+'/members');
      setMembers(result.members as Member[]);
    }catch(e){setProblem(e instanceof Error?e.message:'Unable to load members.');}
  };
  const createOrg=()=>run(async()=>{
    const result=await requestJSON('/api/organizations',{name:orgName});
    setOrgName('');await loadMembers(result.organization.id);
  },'Organization created. Invite registered members using their account IDs.');
  const addMember=()=>run(async()=>{
    await requestJSON('/api/organizations/'+activeOrg+'/members',{accountId:inviteId.trim(),role:inviteRole});
    setInviteId('');await loadMembers(activeOrg);
  },'Member added with the selected role.');
  const changeRole=(memberId:string,role:Exclude<Role,'owner'>)=>run(async()=>{
    await requestJSON('/api/organizations/'+activeOrg+'/members/'+memberId,{role},'PATCH');
    await loadMembers(activeOrg);
  },'Member role updated.');
  const removeMember=(memberId:string)=>{
    if(!window.confirm('Remove this member from the organization?'))return;
    return run(async()=>{
    await requestJSON('/api/organizations/'+activeOrg+'/members/'+memberId,{},'DELETE');
    await loadMembers(activeOrg);
  },'Member removed.');};
  const transfer=(memberId:string)=>{
    if(!window.confirm('Transfer ownership? You will become an admin and cannot undo this without the new owner.'))return;
    return run(async()=>{
    await requestJSON('/api/organizations/'+activeOrg+'/transfer',{accountId:memberId});
    await loadMembers(activeOrg);
  },'Organization ownership transferred.');};
  const deleteOrg=()=>run(async()=>{
    await requestJSON('/api/organizations/'+activeOrg+'/delete',{confirmName:deletedOrgName});
    setActiveOrg('');setMembers([]);setDeletedOrgName('');
  },'Organization deleted.');
  const deleteAccount=()=>{
    if(!window.confirm('Permanently delete your account and organizations you own? This cannot be undone.'))return;
    return run(async()=>{
    if(deletePhrase!=='DELETE MY ACCOUNT')throw new Error('Type the exact deletion phrase.');
    await requestJSON('/api/auth/delete',{confirm:deletePhrase});
    setActiveOrg('');setMembers([]);setDeletePhrase('');
  },'Your account has been deleted.');};
  const logout=()=>run(async()=>{
    await requestJSON('/api/auth/logout',{});
    setActiveOrg('');setMembers([]);
  },'Signed out.');
  const organizations=me?.organizations||[];
  const selection=organizations.find(o=>o.id===activeOrg);
  const canManage=selection?.role==='owner'||selection?.role==='admin';
  return <main className="shell account-page">
    <div className="eyebrow"><i/> YOUR SECURE SPACE</div>
    <div className="account-hero"><div><h1>Access built on <em>trust.</em></h1>
      <p>Passkey security, private document processing and carefully scoped institution membership. New paid subscriptions are not available yet.</p>
    </div><div className="account-hero-symbol" aria-hidden="true"><ShieldCheck size={54}/></div></div>
    {message&&<p className="account-banner account-success" role="status"><CheckCircle2 size={18}/>{message}</p>}
    {problem&&<p className="account-banner account-error" role="alert">{problem}</p>}
    {!me&&<p role="status">Checking account service…</p>}
    {me&&!me.enabled&&<section className="account-panel">
      <LockKeyhole size={30}/><h2>Secure accounts are being configured.</h2>
      <p>Document inspection remains available without an account. Sign-in becomes available only after the owner provisions D1 and verifies the account origin. No password or payment details are collected here.</p>
      <a className="button button-primary" href="/checker">Use the private document checker <ArrowRight size={16}/></a>
    </section>}
    {me?.enabled&&!me.authenticated&&<div className="account-panels">
      <section className="account-panel"><UserPlus size={28}/><h2>Create your account</h2>
        <p>Choose a name, then verify a device passkey. No password or email is required.</p>
        <label htmlFor="register-name">Your display name</label>
        <input id="register-name" autoComplete="name" maxLength={140} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="e.g. Dr. Parker"/>
        <button className="button button-primary" disabled={working} onClick={signup}><KeyRound size={18}/> Create with passkey</button>
      </section>
      <section className="account-panel"><KeyRound size={28}/><h2>Already registered?</h2>
        <p>Use your existing device passkey or synced password manager to sign in safely.</p>
        <button className="button button-primary" disabled={working} onClick={login}>Sign in with passkey <ArrowRight size={17}/></button>
        <p className="account-note">Keep more than one passkey. If all passkeys are lost, this version has no email recovery mechanism.</p>
      </section>
    </div>}
    {me?.authenticated&&me.account&&<>
      <div className="account-panels">
        <section className="account-panel"><ShieldCheck size={27}/><h2>{me.account.name}</h2>
          <p>Signed in with a verified passkey. Your actual document bytes still stay in the browser.</p>
          <div className="account-id"><span>Account ID: <code>{me.account.id}</code></span>
            <button type="button" aria-label="Copy your account ID" onClick={()=>navigator.clipboard.writeText(me.account!.id)}><Copy size={15}/></button>
          </div>
          <p className="account-note">Share this ID only with an organization administrator who intends to add you.</p>
          <p>{me.passkeyCount} registered passkey(s)</p>
          <div className="account-actions"><button disabled={working} onClick={anotherPasskey} className="button button-primary"><KeyRound size={16}/> Add backup passkey</button>
          <button disabled={working} onClick={logout} className="button button-quiet">Sign out</button></div>
        </section>
        <section className="account-panel"><Users size={27}/><h2>Institution memberships</h2>
          <p>Create a private membership directory; this does not activate subscription-only services or upload student materials.</p>
          <label htmlFor="org-name">New organization name</label>
          <input id="org-name" maxLength={160} value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="e.g. Science Department"/>
          <button className="button button-primary" disabled={working} onClick={createOrg}>Create organization <ArrowRight size={16}/></button>
        </section>
      </div>
      <BillingManagement/>
      <section className="account-panel account-membership">
        <h2>Organizations</h2>
        {organizations.length===0?<p>You are not in any institution workspace yet.</p>:
          <div className="account-org-list">{organizations.map(org=><button type="button" className={activeOrg===org.id?'active':''} key={org.id} onClick={()=>loadMembers(org.id)}><span>{org.display_name}</span><small>{org.role}</small></button>)}</div>}
        {selection&&<div className="account-member-editor">
          <h3>Members · {selection.display_name}</h3>
          <ul>{members.map(member=><li key={member.id}><div><strong>{member.display_name}</strong><small>{member.id}</small></div>
            <span>{member.role}</span>
            {selection.role==='owner'&&member.role!=='owner'&&<><select aria-label={'Role of '+member.display_name} value={member.role} disabled={working} onChange={e=>changeRole(member.id,e.target.value as Exclude<Role,'owner'>)}>
              <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
            </select><button type="button" disabled={working} onClick={()=>transfer(member.id)}>Transfer ownership</button></>}
            {(selection.role==='owner'||selection.role==='admin'&&['editor','viewer'].includes(member.role)||member.id===me.account!.id)&&member.role!=='owner'&&
              <button type="button" disabled={working} onClick={()=>removeMember(member.id)}>Remove</button>}</li>)}</ul>
          {canManage&&<div className="account-invite"><h3>Add existing member</h3>
            <label htmlFor="invite-id">Registered member’s account ID</label>
            <input id="invite-id" value={inviteId} onChange={e=>setInviteId(e.target.value)} placeholder="Account UUID"/>
            <label htmlFor="invite-role">Membership role</label>
            <select id="invite-role" value={inviteRole} onChange={e=>setInviteRole(e.target.value as Exclude<Role,'owner'>)}>
              {selection.role==='owner'&&<option value="admin">Admin</option>}
              <option value="editor">Editor</option><option value="viewer">Viewer</option>
            </select>
            <button className="button button-primary" disabled={working} onClick={addMember}>Add member</button>
          </div>}
          {selection.role==='owner'&&<div className="account-danger">
            <h3>Delete organization</h3><p>This permanently removes all memberships. Enter the exact organization name.</p>
            <input aria-label="Organization deletion confirmation" value={deletedOrgName} onChange={e=>setDeletedOrgName(e.target.value)}/>
            <button disabled={working||deletedOrgName!==selection.display_name} onClick={deleteOrg}>Delete organization</button>
          </div>}
        </div>}
      </section>
      <section className="account-panel account-danger">
        <h2>Delete my account</h2><p>Permanently removes your passkeys, sessions, organization memberships and organizations you own. No uploaded document data exists on our server. Sign in again just before deletion if your session is older than ten minutes.</p>
        <label htmlFor="delete-account">Type DELETE MY ACCOUNT</label>
        <input id="delete-account" value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)}/>
        <button disabled={working||deletePhrase!=='DELETE MY ACCOUNT'} onClick={deleteAccount}>Permanently delete account</button>
      </section>
    </>}
  </main>;
}
