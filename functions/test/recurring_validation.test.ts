import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRecurringCreation} from '../src/recurring/recurring_validation.js';

const rule={frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-11-01',preferredDay:1,monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-11-01',endDate:null,ruleVersion:1};
const body={title:'Internet',description:'',notes:'',contactId:null,categoryId:'default-utilities',currency:'PHP',amountKind:'fixed',defaultAmountMinor:169900,paymentMode:'manual',paymentSourceId:null,recurrence:rule,reminderPolicy:{enabled:true,offsetDays:[3,0],localTime:'09:00'}};
test('recurring inputs separate fixed actual fees and optional variable estimates',()=>{
  assert.equal(validateRecurringCreation(body).defaultAmountMinor,169900);
  assert.equal(validateRecurringCreation({...body,amountKind:'variable',defaultAmountMinor:null}).defaultAmountMinor,null);
  assert.deepEqual(validateRecurringCreation(body).reminderPolicy.offsetDays,[3,0]);
  for(const patch of [{defaultAmountMinor:null},{defaultAmountMinor:0},{defaultAmountMinor:1.5},{amountKind:'unknown'},{paymentMode:'bankConnected'},
    {originalAmountMinor:1},{reminderPolicy:{...body.reminderPolicy,offsetDays:[0,0]}},
    {reminderPolicy:{...body.reminderPolicy,offsetDays:[366]}},{reminderPolicy:{...body.reminderPolicy,localTime:'24:00'}},
    {reminderPolicy:{...body.reminderPolicy,preferenceRevision:9}},
  ])assert.throws(()=>validateRecurringCreation({...body,...patch}),{code:'invalid-argument'});
});
