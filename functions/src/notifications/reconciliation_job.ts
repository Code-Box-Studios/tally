import {createHash} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import type {OwnerCommandContext} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';

export function reminderReconciliationId(uid:string):string {
  return `reminderOwner-${createHash('sha256').update(identifier(uid)).digest('hex')}`;
}
export async function stageReminderReconciliation(context:OwnerCommandContext,now=new Date()):Promise<void> {
  const id=reminderReconciliationId(context.uid),job=await context.readSystemJob(id);
  if(job&&(job.kind!=='reminderReconciliation'||job.subjectId!==context.uid))
    throw new HttpsError('failed-precondition','Your reminders need recovery.');
  context.systemJob(id,{kind:'reminderReconciliation',subjectId:context.uid,
    generation:job?revision(job.generation+1):1,status:'pending',nextRunAt:Timestamp.fromDate(now),
    cursor:null,attempts:0,leaseToken:null,leaseGeneration:null,leaseExpiresAt:null,lastError:null},job!==null);
}
