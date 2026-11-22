/** Cloudflare D1 account service contracts; D1 is intentionally optional until provisioned. */
export interface Statement {
  bind(...values:unknown[]):Statement;
  first<T=Record<string,unknown>>():Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<{results:T[]}>;
  run():Promise<{meta?:{changes?:number};changes?:number}>;
}
export interface Database {
  prepare(sql:string):Statement;
  batch(statements:Statement[]):Promise<unknown[]>;
}
export interface AccountEnv {
  DB?:Database;
  COURSEACCESS_AUTH_ORIGIN?:string;
}
export class ApiError extends Error {
  constructor(public status:number,message:string){super(message);}
}
export const responseJSON=(body:unknown,status=200,extras:Record<string,string>={})=>
  new Response(JSON.stringify(body),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...extras,
  }});
export function activeAccountService(req:Request,env:AccountEnv):boolean {
  if(!env.DB||!env.COURSEACCESS_AUTH_ORIGIN)return false;
  const origin=env.COURSEACCESS_AUTH_ORIGIN;
  try {
    const url=new URL(origin);
    const secure=url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname));
    return secure&&url.origin===origin&&new URL(req.url).origin===origin;
  }catch{return false;}
}
export function requireSameOrigin(req:Request):void {
  const origin=new URL(req.url).origin;
  const source=req.headers.get('origin');
  if(req.method!=='POST'&&req.method!=='PATCH'&&req.method!=='DELETE')return;
  if(source!==origin)throw new ApiError(403,'Request origin verification failed.');
  if(req.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'Cross-site requests are not allowed.');
}
export async function readBody(req:Request):Promise<Record<string,unknown>> {
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))
    throw new ApiError(415,'JSON content type is required.');
  if(Number(req.headers.get('content-length')||'0')>16_384)
    throw new ApiError(413,'Request body exceeds limit.');
  const value=await req.text();
  if(value.length>16_384)throw new ApiError(413,'Request body exceeds limit.');
  try {
    const parsed:unknown=JSON.parse(value);
    if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();
    return parsed as Record<string,unknown>;
  }catch{throw new ApiError(400,'Invalid JSON request.');}
}
export function safeName(value:unknown,max=140):string {
  if(typeof value!=='string')throw new ApiError(400,'Display name is required.');
  const name=value.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>max||/[\u0000-\u001F\u007F]/.test(name))
    throw new ApiError(400,'Display name must be 2–'+max+' characters.');
  return name;
}
export function validId(value:unknown):value is string {
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export const sessionCookie='__Host-courseaccess';
export const flowCookie='__Host-ca-flow';
export function getCookie(req:Request,name:string):string|null {
  for(const entry of (req.headers.get('cookie')||'').split(';')){
    const i=entry.indexOf('=');
    if(i>0&&entry.slice(0,i).trim()===name)return entry.slice(i+1).trim();
  }
  return null;
}
export function cookie(name:string,value:string,seconds:number):string {
  return name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+Math.max(0,seconds);
}
export function newSecret():string {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function sha256(value:string):Promise<string>{
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  return Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
}
export function changes(result:{meta?:{changes?:number};changes?:number}):number {
  return result.meta?.changes??result.changes??0;
}
/** Hourly D1-backed abuse barrier: atomic UPSERT under concurrent Worker isolates.
 * CF-Connecting-IP is a Cloudflare-set header in production. Unidentified clients
 * share a conservative bucket (never trusting arbitrary user-supplied identity).
 */
export async function rateLimit(db:Database,req:Request,action:string,limit=50):Promise<void>{
  const source=req.headers.get('CF-Connecting-IP')||'unknown-client';
  const key=await sha256('courseaccess-rate-v1:'+action+':'+source);
  const now=Date.now(),bucket=Math.floor(now/3_600_000)*3_600_000;
  await db.prepare('INSERT INTO auth_rate_limits(bucket,window_start_ms,hits) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN window_start_ms=excluded.window_start_ms THEN hits+1 ELSE 1 END,window_start_ms=excluded.window_start_ms').bind(key,bucket).run();
  const record=await db.prepare('SELECT hits FROM auth_rate_limits WHERE bucket=?').bind(key).first<{hits:number}>();
  if(!record||record.hits>limit)throw new ApiError(429,'Too many requests. Try again later.');
}
export function dbKey(value:unknown):Uint8Array{
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(value instanceof Uint8Array)return value;
  if(Array.isArray(value)&&value.every(x=>Number.isInteger(x)&&x>=0&&x<=255))return new Uint8Array(value as number[]);
  throw new Error('Invalid stored credential key');
}
