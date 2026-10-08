import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {doc,getDoc} from 'firebase/firestore';
import {withDeletionOwner} from './support/deletion-session.mjs';
import {loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {Timestamp}=require('firebase-admin/firestore');
const {requestAccountDeletion}=require('./lib/src/accounts/deletion_service.js');

test('concurrent deletion requests accept once and immediately deny private data and financial writes',async()=>withDeletionOwner('concurrent',async({user,call,command,root,jobRef,db})=>{
  const created=await call('createObligation',command('loan-before-deletion',loan()));
  const revision=(await root.get()).data().revision;
  await getDoc(doc(db,`users/${user.uid}/obligations/${created.obligationId}`));
  assert.equal(await call('getAccountDeletionStatus',command('status-before',{})),null);
  const requests=await Promise.all(['delete-a','delete-b'].map(id=>call('requestAccountDeletion',command(id,{confirmation:'DELETE'}))));
  for(const result of requests)assert.deepEqual(result,{userId:user.uid,status:'pending',step:'revokeSessions'});
  const profile=(await root.get()).data();const job=(await jobRef.get()).data();
  assert.equal(profile.accountStatus,'deleting');assert.equal(profile.revision,revision+1);
  assert.equal(job.userId,user.uid);assert.ok(['delete-a','delete-b'].includes(job.requestCommandId));
  assert.equal(job.attempts,0);assert.equal(job.createdAt instanceof Timestamp,true);
  assert.equal((await root.collection('commandReceipts').doc('delete-a').get()).exists,false);
  assert.equal((await root.collection('commandReceipts').doc('delete-b').get()).exists,false);
  await assert.rejects(getDoc(doc(db,`users/${user.uid}`)),{code:'permission-denied'});
  await assert.rejects(getDoc(doc(db,`users/${user.uid}/obligations/${created.obligationId}`)),{code:'permission-denied'});
  await assert.rejects(call('createObligation',command('loan-after-deletion',loan())),{code:'functions/failed-precondition'});
  await assert.rejects(call('bootstrapUser',{}),{code:'functions/failed-precondition'});
  assert.deepEqual(await call('getAccountDeletionStatus',command('status-after',{})),requests[0]);
  await assert.rejects(getDoc(doc(db,`accountDeletionJobs/${user.uid}`)),{code:'permission-denied'});
}));

test('wrong owner or confirmation cannot lock an active profile',async()=>withDeletionOwner('owner',async({user,call,command,root,jobRef})=>{
  const before=(await root.get()).data();
  await assert.rejects(call('requestAccountDeletion',{...command('foreign',{confirmation:'DELETE'}),expectedOwnerUid:'someone-else'}),{code:'functions/permission-denied'});
  await assert.rejects(call('requestAccountDeletion',command('unconfirmed',{confirmation:'delete'})),{code:'functions/invalid-argument'});
  await assert.rejects(call('getAccountDeletionStatus',command('injected-status',{userId:user.uid})),{code:'functions/invalid-argument'});
  assert.deepEqual((await root.get()).data(),before);assert.equal((await jobRef.get()).exists,false);
}));

test('stale authentication cannot accept deletion despite a fresh token issue time',async()=>withDeletionOwner('recency',async({user,command,root,jobRef,adminDb})=>{
  const before=(await root.get()).data();const now=new Date('2026-10-08T12:00:00Z');
  for(const authTime of [1791460499,undefined,'1791460800',{iat:1791460800,auth_time:1791460499}]) {
    await assert.rejects(requestAccountDeletion(user.uid,command('stale',{confirmation:'DELETE'}),authTime,adminDb,now),
      {code:'failed-precondition',details:{reason:'requires-recent-login'}});
    assert.deepEqual((await root.get()).data(),before);assert.equal((await jobRef.get()).exists,false);
  }
}));

test('lost acceptance response replays the original job even after authentication ages',async()=>withDeletionOwner('replay',async({user,call,command,root,jobRef,adminDb})=>{
  const result=await call('requestAccountDeletion',command('delete-original',{confirmation:'DELETE'}));
  const accepted=(await jobRef.get()).data();const locked=(await root.get()).data();
  assert.deepEqual(await requestAccountDeletion(user.uid,command('retry-new-envelope',{confirmation:'DELETE'}),undefined,adminDb),result);
  assert.deepEqual((await jobRef.get()).data(),accepted);assert.deepEqual((await root.get()).data(),locked);
  assert.equal(accepted.requestCommandId,'delete-original');
}));

test('accepted UID fence prevents profile resurrection after profile removal',async()=>withDeletionOwner('fence',async({user,call,command,root,jobRef,adminDb})=>{
  await call('requestAccountDeletion',command('delete-owner',{confirmation:'DELETE'}));
  await root.delete();
  await assert.rejects(call('bootstrapUser',{}),{code:'functions/failed-precondition'});
  assert.equal((await root.get()).exists,false);
  await jobRef.set({userId:user.uid,schemaVersion:1,status:'complete',completedAt:Timestamp.now()});
  const view={userId:user.uid,status:'complete',step:'complete'};
  assert.deepEqual(await call('getAccountDeletionStatus',command('status-complete',{})),view);
  assert.deepEqual(await requestAccountDeletion(user.uid,command('retry-complete',{confirmation:'DELETE'}),undefined,adminDb),view);
  await assert.rejects(call('bootstrapUser',{}),{code:'functions/failed-precondition'});
  assert.deepEqual(Object.keys((await jobRef.get()).data()).sort(),['completedAt','schemaVersion','status','userId']);
}));

test('corrupt or foreign acceptance job fails closed without revising the active profile',async()=>withDeletionOwner('invalid-job',async({user,call,command,root,jobRef})=>{
  const before=(await root.get()).data();
  for(const job of [{userId:'foreign',schemaVersion:1,status:'complete',completedAt:Timestamp.now()},
    {userId:user.uid,schemaVersion:2,status:'complete',completedAt:Timestamp.now()},
    {userId:user.uid,schemaVersion:1,status:'pending'}]) {
    await jobRef.set(job);
    await assert.rejects(call('requestAccountDeletion',command('corrupt-retry',{confirmation:'DELETE'})),{code:'functions/failed-precondition'});
    await assert.rejects(call('getAccountDeletionStatus',command('corrupt-status',{})),{code:'functions/failed-precondition'});
    assert.deepEqual((await root.get()).data(),before);
  }
}));
