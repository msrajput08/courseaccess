// Verification only. Never treat client checkout success as a paid entitlement.
const encoder=new TextEncoder();
const LIMIT=256*1024;
export interface VerifiedPaddleEvent {eventId:string;eventType:string;occurredAt:string;data:Record<string,unknown>}
async function readRaw(request:Request):Promise<Uint8Array<ArrayBuffer>>{
  const declared=Number(request.headers.get('content-length')||0);
  if(!Number.isSafeInteger(declared)||declared<0||declared>LIMIT||!request.body)throw Error('Invalid body');
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>LIMIT){await reader.cancel().catch(()=>undefined);throw Error('Body too large');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(new ArrayBuffer(size));let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}
export async function verifyPaddleWebhook(request:Request,secret:string,now=Date.now()):Promise<VerifiedPaddleEvent>{
  if(request.method!=='POST'||!secret||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw Error('Invalid request');
  const header=request.headers.get('Paddle-Signature')||'';
  if(header.length>2048)throw Error('Invalid signature');
  const entries=header.split(';').map(part=>part.trim().split('='));
  const times=entries.filter(([key])=>key==='ts');
  const signatures=entries.filter(([key])=>key==='h1').map(entry=>entry[1]);
  if(times.length!==1||!/^\d{1,12}$/.test(times[0][1]||'')||!signatures.length||signatures.length>8||signatures.some(h=>!h||!/^[a-f0-9]{64}$/i.test(h)))throw Error('Invalid signature');
  const timestamp=times[0][1];
  if(Math.abs(now-Number(timestamp)*1000)>5000)throw Error('Expired signature');
  const raw=await readRaw(request);
  const prefix=encoder.encode(timestamp+':');
  const signed=new Uint8Array(prefix.length+raw.length);
  signed.set(prefix);signed.set(raw,prefix.length);
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  let verified=false;
  for(const signature of signatures){
    const bytes=new Uint8Array(signature.match(/../g)!.map(hex=>parseInt(hex,16)));
    if(await crypto.subtle.verify('HMAC',key,bytes,signed))verified=true;
  }
  if(!verified)throw Error('Invalid signature');
  const event:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!event||typeof event!=='object'||Array.isArray(event))throw Error('Invalid event');
  const e=event as Record<string,unknown>;
  if(typeof e.event_id!=='string'||!/^evt_[a-z0-9]{26}$/.test(e.event_id)||typeof e.event_type!=='string'||!/^([a-z_]+)\.([a-z_]+)$/.test(e.event_type)||typeof e.occurred_at!=='string'||!Number.isFinite(Date.parse(e.occurred_at))||!e.data||typeof e.data!=='object'||Array.isArray(e.data))throw Error('Invalid event');
  return {eventId:e.event_id,eventType:e.event_type,occurredAt:e.occurred_at,data:e.data as Record<string,unknown>};
}
