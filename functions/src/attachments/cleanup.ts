import {FieldValue,FieldPath,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {identifier,revision} from '../shared/validation.js';
import {AttachmentWorkBudget} from './work_budget.js';
import {attachmentCleanupId} from './cleanup_jobs.js';
import {assertAttachmentLease,validateAttachmentJob,clearedFileLease} from './attachment_jobs.js';
import {ownedFile,readFileCount,fileRecovery} from './attachment_record.js';
import type {AttachmentStorageGateway} from './storage_gateway.js';

export async function cleanupAttachment(id:string,token:string,db:Firestore,storage:AttachmentStorageGateway,now?:Date,budget=new AttachmentWorkBudget()):Promise<boolean> {
 const clock=now?()=>now:()=>new Date(),jobRef=db.collection('systemJobs').doc(identifier(id));
 const fence=()=>db.runTransaction(async transaction=>{
  budget.assertAvailable();
  const job=(await transaction.get(jobRef)).data();if(!job)return null;validateAttachmentJob(id,job);
  if(job.kind!=='attachmentCleanup'||!assertAttachmentLease(job,token,clock()))return null;
  const root=db.doc(`users/${job.userId}`),[fileDoc,profileDoc]=await Promise.all([transaction.get(root.collection('attachments').doc(job.subjectId)),transaction.get(root)]),profile=profileDoc.data();
  if(profile&&(profile.userId!==job.userId||profile.schemaVersion!==1))return fileRecovery();
  const deleting=!profile||['deleting','deleted'].includes(profile.accountStatus);
  if(fileDoc.exists){const file=ownedFile(job.userId,job.subjectId,fileDoc.data());if(!['rejected','deleted'].includes(file.state)&&!deleting)return null;}
  else if(job.storageGeneration===null)return null;
  assertAttachmentLease(job,token,clock());budget.assertAvailable();return job;
 });
 let job=await fence();if(!job)return false;
 const path=`users/${job.userId}/attachments/${job.subjectId}/content`,object=await storage.metadata(path);
 job=await fence();if(!job)return false;
 if(object&&object.customMetadata.userId===job.userId&&object.customMetadata.attachmentId===job.subjectId&&
  (job.storageGeneration===null||object.generation===job.storageGeneration)){
  // Persist the chosen generation before network deletion. A lost delete response
  // cannot make a retry choose a replacement generation.
  if(job.storageGeneration===null)await db.runTransaction(async transaction=>{
   const current=(await transaction.get(jobRef)).data();if(!current)return;validateAttachmentJob(id,current);
   if(!assertAttachmentLease(current,token,clock()))return;budget.assertAvailable();
   transaction.update(jobRef,{storageGeneration:object.generation,updatedAt:FieldValue.serverTimestamp()});
  });
  job=await fence();if(!job||job.storageGeneration!==object.generation)return false;
  await storage.delete(path,object.generation);job=await fence();if(!job)return false;
 }
 return db.runTransaction(async transaction=>{
  const current=(await transaction.get(jobRef)).data();if(!current)return false;validateAttachmentJob(id,current);
  if(!assertAttachmentLease(current,token,clock()))return false;budget.assertAvailable();
  transaction.update(jobRef,{status:'done',...clearedFileLease,lastError:null,updatedAt:FieldValue.serverTimestamp()});return true;
 });
}
export async function cleanupExpiredAttachments(db:Firestore,_storage:AttachmentStorageGateway,now=new Date(),limit=100):Promise<{examined:number;expired:number;hasMore:boolean}> {
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(now.getTime()))throw new Error('Invalid file cleanup boundary.');
 const cursorRef=db.doc('systemMaintenance/attachmentExpiry'),cursor=(await cursorRef.get()).data();
 let query=db.collectionGroup('attachments').where('state','in',['awaitingUpload','processing']).where('expiresAt','<=',Timestamp.fromDate(now))
  .orderBy('expiresAt').orderBy(FieldPath.documentId()).limit(limit);
 if(cursor?.expiresAt instanceof Timestamp&&typeof cursor.path==='string'&&/^users\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}$/.test(cursor.path))query=query.startAfter(cursor.expiresAt,db.doc(cursor.path));
 const page=await query.get();let expired=0;
 for(const candidate of page.docs){
  const root=candidate.ref.parent.parent;if(!root||root.parent.id!=='users')continue;
  const changed=await db.runTransaction(async transaction=>{
   const snapshot=await transaction.get(candidate.ref);if(!snapshot.exists)return false;
   const file=ownedFile(root.id,candidate.id,snapshot.data());
   if(!['awaitingUpload','processing'].includes(file.state)||file.expiresAt.toMillis()>now.getTime())return false;
   const profile=(await transaction.get(root)).data();if(!profile||profile.userId!==root.id||profile.schemaVersion!==1)return false;
   const lock=await readFileCount(transaction,root,file);if(lock.data.activeCount<1)return fileRecovery();
   const cleanupRef=db.collection('systemJobs').doc(attachmentCleanupId(root.id,candidate.id)),old=(await transaction.get(cleanupRef)).data();
   if(old)validateAttachmentJob(cleanupRef.id,old);
   transaction.update(lock.ref,{activeCount:lock.data.activeCount-1,revision:revision(lock.data.revision+1),updatedAt:FieldValue.serverTimestamp()});
   transaction.update(candidate.ref,{state:'rejected',rejectionReason:'uploadExpired',revision:revision(file.revision+1),updatedAt:FieldValue.serverTimestamp()});
   transaction.set(cleanupRef,{userId:root.id,schemaVersion:1,kind:'attachmentCleanup',subjectId:candidate.id,storageGeneration:file.storageGeneration,
    generation:old?revision(old.generation+1):1,status:'pending',nextRunAt:Timestamp.fromDate(now),attempts:0,...clearedFileLease,
    lastError:null,createdAt:old?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return true;
  });if(changed)expired++;
 }
 const last=page.docs.at(-1),hasMore=page.size===limit;
 await cursorRef.set({schemaVersion:1,expiresAt:hasMore?last!.data().expiresAt:null,path:hasMore?last!.ref.path:null,updatedAt:FieldValue.serverTimestamp()});
 return {examined:page.size,expired,hasMore};
}
