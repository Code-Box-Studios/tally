import {Timestamp,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {executeOwnerCommand,type OwnerCommandContext} from '../shared/commands.js';
import {exactObject} from '../shared/callable.js';
import {civilDate,identifier,localToday,moneyMinor,nullableId,revision,textValue} from '../shared/validation.js';
import {statusForBalance} from '../shared/financial_status.js';
import {occurrenceInstanceId} from '../shared/occurrence_id.js';
import {paymentSourceSnapshot} from '../payments/payment_service.js';
import {periodJobId} from '../jobs/recurring_jobs.js';
import {readRecurringParent} from './recurring_service.js';
import {scheduledInstant} from './scheduled_time.js';

function identity(raw:Record<string,unknown>) {
  return {obligationId:identifier(raw.obligationId),instanceId:identifier(raw.instanceId),expectedRevision:revision(raw.expectedRevision),reason:textValue(raw.reason,1000,true)};
}
export async function readRecurringInstance(context:OwnerCommandContext,obligationId:string,instanceId:string):Promise<{parent:DocumentData;instance:DocumentData}> {
  const parent=await readRecurringParent(context,obligationId),instance=await context.read('obligationInstances',instanceId);
  if(instance.obligationId!==obligationId||instance.instanceId!==instanceId||instance.currency!==parent.currency||instance.occurrenceKey!==`r:${civilDate(instance.occurrenceDate)}`||instanceId!==occurrenceInstanceId(obligationId,instance.occurrenceKey)||instance.section!=='monthlyDues'||!instance.snapshot||!Number.isSafeInteger(instance.totalPaidMinor)||instance.totalPaidMinor<0)
    throw new HttpsError('failed-precondition','This billing period needs recovery.');
  if(instance.amountState==='known') {
    moneyMinor(instance.amountMinor);
    if(instance.totalPaidMinor>instance.amountMinor||instance.remainingMinor!==instance.amountMinor-instance.totalPaidMinor)throw new HttpsError('failed-precondition','This billing period needs recovery.');
  }else if(instance.amountState!=='unknown'||instance.amountMinor!==null||instance.remainingMinor!==null||instance.totalPaidMinor!==0)
    throw new HttpsError('failed-precondition','This billing period needs recovery.');
  return {parent,instance};
}
function assertEditable(instance:DocumentData,expected:number):void {
  if(instance.revision!==expected)throw new HttpsError('aborted','This period changed. Refresh and try again.');
  if(instance.closed)throw new HttpsError('failed-precondition','A closed period keeps its history.');
}
async function stagePeriodJobs(context:OwnerCommandContext,instance:DocumentData,changes:DocumentData,now:Date):Promise<void> {
  const updated={...instance,...changes};
  for(const kind of ['automaticDeduction','reminderPreparation'] as const) {
    const id=periodJobId(context.uid,instance.instanceId,kind),job=await context.readSystemJob(id);
    if(!job)continue;
    if(job.kind!==kind||job.subjectId!==instance.instanceId||job.obligationId!==instance.obligationId)throw new HttpsError('failed-precondition','This period job needs recovery.');
    // Completed financial events must never be restarted by an amount or due-date edit.
    const terminal=['complete','cancelled'].includes(job.status);
    context.systemJob(id,{generation:revision(job.generation)+1,targetRevision:updated.revision,
      status:updated.closed?'cancelled':terminal?job.status:'pending',nextRunAt:updated.closed?null:kind==='automaticDeduction'?updated.deductionAt:Timestamp.fromDate(now),
      leaseToken:null,leaseGeneration:null,leaseExpiresAt:null,attempts:0,lastError:null},true);
  }
}
export async function setRecurringAmount(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'setRecurringAmount',input=>{
    const raw=exactObject(input,['obligationId','instanceId','expectedRevision','amountMinor','reason']);return {...identity(raw),amountMinor:moneyMinor(raw.amountMinor)};
  },async(context,payload)=>{
    const {parent,instance}=await readRecurringInstance(context,payload.obligationId,payload.instanceId);assertEditable(instance,payload.expectedRevision);
    if(payload.amountMinor<instance.totalPaidMinor)throw new HttpsError('failed-precondition','The bill amount cannot be below recorded payments.');
    const now=new Date(),remainingMinor=payload.amountMinor-instance.totalPaidMinor,instanceRevision=revision(instance.revision)+1;
    const late=instance.paymentMode!=='manual'&&instance.deductionAt instanceof Timestamp&&instance.deductionAt.toMillis()<=now.getTime();
    const changes={amountMinor:payload.amountMinor,amountState:'known',remainingMinor,closed:remainingMinor===0,
      financialStatus:statusForBalance(instance.totalPaidMinor,remainingMinor,instance.dueDate,localToday(instance.timezone,now)),
      requiresDeductionConfirmation:instance.requiresDeductionConfirmation||late,revision:instanceRevision};
    await stagePeriodJobs(context,instance,changes,now);
    context.update('obligationInstances',payload.instanceId,changes);
    context.activity('periodAmountChanged',{obligationId:payload.obligationId,instanceId:payload.instanceId,title:instance.snapshot.title,
      amountMinor:payload.amountMinor,currency:parent.currency,previousAmountMinor:instance.amountMinor,reason:payload.reason});
    return {obligationId:payload.obligationId,instanceId:payload.instanceId,instanceRevision};
  },db);
}
export async function editRecurringInstance(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'editRecurringInstance',input=>{
    const raw=exactObject(input,['obligationId','instanceId','expectedRevision','dueDate','paymentSourceId','notes','reason']);
    return {...identity(raw),dueDate:civilDate(raw.dueDate),paymentSourceId:nullableId(raw.paymentSourceId),notes:textValue(raw.notes,4000)};
  },async(context,payload)=>{
    const {parent,instance}=await readRecurringInstance(context,payload.obligationId,payload.instanceId);assertEditable(instance,payload.expectedRevision);
    if(instance.totalPaidMinor!==0)throw new HttpsError('failed-precondition','A paid period keeps its due date and source.');
    const snapshot=payload.paymentSourceId===instance.paymentSourceId?instance.paymentSourceOverrideSnapshot??instance.snapshot.sourceSnapshot:await paymentSourceSnapshot(context,payload.paymentSourceId);
    const now=new Date(),instanceRevision=revision(instance.revision)+1,automatic=instance.paymentMode!=='manual';
    const deductionAt=automatic?Timestamp.fromDate(scheduledInstant(payload.dueDate,instance.localDeductionTime,instance.timezone)):null;
    const changes={dueDate:payload.dueDate,yearMonth:payload.dueDate.slice(0,7),paymentSourceId:payload.paymentSourceId,paymentSourceOverrideSnapshot:snapshot,
      notes:payload.notes,deductionDate:automatic?payload.dueDate:null,deductionAt,revision:instanceRevision,
      requiresDeductionConfirmation:instance.requiresDeductionConfirmation||(deductionAt!==null&&deductionAt.toMillis()<=now.getTime()),
      financialStatus:instance.amountMinor===null?'pending':statusForBalance(0,instance.amountMinor,payload.dueDate,localToday(instance.timezone,now))};
    await stagePeriodJobs(context,instance,changes,now);
    context.update('obligationInstances',payload.instanceId,changes);
    context.activity('periodChanged',{obligationId:payload.obligationId,instanceId:payload.instanceId,title:instance.snapshot.title,
      amountMinor:instance.amountMinor,currency:instance.amountMinor===null?null:parent.currency,previousDueDate:instance.dueDate,dueDate:payload.dueDate,
      previousPaymentSourceId:instance.paymentSourceId,paymentSourceId:payload.paymentSourceId,reason:payload.reason});
    return {obligationId:payload.obligationId,instanceId:payload.instanceId,instanceRevision};
  },db);
}
export async function skipRecurringInstance(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'skipRecurringInstance',input=>identity(exactObject(input,['obligationId','instanceId','expectedRevision','reason'])),async(context,payload)=>{
    const {parent,instance}=await readRecurringInstance(context,payload.obligationId,payload.instanceId);assertEditable(instance,payload.expectedRevision);
    if(instance.totalPaidMinor!==0)throw new HttpsError('failed-precondition','Reverse this period’s payments before skipping it.');
    const instanceRevision=revision(instance.revision)+1,changes={closed:true,financialStatus:'skipped',revision:instanceRevision};
    await stagePeriodJobs(context,instance,changes,new Date());context.update('obligationInstances',payload.instanceId,changes);
    context.activity('periodSkipped',{obligationId:payload.obligationId,instanceId:payload.instanceId,title:instance.snapshot.title,
      amountMinor:instance.amountMinor,currency:instance.amountMinor===null?null:parent.currency,reason:payload.reason});
    return {obligationId:payload.obligationId,instanceId:payload.instanceId,instanceRevision};
  },db);
}
