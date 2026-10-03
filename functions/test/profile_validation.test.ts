import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProfileUpdate} from '../src/accounts/profile.js';
import {authorizeCaller} from '../src/shared/callable.js';

const valid = {commandId:'settings-1',expectedRevision:1,defaultCurrency:'PHP',timezone:'Asia/Manila',themeMode:'system',onboardingComplete:true};
test('profile validation accepts supported currency and an actual IANA timezone',()=>{
  assert.deepEqual(validateProfileUpdate(valid), valid);
  assert.equal(validateProfileUpdate({...valid,defaultCurrency:'JPY',timezone:'Europe/London'}).defaultCurrency,'JPY');
});
for(const [name,patch] of [
  ['owner injection',{userId:'bob'}],['unknown field',{bankingPassword:'secret'}],
  ['currency',{defaultCurrency:'XYZ'}],['timezone',{timezone:'Asia/Fiction'}],
  ['theme',{themeMode:'future'}],['fractional revision',{expectedRevision:1.5}],
  ['negative revision',{expectedRevision:-1}],['unbounded revision',{expectedRevision:Number.MAX_SAFE_INTEGER}],
  ['command path',{commandId:'../alice'}],['onboarding type',{onboardingComplete:'true'}],
] as const) test(`profile validation rejects ${name}`,()=>assert.throws(()=>validateProfileUpdate({...valid,...patch}),{code:'invalid-argument'}));
test('auth and attestation are separate requirements outside a verified demo emulator',()=>{
  assert.throws(()=>authorizeCaller(undefined,true,false,'tally-codebox-preview'),{code:'unauthenticated'});
  assert.throws(()=>authorizeCaller('alice',false,false,'tally-codebox-preview'),{code:'failed-precondition'});
  assert.throws(()=>authorizeCaller('alice',false,true,'tally-codebox-preview'),{code:'failed-precondition'});
  assert.equal(authorizeCaller('alice',true,false,'tally-codebox-preview'),'alice');
  assert.equal(authorizeCaller('alice',false,true,'demo-tally'),'alice');
});
