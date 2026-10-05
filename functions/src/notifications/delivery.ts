import {FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {identifier,revision} from '../shared/validation.js';
import {periodJobId} from '../jobs/recurring_jobs.js';
import {owned,readReminderContext,reminderRecovery} from './context.js';
import {assertReminderLease,clearedReminderLease,validateReminderJob} from './reminder_jobs.js';
import {getMessaging} from 'firebase-admin/messaging';
import {getApp} from 'firebase-admin/app';
import {FcmNotificationTransport} from './fcm_transport.js';
import {deliverExternal} from './external_delivery.js';

export interface NotificationMessage {token:string;title:string;body:string;data:Readonly<Record<string,string>>;expiresAt?:Date}
export interface NotificationTransport {send(message:NotificationMessage):Promise<'delivered'|'invalid'|'retry'>}
export interface ReminderDeliveryResult {published:boolean;external?:'pending'|'disabled'|'expired'}
export async function deliverReminder(jobId:string,token:string,db:Firestore,transport?:NotificationTransport,injectedNow?:Date):Promise<ReminderDeliveryResult> {
  const ref=db.collection('systemJobs').doc(identifier(jobId)),clock=()=>injectedNow??new Date();
  const result:ReminderDeliveryResult=await db.runTransaction(async transaction=>{
    const job=(await transaction.get(ref)).data();if(!job)return reminderRecovery();validateReminderJob(jobId,job);
    if(job.kind!=='reminderDelivery'||!assertReminderLease(job,token,clock()))return {published:false};
    const root=db.doc(`users/${job.userId}`),entryRef=root.collection('reminders').doc(identifier(job.subjectId));
    const entry=owned(job.userId,(await transaction.get(entryRef)).data());
    if(entry.reminderId!==job.subjectId||entry.instanceId!==job.instanceId||entry.obligationId!==job.obligationId||
      !(entry.scheduledAt instanceof Timestamp)||entry.scheduledAt.toMillis()>clock().getTime())return reminderRecovery();
    const context=await readReminderContext(transaction,root,entry.instanceId);
    const preparationRef=db.collection('systemJobs').doc(periodJobId(context.uid,entry.instanceId,'reminderPreparation'));
    const preparation=(await transaction.get(preparationRef)).data();if(preparation)validateReminderJob(preparationRef.id,preparation);
    const activityRef=root.collection('activities').doc(`activity-${entry.reminderId}`),activity=await transaction.get(activityRef);
    if(activity.exists) {
      const prior=owned(context.uid,activity.data());
      if(prior.type!=='reminderGenerated'||prior.reminderId!==entry.reminderId)return reminderRecovery();
    }
    assertReminderLease(job,token,clock());
    const stale=entry.contextKey!==context.contextKey||job.targetContextKey!==context.contextKey||context.subject.closed||!context.preferences.enabled||context.subject.reminderPolicy?.enabled===false;
    if(stale||entry.status==='cancelled') {
      if(!entry.visible)transaction.update(entryRef,{status:'cancelled',visible:false,visibleAt:null,
        revision:revision(entry.revision+1),updatedAt:FieldValue.serverTimestamp()});
      transaction.update(ref,{status:'cancelled',nextRunAt:null,generation:revision(job.generation+1),...clearedReminderLease,updatedAt:FieldValue.serverTimestamp()});
      transaction.set(preparationRef,{kind:'reminderPreparation',subjectId:entry.instanceId,obligationId:entry.obligationId,
        userId:context.uid,schemaVersion:1,generation:preparation?revision(preparation.generation+1):1,status:'pending',
        nextRunAt:Timestamp.fromDate(clock()),targetRevision:context.instance.revision,targetParentRevision:context.parent.revision,
        targetPreferenceRevision:context.preferenceRevision,targetProfileRevision:context.profile.revision,targetContextKey:null,
        preparedContextKey:preparation?.preparedContextKey??null,cancellationCursor:null,attempts:0,...clearedReminderLease,lastError:null,
        createdAt:preparation?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return {published:false};
    }
    const expired=!(entry.externalExpiresAt instanceof Timestamp)||entry.externalExpiresAt.toMillis()<=clock().getTime();
    const external=expired?'expired':context.preferences.pushEnabled?'pending':'disabled';
    if(!entry.visible) {
      transaction.update(entryRef,{status:'sent',visible:true,visibleAt:Timestamp.fromDate(clock()),
        revision:revision(entry.revision+1),deliverySummary:{external},updatedAt:FieldValue.serverTimestamp()});
      if(!activity.exists)transaction.create(activityRef,{type:'reminderGenerated',reminderId:entry.reminderId,
        obligationId:entry.obligationId,instanceId:entry.instanceId,title:entry.title,amountMinor:entry.amountMinor,
        currency:entry.amountMinor===null?null:entry.currency,obligationCurrency:entry.currency,direction:context.instance.direction,
        userId:context.uid,schemaVersion:1,recordedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    }
    transaction.update(ref,{...(external==='pending'?{}:{status:'complete',nextRunAt:null,generation:revision(job.generation+1),...clearedReminderLease}),
      externalState:external,updatedAt:FieldValue.serverTimestamp()});
    return {published:!entry.visible,external};
  });
  if(result.external==='pending')await deliverExternal(jobId,token,db,transport??new FcmNotificationTransport(getMessaging(),{
    emulator:process.env.FUNCTIONS_EMULATOR==='true'||!!process.env.FIRESTORE_EMULATOR_HOST,
    projectId:process.env.GCLOUD_PROJECT??getApp().options.projectId??'',
  }),clock);
  return result;
}
