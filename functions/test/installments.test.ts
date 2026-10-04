import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equalInstallments,validateSchedule} from '../src/obligations/installment_calculation.js';
import {allocatePayment} from '../src/payments/allocation.js';
import {occurrenceInstanceId} from '../src/shared/occurrence_id.js';

test('equal_split_retains_minor_remainder',()=>{
  assert.deepEqual(equalInstallments(10_000,3),[3333,3333,3334]);
  assert.equal(equalInstallments(1_000_000_000_000,120).reduce((sum,n)=>sum+n,0),1_000_000_000_000);
  for(const count of [1,121,2.5])assert.throws(()=>equalInstallments(10_000,count),{code:'invalid-argument'});
  assert.throws(()=>equalInstallments(2,3),{code:'invalid-argument'});
});
test('installment schedules require exact principal, valid ordered dates and 2–120 positive terms',()=>{
  const schedule=[{amountMinor:40,dueDate:'2026-10-31'},{amountMinor:60,dueDate:'2026-11-30'}];
  assert.deepEqual(validateSchedule(schedule,100,'2026-10-01'),schedule);
  for(const invalid of [[],[schedule[0]],Array(121).fill(schedule[0]),
    [{amountMinor:0,dueDate:'2026-10-31'},schedule[1]],
    [{amountMinor:41,dueDate:'2026-10-31'},schedule[1]],
    [{amountMinor:40,dueDate:'2026-02-30'},schedule[1]],
    [{amountMinor:40,dueDate:'2026-09-30'},schedule[1]],
    [schedule[1],schedule[0]],
    [{...schedule[0],remainingMinor:40},schedule[1]],
  ])assert.throws(()=>validateSchedule(invalid,100,'2026-10-01'),{code:'invalid-argument'});
});
test('allocations pay earliest outstanding periods and retain explicit intent',()=>{
  const instances=[
    {instanceId:'later',dueDate:'2026-12-01',remainingMinor:400,closed:false},
    {instanceId:'first-b',dueDate:'2026-11-01',remainingMinor:300,closed:false},
    {instanceId:'first-a',dueDate:'2026-11-01',remainingMinor:200,closed:false},
    {instanceId:'paid',dueDate:'2026-10-01',remainingMinor:0,closed:true},
  ];
  assert.deepEqual(allocatePayment(650,instances),[
    {instanceId:'first-a',amountMinor:200},{instanceId:'first-b',amountMinor:300},{instanceId:'later',amountMinor:150},
  ]);
  assert.deepEqual(allocatePayment(100,instances,[{instanceId:'later',amountMinor:100}]),[{instanceId:'later',amountMinor:100}]);
  for(const allocations of [[],[{instanceId:'unknown',amountMinor:100}],
    [{instanceId:'paid',amountMinor:100}],[{instanceId:'first-a',amountMinor:201}],
    [{instanceId:'first-a',amountMinor:50},{instanceId:'first-a',amountMinor:50}],
    [{instanceId:'first-a',amountMinor:99}],
  ])assert.throws(()=>allocatePayment(100,instances,allocations));
  assert.throws(()=>allocatePayment(901,instances),{code:'failed-precondition'});
});
test('a payment never silently truncates allocations beyond 24 periods',()=>{
  const instances=Array.from({length:25},(_,index)=>({instanceId:`term-${String(index).padStart(2,'0')}`,dueDate:'2026-10-01',remainingMinor:10,closed:false}));
  assert.equal(allocatePayment(240,instances).length,24);
  assert.throws(()=>allocatePayment(241,instances),{code:'failed-precondition'});
  assert.throws(()=>allocatePayment(250,instances,instances.map(x=>({instanceId:x.instanceId,amountMinor:10}))),{code:'invalid-argument'});
});
test('occurrence identifiers are stable and separated by parent and period',()=>{
  const id=occurrenceInstanceId('loan','i:0001');
  assert.equal(occurrenceInstanceId('loan','i:0001'),id);
  assert.notEqual(occurrenceInstanceId('loan','i:0002'),id);
  assert.notEqual(occurrenceInstanceId('other','i:0001'),id);
  assert.match(id,/^[A-Za-z0-9_-]{1,128}$/);
  assert.throws(()=>occurrenceInstanceId('loan','i:0000'),{code:'invalid-argument'});
});
