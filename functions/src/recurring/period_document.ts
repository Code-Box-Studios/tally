import {Timestamp,type DocumentData} from 'firebase-admin/firestore';
import type {OwnerCommandContext} from '../shared/commands.js';
import {occurrenceInstanceId} from '../shared/occurrence_id.js';
import {statusForBalance} from '../shared/financial_status.js';
import {localToday} from '../shared/validation.js';
import {periodJobId} from '../jobs/recurring_jobs.js';
import {stageReminderPeriod} from '../notifications/reminder_jobs.js';
import {scheduledInstant} from './scheduled_time.js';
import type {RecurrenceRule} from './recurrence.js';

export function periodDocument(parent:DocumentData,rule:RecurrenceRule,date:string,now:Date):DocumentData {
  const occurrenceKey=`r:${date}`,instanceId=occurrenceInstanceId(parent.obligationId,occurrenceKey);
  const amount=parent.amountKind==='fixed'?parent.defaultAmountMinor:null;
  const automatic=parent.paymentMode!=='manual';
  return {instanceId,obligationId:parent.obligationId,occurrenceKey,occurrenceDate:date,periodLabel:date.slice(0,7),yearMonth:date.slice(0,7),dueDate:date,
    deductionDate:automatic?date:null,deductionAt:automatic?Timestamp.fromDate(scheduledInstant(date,rule.localDeductionTime,rule.timezone)):null,
    localDeductionTime:rule.localDeductionTime,timezone:rule.timezone,direction:'owedByMe',section:'monthlyDues',contactId:parent.contactId,
    categoryId:parent.categoryId,currency:parent.currency,amountMinor:amount,amountState:amount===null?'unknown':'known',totalPaidMinor:0,remainingMinor:amount,
    financialStatus:amount===null?'pending':statusForBalance(0,amount,date,localToday(rule.timezone,now)),deductionStatus:automatic?'scheduled':null,
    paymentMode:parent.paymentMode,paymentSourceId:parent.paymentSourceId,
    snapshot:{title:parent.title,description:parent.description,notes:parent.notes,contactSnapshot:parent.contactSnapshot,categorySnapshot:parent.categorySnapshot,
      sourceSnapshot:parent.sourceSnapshot,amountKind:parent.amountKind,estimatedAmountMinor:parent.amountKind==='variable'?parent.defaultAmountMinor:null,
      reminderPolicy:parent.reminderPolicy,ruleVersion:rule.ruleVersion},
    templateRevision:parent.revision,closed:false,hasPaymentHistory:false,lastDeductionAttemptId:null,requiresDeductionConfirmation:false,revision:1};
}
export function stagePeriod(context:OwnerCommandContext,parent:DocumentData,period:DocumentData,now:Date):void {
  context.create('obligationInstances',period.instanceId,period);
  if(period.paymentMode!=='manual')context.systemJob(periodJobId(context.uid,period.instanceId,'automaticDeduction'),{
    kind:'automaticDeduction',subjectId:period.instanceId,obligationId:parent.obligationId,status:'pending',generation:1,
    nextRunAt:period.deductionAt,targetRevision:1,attempts:0,leaseToken:null,leaseGeneration:null,leaseExpiresAt:null,lastError:null,
    eventKey:`automatic:${period.occurrenceKey}:${period.snapshot.ruleVersion}`,
  },false);
  stageReminderPeriod(context,parent.obligationId,period.instanceId,now);
}
