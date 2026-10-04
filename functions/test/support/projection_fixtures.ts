import type {DocumentData} from 'firebase-admin/firestore';
export const owner='projection-owner';
export const audit={userId:owner,schemaVersion:1};
export const context={uid:owner,timezone:'Asia/Manila',yearMonth:'2026-10',today:'2026-10-04',now:new Date('2026-10-04T04:00:00Z')};
export function finite(id:string,amount=100_000,patch:DocumentData={}) {
  return {...audit,obligationId:id,type:patch.direction??'owedByMe',direction:'owedByMe',section:'iOwe',currency:'PHP',timezone:'Asia/Manila',originationDate:'2020-01-01',originalAmountMinor:amount,totalPaidMinor:0,remainingMinor:amount,singleInstanceId:`${id}-period`,lifecycle:'active',contactId:null,categoryId:'category',hasPaymentHistory:false,revision:1,...patch};
}
export function period(parent:DocumentData,patch:DocumentData={}) {
  return {...audit,instanceId:parent.singleInstanceId,obligationId:parent.obligationId,currency:parent.currency,direction:parent.direction,timezone:parent.timezone,amountMinor:parent.originalAmountMinor,totalPaidMinor:parent.totalPaidMinor,remainingMinor:parent.remainingMinor,amountState:'known',dueDate:'2026-10-15',financialStatus:'pending',closed:false,...patch};
}
export function payment(parent:DocumentData,amount=30_000,patch:DocumentData={}) {
  return {...audit,paymentId:`${parent.obligationId}-payment`,obligationId:parent.obligationId,obligationInstanceId:parent.singleInstanceId,currency:parent.currency,direction:parent.direction,amountMinor:amount,allocations:[{instanceId:parent.singleInstanceId,amountMinor:amount}],entryType:'payment',paymentDate:'2026-10-01',provenance:'manual',reversesPaymentId:null,...patch};
}
export function input(obligations:DocumentData[],instances:DocumentData[],payments:DocumentData[]=[],contacts:DocumentData[]=[]) {return {obligations,instances,payments,contacts};}
