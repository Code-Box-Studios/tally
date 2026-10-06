import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ref,getBytes} from 'firebase/storage';
import {withOwner,loan} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app');initializeApp({projectId:'demo-tally',storageBucket:'demo-tally.appspot.com'});
const {Timestamp}=require('firebase-admin/firestore');
const jobs=()=>require('./lib/src/attachments/attachment_jobs.js');
const workers=()=>require('./lib/src/attachments/finalization.js');
const cleanup=()=>require('./lib/src/attachments/cleanup.js');
const storageGateway=()=>require('./lib/src/attachments/storage_gateway.js');
const png=readFileSync('web/icons/Icon-192.png');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const payload=(targetId,bytes,patch={})=>({targetType:'obligation',targetId,filename:'agreement.png',contentType:'image/png',sizeBytes:bytes.length,sha256:sha(bytes),...patch});
async function fixture(owner,bytes=png,patch={}){
 const created=await owner.call('createObligation',owner.command('debt',loan()));
 const reservation=await owner.call('reserveAttachment',owner.command('file',payload(created.obligationId,bytes,patch)));
 const uploaded=await owner.call('uploadAttachment',owner.command('upload',{attachmentId:reservation.attachmentId,expectedRevision:1,contentBase64:bytes.toString('base64')}));
 const event={bucket:'demo-tally.appspot.com',name:reservation.storagePath,generation:uploaded.storageGeneration};
 const id=await jobs().enqueueAttachmentFinalization(event,owner.adminDb);
 assert.equal(id,jobs().attachmentFinalizationId(owner.user.uid,reservation.attachmentId,event.generation));
 return {created,reservation,event,id,meta:owner.root.collection('attachments').doc(reservation.attachmentId),gateway:new (storageGateway().FirebaseAttachmentStorageGateway)(owner.adminBucket)};
}
async function finish(owner,fixture,gateway=fixture.gateway){
 const lease=await jobs().claimAttachmentJob(fixture.id,owner.adminDb);assert.ok(lease);
 return workers().finalizeAttachment(fixture.id,lease.token,owner.adminDb,gateway);
}
test('genuine SDK image finalization removes tokens, publishes once and permits authenticated bytes only',async()=>withOwner('file-ready',async owner=>{
 const f=await fixture(owner),ledger=(await owner.root.collection('ledgerState').doc('current').get()).data();
 const object=owner.adminBucket.file(f.reservation.storagePath),[before]=await object.getMetadata();
 assert.ok(!before.metadata?.firebaseStorageDownloadTokens);
 await finish(owner,f);
 const ready=(await f.meta.get()).data();assert.equal(ready.state,'ready');assert.equal(ready.sha256,sha(png));assert.equal(ready.sizeBytes,png.length);assert.equal(ready.contentType,'image/png');assert.equal(ready.storageGeneration,f.event.generation);
 const [after]=await object.getMetadata();assert.ok(!after.metadata?.firebaseStorageDownloadTokens);
 assert.deepEqual(new Uint8Array(await getBytes(ref(owner.storage,f.reservation.storagePath))),new Uint8Array(png));
 const response=await fetch(`http://127.0.0.1:9199/v0/b/demo-tally.appspot.com/o/${encodeURIComponent(f.reservation.storagePath)}?alt=media&token=synthetic-unusable-token`);
 assert.ok([401,403,404].includes(response.status));
 assert.equal(await jobs().enqueueAttachmentFinalization(f.event,owner.adminDb),f.id);assert.equal(await jobs().claimAttachmentJob(f.id,owner.adminDb),null);
 assert.equal((await owner.root.collection('activities').where('type','==','attachmentReady').get()).size,1);
 assert.deepEqual((await owner.root.collection('ledgerState').doc('current').get()).data(),ledger);
 assert.equal((await owner.root.collection('payments').get()).size,0);
},{storage:true}));
test('spoofed bytes and checksum mismatches reject evidence and release their slot once',async()=>{
 for(const [label,bytes,patch,reason] of [['spoof',Buffer.from('not an image'),{},'unsupportedFormat'],['checksum',png,{sha256:'a'.repeat(64)},'checksumMismatch']])
  await withOwner(`file-${label}`,async owner=>{
   const f=await fixture(owner,bytes,patch);await finish(owner,f);
   assert.equal((await f.meta.get()).data().state,'rejected');assert.equal((await f.meta.get()).data().rejectionReason,reason);
   assert.equal((await owner.root.collection('attachmentSets').get()).docs[0].data().activeCount,0);
   assert.equal(await jobs().claimAttachmentJob(f.id,owner.adminDb),null);
  },{storage:true});
});
test('removal during a byte read fences publication and only cleans the matched generation',async()=>withOwner('file-remove-race',async owner=>{
 const f=await fixture(owner),gateway={
  bucket:f.gateway.bucket,
  metadata:(...args)=>f.gateway.metadata(...args),stripTokens:(...args)=>f.gateway.stripTokens(...args),delete:(...args)=>f.gateway.delete(...args),
  download:async(...args)=>{
   const bytes=await f.gateway.download(...args),current=(await f.meta.get()).data();
   await owner.call('removeAttachment',owner.command('remove',{attachmentId:f.reservation.attachmentId,expectedRevision:current.revision}));return bytes;
  },
 };
 await finish(owner,f,gateway);assert.equal((await f.meta.get()).data().state,'deleted');
 const id=require('./lib/src/attachments/cleanup_jobs.js').attachmentCleanupId(owner.user.uid,f.reservation.attachmentId),lease=await jobs().claimAttachmentJob(id,owner.adminDb);assert.ok(lease);
 await cleanup().cleanupAttachment(id,lease.token,owner.adminDb,f.gateway);
 assert.equal((await owner.adminBucket.file(f.reservation.storagePath).exists())[0],false);
 assert.equal((await owner.root.collection('attachmentSets').get()).docs[0].data().activeCount,0);
 assert.equal(await jobs().claimAttachmentJob(id,owner.adminDb),null);
},{storage:true}));
test('expired lease and deactivated ownership after token removal never publish a ready file',async()=>{
 for(const phase of ['lease','owner'])await withOwner(`file-${phase}-race`,async owner=>{
  const f=await fixture(owner),gateway={
   bucket:f.gateway.bucket,metadata:(...args)=>f.gateway.metadata(...args),download:(...args)=>f.gateway.download(...args),delete:(...args)=>f.gateway.delete(...args),
   stripTokens:async(...args)=>{
    await f.gateway.stripTokens(...args);
    if(phase==='lease')await owner.adminDb.collection('systemJobs').doc(f.id).update({leaseExpiresAt:Timestamp.fromMillis(Date.now()-1)});
    else await owner.root.update({accountStatus:'deleting'});
   },
  };
  const lease=await jobs().claimAttachmentJob(f.id,owner.adminDb);assert.ok(lease);
  try{await workers().finalizeAttachment(f.id,lease.token,owner.adminDb,gateway);}catch(error){assert.equal(error.code,'aborted');}
  assert.notEqual((await f.meta.get()).data().state,'ready');assert.equal((await owner.root.collection('activities').where('type','==','attachmentReady').get()).size,0);
 },{storage:true});
});
test('an old object event cannot publish or delete a replacement generation',async()=>withOwner('file-generation',async owner=>{
 const f=await fixture(owner),lease=await jobs().claimAttachmentJob(f.id,owner.adminDb);assert.ok(lease);
 await owner.adminBucket.file(f.reservation.storagePath).save(png,{resumable:false,metadata:{contentType:'image/png',metadata:{userId:owner.user.uid,attachmentId:f.reservation.attachmentId}}});
 const [latest]=await owner.adminBucket.file(f.reservation.storagePath).getMetadata();assert.notEqual(latest.generation,f.event.generation);
 await workers().finalizeAttachment(f.id,lease.token,owner.adminDb,f.gateway);
 assert.notEqual((await f.meta.get()).data().state,'ready');
 assert.equal(await f.gateway.delete(f.reservation.storagePath,f.event.generation),false);assert.equal((await owner.adminBucket.file(f.reservation.storagePath).exists())[0],true);
},{storage:true}));
function receiptPdf(){
 let body='%PDF-1.7\n',offsets=[0];
 const stream='BT /F1 12 Tf 20 20 Td (Emulator receipt) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${value}\nendobj\n`;});
 const xref=Buffer.byteLength(body);body+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(body);
}
test('a genuine PDF and a lost token-removal response reconcile without duplicate history',async()=>withOwner('file-pdf-retry',async owner=>{
 const bytes=receiptPdf(),f=await fixture(owner,bytes,{filename:'receipt.pdf',contentType:'application/pdf'});
 const lease=await jobs().claimAttachmentJob(f.id,owner.adminDb);assert.ok(lease);
 const gateway={bucket:f.gateway.bucket,metadata:(...args)=>f.gateway.metadata(...args),download:(...args)=>f.gateway.download(...args),delete:(...args)=>f.gateway.delete(...args),stripTokens:async(...args)=>{await f.gateway.stripTokens(...args);throw new Error('Synthetic lost response');}};
 await assert.rejects(workers().finalizeAttachment(f.id,lease.token,owner.adminDb,gateway));
 assert.notEqual((await f.meta.get()).data().state,'ready');
 await jobs().releaseAttachmentJob(f.id,lease.token,owner.adminDb);
 await owner.adminDb.collection('systemJobs').doc(f.id).update({nextRunAt:Timestamp.fromMillis(Date.now()-1)});
 await finish(owner,f);
 assert.equal((await f.meta.get()).data().contentType,'application/pdf');assert.equal((await f.meta.get()).data().sha256,sha(bytes));
 assert.equal((await owner.root.collection('activities').where('type','==','attachmentReady').get()).size,1);
 assert.equal((await owner.root.collection('attachmentSets').get()).docs[0].data().activeCount,1);
},{storage:true}));
test('expiry cleanup persists a bounded continuation and releases 120 reservations exactly once',async()=>withOwner('file-expiry-pages',async owner=>{
 const parents=[];for(let i=0;i<12;i++)parents.push(await owner.call('createObligation',owner.command(`debt-${i}`,loan())));
 const seed=await owner.call('reserveAttachment',owner.command('seed',payload(parents[0].obligationId,png)));
 const base=(await owner.root.collection('attachments').doc(seed.attachmentId).get()).data();
 const old=Timestamp.fromMillis(Date.now()-25*3_600_000),batch=owner.adminDb.batch();
 batch.delete(owner.root.collection('attachments').doc(seed.attachmentId));
 const setId=require('./lib/src/attachments/reservation_service.js').attachmentSetId;
 for(let i=0;i<120;i++){
  const parent=parents[Math.floor(i/10)].obligationId,id=`expired-${String(i).padStart(3,'0')}`;
  batch.set(owner.root.collection('attachments').doc(id),{...base,attachmentId:id,targetId:parent,obligationId:parent,storagePath:`users/${owner.user.uid}/attachments/${id}/content`,expiresAt:old,createdAt:old,updatedAt:old});
 }
 for(const parent of parents)batch.set(owner.root.collection('attachmentSets').doc(setId('obligation',parent.obligationId)),{userId:owner.user.uid,schemaVersion:1,targetType:'obligation',targetId:parent.obligationId,activeCount:10,revision:1,createdAt:old,updatedAt:old});
 await batch.commit();
 const ledger=(await owner.root.collection('ledgerState').doc('current').get()).data(),gateway=new (storageGateway().FirebaseAttachmentStorageGateway)(owner.adminBucket);
 const first=await cleanup().cleanupExpiredAttachments(owner.adminDb,gateway,undefined,100);assert.equal(first.examined,100);assert.equal(first.expired,100);assert.equal(first.hasMore,true);
 const second=await cleanup().cleanupExpiredAttachments(owner.adminDb,gateway,undefined,100);assert.equal(second.examined,20);assert.equal(second.expired,20);
 const third=await cleanup().cleanupExpiredAttachments(owner.adminDb,gateway,undefined,100);assert.equal(third.examined,0);
 assert.ok((await owner.root.collection('attachmentSets').get()).docs.every(doc=>doc.data().activeCount===0));
 assert.equal((await owner.root.collection('attachments').where('rejectionReason','==','uploadExpired').get()).size,120);
 assert.deepEqual((await owner.root.collection('ledgerState').doc('current').get()).data(),ledger);
 await assert.rejects(cleanup().cleanupExpiredAttachments(owner.adminDb,gateway,undefined,101));
},{storage:true}));
test('protected ingestion replays permanent receipts and rejects forged, foreign and changed payloads',async()=>withOwner('file-ingestion-a',async owner=>withOwner('file-ingestion-b',async other=>{
 const created=await owner.call('createObligation',owner.command('debt',loan()));
 const reserved=await owner.call('reserveAttachment',owner.command('reserve',payload(created.obligationId,png)));
 const request=owner.command('upload',{attachmentId:reserved.attachmentId,expectedRevision:1,contentBase64:png.toString('base64')});
 await assert.rejects(other.call('uploadAttachment',request),{code:'functions/permission-denied'});
 await assert.rejects(other.call('uploadAttachment',other.command('foreign',request.payload)),{code:'functions/failed-precondition'});
 for(const [id,patch] of [['extra',{storagePath:'users/other/file'}],['invalid-base64',{contentBase64:'!!!!'}],['newline',{contentBase64:`${request.payload.contentBase64}\n`}],['empty',{contentBase64:''}],['size',{contentBase64:Buffer.from('different-size').toString('base64')}]])
  await assert.rejects(owner.call('uploadAttachment',owner.command(id,{...request.payload,...patch})),{code:'functions/invalid-argument'});
 const accepted=await owner.call('uploadAttachment',request);assert.deepEqual(await owner.call('uploadAttachment',request),accepted);
 const changed=Buffer.from(png);changed[20]^=1;
 await assert.rejects(owner.call('uploadAttachment',{...request,payload:{...request.payload,contentBase64:changed.toString('base64')}}),{code:'functions/already-exists'});
 const receipt=(await owner.root.collection('commandReceipts').doc('upload').get()).data();
 assert.equal('contentBase64' in receipt,false);assert.equal(JSON.stringify(receipt).includes(png.toString('base64')),false);
 assert.equal((await owner.root.collection('attachmentSets').get()).docs[0].data().activeCount,1);
}),{storage:true}));
test('a maximum-size genuine PDF traverses the protected callable and private SDK download',async()=>withOwner('file-max-size',async owner=>{
 const base=receiptPdf().toString(),split=base.lastIndexOf('%%EOF');
 const bytes=Buffer.from(`${base.slice(0,split)}%${' '.repeat(10_485_760-Buffer.byteLength(base)-2)}\n${base.slice(split)}`);
 assert.equal(bytes.length,10_485_760);
 const f=await fixture(owner,bytes,{filename:'large-receipt.pdf',contentType:'application/pdf'});await finish(owner,f);
 assert.equal((await f.meta.get()).data().state,'ready');
 assert.equal((await getBytes(ref(owner.storage,f.reservation.storagePath),10_485_760)).byteLength,10_485_760);
 const tooLarge=Buffer.alloc(10_485_761).toString('base64');
 await assert.rejects(owner.call('uploadAttachment',owner.command('too-large',{attachmentId:f.reservation.attachmentId,expectedRevision:1,contentBase64:tooLarge})),{code:'functions/invalid-argument'});
},{storage:true}));
test('an unexpected managed token fails closed instead of publishing private metadata',async()=>withOwner('file-unexpected-token',async owner=>{
 const f=await fixture(owner);
 await owner.adminBucket.file(f.reservation.storagePath).setMetadata({metadata:{firebaseStorageDownloadTokens:'synthetic-unusable-token'}});
 const lease=await jobs().claimAttachmentJob(f.id,owner.adminDb);assert.ok(lease);
 await assert.rejects(workers().finalizeAttachment(f.id,lease.token,owner.adminDb,f.gateway),{code:'failed-precondition'});
 assert.notEqual((await f.meta.get()).data().state,'ready');
 await assert.rejects(getBytes(ref(owner.storage,f.reservation.storagePath)),{code:'storage/unauthorized'});
 assert.equal((await owner.root.collection('activities').where('type','==','attachmentReady').get()).size,0);
},{storage:true}));
test('owner deactivation during ingestion queues exact-generation cleanup without ready publication',async()=>withOwner('file-ingestion-owner-race',async owner=>{
 const created=await owner.call('createObligation',owner.command('debt',loan()));
 const reserved=await owner.call('reserveAttachment',owner.command('reserve',payload(created.obligationId,png)));
 const storage=new (storageGateway().FirebaseAttachmentStorageGateway)(owner.adminBucket);
 const gateway={bucket:storage.bucket,metadata:(...args)=>storage.metadata(...args),download:(...args)=>storage.download(...args),stripTokens:(...args)=>storage.stripTokens(...args),delete:(...args)=>storage.delete(...args),create:async(...args)=>{await storage.create(...args);await owner.root.update({accountStatus:'deleting'});}};
 await assert.rejects(require('./lib/src/attachments/upload_service.js').uploadAttachment(owner.user.uid,owner.command('upload',{attachmentId:reserved.attachmentId,expectedRevision:1,contentBase64:png.toString('base64')}),owner.adminDb,gateway),{code:'aborted'});
 const id=require('./lib/src/attachments/cleanup_jobs.js').attachmentCleanupId(owner.user.uid,reserved.attachmentId);
 assert.equal((await owner.adminDb.collection('systemJobs').doc(id).get()).exists,true);
 const lease=await jobs().claimAttachmentJob(id,owner.adminDb);assert.ok(lease);
 await cleanup().cleanupAttachment(id,lease.token,owner.adminDb,storage);
 assert.equal((await owner.adminBucket.file(reserved.storagePath).exists())[0],false);
 assert.equal((await owner.root.collection('attachments').doc(reserved.attachmentId).get()).data().state,'awaitingUpload');
},{storage:true}));

test('two upload command IDs cannot concurrently create one reserved object',async()=>withOwner('file-upload-command-race',async owner=>{
 const created=await owner.call('createObligation',owner.command('debt',loan()));
 const reserved=await owner.call('reserveAttachment',owner.command('reserve',payload(created.obligationId,png)));
 const storage=new (storageGateway().FirebaseAttachmentStorageGateway)(owner.adminBucket);
 let started,release,creates=0;
 const begun=new Promise(resolve=>{started=resolve;}),held=new Promise(resolve=>{release=resolve;});
 const gateway={bucket:storage.bucket,metadata:(...args)=>storage.metadata(...args),create:async(...args)=>{creates++;if(creates===1){started();await held;}await storage.create(...args);}};
 const body={attachmentId:reserved.attachmentId,expectedRevision:1,contentBase64:png.toString('base64')};
 const upload=require('./lib/src/attachments/upload_service.js').uploadAttachment;
 const first=upload(owner.user.uid,owner.command('first',body),owner.adminDb,gateway);await begun;
 try{await assert.rejects(upload(owner.user.uid,owner.command('second',body),owner.adminDb,gateway),{code:'aborted'});assert.equal(creates,1);}
 finally{release();await first;}
 assert.equal((await owner.root.collection('commandReceipts').where('commandType','==','uploadAttachment').get()).size,1);
},{storage:true}));
test('a lost ingestion create response reconciles the same command without overwriting bytes',async()=>withOwner('file-upload-lost-response',async owner=>{
 const created=await owner.call('createObligation',owner.command('debt',loan()));
 const reserved=await owner.call('reserveAttachment',owner.command('reserve',payload(created.obligationId,png)));
 const storage=new (storageGateway().FirebaseAttachmentStorageGateway)(owner.adminBucket);let creates=0;
 const gateway={bucket:storage.bucket,metadata:(...args)=>storage.metadata(...args),create:async(...args)=>{creates++;await storage.create(...args);throw new Error('Synthetic lost upload response');}};
 const request=owner.command('upload',{attachmentId:reserved.attachmentId,expectedRevision:1,contentBase64:png.toString('base64')}),upload=require('./lib/src/attachments/upload_service.js').uploadAttachment;
 await assert.rejects(upload(owner.user.uid,request,owner.adminDb,gateway));
 const before=await storage.metadata(reserved.storagePath),accepted=await upload(owner.user.uid,request,owner.adminDb,gateway);
 assert.equal(creates,1);assert.equal(accepted.storageGeneration,before.generation);
 assert.deepEqual(await upload(owner.user.uid,request,owner.adminDb,gateway),accepted);
},{storage:true}));
test('cleanup retries after a lost delete response and preserves a newer replacement',async()=>withOwner('file-cleanup-retry',async owner=>{
 const f=await fixture(owner),current=(await f.meta.get()).data();
 await owner.call('removeAttachment',owner.command('remove',{attachmentId:f.reservation.attachmentId,expectedRevision:current.revision}));
 const id=require('./lib/src/attachments/cleanup_jobs.js').attachmentCleanupId(owner.user.uid,f.reservation.attachmentId),lease=await jobs().claimAttachmentJob(id,owner.adminDb);assert.ok(lease);
 const gateway={bucket:f.gateway.bucket,metadata:(...args)=>f.gateway.metadata(...args),delete:async(...args)=>{await f.gateway.delete(...args);throw new Error('Synthetic lost delete response');}};
 await assert.rejects(cleanup().cleanupAttachment(id,lease.token,owner.adminDb,gateway));
 assert.equal((await owner.adminDb.collection('systemJobs').doc(id).get()).data().storageGeneration,f.event.generation);
 await owner.adminBucket.file(f.reservation.storagePath).save(png,{resumable:false,metadata:{contentType:'image/png',metadata:{userId:owner.user.uid,attachmentId:f.reservation.attachmentId}}});
 const replacement=await f.gateway.metadata(f.reservation.storagePath);assert.notEqual(replacement.generation,f.event.generation);
 await jobs().releaseAttachmentJob(id,lease.token,owner.adminDb);await owner.adminDb.collection('systemJobs').doc(id).update({nextRunAt:Timestamp.fromMillis(Date.now()-1)});
 const retry=await jobs().claimAttachmentJob(id,owner.adminDb);assert.ok(retry);
 await cleanup().cleanupAttachment(id,retry.token,owner.adminDb,f.gateway);
 assert.equal((await f.gateway.metadata(f.reservation.storagePath)).generation,replacement.generation);
 assert.equal((await f.meta.get()).data().state,'deleted');assert.equal((await owner.root.collection('attachmentSets').get()).docs[0].data().activeCount,0);
},{storage:true}));

test('every finalization network boundary checks the shared budget before publication',async()=>{
 for(const stage of ['initial-head','download','tokens','verified-head'])await withOwner(`file-budget-${stage}`,async owner=>{
  const f=await fixture(owner);let elapsed=0,heads=0;
  const budget=new (require('./lib/src/attachments/work_budget.js').AttachmentWorkBudget)(()=>elapsed);
  const gateway={bucket:f.gateway.bucket,
   metadata:async(...args)=>{const result=await f.gateway.metadata(...args);heads++;if(stage===(heads===1?'initial-head':'verified-head'))elapsed=55_000;return result;},
   download:async(...args)=>{const result=await f.gateway.download(...args);if(stage==='download')elapsed=55_000;return result;},
   stripTokens:async(...args)=>{await f.gateway.stripTokens(...args);if(stage==='tokens')elapsed=55_000;},
  };
  const lease=await jobs().claimAttachmentJob(f.id,owner.adminDb);assert.ok(lease);
  await assert.rejects(workers().finalizeAttachment(f.id,lease.token,owner.adminDb,gateway,undefined,budget),{code:'deadline-exceeded'});
  assert.notEqual((await f.meta.get()).data().state,'ready');assert.equal((await owner.root.collection('activities').where('type','==','attachmentReady').get()).size,0);
 },{storage:true});
});
test('newer lease generations after HEAD, bytes or final HEAD cannot publish',async()=>{
 for(const stage of ['initial-head','download','verified-head'])await withOwner(`file-fence-${stage}`,async owner=>{
  const f=await fixture(owner);let heads=0;
  const replace=()=>owner.adminDb.collection('systemJobs').doc(f.id).update({generation:2});
  const gateway={bucket:f.gateway.bucket,
   metadata:async(...args)=>{const result=await f.gateway.metadata(...args);heads++;if(stage===(heads===1?'initial-head':'verified-head'))await replace();return result;},
   download:async(...args)=>{const result=await f.gateway.download(...args);if(stage==='download')await replace();return result;},stripTokens:(...args)=>f.gateway.stripTokens(...args),
  };
  const lease=await jobs().claimAttachmentJob(f.id,owner.adminDb);assert.ok(lease);
  assert.equal(await workers().finalizeAttachment(f.id,lease.token,owner.adminDb,gateway),false);
  assert.notEqual((await f.meta.get()).data().state,'ready');assert.equal((await owner.root.collection('activities').where('type','==','attachmentReady').get()).size,0);
 },{storage:true});
});
