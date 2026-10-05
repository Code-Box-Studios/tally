import {Timestamp,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions';
import {HttpsError} from 'firebase-functions/v2/https';
import {identifier} from '../shared/validation.js';
import {canClaimLease} from './leases.js';
import {claimProjectionJob,finishProjectionJob,releaseFailedJob,retireLegacyProjectionMarkers} from './projection_jobs.js';
import {projectOwner} from '../dashboard/projector.js';
import {claimRecurringJob,claimAutomaticJob,releaseRecurringJob} from './recurring_jobs.js';
import {generateRecurringBatch} from '../recurring/generation.js';
import {processAutomatic} from '../recurring/automatic_service.js';
import {claimReminderJob,reminderJobKinds} from '../notifications/reminder_jobs.js';
import {reconcileOwnerReminders} from '../notifications/reconciliation.js';
import {prepareReminders} from '../notifications/preparation.js';
import {deliverReminder} from '../notifications/delivery.js';

const kinds=['ownerProjection','recurringGeneration','automaticDeduction',...reminderJobKinds];
export function promptWorkerEnabled(emulator:boolean,projectId:string|undefined,mode:string|undefined):boolean {
  return !(emulator&&/^demo-[a-z0-9-]+$/.test(projectId??'')&&mode==='manual');
}
export function canStartJob(kind:string,remainingMs:number):boolean {
  return remainingMs>=(kind==='ownerProjection'?180000:60000);
}
export function shouldRunPrompt(job:DocumentData|undefined,now=new Date()):boolean {
  if(!job||job.schemaVersion!==1||!kinds.includes(job.kind)||!['pending','leased'].includes(job.status)||!(job.nextRunAt instanceof Timestamp))return false;
  return canClaimLease({status:job.status,nextRunAt:job.nextRunAt.toDate(),leaseExpiresAt:job.leaseExpiresAt instanceof Timestamp?job.leaseExpiresAt.toDate():null},now);
}
export async function runReadyJob(jobId:string,db:Firestore,injectedNow?:Date):Promise<boolean> {
  identifier(jobId);const clock=injectedNow?()=>injectedNow:()=>new Date();
  const job=(await db.collection('systemJobs').doc(jobId).get()).data();if(!shouldRunPrompt(job,clock()))return false;
  let token:string|null=null;
  try {
    if(job!.kind==='ownerProjection') {
      const lease=await claimProjectionJob(jobId,db,clock());if(!lease)return false;token=lease.token;
      const projection=await projectOwner(lease.uid,db,injectedNow);
      if(projection.status==='stale')throw new HttpsError('aborted','Financial totals changed during projection.');
      const finished=await finishProjectionJob(jobId,db,lease.token,clock(),projection.nextRefreshAt);
      if(finished)await retireLegacyProjectionMarkers(lease.uid,db);return finished;
    }
    if(job!.kind==='recurringGeneration') {
      const lease=await claimRecurringJob(jobId,db,clock());if(!lease)return false;token=lease.token;
      await generateRecurringBatch(jobId,lease.token,db,injectedNow);return true;
    }
    if(reminderJobKinds.includes(job!.kind)) {
      const lease=await claimReminderJob(jobId,db,clock());if(!lease)return false;token=lease.token;
      if(lease.kind==='reminderReconciliation')await reconcileOwnerReminders(jobId,lease.token,db,injectedNow);
      else if(lease.kind==='reminderPreparation')await prepareReminders(jobId,lease.token,db,injectedNow);
      else await deliverReminder(jobId,lease.token,db,undefined,injectedNow);
      return true;
    }
    const lease=await claimAutomaticJob(jobId,db,clock());if(!lease)return false;token=lease.token;
    await processAutomatic(jobId,lease.token,db,injectedNow);return true;
  }catch(error) {
    if(token) {
      if(job!.kind==='ownerProjection')await releaseFailedJob(jobId,db,token,clock(),error);
      else await releaseRecurringJob(jobId,token,db,clock());
    }
    logger.warn('Financial job delayed',{jobId,kind:job!.kind});return false;
  }
}
export async function dispatchReadyJobs(db:Firestore,injectedNow?:Date,limit=25,budgetMs=450000):Promise<{processed:number;examined:number}> {
  if(!Number.isInteger(limit)||limit<1||limit>25||!Number.isInteger(budgetMs)||budgetMs<0||budgetMs>450000)throw new Error('Invalid financial dispatch limits.');
  const start=performance.now(),now=injectedNow??new Date();
  if(budgetMs<60000)return {processed:0,examined:0};
  const queue=db.collection('systemJobs').where('kind','in',kinds);
  const [pending,expired]=await Promise.all([
    queue.where('status','==','pending').where('nextRunAt','<=',Timestamp.fromDate(now)).orderBy('nextRunAt').limit(limit).get(),
    queue.where('status','==','leased').where('leaseExpiresAt','<=',Timestamp.fromDate(now)).orderBy('leaseExpiresAt').limit(limit).get(),
  ]);
  const time=(data:DocumentData):number=>data.status==='pending'?data.nextRunAt.toMillis():data.leaseExpiresAt.toMillis();
  const candidates=[...new Map([...pending.docs,...expired.docs].map(doc=>[doc.id,doc])).values()].sort((a,b)=>time(a.data())-time(b.data())||a.id.localeCompare(b.id)).slice(0,limit);
  let processed=0,examined=0;
  for(const candidate of candidates) {
    const remaining=budgetMs-(performance.now()-start);if(remaining<60000)break;
    if(!canStartJob(candidate.data().kind,remaining))continue;
    examined++;if(await runReadyJob(candidate.id,db,injectedNow))processed++;
  }
  return {processed,examined};
}
