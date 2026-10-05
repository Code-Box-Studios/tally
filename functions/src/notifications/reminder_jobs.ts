import {createHash,randomUUID} from 'node:crypto';
import {FieldValue,Timestamp,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import type {OwnerCommandContext} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';
import {canClaimLease,leaseMatches} from '../jobs/leases.js';
import {periodJobId} from '../jobs/recurring_jobs.js';
import {reminderReconciliationId} from './reconciliation_job.js';
import {readReminderContext,readReminderOwner,reminderRecovery} from './context.js';

export const clearedReminderLease={leaseToken:null,leaseGeneration:null,leaseExpiresAt:null};
export const reminderJobKinds=['reminderReconciliation','reminderPreparation','reminderDelivery'] as const;
export function reminderDeliveryId(uid:string,reminderId:string):string {
  return `reminderDelivery-${createHash('sha256').update(JSON.stringify([identifier(uid),identifier(reminderId)])).digest('hex')}`;
}
export function validateReminderJob(id:string,job:DocumentData):void {
  const uid=identifier(job.userId),subject=identifier(job.subjectId);
  if(job.kind==='reminderReconciliation'&&subject!==uid)return reminderRecovery();
  const expected=job.kind==='reminderReconciliation'?reminderReconciliationId(uid):job.kind==='reminderPreparation'?
    periodJobId(uid,subject,'reminderPreparation'):job.kind==='reminderDelivery'?reminderDeliveryId(uid,subject):null;
  if(job.schemaVersion!==1||id!==expected)return reminderRecovery();
  revision(job.generation);
}
export function assertReminderLease(job:DocumentData,token:string,now:Date):boolean {
  if(!leaseMatches(job as Parameters<typeof leaseMatches>[0],token))return false;
  if(!(job.leaseExpiresAt instanceof Timestamp)||job.leaseExpiresAt.toMillis()<=now.getTime())
    throw new HttpsError('aborted','This reminder lease expired.');
  return true;
}
export function stageReminderPeriod(context:OwnerCommandContext,obligationId:string,instanceId:string,now:Date):void {
  context.systemJob(periodJobId(context.uid,instanceId,'reminderPreparation'),{
    kind:'reminderPreparation',subjectId:instanceId,obligationId:identifier(obligationId),status:'pending',generation:1,
    nextRunAt:Timestamp.fromDate(now),targetRevision:1,targetParentRevision:1,attempts:0,...clearedReminderLease,lastError:null,
  },false);
}
export interface ReminderLease {uid:string;token:string;generation:number;kind:typeof reminderJobKinds[number]}
export async function claimReminderJob(jobId:string,db:Firestore,now=new Date()):Promise<ReminderLease|null> {
  const ref=db.collection('systemJobs').doc(identifier(jobId));
  return db.runTransaction(async transaction=>{
    const job=(await transaction.get(ref)).data();if(!job||!reminderJobKinds.includes(job.kind))return null;
    validateReminderJob(jobId,job);
    if(!(job.nextRunAt instanceof Timestamp)||!canClaimLease({status:job.status,nextRunAt:job.nextRunAt.toDate(),
      leaseExpiresAt:job.leaseExpiresAt instanceof Timestamp?job.leaseExpiresAt.toDate():null},now))return null;
    const root=db.doc(`users/${job.userId}`),profile=(await transaction.get(root)).data();
    if(!profile||profile.userId!==job.userId||profile.schemaVersion!==1||profile.accountStatus!=='active') {
      transaction.update(ref,{status:'cancelled',nextRunAt:null,...clearedReminderLease,updatedAt:FieldValue.serverTimestamp()});return null;
    }
    let generation=revision(job.generation),targets:DocumentData={};
    if(job.kind==='reminderReconciliation') {
      const context=await readReminderOwner(transaction,root),changed=job.targetOwnerKey!==context.ownerKey;
      if(changed)generation=revision(generation+1);
      targets={targetOwnerKey:context.ownerKey,...(changed?{cursor:null}:{})};
    } else if(job.kind==='reminderPreparation') {
      const context=await readReminderContext(transaction,root,job.subjectId);
      if(context.parent.obligationId!==job.obligationId)return reminderRecovery();
      targets={targetContextKey:context.contextKey,targetRevision:context.instance.revision,targetParentRevision:context.parent.revision,
        targetPreferenceRevision:context.preferenceRevision,targetProfileRevision:context.profile.revision,
        ...(job.targetContextKey!==context.contextKey?{cancellationCursor:null}:{})};
    }
    if(!Number.isSafeInteger(job.attempts)||job.attempts<0||job.attempts>=Number.MAX_SAFE_INTEGER)return reminderRecovery();
    const token=randomUUID();
    transaction.update(ref,{...targets,generation,status:'leased',leaseToken:token,leaseGeneration:generation,
      leaseExpiresAt:Timestamp.fromMillis(now.getTime()+360000),attempts:job.attempts+1,updatedAt:FieldValue.serverTimestamp()});
    return {uid:job.userId,token,generation,kind:job.kind};
  });
}
