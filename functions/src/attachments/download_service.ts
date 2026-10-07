import {createHash} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {identifier} from '../shared/validation.js';
import {ownedFile,readFileTarget,fileRecovery} from './attachment_record.js';
import {attachmentMimeTypes,maxAttachmentBytes,sniffAttachment} from './policy.js';
import type {AttachmentStorageGateway,AttachmentObjectMetadata} from './storage_gateway.js';
import {AttachmentWorkBudget} from './work_budget.js';

/** Private reads never invoke Firebase's token-producing client media endpoint. */
export async function downloadAttachment(uid:string,input:unknown,db:Firestore,storage:AttachmentStorageGateway,
 budget=new AttachmentWorkBudget()):Promise<{attachmentId:string;storageGeneration:string;contentBase64:string}> {
 identifier(uid);
 const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']);identifier(envelope.commandId);
 if(identifier(envelope.expectedOwnerUid)!==uid)throw new HttpsError('permission-denied','Your sign-in changed.');
 const attachmentId=identifier(exactObject(envelope.payload,['attachmentId']).attachmentId),root=db.doc(`users/${uid}`),ref=root.collection('attachments').doc(attachmentId);
 const read=()=>db.runTransaction(async transaction=>{
  budget.assertAvailable();
  const [profileDoc,fileDoc]=await Promise.all([transaction.get(root),transaction.get(ref)]),profile=profileDoc.data();
  if(!profile||profile.userId!==uid||profile.schemaVersion!==1||profile.accountStatus!=='active')return fileRecovery();
  const file=ownedFile(uid,attachmentId,fileDoc.data());
  if(file.state!=='ready'||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>maxAttachmentBytes||
   file.sizeBytes!==file.declaredSizeBytes||!attachmentMimeTypes.includes(file.contentType)||file.contentType!==file.declaredContentType||
   typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||file.declaredSha256!==null&&file.declaredSha256!==file.sha256||
   typeof file.storageGeneration!=='string'||!/^[1-9][0-9]{0,19}$/.test(file.storageGeneration))return fileRecovery();
  await readFileTarget(transaction,root,file);budget.assertAvailable();return file;
 });
 const original=await read();
 const fence=async()=>{
  const file=await read();
  for(const key of ['revision','storageGeneration','sizeBytes','contentType','sha256','storagePath','targetType','targetId','obligationId'])
   if(file[key]!==original[key])return fileRecovery();
 };
 const matches=(object:AttachmentObjectMetadata|null,file:DocumentData):boolean=>!!object&&
  object.generation===file.storageGeneration&&object.sizeBytes===file.sizeBytes&&object.contentType===file.contentType&&
  object.customMetadata.userId===uid&&object.customMetadata.attachmentId===attachmentId&&!object.hasDownloadTokens;
 const object=await storage.metadata(original.storagePath);await fence();
 if(!matches(object,original))return fileRecovery();
 const bytes=await storage.download(original.storagePath,original.storageGeneration);await fence();
 if(bytes.length!==original.sizeBytes||sniffAttachment(bytes)!==original.contentType||createHash('sha256').update(bytes).digest('hex')!==original.sha256)return fileRecovery();
 const verified=await storage.metadata(original.storagePath);await fence();
 if(!matches(verified,original))return fileRecovery();
 budget.assertAvailable();
 return {attachmentId,storageGeneration:original.storageGeneration,contentBase64:Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64')};
}
