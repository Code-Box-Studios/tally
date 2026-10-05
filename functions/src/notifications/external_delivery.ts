import {createHash,randomUUID} from 'node:crypto';
import {FieldPath,FieldValue,Timestamp,type DocumentData,type DocumentReference,type Firestore,type Transaction} from 'firebase-admin/firestore';
import {identifier,revision} from '../shared/validation.js';
import {owned,readReminderContext,type ReminderContext} from './context.js';
import {assertReminderLease,clearedReminderLease,validateReminderJob} from './reminder_jobs.js';
import {bindingMatches,readNotificationBinding,readNotificationDevice} from './device_validation.js';
import type {NotificationMessage,NotificationTransport} from './delivery.js';

const pageLimit=10;
interface DeliveryContext {job:DocumentData;entry:DocumentData;context:ReminderContext;root:DocumentReference}
async function current(transaction:Transaction,ref:DocumentReference,jobId:string,token:string,now:Date):Promise<DeliveryContext|null> {
 const job=(await transaction.get(ref)).data();if(!job)return null;validateReminderJob(jobId,job);
 if(job.kind!=='reminderDelivery'||!assertReminderLease(job,token,now))return null;
 const root=ref.firestore.doc(`users/${job.userId}`),profile=(await transaction.get(root)).data();
 if(!profile||profile.userId!==job.userId||profile.accountStatus!=='active')return null;
 const entry=owned(job.userId,(await transaction.get(root.collection('reminders').doc(identifier(job.subjectId)))).data());
 if(entry.reminderId!==job.subjectId||entry.instanceId!==job.instanceId||entry.obligationId!==job.obligationId||!entry.visible)return null;
 const context=await readReminderContext(transaction,root,identifier(entry.instanceId));
 assertReminderLease(job,token,now);return {job,entry,context,root};
}
function eligible(value:DeliveryContext,now:Date):boolean {
 const {job,entry,context}=value;
 return entry.contextKey===context.contextKey&&job.targetContextKey===context.contextKey&&entry.status!=='cancelled'&&
  !context.subject.closed&&context.preferences.enabled&&context.preferences.pushEnabled&&context.subject.reminderPolicy?.enabled!==false&&
  entry.externalExpiresAt instanceof Timestamp&&entry.externalExpiresAt.toMillis()>now.getTime();
}
function liveDevice(uid:string,id:string,data:DocumentData|undefined,binding:DocumentData|undefined):boolean {
 if(!data)return false;readNotificationDevice(uid,id,data);
 if(binding)readNotificationBinding(data.tokenHash,binding);
 return data.active&&data.channel==='push'&&['granted','provisional'].includes(data.permission)&&data.token!==null&&binding?.active===true&&
  bindingMatches(binding,uid,id,data.bindingGeneration,data.tokenGeneration);
}
function receiptId(uid:string,reminderId:string,id:string,device:DocumentData):string {
 return `delivery-${createHash('sha256').update(JSON.stringify([uid,reminderId,id,device.tokenGeneration,device.bindingGeneration])).digest('hex')}`;
}
interface Authorized {message:NotificationMessage;receiptId:string;sendToken:string;device:DocumentData;installationId:string}
type Attempt = Authorized|'skip'|'busy'|'stale';
async function authorize(ref:DocumentReference,jobId:string,token:string,id:string,db:Firestore,clock:()=>Date):Promise<Attempt> {
 return db.runTransaction(async transaction=>{
  const value=await current(transaction,ref,jobId,token,clock());if(!value||!eligible(value,clock()))return 'stale';
  const device=(await transaction.get(value.root.collection('notificationDevices').doc(id))).data();
  const binding=device?.tokenHash?(await transaction.get(db.collection('notificationTokenBindings').doc(device.tokenHash))).data():undefined;
  if(!liveDevice(value.context.uid,id,device,binding))return 'skip';
  const rid=receiptId(value.context.uid,value.entry.reminderId,id,device!),receiptRef=value.root.collection('notificationDeliveries').doc(rid);
  const receipt=(await transaction.get(receiptRef)).data();
  if(receipt) {
   owned(value.context.uid,receipt);
   if(receipt.reminderId!==value.entry.reminderId||receipt.installationId!==id||receipt.tokenGeneration!==device!.tokenGeneration||receipt.bindingGeneration!==device!.bindingGeneration)throw Error('Invalid notification delivery relation.');
   if(['accepted','invalid','cancelled'].includes(receipt.status))return 'skip';
   if(receipt.status==='sending'&&receipt.leaseToken===token&&receipt.leaseGeneration===value.job.leaseGeneration)return 'busy';
  }
  assertReminderLease(value.job,token,clock());const sendToken=randomUUID();
  transaction.set(receiptRef,{userId:value.context.uid,schemaVersion:1,reminderId:value.entry.reminderId,installationId:id,
   tokenGeneration:device!.tokenGeneration,bindingGeneration:device!.bindingGeneration,status:'sending',sendToken,leaseToken:token,
   leaseGeneration:value.job.leaseGeneration,attempts:receipt?revision(receipt.attempts+1):1,
   createdAt:receipt?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  return {receiptId:rid,sendToken,device:device!,installationId:id,message:{token:device!.token,title:'Tally reminder',body:'Open Tally to see what’s due.',
   data:{reminderId:value.entry.reminderId,obligationId:value.entry.obligationId,instanceId:value.entry.instanceId},expiresAt:value.entry.externalExpiresAt.toDate()}};
 });
}
async function recordResult(ref:DocumentReference,jobId:string,token:string,attempt:Authorized,outcome:'delivered'|'invalid'|'retry',db:Firestore,clock:()=>Date):Promise<'done'|'retry'|'stale'> {
 return db.runTransaction(async transaction=>{
  const value=await current(transaction,ref,jobId,token,clock());if(!value)return 'stale';
  const receiptRef=value.root.collection('notificationDeliveries').doc(attempt.receiptId),receipt=(await transaction.get(receiptRef)).data();
  if(!receipt||receipt.sendToken!==attempt.sendToken||receipt.leaseToken!==token||receipt.leaseGeneration!==value.job.leaseGeneration)return 'stale';
  owned(value.context.uid,receipt);
  const deviceRef=value.root.collection('notificationDevices').doc(attempt.installationId),device=(await transaction.get(deviceRef)).data();
  const bindingRef=db.collection('notificationTokenBindings').doc(attempt.device.tokenHash),binding=(await transaction.get(bindingRef)).data();
  if(binding)readNotificationBinding(attempt.device.tokenHash,binding);
  const unchanged=device?.tokenHash===attempt.device.tokenHash&&liveDevice(value.context.uid,attempt.installationId,device,binding)&&
   device!.tokenGeneration===attempt.device.tokenGeneration&&device!.bindingGeneration===attempt.device.bindingGeneration;
  assertReminderLease(value.job,token,clock());
  if(!eligible(value,clock())) {
   transaction.update(receiptRef,{status:'cancelled',sendToken:null,updatedAt:FieldValue.serverTimestamp()});return 'stale';
  }
  if(!unchanged) {
   transaction.update(receiptRef,{status:'superseded',sendToken:null,updatedAt:FieldValue.serverTimestamp()});return 'retry';
  }
  transaction.update(receiptRef,{status:outcome==='delivered'?'accepted':outcome,sendToken:null,updatedAt:FieldValue.serverTimestamp()});
  if(outcome==='invalid') {
   transaction.update(deviceRef,{active:false,channel:'none',revision:revision(device!.revision+1),updatedAt:FieldValue.serverTimestamp()});
   transaction.update(bindingRef,{active:false,generation:revision(binding!.generation+1),updatedAt:FieldValue.serverTimestamp()});
  }
  return outcome==='retry'?'retry':'done';
 });
}
async function sendBounded(transport:NotificationTransport,message:NotificationMessage):Promise<'delivered'|'invalid'|'retry'> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {return await Promise.race([transport.send(message),new Promise<'retry'>(resolve=>{timer=setTimeout(()=>resolve('retry'),5000);})]);}
 catch {return 'retry';}finally {if(timer)clearTimeout(timer);}
}
export async function deliverExternal(jobId:string,token:string,db:Firestore,transport:NotificationTransport,clock:()=>Date):Promise<void> {
 const ref=db.collection('systemJobs').doc(identifier(jobId));
 const page=await db.runTransaction(async transaction=>{
  const value=await current(transaction,ref,jobId,token,clock());if(!value)return null;
  if(!eligible(value,clock()))return {ids:[] as string[],last:null,hasMore:false};
  let query=value.root.collection('notificationDevices').where('active','==',true).where('channel','==','push').orderBy(FieldPath.documentId()).limit(pageLimit);
  if(value.job.externalCursor)query=query.startAfter(identifier(value.job.externalCursor));
  const devices=await transaction.get(query);assertReminderLease(value.job,token,clock());
  return {ids:devices.docs.map(d=>d.id),last:devices.docs.at(-1)?.id??null,hasMore:devices.size===pageLimit};
 });
 if(!page)return;
 let retry=false;
 for(const id of page.ids) {
  const attempt=await authorize(ref,jobId,token,id,db,clock);
  if(attempt==='busy')return;
  if(attempt==='stale')break;
  if(attempt==='skip')continue;
  const outcome=await sendBounded(transport,attempt.message);
  const result=await recordResult(ref,jobId,token,attempt,outcome,db,clock);
  if(result==='stale')break;if(result==='retry')retry=true;
 }
 await db.runTransaction(async transaction=>{
  const value=await current(transaction,ref,jobId,token,clock());if(!value)return;
  const expired=!(value.entry.externalExpiresAt instanceof Timestamp)||value.entry.externalExpiresAt.toMillis()<=clock().getTime();
  const valid=eligible(value,clock()),more=valid&&(retry||page.hasMore),attempts=retry?revision((value.job.externalAttempts??0)+1):0;
  const delay=retry?Math.min(900000,30000*2**Math.min(attempts-1,5)):0;
  assertReminderLease(value.job,token,clock());
  transaction.update(ref,{status:more?'pending':valid||expired?'complete':'cancelled',nextRunAt:more?Timestamp.fromMillis(clock().getTime()+delay):null,
   externalState:expired?'expired':!valid?'disabled':more?'pending':'accepted',externalCursor:retry?value.job.externalCursor??null:page.last,
   externalAttempts:attempts,generation:revision(value.job.generation+1),...clearedReminderLease,updatedAt:FieldValue.serverTimestamp()});
 });
}
