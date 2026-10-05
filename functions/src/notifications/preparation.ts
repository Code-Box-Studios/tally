import {FieldPath,FieldValue,Timestamp,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {identifier,localToday,revision} from '../shared/validation.js';
import {nextCivilBoundary} from '../jobs/leases.js';
import {owned,readReminderContext,reminderRecovery} from './context.js';
import {planReminders,reminderId} from './schedule.js';
import {assertReminderLease,clearedReminderLease,reminderDeliveryId,validateReminderJob} from './reminder_jobs.js';

export async function prepareReminders(jobId:string,token:string,db:Firestore,injectedNow?:Date):Promise<{created:number;hasMore:boolean;stale?:true}> {
  const ref=db.collection('systemJobs').doc(identifier(jobId)),clock=()=>injectedNow??new Date();
  return db.runTransaction(async transaction=>{
    const job=(await transaction.get(ref)).data();if(!job)return reminderRecovery();validateReminderJob(jobId,job);
    if(job.kind!=='reminderPreparation'||!assertReminderLease(job,token,clock()))return {created:0,hasMore:false,stale:true};
    const root=db.doc(`users/${job.userId}`),context=await readReminderContext(transaction,root,job.subjectId);
    if(job.obligationId!==context.parent.obligationId||job.targetContextKey!==context.contextKey)
      throw new HttpsError('aborted','Your reminder details changed.');
    let cancellationQuery=root.collection('reminders').where('instanceId','==',context.instance.instanceId)
      .where('visible','==',false).where('status','in',['pending','failed']).orderBy(FieldPath.documentId()).limit(100);
    if(job.cancellationCursor)cancellationQuery=cancellationQuery.startAfter(identifier(job.cancellationCursor));
    const old=job.preparedContextKey!==context.contextKey?await transaction.get(cancellationQuery):null;
    const obsolete=old?.docs.filter(doc=>owned(context.uid,doc.data()).contextKey!==context.contextKey)??[];
    const obsoleteJobs=await Promise.all(obsolete.map(doc=>transaction.get(db.collection('systemJobs').doc(reminderDeliveryId(context.uid,doc.id)))));
    const hasMore=old?.size===100;
    const plans=hasMore?[]:planReminders(context.subject,context.preferences,context.profile.timezone,clock());
    if(plans.length>32)return reminderRecovery();
    const identities=plans.map(plan=>reminderId(context.uid,context.instance.instanceId,plan.kind,plan.civilTargetDate,context.preferenceRevision,context.policyRevision));
    const [priorEntries,priorDeliveries]=await Promise.all([
      Promise.all(identities.map(id=>transaction.get(root.collection('reminders').doc(id)))),
      Promise.all(identities.map(id=>transaction.get(db.collection('systemJobs').doc(reminderDeliveryId(context.uid,id))))),
    ]);
    for(const doc of priorEntries)if(doc.exists&&owned(context.uid,doc.data()).reminderId!==doc.id)return reminderRecovery();
    for(const doc of [...obsoleteJobs,...priorDeliveries])if(doc.exists)validateReminderJob(doc.id,doc.data()!);
    assertReminderLease(job,token,clock());
    for(let index=0;index<obsolete.length;index++) {
      const doc=obsolete[index]!,data=doc.data();
      transaction.update(doc.ref,{status:'cancelled',visible:false,visibleAt:null,revision:revision(data.revision+1),updatedAt:FieldValue.serverTimestamp()});
      if(obsoleteJobs[index]!.exists)transaction.update(obsoleteJobs[index]!.ref,{status:'cancelled',nextRunAt:null,
        generation:revision(obsoleteJobs[index]!.data()!.generation+1),...clearedReminderLease,updatedAt:FieldValue.serverTimestamp()});
    }
    let created=0;
    for(let index=0;index<plans.length;index++) {
      const plan=plans[index]!,entry=priorEntries[index]!,previous=entry.data(),delivery=priorDeliveries[index]!,previousJob=delivery.data();
      // Published snapshots and read state are permanent historical evidence.
      if(previous?.visible===true)continue;
      if(previous?.contextKey===context.contextKey&&previous.status==='pending'&&previous.scheduledAt instanceof Timestamp&&
        previous.scheduledAt.toMillis()===plan.scheduledAt.getTime()&&previousJob&&['pending','leased'].includes(previousJob.status))continue;
      const id=identities[index]!,data:DocumentData={reminderId:id,userId:context.uid,schemaVersion:1,
        obligationId:context.parent.obligationId,instanceId:context.instance.instanceId,kind:plan.kind,phase:plan.phase,
        civilTargetDate:plan.civilTargetDate,scheduledAt:Timestamp.fromDate(plan.scheduledAt),savedTimezone:context.subject.timezone,
        quietTimezone:context.profile.timezone,preferenceRevision:context.preferenceRevision,policyRevision:context.policyRevision,
        parentRevision:context.parent.revision,instanceRevision:context.instance.revision,contextKey:context.contextKey,
        status:'pending',visible:false,visibleAt:null,readAt:null,revision:previous?revision(previous.revision+1):1,
        title:context.title,amountMinor:context.subject.remainingMinor,currency:context.currency,messageKey:`reminder.${plan.kind}`,
        externalExpiresAt:Timestamp.fromMillis(plan.scheduledAt.getTime()+86400000),deliverySummary:{},
        createdAt:previous?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
      transaction.set(entry.ref,data);
      transaction.set(delivery.ref,{kind:'reminderDelivery',subjectId:id,obligationId:context.parent.obligationId,
        instanceId:context.instance.instanceId,userId:context.uid,schemaVersion:1,targetContextKey:context.contextKey,
        status:'pending',nextRunAt:Timestamp.fromDate(plan.scheduledAt),generation:previousJob?revision(previousJob.generation+1):1,
        attempts:0,...clearedReminderLease,lastError:null,createdAt:previousJob?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      if(!previous)created++;
    }
    const extend=!context.subject.closed&&context.subject.dueDate!==null&&context.preferences.enabled&&context.subject.reminderPolicy?.enabled!==false;
    const nextRun=hasMore?clock():extend&&localToday(context.subject.timezone,clock())!=='2199-12-31'?nextCivilBoundary(context.subject.timezone,clock()):null;
    transaction.update(ref,{status:nextRun?'pending':'complete',nextRunAt:nextRun?Timestamp.fromDate(nextRun):null,
      generation:revision(job.generation+1),...clearedReminderLease,attempts:0,lastError:null,
      cancellationCursor:hasMore?old!.docs.at(-1)!.id:null,
      preparedContextKey:hasMore?job.preparedContextKey??null:context.contextKey,updatedAt:FieldValue.serverTimestamp()});
    return {created,hasMore};
  });
}
