import {FieldValue,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeOwnerCommand,type OwnerCommandContext} from '../shared/commands.js';
import {civilDate,currencyCode,enumValue,identifier,invalid,localToday,moneyMinor,nullableId,textValue,type Currency} from '../shared/validation.js';
import {allocatePayment,validateAllocations,type Allocation} from './allocation.js';
import {applyFiniteBalances,changeAllocatedBalance,readFiniteDebt} from './finite_debt.js';
import {recordRecurringPayment} from '../recurring/recurring_balance.js';
export const paymentMethods=['cash','bankTransfer','card','eWallet','payroll','other'] as const;
export interface PaymentTerms {amountMinor:number;paymentDate:string;paymentSourceId:string|null;paymentMethod:typeof paymentMethods[number];notes:string}
export interface PaymentInput extends PaymentTerms {obligationId:string;obligationInstanceId:string;currency:Currency}
export function validatePaymentTerms(input:unknown):PaymentTerms {
  const raw=exactObject(input,['amountMinor','paymentDate','paymentSourceId','paymentMethod','notes']);
  return {amountMinor:moneyMinor(raw.amountMinor),paymentDate:civilDate(raw.paymentDate),paymentSourceId:nullableId(raw.paymentSourceId),paymentMethod:enumValue(raw.paymentMethod,paymentMethods),notes:textValue(raw.notes,4000)};
}
export function validatePayment(input:unknown):PaymentInput {
  const raw=exactObject(input,['obligationId','obligationInstanceId','amountMinor','currency','paymentDate','paymentSourceId','paymentMethod','notes']);
  const {obligationId,obligationInstanceId,currency,...terms}=raw;
  return {obligationId:identifier(obligationId),obligationInstanceId:identifier(obligationInstanceId),currency:currencyCode(currency),...validatePaymentTerms(terms)};
}
export function validatePaymentDate(context:OwnerCommandContext,date:string,parent:DocumentData):void {
  if(date<parent.originationDate || date>localToday(context.profile.timezone))return invalid('Payment date must be between the borrowed or lent date and today.');
}
export async function paymentSourceSnapshot(context:OwnerCommandContext,id:string|null):Promise<DocumentData|null> {
  if(!id)return null;const source=await context.read('paymentSources',id);
  if(!source.active)throw new HttpsError('failed-precondition','Choose an active payment source.');
  return {name:source.name,type:source.type,lastFour:source.lastFour};
}
export function paymentDocument(context:OwnerCommandContext,id:string,parent:DocumentData,allocations:readonly Allocation[],terms:PaymentTerms,snapshot:DocumentData|null):DocumentData {
  return {paymentId:id,obligationId:parent.obligationId,obligationInstanceId:allocations.length===1?allocations[0]!.instanceId:null,
    allocations,entryType:'payment',amountMinor:terms.amountMinor,currency:parent.currency,
    paymentDate:terms.paymentDate,paymentTimezone:context.profile.timezone,paidAt:null,
    paymentSourceId:terms.paymentSourceId,sourceSnapshot:snapshot,paymentMethod:terms.paymentMethod,provenance:'manual',
    direction:parent.direction,contactId:parent.contactId,categoryId:parent.categoryId,notes:terms.notes,receiptAttachmentId:null,
    commandId:context.commandId,eventKey:null,reversesPaymentId:null,correctionGroupId:null,correctionReason:null,
    recordedAt:FieldValue.serverTimestamp()};
}
interface InstallmentPaymentInput extends PaymentTerms {obligationId:string;currency:Currency;explicitAllocations:Allocation[]|null}
function validateInstallmentPayment(input:unknown):InstallmentPaymentInput {
  const raw=exactObject(input,['obligationId','currency','amountMinor','paymentDate','paymentSourceId','paymentMethod','notes','explicitAllocations']);
  const {obligationId,currency,explicitAllocations,...terms}=raw;
  return {obligationId:identifier(obligationId),currency:currencyCode(currency),
    explicitAllocations:explicitAllocations===null?null:validateAllocations(explicitAllocations),...validatePaymentTerms(terms)};
}

async function recordFinitePayment(context:OwnerCommandContext,payload:PaymentInput|InstallmentPaymentInput) {
  const debt=await readFiniteDebt(context,payload.obligationId);const parent=debt.parent;
  if('explicitAllocations' in payload && parent.type!=='installment')
    throw new HttpsError('failed-precondition','This obligation has no installment schedule.');
  if(payload.currency!==parent.currency)return invalid('Payment currency must match the obligation.');
  validatePaymentDate(context,payload.paymentDate,parent);
  const snapshot=await paymentSourceSnapshot(context,payload.paymentSourceId);
  const explicit='obligationInstanceId' in payload?[{instanceId:payload.obligationInstanceId,amountMinor:payload.amountMinor}]:payload.explicitAllocations;
  const allocations=allocatePayment(payload.amountMinor,debt.instances,explicit);
  const updated=changeAllocatedBalance(debt.instances,allocations,1);
  const paymentId=context.id('payment');
  context.create('payments',paymentId,paymentDocument(context,paymentId,parent,allocations,payload,snapshot));
  const applied=applyFiniteBalances(context,debt,updated);
  context.activity(parent.direction==='owedByMe'?'paymentMade':'paymentReceived',{
    obligationId:parent.obligationId,paymentId,title:parent.title,amountMinor:payload.amountMinor,currency:parent.currency,
    direction:parent.direction,partial:applied.remainingMinor>0});
  if(applied.remainingMinor===0)context.activity('obligationCompleted',{
    obligationId:parent.obligationId,paymentId,title:parent.title,amountMinor:parent.originalAmountMinor,currency:parent.currency,direction:parent.direction});
  const obligationInstanceId=allocations.length===1?allocations[0]!.instanceId:null;
  const instanceRevision=obligationInstanceId?applied.allocationRevisions.find(x=>x.instanceId===obligationInstanceId)!.instanceRevision:null;
  return {paymentId,obligationId:parent.obligationId as string,obligationInstanceId,
    obligationRevision:applied.obligationRevision,instanceRevision,allocationRevisions:applied.allocationRevisions};
}
export async function recordPayment(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'recordPayment',validatePayment,async(context,payload)=>{
    const parent=await context.read('obligations',payload.obligationId);
    return ['recurringDue','subscription'].includes(parent.type)?recordRecurringPayment(context,payload):recordFinitePayment(context,payload);
  },db);
}
export async function recordInstallmentPayment(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'recordInstallmentPayment',validateInstallmentPayment,recordFinitePayment,db);
}
