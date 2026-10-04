import {FieldValue,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeOwnerCommand} from '../shared/commands.js';
import {identifier,moneyMinor,textValue} from '../shared/validation.js';
import {calculateBalance} from './calculation.js';
import {applyBalance,paymentDocument,paymentSourceSnapshot,readDebt,validatePaymentDate,validatePaymentTerms} from './payment_service.js';
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
    const {parent,instance,balance}=await readDebt(context,identifier(original.obligationId),identifier(original.obligationInstanceId));
    if(original.currency!==parent.currency || !Array.isArray(original.allocations) || original.allocations.length!==1 || original.allocations[0].instanceId!==instance.instanceId || original.allocations[0].amountMinor!==original.amountMinor)throw new HttpsError('failed-precondition','This payment history needs recovery.');
    const restored=calculateBalance(parent.originalAmountMinor,balance.totalPaidMinor,-moneyMinor(original.amountMinor));
    const snapshot=payload.replacement ? await paymentSourceSnapshot(context,payload.replacement.paymentSourceId) : null;
    if(payload.replacement)validatePaymentDate(context,payload.replacement.paymentDate,parent);
    const updated=payload.replacement ? calculateBalance(parent.originalAmountMinor,restored.totalPaidMinor,payload.replacement.amountMinor) : restored;
    const reversalId=context.id('reversal');const correctionGroupId=context.id('correction');const replacementId=payload.replacement ? context.id('replacement') : null;
    context.create('payments',reversalId,{...original,paymentId:reversalId,entryType:'reversal',commandId:context.commandId,reversesPaymentId:payload.paymentId,correctionGroupId,correctionReason:payload.reason,eventKey:null,recordedAt:FieldValue.serverTimestamp()});
    context.create('paymentReversals',payload.paymentId,{originalPaymentId:payload.paymentId,reversalId,correctionGroupId,recordedAt:FieldValue.serverTimestamp()});
    if(payload.replacement && replacementId)context.create('payments',replacementId,{...paymentDocument(context,replacementId,parent,instance.instanceId,payload.replacement,snapshot),correctionGroupId,correctionReason:payload.reason});
    const revisions=applyBalance(context,parent,instance,updated);
    context.activity('paymentCorrected',{obligationId:parent.obligationId,paymentId:payload.paymentId,reversalId,replacementId,title:parent.title,amountMinor:original.amountMinor,currency:parent.currency,reason:payload.reason,direction:parent.direction});
    return {originalPaymentId:payload.paymentId,reversalId,replacementId,obligationId:parent.obligationId as string,obligationInstanceId:instance.instanceId as string,...revisions};
  },db);
}
