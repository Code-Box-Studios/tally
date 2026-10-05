import {createHash,randomUUID} from 'node:crypto';
import {FieldValue,Timestamp,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import type {OwnerCommandContext} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';
import {canClaimLease,leaseMatches} from './leases.js';

export function recurringJobId(uid:string,obligationId:string):string {
  identifier(uid);identifier(obligationId);
  return `recurrence-${createHash('sha256').update(JSON.stringify([uid,obligationId])).digest('hex')}`;
}
export function periodJobId(uid:string,instanceId:string,kind:'automaticDeduction'|'reminderPreparation'):string {
  return `${kind}-${createHash('sha256').update(JSON.stringify([identifier(uid),identifier(instanceId),kind])).digest('hex')}`;
}
export async function stageRecurringJob(context:OwnerCommandContext,obligationId:string,targetRevision:number,now:Date):Promise<number> {
  const id=recurringJobId(context.uid,obligationId),existing=await context.readSystemJob(id);
  if(existing && (existing.kind!=='recurringGeneration'||existing.subjectId!==obligationId))throw new HttpsError('failed-precondition','A schedule job needs recovery.');
  const generation=existing?revision(existing.generation)+1:1;
  context.systemJob(id,{kind:'recurringGeneration',subjectId:obligationId,targetRevision,generation,status:'pending',
    nextRunAt:Timestamp.fromDate(now),attempts:0,leaseToken:null,leaseGeneration:null,leaseExpiresAt:null,lastError:null},existing!==null);
  return generation;
}
export interface RecurringLease {uid:string;obligationId:string;token:string;generation:number}
export async function claimRecurringJob(jobId:string,db:Firestore,now=new Date()):Promise<RecurringLease|null> {
  const ref=db.collection('systemJobs').doc(identifier(jobId));
  return db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);if(!snapshot.exists)return null;
    const job=snapshot.data()!;
    if(job.kind!=='recurringGeneration'||job.schemaVersion!==1)return null;
    const uid=identifier(job.userId),obligationId=identifier(job.subjectId);
    if(jobId!==recurringJobId(uid,obligationId))throw new HttpsError('failed-precondition','Invalid schedule job.');
    if(!(job.nextRunAt instanceof Timestamp))throw new HttpsError('failed-precondition','Invalid schedule time.');
    if(!canClaimLease({status:job.status,nextRunAt:job.nextRunAt.toDate(),leaseExpiresAt:job.leaseExpiresAt instanceof Timestamp?job.leaseExpiresAt.toDate():null},now))return null;
    const root=db.doc(`users/${uid}`);
    const [profileDoc,parentDoc]=await Promise.all([transaction.get(root),transaction.get(root.collection('obligations').doc(obligationId))]);
    const profile=profileDoc.data(),parent=parentDoc.data();
    if(!profile||profile.userId!==uid||profile.schemaVersion!==1||profile.accountStatus!=='active'||!parent||parent.userId!==uid||parent.schemaVersion!==1||parent.lifecycle==='cancelled') {
      transaction.update(ref,{status:'cancelled',leaseToken:null,leaseExpiresAt:null,leaseGeneration:null,updatedAt:FieldValue.serverTimestamp()});return null;
    }
    if(!['recurringDue','subscription'].includes(parent.type))throw new HttpsError('failed-precondition','Invalid recurring obligation.');
    const token=randomUUID(),generation=revision(job.generation);
    transaction.update(ref,{status:'leased',leaseToken:token,leaseGeneration:generation,leaseExpiresAt:Timestamp.fromMillis(now.getTime()+6*60000),targetRevision:revision(parent.revision),updatedAt:FieldValue.serverTimestamp()});
    return {uid,obligationId,token,generation};
  });
}
export function assertRecurringLease(job:DocumentData,token:string,parentRevision:number,now:Date):void {
  if(!leaseMatches(job as Parameters<typeof leaseMatches>[0],token)||!(job.leaseExpiresAt instanceof Timestamp)||job.leaseExpiresAt.toMillis()<=now.getTime()||job.targetRevision!==parentRevision)
    throw new HttpsError('aborted','This schedule job changed. Retry with a current lease.');
}
export async function releaseRecurringJob(jobId:string,token:string,db:Firestore,now:Date):Promise<void> {
  const ref=db.collection('systemJobs').doc(identifier(jobId));
  await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);const job=snapshot.data();if(!job||!leaseMatches(job as Parameters<typeof leaseMatches>[0],token))return;
    const attempts=(Number.isSafeInteger(job.attempts)?job.attempts:0)+1;
    transaction.update(ref,{status:'pending',attempts,nextRunAt:Timestamp.fromMillis(now.getTime()+Math.min(3600000,1000*2**Math.min(attempts,12))),
      leaseToken:null,leaseExpiresAt:null,leaseGeneration:null,lastError:'processingDelayed',updatedAt:FieldValue.serverTimestamp()});
  });
}
