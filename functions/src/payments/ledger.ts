import type {DocumentData} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {civilDate,currencyCode,identifier,moneyMinor} from '../shared/validation.js';
import {validateAllocations} from './allocation.js';

export interface LedgerInput {obligations:DocumentData[];instances:DocumentData[];payments:DocumentData[]}
export interface InstanceBalance {amountMinor:number|null;totalPaidMinor:number;remainingMinor:number|null}
export interface FinancialLedger {
  parents:Map<string,DocumentData>;instances:Map<string,DocumentData>;
  balances:Map<string,InstanceBalance>;parentBalances:Map<string,{totalPaidMinor:number;remainingMinor:number}>;effectivePayments:DocumentData[];
  historyInstanceIds:Set<string>;historyParentIds:Set<string>;
}
export function invalidLedger():never {throw new HttpsError('failed-precondition','Your financial history needs recovery.',{reason:'invalidLedger'});}
export function checkedSum(values:Iterable<number>):number {
  let total=0n;
  for(const value of values) {
    if(!Number.isSafeInteger(value))return invalidLedger();
    total+=BigInt(value);
    if(total>BigInt(Number.MAX_SAFE_INTEGER) || total< -BigInt(Number.MAX_SAFE_INTEGER))return invalidLedger();
  }
  return Number(total);
}
function ownedMap(records:DocumentData[],key:string,uid:string):Map<string,DocumentData> {
  const map=new Map<string,DocumentData>();
  for(const record of records) {
    if(record.userId!==uid || record.schemaVersion!==1)return invalidLedger();
    const id=identifier(record[key]);if(map.has(id))return invalidLedger();map.set(id,record);
  }
  return map;
}
export function foldFinancialLedger(input:LedgerInput,uid:string,verifyCaches=true):FinancialLedger {
  try {
    const parents=ownedMap(input.obligations,'obligationId',uid);
    const instances=ownedMap(input.instances,'instanceId',uid);
    const payments=ownedMap(input.payments,'paymentId',uid);
    const reversed=new Set<string>();const historyInstanceIds=new Set<string>();const historyParentIds=new Set<string>();
    for(const parent of parents.values()) {
      currencyCode(parent.currency);civilDate(parent.originationDate);
      if(!['owedByMe','owedToMe','installment','recurringDue','subscription'].includes(parent.type) || !['owedByMe','owedToMe'].includes(parent.direction) || !['active','paused','ended','cancelled'].includes(parent.lifecycle))return invalidLedger();
      if(['owedByMe','owedToMe'].includes(parent.type) && parent.type!==parent.direction)return invalidLedger();
      if(!['recurringDue','subscription'].includes(parent.type) && !['active','cancelled'].includes(parent.lifecycle))return invalidLedger();
    }
    for(const instance of instances.values()) {
      const parent=parents.get(identifier(instance.obligationId));
      if(!parent || instance.currency!==parent.currency || instance.direction!==parent.direction)return invalidLedger();
      if(instance.dueDate!==null)civilDate(instance.dueDate);
      if(!['recurringDue','subscription'].includes(parent.type) && (instance.financialStatus==='skipped' || (instance.financialStatus==='cancelled')!==(parent.lifecycle==='cancelled')))return invalidLedger();
      if(instance.amountState==='known')moneyMinor(instance.amountMinor);
      else if(instance.amountState!=='unknown' || instance.amountMinor!==null)return invalidLedger();
      if(!['pending','partiallyPaid','paid','overdue','upcoming','scheduled','expected','deducted','failed','cancelled','skipped'].includes(instance.financialStatus) || typeof instance.closed!=='boolean')return invalidLedger();
    }
    for(const entry of payments.values()) {
      const parent=parents.get(identifier(entry.obligationId));
      const allocations=validateAllocations(entry.allocations);const amount=moneyMinor(entry.amountMinor);
      if(!parent || entry.currency!==parent.currency || entry.direction!==parent.direction || !['manual','assumedAutomatic','confirmedAutomatic'].includes(entry.provenance))return invalidLedger();
      civilDate(entry.paymentDate);
      if(checkedSum(allocations.map(a=>a.amountMinor))!==amount || entry.obligationInstanceId!==(allocations.length===1?allocations[0]!.instanceId:null))return invalidLedger();
      for(const allocation of allocations) {
        const instance=instances.get(allocation.instanceId);
        if(!instance || instance.obligationId!==parent.obligationId || instance.amountState!=='known')return invalidLedger();
        historyInstanceIds.add(allocation.instanceId);
      }
      historyParentIds.add(parent.obligationId);
      if(entry.entryType==='reversal') {
        const original=payments.get(identifier(entry.reversesPaymentId));
        if(!original || original.entryType!=='payment' || original.obligationId!==entry.obligationId || original.currency!==entry.currency || original.amountMinor!==entry.amountMinor || original.paymentDate!==entry.paymentDate || original.provenance!==entry.provenance || JSON.stringify(original.allocations)!==JSON.stringify(entry.allocations) || reversed.has(original.paymentId))return invalidLedger();
        reversed.add(original.paymentId);
      } else if(entry.entryType!=='payment' || entry.reversesPaymentId!==null)return invalidLedger();
    }
    const effectivePayments=[...payments.values()].filter(entry=>entry.entryType==='payment' && !reversed.has(entry.paymentId));
    const paidByInstance=new Map<string,number>();
    for(const payment of effectivePayments)for(const allocation of validateAllocations(payment.allocations))
      paidByInstance.set(allocation.instanceId,checkedSum([paidByInstance.get(allocation.instanceId)??0,allocation.amountMinor]));
    const balances=new Map<string,InstanceBalance>();
    const parentInstances=new Map<string,string[]>();
    for(const [id,instance] of instances) {
      const paid=paidByInstance.get(id)??0;
      const amount=instance.amountState==='known'?instance.amountMinor as number:null;
      if(amount!==null && paid>amount)return invalidLedger();
      const remaining=amount===null?null:amount-paid;
      const inactive=['cancelled','skipped'].includes(instance.financialStatus);
      if(instance.financialStatus==='skipped' && paid>0)return invalidLedger();
      if(verifyCaches && (instance.totalPaidMinor!==paid || instance.remainingMinor!==remaining || (!inactive && instance.closed!==(remaining===0))))return invalidLedger();
      balances.set(id,{amountMinor:amount,totalPaidMinor:paid,remainingMinor:remaining});
      const list=parentInstances.get(instance.obligationId)??[];list.push(id);parentInstances.set(instance.obligationId,list);
    }
    const parentBalances=new Map<string,{totalPaidMinor:number;remainingMinor:number}>();
    for(const parent of parents.values()) {
      const actualIds=parentInstances.get(parent.obligationId)??[];
      if(['recurringDue','subscription'].includes(parent.type)) {
        if(parent.originalAmountMinor!==null || parent.totalPaidMinor!==null || parent.remainingMinor!==null)return invalidLedger();
        continue;
      }
      moneyMinor(parent.originalAmountMinor);
      const ids=parent.type==='installment'?parent.installmentInstanceIds:[parent.singleInstanceId];
      if(!Array.isArray(ids) || (parent.type==='installment' && (ids.length<2 || ids.length>120)) || new Set(ids).size!==ids.length || actualIds.length!==ids.length || ids.some(id=>!actualIds.includes(identifier(id))))return invalidLedger();
      const values=actualIds.map(id=>balances.get(id)!);
      if(values.some(value=>value.amountMinor===null) || checkedSum(values.map(v=>v.amountMinor!))!==parent.originalAmountMinor)return invalidLedger();
      const paid=checkedSum(values.map(v=>v.totalPaidMinor));const remaining=checkedSum(values.map(v=>v.remainingMinor!));
      if(verifyCaches && (parent.totalPaidMinor!==paid || parent.remainingMinor!==remaining))return invalidLedger();
      parentBalances.set(parent.obligationId,{totalPaidMinor:paid,remainingMinor:remaining});
    }
    return {parents,instances,balances,parentBalances,effectivePayments,historyInstanceIds,historyParentIds};
  } catch(error) {
    if(error instanceof HttpsError && error.code==='failed-precondition')throw error;
    return invalidLedger();
  }
}
