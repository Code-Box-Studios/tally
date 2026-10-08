import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withOwner,loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''))throw new Error('Local emulator required. Live financial data is prohibited.');
const {initializeApp}=require('firebase-admin/app');
initializeApp({projectId:'demo-tally'});
const {Timestamp}=require('firebase-admin/firestore');
const payment=(created,amountMinor)=>({obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceId??created.firstInstanceId,
  amountMinor,currency:'PHP',paymentDate:'2026-10-04',paymentSourceId:null,paymentMethod:'cash',notes:''});

test('lost manual acknowledgement replays one permanent receipt and never pays twice',async()=>withOwner('offline-receipt',async({call,command,root})=>{
  const created=await call('createObligation',command('create',loan()));
  const intent=command('saved-offline',payment(created,250_000));
  // The server commits, but the caller deliberately discards its response.
  await call('recordPayment',intent);
  const committed=(await root.collection('payments').get()).docs.map(doc=>doc.data());
  assert.equal(committed.length,1);
  const receiptBefore=(await root.collection('commandReceipts').doc('saved-offline').get()).data();
  const accepted=await call('recordPayment',JSON.parse(JSON.stringify(intent)));
  assert.deepEqual(accepted,receiptBefore.result);
  assert.deepEqual((await root.collection('payments').get()).docs.map(doc=>doc.data()),committed);
  assert.deepEqual((await root.collection('commandReceipts').doc('saved-offline').get()).data(),receiptBefore);
  const period=(await root.collection('obligationInstances').doc(created.obligationInstanceId).get()).data();
  assert.equal(period.totalPaidMinor,250_000);
  assert.equal(period.remainingMinor,750_000);
  await assert.rejects(call('recordPayment',command('saved-offline',payment(created,250_001))),{code:'functions/already-exists'});
  assert.equal((await root.collection('payments').get()).size,1);
}));

test('automatic deduction winning against an old queued amount preserves one payment and rejects overpayment',async()=>withOwner('offline-auto-race',async({call,command,root,user,adminDb})=>{
  const created=await call('createRecurring',command('recurring',{
    title:'Netflix',description:'Subscription',notes:'',contactId:null,categoryId:'default-subscription',currency:'PHP',amountKind:'fixed',defaultAmountMinor:54900,
    paymentMode:'automatic',paymentSourceId:null,
    recurrence:{frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-10-04',preferredDay:4,monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-10-04',endDate:null,ruleVersion:1},
    reminderPolicy:{enabled:false,offsetDays:[],localTime:'09:00'},
  }));
  const intent=command('queued-manual',payment(created,54900));
  // This controlled audit fixture represents a schedule registered in advance.
  await root.collection('obligationInstances').doc(created.firstInstanceId).update({createdAt:Timestamp.fromDate(new Date('2026-10-03T01:00:00Z'))});
  const now=new Date('2026-10-05T04:00:00Z');
  const {periodJobId,claimAutomaticJob}=require('./lib/src/jobs/recurring_jobs.js');
  const jobId=periodJobId(user.uid,created.firstInstanceId,'automaticDeduction');
  const lease=await claimAutomaticJob(jobId,adminDb,now);assert.ok(lease);
  await require('./lib/src/recurring/automatic_service.js').processAutomatic(jobId,lease.token,adminDb,now);
  const before=(await root.collection('payments').get()).docs.map(doc=>doc.data());
  assert.equal(before.length,1);assert.equal(before[0].provenance,'assumedAutomatic');
  for(let retry=0;retry<2;retry++)await assert.rejects(call('recordPayment',intent),error=>{
    assert.equal(error.code,'functions/failed-precondition');return true;
  });
  assert.deepEqual((await root.collection('payments').get()).docs.map(doc=>doc.data()),before);
  assert.equal((await root.collection('commandReceipts').doc('queued-manual').get()).exists,false);
  const period=(await root.collection('obligationInstances').doc(created.firstInstanceId).get()).data();
  assert.equal(period.totalPaidMinor,54900);assert.equal(period.remainingMinor,0);
}));
