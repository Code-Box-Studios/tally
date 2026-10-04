import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withOwner,loan,source} from './support/session.mjs';
const payment=(created,amountMinor,overrides={})=>({obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceId,amountMinor,currency:'PHP',paymentDate:'2026-01-02',paymentSourceId:null,paymentMethod:'cash',notes:'',...overrides});
const effective=documents=>documents.reduce((sum,entry)=>sum+(entry.entryType==='reversal' ? -entry.amountMinor : entry.amountMinor),0);
test('partial and full payments preserve immutable history and reject invalid actions atomically',async()=>withOwner('payments',async({call,command,root})=>{
 const cash=await call('saveCatalog',command('cash',{kind:'source',id:null,expectedRevision:null,values:source()}));
 const created=await call('createObligation',command('loan',loan({paymentSourceId:cash.id})));
 const record=command('partial',payment(created,300_000,{paymentSourceId:cash.id}));
 const paid=await call('recordPayment',record);assert.deepEqual(await call('recordPayment',record),paid);
 const parent=root.collection('obligations').doc(created.obligationId);const instance=root.collection('obligationInstances').doc(created.obligationInstanceId);const firstRef=root.collection('payments').doc(paid.paymentId);const first=(await firstRef.get()).data();
 assert.equal(first.amountMinor,300_000);assert.equal(first.sourceSnapshot.name,'Cash');assert.equal(first.entryType,'payment');assert.equal(first.provenance,'manual');assert.deepEqual(first.allocations,[{instanceId:created.obligationInstanceId,amountMinor:300_000}]);
 assert.equal(first.createdAt.toMillis(),first.updatedAt.toMillis());assert.equal(first.createdAt.toMillis(),first.recordedAt.toMillis());
 assert.equal((await parent.get()).data().remainingMinor,700_000);assert.equal((await instance.get()).data().remainingMinor,700_000);
 assert.equal((await parent.get()).data().financialStatus,'partiallyPaid');
 const ledgerBefore=(await root.collection('ledgerState').doc('current').get()).data().revision;
 for(const [id,patch,code] of [
  ['overpay',{amountMinor:700_001},'functions/failed-precondition'],['wrong-currency',{currency:'USD'},'functions/invalid-argument'],
  ['future',{paymentDate:'2199-01-01'},'functions/invalid-argument'],['before-origin',{paymentDate:'2019-12-31'},'functions/invalid-argument'],
  ['unknown-source',{paymentSourceId:'another-owner-source'},'functions/failed-precondition'],['wrong-instance',{obligationInstanceId:'not-this-loan'},'functions/failed-precondition'],
 ])await assert.rejects(call('recordPayment',command(id,payment(created,100,patch))),{code});
 await assert.rejects(call('recordPayment',{...record,payload:{...record.payload,amountMinor:300_001}}),{code:'functions/already-exists'});
 await assert.rejects(call('editObligation',command('rewrite-principal',{...loan({paymentSourceId:cash.id,amountMinor:900_000}),obligationId:created.obligationId,expectedRevision:2})),{code:'functions/failed-precondition'});
 assert.equal((await root.collection('payments').get()).size,1);assert.equal((await root.collection('ledgerState').doc('current').get()).data().revision,ledgerBefore);
 await call('recordPayment',command('full',payment(created,700_000)));
 assert.equal((await parent.get()).data().totalPaidMinor,1_000_000);assert.equal((await parent.get()).data().remainingMinor,0);assert.equal((await parent.get()).data().financialStatus,'paid');assert.equal((await instance.get()).data().closed,true);
 assert.deepEqual((await firstRef.get()).data(),first);
 const entries=(await root.collection('payments').get()).docs.map(doc=>doc.data());assert.equal(effective(entries),1_000_000);
 assert.deepEqual(await call('recordPayment',record),paid);
}));
test('concurrent payments cannot overpay and incoming currencies remain independent',async()=>withOwner('race',async({call,command,root})=>{
 const created=await call('createObligation',command('loan',loan({amountMinor:500_000,direction:'owedToMe'})));
 const results=await Promise.allSettled([call('recordPayment',command('device-1',payment(created,300_000))),call('recordPayment',command('device-2',payment(created,300_000)))]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);
 assert.equal((await root.collection('payments').get()).size,1);assert.equal((await root.collection('obligations').doc(created.obligationId).get()).data().remainingMinor,200_000);
 const lent=await call('createObligation',command('incoming',loan({amountMinor:500_000,direction:'owedToMe'})));
 await call('recordPayment',command('repaid',payment(lent,200_000)));
 assert.equal((await root.collection('obligations').doc(lent.obligationId).get()).data().remainingMinor,300_000);
 const usd=await call('createObligation',command('usd',loan({currency:'USD',amountMinor:50_000})));
 await assert.rejects(call('recordPayment',command('php-on-usd',payment(usd,10_000))),{code:'functions/invalid-argument'});
 assert.equal((await root.collection('obligations').doc(usd.obligationId).get()).data().remainingMinor,50_000);
}));
test('corrections append full reversals and replacements, deduplicate and roll back invalid replacement',async()=>withOwner('corrections',async({call,command,root})=>{
 const created=await call('createObligation',command('loan',loan()));
 const original=await call('recordPayment',command('original',payment(created,300_000)));
 const firstRef=root.collection('payments').doc(original.paymentId);const immutable=(await firstRef.get()).data();
 const correction=command('correct',{paymentId:original.paymentId,reason:'Entered the wrong amount',replacement:{amountMinor:200_000,paymentDate:'2026-01-03',paymentSourceId:null,paymentMethod:'bankTransfer',notes:'Correct amount'}});
 const changed=await call('correctPayment',correction);assert.deepEqual(await call('correctPayment',correction),changed);
 assert.deepEqual((await firstRef.get()).data(),immutable);
 const reversal=(await root.collection('payments').doc(changed.reversalId).get()).data();assert.equal(reversal.entryType,'reversal');assert.equal(reversal.amountMinor,300_000);assert.equal(reversal.paymentDate,immutable.paymentDate);assert.deepEqual(reversal.allocations,immutable.allocations);
 assert.equal((await root.collection('obligations').doc(created.obligationId).get()).data().remainingMinor,800_000);
 assert.equal((await root.collection('payments').get()).size,3);
 await assert.rejects(call('correctPayment',command('again',{...correction.payload})),{code:'functions/failed-precondition'});
 const replacement=changed.replacementId;
 await assert.rejects(call('correctPayment',command('invalid-correction',{paymentId:replacement,reason:'Wrong correction',replacement:{...correction.payload.replacement,amountMinor:1_000_001}})),{code:'functions/failed-precondition'});
 assert.equal((await root.collection('payments').get()).size,3);assert.equal((await root.collection('paymentReversals').doc(replacement).get()).exists,false);
 const race=await Promise.allSettled(['undo-1','undo-2'].map(id=>call('correctPayment',command(id,{paymentId:replacement,reason:'Duplicate entry',replacement:null}))));
 assert.equal(race.filter(result=>result.status==='fulfilled').length,1);assert.equal((await root.collection('payments').get()).size,4);assert.equal((await root.collection('obligations').doc(created.obligationId).get()).data().remainingMinor,1_000_000);
 const all=(await root.collection('payments').get()).docs.map(doc=>doc.data());assert.equal(effective(all),0);
 await assert.rejects(call('editObligation',command('history-lock',{...loan({amountMinor:900_000}),obligationId:created.obligationId,expectedRevision:4})),{code:'functions/failed-precondition'});
 await call('cancelObligation',command('cancel',{obligationId:created.obligationId,expectedRevision:4,reason:'No longer active'}));
 await assert.rejects(call('recordPayment',command('cancelled-pay',payment(created,1))),{code:'functions/failed-precondition'});
}));
