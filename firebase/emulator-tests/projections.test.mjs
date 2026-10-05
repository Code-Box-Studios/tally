import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectOwner} from '../../functions/lib/src/dashboard/projector.js';
import {enqueueProjection,claimProjectionJob,finishProjectionJob,projectionJobId,dispatchProjectionJobs} from '../../functions/lib/src/jobs/projection_jobs.js';
import {withOwner,loan,contact} from './support/session.mjs';
const now=new Date('2026-10-04T04:00:00Z');
// Interpose the real Admin transaction boundary to deterministically race a
// second real operation before publication, without changing its data/results.
async function atPublication(db,run,concurrent) {
  const original=db.runTransaction.bind(db);
  db.runTransaction=async(...args)=>{db.runTransaction=original;await concurrent();return original(...args);};
  try{return await run();}finally{db.runTransaction=original;}
}
const readSummary=async(root,currency='PHP')=>(await root.collection('summaries').doc(`dashboard-${currency}`).get()).data();

test('projector scans more than 250 inputs and writes current zero summaries after cancellation',async()=>withOwner('projection-pages',async({user,call,command,root,adminDb})=>{
  const created=await call('createObligation',command('create',loan({amountMinor:1000})));
  const baseParent=(await root.collection('obligations').doc(created.obligationId).get()).data();
  const baseInstance=(await root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data();
  let batch=adminDb.batch();let count=0;
  for(let index=0;index<260;index++) {
    const obligationId=`fixture-${String(index).padStart(3,'0')}`;const instanceId=`${obligationId}-period`;
    batch.create(root.collection('obligations').doc(obligationId),{...baseParent,obligationId,singleInstanceId:instanceId});
    batch.create(root.collection('obligationInstances').doc(instanceId),{...baseInstance,instanceId,obligationId});count+=2;
    if(count===200){await batch.commit();batch=adminDb.batch();count=0;}
  }
  if(count)await batch.commit();
  assert.equal((await projectOwner(user.uid,adminDb,now)).status,'published');
  assert.equal((await readSummary(root)).youOweMinor,261_000);
  assert.equal((await readSummary(root)).sourceRevision,1);
  assert.equal((await root.collection('summaries').get()).size,7);
  batch=adminDb.batch();count=0;
  for(const collection of ['obligations','obligationInstances'])for(const document of (await root.collection(collection).get()).docs) {
    batch.update(document.ref,collection==='obligations'?{lifecycle:'cancelled',financialStatus:'cancelled'}:{financialStatus:'cancelled',closed:true});count++;
    if(count===200){await batch.commit();batch=adminDb.batch();count=0;}
  }
  if(count)await batch.commit();await root.collection('ledgerState').doc('current').update({revision:2});
  await projectOwner(user.uid,adminDb,now);assert.equal((await readSummary(root)).youOweMinor,0);
  assert.equal((await readSummary(root)).month.outgoing.scheduledMinor,0);
}));
test('a concurrent payment or profile-zone change cannot publish an old projection',async()=>withOwner('projection-races',async({user,call,command,root,adminDb})=>{
  const created=await call('createObligation',command('create',loan({amountMinor:100_000})));
  const result=await atPublication(adminDb,()=>projectOwner(user.uid,adminDb,now),async()=>{
    await call('recordPayment',command('racing-payment',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceId,currency:'PHP',amountMinor:30_000,paymentDate:'2026-01-02',paymentSourceId:null,paymentMethod:'cash',notes:''}));
  });
  assert.equal(result.status,'stale');
  const summary=await readSummary(root);assert.ok(!summary || summary.sourceRevision!==1 || summary.youOweMinor!==100_000);
  const changed=await atPublication(adminDb,()=>projectOwner(user.uid,adminDb,now),async()=>{
    await root.update({timezone:'Pacific/Honolulu',revision:2});
  });
  assert.equal(changed.status,'stale');
  const current=await projectOwner(user.uid,adminDb,now);assert.equal(current.status,'published');
  assert.equal((await readSummary(root)).timezone,'Pacific/Honolulu');assert.equal((await readSummary(root)).financialDay,'2026-10-03');
}));
test('account locking during a scan prevents publication',async()=>withOwner('projection-locked',async({user,call,command,root,adminDb})=>{
  await call('createObligation',command('create',loan()));
  await assert.rejects(atPublication(adminDb,()=>projectOwner(user.uid,adminDb,now),async()=>{await root.update({accountStatus:'locked'});}),{code:'failed-precondition'});
  const summary=await readSummary(root);assert.ok(!summary || summary.sourceRevision!==1);
}));
test('repair rebuilds corrupted caches from immutable allocation history and preserves payments',async()=>withOwner('projection-repair',async({user,call,command,root,adminDb})=>{
  const person=await call('saveCatalog',command('person',{kind:'contact',id:null,expectedRevision:null,values:contact()}));
  const created=await call('createObligation',command('create',loan({amountMinor:100_000,contactId:person.id})));
  const paid=await call('recordPayment',command('payment',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceId,currency:'PHP',amountMinor:30_000,paymentDate:'2026-01-02',paymentSourceId:null,paymentMethod:'cash',notes:''}));
  const immutable=(await root.collection('payments').doc(paid.paymentId).get()).data();
  await root.collection('obligations').doc(created.obligationId).update({totalPaidMinor:1,remainingMinor:2});
  await root.collection('obligationInstances').doc(created.obligationInstanceId).update({totalPaidMinor:3,remainingMinor:4});
  await assert.rejects(projectOwner(user.uid,adminDb,now),{code:'failed-precondition'});
  const input=command('repair',{obligationId:created.obligationId,expectedRevision:2,reason:'Repair inconsistent cached balances'});
  const repaired=await call('repairFiniteDebt',input);assert.deepEqual(await call('repairFiniteDebt',input),repaired);
  const parent=(await root.collection('obligations').doc(created.obligationId).get()).data();assert.equal(parent.totalPaidMinor,30_000);assert.equal(parent.remainingMinor,70_000);
  assert.deepEqual((await root.collection('payments').doc(paid.paymentId).get()).data(),immutable);
  await projectOwner(user.uid,adminDb,now);assert.equal((await readSummary(root)).youOweMinor,70_000);
  const contactSummary=(await root.collection('summaries').where('kind','==','contact').get()).docs[0].data();
  assert.equal(contactSummary.contactId,person.id);assert.equal(contactSummary.currencies.PHP.youOweMinor,70_000);
}));
test('duplicate and expired job leases cannot finish another worker generation',async()=>withOwner('projection-leases',async({user,root,adminDb})=>{
  // This scenario tests leases, not historical financial dates. Real emulator
  // triggers also enqueue jobs; keep their wall-clock nextRunAt eligible.
  const leaseNow=new Date(Date.now()+30_000);
  const jobId=projectionJobId(user.uid);const jobRef=adminDb.collection('systemJobs').doc(jobId);
  await enqueueProjection(user.uid,adminDb,leaseNow,true);
  const first=await claimProjectionJob(jobId,adminDb,leaseNow);assert.ok(first);
  assert.equal(await claimProjectionJob(jobId,adminDb,leaseNow),null);
  await jobRef.update({leaseExpiresAt:new Date(leaseNow.getTime()-1)});
  const second=await claimProjectionJob(jobId,adminDb,leaseNow);assert.ok(second);assert.notEqual(second.token,first.token);
  assert.equal(await finishProjectionJob(jobId,adminDb,first.token,leaseNow,new Date(leaseNow.getTime()+60_000)),false);
  await root.collection('ledgerState').doc('current').update({revision:1});
  await enqueueProjection(user.uid,adminDb,leaseNow,true);
  assert.equal(await finishProjectionJob(jobId,adminDb,second.token,leaseNow,new Date(leaseNow.getTime()+60_000)),false);
  assert.equal((await jobRef.get()).data().status,'pending');
  await jobRef.delete();
}));
test('refresh callable only enqueues work and bounded dispatcher publishes without a financial revision',async()=>withOwner('projection-dispatch',async({user,call,command,root,adminDb})=>{
  const before=(await root.collection('ledgerState').doc('current').get()).data().revision;
  assert.deepEqual(await call('refreshDashboard',command('refresh',{})),{accepted:true});
  await assert.rejects(call('refreshDashboard',{...command('foreign-refresh',{}),expectedOwnerUid:'another-owner'}),{code:'functions/permission-denied'});
  await enqueueProjection(user.uid,adminDb,now,true);
  const result=await dispatchProjectionJobs(adminDb,now,10);assert.ok(result.processed>=1);
  assert.equal((await readSummary(root)).youOweMinor,0);assert.equal((await root.collection('ledgerState').doc('current').get()).data().revision,before);
  const job=(await adminDb.collection('systemJobs').doc(projectionJobId(user.uid)).get()).data();
  assert.equal(job.nextRunAt.toDate().toISOString(),'2026-10-04T16:00:00.000Z');
  await adminDb.collection('systemJobs').doc(projectionJobId(user.uid)).delete();
}));

test('a month boundary during publication invalidates the prior context',async()=>withOwner('projection-month-rollover',async({user,adminDb,root})=>{
  const instant=new Date('2026-10-31T15:59:59Z');
  const result=await atPublication(adminDb,()=>projectOwner(user.uid,adminDb,instant),async()=>{instant.setTime(new Date('2026-10-31T16:00:00Z').getTime());});
  assert.equal(result.status,'stale');assert.equal((await root.collection('summaries').get()).size,0);
}));
test('summary validity ends at the earliest saved-zone boundary',async()=>withOwner('projection-saved-zone',async({user,call,command,adminDb,root})=>{
  await root.update({timezone:'Pacific/Honolulu',revision:2});
  await call('createObligation',command('hawaii',loan({amountMinor:1000,dueDate:'2026-10-03'})));
  await root.update({timezone:'Asia/Manila',revision:3});
  const result=await projectOwner(user.uid,adminDb,now);
  assert.equal(result.nextRefreshAt.toISOString(),'2026-10-04T10:00:00.000Z');
  const summary=await readSummary(root);assert.equal(summary.validUntil.toDate().toISOString(),'2026-10-04T10:00:00.000Z');
  assert.equal(summary.attention.dueToday.outgoing.amountMinor,1000);assert.equal(summary.attention.overdue.outgoing.amountMinor,0);
}));
test('a projector deadline reached before transaction publication leaves no complete summary',async()=>withOwner('projection-deadline',async({user,adminDb,root})=>{
  const {mock}=await import('node:test');const start=performance.now();let elapsed=start;
  const clock=mock.method(performance,'now',()=>elapsed);
  try {
    await assert.rejects(atPublication(adminDb,()=>projectOwner(user.uid,adminDb,now),async()=>{elapsed=start+180_001;}),{code:'deadline-exceeded'});
    assert.equal((await root.collection('summaries').get()).size,0);
  }finally{clock.mock.restore();}
}));

test('repair rejects a changed expected owner before reading private records',async()=>withOwner('projection-repair-owner',async({user,command,adminDb})=>{
  const {mock}=await import('node:test');
  const {repairFiniteDebt}=await import('../../functions/lib/src/dashboard/repair.js');
  const documents=mock.method(adminDb,'doc',()=>{throw new Error('Private read attempted before the session fence');});
  try {
    await assert.rejects(repairFiniteDebt(user.uid,{...command('repair-stale',{obligationId:'any-obligation',expectedRevision:1,reason:'Repair balances'}),expectedOwnerUid:'another-owner'},adminDb),{code:'permission-denied'});
  }finally{documents.mock.restore();}
}));
