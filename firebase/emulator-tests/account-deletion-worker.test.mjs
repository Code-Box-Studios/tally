import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withDeletionOwner} from './support/deletion-session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {Timestamp}=require('firebase-admin/firestore');
const {enqueueAttachmentFinalization}=require('./lib/src/attachments/attachment_jobs.js');
const {runReadyJob}=require('./lib/src/jobs/dispatch.js');
const {runAccountDeletionJob,FirebaseAccountDeletionAuth}=require('./lib/src/accounts/deletion_worker.js');
const {dispatchAccountDeletionJobs}=require('./lib/src/accounts/deletion_jobs.js');
const {FirebaseAccountDeletionStorage}=require('./lib/src/accounts/deletion_storage.js');

function clock() {
  let date=new Date();let elapsed=0;
  return {now:()=>date,monotonicMs:()=>elapsed,advance:ms=>{date=new Date(date.getTime()+ms);},
    elapsed:ms=>{elapsed=ms;}};
}
function dependencies(fixture) {
  return {auth:new FirebaseAccountDeletionAuth(fixture.adminAuth),storage:new FirebaseAccountDeletionStorage(fixture.bucket)};
}
async function accept(f) {return f.call('requestAccountDeletion',f.command('delete-original',{confirmation:'DELETE'}));}
async function finish(f,deps=dependencies(f),time=clock()) {
  for(let n=0;n<30;n++) {
    const job=(await f.jobRef.get()).data();if(job.status==='complete')return job;
    assert.notEqual(job.status,'needsRecovery',job.lastErrorCode);
    time.advance(121000);time.elapsed(0);
    await runAccountDeletionJob(f.user.uid,f.adminDb,deps,time);
  }
  assert.fail('Deletion did not finish within thirty bounded invocations.');
}
async function seedPayments(f,count) {
  for(let start=0;start<count;start+=200) {
    const batch=f.adminDb.batch();
    for(let n=start;n<Math.min(start+200,count);n++)
      batch.set(f.root.collection('payments').doc(`payment-${String(n).padStart(4,'0')}`),{userId:f.user.uid,schemaVersion:1,amountMinor:100});
    await batch.commit();
  }
}

test('deletion of 1101 records resumes bounded pages, removes Auth and retains only a permanent UID fence',async()=>withDeletionOwner('pages',async f=>{
  await seedPayments(f,1101);await accept(f);const time=clock();const deps=dependencies(f);
  assert.equal(await runAccountDeletionJob(f.user.uid,f.adminDb,deps,time),true);
  assert.equal((await f.root.collection('payments').get()).size,301);
  assert.equal((await f.root.get()).data().accountStatus,'deleting');
  const stopped=(await f.jobRef.get()).data();assert.equal(stopped.status,'pending');assert.equal(stopped.step,'ownerCollections');
  await finish(f,deps,time);
  assert.equal((await f.root.get()).exists,false);assert.equal((await f.root.listCollections()).length,0);
  await assert.rejects(f.adminAuth.getUser(f.user.uid),{code:'auth/user-not-found'});
  assert.deepEqual(Object.keys((await f.jobRef.get()).data()).sort(),['completedAt','schemaVersion','status','userId']);
  assert.equal(await runAccountDeletionJob(f.user.uid,f.adminDb,deps,time),false);
}));

test('Storage cleanup removes only Alice exact-prefix generations and preserves Bob financial data and files',async()=>withDeletionOwner('files-a',async alice=>withDeletionOwner('files-b',async bob=>{
  const alicePath=`users/${alice.user.uid}/attachments/receipt/content`,bobPath=`users/${bob.user.uid}/attachments/receipt/content`;
  await alice.bucket.file(alicePath).save(Buffer.from('alice-private'),{resumable:false});
  await bob.bucket.file(bobPath).save(Buffer.from('bob-private'),{resumable:false});await seedPayments(bob,2);
  const before=(await bob.root.get()).data();await accept(alice);await finish(alice);
  assert.equal((await alice.bucket.file(alicePath).exists())[0],false);
  assert.equal((await bob.bucket.file(bobPath).download())[0].toString(),'bob-private');
  assert.deepEqual((await bob.root.get()).data(),before);assert.equal((await bob.root.collection('payments').get()).size,2);
})));

test('lost Storage deletion response retains its selected generation and retries it without deleting a replacement',async()=>withDeletionOwner('lost-file',async f=>{
  const name=`users/${f.user.uid}/attachments/receipt/content`;
  await f.bucket.file(name).save(Buffer.from('original'),{resumable:false});
  const generation=(await f.bucket.file(name).getMetadata())[0].generation;
  await accept(f);const real=dependencies(f);const time=clock();let failed=false;const requested=[];
  const storage={listOwned:(...args)=>real.storage.listOwned(...args),deleteGeneration:async(uid,path,selected)=>{
    requested.push(selected);const result=await real.storage.deleteGeneration(uid,path,selected);
    if(!failed){failed=true;throw Object.assign(Error('response lost'),{code:'deadline-exceeded'});}
    time.elapsed(60000);return result;
  }};
  assert.equal(await runAccountDeletionJob(f.user.uid,f.adminDb,{...real,storage},time),false);
  const delayed=(await f.jobRef.get()).data();assert.equal(delayed.status,'pending');assert.equal(delayed.storageGeneration,generation);
  assert.equal(delayed.storageObjectName,name);assert.equal(delayed.lastErrorCode,'cleanup-delayed');
  await f.bucket.file(name).save(Buffer.from('replacement'),{resumable:false});
  assert.notEqual((await f.bucket.file(name).getMetadata())[0].generation,generation);
  time.advance(31000);time.elapsed(0);
  await runAccountDeletionJob(f.user.uid,f.adminDb,{...real,storage},time);
  assert.deepEqual(requested,[generation,generation]);
  assert.equal((await f.bucket.file(name).download())[0].toString(),'replacement');
  assert.equal((await f.jobRef.get()).data().status,'pending');
  await finish(f,real,time);
}));

test('a Firestore page failure preserves the locked profile and retries the first remaining page',async()=>withDeletionOwner('firestore-failure',async f=>{
  await seedPayments(f,601);await accept(f);const deps=dependencies(f);const time=clock();let deletions=0;let failed=false;
  const db=new Proxy(f.adminDb,{get(target,key){
    if(key==='runTransaction')return (work,...options)=>target.runTransaction(transaction=>work(new Proxy(transaction,{get(tx,field){
      if(field==='delete')return ref=>{if(++deletions===201&&!failed){failed=true;throw Error('page network unavailable');}return tx.delete(ref);};
      const value=tx[field];return typeof value==='function'?value.bind(tx):value;
    }})),...options);
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  assert.equal(await runAccountDeletionJob(f.user.uid,db,deps,time),false);
  assert.equal((await f.root.collection('payments').get()).size,401);
  assert.equal((await f.root.get()).data().accountStatus,'deleting');assert.equal((await f.jobRef.get()).data().status,'pending');
  await finish(f,deps,time);assert.equal((await f.root.listCollections()).length,0);
}));

test('stolen deletion lease after Storage listing cannot select or delete the listed generation',async()=>withDeletionOwner('stolen-list',async f=>{
  const name=`users/${f.user.uid}/attachments/receipt/content`;await f.bucket.file(name).save(Buffer.from('keep'),{resumable:false});
  await accept(f);const real=dependencies(f);const time=clock();let stolen=false;
  const storage={deleteGeneration:(...args)=>real.storage.deleteGeneration(...args),listOwned:async(...args)=>{
    const listed=await real.storage.listOwned(...args);
    if(!stolen){stolen=true;const job=(await f.jobRef.get()).data();await f.jobRef.update({leaseToken:'replacement-worker',leaseGeneration:job.leaseGeneration+1});}
    return listed;
  }};
  assert.equal(await runAccountDeletionJob(f.user.uid,f.adminDb,{...real,storage},time),false);
  assert.equal((await f.bucket.file(name).download())[0].toString(),'keep');
  const job=(await f.jobRef.get()).data();assert.equal(job.leaseToken,'replacement-worker');assert.equal(job.storageObjectName,null);
  assert.equal(job.status,'leased');await finish(f,real,time);
}));

test('stolen lease after a successful generation deletion cannot publish stale progress',async()=>withDeletionOwner('stolen-progress',async f=>{
  const name=`users/${f.user.uid}/attachments/receipt/content`;await f.bucket.file(name).save(Buffer.from('owned'),{resumable:false});
  await accept(f);const real=dependencies(f);const time=clock();let stolen=false;
  const storage={listOwned:(...args)=>real.storage.listOwned(...args),deleteGeneration:async(...args)=>{
    const result=await real.storage.deleteGeneration(...args);
    if(!stolen){stolen=true;const job=(await f.jobRef.get()).data();await f.jobRef.update({leaseToken:'replacement-worker',leaseGeneration:job.leaseGeneration+1});}
    return result;
  }};
  assert.equal(await runAccountDeletionJob(f.user.uid,f.adminDb,{...real,storage},time),false);
  const job=(await f.jobRef.get()).data();assert.equal(job.leaseToken,'replacement-worker');assert.equal(job.step,'storage');
  assert.equal(job.storageObjectName,name);assert.equal((await f.root.get()).data().accountStatus,'deleting');await finish(f,real,time);
}));

for(const collection of ['notificationTokenBindings','systemJobs'])
  test(`a ${collection} row transferred to Bob after selection is preserved`,async()=>withDeletionOwner(`transfer-${collection}`,async alice=>withDeletionOwner(`recipient-${collection}`,async bob=>{
    const row=alice.adminDb.collection(collection).doc(`transfer-${alice.user.uid}`);
    await row.set({userId:alice.user.uid,schemaVersion:1,kind:'fixture',status:'cancelled'});await accept(alice);
    let transferred=false;
    function wrapQuery(query){return new Proxy(query,{get(target,key){
      if(key==='get')return async(...args)=>{const result=await target.get(...args);
        if(!transferred&&result.docs.some(doc=>doc.id===row.id)){transferred=true;await row.update({userId:bob.user.uid});}return result;};
      if(['where','orderBy','limit'].includes(key))return (...args)=>wrapQuery(target[key](...args));
      const value=target[key];return typeof value==='function'?value.bind(target):value;
    }});}
    const db=new Proxy(alice.adminDb,{get(target,key){
      if(key==='collection')return name=>name===collection?wrapQuery(target.collection(name)):target.collection(name);
      const value=target[key];return typeof value==='function'?value.bind(target):value;
    }});
    const time=clock(),deps=dependencies(alice);
    for(let n=0;n<10&&(await alice.jobRef.get()).data().status!=='complete';n++){
      time.advance(121000);time.elapsed(0);await runAccountDeletionJob(alice.user.uid,db,deps,time);
    }
    assert.equal(transferred,true);assert.equal((await row.get()).data().userId,bob.user.uid);
    assert.equal((await alice.jobRef.get()).data().status,'complete');assert.equal((await bob.root.get()).data().accountStatus,'active');
  })));

test('already missing Auth remains idempotent through session revocation and final identity deletion',async()=>withDeletionOwner('missing-auth',async f=>{
  await accept(f);await f.adminAuth.deleteUser(f.user.uid);await finish(f);
  assert.equal((await f.root.get()).exists,false);assert.equal((await f.jobRef.get()).data().status,'complete');
}));

for(const [label,seed] of [
  ['unknown root collection',f=>f.root.collection('futureAssets').doc('preserve').set({userId:f.user.uid,schemaVersion:1})],
  ['nested collection',async f=>{await f.root.collection('payments').doc('parent').set({userId:f.user.uid,schemaVersion:1});
    await f.root.collection('payments').doc('parent').collection('privateNotes').doc('child').set({userId:f.user.uid});}],
  ['missing parent with nested collection',f=>f.root.collection('contacts').doc('missing-parent').collection('privateNotes').doc('child').set({userId:f.user.uid})],
]) test(`${label} enters recovery without silently completing or deleting the parent`,async()=>withDeletionOwner(label.replaceAll(' ','-'),async f=>{
  await seed(f);await accept(f);await runAccountDeletionJob(f.user.uid,f.adminDb,dependencies(f),clock());
  const job=(await f.jobRef.get()).data();assert.equal(job.status,'needsRecovery');assert.equal(job.lastErrorCode,'unsupported-structure');
  assert.equal((await f.root.get()).data().accountStatus,'deleting');assert.notEqual((await f.root.listCollections()).length,0);
  if(label==='nested collection')assert.equal((await f.root.collection('payments').doc('parent').get()).exists,true);
}));

test('monotonic budget stops new pages while retaining continuation and outstanding financial records',async()=>withDeletionOwner('elapsed-budget',async f=>{
  await seedPayments(f,1);await accept(f);const real=dependencies(f);const time=clock();
  const storage={deleteGeneration:(...args)=>real.storage.deleteGeneration(...args),listOwned:async(...args)=>{
    const result=await real.storage.listOwned(...args);time.elapsed(60000);return result;
  }};
  await runAccountDeletionJob(f.user.uid,f.adminDb,{...real,storage},time);
  assert.equal((await f.root.collection('payments').get()).size,1);
  const job=(await f.jobRef.get()).data();assert.equal(job.status,'pending');assert.equal(job.step,'tokenBindings');
  await finish(f,real,time);
}));

test('late object events after account completion create only generation cleanup without resurrecting private history',async()=>withDeletionOwner('late-upload',async f=>{
  await accept(f);await finish(f);const fence=(await f.jobRef.get()).data();
  const name=`users/${f.user.uid}/attachments/late-receipt/content`;
  await f.bucket.file(name).save(Buffer.from('late-original'),{resumable:false,
    metadata:{contentType:'application/pdf',metadata:{userId:f.user.uid,attachmentId:'late-receipt'}}});
  const generation=(await f.bucket.file(name).getMetadata())[0].generation;
  const id=await enqueueAttachmentFinalization({bucket:f.bucket.name,name,generation},f.adminDb);
  const cleanup=(await f.adminDb.collection('systemJobs').doc(id).get()).data();
  assert.equal(cleanup.kind,'attachmentCleanup');assert.equal(cleanup.storageGeneration,generation);
  assert.equal((await f.root.get()).exists,false);assert.equal((await f.root.listCollections()).length,0);
  assert.deepEqual((await f.jobRef.get()).data(),fence);
  await runReadyJob(id,f.adminDb);
  assert.equal((await f.bucket.file(name).exists())[0],false);assert.equal((await f.root.listCollections()).length,0);
}));

test('dispatcher processes due jobs but leaves future jobs and completed fences unchanged',async()=>withDeletionOwner('dispatch',async f=>{
  await accept(f);const deps=dependencies(f);const now=new Date();
  await f.jobRef.update({nextRunAt:Timestamp.fromMillis(now.getTime()+1000)});
  assert.deepEqual(await dispatchAccountDeletionJobs(f.adminDb,deps,now,1),{examined:0,processed:0});
  await f.jobRef.update({nextRunAt:Timestamp.fromDate(now)});
  assert.deepEqual(await dispatchAccountDeletionJobs(f.adminDb,deps,now,1),{examined:1,processed:1});
  await finish(f,deps);const fence=(await f.jobRef.get()).data();
  assert.deepEqual(await dispatchAccountDeletionJobs(f.adminDb,deps,new Date(),1),{examined:0,processed:0});
  assert.deepEqual((await f.jobRef.get()).data(),fence);
}));
