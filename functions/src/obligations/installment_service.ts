import type {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeOwnerCommand} from '../shared/commands.js';
import {statusForBalance} from '../shared/financial_status.js';
import {occurrenceInstanceId} from '../shared/occurrence_id.js';
import {identifier,invalid,localToday,revision,textValue} from '../shared/validation.js';
import {finiteSummary,readFiniteDebt,type FiniteInstance} from '../payments/finite_debt.js';
import {validateSchedule,type InstallmentTerm} from './installment_calculation.js';
import {references,terms,validateObligationCreation,type ObligationInput} from './obligation_service.js';

interface InstallmentInput extends ObligationInput {installments:InstallmentTerm[]}

function validateCreation(input:unknown):InstallmentInput {
  if(!input || typeof input!=='object' || Array.isArray(input))return invalid();
  const {installments,...body}=input as Record<string,unknown>;
  const obligation=validateObligationCreation(body);
  const schedule=validateSchedule(installments,obligation.amountMinor,obligation.originationDate);
  if(obligation.dueDate!==schedule[schedule.length-1]!.dueDate)
    return invalid('The due date must match the final installment.');
  return {...obligation,installments:schedule};
}

function validateEdit(input:unknown) {
  if(!input || typeof input!=='object' || Array.isArray(input))return invalid();
  const {obligationId,expectedRevision,...body}=input as Record<string,unknown>;
  return {obligationId:identifier(obligationId),expectedRevision:revision(expectedRevision),...validateCreation(body)};
}

export async function createInstallment(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'createInstallment',validateCreation,async(context,payload)=>{
    if(payload.originationDate>localToday(context.profile.timezone))return invalid('Borrowed or lent date cannot be in the future.');
    const snapshots=await references(context,payload);
    const obligationId=context.id('obligation');
    const section=payload.direction==='owedByMe'?'iOwe':'owedToMe';
    const today=localToday(context.profile.timezone);
    const instances=payload.installments.map((term,index):FiniteInstance=>{
      const occurrenceKey=`i:${String(index+1).padStart(4,'0')}`;
      const instanceId=occurrenceInstanceId(obligationId,occurrenceKey);
      return {
        instanceId,obligationId,occurrenceKey,occurrenceDate:term.dueDate,
        periodLabel:`Installment ${index+1} of ${payload.installments.length}`,
        yearMonth:term.dueDate.slice(0,7),dueDate:term.dueDate,deductionDate:null,timezone:context.profile.timezone,
        direction:payload.direction,section,contactId:payload.contactId,categoryId:payload.categoryId,currency:payload.currency,
        amountMinor:term.amountMinor,amountState:'known',financialStatus:statusForBalance(0,term.amountMinor,term.dueDate,today),
        deductionStatus:null,paymentMode:'manual',paymentSourceId:payload.paymentSourceId,
        snapshot:{title:payload.title,...snapshots},templateRevision:1,
        totalPaidMinor:0,remainingMinor:term.amountMinor,closed:false,hasPaymentHistory:false,lastDeductionAttemptId:null,revision:1,
      };
    });
    const obligationInstanceIds=instances.map(instance=>instance.instanceId);
    const {installments,...obligation}=payload;
    context.create('obligations',obligationId,{
      ...terms(obligation,snapshots),type:'installment',obligationId,timezone:context.profile.timezone,
      singleInstanceId:null,installmentInstanceIds:obligationInstanceIds,...finiteSummary(instances,context.profile.timezone),
      lifecycle:'active',archived:false,hasPaymentHistory:false,revision:1,
      reminderPolicy:{enabled:true,offsetDays:[3,0],localTime:'09:00',preferenceRevision:1},
    });
    for(const instance of instances)context.create('obligationInstances',instance.instanceId,instance);
    context.activity('obligationCreated',{obligationId,title:payload.title,amountMinor:payload.amountMinor,currency:payload.currency,direction:payload.direction});
    return {obligationId,obligationInstanceIds,obligationRevision:1,instanceRevisions:instances.map(instance=>({instanceId:instance.instanceId,instanceRevision:1}))};
  },db);
}

export async function editInstallment(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'editInstallment',validateEdit,async(context,payload)=>{
    const debt=await readFiniteDebt(context,payload.obligationId);const parent=debt.parent;
    if(parent.type!=='installment')throw new HttpsError('failed-precondition','This obligation has no installment schedule.');
    if(parent.revision!==payload.expectedRevision)throw new HttpsError('aborted','This obligation changed. Refresh and try again.');
    if(payload.installments.length!==debt.instances.length)throw new HttpsError('failed-precondition','Keep the original number of installment periods.');
    if(parent.hasPaymentHistory && (parent.originalAmountMinor!==payload.amountMinor || parent.currency!==payload.currency || parent.direction!==payload.direction || parent.originationDate!==payload.originationDate || parent.contactId!==payload.contactId))
      throw new HttpsError('failed-precondition','Paid history keeps its original amount, currency and person.');
    for(let index=0;index<debt.instances.length;index++) {
      const instance=debt.instances[index]!;const term=payload.installments[index]!;
      if((instance.hasPaymentHistory || instance.totalPaidMinor>0) && instance.amountMinor!==term.amountMinor)
        throw new HttpsError('failed-precondition','Installment amounts keep their payment history.');
      if(instance.closed && instance.dueDate!==term.dueDate)
        throw new HttpsError('failed-precondition','A completed due date keeps its history.');
    }
    if(payload.originationDate>localToday(context.profile.timezone))return invalid('Borrowed or lent date cannot be in the future.');
    const snapshots=await references(context,payload,{contactId:parent.contactId,categoryId:parent.categoryId,paymentSourceId:parent.paymentSourceId});
    const obligationRevision=revision(parent.revision)+1;
    const today=localToday(parent.timezone);
    const updated=debt.instances.map((instance,index)=>{
      const term=payload.installments[index]!;
      return {...instance,amountMinor:term.amountMinor,dueDate:term.dueDate,yearMonth:term.dueDate.slice(0,7),
        remainingMinor:term.amountMinor-instance.totalPaidMinor,
        financialStatus:statusForBalance(instance.totalPaidMinor,term.amountMinor-instance.totalPaidMinor,term.dueDate,today),
        currency:payload.currency,direction:payload.direction,section:payload.direction==='owedByMe'?'iOwe':'owedToMe',
        contactId:payload.contactId,categoryId:payload.categoryId,paymentSourceId:payload.paymentSourceId,
        snapshot:instance.closed?instance.snapshot:{title:payload.title,...snapshots},revision:revision(instance.revision)+1};
    });
    const {obligationId,expectedRevision,installments,...obligation}=payload;
    context.update('obligations',obligationId,{...terms(obligation,snapshots),type:'installment',...finiteSummary(updated,parent.timezone),revision:obligationRevision});
    for(const instance of updated)context.update('obligationInstances',instance.instanceId,instance);
    context.activity('obligationChanged',{obligationId,title:payload.title,amountMinor:payload.amountMinor,currency:payload.currency,dueDate:payload.dueDate});
    return {obligationId,obligationInstanceIds:updated.map(instance=>instance.instanceId),obligationRevision,instanceRevisions:updated.map(instance=>({instanceId:instance.instanceId,instanceRevision:instance.revision as number}))};
  },db);
}

function validateCancellation(input:unknown) {
  const raw=exactObject(input,['obligationId','expectedRevision','reason']);
  return {obligationId:identifier(raw.obligationId),expectedRevision:revision(raw.expectedRevision),reason:textValue(raw.reason,1000,true)};
}

export async function cancelInstallment(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'cancelInstallment',validateCancellation,async(context,payload)=>{
    const debt=await readFiniteDebt(context,payload.obligationId);const parent=debt.parent;
    if(parent.type!=='installment')throw new HttpsError('failed-precondition','This obligation has no installment schedule.');
    if(parent.revision!==payload.expectedRevision)throw new HttpsError('aborted','This obligation changed. Refresh and try again.');
    const obligationRevision=revision(parent.revision)+1;
    context.update('obligations',payload.obligationId,{lifecycle:'cancelled',financialStatus:'cancelled',nextDueDate:null,revision:obligationRevision});
    const instanceRevisions=debt.instances.map(instance=>{
      const instanceRevision=revision(instance.revision)+1;
      context.update('obligationInstances',instance.instanceId,{closed:true,financialStatus:'cancelled',revision:instanceRevision});
      return {instanceId:instance.instanceId,instanceRevision};
    });
    context.activity('obligationCancelled',{obligationId:payload.obligationId,title:parent.title,amountMinor:parent.remainingMinor,currency:parent.currency,reason:payload.reason});
    return {obligationId:payload.obligationId,obligationInstanceIds:debt.instances.map(instance=>instance.instanceId),obligationRevision,instanceRevisions};
  },db);
}
