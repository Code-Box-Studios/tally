import type {DocumentData} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import type {OwnerCommandContext} from '../shared/commands.js';
import {statusForBalance} from '../shared/financial_status.js';
import {occurrenceInstanceId} from '../shared/occurrence_id.js';
import {civilDate,currencyCode,identifier,localToday,moneyMinor,nullableDate,revision} from '../shared/validation.js';
import {calculateBalance} from './calculation.js';
import type {Allocation,AllocationInstance} from './allocation.js';

export type FiniteInstance=DocumentData & AllocationInstance;
export interface FiniteDebt {parent:DocumentData;instances:FiniteInstance[]}
export function recovery():never {
  throw new HttpsError('failed-precondition','Your payment history needs recovery.',{reason:'invalidBalance'});
}

export async function readFiniteDebt(context:OwnerCommandContext,parentId:string):Promise<FiniteDebt> {
  const parent=await context.read('obligations',parentId);
  if(parent.obligationId!==parentId || parent.lifecycle!=='active' || !['owedByMe','owedToMe','installment'].includes(parent.type))
    throw new HttpsError('failed-precondition','This obligation is unavailable.');
  let ids:string[];
  try {
    currencyCode(parent.currency);moneyMinor(parent.originalAmountMinor);revision(parent.revision);
    civilDate(parent.originationDate);localToday(parent.timezone);
    if(!['owedByMe','owedToMe'].includes(parent.direction) || parent.section!==(parent.direction==='owedByMe'?'iOwe':'owedToMe'))return recovery();
    if(parent.type==='installment') {
      if(parent.singleInstanceId!==null || !Array.isArray(parent.installmentInstanceIds) || parent.installmentInstanceIds.length<2 || parent.installmentInstanceIds.length>120)return recovery();
      ids=parent.installmentInstanceIds.map(identifier);
      if(new Set(ids).size!==ids.length)return recovery();
      if(ids.some((id,index)=>id!==occurrenceInstanceId(parentId,`i:${String(index+1).padStart(4,'0')}`)))return recovery();
    } else ids=[identifier(parent.singleInstanceId)];
  } catch {return recovery();}
  const records=await Promise.all(ids.map(id=>context.read('obligationInstances',id)));
  let scheduled=0;let paid=0;let remaining=0;
  const instances=records.map((record,index):FiniteInstance=>{
    try {
      if(record.instanceId!==ids[index] || record.obligationId!==parentId || record.currency!==parent.currency || record.timezone!==parent.timezone || record.direction!==parent.direction || record.amountState!=='known' || ['cancelled','skipped'].includes(record.financialStatus))return recovery();
      if(parent.type==='installment' && record.occurrenceKey!==`i:${String(index+1).padStart(4,'0')}`)return recovery();
      moneyMinor(record.amountMinor);revision(record.revision);nullableDate(record.dueDate);
      const balance=calculateBalance(record.amountMinor,record.totalPaidMinor,0);
      if(record.remainingMinor!==balance.remainingMinor || record.closed!==(balance.remainingMinor===0))return recovery();
      scheduled+=record.amountMinor;paid+=balance.totalPaidMinor;remaining+=balance.remainingMinor;
      return {...record,instanceId:ids[index]!,dueDate:record.dueDate,remainingMinor:balance.remainingMinor,closed:record.closed};
    } catch {return recovery();}
  });
  if(scheduled!==parent.originalAmountMinor || paid!==parent.totalPaidMinor || remaining!==parent.remainingMinor)return recovery();
  return {parent,instances};
}

// Calculate the whole transition before staging any financial write. This also
// lets corrections restore original allocations before checking a replacement.
export function changeAllocatedBalance(instances:readonly FiniteInstance[],allocations:readonly Allocation[],sign:1|-1):FiniteInstance[] {
  const byId=new Map(allocations.map(allocation=>[allocation.instanceId,allocation.amountMinor]));
  if(byId.size!==allocations.length || allocations.some(a=>!instances.some(i=>i.instanceId===a.instanceId)))return recovery();
  return instances.map(instance=>{
    const amount=byId.get(instance.instanceId);if(amount===undefined)return instance;
    const balance=calculateBalance(instance.amountMinor,instance.totalPaidMinor,sign*amount);
    return {...instance,...balance,closed:balance.remainingMinor===0};
  });
}

export function finiteSummary(instances:readonly FiniteInstance[],timezone:string) {
  const totalPaidMinor=instances.reduce((sum,instance)=>sum+instance.totalPaidMinor,0);
  const remainingMinor=instances.reduce((sum,instance)=>sum+instance.remainingMinor,0);
  const dates=instances.filter(instance=>instance.remainingMinor>0 && instance.dueDate!==null).map(instance=>instance.dueDate!).sort();
  const nextDueDate=dates[0]??null;
  return {totalPaidMinor,remainingMinor,nextDueDate,financialStatus:statusForBalance(totalPaidMinor,remainingMinor,nextDueDate,localToday(timezone))};
}

export function applyFiniteBalances(context:OwnerCommandContext,debt:FiniteDebt,updated:readonly FiniteInstance[],touchedIds?:ReadonlySet<string>) {
  const obligationRevision=revision(debt.parent.revision)+1;
  const summary=finiteSummary(updated,debt.parent.timezone);
  context.update('obligations',debt.parent.obligationId,{...summary,hasPaymentHistory:true,revision:obligationRevision});
  const allocationRevisions:{instanceId:string;instanceRevision:number}[]=[];
  for(let index=0;index<updated.length;index++) {
    const instance=updated[index]!;const before=debt.instances[index]!;
    if(instance.totalPaidMinor===before.totalPaidMinor && !touchedIds?.has(instance.instanceId))continue;
    const instanceRevision=revision(before.revision)+1;
    context.update('obligationInstances',instance.instanceId,{
      totalPaidMinor:instance.totalPaidMinor,remainingMinor:instance.remainingMinor,closed:instance.closed,hasPaymentHistory:true,
      financialStatus:statusForBalance(instance.totalPaidMinor,instance.remainingMinor,instance.dueDate,localToday(instance.timezone)),revision:instanceRevision,
    });
    allocationRevisions.push({instanceId:instance.instanceId,instanceRevision});
  }
  return {obligationRevision,allocationRevisions,...summary};
}
