import {FieldValue,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeOwnerCommand} from '../shared/commands.js';
import {identifier,moneyMinor,textValue} from '../shared/validation.js';
import {allocatePayment,validateAllocations} from './allocation.js';
import {applyFiniteBalances,changeAllocatedBalance,readFiniteDebt,recovery} from './finite_debt.js';
import {paymentDocument,paymentSourceSnapshot,validatePaymentDate,validatePaymentTerms} from './payment_service.js';
export function validateCorrection(input:unknown){
  const raw=exactObject(input,['paymentId','reason','replacement']);
  return {paymentId:identifier(raw.paymentId),reason:textValue(raw.reason,1000,true),replacement:raw.replacement===null ? null : validatePaymentTerms(raw.replacement)};
}
export async function correctPayment(uid:string,input:unknown,db:Firestore){
  return executeOwnerCommand(uid,input,'correctPayment',validateCorrection,async(context,payload)=>{
    const original=await context.read('payments',payload.paymentId);
    if(original.paymentId!==payload.paymentId || original.entryType!=='payment')throw new HttpsError('failed-precondition','Only an original payment can be corrected.');
    const marker=await context.maybeRead('paymentReversals',payload.paymentId);
    if(marker)throw new HttpsError('failed-precondition','This payment has already been corrected.');
    const debt=await readFiniteDebt(context,identifier(original.obligationId));const parent=debt.parent;
    let originalAllocations;
    try {
      originalAllocations=validateAllocations(original.allocations);
      if(original.currency!==parent.currency || originalAllocations.reduce((sum,a)=>sum+a.amountMinor,0)!==moneyMinor(original.amountMinor) ||
        original.obligationInstanceId!==(originalAllocations.length===1?originalAllocations[0]!.instanceId:null))return recovery();
    } catch {return recovery();}
    const restored=changeAllocatedBalance(debt.instances,originalAllocations,-1);
    const snapshot=payload.replacement?await paymentSourceSnapshot(context,payload.replacement.paymentSourceId):null;
    if(payload.replacement)validatePaymentDate(context,payload.replacement.paymentDate,parent);
    const replacementAllocations=payload.replacement?allocatePayment(payload.replacement.amountMinor,restored):[];
    const updated=payload.replacement?changeAllocatedBalance(restored,replacementAllocations,1):restored;
    const reversalId=context.id('reversal');const correctionGroupId=context.id('correction');const replacementId=payload.replacement ? context.id('replacement') : null;
    context.create('payments',reversalId,{...original,paymentId:reversalId,entryType:'reversal',commandId:context.commandId,reversesPaymentId:payload.paymentId,correctionGroupId,correctionReason:payload.reason,eventKey:null,recordedAt:FieldValue.serverTimestamp()});
    context.create('paymentReversals',payload.paymentId,{originalPaymentId:payload.paymentId,reversalId,correctionGroupId,recordedAt:FieldValue.serverTimestamp()});
    if(payload.replacement && replacementId)context.create('payments',replacementId,{...paymentDocument(context,replacementId,parent,replacementAllocations,payload.replacement,snapshot),correctionGroupId,correctionReason:payload.reason});
    const revisions=applyFiniteBalances(context,debt,updated,new Set([...originalAllocations,...replacementAllocations].map(a=>a.instanceId)));
    const obligationInstanceId=originalAllocations.length===1?originalAllocations[0]!.instanceId:null;
    const instanceRevision=obligationInstanceId?revisions.allocationRevisions.find(a=>a.instanceId===obligationInstanceId)!.instanceRevision:null;
    context.activity('paymentCorrected',{obligationId:parent.obligationId,paymentId:payload.paymentId,reversalId,replacementId,title:parent.title,amountMinor:original.amountMinor,currency:parent.currency,reason:payload.reason,direction:parent.direction});
    return {originalPaymentId:payload.paymentId,reversalId,replacementId,obligationId:parent.obligationId as string,obligationInstanceId,obligationRevision:revisions.obligationRevision,instanceRevision,allocationRevisions:revisions.allocationRevisions};
  },db);
}
