#!/usr/bin/env node
/**
 * Resolve the exact owner-provisioned production D1 database, validate its
 * remote schema, and emit a temporary Wrangler config with the real binding.
 * This script never prints the UUID or tokens and never changes database data.
 *
 * Activation is explicitly restricted to the approved HTTPS workers.dev origin.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';

const name='courseaccess-primary';
const origin='https://courseaccess.minty-12-shar.workers.dev';
const tmp='.wrangler-courseaccess-active.jsonc';
const listEnv={
  ...process.env,
  CLOUDFLARE_API_TOKEN:process.env.CLOUDFLARE_D1_READ_TOKEN,
};
if(!listEnv.CLOUDFLARE_API_TOKEN||!listEnv.CLOUDFLARE_ACCOUNT_ID)
  throw Error('The dedicated D1 Read token and Cloudflare account must be configured.');
if(process.env.COURSEACCESS_ACTIVATE_PRODUCTION!=='authorized-workers-dev')
  throw Error('Explicit production account activation gate is missing.');
const cmd=(args)=>execFileSync('npx',['wrangler','d1',...args],{
  cwd:process.cwd(),env:listEnv,encoding:'utf8',timeout:120_000,
  stdio:['ignore','pipe','pipe'],
}).trim();
let all;
try{all=JSON.parse(cmd(['list','--json']));}
catch{throw Error('Unable to list databases with the dedicated D1 Read token.');}
if(!Array.isArray(all))throw Error('Unexpected Cloudflare D1 list response.');
const entries=all.filter(db=>db.name===name);
if(entries.length!==1)throw Error('Refusing deployment: expected exactly one dedicated production D1 database.');
const database_id=entries[0].uuid||entries[0].id;
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(database_id||''))
  throw Error('Refusing deployment: invalid Cloudflare D1 database UUID.');
const base=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(base.name!=='courseaccess'||base.main!=='server/index.ts')
  throw Error('Refusing deployment: unexpected existing Worker configuration.');
base.d1_databases=[{
  binding:'DB',database_name:name,database_id,migrations_dir:'migrations',
}];
base.vars={
  ...(base.vars||{}),
  COURSEACCESS_AUTH_ORIGIN:origin,
  COURSEACCESS_ACCOUNTS_ENABLED:'true',
};
// Paddle client-side tokens are public browser credentials, not API keys.
// Keep the deployed token in the runtime config; never print it.
const paddleToken=process.env.PADDLE_LIVE_CLIENT_TOKEN||'';
if(!/^live_[A-Za-z0-9_]+$/.test(paddleToken))throw Error('Live Paddle client-side token missing or invalid.');
base.vars.PADDLE_LIVE_CLIENT_TOKEN=paddleToken;
writeFileSync(tmp,JSON.stringify(base,null,2),{encoding:'utf8',mode:0o600});

let migrationResult;
try{
  migrationResult=JSON.parse(cmd([
    'execute','DB','--remote','--config',tmp,'--json',
    '--command',"SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger')",
  ]));
}catch{throw Error('Remote production database schema could not be inspected.');}
if(!Array.isArray(migrationResult)||migrationResult.some(r=>r.success===false))
  throw Error('Remote production D1 schema returned an unsuccessful query.');
const names=new Set(migrationResult.flatMap(x=>x.results||[]).map(x=>x.name));
const required=[
  'accounts','passkey_credentials','sessions','auth_challenges',
  'organizations','organization_members','auth_rate_limits',
  'subscriptions','payment_event_receipts','d1_migrations',
  'idx_organization_one_owner','paddle_customers','paddle_subscription_catalog','paddle_event_inbox','paddle_checkout_intents','paddle_subscription_holds','paddle_intent_owners','paid_review_history','guard_paddle_intent_owner','guard_paid_account_delete','guard_paid_org_delete','guard_paid_org_transfer',
];
const missing=required.filter(x=>!names.has(x));
if(missing.length)throw Error('Refusing account activation: remote schema incomplete: '+missing.join(', '));
base.vars.COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED='true';
base.vars.COURSEACCESS_PADDLE_RECONCILE_ENABLED='true';
base.vars.COURSEACCESS_LIVE_CHECKOUT_ENABLED='false';
base.vars.COURSEACCESS_PAID_FEATURES_ENABLED='false';

writeFileSync(tmp,JSON.stringify(base,null,2),{encoding:'utf8',mode:0o600});
console.log('Verified production D1 binding, schema and approved origin.');
console.log('Generated temporary release config; account activation requires successful deployment.');
