import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withOwner} from '../emulator-tests/support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''))throw new Error('Local emulator required.');
require('firebase-admin/app').initializeApp({projectId:'demo-tally'});

async function until(read,condition) {
  const deadline=Date.now()+15000;
  for(;;) {
    const value=await read();if(condition(value))return value;
    if(Date.now()>=deadline)throw new Error('The real emulator prompt worker did not process the ready job.');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
test('real Firestore prompt trigger publishes summaries and consumes an expected deduction without waiting for cron',async()=>withOwner('prompt-worker',async({call,command,root,adminDb,user})=>{
  await until(async()=>(await root.collection('summaries').doc('dashboard-PHP').get()).data(),value=>value?.sourceRevision===0);
  const created=await call('createRecurring',command('create',{
    title:'Prompt Internet',description:'',notes:'',contactId:null,categoryId:'default-utilities',currency:'PHP',amountKind:'fixed',defaultAmountMinor:54900,paymentMode:'automaticConfirmation',paymentSourceId:null,
    recurrence:{frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-10-04',preferredDay:4,monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-10-04',endDate:null,ruleVersion:1},
    reminderPolicy:{enabled:false,offsetDays:[],localTime:'09:00'},
  }));
  const instance=await until(async()=>(await root.collection('obligationInstances').doc(created.firstInstanceId).get()).data(),value=>value?.deductionStatus==='expected');
  assert.equal((await root.collection('payments').get()).size,0);
  const {runReadyJob,dispatchReadyJobs}=require('./lib/src/jobs/dispatch.js'),{periodJobId}=require('./lib/src/jobs/recurring_jobs.js');
  await Promise.all([runReadyJob(periodJobId(user.uid,created.firstInstanceId,'automaticDeduction'),adminDb),dispatchReadyJobs(adminDb)]);
  assert.equal((await root.collection('deductionAttempts').where('instanceId','==',created.firstInstanceId).get()).size,1);
  await call('confirmDeduction',command('confirm',{obligationId:created.obligationId,instanceId:created.firstInstanceId,expectedRevision:instance.revision,amountMinor:54900,paymentDate:'2026-10-04',paymentSourceId:null,paymentMethod:'other',notes:''}));
  const summary=await until(async()=>{
    const [snapshot,ledger]=await Promise.all([root.collection('summaries').doc('dashboard-PHP').get(),root.collection('ledgerState').doc('current').get()]);
    return {summary:snapshot.data(),revision:ledger.data().revision};
  },value=>value.summary?.sourceRevision===value.revision&&value.summary?.month.outgoing.paidMinor===54900);
  assert.equal(summary.summary.month.outgoing.confirmedPaidMinor,54900);
  assert.equal((await root.collection('payments').get()).size,1);
}));
