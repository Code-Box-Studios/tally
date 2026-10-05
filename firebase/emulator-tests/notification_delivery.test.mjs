import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withOwner,loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app');initializeApp({projectId:'demo-tally'});
const {Timestamp}=require('firebase-admin/firestore');
const workers=()=>require('./lib/src/notifications/reminder_jobs.js');
const delivery=()=>require('./lib/src/notifications/delivery.js');
const {periodJobId}=require('./lib/src/jobs/recurring_jobs.js');
const {defaultNotificationPolicy}=require('./lib/src/notifications/policy.js');
const registration=(id,patch={})=>({installationId:id,platform:'web',token:`synthetic-notification-token-${id}`,
 permission:'granted',channel:'push',appVersion:'0.1.0',expectedRevision:0,...patch});
async function fixture(owner,count=1) {
 await owner.call('updateNotificationPreferences',owner.command('prefs',{expectedRevision:1,preferences:{...defaultNotificationPolicy(),pushEnabled:true}}));
 const created=await owner.call('createObligation',owner.command('loan',loan()));
 const instant=new Date('2026-10-20T12:00:00Z');
 const id=periodJobId(owner.user.uid,created.obligationInstanceId,'reminderPreparation');
 const p=await workers().claimReminderJob(id,owner.adminDb,instant);
 await require('./lib/src/notifications/preparation.js').prepareReminders(id,p.token,owner.adminDb,instant);
 const entry=(await owner.root.collection('reminders').get()).docs.map(d=>d.data()).find(x=>x.phase==='due');
 for(let i=0;i<count;i++)await owner.call('registerNotificationDevice',owner.command(`device-${i}`,registration(`device-${String(i).padStart(2,'0')}`)));
 const jobId=workers().reminderDeliveryId(owner.user.uid,entry.reminderId),now=entry.scheduledAt.toDate();
 const lease=await workers().claimReminderJob(jobId,owner.adminDb,now);
 return {created,entry,jobId,lease,now};
}
async function run(owner,f,send) {return delivery().deliverReminder(f.jobId,f.lease.token,owner.adminDb,{send},f.now);}
const receipts=async owner=>(await owner.root.collection('notificationDeliveries').get()).docs.map(d=>d.data());
test('external acceptance uses private generational receipts and sends only generic IDs',async()=>withOwner('push-accepted',async owner=>{
 const f=await fixture(owner,2),before=(await owner.root.collection('ledgerState').doc('current').get()).data(),sent=[];
 await run(owner,f,async message=>{sent.push(message);return 'delivered';});
 assert.equal(sent.length,2);assert.ok(sent.every(x=>x.title==='Tally reminder'&&x.body==='Open Tally to see what’s due.'));
 assert.deepEqual(Object.keys(sent[0].data).sort(),['instanceId','obligationId','reminderId']);
 assert.equal(sent[0].expiresAt.toISOString(),f.entry.externalExpiresAt.toDate().toISOString());
 assert.equal(JSON.stringify(sent).includes('Personal loan'),false);
 assert.equal((await receipts(owner)).filter(x=>x.status==='accepted').length,2);
 await run(owner,f,async()=>{throw Error('duplicate send');});
 assert.deepEqual((await owner.root.collection('ledgerState').doc('current').get()).data(),before);
 assert.equal((await owner.root.collection('payments').get()).size,0);
 assert.equal((await owner.root.collection('reminders').doc(f.entry.reminderId).get()).data().visible,true);
 assert.equal((await owner.adminDb.doc(`systemJobs/${f.jobId}`).get()).data().status,'complete');
}));
test('retry and ambiguous network failure retain inbox and reuse one logical receipt',async()=>withOwner('push-retry',async owner=>{
 const f=await fixture(owner);let sends=0;
 await run(owner,f,async()=>{sends++;throw Error('ambiguous network failure');});
 assert.equal(sends,1);assert.equal((await receipts(owner)).length,1);
 assert.equal((await owner.root.collection('reminders').doc(f.entry.reminderId).get()).data().visible,true);
 const job=(await owner.adminDb.doc(`systemJobs/${f.jobId}`).get()).data();assert.equal(job.status,'pending');
 const next=job.nextRunAt.toDate();assert.ok(next>f.now);
 const lease=await workers().claimReminderJob(f.jobId,owner.adminDb,next);assert.ok(lease);
 await run(owner,{...f,lease,now:next},async()=>{sends++;return 'delivered';});
 assert.equal(sends,2);assert.equal((await receipts(owner)).length,1);assert.equal((await receipts(owner))[0].status,'accepted');
}));
test('a concurrent duplicate worker cannot send the same live receipt twice',async()=>withOwner('push-concurrent',async owner=>{
 const f=await fixture(owner);let sends=0;
 await Promise.all([run(owner,f,async()=>{sends++;return 'delivered';}),run(owner,f,async()=>{sends++;return 'delivered';})]);
 assert.equal(sends,1);assert.equal((await receipts(owner)).length,1);
}));
test('rotation during invalid result preserves the new token and uses a new receipt on retry',async()=>withOwner('push-invalid-race',async owner=>{
 const f=await fixture(owner);
 await run(owner,f,async()=>{
  await owner.call('registerNotificationDevice',owner.command('rotate',registration('device-00',{expectedRevision:1,token:'synthetic-notification-token-rotated'})));
  return 'invalid';
 });
 const device=(await owner.root.collection('notificationDevices').doc('device-00').get()).data();assert.equal(device.active,true);assert.equal(device.tokenGeneration,2);
 const job=(await owner.adminDb.doc(`systemJobs/${f.jobId}`).get()).data();assert.equal(job.status,'pending');
 const next=job.nextRunAt.toDate(),lease=await workers().claimReminderJob(f.jobId,owner.adminDb,next);
 const sent=[];await run(owner,{...f,lease,now:next},async m=>{sent.push(m);return 'delivered';});
 assert.equal(sent[0].token,'synthetic-notification-token-rotated');assert.equal((await receipts(owner)).length,2);
}));
test('token handoff while a send completes cannot retire the newer owner binding',async()=>withOwner('push-handoff-a',async owner=>withOwner('push-handoff-b',async other=>{
 const f=await fixture(owner);
 await run(owner,f,async()=>{
  await other.call('registerNotificationDevice',other.command('takeover',registration('device-00')));return 'invalid';
 });
 assert.equal((await other.root.collection('notificationDevices').doc('device-00').get()).data().active,true);
 assert.equal((await owner.root.collection('notificationDevices').doc('device-00').get()).data().active,false);
 assert.equal((await receipts(owner)).filter(x=>x.status==='accepted').length,0);
})));
test('payment and preferences changed during send prevent recording acceptance and retain published history',async()=>{
 for(const change of ['paid','disabled','inactive','lease'])await withOwner(`push-${change}`,async owner=>{
  const f=await fixture(owner);let callbackCompleted=false;
  await run(owner,f,async()=>{
   if(change==='paid')await owner.call('recordPayment',owner.command('pay',{obligationId:f.created.obligationId,obligationInstanceId:f.created.obligationInstanceId,
    amountMinor:1000000,currency:'PHP',paymentDate:'2026-10-05',paymentSourceId:null,paymentMethod:'cash',notes:''}));
   if(change==='disabled')await owner.call('updateNotificationPreferences',owner.command('off',{expectedRevision:2,preferences:defaultNotificationPolicy()}));
   if(change==='inactive')await owner.root.update({accountStatus:'deleting'});
   if(change==='lease')await owner.adminDb.doc(`systemJobs/${f.jobId}`).update({generation:3,leaseGeneration:3,leaseToken:'new-worker'});
   callbackCompleted=true;return 'delivered';
  });
  assert.equal(callbackCompleted,true);
  assert.equal((await receipts(owner)).filter(x=>x.status==='accepted').length,0);
  assert.equal((await owner.root.collection('reminders').doc(f.entry.reminderId).get()).data().visible,true);
 });
});
test('device delivery continues in bounded pages and skips already accepted receipts',async()=>withOwner('push-pages',async owner=>{
 const f=await fixture(owner,12),sent=[];
 await run(owner,f,async m=>{sent.push(m.token);return 'delivered';});assert.equal(sent.length,10);
 const job=(await owner.adminDb.doc(`systemJobs/${f.jobId}`).get()).data();assert.equal(job.status,'pending');assert.ok(job.externalCursor);
 const lease=await workers().claimReminderJob(f.jobId,owner.adminDb,f.now);assert.ok(lease);
 await run(owner,{...f,lease},async m=>{sent.push(m.token);return 'delivered';});assert.equal(sent.length,12);assert.equal(new Set(sent).size,12);
}));
test('external expiry completes pending transport without losing inbox history',async()=>withOwner('push-expiry',async owner=>{
 const f=await fixture(owner);let sends=0;await run(owner,f,async()=>{sends++;return 'retry';});
 const late=new Date(f.entry.externalExpiresAt.toMillis()+1),lease=await workers().claimReminderJob(f.jobId,owner.adminDb,late);assert.ok(lease);
 await run(owner,{...f,lease,now:late},async()=>{sends++;return 'delivered';});assert.equal(sends,1);
 const job=(await owner.adminDb.doc(`systemJobs/${f.jobId}`).get()).data();assert.equal(job.status,'complete');assert.equal(job.externalState,'expired');
 assert.equal((await owner.root.collection('reminders').doc(f.entry.reminderId).get()).data().visible,true);
}));
