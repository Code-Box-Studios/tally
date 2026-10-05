import {readFileSync} from 'node:fs';
import {after, before, test} from 'node:test';
import {initializeTestEnvironment, assertFails} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, collection, getDocs} from 'firebase/firestore';
import {ref, uploadBytes, getBytes} from 'firebase/storage';
let env;
before(async () => {
  // Missing rule files intentionally fail, rather than silently skipping security.
  // Isolate malformed rule fixtures from the demo-tally Functions triggers.
  env = await initializeTestEnvironment({projectId:'demo-tally-rules', firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9199,rules:readFileSync('storage.rules','utf8')}});
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(),'users/alice/obligations/debt'),{userId:'alice',amount:100});
    await uploadBytes(ref(context.storage(),'users/alice/attachments/receipt'),new Uint8Array([1,2]),{contentType:'image/png'});
  });
});
after(async () => {if(env){await env.clearFirestore();await env.clearStorage();await env.cleanup();}});
for(const actor of ['anonymous','alice','bob']) {
  test(`${actor} cannot access private Firestore or Storage`,async()=>{
    const context=actor==='anonymous'?env.unauthenticatedContext():env.authenticatedContext(actor);
    await assertFails(getDoc(doc(context.firestore(),'users/alice/obligations/debt')));
    await assertFails(getDocs(collection(context.firestore(),'users/alice/obligations')));
    await assertFails(setDoc(doc(context.firestore(),`users/${actor}/obligations/new`),{userId:actor}));
    await assertFails(getBytes(ref(context.storage(),'users/alice/attachments/receipt')));
    await assertFails(uploadBytes(ref(context.storage(),`users/${actor}/attachments/new`),new Uint8Array([3])));
  });
}
