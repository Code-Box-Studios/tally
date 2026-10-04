import type {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {statusForBalance} from '../shared/financial_status.js';
import {executeOwnerCommand,type OwnerCommandContext} from '../shared/commands.js';
import {civilDate,currencyCode,enumValue,identifier,invalid,localToday,moneyMinor,nullableDate,nullableId,revision,textValue,type Currency} from '../shared/validation.js';
export interface ObligationInput {
  title:string;description:string;notes:string;direction:'owedByMe'|'owedToMe';currency:Currency;amountMinor:number;
  originationDate:string;dueDate:string|null;contactId:string|null;categoryId:string;paymentSourceId:string|null;
  interestInfo:{rateBasisPoints:number;basis:string;agreementNotes:string}|null;
}
const fields=['title','description','notes','direction','currency','amountMinor','originationDate','dueDate','contactId','categoryId','paymentSourceId','interestInfo'] as const;
export function validateObligationCreation(input:unknown):ObligationInput {
  const raw=exactObject(input,fields);const originationDate=civilDate(raw.originationDate);const dueDate=nullableDate(raw.dueDate);
  if(dueDate!==null && dueDate<originationDate)return invalid('Due date must be on or after the borrowed or lent date.');
  let interestInfo:ObligationInput['interestInfo']=null;
  if(raw.interestInfo!==null){
    const info=exactObject(raw.interestInfo,['rateBasisPoints','basis','agreementNotes']);
    if(typeof info.rateBasisPoints!=='number' || !Number.isSafeInteger(info.rateBasisPoints) || info.rateBasisPoints<0 || info.rateBasisPoints>100_000)return invalid('Enter valid informational interest terms.');
    interestInfo={rateBasisPoints:info.rateBasisPoints,basis:textValue(info.basis,80,true),agreementNotes:textValue(info.agreementNotes,2000)};
  }
  return {title:textValue(raw.title,120,true),description:textValue(raw.description,1000),notes:textValue(raw.notes,4000),direction:enumValue(raw.direction,['owedByMe','owedToMe']),currency:currencyCode(raw.currency),amountMinor:moneyMinor(raw.amountMinor),originationDate,dueDate,contactId:nullableId(raw.contactId),categoryId:identifier(raw.categoryId),paymentSourceId:nullableId(raw.paymentSourceId),interestInfo};
}
async function references(context:OwnerCommandContext,payload:ObligationInput,existing?:{contactId:string|null;categoryId:string;paymentSourceId:string|null}){
  const [contact,category,source]=await Promise.all([
    payload.contactId ? context.read('contacts',payload.contactId) : null,
    context.read('categories',payload.categoryId),
    payload.paymentSourceId ? context.read('paymentSources',payload.paymentSourceId) : null,
  ]);
  if((contact?.archived && existing?.contactId!==payload.contactId) ||
      (!category.active && existing?.categoryId!==payload.categoryId) ||
      (source && !source.active && existing?.paymentSourceId!==payload.paymentSourceId))throw new HttpsError('failed-precondition','Choose active people, categories and payment sources.');
  return {
    contactSnapshot:contact ? {displayName:contact.displayName,kind:contact.kind} : null,
    categorySnapshot:{name:category.name},
    sourceSnapshot:source ? {name:source.name,type:source.type,lastFour:source.lastFour} : null,
  };
}
function terms(payload:ObligationInput,snapshots:Awaited<ReturnType<typeof references>>){
  const {amountMinor,...rest}=payload;
  return {...rest,...snapshots,type:payload.direction,section:payload.direction==='owedByMe' ? 'iOwe' : 'owedToMe',originalAmountMinor:amountMinor,paymentMode:'manual',amountKind:'fixed',defaultAmountMinor:null,recurrence:null};
}
export async function createObligation(uid:string,input:unknown,db:Firestore){
  return executeOwnerCommand(uid,input,'createObligation',validateObligationCreation,async(context,payload)=>{
    if(payload.originationDate>localToday(context.profile.timezone))return invalid('Borrowed or lent date cannot be in the future.');
    const snapshots=await references(context,payload);
    const obligationId=context.id('obligation');const obligationInstanceId=context.id('instance');
    const section=payload.direction==='owedByMe' ? 'iOwe' : 'owedToMe';
    const financialStatus=statusForBalance(0,payload.amountMinor,payload.dueDate,localToday(context.profile.timezone));
    context.create('obligations',obligationId,{...terms(payload,snapshots),obligationId,singleInstanceId:obligationInstanceId,totalPaidMinor:0,remainingMinor:payload.amountMinor,nextDueDate:payload.dueDate,lifecycle:'active',financialStatus,archived:false,hasPaymentHistory:false,revision:1,reminderPolicy:{enabled:true,offsetDays:[3,0],localTime:'09:00',preferenceRevision:1}});
    context.create('obligationInstances',obligationInstanceId,{instanceId:obligationInstanceId,obligationId,occurrenceKey:'one-time',occurrenceDate:payload.originationDate,periodLabel:'One-time',yearMonth:payload.dueDate?.slice(0,7) ?? null,dueDate:payload.dueDate,deductionDate:null,timezone:context.profile.timezone,direction:payload.direction,section,contactId:payload.contactId,categoryId:payload.categoryId,currency:payload.currency,amountMinor:payload.amountMinor,amountState:'known',financialStatus,deductionStatus:null,paymentMode:'manual',paymentSourceId:payload.paymentSourceId,snapshot:{title:payload.title,...snapshots},templateRevision:1,totalPaidMinor:0,remainingMinor:payload.amountMinor,closed:false,lastDeductionAttemptId:null,revision:1});
    context.activity('obligationCreated',{obligationId,title:payload.title,amountMinor:payload.amountMinor,currency:payload.currency,direction:payload.direction});
    return {obligationId,obligationInstanceId,obligationRevision:1,instanceRevision:1};
  },db);
}
export function validateObligationEdit(input:unknown){
  const raw=exactObject(input,['obligationId','expectedRevision',...fields]);
  const {obligationId,expectedRevision,...body}=raw;
  return {obligationId:identifier(obligationId),expectedRevision:revision(expectedRevision),...validateObligationCreation(body)};
}
export async function editObligation(uid:string,input:unknown,db:Firestore){
  return executeOwnerCommand(uid,input,'editObligation',validateObligationEdit,async(context,payload)=>{
    const parent=await context.read('obligations',payload.obligationId);
    if(parent.revision!==payload.expectedRevision)throw new HttpsError('aborted','This obligation changed. Refresh and try again.');
    if(parent.lifecycle!=='active' || !['owedByMe','owedToMe'].includes(parent.type))throw new HttpsError('failed-precondition','This obligation cannot be edited.');
    const instance=await context.read('obligationInstances',identifier(parent.singleInstanceId));
    if(parent.hasPaymentHistory && (parent.originalAmountMinor!==payload.amountMinor || parent.currency!==payload.currency || parent.direction!==payload.direction || parent.originationDate!==payload.originationDate || parent.contactId!==payload.contactId))throw new HttpsError('failed-precondition','Paid history keeps its original amount, currency and person.');
    if(instance.closed && instance.dueDate!==payload.dueDate)throw new HttpsError('failed-precondition','A completed due date keeps its history.');
    if(payload.originationDate>localToday(context.profile.timezone))return invalid('Borrowed or lent date cannot be in the future.');
    const snapshots=await references(context,payload,{contactId:parent.contactId,categoryId:parent.categoryId,paymentSourceId:parent.paymentSourceId});
    const parentRevision=revision(parent.revision)+1;const instanceRevision=revision(instance.revision)+1;
    const remaining=payload.amountMinor-parent.totalPaidMinor;
    const financialStatus=statusForBalance(parent.totalPaidMinor,remaining,payload.dueDate,localToday(instance.timezone));
    context.update('obligations',payload.obligationId,{...terms(payload,snapshots),remainingMinor:remaining,financialStatus,nextDueDate:instance.closed ? null : payload.dueDate,revision:parentRevision});
    context.update('obligationInstances',parent.singleInstanceId,{amountMinor:payload.amountMinor,remainingMinor:remaining,financialStatus,dueDate:payload.dueDate,yearMonth:payload.dueDate?.slice(0,7) ?? null,direction:payload.direction,section:payload.direction==='owedByMe' ? 'iOwe' : 'owedToMe',currency:payload.currency,contactId:payload.contactId,categoryId:payload.categoryId,paymentSourceId:payload.paymentSourceId,revision:instanceRevision});
    context.activity('obligationChanged',{obligationId:payload.obligationId,title:payload.title,amountMinor:payload.amountMinor,currency:payload.currency,dueDate:payload.dueDate});
    return {obligationId:payload.obligationId,obligationInstanceId:parent.singleInstanceId as string,obligationRevision:parentRevision,instanceRevision};
  },db);
}
function validateCancellation(input:unknown){const raw=exactObject(input,['obligationId','expectedRevision','reason']);return {obligationId:identifier(raw.obligationId),expectedRevision:revision(raw.expectedRevision),reason:textValue(raw.reason,1000,true)};}
export async function cancelObligation(uid:string,input:unknown,db:Firestore){
  return executeOwnerCommand(uid,input,'cancelObligation',validateCancellation,async(context,payload)=>{
    const parent=await context.read('obligations',payload.obligationId);
    if(parent.revision!==payload.expectedRevision)throw new HttpsError('aborted','This obligation changed. Refresh and try again.');
    if(parent.lifecycle!=='active' || !['owedByMe','owedToMe'].includes(parent.type))throw new HttpsError('failed-precondition','This obligation cannot be cancelled.');
    const instance=await context.read('obligationInstances',identifier(parent.singleInstanceId));
    const parentRevision=revision(parent.revision)+1;const instanceRevision=revision(instance.revision)+1;
    context.update('obligations',payload.obligationId,{lifecycle:'cancelled',financialStatus:'cancelled',nextDueDate:null,revision:parentRevision});
    context.update('obligationInstances',parent.singleInstanceId,{closed:true,financialStatus:'cancelled',revision:instanceRevision});
    context.activity('obligationCancelled',{obligationId:payload.obligationId,title:parent.title,amountMinor:parent.remainingMinor,currency:parent.currency,reason:payload.reason});
    return {obligationId:payload.obligationId,obligationInstanceId:parent.singleInstanceId as string,obligationRevision:parentRevision,instanceRevision};
  },db);
}
