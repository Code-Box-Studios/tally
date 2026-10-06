import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,Timestamp} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,getMetadata,deleteObject,listAll} from 'firebase/storage';
import {withOwner} from './support/session.mjs';
let env,uid;
const path=id=>`users/${uid}/attachments/${id}/content`;
const metadata=(id,patch={})=>({contentType:'application/pdf',customMetadata:{userId:uid,attachmentId:id},...patch});
before(async()=>{
  // StorageLayer evaluates cross-service Firestore reads in the emulator's
  // configured project even when a test bucket has another project name.
  env=await initializeTestEnvironment({projectId:'demo-tally',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9199,rules:readFileSync('storage.rules','utf8')}});
});
after(async()=>{if(env){await env.clearStorage();await env.clearFirestore();await env.cleanup();}});
async function reservation(id,patch={}){
  await env.withSecurityRulesDisabled(async ctx=>await setDoc(doc(ctx.firestore(),`users/${uid}/attachments/${id}`),{
    userId:uid,schemaVersion:1,attachmentId:id,storagePath:path(id),state:'awaitingUpload',declaredContentType:'application/pdf',declaredSizeBytes:4,
    expiresAt:Timestamp.fromMillis(Date.now()+86_400_000),...patch,
  }));
}
test('direct reserved upload is denied; owner ready bytes succeed while others cannot read, overwrite, delete or list',async()=>withOwner('storage-ready',async owner=>{
  uid=owner.user.uid;
  await reservation('valid');const storage=env.authenticatedContext(uid).storage(),object=ref(storage,path('valid'));
  await assertFails(uploadBytes(object,new Uint8Array([1,2,3,4]),metadata('valid')));
  await env.withSecurityRulesDisabled(async ctx=>await uploadBytes(ref(ctx.storage(),path('valid')),new Uint8Array([1,2,3,4]),metadata('valid')));
  await assertFails(getBytes(object));
  let generation;await env.withSecurityRulesDisabled(async ctx=>{generation=(await getMetadata(ref(ctx.storage(),path('valid')))).generation;});
  await reservation('valid',{state:'ready',contentType:'application/pdf',sizeBytes:4,storageGeneration:generation==='1'?'2':'1'});
  await assertFails(getBytes(object));
  await reservation('valid',{state:'ready',contentType:'application/pdf',sizeBytes:4,storageGeneration:generation});
  assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(object))),new Uint8Array([1,2,3,4]));
  await reservation('valid');await assertFails(uploadBytes(object,new Uint8Array([4,3,2,1]),metadata('valid')));
  await reservation('valid',{state:'ready',contentType:'application/pdf',sizeBytes:4,storageGeneration:generation});
  for(const ctx of [env.unauthenticatedContext(),env.authenticatedContext('bob')])await assertFails(getBytes(ref(ctx.storage(),path('valid'))));
  await assertFails(uploadBytes(object,new Uint8Array([1,2,3,4]),metadata('valid')));
  await assertFails(deleteObject(object));await assertFails(listAll(ref(storage,`users/${uid}/attachments`)));
}));
test('reservation, MIME, size, owner, state and metadata checks reject forged uploads',async()=>withOwner('storage-forged',async owner=>{
  uid=owner.user.uid;const storage=env.authenticatedContext(uid).storage();
  await assertFails(uploadBytes(ref(storage,path('missing')),new Uint8Array(4),metadata('missing')));
  const cases=[
    ['processing',{state:'processing'},4,{}],['foreign',{userId:'bob'},4,{}],['wrong-path',{storagePath:'users/bob/attachments/x/content'},4,{}],
    ['expired',{expiresAt:Timestamp.fromMillis(Date.now()-1000)},4,{}],['zero',{declaredSizeBytes:0},0,{}],
    ['oversize',{declaredSizeBytes:10_485_761},10_485_761,{}],['size',{},3,{}],
    ['mime',{},4,{contentType:'image/png'}],['unsafe-mime',{declaredContentType:'text/html'},4,{contentType:'text/html'}],
    ['extra',{},4,{customMetadata:{userId:uid,attachmentId:'extra',notes:'private'}}],
    ['wrong-id',{},4,{customMetadata:{userId:uid,attachmentId:'other'}}],
    ['wrong-owner',{},4,{customMetadata:{userId:'bob',attachmentId:'wrong-owner'}}],
  ];
  for(const [id,patch,size,meta] of cases){
    await reservation(id,patch);
    try{await assertFails(uploadBytes(ref(storage,path(id)),new Uint8Array(size),metadata(id,meta)));}
    catch(error){error.message=`${id}: ${error.message}`;throw error;}
  }
  await reservation('foreign-client');await assertFails(uploadBytes(ref(env.authenticatedContext('bob').storage(),path('foreign-client')),new Uint8Array(4),metadata('foreign-client')));
  await assertFails(uploadBytes(ref(storage,`users/${uid}/attachments/foreign-client/other`),new Uint8Array(4),metadata('foreign-client')));
}));
test('direct token-bearing SDK uploads are denied as well as ordinary creates',async()=>withOwner('storage-token-normalization',async owner=>{
  uid=owner.user.uid;await reservation('token');
  const object=ref(env.authenticatedContext(uid).storage(),path('token'));
  // No client create can bypass trusted ingestion, including this reserved key
  // that firebase-tools hides from rule-visible custom metadata.
  await assertFails(uploadBytes(object,new Uint8Array(4),metadata('token',{
    customMetadata:{userId:uid,attachmentId:'token',firebaseStorageDownloadTokens:'synthetic-unusable-token'},
  })));
  await assertFails(getBytes(object));
}));
test('inactive ownership denies existing ready reads and reserved creates',async()=>withOwner('storage-inactive',async owner=>{
  uid=owner.user.uid;
  await reservation('inactive');
  await reservation('inactive-create');
  let generation;
  await env.withSecurityRulesDisabled(async ctx=>{
    generation=(await uploadBytes(ref(ctx.storage(),path('inactive')),new Uint8Array(4),metadata('inactive'))).metadata.generation;
  });
  await reservation('inactive',{state:'ready',contentType:'application/pdf',sizeBytes:4,storageGeneration:generation});
  const object=ref(env.authenticatedContext(uid).storage(),path('inactive'));
  await assertSucceeds(getBytes(object));
  await owner.root.update({accountStatus:'deleting'});
  await assertFails(getBytes(object));
  await assertFails(uploadBytes(ref(env.authenticatedContext(uid).storage(),path('inactive-create')),new Uint8Array(4),metadata('inactive-create')));
}));
