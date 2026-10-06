import {createHash} from 'node:crypto';
import {FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {commandDocumentId} from '../shared/commands.js';
import {revision} from '../shared/validation.js';
import {readLeasedFile,assertAttachmentLease,clearedFileLease,type LeasedFileContext} from './attachment_jobs.js';
import {AttachmentWorkBudget} from './work_budget.js';
import {readFileCount} from './attachment_record.js';
import {sniffAttachment} from './policy.js';
import {attachmentCleanupId} from './cleanup_jobs.js';
import type {AttachmentStorageGateway,AttachmentObjectMetadata} from './storage_gateway.js';

export async function finalizeAttachment(id:string,token:string,db:Firestore,storage:AttachmentStorageGateway,now?:Date,budget=new AttachmentWorkBudget()):Promise<boolean> {
 const clock=now?()=>now:()=>new Date(),fence=()=>db.runTransaction(async transaction=>{budget.assertAvailable();const current=await readLeasedFile(transaction,db,id,token,clock);budget.assertAvailable();return current;});
 let context=await fence();if(!context)return false;
 const path=context.file.storagePath,generation=context.job.storageGeneration;
 const matches=(object:AttachmentObjectMetadata|null,c:LeasedFileContext):object is AttachmentObjectMetadata=>!!object&&object.generation===generation&&
  object.customMetadata.userId===c.root.id&&object.customMetadata.attachmentId===c.file.attachmentId;
 const original=await storage.metadata(path);context=await fence();if(!context)return false;
 if(!matches(original,context))return false;
 let reason:string|null=null,bytes:Uint8Array|undefined,checksum:string|undefined;
 if(context.file.expiresAt.toMillis()<=clock().getTime())reason='uploadExpired';
 else if(original.sizeBytes!==context.file.declaredSizeBytes)reason='sizeMismatch';
 else{
  bytes=await storage.download(path,generation);context=await fence();if(!context)return false;
  if(bytes.length!==context.file.declaredSizeBytes)reason='sizeMismatch';
  else if(sniffAttachment(bytes)!==context.file.declaredContentType||original.contentType!==context.file.declaredContentType)reason='unsupportedFormat';
  else{checksum=createHash('sha256').update(bytes).digest('hex');if(context.file.declaredSha256!==null&&context.file.declaredSha256!==checksum)reason='checksumMismatch';}
 }
 if(reason!==null)return publish(reason);
 await storage.stripTokens(path,generation,original.metageneration);context=await fence();if(!context)return false;
 const verified=await storage.metadata(path);context=await fence();if(!context)return false;
 if(!matches(verified,context)||verified.hasDownloadTokens||verified.sizeBytes!==original.sizeBytes||verified.contentType!==original.contentType)
  throw new HttpsError('failed-precondition','The file is awaiting private verification.');
 return publish(null);

 async function publish(rejection:string|null):Promise<boolean>{
  return db.runTransaction(async transaction=>{
   budget.assertAvailable();const current=await readLeasedFile(transaction,db,id,token,clock);if(!current)return false;
   const lock=rejection!==null?await readFileCount(transaction,current.root,current.file):null;
   const cleanupId=attachmentCleanupId(current.root.id,current.file.attachmentId),cleanupRef=db.collection('systemJobs').doc(cleanupId);
   const cleanupDoc=rejection!==null?await transaction.get(cleanupRef):null;
   assertAttachmentLease(current.job,token,clock());budget.assertAvailable();
   if(rejection!==null){
    if(!lock||lock.data.activeCount<1)throw new HttpsError('failed-precondition','Your files need recovery.');
    transaction.update(lock.ref,{activeCount:lock.data.activeCount-1,revision:revision(lock.data.revision+1),updatedAt:FieldValue.serverTimestamp()});
    const old=cleanupDoc?.data();if(old&&(old.userId!==current.root.id||old.kind!=='attachmentCleanup'||old.schemaVersion!==1))throw new HttpsError('failed-precondition','Your files need recovery.');
    transaction.set(cleanupRef,{userId:current.root.id,schemaVersion:1,kind:'attachmentCleanup',subjectId:current.file.attachmentId,
     storageGeneration:generation,generation:old?revision(old.generation+1):1,status:'pending',nextRunAt:Timestamp.fromDate(clock()),attempts:0,
     ...clearedFileLease,lastError:null,createdAt:old?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    transaction.update(current.ref,{state:'rejected',rejectionReason:rejection,revision:revision(current.file.revision+1),updatedAt:FieldValue.serverTimestamp()});
   }else{
    transaction.update(current.ref,{state:'ready',contentType:original!.contentType,sizeBytes:bytes!.length,sha256:checksum!,storageGeneration:generation,
     finalizedAt:Timestamp.fromDate(clock()),revision:revision(current.file.revision+1),updatedAt:FieldValue.serverTimestamp()});
    const activityId=commandDocumentId(JSON.stringify([current.root.id,current.file.attachmentId,generation]),'attachmentReady');
    transaction.create(current.root.collection('activities').doc(activityId),{userId:current.root.id,schemaVersion:1,type:'attachmentReady',
     attachmentId:current.file.attachmentId,obligationId:current.file.obligationId,targetType:current.file.targetType,targetId:current.file.targetId,title:current.parent.title,
     recordedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   }
   transaction.update(current.jobRef,{status:'done',...clearedFileLease,lastError:null,updatedAt:FieldValue.serverTimestamp()});return true;
  });
 }
}
