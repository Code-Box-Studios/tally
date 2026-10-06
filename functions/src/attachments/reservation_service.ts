import {createHash} from 'node:crypto';
import {Timestamp,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeMetadataCommand,type OwnerCommandContext} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';
import {maxAttachmentsPerTarget,validateAttachmentReservation,type AttachmentReservationPayload} from './policy.js';
import {stageAttachmentCleanup} from './cleanup_jobs.js';

export const activeAttachmentStates=['awaitingUpload','processing','ready'] as const;
export function attachmentSetId(targetType:string,targetId:string):string {
 return createHash('sha256').update(JSON.stringify([targetType,targetId])).digest('hex');
}
const recovery=():never=>{throw new HttpsError('failed-precondition','Your files need recovery.');};
async function ownedParent(context:OwnerCommandContext,id:string):Promise<DocumentData> {
 const parent=await context.read('obligations',identifier(id));
 if(parent.obligationId!==id)return recovery();return parent;
}
async function ownedInstance(context:OwnerCommandContext,id:string,parent:DocumentData):Promise<void> {
 const instance=await context.read('obligationInstances',identifier(id));
 if(instance.instanceId!==id||instance.obligationId!==parent.obligationId||instance.currency!==parent.currency)return recovery();
}
async function parentForTarget(context:OwnerCommandContext,payload:AttachmentReservationPayload):Promise<DocumentData> {
 if(payload.targetType==='obligation')return ownedParent(context,payload.targetId);
 const collection=payload.targetType==='instance'?'obligationInstances':'payments';
 const target=await context.read(collection,payload.targetId),parent=await ownedParent(context,identifier(target.obligationId));
 if(target.currency!==parent.currency)return recovery();
 if(payload.targetType==='instance') {
  if(target.instanceId!==payload.targetId)return recovery();
 } else {
  if(target.paymentId!==payload.targetId||!['payment','reversal'].includes(target.entryType)||
   !Array.isArray(target.allocations)||target.allocations.length<1||target.allocations.length>24)return recovery();
  const ids=new Set<string>();
  for(const allocation of target.allocations) {
   if(!allocation||typeof allocation!=='object')return recovery();
   const id=identifier(allocation.instanceId);if(ids.has(id))return recovery();ids.add(id);
   await ownedInstance(context,id,parent);
  }
  if(target.obligationInstanceId!==null&&(!ids.has(identifier(target.obligationInstanceId))||ids.size!==1))return recovery();
 }
 return parent;
}
export async function readAttachmentCount(context:OwnerCommandContext,targetType:string,targetId:string):Promise<{id:string;previous:DocumentData|null;count:number}> {
 const id=attachmentSetId(targetType,targetId),previous=await context.maybeRead('attachmentSets',id);
 const count=await context.countWhere('attachments',[
  {field:'targetType',op:'==',value:targetType},{field:'targetId',op:'==',value:targetId},
  {field:'state',op:'in',value:[...activeAttachmentStates]},
 ]);
 if(count>maxAttachmentsPerTarget||previous&&(previous.targetType!==targetType||previous.targetId!==targetId||
  previous.activeCount!==count||!Number.isSafeInteger(previous.revision)||previous.revision<1||previous.revision>=Number.MAX_SAFE_INTEGER)||!previous&&count!==0)return recovery();
 return {id,previous,count};
}
function stageCount(context:OwnerCommandContext,lock:Awaited<ReturnType<typeof readAttachmentCount>>,targetType:string,targetId:string,delta:1|-1):void {
 const count=lock.count+delta;if(count<0||count>maxAttachmentsPerTarget)return recovery();
 const data={targetType,targetId,activeCount:count,revision:lock.previous?revision(lock.previous.revision+1):1};
 if(lock.previous)context.update('attachmentSets',lock.id,data);else context.create('attachmentSets',lock.id,data);
}
export async function reserveAttachment(uid:string,input:unknown,db:Firestore,now=new Date()):Promise<{attachmentId:string;revision:number;storagePath:string;expiresAt:string}> {
 return executeMetadataCommand(uid,input,'reserveAttachment',validateAttachmentReservation,async(context,payload)=>{
  const parent=await parentForTarget(context,payload),lock=await readAttachmentCount(context,payload.targetType,payload.targetId);
  if(lock.count>=maxAttachmentsPerTarget)throw new HttpsError('resource-exhausted','This item already has ten files. Remove a file before adding another.');
  const attachmentId=context.id('attachment'),storagePath=`users/${context.uid}/attachments/${attachmentId}/content`;
  const expiresAt=new Date(now.getTime()+86_400_000);
  context.create('attachments',attachmentId,{attachmentId,targetType:payload.targetType,targetId:payload.targetId,
   obligationId:parent.obligationId,storagePath,filename:payload.filename,declaredContentType:payload.contentType,
   declaredSizeBytes:payload.sizeBytes,declaredSha256:payload.sha256,state:'awaitingUpload',revision:1,
   expiresAt:Timestamp.fromDate(expiresAt),contentType:null,sizeBytes:null,sha256:null,storageGeneration:null,
   finalizedAt:null,rejectionReason:null,removedAt:null});
  stageCount(context,lock,payload.targetType,payload.targetId,1);
  context.activity('attachmentAdded',{obligationId:parent.obligationId,attachmentId,targetType:payload.targetType,targetId:payload.targetId,title:parent.title});
  return {attachmentId,revision:1,storagePath,expiresAt:expiresAt.toISOString()};
 },db);
}
export async function removeAttachment(uid:string,input:unknown,db:Firestore,now=new Date()):Promise<{attachmentId:string;revision:number;state:'deleted'}> {
 return executeMetadataCommand(uid,input,'removeAttachment',input=>{
  const raw=exactObject(input,['attachmentId','expectedRevision']);return {attachmentId:identifier(raw.attachmentId),expectedRevision:revision(raw.expectedRevision)};
 },async(context,payload)=>{
  const attachment=await context.read('attachments',payload.attachmentId);
  if(attachment.attachmentId!==payload.attachmentId||attachment.storagePath!==`users/${context.uid}/attachments/${payload.attachmentId}/content`||
   !['obligation','instance','payment'].includes(attachment.targetType)||!['awaitingUpload','processing','ready','rejected','deleted'].includes(attachment.state))return recovery();
  revision(attachment.revision);identifier(attachment.targetId);identifier(attachment.obligationId);
  if(attachment.revision!==payload.expectedRevision)throw new HttpsError('aborted','This file changed. Refresh before removing it.');
  if(attachment.state==='deleted')throw new HttpsError('failed-precondition','This attachment was already removed.');
  const lock=await readAttachmentCount(context,attachment.targetType,attachment.targetId);
  const parent=await ownedParent(context,attachment.obligationId);
  const generation=attachment.storageGeneration;
  if(generation!==null&&(typeof generation!=='string'||!/^[1-9][0-9]{0,19}$/.test(generation)))return recovery();
  await stageAttachmentCleanup(context,payload.attachmentId,generation,now);
  if(activeAttachmentStates.includes(attachment.state))stageCount(context,lock,attachment.targetType,attachment.targetId,-1);
  const next=revision(attachment.revision+1);
  context.update('attachments',payload.attachmentId,{state:'deleted',revision:next,removedAt:Timestamp.fromDate(now)});
  context.activity('attachmentRemoved',{obligationId:parent.obligationId,attachmentId:payload.attachmentId,targetType:attachment.targetType,targetId:attachment.targetId,title:parent.title});
  return {attachmentId:payload.attachmentId,revision:next,state:'deleted' as const};
 },db);
}
