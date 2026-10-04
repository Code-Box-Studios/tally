import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withOwner,loan} from './support/session.mjs';

const schedule=(amounts=[30_000,30_000,40_000])=>loan({amountMinor:amounts.reduce((s,n)=>s+n,0),dueDate:'2026-12-15',installments:amounts.map((amountMinor,index)=>({amountMinor,dueDate:index===0?'2026-10-15':index===1?'2026-11-15':'2026-12-15'}))});
const terms=(amountMinor,patch={})=>({amountMinor,paymentDate:'2026-01-02',paymentSourceId:null,paymentMethod:'cash',notes:'',...patch});
const payment=(created,amountMinor,patch={})=>({obligationId:created.obligationId,currency:'PHP',...terms(amountMinor),explicitAllocations:null,...patch});
const parentOf=(root,created)=>root.collection('obligations').doc(created.obligationId);
const periods=async(root,created)=>Promise.all(created.obligationInstanceIds.map(async id=>(await root.collection('obligationInstances').doc(id).get()).data()));

test('120 installment periods are created atomically and principal is counted once',async()=>withOwner('installments-120',async({call,command,root})=>{
  const payload=loan({amountMinor:120_000,dueDate:'2026-12-15',installments:Array.from({length:120},()=>({amountMinor:1000,dueDate:'2026-12-15'}))});
  const input=command('create',payload);const created=await call('createInstallment',input);
  assert.deepEqual(await call('createInstallment',input),created);
  assert.equal(created.obligationInstanceIds.length,120);
  const parent=(await parentOf(root,created).get()).data();
  assert.equal(parent.originalAmountMinor,120_000);assert.equal(parent.remainingMinor,120_000);assert.equal(parent.singleInstanceId,null);
  assert.equal(parent.type,'installment');assert.equal(parent.timezone,'Asia/Manila');
  const instances=await periods(root,created);assert.equal(instances.reduce((sum,x)=>sum+x.amountMinor,0),120_000);
  assert.equal(instances[0].occurrenceKey,'i:0001');assert.equal(instances[119].occurrenceKey,'i:0120');
  assert.equal((await root.collection('obligations').get()).size,1);assert.equal((await root.collection('obligationInstances').get()).size,120);
  await assert.rejects(call('createInstallment',command('bad-total',{...payload,amountMinor:119_000})),{code:'functions/invalid-argument'});
  await assert.rejects(call('createInstallment',command('foreign-contact',{...payload,contactId:'another-owner-contact'})),{code:'functions/failed-precondition'});
  assert.equal((await root.collection('obligations').get()).size,1);
}));
test('multi-period and chosen-period payments keep exact allocations and reject concurrent overpayment',async()=>withOwner('installments-pay',async({call,command,root})=>{
  const created=await call('createInstallment',command('create',schedule()));
  const input=command('pay',payment(created,45_000));const paid=await call('recordInstallmentPayment',input);
  assert.deepEqual(await call('recordInstallmentPayment',input),paid);
  const immutable=(await root.collection('payments').doc(paid.paymentId).get()).data();
  assert.equal(immutable.obligationInstanceId,null);assert.deepEqual(immutable.allocations,[{instanceId:created.obligationInstanceIds[0],amountMinor:30_000},{instanceId:created.obligationInstanceIds[1],amountMinor:15_000}]);
  assert.equal((await parentOf(root,created).get()).data().remainingMinor,55_000);
  const chosen=await call('recordPayment',command('chosen',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceIds[2],currency:'PHP',...terms(40_000)}));
  assert.equal(chosen.obligationInstanceId,created.obligationInstanceIds[2]);
  assert.equal((await periods(root,created))[2].closed,true);
  const results=await Promise.allSettled(['race-a','race-b'].map(id=>call('recordInstallmentPayment',command(id,payment(created,10_000)))));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await parentOf(root,created).get()).data().remainingMinor,5000);
  assert.deepEqual((await root.collection('payments').doc(paid.paymentId).get()).data(),immutable);
  await assert.rejects(call('recordInstallmentPayment',command('wrong-currency',payment(created,100,{currency:'USD'}))),{code:'functions/invalid-argument'});
  await call('recordInstallmentPayment',command('finish',payment(created,5000)));
  assert.equal((await parentOf(root,created).get()).data().financialStatus,'paid');
  assert.equal((await parentOf(root,created).get()).data().nextDueDate,null);
  assert.ok((await periods(root,created)).every(x=>x.remainingMinor===0 && x.closed));
}));
test('multi-period corrections restore exact periods and invalid replacements roll back',async()=>withOwner('installments-correct',async({call,command,root})=>{
  const created=await call('createInstallment',command('create',schedule()));
  const paid=await call('recordInstallmentPayment',command('pay',payment(created,50_000,{explicitAllocations:[{instanceId:created.obligationInstanceIds[0],amountMinor:10_000},{instanceId:created.obligationInstanceIds[2],amountMinor:40_000}]})));
  const original=(await root.collection('payments').doc(paid.paymentId).get()).data();
  await assert.rejects(call('correctPayment',command('invalid',{paymentId:paid.paymentId,reason:'Wrong amount',replacement:terms(100_001)})),{code:'functions/failed-precondition'});
  assert.equal((await root.collection('payments').get()).size,1);assert.equal((await root.collection('paymentReversals').get()).size,0);
  assert.equal((await parentOf(root,created).get()).data().remainingMinor,50_000);
  const undo=command('undo',{paymentId:paid.paymentId,reason:'Duplicate entry',replacement:null});const corrected=await call('correctPayment',undo);
  assert.deepEqual(await call('correctPayment',undo),corrected);
  const reversal=(await root.collection('payments').doc(corrected.reversalId).get()).data();
  assert.deepEqual(reversal.allocations,original.allocations);assert.equal(reversal.obligationInstanceId,null);
  assert.equal(corrected.obligationInstanceId,null);assert.equal(corrected.allocationRevisions.length,2);
  assert.deepEqual((await periods(root,created)).map(x=>x.totalPaidMinor),[0,0,0]);
  assert.deepEqual((await root.collection('payments').doc(paid.paymentId).get()).data(),original);
  await assert.rejects(call('correctPayment',command('again',undo.payload)),{code:'functions/failed-precondition'});
  const replacementBase=await call('recordInstallmentPayment',command('pay-again',payment(created,45_000)));
  const replacement=await call('correctPayment',command('replace',{paymentId:replacementBase.paymentId,reason:'Correct amount',replacement:terms(35_000)}));
  assert.ok(replacement.replacementId);assert.equal((await parentOf(root,created).get()).data().remainingMinor,65_000);
  assert.deepEqual((await periods(root,created)).map(x=>x.totalPaidMinor),[30_000,5000,0]);
}));
test('installment edits preserve identities, reject stale history changes and cancellation retains history',async()=>withOwner('installments-edit',async({call,command,root})=>{
  const created=await call('createInstallment',command('create',schedule()));
  const edit={...schedule([25_000,35_000,40_000]),obligationId:created.obligationId,expectedRevision:1};
  const edited=await call('editInstallment',command('edit',edit));assert.deepEqual(edited.obligationInstanceIds,created.obligationInstanceIds);
  await assert.rejects(call('editInstallment',command('stale',edit)),{code:'functions/aborted'});
  await call('recordPayment',command('paid',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceIds[0],currency:'PHP',...terms(25_000)}));
  for(const [id,patch] of [['principal',{amountMinor:101_000,installments:schedule([26_000,35_000,40_000]).installments}],['currency',{currency:'USD'}],['count',{installments:[{amountMinor:50_000,dueDate:'2026-12-15'},{amountMinor:50_000,dueDate:'2026-12-15'}]}],['paid-date',{installments:edit.installments.map((x,i)=>i===0?{...x,dueDate:'2026-10-16'}:x)}]])
    await assert.rejects(call('editInstallment',command(id,{...edit,...patch,expectedRevision:3})),{code:'functions/failed-precondition'});
  const moved={...edit,expectedRevision:3,installments:edit.installments.map((x,i)=>i===1?{...x,dueDate:'2026-11-16'}:x)};
  await call('editInstallment',command('move-unpaid',moved));
  const paymentBefore=(await root.collection('payments').get()).docs[0].data();
  await call('cancelInstallment',command('cancel',{obligationId:created.obligationId,expectedRevision:4,reason:'Agreement ended'}));
  const parent=(await parentOf(root,created).get()).data();assert.equal(parent.remainingMinor,75_000);assert.equal(parent.financialStatus,'cancelled');
  assert.ok((await periods(root,created)).every(x=>x.closed && x.financialStatus==='cancelled'));
  assert.deepEqual((await root.collection('payments').get()).docs[0].data(),paymentBefore);
  await assert.rejects(call('recordInstallmentPayment',command('after-cancel',payment(created,1))),{code:'functions/failed-precondition'});
}));
test('allocation limits and invalid explicit periods never leave partial financial writes',async()=>withOwner('installments-limits',async({call,command,root})=>{
  const created=await call('createInstallment',command('create',schedule(Array(25).fill(1000))));
  const before=(await root.collection('ledgerState').doc('current').get()).data().revision;
  for(const [id,patch,code] of [['too-many',{amountMinor:25_000},'functions/failed-precondition'],['foreign-period',{amountMinor:1000,explicitAllocations:[{instanceId:'another-owner-instance',amountMinor:1000}]},'functions/failed-precondition'],['duplicate',{amountMinor:1000,explicitAllocations:[{instanceId:created.obligationInstanceIds[0],amountMinor:500},{instanceId:created.obligationInstanceIds[0],amountMinor:500}]},'functions/invalid-argument']])
    await assert.rejects(call('recordInstallmentPayment',command(id,payment(created,1000,patch))),{code});
  assert.equal((await root.collection('payments').get()).size,0);
  assert.equal((await root.collection('ledgerState').doc('current').get()).data().revision,before);
  assert.ok((await periods(root,created)).every(x=>x.totalPaidMinor===0));
}));

test('unpaid installment amounts can be redistributed while periods with immutable history stay fixed',async()=>withOwner('installments-redistribute',async({call,command,root})=>{
  const created=await call('createInstallment',command('create',schedule()));
  const paid=await call('recordPayment',command('pay-first',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceIds[0],currency:'PHP',...terms(30_000)}));
  const changed={...schedule([30_000,20_000,50_000]),obligationId:created.obligationId,expectedRevision:2};
  await call('editInstallment',command('redistribute-unpaid',changed));
  assert.deepEqual((await periods(root,created)).map(x=>x.amountMinor),[30_000,20_000,50_000]);
  await call('correctPayment',command('reverse-first',{paymentId:paid.paymentId,reason:'Duplicate entry',replacement:null}));
  await assert.rejects(call('editInstallment',command('rewrite-reversed',{...schedule([20_000,30_000,50_000]),obligationId:created.obligationId,expectedRevision:4})),{code:'functions/failed-precondition'});
  assert.deepEqual((await periods(root,created)).map(x=>x.amountMinor),[30_000,20_000,50_000]);
}));
test('a correction preview revision rejects concurrent payments without changing immutable history',async()=>withOwner('installments-correction-preview',async({call,command,root})=>{
  const created=await call('createInstallment',command('create',schedule()));
  const paid=await call('recordInstallmentPayment',command('first-payment',payment(created,20_000)));
  const original=(await root.collection('payments').doc(paid.paymentId).get()).data();
  const previewRevision=(await parentOf(root,created).get()).data().revision;
  await call('recordInstallmentPayment',command('concurrent-payment',payment(created,10_000)));
  const before=(await parentOf(root,created).get()).data();
  const correction={paymentId:paid.paymentId,reason:'Correct amount',replacement:terms(15_000),expectedObligationRevision:previewRevision};
  await assert.rejects(call('correctPayment',command('stale-preview',correction)),{code:'functions/aborted'});
  assert.deepEqual((await parentOf(root,created).get()).data(),before);
  assert.deepEqual((await root.collection('payments').doc(paid.paymentId).get()).data(),original);
  assert.equal((await root.collection('payments').get()).size,2);
  assert.equal((await root.collection('paymentReversals').get()).size,0);
  const result=await call('correctPayment',command('current-preview',{...correction,expectedObligationRevision:before.revision}));
  assert.ok(result.replacementId);
  assert.deepEqual((await root.collection('payments').doc(paid.paymentId).get()).data(),original);
}));
