import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withOwner,loan} from './support/session.mjs';

const file=(targetType,targetId,patch={})=>({targetType,targetId,filename:'receipt.pdf',contentType:'application/pdf',sizeBytes:32,sha256:null,...patch});
const financial=async owner=>({
  ledger:(await owner.root.collection('ledgerState').doc('current').get()).data(),
  parents:(await owner.root.collection('obligations').get()).docs.map(d=>[d.id,d.data()]),
  instances:(await owner.root.collection('obligationInstances').get()).docs.map(d=>[d.id,d.data()]),
  payments:(await owner.root.collection('payments').get()).docs.map(d=>[d.id,d.data()]),
  jobs:(await owner.adminDb.collection('systemJobs').where('userId','==',owner.user.uid).get()).docs.filter(d=>d.data().kind==='ownerProjection').map(d=>[d.id,d.data()]),
});
test('ten concurrent private reservations enforce the limit without financial writes',async()=>withOwner('attachment-limit',async owner=>{
  const created=await owner.call('createObligation',owner.command('debt',loan()));
  const before=await financial(owner);
  const results=await Promise.all(Array.from({length:10},(_,i)=>owner.call('reserveAttachment',owner.command(`file-${i}`,file('obligation',created.obligationId)))));
  assert.equal(new Set(results.map(r=>r.attachmentId)).size,10);
  for(const result of results){assert.equal(result.revision,1);assert.equal(result.storagePath,`users/${owner.user.uid}/attachments/${result.attachmentId}/content`);assert.ok(result.expiresAt.endsWith('Z'));}
  await assert.rejects(owner.call('reserveAttachment',owner.command('eleventh',file('obligation',created.obligationId))),{code:'functions/resource-exhausted'});
  assert.equal((await owner.root.collection('attachments').get()).size,10);
  assert.equal((await owner.root.collection('commandReceipts').doc('eleventh').get()).exists,false);
  assert.deepEqual(await financial(owner),before);
  const sets=await owner.root.collection('attachmentSets').get();assert.equal(sets.size,1);assert.equal(sets.docs[0].data().activeCount,10);
}));
test('reservation replay and loaded-revision removal release one slot and preserve payments',async()=>withOwner('attachment-replay',async owner=>{
  const created=await owner.call('createObligation',owner.command('debt',loan()));
  const paid=await owner.call('recordPayment',owner.command('paid',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceId,amountMinor:1_000_000,currency:'PHP',paymentDate:'2026-01-02',paymentSourceId:null,paymentMethod:'cash',notes:''}));
  const before=await financial(owner),request=owner.command('receipt',file('payment',paid.paymentId));
  const reserved=await owner.call('reserveAttachment',request);
  assert.deepEqual(await owner.call('reserveAttachment',request),reserved);
  await assert.rejects(owner.call('reserveAttachment',{...request,payload:{...request.payload,filename:'other.pdf'}}),{code:'functions/already-exists'});
  await owner.call('reserveAttachment',owner.command('historical-period',file('instance',created.obligationInstanceId)));
  await assert.rejects(owner.call('removeAttachment',owner.command('stale',{attachmentId:reserved.attachmentId,expectedRevision:2})),{code:'functions/aborted'});
  const remove=owner.command('remove',{attachmentId:reserved.attachmentId,expectedRevision:1});
  const removed=await owner.call('removeAttachment',remove);assert.deepEqual(removed,{attachmentId:reserved.attachmentId,revision:2,state:'deleted'});
  assert.deepEqual(await owner.call('removeAttachment',remove),removed);
  await assert.rejects(owner.call('removeAttachment',owner.command('remove-again',{attachmentId:reserved.attachmentId,expectedRevision:2})),{code:'functions/failed-precondition'});
  const meta=(await owner.root.collection('attachments').doc(reserved.attachmentId).get()).data();assert.equal(meta.state,'deleted');assert.ok(meta.removedAt);assert.equal(meta.obligationId,created.obligationId);
  const sets=(await owner.root.collection('attachmentSets').get()).docs.map(d=>d.data());assert.equal(sets.find(s=>s.targetType==='payment').activeCount,0);
  assert.equal((await owner.adminDb.collection('systemJobs').where('userId','==',owner.user.uid).where('kind','==','attachmentCleanup').get()).size,1);
  assert.deepEqual(await financial(owner),before);
}));
test('missing, foreign, broken parent and inactive targets cannot reserve files',async()=>withOwner('attachment-links',async owner=>withOwner('attachment-other',async other=>{
  const created=await owner.call('createObligation',owner.command('debt',loan()));
  const foreign=await other.call('createObligation',other.command('debt',loan()));
  for(const [id,type,target] of [['missing','obligation','missing'],['foreign','obligation',foreign.obligationId],['missing-payment','payment','missing']])
    await assert.rejects(owner.call('reserveAttachment',owner.command(id,file(type,target))),{code:'functions/failed-precondition'});
  const instance=owner.root.collection('obligationInstances').doc(created.obligationInstanceId);
  await instance.update({obligationId:'missing-parent'});
  await assert.rejects(owner.call('reserveAttachment',owner.command('broken',file('instance',created.obligationInstanceId))),{code:'functions/failed-precondition'});
  await owner.root.update({accountStatus:'deleting'});
  await assert.rejects(owner.call('reserveAttachment',owner.command('inactive',file('obligation',created.obligationId))),{code:'functions/failed-precondition'});
  assert.equal((await owner.root.collection('attachments').get()).size,0);
})));
test('a corrupt attachment count fails visibly instead of admitting extra files',async()=>withOwner('attachment-count',async owner=>{
  const created=await owner.call('createObligation',owner.command('debt',loan()));
  await owner.call('reserveAttachment',owner.command('file',file('obligation',created.obligationId)));
  const lock=(await owner.root.collection('attachmentSets').get()).docs[0];await lock.ref.update({activeCount:0});
  await assert.rejects(owner.call('reserveAttachment',owner.command('second',file('obligation',created.obligationId))),{code:'functions/failed-precondition'});
  assert.equal((await owner.root.collection('attachments').get()).size,1);
}));
