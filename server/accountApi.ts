import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import {
  type AccountEnv,type Database,ApiError,responseJSON,activeAccountService,
  requireSameOrigin,readBody,safeName,validId,getCookie,cookie,
  sessionCookie,flowCookie,newSecret,sha256,changes,rateLimit,dbKey
} from './accountSecurity';
import {handleOrganizationApi} from './organizationApi';

interface Challenge {
  challenge_id:string;account_id:string|null;nonce:string;
  purpose:'register'|'authenticate'|'add_passkey';
  expires_at_ms:number;consumed_at_ms:number|null;
  pending_display_name:string|null;
}
export interface Identity {
  account_id:string;display_name:string;issued_at_ms:number;
}
interface CredentialRow {
  credential_id:string;account_id:string;cose_public_key:unknown;sign_count:number;
}
const SESSION_SECONDS=60*60*24*14;
const FLOW_SECONDS=300;
const textEncoder=new TextEncoder();

function authOrigin(req:Request,env:AccountEnv):string {
  if(!activeAccountService(req,env))throw new ApiError(503,'Account service is not configured.');
  return env.COURSEACCESS_AUTH_ORIGIN!;
}
function database(env:AccountEnv):Database {
  if(!env.DB)throw new ApiError(503,'Account service is not configured.');
  return env.DB;
}
async function session(req:Request,db:Database):Promise<Identity|null>{
  const secret=getCookie(req,sessionCookie);
  if(!secret||!/^[a-zA-Z0-9_-]{40,50}$/.test(secret))return null;
  const hash=await sha256(secret);
  return db.prepare(
    'SELECT s.account_id,a.display_name,s.issued_at_ms FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? AND a.deleted_at_ms IS NULL'
  ).bind(hash,Date.now()).first<Identity>();
}
async function requireIdentity(req:Request,db:Database):Promise<Identity>{
  const found=await session(req,db);
  if(!found)throw new ApiError(401,'Sign in to continue.');
  return found;
}
async function createSession(db:Database,accountId:string,now=Date.now()):Promise<string>{
  const secret=newSecret();
  await db.prepare('INSERT INTO sessions(token_hash,account_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?)').bind(
    await sha256(secret),accountId,now,now+SESSION_SECONDS*1000
  ).run();
  return cookie(sessionCookie,secret,SESSION_SECONDS);
}
async function issueChallenge(db:Database,purpose:Challenge['purpose'],
  nonce:string,accountId:string|null=null,name:string|null=null,challengeId=crypto.randomUUID()):Promise<string>{
  const now=Date.now();
  await db.prepare(
    'INSERT INTO auth_challenges(challenge_id,account_id,nonce,purpose,expires_at_ms,created_at_ms,pending_display_name) VALUES(?,?,?,?,?,?,?)'
  ).bind(challengeId,accountId,nonce,purpose,now+FLOW_SECONDS*1000,now,name).run();
  return challengeId;
}
async function consumeChallenge(req:Request,db:Database,purpose:Challenge['purpose'],body:Record<string,unknown>):Promise<Challenge>{
  const id=body.challengeId;
  if(!validId(id)||getCookie(req,flowCookie)!==id)
    throw new ApiError(400,'Passkey ceremony is missing or has expired.');
  const record=await db.prepare(
    'SELECT * FROM auth_challenges WHERE challenge_id=? AND purpose=? AND consumed_at_ms IS NULL AND expires_at_ms>?'
  ).bind(id,purpose,Date.now()).first<Challenge>();
  if(!record)throw new ApiError(400,'Passkey challenge expired or already used.');
  const updated=await db.prepare(
    'UPDATE auth_challenges SET consumed_at_ms=? WHERE challenge_id=? AND consumed_at_ms IS NULL AND expires_at_ms>?'
  ).bind(Date.now(),id,Date.now()).run();
  if(changes(updated)!==1)throw new ApiError(400,'Passkey challenge has already been consumed.');
  return record;
}
function verifyResponseShape(value:unknown):Record<string,unknown>{
  if(!value||Array.isArray(value)||typeof value!=='object')throw new ApiError(400,'Passkey response is required.');
  const r=value as Record<string,unknown>;
  if(typeof r.id!=='string'||r.id.length>512||typeof r.type!=='string')
    throw new ApiError(400,'Invalid passkey response.');
  return r;
}
async function generateSignup(req:Request,db:Database,rpID:string):Promise<Response>{
  await rateLimit(db,req,'signup',15);
  const body=await readBody(req);
  const name=safeName(body.displayName);
  const id=crypto.randomUUID();
  const options=await generateRegistrationOptions({
    rpName:'CourseAccess',rpID,userID:textEncoder.encode(id),
    userName:name,userDisplayName:name,attestationType:'none',
    supportedAlgorithmIDs:[-7,-257],
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
  });
  await issueChallenge(db,'register',options.challenge,null,name,id);
  return responseJSON({challengeId:id,options},200,{'set-cookie':cookie(flowCookie,id,FLOW_SECONDS)});
}
async function finishSignup(req:Request,db:Database,rpID:string,origin:string):Promise<Response>{
  await rateLimit(db,req,'signup-finish',30);
  const body=await readBody(req);
  const challenge=await consumeChallenge(req,db,'register',body);
  const response=verifyResponseShape(body.response) as unknown as RegistrationResponseJSON;
  let result:Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    result=await verifyRegistrationResponse({
      response,expectedChallenge:challenge.nonce,
      expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
    });
  }catch{throw new ApiError(400,'Passkey registration could not be verified.');}
  const credential=result.registrationInfo?.credential;
  if(!result.verified||!credential||!challenge.pending_display_name)
    throw new ApiError(400,'Passkey registration was not verified.');
  const now=Date.now(),secret=newSecret(),hash=await sha256(secret);
  // D1 batch executes in one transaction: no orphan user if credential collides.
  try{
    await db.batch([
      db.prepare('INSERT INTO accounts(id,display_name,created_at_ms) VALUES(?,?,?)').bind(
        challenge.challenge_id,challenge.pending_display_name,now),
      db.prepare('INSERT INTO passkey_credentials(credential_id,account_id,cose_public_key,sign_count,created_at_ms) VALUES(?,?,?,?,?)').bind(
        credential.id,challenge.challenge_id,Array.from(credential.publicKey),credential.counter,now),
      db.prepare('INSERT INTO sessions(token_hash,account_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?)').bind(
        hash,challenge.challenge_id,now,now+SESSION_SECONDS*1000),
    ]);
  }catch{throw new ApiError(409,'Account registration could not be completed. Please retry.');}
  return responseJSON({authenticated:true,account:{id:challenge.challenge_id,name:challenge.pending_display_name}},201,{
    'set-cookie':cookie(sessionCookie,secret,SESSION_SECONDS)+', '+cookie(flowCookie,'',0),
  });
}
async function beginLogin(req:Request,db:Database,rpID:string):Promise<Response>{
  await rateLimit(db,req,'login',60);
  const options=await generateAuthenticationOptions({
    rpID,allowCredentials:[],userVerification:'required',
  });
  const id=await issueChallenge(db,'authenticate',options.challenge);
  return responseJSON({challengeId:id,options},200,{'set-cookie':cookie(flowCookie,id,FLOW_SECONDS)});
}
async function finishLogin(req:Request,db:Database,rpID:string,origin:string):Promise<Response>{
  await rateLimit(db,req,'login-finish',60);
  const body=await readBody(req);
  const challenge=await consumeChallenge(req,db,'authenticate',body);
  const response=verifyResponseShape(body.response) as unknown as AuthenticationResponseJSON;
  const row=await db.prepare(
    'SELECT p.credential_id,p.account_id,p.cose_public_key,p.sign_count FROM passkey_credentials p JOIN accounts a ON a.id=p.account_id WHERE p.credential_id=? AND a.deleted_at_ms IS NULL'
  ).bind(response.id).first<CredentialRow>();
  if(!row)throw new ApiError(401,'This passkey is not registered.');
  let result:Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try{
    result=await verifyAuthenticationResponse({
      response,expectedChallenge:challenge.nonce,
      expectedOrigin:origin,expectedRPID:rpID,
      credential:{id:row.credential_id,publicKey:dbKey(row.cose_public_key),counter:row.sign_count},
      requireUserVerification:true,
    });
  }catch{throw new ApiError(401,'Passkey verification failed.');}
  if(!result.verified)throw new ApiError(401,'Passkey verification failed.');
  const now=Date.now(),secret=newSecret(),hash=await sha256(secret);
  await db.batch([
    db.prepare('UPDATE passkey_credentials SET sign_count=?,last_used_at_ms=? WHERE credential_id=?').bind(
      result.authenticationInfo.newCounter,now,row.credential_id),
    db.prepare('INSERT INTO sessions(token_hash,account_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?)').bind(
      hash,row.account_id,now,now+SESSION_SECONDS*1000),
  ]);
  return responseJSON({authenticated:true},200,{
    'set-cookie':cookie(sessionCookie,secret,SESSION_SECONDS)+', '+cookie(flowCookie,'',0),
  });
}
async function startExtraPasskey(req:Request,db:Database,rpID:string):Promise<Response>{
  const identity=await requireIdentity(req,db);
  await rateLimit(db,req,'add-passkey',15);
  const saved=await db.prepare('SELECT credential_id FROM passkey_credentials WHERE account_id=?').bind(identity.account_id).all<{credential_id:string}>();
  const options=await generateRegistrationOptions({
    rpName:'CourseAccess',rpID,userID:textEncoder.encode(identity.account_id),
    userName:identity.display_name,userDisplayName:identity.display_name,
    attestationType:'none',supportedAlgorithmIDs:[-7,-257],
    excludeCredentials:saved.results.map(row=>({id:row.credential_id})),
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
  });
  const id=await issueChallenge(db,'add_passkey',options.challenge,identity.account_id);
  return responseJSON({challengeId:id,options},200,{'set-cookie':cookie(flowCookie,id,FLOW_SECONDS)});
}
async function finishExtraPasskey(req:Request,db:Database,rpID:string,origin:string):Promise<Response>{
  const identity=await requireIdentity(req,db);
  const body=await readBody(req);
  const challenge=await consumeChallenge(req,db,'add_passkey',body);
  if(challenge.account_id!==identity.account_id)throw new ApiError(403,'Passkey registration is not yours.');
  const response=verifyResponseShape(body.response) as unknown as RegistrationResponseJSON;
  let result:Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try{
    result=await verifyRegistrationResponse({
      response,expectedChallenge:challenge.nonce,
      expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
    });
  }catch{throw new ApiError(400,'Extra passkey could not be verified.');}
  const credential=result.registrationInfo?.credential;
  if(!result.verified||!credential)throw new ApiError(400,'Passkey registration was not verified.');
  try{
    await db.prepare('INSERT INTO passkey_credentials(credential_id,account_id,cose_public_key,sign_count,created_at_ms) VALUES(?,?,?,?,?)')
      .bind(credential.id,identity.account_id,Array.from(credential.publicKey),credential.counter,Date.now()).run();
  }catch{throw new ApiError(409,'This passkey is already registered.');}
  return responseJSON({added:true},201,{'set-cookie':cookie(flowCookie,'',0)});
}
async function getMe(req:Request,db:Database):Promise<Response>{
  const me=await session(req,db);
  if(!me)return responseJSON({enabled:true,authenticated:false});
  const groups=await db.prepare(
    'SELECT o.id,o.display_name,m.role FROM organization_members m JOIN organizations o ON o.id=m.organization_id WHERE m.account_id=? ORDER BY o.display_name'
  ).bind(me.account_id).all<{id:string;display_name:string;role:string}>();
  const count=await db.prepare('SELECT count(*) AS total FROM passkey_credentials WHERE account_id=?').bind(me.account_id).first<{total:number}>();
  return responseJSON({enabled:true,authenticated:true,
    account:{id:me.account_id,name:me.display_name},
    passkeyCount:count?.total??1,organizations:groups.results,
  });
}
async function logout(req:Request,db:Database):Promise<Response>{
  const secret=getCookie(req,sessionCookie);
  if(secret)await db.prepare('UPDATE sessions SET revoked_at_ms=? WHERE token_hash=? AND revoked_at_ms IS NULL')
    .bind(Date.now(),await sha256(secret)).run();
  return responseJSON({authenticated:false},200,{'set-cookie':cookie(sessionCookie,'',0)});
}
async function deleteAccount(req:Request,db:Database):Promise<Response>{
  const identity=await requireIdentity(req,db);
  const body=await readBody(req);
  if(body.confirm!=='DELETE MY ACCOUNT')throw new ApiError(400,'Confirmation phrase does not match.');
  // High impact action requires a passkey login in the last 10 minutes.
  if(Date.now()-identity.issued_at_ms>600_000)
    throw new ApiError(403,'Sign out and verify your passkey again before deleting an account.');
  await db.batch([
    // Owned organizations, including their memberships, are removed first.
    db.prepare('DELETE FROM organizations WHERE created_by=?').bind(identity.account_id),
    db.prepare('DELETE FROM accounts WHERE id=?').bind(identity.account_id),
  ]);
  return responseJSON({deleted:true},200,{'set-cookie':cookie(sessionCookie,'',0)});
}
export async function handleAccountApi(req:Request,env:AccountEnv):Promise<Response>{
  try{
    const url=new URL(req.url),path=url.pathname;
    if(path==='/api/auth/status'&&req.method==='GET')
      return responseJSON({enabled:activeAccountService(req,env),method:'passkey',billingEnabled:false});
    const origin=authOrigin(req,env),db=database(env),rpID=new URL(origin).hostname;
    requireSameOrigin(req);
    if(path==='/api/auth/me'&&req.method==='GET')return getMe(req,db);
    if(path==='/api/auth/register/options'&&req.method==='POST')return generateSignup(req,db,rpID);
    if(path==='/api/auth/register/verify'&&req.method==='POST')return finishSignup(req,db,rpID,origin);
    if(path==='/api/auth/login/options'&&req.method==='POST')return beginLogin(req,db,rpID);
    if(path==='/api/auth/login/verify'&&req.method==='POST')return finishLogin(req,db,rpID,origin);
    if(path==='/api/auth/passkeys/options'&&req.method==='POST')return startExtraPasskey(req,db,rpID);
    if(path==='/api/auth/passkeys/verify'&&req.method==='POST')return finishExtraPasskey(req,db,rpID,origin);
    if(path==='/api/auth/logout'&&req.method==='POST')return logout(req,db);
    if(path==='/api/auth/delete'&&req.method==='POST')return deleteAccount(req,db);
    if(path.startsWith('/api/organizations'))
      return handleOrganizationApi(req,db,await requireIdentity(req,db));
    return responseJSON({error:'Endpoint not found.'},404);
  }catch(error){
    if(error instanceof ApiError)return responseJSON({error:error.message},error.status);
    // Never leak SQL, passkeys, challenge values or credential material.
    return responseJSON({error:'Account service encountered an unexpected error.'},500);
  }
}
