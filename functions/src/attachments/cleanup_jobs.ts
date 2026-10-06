import {createHash} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import type {OwnerCommandContext} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';

export function attachmentCleanupId(uid:string,attachmentId:string):string {
 return `attachmentCleanup-${createHash('sha256').update(JSON.stringify([identifier(uid),identifier(attachmentId)])).digest('hex')}`;
}
export async function stageAttachmentCleanup(context:OwnerCommandContext,attachmentId:string,storageGeneration:string|null,now:Date):Promise<void> {
 const id=attachmentCleanupId(context.uid,attachmentId),previous=await context.readSystemJob(id);
 if(previous&&(previous.kind!=='attachmentCleanup'||previous.subjectId!==attachmentId))throw new HttpsError('failed-precondition','Your files need recovery.');
 context.systemJob(id,{kind:'attachmentCleanup',subjectId:attachmentId,storageGeneration,
  generation:previous?revision(previous.generation+1):1,status:'pending',nextRunAt:Timestamp.fromDate(now),
  cursor:null,attempts:0,leaseToken:null,leaseGeneration:null,leaseExpiresAt:null,lastError:null},previous!==null);
}
