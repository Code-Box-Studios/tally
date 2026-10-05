import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProfileUpdate} from '../src/accounts/profile.js';
import {supportedZones} from '../src/shared/zone_data.js';

test('profile accepts every timezone offered by the shared client catalog',()=>{
  const base={commandId:'preferences-1',expectedOwnerUid:'alice',expectedRevision:1,defaultCurrency:'PHP',themeMode:'system',onboardingComplete:true};
  for(const timezone of supportedZones)assert.equal(validateProfileUpdate({...base,timezone}).timezone,timezone);
  for(const timezone of ['+08:00','Invalid/Timezone','constructor','__proto__'])assert.throws(()=>validateProfileUpdate({...base,timezone}),{code:'invalid-argument'});
});
