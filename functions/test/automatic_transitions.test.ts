import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticDecision} from '../src/recurring/deduction_events.js';
import {canStartJob,shouldRunPrompt,promptWorkerEnabled} from '../src/jobs/dispatch.js';
import {Timestamp} from 'firebase-admin/firestore';

const state={paymentMode:'automatic' as const,amountMinor:54900,remainingMinor:54900,closed:false,deductionStatus:'scheduled',
  requiresConfirmation:false,scheduledAt:new Date('2026-10-04T01:00:00Z'),createdAt:new Date('2026-10-03T01:00:00Z'),now:new Date('2026-10-04T02:00:00Z')};
test('known automatic bills assume only the outstanding remainder',()=>{
  assert.equal(automaticDecision(state),'assume');assert.equal(automaticDecision({...state,remainingMinor:34900}),'assume');
});
test('unknown, confirmation and retrospective bills require user confirmation',()=>{
  for(const patch of [{amountMinor:null,remainingMinor:null},{paymentMode:'automaticConfirmation' as const},{requiresConfirmation:true},{createdAt:new Date('2026-10-04T01:00:01Z')}])
    assert.equal(automaticDecision({...state,...patch}),'expect');
});
test('early processing defers and settled or previously resolved events cannot be assumed again',()=>{
  assert.equal(automaticDecision({...state,now:new Date('2026-10-04T00:00:00Z')}),'defer');
  for(const patch of [{closed:true,remainingMinor:0},{paymentMode:'manual' as const},{deductionStatus:'failed'},{deductionStatus:'confirmed'},{deductionStatus:'deducted'}])
    assert.equal(automaticDecision({...state,...patch}),'suppress');
});
test('dispatch reserves the complete projection deadline before claiming more work',()=>{
  assert.equal(canStartJob('ownerProjection',179999),false);assert.equal(canStartJob('ownerProjection',180000),true);
  assert.equal(canStartJob('automaticDeduction',0),false);assert.equal(canStartJob('recurringGeneration',59999),false);
  assert.equal(canStartJob('automaticDeduction',60000),true);
});
test('prompt workers ignore completion and their own unexpired lease writes',()=>{
  const now=state.now,job={schemaVersion:1,kind:'automaticDeduction',status:'pending',nextRunAt:Timestamp.fromDate(state.scheduledAt)};
  assert.equal(shouldRunPrompt(job,now),true);
  assert.equal(shouldRunPrompt({...job,status:'complete',nextRunAt:null},now),false);
  assert.equal(shouldRunPrompt({...job,status:'leased',leaseExpiresAt:Timestamp.fromMillis(now.getTime()+60000)},now),false);
  assert.equal(shouldRunPrompt({...job,status:'leased',leaseExpiresAt:Timestamp.fromMillis(now.getTime()-1)},now),true);
});
test('manual scheduling is available only in an explicit demo emulator, never in production',()=>{
  assert.equal(promptWorkerEnabled(true,'demo-tally','manual'),false);
  assert.equal(promptWorkerEnabled(true,'demo-tally',undefined),true);
  assert.equal(promptWorkerEnabled(false,'tally-production','manual'),true);
  assert.equal(promptWorkerEnabled(true,'tally-production','manual'),true);
});
