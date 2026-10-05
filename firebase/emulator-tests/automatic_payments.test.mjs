import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withOwner,source} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''))throw new Error('Local emulator required.');
const {initializeApp}=require('firebase-admin/app');initializeApp({projectId:'demo-tally'});
const {Timestamp}=require('firebase-admin/firestore');
const now=new Date('2026-10-05T04:00:00Z');
const draft=(patch={})=>({title:'Netflix',description:'Subscription',notes:'',contactId:null,categoryId:'default-subscription',currency:'PHP',amountKind:'fixed',defaultAmountMinor:54900,
 paymentMode:'automatic',paymentSourceId:null,recurrence:{frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-10-04',preferredDay:4,monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-10-04',endDate:null,ruleVersion:1},reminderPolicy:{enabled:false,offsetDays:[],localTime:'09:00'},...patch});
const read=async(root,id)=>(await root.collection('obligationInstances').doc(id).get()).data();
const terms=(amountMinor,patch={})=>({amountMinor,paymentDate:'2026-10-04',paymentSourceId:null,paymentMethod:'other',notes:'',...patch});
const balance=async(root,id)=>{const i=await read(root,id);return {paid:i.totalPaidMinor,remaining:i.remainingMinor,closed:i.closed,deduction:i.deductionStatus};};
const all=async(root,name)=>(await root.collection(name).get()).docs.map(x=>x.data());
async function registeredEarlier(root,id) {
  // A controlled audit-time fixture represents a schedule registered before
  // its due instant; public callables never accept a client createdAt.
  await root.collection('obligationInstances').doc(id).update({createdAt:Timestamp.fromDate(new Date('2026-10-03T01:00:00Z'))});
}
async function runAutomatic(adminDb,user,id,instant=now) {
  const {periodJobId,claimAutomaticJob}=require('./lib/src/jobs/recurring_jobs.js');
  const jobId=periodJobId(user.uid,id,'automaticDeduction');
  const lease=await claimAutomaticJob(jobId,adminDb,instant);assert.ok(lease);
  const {processAutomatic}=require('./lib/src/recurring/automatic_service.js');
  const result=await processAutomatic(jobId,lease.token,adminDb,instant);return {result,jobId,token:lease.token};
}
test('549 automatic deduction records one immutable assumption and duplicate replay never pays twice',async()=>withOwner('auto-once',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  const event=await runAutomatic(adminDb,user,created.firstInstanceId);
  assert.deepEqual(await balance(root,created.firstInstanceId),{paid:54900,remaining:0,closed:true,deduction:'deducted'});
  assert.deepEqual(await require('./lib/src/recurring/automatic_service.js').processAutomatic(event.jobId,event.token,adminDb,now),event.result);
  const entries=await all(root,'payments');assert.equal(entries.length,1);assert.equal(entries[0].provenance,'assumedAutomatic');assert.equal(entries[0].paymentDate,'2026-10-04');
  assert.equal((await all(root,'deductionAttempts')).length,1);
}));
test('confirmation mode expects money without recording it and confirms once',async()=>withOwner('auto-confirm',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'automaticConfirmation'})));await registeredEarlier(root,created.firstInstanceId);
  await runAutomatic(adminDb,user,created.firstInstanceId);assert.equal((await all(root,'payments')).length,0);
  const instance=await read(root,created.firstInstanceId);assert.equal(instance.deductionStatus,'expected');
  const input=command('confirm',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,...terms(54900)});
  const confirmed=await call('confirmDeduction',input);assert.deepEqual(await call('confirmDeduction',input),confirmed);
  assert.equal((await all(root,'payments')).length,1);assert.equal((await all(root,'payments'))[0].provenance,'confirmedAutomatic');
}));
test('confirmation of an assumed payment adds evidence without changing or duplicating the payment',async()=>withOwner('auto-evidence',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);await runAutomatic(adminDb,user,created.firstInstanceId);
  const original=(await all(root,'payments'))[0],instance=await read(root,created.firstInstanceId);
  await call('confirmDeduction',command('confirm',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,...terms(54900)}));
  assert.deepEqual(await all(root,'payments'),[original]);assert.equal((await all(root,'paymentEvidence')).length,1);
  assert.equal((await all(root,'deductionAttempts')).find(x=>x.eventType==='confirmed').expectedAmountMinor,54900);
  const {projectOwner}=require('./lib/src/dashboard/projector.js');await projectOwner(user.uid,adminDb,now);
  const summary=(await root.collection('summaries').doc('dashboard-PHP').get()).data();
  assert.equal(summary.month.outgoing.assumedPaidMinor,0);assert.equal(summary.month.outgoing.confirmedPaidMinor,54900);
}));
test('expected failure leaves the bill outstanding and manual retry settles it',async()=>withOwner('auto-expected-fail',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'automaticConfirmation'})));await runAutomatic(adminDb,user,created.firstInstanceId);
  let instance=await read(root,created.firstInstanceId);
  await call('reportDeductionFailure',command('fail',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,reason:'Card declined'}));
  assert.equal((await all(root,'payments')).length,0);assert.equal((await read(root,created.firstInstanceId)).remainingMinor,54900);
  await call('recordPayment',command('manual',{obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(54900)}));
  instance=await read(root,created.firstInstanceId);assert.equal(instance.remainingMinor,0);assert.equal(instance.closed,true);
}));
test('assumed failure appends one reversal and the scheduled event can never re-assume it',async()=>withOwner('auto-assumed-fail',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  const event=await runAutomatic(adminDb,user,created.firstInstanceId),original=(await all(root,'payments'))[0];
  const instance=await read(root,created.firstInstanceId),input=command('fail',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,reason:'Insufficient funds'});
  const result=await call('reportDeductionFailure',input);assert.deepEqual(await call('reportDeductionFailure',input),result);
  assert.deepEqual((await root.collection('payments').doc(original.paymentId).get()).data(),original);
  const entries=await all(root,'payments');assert.equal(entries.length,2);assert.equal(entries.find(x=>x.entryType==='reversal').reversesPaymentId,original.paymentId);
  assert.equal((await read(root,created.firstInstanceId)).remainingMinor,54900);
  await require('./lib/src/recurring/automatic_service.js').processAutomatic(event.jobId,event.token,adminDb,now);
  assert.equal((await all(root,'payments')).length,2);assert.equal((await read(root,created.firstInstanceId)).deductionStatus,'failed');
}));
test('a manual partial payment leaves only the remainder eligible for automatic deduction',async()=>withOwner('auto-remainder',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  await call('recordPayment',command('partial',{obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(20000)}));
  await runAutomatic(adminDb,user,created.firstInstanceId);
  const entries=await all(root,'payments');assert.equal(entries.length,2);assert.equal(entries.find(x=>x.provenance==='assumedAutomatic').amountMinor,34900);
  assert.equal((await read(root,created.firstInstanceId)).remainingMinor,0);
}));
test('unknown and late-created bills expect a deduction rather than inventing a historical payment',async()=>withOwner('auto-variable',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({amountKind:'variable',defaultAmountMinor:55000})));await runAutomatic(adminDb,user,created.firstInstanceId);
  assert.equal((await all(root,'payments')).length,0);let instance=await read(root,created.firstInstanceId);
  await call('setRecurringAmount',command('amount',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,amountMinor:54900,reason:'Bill arrived'}));
  instance=await read(root,created.firstInstanceId);assert.equal(instance.requiresDeductionConfirmation,true);
  await call('confirmDeduction',command('confirm',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,...terms(54900)}));
  assert.equal((await all(root,'payments')).length,1);
  const late=await call('createRecurring',command('late',draft()));await runAutomatic(adminDb,user,late.firstInstanceId);
  assert.equal((await read(root,late.firstInstanceId)).deductionStatus,'expected');assert.equal((await all(root,'payments')).length,1);
}));
test('recurring corrections restore the exact period and replacements cannot pay a different month',async()=>withOwner('auto-correction',async({call,command,root})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'manual'})));
  const paid=await call('recordPayment',command('partial',{obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(20000)}));
  const original=(await root.collection('payments').doc(paid.paymentId).get()).data();
  await call('correctPayment',command('replace',{paymentId:paid.paymentId,reason:'Correct amount',replacement:terms(30000)}));
  assert.deepEqual((await root.collection('payments').doc(paid.paymentId).get()).data(),original);
  assert.equal((await read(root,created.firstInstanceId)).remainingMinor,24900);
  assert.ok((await all(root,'payments')).every(x=>x.obligationInstanceId===created.firstInstanceId));
  const instance=await read(root,created.firstInstanceId);
  await assert.rejects(call('setRecurringAmount',command('too-low',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,amountMinor:10000,reason:'Wrong'})),{code:'functions/failed-precondition'});
}));
test('automatic processing uses saved source and zone snapshots after template/profile changes',async()=>withOwner('auto-source',async({call,command,root,user,adminDb})=>{
  const saved=await call('saveCatalog',command('source',{kind:'source',id:null,expectedRevision:null,values:source({name:'Original card',type:'creditCard',lastFour:'1234'})}));
  const created=await call('createRecurring',command('create',draft({paymentSourceId:saved.id})));await registeredEarlier(root,created.firstInstanceId);
  await call('saveCatalog',command('rename',{kind:'source',id:saved.id,expectedRevision:1,values:source({name:'Renamed card',type:'creditCard',lastFour:'1234'})}));
  await root.update({timezone:'America/New_York',revision:2});await runAutomatic(adminDb,user,created.firstInstanceId);
  const paid=(await all(root,'payments'))[0];assert.equal(paid.sourceSnapshot.name,'Original card');assert.equal(paid.paymentTimezone,'Asia/Manila');
}));
test('expired leases and locked owners cannot create automatic payments',async()=>withOwner('auto-security',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  const {periodJobId,claimAutomaticJob}=require('./lib/src/jobs/recurring_jobs.js'),jobId=periodJobId(user.uid,created.firstInstanceId,'automaticDeduction');
  const lease=await claimAutomaticJob(jobId,adminDb,now),later=new Date(now.getTime()+7*60000);
  await assert.rejects(require('./lib/src/recurring/automatic_service.js').processAutomatic(jobId,lease.token,adminDb,later),{code:'aborted'});
  await root.update({accountStatus:'deleting'});
  await assert.rejects(require('./lib/src/recurring/automatic_service.js').processAutomatic(jobId,lease.token,adminDb,now),{code:'failed-precondition'});
  assert.equal((await all(root,'payments')).length,0);
}));
test('a confirmed expected deduction can subsequently fail without leaving a false paid balance',async()=>withOwner('auto-confirmed-fail',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'automaticConfirmation'})));await runAutomatic(adminDb,user,created.firstInstanceId);
  let instance=await read(root,created.firstInstanceId);
  await call('confirmDeduction',command('confirm',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,...terms(54900)}));
  instance=await read(root,created.firstInstanceId);
  await call('reportDeductionFailure',command('fail',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,reason:'Confirmation was mistaken'}));
  assert.equal((await read(root,created.firstInstanceId)).remainingMinor,54900);
  const entries=await all(root,'payments');assert.equal(entries.length,2);assert.equal(entries.filter(x=>x.entryType==='reversal').length,1);
}));
test('duplicate prompt-worker and scheduled-dispatch invocations share one persisted financial lease',async()=>withOwner('auto-dispatch',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  const {runReadyJob,dispatchReadyJobs}=require('./lib/src/jobs/dispatch.js'),{periodJobId}=require('./lib/src/jobs/recurring_jobs.js');
  const id=periodJobId(user.uid,created.firstInstanceId,'automaticDeduction');
  await Promise.all([runReadyJob(id,adminDb,now),runReadyJob(id,adminDb,now),dispatchReadyJobs(adminDb,now)]);
  assert.equal((await all(root,'payments')).length,1);assert.equal((await read(root,created.firstInstanceId)).remainingMinor,0);
  assert.equal((await adminDb.collection('systemJobs').doc(id).get()).data().status,'complete');
}));
test('a spent total dispatch budget starts no jobs and financial mutations coalesce projection work',async()=>withOwner('auto-budget',async({call,command,root,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'manual'})));
  await call('recordPayment',command('partial',{obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(20000)}));
  const result=await require('./lib/src/jobs/dispatch.js').dispatchReadyJobs(adminDb,now,25,0);
  assert.equal(result.examined,0);assert.equal(result.processed,0);
  assert.equal((await root.collection('projectionJobs').get()).size,0,'New mutations use one coalesced owner projection job');
  const {projectionJobId}=require('./lib/src/jobs/projection_jobs.js');
  const job=(await adminDb.collection('systemJobs').doc(projectionJobId(root.id)).get()).data();
  assert.equal(job.targetSourceRevision,(await root.collection('ledgerState').doc('current').get()).data().revision);
}));

test('manual and automatic payments contend on one balance and cannot overpay the period',async()=>withOwner('auto-manual-race',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  const {periodJobId}=require('./lib/src/jobs/recurring_jobs.js'),{runReadyJob}=require('./lib/src/jobs/dispatch.js');
  const id=periodJobId(user.uid,created.firstInstanceId,'automaticDeduction');
  const outcomes=await Promise.allSettled([
    call('recordPayment',command('partial',{obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(20000)})),
    runReadyJob(id,adminDb,now),
  ]);
  if(outcomes[0].status==='rejected')assert.equal(outcomes[0].reason.code,'functions/failed-precondition');
  assert.equal(outcomes[1].status,'fulfilled');await runReadyJob(id,adminDb,now);
  const entries=await all(root,'payments');assert.equal(entries.reduce((sum,p)=>sum+p.amountMinor,0),54900);
  assert.equal(entries.filter(p=>p.provenance==='assumedAutomatic').length,1);
  assert.deepEqual(await balance(root,created.firstInstanceId),{paid:54900,remaining:0,closed:true,deduction:'deducted'});
}));

test('confirmation and failure with the same period revision commit only one result',async()=>withOwner('auto-resolution-race',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'automaticConfirmation'})));await runAutomatic(adminDb,user,created.firstInstanceId);
  const instance=await read(root,created.firstInstanceId),ids={obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision};
  const results=await Promise.allSettled([
    call('confirmDeduction',command('confirm',{...ids,...terms(54900)})),
    call('reportDeductionFailure',command('fail',{...ids,reason:'Deduction did not happen'})),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'functions/aborted');
  const final=await read(root,created.firstInstanceId),payments=await all(root,'payments'),attempts=await all(root,'deductionAttempts');
  assert.equal(attempts.length,2);
  if(final.deductionStatus==='confirmed'){assert.equal(final.remainingMinor,0);assert.equal(payments.length,1);}
  else{assert.equal(final.deductionStatus,'failed');assert.equal(final.remainingMinor,54900);assert.equal(payments.length,0);}
}));

test('recurring financial commands reject a changed owner and another owner’s period',async()=>withOwner('auto-private-a',async({call,command,root})=>withOwner('auto-private-b',async other=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'manual'})));
  const foreign=await other.call('createRecurring',other.command('create',draft({paymentMode:'manual'})));
  const input={obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(20000)};
  await assert.rejects(call('recordPayment',{...command('wrong-owner',input),expectedOwnerUid:other.user.uid}),{code:'functions/permission-denied'});
  await assert.rejects(call('recordPayment',command('foreign-period',{...input,obligationInstanceId:foreign.firstInstanceId})),{code:'functions/failed-precondition'});
  assert.equal((await all(root,'payments')).length,0);assert.equal((await all(other.root,'payments')).length,0);
})));

test('completed projection retires only compatible legacy markers and preserves financial evidence',async()=>withOwner('auto-legacy-jobs',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({paymentMode:'manual'})));
  await call('recordPayment',command('partial',{obligationId:created.obligationId,obligationInstanceId:created.firstInstanceId,currency:'PHP',...terms(20000)}));
  const payments=await all(root,'payments'),receipts=await all(root,'commandReceipts');
  const markers=root.collection('projectionJobs'),value={userId:user.uid,schemaVersion:1,formulaVersion:1,status:'pending'};
  await markers.doc('revision-1').set({...value,sourceRevision:1});
  await markers.doc('revision-999').set({...value,sourceRevision:999});
  await markers.doc('revision-0').set({...value,userId:'foreign-owner',sourceRevision:0});
  const {runReadyJob}=require('./lib/src/jobs/dispatch.js'),{projectionJobId}=require('./lib/src/jobs/projection_jobs.js');
  assert.equal(await runReadyJob(projectionJobId(user.uid),adminDb,new Date(Date.now()+30000)),true);
  assert.equal((await markers.doc('revision-1').get()).exists,false);
  assert.equal((await markers.doc('revision-999').get()).exists,true);assert.equal((await markers.doc('revision-0').get()).exists,true);
  assert.deepEqual(await all(root,'payments'),payments);assert.deepEqual(await all(root,'commandReceipts'),receipts);
}));

test('a lease that expires during automatic transaction reads cannot commit money',async()=>withOwner('auto-live-clock',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await registeredEarlier(root,created.firstInstanceId);
  const {periodJobId,claimAutomaticJob}=require('./lib/src/jobs/recurring_jobs.js'),id=periodJobId(user.uid,created.firstInstanceId,'automaticDeduction');
  const lease=await claimAutomaticJob(id,adminDb,new Date());assert.ok(lease);
  const {projectionJobId}=require('./lib/src/jobs/projection_jobs.js');
  const RealDate=globalThis.Date;let clock=RealDate.now(),advancePath=`systemJobs/${id}`;
  const db=new Proxy(adminDb,{get(target,key){
    if(key==='runTransaction')return callback=>target.runTransaction(transaction=>callback(new Proxy(transaction,{get(tx,method){
      if(method==='get')return async(...args)=>{const result=await tx.get(...args);if(args[0].path===advancePath)clock+=7*60000;return result;};
      const value=tx[method];return typeof value==='function'?value.bind(tx):value;
    }})));
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  try {
    globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
    await assert.rejects(require('./lib/src/recurring/automatic_service.js').processAutomatic(id,lease.token,db),{code:'aborted'});
    clock=RealDate.now();advancePath=`systemJobs/${projectionJobId(user.uid)}`;
    await assert.rejects(require('./lib/src/recurring/automatic_service.js').processAutomatic(id,lease.token,db),{code:'aborted'});
  }finally{globalThis.Date=RealDate;}
  assert.equal((await all(root,'payments')).length,0);assert.equal((await all(root,'deductionAttempts')).length,0);
  assert.equal((await read(root,created.firstInstanceId)).remainingMinor,54900);
}));
