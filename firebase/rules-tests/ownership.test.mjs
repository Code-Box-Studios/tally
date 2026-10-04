import {readFileSync} from 'node:fs';
import {after,before,test} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,query,limit,collectionGroup} from 'firebase/firestore';
let env;
before(async () => {
  env = await initializeTestEnvironment({projectId:'demo-tally',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
  await env.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    await setDoc(doc(db,'users/alice'),{userId:'alice',accountStatus:'active'});
    await setDoc(doc(db,'users/bob'),{userId:'bob',accountStatus:'active'});
    await setDoc(doc(db,'users/deleting'),{userId:'deleting',accountStatus:'deleting'});
    await setDoc(doc(db,'users/alice/obligations/debt'),{userId:'alice',remainingMinor:700000});
    await setDoc(doc(db,'users/alice/obligations/forged'),{userId:'bob'});
    await setDoc(doc(db,'users/alice/summaries/forged'),{userId:'bob'});
    await setDoc(doc(db,'users/deleting/obligations/debt'),{userId:'deleting'});
    for(const name of ['devices','paymentReversals','attachmentSets','unexpected']) await setDoc(doc(db,`users/alice/${name}/private`),{userId:'alice'});
  });
});
after(async()=>{if(env){await env.clearFirestore();await env.cleanup();}});
test('active owner reads profile, own document and bounded lists without a userId filter',async()=>{
  const db=env.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(db,'users/alice')));
  await assertSucceeds(getDoc(doc(db,'users/alice/obligations/debt')));
  await assertSucceeds(getDocs(query(collection(db,'users/alice/obligations'),limit(50))));
});
test('unauthenticated, foreign-owner and inactive accounts have no financial reads',async()=>{
  for(const actor of [null,'bob','deleting']) {
    const db=(actor===null?env.unauthenticatedContext():env.authenticatedContext(actor)).firestore();
    await assertFails(getDoc(doc(db,'users/alice')));
    await assertFails(getDoc(doc(db,'users/alice/obligations/debt')));
    await assertFails(getDocs(query(collection(db,'users/alice/obligations'),limit(50))));
  }
  const db=env.authenticatedContext('deleting').firestore();
  await assertFails(getDoc(doc(db,'users/deleting')));
  await assertFails(getDoc(doc(db,'users/deleting/obligations/debt')));
});
test('unbounded lists, forged gets, collection groups and private collections are denied',async()=>{
  const db=env.authenticatedContext('alice').firestore();
  await assertFails(getDocs(collection(db,'users/alice/obligations')));
  await assertFails(getDocs(query(collection(db,'users/alice/obligations'),limit(201))));
  await assertFails(getDocs(query(collectionGroup(db,'obligations'),limit(50))));
  await assertFails(getDocs(query(collection(db,'users'),limit(50))));
  await assertFails(getDoc(doc(db,'users/alice/obligations/forged')));
  for(const name of ['devices','paymentReversals','attachmentSets','unexpected']) {
    await assertFails(getDoc(doc(db,`users/alice/${name}/private`)));
    await assertFails(getDocs(query(collection(db,`users/alice/${name}`),limit(50))));
  }
});
test('even the owner cannot directly create, edit or delete canonical data',async()=>{
  const db=env.authenticatedContext('alice').firestore();
  await assertFails(updateDoc(doc(db,'users/alice'),{defaultCurrency:'USD'}));
  await assertFails(setDoc(doc(db,'users/alice/payments/forged'),{userId:'alice',amountMinor:300000}));
  await assertFails(updateDoc(doc(db,'users/alice/obligations/debt'),{remainingMinor:0}));
  await assertFails(deleteDoc(doc(db,'users/alice/obligations/debt')));
});
test('only an active owner can observe a missing summary while it is being generated',async()=>{
  const path='users/alice/summaries/dashboard-PHP';
  const own=env.authenticatedContext('alice').firestore();
  const missing=await assertSucceeds(getDoc(doc(own,path)));
  if(missing.exists())throw new Error('Expected a missing projection');
  await assertFails(getDoc(doc(own,'users/alice/summaries/forged')));
  await assertFails(getDoc(doc(own,'users/alice/obligations/missing')));
  await assertFails(setDoc(doc(own,path),{userId:'alice'}));
  for(const actor of [null,'bob','deleting']){
    const db=(actor===null?env.unauthenticatedContext():env.authenticatedContext(actor)).firestore();
    await assertFails(getDoc(doc(db,path)));
  }
  await assertFails(getDoc(doc(env.authenticatedContext('deleting').firestore(),'users/deleting/summaries/dashboard-PHP')));
});
