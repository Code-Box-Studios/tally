import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase-admin/firestore';
import {assertReminderLease,reminderDeliveryId,reminderJobKinds,validateReminderJob} from '../src/notifications/reminder_jobs.js';
import {reminderReconciliationId} from '../src/notifications/reconciliation_job.js';
import {shouldRunPrompt,canStartJob} from '../src/jobs/dispatch.js';

test('reminder job identifiers bind owner and logical event deterministically',()=>{
  assert.equal(reminderDeliveryId('alice','due-1'),reminderDeliveryId('alice','due-1'));
  assert.notEqual(reminderDeliveryId('alice','due-1'),reminderDeliveryId('bob','due-1'));
  assert.notEqual(reminderDeliveryId('alice','due-1'),reminderDeliveryId('alice','due-2'));
  assert.throws(()=>reminderDeliveryId('alice','../private'));
});
test('canonical owner reconciliation rejects a mismatched owner subject',()=>{
  const job={kind:'reminderReconciliation',userId:'alice',subjectId:'alice',generation:1,schemaVersion:1};
  validateReminderJob(reminderReconciliationId('alice'),job);
  assert.throws(()=>validateReminderJob(reminderReconciliationId('alice'),{...job,subjectId:'bob'}));
  assert.throws(()=>validateReminderJob(reminderReconciliationId('bob'),job));
  assert.throws(()=>validateReminderJob(reminderReconciliationId('alice'),{...job,generation:0}));
});
test('reminder leases reject expiry and never authorize newer tokens or generations',()=>{
  const now=new Date('2026-10-05T01:00:00Z'),job={status:'leased',leaseToken:'current',generation:2,leaseGeneration:2,
    leaseExpiresAt:Timestamp.fromMillis(now.getTime()+360000)};
  assert.equal(assertReminderLease(job,'current',now),true);
  assert.equal(assertReminderLease(job,'old',now),false);
  assert.equal(assertReminderLease({...job,generation:3},'current',now),false);
  assert.throws(()=>assertReminderLease(job,'current',new Date(now.getTime()+360000)));
});
test('every reminder kind shares bounded dispatch and six-minute recovery',()=>{
  const now=new Date('2026-10-05T01:00:00Z');
  for(const kind of reminderJobKinds) {
    assert.equal(shouldRunPrompt({kind,status:'pending',schemaVersion:1,nextRunAt:Timestamp.fromDate(now)},now),true);
    assert.equal(canStartJob(kind,60000),true);assert.equal(canStartJob(kind,59999),false);
  }
  assert.equal(shouldRunPrompt({kind:'arbitrary',status:'pending',schemaVersion:1,nextRunAt:Timestamp.fromDate(now)},now),false);
});
