import {Timestamp,type DocumentData,type DocumentReference,type Transaction} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {identifier,revision} from '../shared/validation.js';
import {validateAttachmentReservation,attachmentTypes,type AttachmentReservationPayload} from './policy.js';
import {attachmentSetId,activeAttachmentStates} from './reservation_service.js';

export const fileRecovery=():never=>{throw new HttpsError('failed-precondition','Your files need recovery.');};
export function ownedFile(uid:string,id:string,data:DocumentData|undefined):DocumentData {
 if(!data||data.userId!==uid||data.schemaVersion!==1||data.attachmentId!==id||
  data.storagePath!==`users/${uid}/attachments/${id}/content`||
  !['awaitingUpload','processing','ready','rejected','deleted'].includes(data.state)||!(data.expiresAt instanceof Timestamp))return fileRecovery();
 revision(data.revision);identifier(data.obligationId);
 validateAttachmentReservation({targetType:data.targetType,targetId:data.targetId,filename:data.filename,contentType:data.declaredContentType,sizeBytes:data.declaredSizeBytes,sha256:data.declaredSha256});
 return data;
}
export async function readFileTarget(transaction:Transaction,root:DocumentReference,file:DocumentData):Promise<DocumentData> {
 const parent=(await transaction.get(root.collection('obligations').doc(identifier(file.obligationId)))).data();
 if(!parent||parent.userId!==root.id||parent.schemaVersion!==1||parent.obligationId!==file.obligationId)return fileRecovery();
 if(file.targetType==='obligation'){if(file.targetId!==parent.obligationId)return fileRecovery();return parent;}
 if(!attachmentTypes.includes(file.targetType))return fileRecovery();
 const collection=file.targetType==='instance'?'obligationInstances':'payments';
 const target=(await transaction.get(root.collection(collection).doc(identifier(file.targetId)))).data();
 if(!target||target.userId!==root.id||target.schemaVersion!==1||target.obligationId!==parent.obligationId||target.currency!==parent.currency)return fileRecovery();
 if(file.targetType==='instance'&&target.instanceId!==file.targetId||file.targetType==='payment'&&target.paymentId!==file.targetId)return fileRecovery();
 return parent;
}
export async function readFileCount(transaction:Transaction,root:DocumentReference,file:DocumentData):Promise<{ref:DocumentReference;data:DocumentData}> {
 const ref=root.collection('attachmentSets').doc(attachmentSetId(file.targetType,file.targetId));
 const [lock,result]=await Promise.all([transaction.get(ref),transaction.get(root.collection('attachments')
  .where('userId','==',root.id).where('targetType','==',file.targetType).where('targetId','==',file.targetId).where('state','in',[...activeAttachmentStates]).count())]);
 const data=lock.data(),count=result.data().count;
 if(!data||data.userId!==root.id||data.schemaVersion!==1||data.targetType!==file.targetType||data.targetId!==file.targetId||
  data.activeCount!==count||count<0||count>10)return fileRecovery();revision(data.revision);
 return {ref,data};
}
export function declaredFile(file:DocumentData):AttachmentReservationPayload {
 return validateAttachmentReservation({targetType:file.targetType,targetId:file.targetId,filename:file.filename,contentType:file.declaredContentType,sizeBytes:file.declaredSizeBytes,sha256:file.declaredSha256});
}
