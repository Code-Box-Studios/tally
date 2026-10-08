import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase-admin/firestore';

import {validateDeletionRequest,validateDeletionStatusRequest,requireRecentAuthentication,parseDeletionJob,deletionView}
  from '../src/accounts/deletion_contract.js';

const now = new Date('2026-10-08T12:00:00Z');
const seconds = 1791460800;
const envelope = {commandId:'delete-original',expectedOwnerUid:'alice',payload:{confirmation:'DELETE'}};
const stamp = Timestamp.fromDate(now);
const pending = {
  userId:'alice',schemaVersion:1,requestCommandId:'delete-original',status:'pending',step:'revokeSessions',
  collectionIndex:0,nextRunAt:stamp,attempts:0,leaseToken:null,leaseGeneration:0,leaseExpiresAt:null,
  lastErrorCode:null,storageObjectName:null,storageGeneration:null,createdAt:stamp,updatedAt:stamp,completedAt:null,
};

test('deletion accepts only an exact owned confirmed command envelope', () => {
  assert.deepEqual(validateDeletionRequest('alice',envelope),{commandId:'delete-original'});
  assert.deepEqual(validateDeletionStatusRequest('alice',{...envelope,payload:{}}),{commandId:'delete-original'});
});
for(const [name,patch,code] of [
  ['foreign owner',{expectedOwnerUid:'bob'},'permission-denied'],
  ['path command',{commandId:'../alice'},'invalid-argument'],
  ['missing command',{commandId:null},'invalid-argument'],
  ['injected owner',{userId:'alice'},'invalid-argument'],
  ['wrong confirmation',{payload:{confirmation:'delete'}},'invalid-argument'],
  ['extra confirmation field',{payload:{confirmation:'DELETE',amount:1}},'invalid-argument'],
  ['absent confirmation',{payload:{}},'invalid-argument'],
] as const) test(`deletion rejects ${name} before acceptance`, () => {
  assert.throws(() => validateDeletionRequest('alice',{...envelope,...patch}),{code});
});
test('deletion status rejects payload and envelope injection', () => {
  assert.throws(() => validateDeletionStatusRequest('alice',envelope),{code:'invalid-argument'});
  assert.throws(() => validateDeletionStatusRequest('alice',{...envelope,payload:{},auth_time:seconds}),{code:'invalid-argument'});
});
for(const [name,authTime] of [['now',seconds],['300 seconds old',seconds-300],['30 seconds future',seconds+30]] as const)
  test(`recent authentication accepts ${name}`, () => {
    assert.doesNotThrow(() => requireRecentAuthentication(authTime,now));
  });
for(const [name,authTime] of [
  ['301 seconds old',seconds-301],['31 seconds future',seconds+31],['missing',undefined],
  ['string',String(seconds)],['fraction',seconds+.5],['NaN',NaN],['infinite',Infinity],['negative',-1],
  ['token issue time object',{iat:seconds,auth_time:seconds-301}],
] as const) test(`recent authentication rejects ${name}`, () => {
  assert.throws(() => requireRecentAuthentication(authTime,now),{code:'failed-precondition',details:{reason:'requires-recent-login'}});
});

test('accepted deletion job exposes only the owner status and step', () => {
  const job = parseDeletionJob('alice',pending);
  assert.deepEqual(deletionView(job),{userId:'alice',status:'pending',step:'revokeSessions'});
  const leased = parseDeletionJob('alice',{...pending,status:'leased',step:'storage',leaseToken:'worker-1',
    leaseGeneration:1,leaseExpiresAt:Timestamp.fromMillis(stamp.toMillis()+120000),attempts:1,
    storageObjectName:'users/alice/attachments/receipt/file',storageGeneration:'9007199254740993'});
  assert.deepEqual(deletionView(leased),{userId:'alice',status:'leased',step:'storage'});
});
test('completed UID fence has only the minimized permanent fields', () => {
  const fence = {userId:'alice',schemaVersion:1,status:'complete',completedAt:stamp};
  assert.deepEqual(deletionView(parseDeletionJob('alice',fence)),{userId:'alice',status:'complete',step:'complete'});
  assert.throws(() => parseDeletionJob('alice',{...fence,requestCommandId:'leaked'}),{code:'failed-precondition'});
});
for(const [name,patch] of [
  ['foreign owner',{userId:'bob'}],['unsupported schema',{schemaVersion:2}],
  ['unknown status',{status:'cancelled'}],['unknown step',{step:'eraseAll'}],
  ['injected private fields',{email:'private@example.test'}],['missing original command',{requestCommandId:null}],
  ['fractional progress',{collectionIndex:.5}],['unbounded progress',{collectionIndex:17}],
  ['negative attempts',{attempts:-1}],['missing next-run timestamp',{nextRunAt:null}],
  ['string audit timestamp',{createdAt:now.toISOString()}],['premature complete step',{step:'complete'}],
  ['pending owns a lease',{leaseToken:'worker-1'}],['leased without lease',{status:'leased'}],
  ['foreign storage selection',{storageObjectName:'users/bob/attachments/a',storageGeneration:'1'}],
  ['partial storage selection',{storageObjectName:'users/alice/attachments/a'}],
  ['invalid generation',{storageObjectName:'users/alice/attachments/a',storageGeneration:'-1'}],
  ['raw error leak',{lastErrorCode:'Error: secret token'}],
] as const) test(`accepted deletion cannot replay a job with ${name}`, () => {
  assert.throws(() => parseDeletionJob('alice',{...pending,...patch}),{code:'failed-precondition'});
});
