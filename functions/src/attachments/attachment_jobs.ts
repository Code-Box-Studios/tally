import {createHash,randomUUID} from 'node:crypto';
import {FieldValue,Timestamp,type DocumentData,type DocumentReference,type Firestore,type Transaction} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {HttpsError} from 'firebase-functions/v2/https';
import {identifier,revision} from '../shared/validation.js';
import {canClaimLease,leaseMatches} from '../jobs/leases.js';
import {attachmentCleanupId} from './cleanup_jobs.js';
import {ownedFile,readFileTarget,fileRecovery} from './attachment_record.js';

export const attachmentJobKinds=['attachmentFinalization','attachmentCleanup'] as const;
export const clearedFileLease={leaseToken:null,leaseGeneration:null,leaseExpiresAt:null};
export interface AttachmentEvent {uid:string;attachmentId:string;storagePath:string;bucket:string;generation:string}
const generation=(value:unknown):string=>{
 if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value))return fileRecovery();return value;
};
export function attachmentFinalizationId(uid:string,attachmentId:string,value:string):string {
 return `attachmentFinalize-${createHash('sha256').update(JSON.stringify([identifier(uid),identifier(attachmentId),generation(value)])).digest('hex')}`;
}
export function parseAttachmentObject(event:unknown,bucket:string):AttachmentEvent|null {
 if(typeof event!=='object'||event===null)return null;
 const raw=event as Record<string,unknown>;
 if(raw.bucket!==bucket||typeof raw.name!=='string'||typeof raw.generation!=='string'||!/^[1-9][0-9]{0,19}$/.test(raw.generation))return null;
 const match=/^users\/([A-Za-z0-9_-]{1,128})\/attachments\/([A-Za-z0-9_-]{1,128})\/content$/.exec(raw.name);
 return match?{uid:match[1]!,attachmentId:match[2]!,storagePath:raw.name,bucket,generation:raw.generation}:null;
}
export function validateAttachmentJob(id:string,job:DocumentData):void {
 const uid=identifier(job.userId),subject=identifier(job.subjectId);
 const expected=job.kind==='attachmentFinalization'?attachmentFinalizationId(uid,subject,generation(job.storageGeneration)):
  job.kind==='attachmentCleanup'?attachmentCleanupId(uid,subject):null;
 if(id!==expected||job.schemaVersion!==1)return fileRecovery();revision(job.generation);
 if(job.storageGeneration!==null)generation(job.storageGeneration);
}
export function assertAttachmentLease(job:DocumentData,token:string,now:Date):boolean {
 if(!leaseMatches(job as Parameters<typeof leaseMatches>[0],token))return false;
 if(!(job.leaseExpiresAt instanceof Timestamp)||job.leaseExpiresAt.toMillis()<=now.getTime())throw new HttpsError('aborted','This file lease expired.');return true;
}
export async function enqueueAttachmentFinalization(event:unknown,db:Firestore):Promise<string|null> {
 const subject=parseAttachmentObject(event,getStorage().bucket().name);if(!subject)return null;
 const id=attachmentFinalizationId(subject.uid,subject.attachmentId,subject.generation),ref=db.collection('systemJobs').doc(id),root=db.doc(`users/${subject.uid}`);
 return db.runTransaction(async transaction=>{
  const [profileDoc,fileDoc,existing]=await Promise.all([transaction.get(root),transaction.get(root.collection('attachments').doc(subject.attachmentId)),transaction.get(ref)]);
  const profile=profileDoc.data(),raw=fileDoc.data();
  if(profile&&(profile.userId!==subject.uid||profile.schemaVersion!==1))return fileRecovery();
  const file=raw?ownedFile(subject.uid,subject.attachmentId,raw):null;
  const active=profile?.accountStatus==='active';
  if(!active||!file||['rejected','deleted'].includes(file.state)){
   if(profile&&!active&&!['deleting','deleted'].includes(profile.accountStatus))return null;
   const cleanupId=attachmentCleanupId(subject.uid,subject.attachmentId),cleanupRef=db.collection('systemJobs').doc(cleanupId),previous=(await transaction.get(cleanupRef)).data();
   if(previous){validateAttachmentJob(cleanupId,previous);if(previous.storageGeneration===subject.generation)return cleanupId;}
   if(existing.exists){validateAttachmentJob(id,existing.data()!);transaction.update(ref,{status:'cancelled',...clearedFileLease,updatedAt:FieldValue.serverTimestamp()});}
   transaction.set(cleanupRef,{kind:'attachmentCleanup',subjectId:subject.attachmentId,storageGeneration:subject.generation,userId:subject.uid,schemaVersion:1,
    generation:previous?revision(previous.generation+1):1,status:'pending',nextRunAt:Timestamp.now(),attempts:0,...clearedFileLease,lastError:null,
    createdAt:previous?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return cleanupId;
  }
  if(existing.exists){validateAttachmentJob(id,existing.data()!);return id;}
  if(!['awaitingUpload','processing'].includes(file.state))return null;
  await readFileTarget(transaction,root,file);
  transaction.create(ref,{kind:'attachmentFinalization',subjectId:subject.attachmentId,storageGeneration:subject.generation,
   userId:subject.uid,schemaVersion:1,generation:1,status:'pending',nextRunAt:Timestamp.now(),attempts:0,
   ...clearedFileLease,lastError:null,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return id;
 });
}
export interface AttachmentLease {uid:string;token:string;kind:typeof attachmentJobKinds[number];generation:number}
export async function claimAttachmentJob(id:string,db:Firestore,now=new Date()):Promise<AttachmentLease|null> {
 const ref=db.collection('systemJobs').doc(identifier(id));
 return db.runTransaction(async transaction=>{
  const job=(await transaction.get(ref)).data();if(!job||!attachmentJobKinds.includes(job.kind))return null;validateAttachmentJob(id,job);
  if(!(job.nextRunAt instanceof Timestamp)||!canClaimLease({status:job.status,nextRunAt:job.nextRunAt.toDate(),leaseExpiresAt:job.leaseExpiresAt instanceof Timestamp?job.leaseExpiresAt.toDate():null},now))return null;
  const root=db.doc(`users/${job.userId}`),fileRef=root.collection('attachments').doc(job.subjectId);
  const [profileDoc,fileDoc]=await Promise.all([transaction.get(root),transaction.get(fileRef)]),profile=profileDoc.data();
  const file=fileDoc.exists?ownedFile(job.userId,job.subjectId,fileDoc.data()):null;
  if(profile&&(profile.userId!==job.userId||profile.schemaVersion!==1))return fileRecovery();
  const finalizing=job.kind==='attachmentFinalization',deleting=!profile||['deleting','deleted'].includes(profile.accountStatus);
  if(finalizing&&(!profile||profile.userId!==job.userId||profile.schemaVersion!==1||profile.accountStatus!=='active'||!file||!['awaitingUpload','processing'].includes(file.state))||
   !finalizing&&file&&!['rejected','deleted'].includes(file.state)&&!deleting){
   transaction.update(ref,{status:'cancelled',...clearedFileLease,updatedAt:FieldValue.serverTimestamp()});return null;
  }
  if(finalizing)await readFileTarget(transaction,root,file!);
  if(!Number.isSafeInteger(job.attempts)||job.attempts<0||job.attempts>=Number.MAX_SAFE_INTEGER)return fileRecovery();
  const token=randomUUID();
  if(finalizing&&(file!.state!=='processing'||file!.processingGeneration!==job.storageGeneration))transaction.update(fileRef,{
   state:'processing',processingGeneration:job.storageGeneration,processingJobId:id,revision:revision(file!.revision+1),updatedAt:FieldValue.serverTimestamp(),
  });
  transaction.update(ref,{status:'leased',leaseToken:token,leaseGeneration:job.generation,leaseExpiresAt:Timestamp.fromMillis(now.getTime()+360000),attempts:job.attempts+1,updatedAt:FieldValue.serverTimestamp()});
  return {uid:job.userId,token,kind:job.kind,generation:job.generation};
 });
}
export interface LeasedFileContext {root:DocumentReference;ref:DocumentReference;jobRef:DocumentReference;job:DocumentData;file:DocumentData;parent:DocumentData}
export async function readLeasedFile(transaction:Transaction,db:Firestore,id:string,token:string,clock:()=>Date):Promise<LeasedFileContext|null> {
 const jobRef=db.collection('systemJobs').doc(identifier(id)),job=(await transaction.get(jobRef)).data();if(!job)return null;
 validateAttachmentJob(id,job);if(job.kind!=='attachmentFinalization'||!assertAttachmentLease(job,token,clock()))return null;
 const root=db.doc(`users/${job.userId}`),ref=root.collection('attachments').doc(job.subjectId);
 const [profileDoc,fileDoc]=await Promise.all([transaction.get(root),transaction.get(ref)]),profile=profileDoc.data();
 if(!profile||profile.userId!==job.userId||profile.schemaVersion!==1||profile.accountStatus!=='active'||!fileDoc.exists)return null;
 const file=ownedFile(job.userId,job.subjectId,fileDoc.data());
 if(file.state!=='processing'||file.processingGeneration!==job.storageGeneration||file.processingJobId!==id)return null;
 const parent=await readFileTarget(transaction,root,file);assertAttachmentLease(job,token,clock());return {root,ref,jobRef,job,file,parent};
}
export async function releaseAttachmentJob(id:string,token:string,db:Firestore,now=new Date()):Promise<void> {
 const ref=db.collection('systemJobs').doc(identifier(id));
 await db.runTransaction(async transaction=>{
  const job=(await transaction.get(ref)).data();if(!job)return;validateAttachmentJob(id,job);
  if(!leaseMatches(job as Parameters<typeof leaseMatches>[0],token))return;
  transaction.update(ref,{status:'pending',nextRunAt:Timestamp.fromMillis(now.getTime()+Math.min(3600000,1000*2**Math.min(job.attempts,12))),
   ...clearedFileLease,lastError:'processingDelayed',updatedAt:FieldValue.serverTimestamp()});
 });
}
