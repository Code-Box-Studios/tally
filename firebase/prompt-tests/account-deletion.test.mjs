import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withDeletionOwner} from '../emulator-tests/support/deletion-session.mjs';

test('real account deletion prompt finishes accepted synthetic cleanup without Flutter or a cron tick',async()=>withDeletionOwner('prompt-deletion',async f=>{
  await f.root.collection('payments').doc('record').set({userId:f.user.uid,schemaVersion:1,amountMinor:100});
  await f.call('requestAccountDeletion',f.command('delete-original',{confirmation:'DELETE'}));
  const deadline=Date.now()+20000;
  let job;
  for(;;) {
    job=(await f.jobRef.get()).data();if(job?.status==='complete')break;
    assert.notEqual(job?.status,'needsRecovery',job?.lastErrorCode);
    if(Date.now()>=deadline)assert.fail('The actual account deletion prompt did not finish accepted cleanup.');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal((await f.root.get()).exists,false);assert.equal((await f.root.listCollections()).length,0);
  await assert.rejects(f.adminAuth.getUser(f.user.uid),{code:'auth/user-not-found'});
  assert.deepEqual(Object.keys(job).sort(),['completedAt','schemaVersion','status','userId']);
}));
