import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withOwner} from './support/session.mjs';

const require=createRequire(new URL('../../functions/package.json',import.meta.url));
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''))throw new Error('Local Firestore emulator required.');
const {initializeApp:initializeAdmin}=require('firebase-admin/app');
initializeAdmin({projectId:'demo-tally'});
const now=new Date('2026-10-20T12:00:00.000Z');
const rule=(patch={})=>({frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-11-01',preferredDay:1,monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-11-01',endDate:null,ruleVersion:1,...patch});
const draft=(patch={})=>({title:'Internet',description:'Home connection',notes:'',contactId:null,categoryId:'default-utilities',currency:'PHP',amountKind:'fixed',defaultAmountMinor:169900,paymentMode:'manual',paymentSourceId:null,recurrence:rule(),reminderPolicy:{enabled:true,offsetDays:[3,0],localTime:'09:00'},...patch});
const parent=async(root,id)=>(await root.collection('obligations').doc(id).get()).data();
const instances=async(root,id)=>(await root.collection('obligationInstances').where('obligationId','==',id).orderBy('occurrenceDate').get()).docs.map(doc=>doc.data());
const jobs=()=>require('./lib/src/jobs/recurring_jobs.js');
const generation=()=>require('./lib/src/recurring/generation.js');
async function batch(adminDb,userId,id,instant=now) {
  const jobId=jobs().recurringJobId(userId,id);
  const lease=await jobs().claimRecurringJob(jobId,adminDb,instant);
  assert.ok(lease,'A due generation job can be claimed');
  return generation().generateRecurringBatch(jobId,lease.token,adminDb,instant);
}

test('creation and duplicate generation retain deterministic period identity and immutable fees',async()=>withOwner('recurring-fixed',async({call,command,root,user,adminDb})=>{
  const input=command('create',draft());const created=await call('createRecurring',input);
  assert.deepEqual(await call('createRecurring',input),created);
  let rows=await instances(root,created.obligationId);assert.equal(rows.length,1);assert.equal(rows[0].amountMinor,169900);
  const original=rows[0];const template=await parent(root,created.obligationId);
  assert.equal(template.originalAmountMinor,null);assert.equal(template.totalPaidMinor,null);assert.equal(template.remainingMinor,null);
  const jobId=jobs().recurringJobId(user.uid,created.obligationId);
  const claims=await Promise.all([jobs().claimRecurringJob(jobId,adminDb,now),jobs().claimRecurringJob(jobId,adminDb,now)]);
  assert.equal(claims.filter(Boolean).length,1);
  const lease=claims.find(Boolean);const generated=await generation().generateRecurringBatch(jobId,lease.token,adminDb,now);
  assert.equal(generated.created,2);
  assert.deepEqual(await generation().generateRecurringBatch(jobId,lease.token,adminDb,now),generated);
  rows=await instances(root,created.obligationId);assert.deepEqual(rows.map(x=>x.occurrenceDate),['2026-11-01','2026-12-01','2027-01-01']);
  assert.deepEqual(rows[0],original);
  const before=rows;const current=await parent(root,created.obligationId);
  await call('editRecurring',command('fee',{...draft(),defaultAmountMinor:189900,obligationId:created.obligationId,expectedRevision:current.revision}));
  await batch(adminDb,user.uid,created.obligationId,new Date('2027-03-01T12:00:00Z'));
  rows=await instances(root,created.obligationId);assert.deepEqual(rows.slice(0,3),before);assert.ok(rows.slice(3).every(x=>x.amountMinor===189900));
  assert.equal((await root.collection('payments').get()).size,0);
}));
test('variable periods remain unknown and amount changes affect only a chosen period',async()=>withOwner('recurring-variable',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({title:'Electricity',amountKind:'variable',defaultAmountMinor:350000,paymentMode:'automatic',recurrence:rule({anchorDate:'2026-09-01',startDate:'2026-09-01'})})));
  await batch(adminDb,user.uid,created.obligationId);
  let rows=await instances(root,created.obligationId);
  assert.ok(rows.every(x=>x.amountMinor===null && x.remainingMinor===null && x.totalPaidMinor===0 && !x.closed && x.amountState==='unknown'));
  for(const [index,amountMinor] of [[0,325000],[1,381000],[2,346000]]) {
    const instance=rows[index];
    await call('setRecurringAmount',command(`amount-${index}`,{obligationId:created.obligationId,instanceId:instance.instanceId,expectedRevision:instance.revision,amountMinor,reason:'Billing statement'}));
  }
  rows=await instances(root,created.obligationId);
  assert.deepEqual(rows.slice(0,3).map(x=>x.amountMinor),[325000,381000,346000]);
  assert.equal(rows[0].requiresDeductionConfirmation,true);
  assert.equal((await root.collection('payments').get()).size,0);
  const before=rows[0];
  await assert.rejects(call('setRecurringAmount',command('stale',{obligationId:created.obligationId,instanceId:before.instanceId,expectedRevision:1,amountMinor:99,reason:'Wrong'})),{code:'functions/aborted'});
  assert.deepEqual((await instances(root,created.obligationId))[0],before);
}));
test('pause excludes newly generated November dates and resume preserves the original weekly anchor',async()=>withOwner('recurring-pause',async({call,command,root,user,adminDb})=>{
  const weekly=rule({frequency:'weekly',unit:'weeks',interval:1,preferredDay:null,anchorDate:'2026-10-15',startDate:'2026-10-15'});
  const created=await call('createRecurring',command('create',draft({recurrence:weekly})));
  await call('changeRecurringLifecycle',command('pause',{obligationId:created.obligationId,expectedRevision:1,action:'pause',effectiveDate:'2026-11-01'}));
  await batch(adminDb,user.uid,created.obligationId,new Date('2026-12-15T12:00:00Z'));
  assert.deepEqual((await instances(root,created.obligationId)).map(x=>x.occurrenceDate),['2026-10-15','2026-10-22','2026-10-29']);
  const paused=await parent(root,created.obligationId);
  await call('changeRecurringLifecycle',command('resume',{obligationId:created.obligationId,expectedRevision:paused.revision,action:'resume',effectiveDate:'2026-12-01'}));
  await batch(adminDb,user.uid,created.obligationId,new Date('2026-12-15T12:00:00Z'));
  const rows=await instances(root,created.obligationId);
  assert.ok(!rows.some(x=>x.occurrenceDate.startsWith('2026-11')));assert.ok(rows.some(x=>x.occurrenceDate==='2026-12-03'));
}));
test('pause and inclusive end retain existing future rows with an explicit preview count',async()=>withOwner('recurring-end',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));await batch(adminDb,user.uid,created.obligationId);
  const before=await instances(root,created.obligationId);let current=await parent(root,created.obligationId);
  const paused=await call('changeRecurringLifecycle',command('pause',{obligationId:created.obligationId,expectedRevision:current.revision,action:'pause',effectiveDate:'2026-11-01'}));
  assert.equal(paused.retainedFutureCount,3);assert.deepEqual(await instances(root,created.obligationId),before);
  current=await parent(root,created.obligationId);
  const ended=await call('changeRecurringLifecycle',command('end',{obligationId:created.obligationId,expectedRevision:current.revision,action:'end',effectiveDate:'2026-12-01'}));
  assert.equal(ended.retainedFutureCount,1);assert.deepEqual(await instances(root,created.obligationId),before);
  await batch(adminDb,user.uid,created.obligationId,new Date('2027-04-01T12:00:00Z'));
  assert.deepEqual(await instances(root,created.obligationId),before);
}));
test('daily historical backlog is bounded and continues without missing periods',async()=>withOwner('recurring-backlog',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({recurrence:rule({frequency:'custom',unit:'days',interval:1,preferredDay:null,anchorDate:'2026-01-01',startDate:'2026-01-01',endDate:'2026-04-30'})})));
  let count=0,result;
  do {result=await batch(adminDb,user.uid,created.obligationId);assert.ok(result.created<=30);assert.ok(++count<10);} while(result.hasMore);
  const rows=await instances(root,created.obligationId);assert.equal(rows.length,120);assert.equal(new Set(rows.map(x=>x.instanceId)).size,120);
  assert.equal(rows[0].occurrenceDate,'2026-01-01');assert.equal(rows.at(-1).occurrenceDate,'2026-04-30');
}));
test('expired generation leases and changed rules fence stale writes',async()=>withOwner('recurring-fence',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));
  const jobId=jobs().recurringJobId(user.uid,created.obligationId);const old=await jobs().claimRecurringJob(jobId,adminDb,now);
  const later=new Date(now.getTime()+7*60000);const fresh=await jobs().claimRecurringJob(jobId,adminDb,later);
  await assert.rejects(generation().generateRecurringBatch(jobId,old.token,adminDb,later),{code:'aborted'});
  const before=await instances(root,created.obligationId);
  await call('editRecurring',command('rule',{...draft(),recurrence:rule({preferredDay:15}),obligationId:created.obligationId,expectedRevision:1}));
  await assert.rejects(generation().generateRecurringBatch(jobId,fresh.token,adminDb,later),{code:'aborted'});
  assert.deepEqual(await instances(root,created.obligationId),before);
  await batch(adminDb,user.uid,created.obligationId,later);
  const rows=await instances(root,created.obligationId);assert.deepEqual(rows[0],before[0]);assert.ok(rows.slice(1).every(x=>x.occurrenceDate.endsWith('-15') && x.occurrenceDate>'2026-11-01'));
}));
test('period due edits keep identity and unpaid skips preserve amount history',async()=>withOwner('recurring-period',async({call,command,root})=>{
  const created=await call('createRecurring',command('create',draft()));const original=(await instances(root,created.obligationId))[0];
  await call('editRecurringInstance',command('move',{obligationId:created.obligationId,instanceId:original.instanceId,expectedRevision:1,dueDate:'2026-11-05',paymentSourceId:null,notes:'Provider extension',reason:'Due date changed'}));
  const moved=(await instances(root,created.obligationId))[0];assert.equal(moved.occurrenceKey,original.occurrenceKey);assert.equal(moved.occurrenceDate,original.occurrenceDate);assert.equal(moved.yearMonth,'2026-11');
  await call('skipRecurringInstance',command('skip',{obligationId:created.obligationId,instanceId:original.instanceId,expectedRevision:moved.revision,reason:'Waived period'}));
  const skipped=(await instances(root,created.obligationId))[0];assert.equal(skipped.closed,true);assert.equal(skipped.financialStatus,'skipped');assert.equal(skipped.amountMinor,original.amountMinor);
  await assert.rejects(call('setRecurringAmount',command('closed',{obligationId:created.obligationId,instanceId:skipped.instanceId,expectedRevision:skipped.revision,amountMinor:200000,reason:'Wrong'})),{code:'functions/failed-precondition'});
}));
test('owner locks and foreign references stop generation and commands without partial writes',async()=>withOwner('recurring-owner',async({call,command,root,user,adminDb})=>{
  await assert.rejects(call('createRecurring',command('foreign',draft({contactId:'another-owner-contact'}))),{code:'functions/failed-precondition'});
  assert.equal((await root.collection('obligations').get()).size,0);
  const created=await call('createRecurring',command('create',draft()));const jobId=jobs().recurringJobId(user.uid,created.obligationId);const lease=await jobs().claimRecurringJob(jobId,adminDb,now);
  const before=await instances(root,created.obligationId);const cursor=(await parent(root,created.obligationId)).recurrence.generationCursor;
  await root.update({accountStatus:'deleting'});
  await assert.rejects(generation().generateRecurringBatch(jobId,lease.token,adminDb,now),{code:'failed-precondition'});
  assert.deepEqual(await instances(root,created.obligationId),before);assert.equal((await parent(root,created.obligationId)).recurrence.generationCursor,cursor);
}));
test('a conflicting period rolls back the entire generation batch and cursor',async()=>withOwner('recurring-rollback',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));
  const before=await parent(root,created.obligationId),first=(await instances(root,created.obligationId))[0];
  const {occurrenceInstanceId}=require('./lib/src/shared/occurrence_id.js');
  const id=occurrenceInstanceId(created.obligationId,'r:2027-01-01');
  await root.collection('obligationInstances').doc(id).set({...first,instanceId:id,occurrenceKey:'r:2027-01-01',occurrenceDate:'2027-01-01',currency:'USD'});
  await assert.rejects(batch(adminDb,user.uid,created.obligationId),{code:'failed-precondition'});
  assert.deepEqual(await parent(root,created.obligationId),before);
  assert.equal((await instances(root,created.obligationId)).length,2,'December staged before the conflict must not commit');
}));
test('future schedules outside the horizon and ending before their start create no periods',async()=>withOwner('recurring-future',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft({recurrence:rule({anchorDate:'2028-01-01',startDate:'2028-01-01'})})));
  assert.equal(created.firstInstanceId,null);assert.equal((await instances(root,created.obligationId)).length,0);
  const result=await batch(adminDb,user.uid,created.obligationId);assert.equal(result.created,0);assert.equal(result.hasMore,false);assert.ok(result.nextRunAt);
  const current=await parent(root,created.obligationId);
  await call('changeRecurringLifecycle',command('end',{obligationId:created.obligationId,expectedRevision:current.revision,action:'end',effectiveDate:'2026-11-01'}));
  await batch(adminDb,user.uid,created.obligationId,new Date('2028-02-01T00:00:00Z'));
  assert.equal((await instances(root,created.obligationId)).length,0);
}));
test('a scheduled dispatcher generates periods and repeated invocations create no duplicates',async()=>withOwner('recurring-dispatch',async({call,command,root,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));
  const {dispatchRecurringJobs}=require('./lib/src/jobs/recurring_dispatch.js');
  const first=await dispatchRecurringJobs(adminDb,now);assert.ok(first.processed>=1);
  const before=await instances(root,created.obligationId);assert.equal(before.length,3);
  await dispatchRecurringJobs(adminDb,now);assert.deepEqual(await instances(root,created.obligationId),before);
}));
test('a template never presents its next ungenerated date as the next outstanding bill',async()=>withOwner('recurring-next-date',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));
  await batch(adminDb,user.uid,created.obligationId);
  const current=await parent(root,created.obligationId);
  assert.equal(current.nextDueDate,null,'Outstanding dates belong to individual billing periods');
  assert.equal(current.nextGenerationDate,'2027-02-01');
}));
test('a lifecycle change racing the generation transaction fences its former lease',async()=>withOwner('recurring-race',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('create',draft()));
  const jobId=jobs().recurringJobId(user.uid,created.obligationId),lease=await jobs().claimRecurringJob(jobId,adminDb,now);
  const before=await instances(root,created.obligationId),original=adminDb.runTransaction.bind(adminDb);
  // Interpose a real competing command between the worker's initial job lookup
  // and its transaction. Do not stub reads, writes, ownership or revisions.
  adminDb.runTransaction=async(...args)=>{
    adminDb.runTransaction=original;
    await call('changeRecurringLifecycle',command('pause',{obligationId:created.obligationId,expectedRevision:1,action:'pause',effectiveDate:'2026-11-01'}));
    return original(...args);
  };
  try {await assert.rejects(generation().generateRecurringBatch(jobId,lease.token,adminDb,now),{code:'aborted'});}
  finally {adminDb.runTransaction=original;}
  assert.deepEqual(await instances(root,created.obligationId),before);
  const current=await parent(root,created.obligationId);assert.equal(current.recurrence.generationCursor,0);assert.equal(current.lifecycle,'paused');
}));
