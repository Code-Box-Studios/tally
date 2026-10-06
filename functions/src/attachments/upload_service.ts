import {createHash,randomUUID} from 'node:crypto';
import {FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {identifier,revision,invalid} from '../shared/validation.js';
import {ownedFile,declaredFile,readFileTarget,fileRecovery} from './attachment_record.js';
import {enqueueAttachmentFinalization} from './attachment_jobs.js';
import {maxAttachmentBytes} from './policy.js';
import type {AttachmentStorageGateway,AttachmentObjectMetadata} from './storage_gateway.js';

export async function uploadAttachment(uid:string,input:unknown,db:Firestore,storage:AttachmentStorageGateway,now?:Date):Promise<{attachmentId:string;storageGeneration:string}> {
 const clock=now?()=>now:()=>new Date();identifier(uid);
 const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']),commandId=identifier(envelope.commandId);
 if(identifier(envelope.expectedOwnerUid)!==uid)throw new HttpsError('permission-denied','Your sign-in changed.');
 const raw=exactObject(envelope.payload,['attachmentId','expectedRevision','contentBase64']);
 const attachmentId=identifier(raw.attachmentId),expectedRevision=revision(raw.expectedRevision),encoded=raw.contentBase64;
 if(typeof encoded!=='string'||encoded.length<4||encoded.length>4*Math.ceil(maxAttachmentBytes/3)||
  encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return invalid('Choose a supported file up to10 MiB.');
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.length<1||bytes.length>maxAttachmentBytes||bytes.toString('base64')!==encoded)return invalid('Invalid file content.');
 const checksum=createHash('sha256').update(bytes).digest('hex');
 const payloadHash=createHash('sha256').update(JSON.stringify([attachmentId,expectedRevision,checksum,bytes.length])).digest('hex');
 const root=db.doc(`users/${uid}`),fileRef=root.collection('attachments').doc(attachmentId),receiptRef=root.collection('commandReceipts').doc(commandId),attemptRef=root.collection('attachmentUploads').doc(attachmentId);
 const claimed=await db.runTransaction(async transaction=>{
  const [profileDoc,fileDoc,receiptDoc,attemptDoc]=await Promise.all([transaction.get(root),transaction.get(fileRef),transaction.get(receiptRef),transaction.get(attemptRef)]);
  const profile=profileDoc.data();if(!profile||profile.userId!==uid||profile.schemaVersion!==1||profile.accountStatus!=='active')throw new HttpsError('failed-precondition','Your account is unavailable.');
  const receipt=receiptDoc.data();if(receipt){
   if(receipt.userId!==uid||receipt.schemaVersion!==1||receipt.commandType!=='uploadAttachment'||receipt.payloadHash!==payloadHash)throw new HttpsError('already-exists','This action identifier was already used.');
   return {result:receipt.result as {attachmentId:string;storageGeneration:string},file:null,token:null,busy:false};
  }
  const file=ownedFile(uid,attachmentId,fileDoc.data()),declared=declaredFile(file),attempt=attemptDoc.data();
  if(attempt&&(attempt.userId!==uid||attempt.schemaVersion!==1||attempt.attachmentId!==attachmentId||attempt.payloadHash!==payloadHash))throw new HttpsError('already-exists','This action identifier was already used.');
  if(!['awaitingUpload','processing','ready','rejected'].includes(file.state)||file.state==='awaitingUpload'&&file.expiresAt.toMillis()<=clock().getTime())throw new HttpsError('failed-precondition','This upload is no longer available.');
  if(!attempt&&(file.state!=='awaitingUpload'||file.revision!==expectedRevision))throw new HttpsError('aborted','The attachment changed. Refresh it before uploading.');
  if(declared.sizeBytes!==bytes.length)return invalid('The file size changed. Select it again.');
  await readFileTarget(transaction,root,file);
  if(attempt?.status==='leased'&&attempt.leaseExpiresAt instanceof Timestamp&&attempt.leaseExpiresAt.toMillis()>clock().getTime()){
   if(attempt.commandId!==commandId)throw new HttpsError('aborted','An upload is already in progress. Retry the original action.');
   return {result:null,file,token:attempt.leaseToken as string,busy:true};
  }
  const token=randomUUID();transaction.set(attemptRef,{userId:uid,schemaVersion:1,attachmentId,commandId,payloadHash,status:'leased',leaseToken:token,
   leaseExpiresAt:Timestamp.fromMillis(clock().getTime()+360000),generation:attempt?revision(attempt.generation+1):1,
   createdAt:attempt?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  return {result:null,file,token,busy:false};
 });
 if(claimed.result)return claimed.result;
 const file=claimed.file!,path=file.storagePath;
 const matches=(object:AttachmentObjectMetadata|null):object is AttachmentObjectMetadata=>!!object&&object.customMetadata.userId===uid&&
  object.customMetadata.attachmentId===attachmentId&&object.customMetadata.uploadSha256===checksum&&
  object.sizeBytes===bytes.length&&object.contentType===file.declaredContentType&&!object.hasDownloadTokens;
 let object=await storage.metadata(path);
 if(!object){
  if(claimed.busy)throw new HttpsError('aborted','Your upload is still being checked. Retry this same upload shortly.');
  await storage.create(path,bytes,declaredFile(file).contentType,{userId:uid,attachmentId,uploadSha256:checksum});
  object=await storage.metadata(path);
 }
 if(!matches(object))throw new HttpsError('failed-precondition','The stored file needs verification.');
 const result={attachmentId,storageGeneration:object.generation};
 await enqueueAttachmentFinalization({bucket:storage.bucket,name:path,generation:object.generation},db);
 return db.runTransaction(async transaction=>{
  const [profileDoc,fileDoc,attemptDoc,receiptDoc]=await Promise.all([transaction.get(root),transaction.get(fileRef),transaction.get(attemptRef),transaction.get(receiptRef)]);
  const profile=profileDoc.data(),current=ownedFile(uid,attachmentId,fileDoc.data()),attempt=attemptDoc.data(),receipt=receiptDoc.data();
  if(!profile||profile.userId!==uid||profile.schemaVersion!==1||profile.accountStatus!=='active'||current.state==='deleted')throw new HttpsError('aborted','The upload owner or attachment changed.');
  if(receipt){if(receipt.userId!==uid||receipt.commandType!=='uploadAttachment'||receipt.payloadHash!==payloadHash)return fileRecovery();return receipt.result as typeof result;}
  if(!attempt||attempt.userId!==uid||attempt.payloadHash!==payloadHash||attempt.commandId!==commandId||attempt.leaseToken!==claimed.token||!(attempt.leaseExpiresAt instanceof Timestamp)||attempt.leaseExpiresAt.toMillis()<=clock().getTime())throw new HttpsError('aborted','This upload attempt expired.');
  transaction.create(receiptRef,{userId:uid,schemaVersion:1,commandType:'uploadAttachment',payloadHash,result,recordedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  transaction.update(attemptRef,{status:'done',leaseToken:null,leaseExpiresAt:null,updatedAt:FieldValue.serverTimestamp()});return result;
 });
}
