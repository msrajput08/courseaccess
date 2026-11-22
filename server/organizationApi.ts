import {ApiError,type Database,readBody,responseJSON,safeName,validId} from './accountSecurity';
import type {Identity} from './accountApi';

type Role='owner'|'admin'|'editor'|'viewer';
interface Membership {role:Role}
interface Org {id:string;display_name:string;role:Role}
const validRole=(r:unknown):r is Exclude<Role,'owner'>=>['admin','editor','viewer'].includes(String(r));

async function requireMembership(db:Database,orgId:string,accountId:string):Promise<Role>{
  const membership=await db.prepare(
    'SELECT role FROM organization_members WHERE organization_id=? AND account_id=?'
  ).bind(orgId,accountId).first<Membership>();
  // Deliberately 404: do not reveal private organization IDs to outsiders.
  if(!membership)throw new ApiError(404,'Organization not found.');
  return membership.role;
}
async function orgList(db:Database,identity:Identity):Promise<Response>{
  const data=await db.prepare(
    'SELECT o.id,o.display_name,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.account_id=? ORDER BY o.display_name'
  ).bind(identity.account_id).all<Org>();
  return responseJSON({organizations:data.results});
}
async function orgCreate(req:Request,db:Database,identity:Identity):Promise<Response>{
  const body=await readBody(req),name=safeName(body.name,160);
  const owned=await db.prepare(
    'SELECT count(*) AS total FROM organizations WHERE created_by=?'
  ).bind(identity.account_id).first<{total:number}>();
  if((owned?.total??0)>=3)throw new ApiError(429,'Current limit is three organizations per account.');
  const id=crypto.randomUUID(),now=Date.now();
  await db.batch([
    db.prepare('INSERT INTO organizations(id,display_name,created_by,created_at_ms) VALUES(?,?,?,?)').bind(id,name,identity.account_id,now),
    db.prepare('INSERT INTO organization_members(organization_id,account_id,role,joined_at_ms) VALUES(?,?,?,?)').bind(id,identity.account_id,'owner',now),
  ]);
  return responseJSON({organization:{id,name,role:'owner'}},201);
}
async function members(db:Database,orgId:string,identity:Identity):Promise<Response>{
  await requireMembership(db,orgId,identity.account_id);
  const list=await db.prepare(
    'SELECT a.id,a.display_name,m.role,m.joined_at_ms FROM organization_members m JOIN accounts a ON a.id=m.account_id WHERE m.organization_id=? ORDER BY CASE m.role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 WHEN \'editor\' THEN 2 ELSE 3 END,a.display_name'
  ).bind(orgId).all<{id:string;display_name:string;role:Role;joined_at_ms:number}>();
  return responseJSON({members:list.results});
}
async function addMember(req:Request,db:Database,orgId:string,identity:Identity):Promise<Response>{
  const myRole=await requireMembership(db,orgId,identity.account_id);
  if(!['owner','admin'].includes(myRole))throw new ApiError(403,'Only owners and admins can add members.');
  const body=await readBody(req),target=body.accountId,role=body.role;
  if(!validId(target)||!validRole(role)||(myRole==='admin'&&role==='admin'))
    throw new ApiError(400,'Provide a registered account ID and an allowed role.');
  const exists=await db.prepare('SELECT id FROM accounts WHERE id=? AND deleted_at_ms IS NULL').bind(target).first<{id:string}>();
  if(!exists)throw new ApiError(404,'Account not found. Ask the member to register first.');
  const count=await db.prepare('SELECT count(*) AS total FROM organization_members WHERE organization_id=?').bind(orgId).first<{total:number}>();
  if((count?.total??0)>=25)throw new ApiError(429,'The organization has reached its 25-member limit.');
  try{
    await db.prepare('INSERT INTO organization_members(organization_id,account_id,role,joined_at_ms) VALUES(?,?,?,?)')
      .bind(orgId,target,role,Date.now()).run();
  }catch{throw new ApiError(409,'This account is already a member.');}
  return responseJSON({added:true},201);
}
async function updateRole(req:Request,db:Database,orgId:string,target:string,identity:Identity):Promise<Response>{
  if(await requireMembership(db,orgId,identity.account_id)!=='owner')
    throw new ApiError(403,'Only the organization owner can change roles.');
  const body=await readBody(req),role=body.role;
  if(!validRole(role)||target===identity.account_id)throw new ApiError(400,'Invalid member or role.');
  const prior=await db.prepare('SELECT role FROM organization_members WHERE organization_id=? AND account_id=?')
    .bind(orgId,target).first<Membership>();
  if(!prior)throw new ApiError(404,'Member not found.');
  if(prior.role==='owner')throw new ApiError(403,'Use ownership transfer for the owner.');
  await db.prepare('UPDATE organization_members SET role=? WHERE organization_id=? AND account_id=?')
    .bind(role,orgId,target).run();
  return responseJSON({updated:true});
}
async function removeMember(db:Database,orgId:string,target:string,identity:Identity):Promise<Response>{
  const myRole=await requireMembership(db,orgId,identity.account_id);
  const member=await db.prepare('SELECT role FROM organization_members WHERE organization_id=? AND account_id=?')
    .bind(orgId,target).first<Membership>();
  if(!member)throw new ApiError(404,'Member not found.');
  if(member.role==='owner')throw new ApiError(403,'The owner must transfer or delete the organization.');
  const permitted=target===identity.account_id||myRole==='owner'||(
    myRole==='admin'&&['editor','viewer'].includes(member.role));
  if(!permitted)throw new ApiError(403,'Cannot remove this member.');
  await db.prepare('DELETE FROM organization_members WHERE organization_id=? AND account_id=?').bind(orgId,target).run();
  return responseJSON({removed:true});
}
async function transfer(req:Request,db:Database,orgId:string,identity:Identity):Promise<Response>{
  if(await requireMembership(db,orgId,identity.account_id)!=='owner')
    throw new ApiError(403,'Only the owner can transfer ownership.');
  const body=await readBody(req),target=body.accountId;
  if(!validId(target)||target===identity.account_id)throw new ApiError(400,'Select another existing member.');
  const record=await db.prepare('SELECT role FROM organization_members WHERE organization_id=? AND account_id=?')
    .bind(orgId,target).first<Membership>();
  if(!record)throw new ApiError(404,'Target member not found.');
  // Batch is transactional; a partial ownership transfer cannot commit.
  await db.batch([
    db.prepare('UPDATE organization_members SET role=\'admin\' WHERE organization_id=? AND account_id=? AND role=\'owner\'').bind(orgId,identity.account_id),
    db.prepare('UPDATE organization_members SET role=\'owner\' WHERE organization_id=? AND account_id=?').bind(orgId,target),
    db.prepare('UPDATE organizations SET created_by=? WHERE id=?').bind(target,orgId),
  ]);
  return responseJSON({transferred:true});
}
async function deleteOrganization(req:Request,db:Database,orgId:string,identity:Identity):Promise<Response>{
  if(await requireMembership(db,orgId,identity.account_id)!=='owner')
    throw new ApiError(403,'Only the owner can delete an organization.');
  const body=await readBody(req);
  const org=await db.prepare('SELECT display_name FROM organizations WHERE id=?').bind(orgId).first<{display_name:string}>();
  if(body.confirmName!==org?.display_name)throw new ApiError(400,'Enter the exact organization name to confirm deletion.');
  await db.prepare('DELETE FROM organizations WHERE id=?').bind(orgId).run();
  return responseJSON({deleted:true});
}
export async function handleOrganizationApi(req:Request,db:Database,identity:Identity):Promise<Response>{
  const u=new URL(req.url),parts=u.pathname.split('/').filter(Boolean);
  if(parts.length===2){
    if(req.method==='GET')return orgList(db,identity);
    if(req.method==='POST')return orgCreate(req,db,identity);
    throw new ApiError(405,'Method not allowed.');
  }
  const orgId=parts[2];
  if(!validId(orgId))throw new ApiError(404,'Organization not found.');
  if(parts.length===4&&parts[3]==='members'){
    if(req.method==='GET')return members(db,orgId,identity);
    if(req.method==='POST')return addMember(req,db,orgId,identity);
  }
  if(parts.length===5&&parts[3]==='members'&&validId(parts[4])){
    if(req.method==='PATCH')return updateRole(req,db,orgId,parts[4],identity);
    if(req.method==='DELETE')return removeMember(db,orgId,parts[4],identity);
  }
  if(parts.length===4&&parts[3]==='transfer'&&req.method==='POST')
    return transfer(req,db,orgId,identity);
  if(parts.length===4&&parts[3]==='delete'&&req.method==='POST')
    return deleteOrganization(req,db,orgId,identity);
  throw new ApiError(404,'Endpoint not found.');
}
