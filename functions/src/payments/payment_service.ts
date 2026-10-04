import {FieldValue,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeOwnerCommand,type OwnerCommandContext} from '../shared/commands.js';
import {civilDate,currencyCode,enumValue,identifier,invalid,localToday,moneyMinor,nullableId,revision,textValue,type Currency} from '../shared/validation.js';
import {statusForBalance} from '../shared/financial_status.js';
import {calculateBalance,type Balance} from './calculation.js';
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
export async function readDebt(context:OwnerCommandContext,obligationId:string,instanceId:string) {
  const [parent,instance]=await Promise.all([context.read('obligations',obligationId),context.read('obligationInstances',instanceId)]);
  if(parent.obligationId!==obligationId || instance.instanceId!==instanceId || instance.obligationId!==obligationId || parent.singleInstanceId!==instanceId || parent.lifecycle!=='active' || !['owedByMe','owedToMe'].includes(parent.type) || instance.amountState!=='known' || ['cancelled','skipped'].includes(instance.financialStatus))throw new HttpsError('failed-precondition','This obligation or billing period is unavailable.');
  let balance:Balance;
  try {balance=calculateBalance(parent.originalAmountMinor,parent.totalPaidMinor,0);}
  catch {throw new HttpsError('failed-precondition','Your payment history needs recovery.',{reason:'invalidBalance'});}
  if(parent.remainingMinor!==balance.remainingMinor || instance.amountMinor!==parent.originalAmountMinor || instance.totalPaidMinor!==balance.totalPaidMinor || instance.remainingMinor!==balance.remainingMinor || instance.currency!==parent.currency)throw new HttpsError('failed-precondition','Your payment history needs recovery.',{reason:'invalidBalance'});
  return {parent,instance,balance};
}
export function validatePaymentDate(context:OwnerCommandContext,date:string,parent:DocumentData):void {
  if(date<parent.originationDate || date>localToday(context.profile.timezone))return invalid('Payment date must be between the borrowed or lent date and today.');
}
export async function paymentSourceSnapshot(context:OwnerCommandContext,id:string|null):Promise<DocumentData|null> {
  if(!id)return null;const source=await context.read('paymentSources',id);
  if(!source.active)throw new HttpsError('failed-precondition','Choose an active payment source.');
  return {name:source.name,type:source.type,lastFour:source.lastFour};
}
export function paymentDocument(context:OwnerCommandContext,id:string,parent:DocumentData,instanceId:string,terms:PaymentTerms,snapshot:DocumentData|null):DocumentData {
  return {paymentId:id,obligationId:parent.obligationId,obligationInstanceId:instanceId,
    allocations:[{instanceId,amountMinor:terms.amountMinor}],entryType:'payment',amountMinor:terms.amountMinor,currency:parent.currency,
    paymentDate:terms.paymentDate,paymentTimezone:context.profile.timezone,paidAt:null,
    paymentSourceId:terms.paymentSourceId,sourceSnapshot:snapshot,paymentMethod:terms.paymentMethod,provenance:'manual',
    direction:parent.direction,contactId:parent.contactId,categoryId:parent.categoryId,notes:terms.notes,receiptAttachmentId:null,
    commandId:context.commandId,eventKey:null,reversesPaymentId:null,correctionGroupId:null,correctionReason:null,
    recordedAt:FieldValue.serverTimestamp()};
}
export function applyBalance(context:OwnerCommandContext,parent:DocumentData,instance:DocumentData,balance:Balance) {
  const status=statusForBalance(balance.totalPaidMinor,balance.remainingMinor,instance.dueDate,localToday(instance.timezone));
  const obligationRevision=revision(parent.revision)+1;const instanceRevision=revision(instance.revision)+1;
  context.update('obligations',parent.obligationId,{...balance,financialStatus:status,hasPaymentHistory:true,nextDueDate:balance.remainingMinor===0 ? null : instance.dueDate,revision:obligationRevision});
  context.update('obligationInstances',instance.instanceId,{...balance,financialStatus:status,closed:balance.remainingMinor===0,revision:instanceRevision});
  return {obligationRevision,instanceRevision};
}
export async function recordPayment(uid:string,input:unknown,db:Firestore) {
  return executeOwnerCommand(uid,input,'recordPayment',validatePayment,async(context,payload)=>{
    const {parent,instance,balance}=await readDebt(context,payload.obligationId,payload.obligationInstanceId);
    if(payload.currency!==parent.currency)return invalid('Payment currency must match the obligation.');
    validatePaymentDate(context,payload.paymentDate,parent);
    const snapshot=await paymentSourceSnapshot(context,payload.paymentSourceId);
    const updated=calculateBalance(parent.originalAmountMinor,balance.totalPaidMinor,payload.amountMinor);
    const paymentId=context.id('payment');
    context.create('payments',paymentId,paymentDocument(context,paymentId,parent,instance.instanceId,payload,snapshot));
    const revisions=applyBalance(context,parent,instance,updated);
    context.activity(parent.direction==='owedByMe' ? 'paymentMade' : 'paymentReceived',{obligationId:parent.obligationId,paymentId,title:parent.title,amountMinor:payload.amountMinor,currency:parent.currency,direction:parent.direction,partial:updated.remainingMinor>0});
    if(updated.remainingMinor===0)context.activity('obligationCompleted',{obligationId:parent.obligationId,paymentId,title:parent.title,amountMinor:parent.originalAmountMinor,currency:parent.currency,direction:parent.direction});
    return {paymentId,obligationId:parent.obligationId as string,obligationInstanceId:instance.instanceId as string,...revisions};
  },db);
}
