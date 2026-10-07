import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {ref,getBytes} from 'firebase/storage';
import {withOwner,loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
require('firebase-admin/app').initializeApp({projectId:'demo-tally',storageBucket:'demo-tally.appspot.com'});
const readService=()=>require('./lib/src/attachments/download_service.js').downloadAttachment;
const png=readFileSync('web/icons/Icon-192.png');
async function fixture(owner,{finish=true}={}) {
 const parent=await owner.call('createObligation',owner.command('loan',loan()));
 const file=await owner.call('reserveAttachment',owner.command('reserve',{targetType:'obligation',targetId:parent.obligationId,filename:'receipt.png',contentType:'image/png',sizeBytes:png.length,sha256:null}));
 await owner.call('uploadAttachment',owner.command('upload',{attachmentId:file.attachmentId,expectedRevision:1,contentBase64:png.toString('base64')}));
 const gateway=new (require('./lib/src/attachments/storage_gateway.js').FirebaseAttachmentStorageGateway)(owner.adminBucket);
 if(finish) {
  const job=(await owner.adminDb.collection('systemJobs').where('userId','==',owner.user.uid).where('kind','==','attachmentFinalization').get()).docs[0];
  const lease=await require('./lib/src/attachments/attachment_jobs.js').claimAttachmentJob(job.id,owner.adminDb);
  await require('./lib/src/attachments/finalization.js').finalizeAttachment(job.id,lease.token,owner.adminDb,gateway);
 }
 return {...file,gateway,ref:owner.root.collection('attachments').doc(file.attachmentId),request:owner.command('read',{attachmentId:file.attachmentId})};
}
test('protected bytes stay token-free after repeated reads; direct owner SDK reads deny without changing history',async()=>withOwner('private-read',async owner=>{
 const file=await fixture(owner),ledger=(await owner.root.collection('ledgerState').doc('current').get()).data();
 const metadata=(await file.ref.get()).data();
 for(let i=0;i<2;i++) {
  const result=await owner.call('downloadAttachment',file.request);
  assert.deepEqual(Object.keys(result).sort(),['attachmentId','contentBase64','storageGeneration']);
  assert.equal(result.attachmentId,file.attachmentId);assert.equal(result.storageGeneration,metadata.storageGeneration);
  assert.deepEqual(Buffer.from(result.contentBase64,'base64'),png);
 }
 await assert.rejects(getBytes(ref(owner.storage,file.storagePath)),{code:'storage/unauthorized'});
 const [object]=await owner.adminBucket.file(file.storagePath).getMetadata();assert.ok(!object.metadata?.firebaseStorageDownloadTokens);
 assert.deepEqual((await file.ref.get()).data(),metadata);
 assert.deepEqual((await owner.root.collection('ledgerState').doc('current').get()).data(),ledger);
 assert.equal((await owner.root.collection('payments').get()).size,0);
 assert.equal((await owner.root.collection('commandReceipts').where('commandType','==','downloadAttachment').get()).size,0);
},{storage:true}));
test('private reads reject foreign envelopes, extra fields, unready and removed records',async()=>withOwner('private-read-denials',async owner=>withOwner('private-read-other',async other=>{
 const file=await fixture(owner,{finish:false});
 await assert.rejects(owner.call('downloadAttachment',file.request),{code:'functions/failed-precondition'});
 await assert.rejects(other.call('downloadAttachment',file.request),{code:'functions/permission-denied'});
 await assert.rejects(other.call('downloadAttachment',other.command('read',{attachmentId:file.attachmentId})),{code:'functions/failed-precondition'});
 await assert.rejects(owner.call('downloadAttachment',owner.command('extra',{attachmentId:file.attachmentId,storagePath:file.storagePath})),{code:'functions/invalid-argument'});
 await owner.call('removeAttachment',owner.command('remove',{attachmentId:file.attachmentId,expectedRevision:1}));
 await assert.rejects(owner.call('downloadAttachment',file.request),{code:'functions/failed-precondition'});
}),{storage:true}));
test('private reads recheck removal and inactive owners after every network boundary',async()=>{
 const download=readService();
 for(const action of ['remove','inactive'])for(const phase of ['first-head','bytes','final-head'])await withOwner(`private-${action}-${phase}`,async owner=>{
  const file=await fixture(owner);let heads=0;
  const change=async()=>{
   if(action==='inactive')await owner.root.update({accountStatus:'deleting'});
   else await owner.call('removeAttachment',owner.command('remove',{attachmentId:file.attachmentId,expectedRevision:(await file.ref.get()).data().revision}));
  };
  const gateway={
   metadata:async(...args)=>{const value=await file.gateway.metadata(...args);heads++;if(phase===(heads===1?'first-head':'final-head'))await change();return value;},
   download:async(...args)=>{const value=await file.gateway.download(...args);if(phase==='bytes')await change();return value;},
  };
  await assert.rejects(download(owner.user.uid,file.request,owner.adminDb,gateway),{code:'failed-precondition'});
 },{storage:true});
});
test('private reads reject changed generations, tokens and corrupted bytes without returning content',async()=>{
 const download=readService();
 for(const mismatch of ['generation','token','bytes','size','mime'])await withOwner(`private-${mismatch}`,async owner=>{
  const file=await fixture(owner),before=(await file.ref.get()).data();
  const gateway={
   metadata:async(...args)=>{const value=await file.gateway.metadata(...args);return {...value,...(mismatch==='generation'?{generation:'99999999999999999999'}:mismatch==='token'?{hasDownloadTokens:true}:mismatch==='size'?{sizeBytes:1}:mismatch==='mime'?{contentType:'text/html'}:{})};},
   download:async(...args)=>mismatch==='bytes'?new Uint8Array(png.length):file.gateway.download(...args),
  };
  await assert.rejects(download(owner.user.uid,file.request,owner.adminDb,gateway),{code:'failed-precondition'});
  assert.deepEqual((await file.ref.get()).data(),before);
 },{storage:true});
});
