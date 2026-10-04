import type {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeOwnerCommand} from '../shared/commands.js';
import {statusForBalance} from '../shared/financial_status.js';
import {identifier,localToday,revision,textValue} from '../shared/validation.js';
import {foldFinancialLedger,invalidLedger} from '../payments/ledger.js';
import {finiteSummary,type FiniteInstance} from '../payments/finite_debt.js';
import {projectionLedger,projectionProfile,scanOwnerCollection} from './projector.js';

function validateRepair(input:unknown) {
  const raw=exactObject(input,['obligationId','expectedRevision','reason']);
  return {obligationId:identifier(raw.obligationId),expectedRevision:revision(raw.expectedRevision),reason:textValue(raw.reason,1000,true)};
}
function instanceIds(parent:Record<string,unknown>):string[] {
  if(!['owedByMe','owedToMe','installment'].includes(parent.type as string))
    throw new HttpsError('failed-precondition','Only a finite obligation can be repaired here.');
  const raw=parent.type==='installment'?parent.installmentInstanceIds:[parent.singleInstanceId];
  if(!Array.isArray(raw) || raw.length<1 || raw.length>120 || (parent.type==='installment' && raw.length<2))return invalidLedger();
  const ids=raw.map(identifier);if(new Set(ids).size!==ids.length)return invalidLedger();return ids;
}
export async function repairFiniteDebt(uid:string,input:unknown,db:Firestore) {
  // Collect immutable entries outside the write transaction, then bind the scan
  // to its unchanged financial revision inside the owner command transaction.
  const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']);
  identifier(envelope.commandId);
  if(identifier(envelope.expectedOwnerUid)!==uid)throw new HttpsError('permission-denied','Your sign-in changed. Please try again.');
  const payload=validateRepair(envelope.payload);
  const root=db.doc(`users/${identifier(uid)}`);
  const [profileDoc,ledgerDoc,parentDoc]=await Promise.all([root.get(),root.collection('ledgerState').doc('current').get(),root.collection('obligations').doc(payload.obligationId).get()]);
  projectionProfile(uid,profileDoc.data());const ledger=projectionLedger(uid,ledgerDoc.data());
  const initial=parentDoc.data();if(!initial || initial.userId!==uid || initial.schemaVersion!==1)return invalidLedger();
  const ids=instanceIds(initial);
  const payments=(await scanOwnerCollection(root,'payments',performance.now()+180_000)).filter(entry=>entry.obligationId===payload.obligationId);
  return executeOwnerCommand(uid,input,'repairFiniteDebt',validateRepair,async(context,validated)=>{
    const [parent,source]=await Promise.all([context.read('obligations',validated.obligationId),context.read('ledgerState','current')]);
    if(parent.revision!==validated.expectedRevision || source.revision!==ledger.revision || JSON.stringify(instanceIds(parent))!==JSON.stringify(ids))
      throw new HttpsError('aborted','Financial records changed. Refresh and try again.');
    const instances=await Promise.all(ids.map(id=>context.read('obligationInstances',id)));
    const folded=foldFinancialLedger({obligations:[parent],instances,payments},uid,false);
    const today=localToday(parent.timezone);
    const rebuilt=instances.map((instance):FiniteInstance=>{
      const balance=folded.balances.get(identifier(instance.instanceId))!;
      if(!balance || balance.amountMinor===null || balance.remainingMinor===null)return invalidLedger();
      return {...instance,...balance,instanceId:instance.instanceId,dueDate:instance.dueDate,
        remainingMinor:balance.remainingMinor,closed:parent.lifecycle==='cancelled'||balance.remainingMinor===0,
        financialStatus:parent.lifecycle==='cancelled'?'cancelled':statusForBalance(balance.totalPaidMinor,balance.remainingMinor,instance.dueDate,today),
        hasPaymentHistory:folded.historyInstanceIds.has(instance.instanceId),revision:revision(instance.revision)+1};
    });
    const obligationRevision=revision(parent.revision)+1;
    const summary=finiteSummary(rebuilt,parent.timezone);
    context.update('obligations',validated.obligationId,{...summary,
      ...(parent.lifecycle==='cancelled'?{financialStatus:'cancelled',nextDueDate:null}:{}),
      hasPaymentHistory:folded.historyParentIds.has(validated.obligationId),revision:obligationRevision});
    for(const instance of rebuilt)context.update('obligationInstances',instance.instanceId,{
      totalPaidMinor:instance.totalPaidMinor,remainingMinor:instance.remainingMinor,closed:instance.closed,financialStatus:instance.financialStatus,
      hasPaymentHistory:instance.hasPaymentHistory,revision:instance.revision});
    context.activity('aggregateRepaired',{obligationId:validated.obligationId,title:parent.title,currency:parent.currency,reason:validated.reason});
    return {obligationId:validated.obligationId,obligationRevision,instanceRevisions:rebuilt.map(instance=>({instanceId:instance.instanceId,instanceRevision:instance.revision as number}))};
  },db);
}
