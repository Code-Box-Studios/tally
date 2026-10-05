import {createHash} from 'node:crypto';
import {Timestamp,type DocumentData,type DocumentReference,type Transaction} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {boolValue,currencyCode,enumValue,identifier,moneyMinor,nullableDate,revision,textValue} from '../shared/validation.js';
import {exactObject} from '../shared/callable.js';
import {validateScheduledTime,validateScheduleZone} from '../recurring/scheduled_time.js';
import type {ReminderPolicy} from '../recurring/recurring_validation.js';
import {validateNotificationPolicy,validateOffsets,type NotificationPolicy} from './policy.js';
import type {ReminderSubject} from './schedule.js';

export const reminderRecovery=():never=>{throw new HttpsError('failed-precondition','Your reminders need recovery.');};
export function owned(uid:string,data:DocumentData|undefined):DocumentData {
  if(!data||data.userId!==uid||data.schemaVersion!==1)return reminderRecovery();
  return data;
}
function hash(value:unknown):string {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export interface ReminderOwnerContext {
  uid:string;profile:DocumentData;preferences:NotificationPolicy;preferenceRevision:number;ownerKey:string;
}
export async function readReminderOwner(transaction:Transaction,root:DocumentReference):Promise<ReminderOwnerContext> {
  const uid=identifier(root.id);
  const [profileDoc,prefDoc,ledgerDoc]=await Promise.all([transaction.get(root),
    transaction.get(root.collection('notificationPreferences').doc('default')),
    transaction.get(root.collection('ledgerState').doc('current'))]);
  const profile=owned(uid,profileDoc.data()),pref=owned(uid,prefDoc.data()),ledger=owned(uid,ledgerDoc.data());
  if(profile.accountStatus!=='active'||!Number.isSafeInteger(ledger.revision)||ledger.revision<0||ledger.revision>=Number.MAX_SAFE_INTEGER)return reminderRecovery();
  revision(profile.revision);validateScheduleZone(profile.timezone);
  const preferences=validateNotificationPolicy(Object.fromEntries([
    'enabled','enabledKinds','offsetDays','localTime','quietStart','quietEnd','pushEnabled','localEnabled',
    'allowSensitivePushText','timezonePolicy',
  ].map(key=>[key,pref[key]])));
  const preferenceRevision=revision(pref.revision);
  return {uid,profile,preferences,preferenceRevision,ownerKey:hash([uid,ledger.revision,profile.revision,profile.timezone,preferenceRevision])};
}
export interface ReminderContext extends ReminderOwnerContext {
  instance:DocumentData;parent:DocumentData;subject:ReminderSubject;contextKey:string;policyRevision:number;title:string;currency:string;
}
function validateReminder(input:unknown):ReminderPolicy {
  const saved=typeof input==='object'&&input!==null&&Object.hasOwn(input,'preferenceRevision');
  const raw=exactObject(input,['enabled','offsetDays','localTime',...(saved?['preferenceRevision']:[])]);
  if(saved)revision(raw.preferenceRevision);
  return {enabled:boolValue(raw.enabled),offsetDays:[...validateOffsets(raw.offsetDays)],localTime:validateScheduledTime(raw.localTime)};
}
export async function readReminderContext(transaction:Transaction,root:DocumentReference,instanceId:string):Promise<ReminderContext> {
  const [owner,instanceDoc]=await Promise.all([readReminderOwner(transaction,root),transaction.get(root.collection('obligationInstances').doc(identifier(instanceId)))]);
  const instance=owned(owner.uid,instanceDoc.data()),obligationId=identifier(instance.obligationId);
  const parent=owned(owner.uid,(await transaction.get(root.collection('obligations').doc(obligationId))).data());
  if(instance.instanceId!==instanceId||parent.obligationId!==obligationId||parent.currency!==instance.currency||typeof instance.closed!=='boolean')return reminderRecovery();
  revision(instance.revision);revision(parent.revision);
  enumValue(parent.lifecycle,['active','paused','ended','cancelled'] as const);
  enumValue(instance.financialStatus,['active','pending','partiallyPaid','paid','overdue','skipped','cancelled'] as const);
  const currency=currencyCode(instance.currency);
  if(!Number.isSafeInteger(instance.totalPaidMinor)||instance.totalPaidMinor<0)return reminderRecovery();
  if(instance.amountState==='known') {
    moneyMinor(instance.amountMinor);
    if(instance.totalPaidMinor>instance.amountMinor||instance.remainingMinor!==instance.amountMinor-instance.totalPaidMinor)return reminderRecovery();
  } else if(instance.amountState!=='unknown'||instance.amountMinor!==null||instance.remainingMinor!==null||instance.totalPaidMinor!==0)return reminderRecovery();
  const recurring=['recurringDue','subscription'].includes(parent.type);
  const policy:ReminderPolicy|null=recurring?validateReminder(instance.snapshot?.reminderPolicy):
    parent.reminderRevision!==undefined?validateReminder(parent.reminderPolicy):null;
  const policyRevision=recurring?revision(instance.templateRevision):parent.reminderRevision===undefined?1:revision(parent.reminderRevision);
  const timezone=validateScheduleZone(instance.timezone),dueDate=nullableDate(instance.dueDate);
  const title=textValue(recurring?instance.snapshot?.title:parent.title,120,true);
  const subject:ReminderSubject={instanceId,obligationId,section:enumValue(instance.section,['iOwe','owedToMe','monthlyDues'] as const),
    dueDate,timezone,paymentMode:enumValue(instance.paymentMode,['manual','automatic','automaticConfirmation'] as const),
    closed:parent.lifecycle==='cancelled'||instance.closed||['paid','skipped','cancelled'].includes(instance.financialStatus),
    amountMinor:instance.amountMinor,remainingMinor:instance.remainingMinor,
    requiresDeductionConfirmation:instance.requiresDeductionConfirmation===true,reminderPolicy:policy,
    confirmationAt:instance.deductionAt instanceof Timestamp?instance.deductionAt.toDate():null};
  return {...owner,instance,parent,subject,policyRevision,title,currency,
    contextKey:hash([owner.uid,instanceId,parent.revision,instance.revision,owner.profile.revision,owner.profile.timezone,owner.preferenceRevision,policyRevision])};
}
