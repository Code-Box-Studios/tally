import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCorrection} from '../src/payments/corrections.js';

test('correction revision is optional without changing legacy receipt normalization',()=>{
  const legacy={paymentId:'payment',reason:' Wrong amount ',replacement:null};
  assert.deepEqual(validateCorrection(legacy),{paymentId:'payment',reason:'Wrong amount',replacement:null});
  assert.equal(validateCorrection({...legacy,expectedObligationRevision:3}).expectedObligationRevision,3);
  for(const value of [null,0,-1,1.5,Number.MAX_SAFE_INTEGER,'3']){
    assert.throws(()=>validateCorrection({...legacy,expectedObligationRevision:value}));
  }
  assert.throws(()=>validateCorrection({...legacy,unexpected:true}));
});
