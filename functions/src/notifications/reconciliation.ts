import {FieldPath,FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {identifier,revision} from '../shared/validation.js';
import {periodJobId} from '../jobs/recurring_jobs.js';
import {reminderReconciliationId} from './reconciliation_job.js';
import {owned,readReminderOwner,reminderRecovery} from './context.js';
import {assertReminderLease,clearedReminderLease,validateReminderJob} from './reminder_jobs.js';

export async function enqueueOwnerReminders(uid:string,db:Firestore,now=new Date()):Promise<boolean> {
  const root=db.doc(`users/${identifier(uid)}`),ref=db.collection('systemJobs').doc(reminderReconciliationId(uid));
  return db.runTransaction(async transaction=>{
    const [profileDoc,jobDoc]=await Promise.all([transaction.get(root),transaction.get(ref)]),profile=profileDoc.data(),job=jobDoc.data();
    if(job)validateReminderJob(ref.id,job);
    if(!profile||profile.userId!==uid||profile.schemaVersion!==1||profile.accountStatus!=='active') {
      if(job)transaction.update(ref,{status:'cancelled',nextRunAt:null,...clearedReminderLease,updatedAt:FieldValue.serverTimestamp()});return false;
    }
    const context=await readReminderOwner(transaction,root);
    if(job?.targetOwnerKey===context.ownerKey&&['pending','leased','complete'].includes(job.status))return true;
    transaction.set(ref,{kind:'reminderReconciliation',subjectId:uid,userId:uid,schemaVersion:1,generation:job?revision(job.generation+1):1,
      targetOwnerKey:context.ownerKey,cursor:null,status:'pending',nextRunAt:Timestamp.fromDate(now),attempts:0,...clearedReminderLease,
      lastError:null,createdAt:job?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return true;
  });
}
export async function reconcileOwnerReminders(jobId:string,token:string,db:Firestore,injectedNow?:Date):Promise<{examined:number;hasMore:boolean}> {
  const ref=db.collection('systemJobs').doc(identifier(jobId)),clock=()=>injectedNow??new Date();
  return db.runTransaction(async transaction=>{
    const job=(await transaction.get(ref)).data();if(!job)return reminderRecovery();validateReminderJob(jobId,job);
    if(job.kind!=='reminderReconciliation'||!assertReminderLease(job,token,clock()))throw new HttpsError('aborted','This reminder reconciliation changed.');
    const root=db.doc(`users/${job.userId}`),context=await readReminderOwner(transaction,root);
    if(context.ownerKey!==job.targetOwnerKey)throw new HttpsError('aborted','Your reminder preferences or financial records changed.');
    let query=root.collection('obligationInstances').orderBy(FieldPath.documentId()).limit(100);
    if(job.cursor!==null&&job.cursor!==undefined)query=query.startAfter(identifier(job.cursor));
    const periods=await transaction.get(query);
    const parentIds=[...new Set(periods.docs.map(doc=>identifier(owned(context.uid,doc.data()).obligationId)))];
    const parents=new Map((await Promise.all(parentIds.map(id=>transaction.get(root.collection('obligations').doc(id)))))
      .map(doc=>[doc.id,owned(context.uid,doc.data())]));
    const priorJobs=await Promise.all(periods.docs.map(doc=>transaction.get(db.collection('systemJobs').doc(periodJobId(context.uid,doc.id,'reminderPreparation')))));
    assertReminderLease(job,token,clock());
    for(let index=0;index<periods.size;index++) {
      const periodDoc=periods.docs[index]!,period=owned(context.uid,periodDoc.data()),parent=parents.get(period.obligationId)!;
      if(period.instanceId!==periodDoc.id||parent.obligationId!==period.obligationId)return reminderRecovery();
      const previous=priorJobs[index]!.data();if(previous)validateReminderJob(priorJobs[index]!.id,previous);
      const targets={targetRevision:revision(period.revision),targetParentRevision:revision(parent.revision),
        targetPreferenceRevision:context.preferenceRevision,targetProfileRevision:revision(context.profile.revision)};
      if(previous&&Object.entries(targets).every(([key,value])=>previous[key]===value)&&['pending','leased','complete'].includes(previous.status))continue;
      transaction.set(priorJobs[index]!.ref,{kind:'reminderPreparation',subjectId:periodDoc.id,obligationId:period.obligationId,
        userId:context.uid,schemaVersion:1,...targets,generation:previous?revision(previous.generation+1):1,status:'pending',
        nextRunAt:Timestamp.fromDate(clock()),attempts:0,...clearedReminderLease,lastError:null,cancellationCursor:null,
        preparedContextKey:previous?.preparedContextKey??null,targetContextKey:null,
        createdAt:previous?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    }
    const hasMore=periods.size===100;
    transaction.update(ref,{status:hasMore?'pending':'complete',generation:revision(job.generation+1),
      cursor:hasMore?periods.docs.at(-1)!.id:null,nextRunAt:hasMore?Timestamp.fromDate(clock()):null,
      ...clearedReminderLease,attempts:0,lastError:null,updatedAt:FieldValue.serverTimestamp()});
    return {examined:periods.size,hasMore};
  });
}
