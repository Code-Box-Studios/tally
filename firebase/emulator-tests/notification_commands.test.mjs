import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {withOwner,loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {Timestamp}=require('firebase-admin/firestore');
const {defaultNotificationPolicy}=require('./lib/src/notifications/policy.js');
const {enqueueProjection,projectionJobId}=require('./lib/src/jobs/projection_jobs.js');
const policy=()=>({...defaultNotificationPolicy(),offsetDays:[3,0],enabledKinds:[...defaultNotificationPolicy().enabledKinds]});

test('new bootstrap creates canonical private notification preferences',async()=>withOwner('notification-default',async owner=>{
  const preferences=(await owner.root.collection('notificationPreferences').doc('default').get()).data();
  assert.equal(preferences.userId,owner.user.uid);assert.equal(preferences.revision,1);
  assert.equal(preferences.quietStart,'21:00');assert.equal(preferences.pushEnabled,false);
  assert.equal(preferences.allowSensitivePushText,false);
  assert.deepEqual((await getDoc(doc(owner.db,`${owner.root.path}/notificationPreferences/default`))).data().offsetDays,[3,0]);
}));
test('bootstrap migrates legacy choices and revision without changing financial history',async()=>withOwner('notification-migrate',async owner=>{
  await owner.root.collection('notificationPreferences').doc('default').delete();
  const oldTime=Timestamp.fromDate(new Date('2025-02-03T00:00:00Z'));
  await owner.root.collection('notificationPreferences').doc('current').set({userId:owner.user.uid,schemaVersion:1,
    enabled:false,pushEnabled:true,offsetDays:[7,0],localTime:'10:45',revision:4,createdAt:oldTime,updatedAt:oldTime});
  const ledgerBefore=(await owner.root.collection('ledgerState').doc('current').get()).data();
  await owner.call('bootstrapUser',{});
  const migrated=(await owner.root.collection('notificationPreferences').doc('default').get()).data();
  assert.equal(migrated.enabled,false);assert.equal(migrated.pushEnabled,true);
  assert.equal(migrated.localEnabled,false);assert.equal(migrated.revision,4);
  assert.deepEqual(migrated.offsetDays,[7,0]);assert.equal(migrated.localTime,'10:45');
  assert.equal(migrated.createdAt.toMillis(),oldTime.toMillis());
  assert.equal((await owner.root.collection('ledgerState').doc('current').get()).data().revision,ledgerBefore.revision);
  assert.equal((await owner.root.collection('notificationPreferences').doc('current').get()).data().enabled,false);
}));
test('preference metadata has permanent receipts and no financial ledger mutation',async()=>withOwner('notification-receipt',async owner=>{
  await enqueueProjection(owner.user.uid,owner.adminDb);
  const projectionRef=owner.adminDb.collection('systemJobs').doc(projectionJobId(owner.user.uid));
  const projectionBefore=(await projectionRef.get()).data();
  const before=(await owner.root.collection('ledgerState').doc('current').get()).data().revision;
  const request=owner.command('notification-update',{expectedRevision:1,preferences:{...policy(),enabled:false}});
  const first=await owner.call('updateNotificationPreferences',request);
  assert.deepEqual(await owner.call('updateNotificationPreferences',request),first);
  assert.equal(first.preferenceRevision,2);
  assert.equal((await owner.root.collection('ledgerState').doc('current').get()).data().revision,before);
  assert.deepEqual((await projectionRef.get()).data(),projectionBefore);
  const updated=(await owner.root.collection('notificationPreferences').doc('default').get()).data();
  assert.equal(updated.enabled,false);assert.equal(updated.revision,2);
  assert.equal((await owner.root.collection('commandReceipts').doc('notification-update').get()).exists,true);
  await assert.rejects(owner.call('updateNotificationPreferences',owner.command('notification-update',
    {expectedRevision:1,preferences:policy()})),{code:'functions/already-exists'});
}));
test('notification commands reject unauthenticated calls before private reads',async()=>{
  const app=initializeApp({projectId:'demo-tally',apiKey:'demo-tally',appId:'demo-tally'},`notification-anonymous-${Date.now()}`);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const functions=getFunctions(app,'asia-southeast1');connectFunctionsEmulator(functions,'127.0.0.1',5001);
  try {
    for(const name of ['updateNotificationPreferences','markReminderRead','setObligationReminder']) {
      await assert.rejects(httpsCallable(functions,name)({commandId:'anonymous',expectedOwnerUid:'another-owner',payload:{}}),
        {code:'functions/unauthenticated'});
    }
  } finally {await deleteApp(app);}
});
test('stale and invalid preferences cannot overwrite another device or create receipts',async()=>withOwner('notification-conflict',async owner=>{
  await owner.call('updateNotificationPreferences',owner.command('save',{expectedRevision:1,preferences:{...policy(),enabled:false}}));
  await assert.rejects(owner.call('updateNotificationPreferences',owner.command('stale',{expectedRevision:1,preferences:policy()})),{code:'functions/aborted'});
  await assert.rejects(owner.call('updateNotificationPreferences',owner.command('invalid',{expectedRevision:2,
    preferences:{...policy(),offsetDays:[0,1,2,3,4,5,6,7,8]}})),{code:'functions/invalid-argument'});
  assert.equal((await owner.root.collection('notificationPreferences').doc('default').get()).data().enabled,false);
  assert.equal((await owner.root.collection('commandReceipts').doc('stale').get()).exists,false);
  assert.equal((await owner.root.collection('commandReceipts').doc('invalid').get()).exists,false);
}));
test('private preferences and inbox reject a different owner and direct client edits',async()=>withOwner('notification-owner-a',async owner=>withOwner('notification-owner-b',async other=>{
  await assert.rejects(other.call('updateNotificationPreferences',owner.command('foreign',{expectedRevision:1,preferences:policy()})),{code:'functions/permission-denied'});
  await assert.rejects(getDoc(doc(other.db,`${owner.root.path}/notificationPreferences/default`)),{code:'permission-denied'});
  await assert.rejects(setDoc(doc(owner.db,`${owner.root.path}/notificationPreferences/default`),policy()),{code:'permission-denied'});
  await owner.root.collection('reminders').doc('private-reminder').set({userId:owner.user.uid,schemaVersion:1});
  await assert.rejects(getDoc(doc(other.db,`${owner.root.path}/reminders/private-reminder`)),{code:'permission-denied'});
})));
const reminder=(uid,patch={})=>({reminderId:'due-reminder',userId:uid,schemaVersion:1,
  obligationId:'loan-1',instanceId:'period-1',kind:'dueToday',phase:'due',civilTargetDate:'2026-10-01',
  scheduledAt:Timestamp.fromMillis(Date.now()-3600000),savedTimezone:'Asia/Manila',quietTimezone:'Asia/Manila',
  preferenceRevision:1,policyRevision:1,parentRevision:1,instanceRevision:1,status:'sent',visible:true,
  visibleAt:Timestamp.fromMillis(Date.now()-3600000),readAt:null,revision:1,title:'Personal loan',
  amountMinor:50000,currency:'PHP',messageKey:'reminder.dueToday',deliverySummary:{},
  createdAt:Timestamp.now(),updatedAt:Timestamp.now(),...patch});
test('mark read changes only read state and deduplicates the accepted action',async()=>withOwner('notification-read',async owner=>{
  const ref=owner.root.collection('reminders').doc('due-reminder');await ref.set(reminder(owner.user.uid));
  const before=(await owner.root.collection('ledgerState').doc('current').get()).data().revision;
  const input=owner.command('read',{reminderId:'due-reminder',expectedRevision:1});
  const first=await owner.call('markReminderRead',input);
  assert.deepEqual(first,{reminderId:'due-reminder',reminderRevision:2});
  assert.deepEqual(await owner.call('markReminderRead',input),first);
  const result=(await ref.get()).data();assert.ok(result.readAt instanceof Timestamp);
  assert.equal(result.status,'sent');assert.equal(result.amountMinor,50000);assert.equal(result.revision,2);
  assert.equal((await owner.root.collection('ledgerState').doc('current').get()).data().revision,before);
  await assert.rejects(owner.call('markReminderRead',owner.command('stale-read',{reminderId:'due-reminder',expectedRevision:1})),{code:'functions/aborted'});
}));
test('future cancelled and foreign reminders cannot be marked read',async()=>withOwner('notification-read-invalid',async owner=>{
  for(const [id,patch] of [['future',{scheduledAt:Timestamp.fromMillis(Date.now()+86400000)}],
    ['cancelled',{status:'cancelled',visible:false}],['foreign',{userId:'different-owner'}]]) {
    await owner.root.collection('reminders').doc(id).set(reminder(owner.user.uid,{...patch,reminderId:id}));
    await assert.rejects(owner.call('markReminderRead',owner.command(`read-${id}`,{reminderId:id,expectedRevision:1})),
      {code:'functions/failed-precondition'});
  }
}));
test('finite reminder policy retains partial payments and uses parent revision guards',async()=>withOwner('notification-finite',async owner=>{
  const created=await owner.call('createObligation',owner.command('loan',loan({amountMinor:100000})));
  const payment=await owner.call('recordPayment',owner.command('payment',{obligationId:created.obligationId,
    obligationInstanceId:created.obligationInstanceId,currency:'PHP',amountMinor:20000,paymentDate:'2026-10-05',
    paymentSourceId:null,paymentMethod:'cash',notes:''}));
  const before=(await owner.root.collection('ledgerState').doc('current').get()).data().revision;
  const input=owner.command('finite-policy',{obligationId:created.obligationId,expectedRevision:2,
    reminderPolicy:{enabled:true,offsetDays:[7,0],localTime:'10:00'}});
  const result=await owner.call('setObligationReminder',input);
  assert.equal(result.obligationRevision,3);
  assert.deepEqual(await owner.call('setObligationReminder',input),result);
  const parent=(await owner.root.collection('obligations').doc(created.obligationId).get()).data();
  assert.equal(parent.originalAmountMinor,100000);assert.equal(parent.totalPaidMinor,20000);assert.equal(parent.remainingMinor,80000);
  assert.deepEqual(parent.reminderPolicy.offsetDays,[7,0]);assert.equal(parent.reminderRevision,1);
  assert.equal((await owner.root.collection('payments').doc(payment.paymentId).get()).data().amountMinor,20000);
  assert.equal((await owner.root.collection('ledgerState').doc('current').get()).data().revision,before);
  await assert.rejects(owner.call('setObligationReminder',owner.command('stale-policy',{
    ...input.payload,expectedRevision:2})),{code:'functions/aborted'});
  const jobs=await owner.adminDb.collection('systemJobs').where('userId','==',owner.user.uid)
    .where('kind','==','reminderReconciliation').get();
  assert.equal(jobs.size,1);assert.equal(jobs.docs[0].data().status,'pending');
}));
