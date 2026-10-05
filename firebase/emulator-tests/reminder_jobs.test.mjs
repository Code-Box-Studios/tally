import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withOwner,loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {Timestamp}=require('firebase-admin/firestore');
const {periodJobId}=require('./lib/src/jobs/recurring_jobs.js');
const {defaultNotificationPolicy}=require('./lib/src/notifications/policy.js');
const policy=(patch={})=>({...defaultNotificationPolicy(),offsetDays:[3,0],enabledKinds:[...defaultNotificationPolicy().enabledKinds],...patch});
const workers=()=>require('./lib/src/notifications/reminder_jobs.js');
const prep=()=>require('./lib/src/notifications/preparation.js');
const reconcile=()=>require('./lib/src/notifications/reconciliation.js');
const delivery=()=>require('./lib/src/notifications/delivery.js');
const now=new Date('2026-10-20T12:00:00Z');
const rule={frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-11-01',preferredDay:1,monthEnd:false,
  timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-11-01',endDate:null,ruleVersion:1};
const bill=(patch={})=>({title:'Internet',description:'Home',notes:'',contactId:null,categoryId:'default-utilities',
  currency:'PHP',amountKind:'fixed',defaultAmountMinor:169900,paymentMode:'manual',paymentSourceId:null,
  recurrence:rule,reminderPolicy:{enabled:true,offsetDays:[3,0],localTime:'09:00'},...patch});
const rows=async owner=>(await owner.root.collection('reminders').get()).docs.map(d=>d.data());
async function prepare(owner,instanceId,instant=now) {
  const id=periodJobId(owner.user.uid,instanceId,'reminderPreparation');
  const lease=await workers().claimReminderJob(id,owner.adminDb,instant);assert.ok(lease,'current preparation lease');
  return prep().prepareReminders(id,lease.token,owner.adminDb,instant);
}
async function publish(owner,entry,instant=entry.scheduledAt.toDate()) {
  const id=workers().reminderDeliveryId(owner.user.uid,entry.reminderId);
  const lease=await workers().claimReminderJob(id,owner.adminDb,instant);assert.ok(lease,'current delivery lease');
  return delivery().deliverReminder(id,lease.token,owner.adminDb,undefined,instant);
}
async function reconcilePage(owner,instant=now) {
  const {reminderReconciliationId}=require('./lib/src/notifications/reconciliation_job.js');
  const id=reminderReconciliationId(owner.user.uid),lease=await workers().claimReminderJob(id,owner.adminDb,instant);
  assert.ok(lease,'current owner reconciliation lease');
  return reconcile().reconcileOwnerReminders(id,lease.token,owner.adminDb,instant);
}

test('finite preparation and delivery are idempotent without changing financial records',async()=>withOwner('reminder-finite',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan()));
  const before=(await owner.root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data();
  const ledger=(await owner.root.collection('ledgerState').doc('current').get()).data();
  const jobId=periodJobId(owner.user.uid,created.obligationInstanceId,'reminderPreparation');
  const claims=await Promise.all([workers().claimReminderJob(jobId,owner.adminDb,now),workers().claimReminderJob(jobId,owner.adminDb,now)]);
  assert.equal(claims.filter(Boolean).length,1);const lease=claims.find(Boolean);
  const result=await prep().prepareReminders(jobId,lease.token,owner.adminDb,now);assert.ok(result.created>0&&result.created<=32);
  assert.deepEqual(await prep().prepareReminders(jobId,lease.token,owner.adminDb,now),{created:0,hasMore:false,stale:true});
  const initial=await rows(owner);assert.ok(initial.every(x=>!x.visible&&x.readAt===null));
  const due=initial.find(x=>x.phase==='due');assert.ok(due);
  const deliveryId=workers().reminderDeliveryId(owner.user.uid,due.reminderId),deliveryLease=await workers().claimReminderJob(deliveryId,owner.adminDb,now);
  const delivered=await Promise.all([delivery().deliverReminder(deliveryId,deliveryLease.token,owner.adminDb,undefined,now),
    delivery().deliverReminder(deliveryId,deliveryLease.token,owner.adminDb,undefined,now)]);
  assert.equal(delivered.filter(x=>x.published).length,1);
  const sent=(await owner.root.collection('reminders').doc(due.reminderId).get()).data();
  assert.equal(sent.visible,true);assert.equal(sent.status,'sent');assert.equal(sent.amountMinor,1000000);
  assert.equal((await owner.root.collection('reminders').get()).size,initial.length);
  assert.deepEqual((await owner.root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data(),before);
  assert.deepEqual((await owner.root.collection('ledgerState').doc('current').get()).data(),ledger);
  assert.equal((await owner.root.collection('payments').get()).size,0);
  const activity=await owner.root.collection('activities').where('type','==','reminderGenerated').get();
  assert.equal(activity.size,1);assert.equal(activity.docs[0].data().amountMinor,1000000);
  assert.equal(await workers().claimReminderJob(workers().reminderDeliveryId(owner.user.uid,due.reminderId),owner.adminDb,now),null);
}));
test('recurring snapshots retain reminders when paused or ended and unknown amounts stay null',async()=>withOwner('reminder-retained',async owner=>{
  for(const action of ['pause','end']) {
    const created=await owner.call('createRecurring',owner.command(`create-${action}`,bill({amountKind:'variable',defaultAmountMinor:350000})));
    const period=(await owner.root.collection('obligationInstances').where('obligationId','==',created.obligationId).get()).docs[0].data();
    await owner.call('changeRecurringLifecycle',owner.command(action,{obligationId:created.obligationId,expectedRevision:1,action,effectiveDate:'2026-11-01'}));
    await prepare(owner,period.instanceId);
    const entries=(await rows(owner)).filter(x=>x.instanceId===period.instanceId);
    assert.ok(entries.length>0);assert.ok(entries.every(x=>x.amountMinor===null&&x.currency==='PHP'));
    assert.deepEqual((await owner.root.collection('obligationInstances').doc(period.instanceId).get()).data(),period);
    const due=entries.find(x=>x.phase==='due');await publish(owner,due);
    const activity=await owner.root.collection('activities').where('instanceId','==',period.instanceId).where('type','==','reminderGenerated').get();
    assert.equal(activity.size,1);assert.equal(activity.docs[0].data().amountMinor,null);assert.equal(activity.docs[0].data().currency,null);
    assert.equal(activity.docs[0].data().obligationCurrency,'PHP');
  }
}));
test('payment suppresses unsent reminders while reversal rearms them and sent history stays',async()=>withOwner('reminder-payment',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan({amountMinor:100000})));
  await prepare(owner,created.obligationInstanceId);
  const first=(await rows(owner)).find(x=>x.phase==='due');await publish(owner,first,now);
  const payment=await owner.call('recordPayment',owner.command('paid',{obligationId:created.obligationId,
    obligationInstanceId:created.obligationInstanceId,currency:'PHP',amountMinor:100000,paymentDate:'2026-10-05',
    paymentSourceId:null,paymentMethod:'cash',notes:''}));
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  const after=await rows(owner);assert.equal(after.find(x=>x.reminderId===first.reminderId).status,'sent');
  assert.ok(after.filter(x=>x.reminderId!==first.reminderId).every(x=>x.status==='cancelled'&&!x.visible));
  await owner.call('correctPayment',owner.command('reverse',{paymentId:payment.paymentId,reason:'Wrong payment',replacement:null}));
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  assert.ok((await rows(owner)).some(x=>x.status==='pending'));
  assert.equal((await owner.root.collection('payments').get()).size,2);
}));
test('partial payments refresh pending native snapshots without overwriting payments',async()=>withOwner('reminder-partial',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan({amountMinor:100000})));
  await prepare(owner,created.obligationInstanceId);
  const payment=await owner.call('recordPayment',owner.command('partial',{obligationId:created.obligationId,
    obligationInstanceId:created.obligationInstanceId,currency:'PHP',amountMinor:20000,paymentDate:'2026-10-05',
    paymentSourceId:null,paymentMethod:'cash',notes:''}));
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  assert.ok((await rows(owner)).filter(x=>x.status==='pending').every(x=>x.amountMinor===80000));
  assert.equal((await owner.root.collection('payments').doc(payment.paymentId).get()).data().amountMinor,20000);
}));
test('cancelled finite and skipped recurring periods cannot publish previously leased alerts',async()=>withOwner('reminder-closed',async owner=>{
  for(const recurring of [false,true]) {
    const created=await owner.call(recurring?'createRecurring':'createObligation',owner.command(`create-${recurring}`,recurring?bill():loan()));
    const period=(await owner.root.collection('obligationInstances').where('obligationId','==',created.obligationId).get()).docs[0].data();
    await prepare(owner,period.instanceId);const entry=(await rows(owner)).find(x=>x.instanceId===period.instanceId);
    const instant=entry.scheduledAt.toDate(),id=workers().reminderDeliveryId(owner.user.uid,entry.reminderId);
    const lease=await workers().claimReminderJob(id,owner.adminDb,instant);
    if(recurring)await owner.call('skipRecurringInstance',owner.command('skip',{obligationId:created.obligationId,instanceId:period.instanceId,expectedRevision:1,reason:'Skipped'}));
    else await owner.call('cancelObligation',owner.command('cancel',{obligationId:created.obligationId,expectedRevision:1,reason:'Cancelled'}));
    const result=await delivery().deliverReminder(id,lease.token,owner.adminDb,undefined,instant);
    assert.equal(result.published,false);
    assert.equal((await owner.root.collection('reminders').doc(entry.reminderId).get()).data().visible,false);
  }
}));
test('preferences changed while leased fence preparation and suppress outdated delivery',async()=>withOwner('reminder-policy-race',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan()));
  const id=periodJobId(owner.user.uid,created.obligationInstanceId,'reminderPreparation');
  const lease=await workers().claimReminderJob(id,owner.adminDb,now);
  await owner.call('updateNotificationPreferences',owner.command('disable',{expectedRevision:1,preferences:policy({enabled:false})}));
  await assert.rejects(prep().prepareReminders(id,lease.token,owner.adminDb,now),{code:'aborted'});
  assert.equal((await rows(owner)).length,0);
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  assert.equal((await rows(owner)).length,0);
}));
test('due-date changes invalidate old delivery and only the new civil due is scheduled',async()=>withOwner('reminder-due-race',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan()));
  await prepare(owner,created.obligationInstanceId);const old=(await rows(owner)).find(x=>x.phase==='due');
  const id=workers().reminderDeliveryId(owner.user.uid,old.reminderId),lease=await workers().claimReminderJob(id,owner.adminDb,now);
  await owner.call('editObligation',owner.command('date',{...loan({dueDate:'2026-11-20'}),obligationId:created.obligationId,expectedRevision:1}));
  assert.equal((await delivery().deliverReminder(id,lease.token,owner.adminDb,undefined,now)).published,false);
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  assert.ok((await rows(owner)).some(x=>x.phase==='due'&&x.civilTargetDate==='2026-11-20'&&x.status==='pending'));
  assert.equal((await owner.root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data().dueDate,'2026-11-20');
}));
test('expired worker tokens cannot publish or complete a newer reminder generation',async()=>withOwner('reminder-lease',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan()));await prepare(owner,created.obligationInstanceId);
  const entry=(await rows(owner)).find(x=>x.phase==='due'),id=workers().reminderDeliveryId(owner.user.uid,entry.reminderId);
  const first=await workers().claimReminderJob(id,owner.adminDb,now),later=new Date(now.getTime()+360001);
  await assert.rejects(delivery().deliverReminder(id,first.token,owner.adminDb,undefined,later),{code:'aborted'});
  const second=await workers().claimReminderJob(id,owner.adminDb,later);assert.ok(second);
  assert.equal((await delivery().deliverReminder(id,first.token,owner.adminDb,undefined,later)).published,false);
  assert.equal((await owner.adminDb.collection('systemJobs').doc(id).get()).data().leaseToken,second.token);
  assert.equal((await delivery().deliverReminder(id,second.token,owner.adminDb,undefined,later)).published,true);
}));
test('owner reconciliation pages one hundred periods and rejects mutation mid-page',async()=>withOwner('reminder-paging',async owner=>{
  const installments=Array.from({length:120},(_,i)=>({amountMinor:10000,dueDate:new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10)}));
  const created=await owner.call('createInstallment',owner.command('create',{...loan({amountMinor:1200000,dueDate:installments.at(-1).dueDate}),installments}));
  const first=await reconcilePage(owner);assert.equal(first.examined,100);assert.equal(first.hasMore,true);
  const {reminderReconciliationId}=require('./lib/src/notifications/reconciliation_job.js');
  const id=reminderReconciliationId(owner.user.uid),lease=await workers().claimReminderJob(id,owner.adminDb,now);
  await owner.call('updateNotificationPreferences',owner.command('changed',{expectedRevision:1,preferences:policy({offsetDays:[7,0]})}));
  await assert.rejects(reconcile().reconcileOwnerReminders(id,lease.token,owner.adminDb,now),{code:'aborted'});
  const restarted=await reconcilePage(owner);assert.equal(restarted.examined,100);
  const last=await reconcilePage(owner);assert.equal(last.examined,20);assert.equal(last.hasMore,false);
  const jobs=await owner.adminDb.collection('systemJobs').where('userId','==',owner.user.uid).where('kind','==','reminderPreparation').get();
  assert.equal(jobs.size,120);assert.equal(created.obligationInstanceIds.length,120);
}));
test('profile quiet-zone change shifts reminders and cannot move stored due dates',async()=>withOwner('reminder-zone',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan({dueDate:'2026-11-20'})));
  await owner.call('updateNotificationPreferences',owner.command('evening',{expectedRevision:1,preferences:policy({localTime:'18:00'})}));
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  const old=(await rows(owner)).find(x=>x.phase==='due');
  const profile=(await owner.root.get()).data();
  await owner.call('updateProfile',{commandId:'zone',expectedOwnerUid:owner.user.uid,expectedRevision:profile.revision,
    defaultCurrency:'PHP',timezone:'America/New_York',themeMode:'system',onboardingComplete:false});
  await reconcile().enqueueOwnerReminders(owner.user.uid,owner.adminDb,now);
  await reconcilePage(owner);await prepare(owner,created.obligationInstanceId);
  const next=(await rows(owner)).find(x=>x.phase==='due'&&x.status==='pending');
  assert.equal(old.scheduledAt.toDate().toISOString(),'2026-11-20T10:00:00.000Z');
  assert.equal(next.scheduledAt.toDate().toISOString(),'2026-11-20T13:00:00.000Z');
  assert.equal(next.quietTimezone,'America/New_York');
  assert.equal((await owner.root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data().dueDate,'2026-11-20');
}));
test('delayed old event enters inbox without external catch-up flood and overdue planning is bounded',async()=>withOwner('reminder-delayed',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan({originationDate:'1900-01-01',dueDate:'1900-01-02'})));
  const result=await prepare(owner,created.obligationInstanceId);assert.ok(result.created<=16);
  const entry=(await rows(owner)).sort((a,b)=>a.scheduledAt.toMillis()-b.scheduledAt.toMillis())[0];assert.ok(entry.civilTargetDate>='2026-10-13');
  const id=workers().reminderDeliveryId(owner.user.uid,entry.reminderId),lease=await workers().claimReminderJob(id,owner.adminDb,now);
  let sends=0;const transport={send:async()=>{sends++;return 'delivered';}};
  assert.equal((await delivery().deliverReminder(id,lease.token,owner.adminDb,transport,now)).published,true);
  const published=(await owner.root.collection('reminders').doc(entry.reminderId).get()).data();
  assert.equal(published.deliverySummary.external,'expired');assert.equal(sends,0);assert.equal(published.visible,true);
}));
test('terminal automatic jobs stay terminal while reminder preparation rearms after edits',async()=>withOwner('reminder-terminal',async owner=>{
  const created=await owner.call('createRecurring',owner.command('create',bill({amountKind:'variable',paymentMode:'automatic'})));
  const period=(await owner.root.collection('obligationInstances').where('obligationId','==',created.obligationId).get()).docs[0].data();
  const automatic=owner.adminDb.collection('systemJobs').doc(periodJobId(owner.user.uid,period.instanceId,'automaticDeduction'));
  const reminder=owner.adminDb.collection('systemJobs').doc(periodJobId(owner.user.uid,period.instanceId,'reminderPreparation'));
  await automatic.update({status:'complete',nextRunAt:null});await reminder.update({status:'complete',nextRunAt:null});
  await owner.call('setRecurringAmount',owner.command('amount',{obligationId:created.obligationId,instanceId:period.instanceId,expectedRevision:1,amountMinor:350000,reason:'Statement'}));
  assert.equal((await automatic.get()).data().status,'complete');assert.equal((await reminder.get()).data().status,'pending');
}));
test('obsolete unsent cancellation continues across bounded pages and preserves native amounts',async()=>withOwner('reminder-cancellation-pages',async owner=>{
  const created=await owner.call('createObligation',owner.command('create',loan()));await prepare(owner,created.obligationInstanceId);
  const original=(await rows(owner))[0],batch=owner.adminDb.batch();
  const sourceJob=(await owner.adminDb.collection('systemJobs').doc(workers().reminderDeliveryId(owner.user.uid,original.reminderId)).get()).data();
  for(let i=0;i<120;i++) {
    const id=`old-reminder-${String(i).padStart(3,'0')}`;
    batch.set(owner.root.collection('reminders').doc(id),{...original,reminderId:id,contextKey:'previous-context'});
    batch.set(owner.adminDb.collection('systemJobs').doc(workers().reminderDeliveryId(owner.user.uid,id)),{...sourceJob,subjectId:id});
  }
  await batch.commit();
  await owner.call('updateNotificationPreferences',owner.command('change',{expectedRevision:1,preferences:policy({offsetDays:[7,0]})}));
  await reconcilePage(owner);
  const first=await prepare(owner,created.obligationInstanceId);assert.equal(first.created,0);assert.equal(first.hasMore,true);
  const second=await prepare(owner,created.obligationInstanceId);assert.equal(second.hasMore,false);
  const current=await rows(owner);
  assert.ok(current.filter(x=>x.reminderId.startsWith('old-reminder')).every(x=>x.status==='cancelled'&&!x.visible));
  assert.ok(current.filter(x=>x.status==='pending').every(x=>x.preferenceRevision===2&&x.amountMinor===1000000));
  assert.equal((await owner.root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data().remainingMinor,1000000);
}));
test('automatic expectation and failure prepare confirmation without recording a payment',async()=>withOwner('reminder-automatic',async owner=>{
  const created=await owner.call('createRecurring',owner.command('create',bill({paymentMode:'automaticConfirmation',
    recurrence:{...rule,anchorDate:'2026-10-15',preferredDay:15,startDate:'2026-10-15'}})));
  const period=(await owner.root.collection('obligationInstances').where('obligationId','==',created.obligationId).get()).docs[0].data();
  const {claimAutomaticJob}=require('./lib/src/jobs/recurring_jobs.js'),{processAutomatic}=require('./lib/src/recurring/automatic_service.js');
  const id=periodJobId(owner.user.uid,period.instanceId,'automaticDeduction'),lease=await claimAutomaticJob(id,owner.adminDb,now);
  await processAutomatic(id,lease.token,owner.adminDb,now);await prepare(owner,period.instanceId);
  const expected=(await rows(owner)).find(x=>x.kind==='automaticConfirmation');assert.ok(expected);
  assert.equal(expected.civilTargetDate,'2026-10-15');
  const instance=(await owner.root.collection('obligationInstances').doc(period.instanceId).get()).data();
  await owner.call('reportDeductionFailure',owner.command('failed',{obligationId:created.obligationId,instanceId:period.instanceId,
    expectedRevision:instance.revision,reason:'Insufficient balance'}));
  await prepare(owner,period.instanceId);
  const remaining=(await owner.root.collection('obligationInstances').doc(period.instanceId).get()).data();
  assert.equal(remaining.deductionStatus,'failed');assert.equal(remaining.remainingMinor,169900);
  assert.equal((await owner.root.collection('payments').get()).size,0);
  assert.equal((await owner.adminDb.collection('systemJobs').doc(id).get()).data().status,'complete');
  assert.equal((await rows(owner)).filter(x=>x.kind==='automaticConfirmation'&&x.status==='pending').length,1);
}));
test('incoming and outgoing reminder snapshots keep their independent native currencies',async()=>withOwner('reminder-currencies',async owner=>{
  for(const [currency,direction,amountMinor] of [['PHP','owedByMe',1000000],['USD','owedToMe',50000]]) {
    const created=await owner.call('createObligation',owner.command(`create-${currency}`,loan({currency,direction,amountMinor})));
    await prepare(owner,created.obligationInstanceId);
    const entries=(await rows(owner)).filter(x=>x.instanceId===created.obligationInstanceId);
    assert.ok(entries.length>0);assert.ok(entries.every(x=>x.currency===currency&&x.amountMinor===amountMinor));
    if(direction==='owedToMe')assert.ok(entries.every(x=>x.kind==='owedToMe'));
  }
}));
