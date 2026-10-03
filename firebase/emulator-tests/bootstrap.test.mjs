import { test } from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,deleteUser} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,terminate} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getStorage,connectStorageEmulator,ref,getBytes} from 'firebase/storage';

test('Auth UID reaches callable; private Firestore/Storage stay denied',async()=>{
  const app=initializeApp({projectId:'demo-tally',apiKey:'demo-tally',appId:'demo-tally',authDomain:'demo-tally.firebaseapp.com',storageBucket:'demo-tally.appspot.com'},'bootstrap');
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
  const functions=getFunctions(app);connectFunctionsEmulator(functions,'127.0.0.1',5001);
  const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9199);
  let user;
  try {
    await assert.rejects(httpsCallable(functions,'emulatorHealth')({}),{code:'functions/unauthenticated'});
    user=(await createUserWithEmailAndPassword(auth,`foundation-${Date.now()}@example.test`,'local-test-password')).user;
    const {data}=await httpsCallable(functions,'emulatorHealth')({});
    assert.deepEqual(data,{mode:'emulator',userId:user.uid});
    await assert.rejects(httpsCallable(functions,'emulatorHealth')({userId:'someone-else'}),{code:'functions/invalid-argument'});
    await assert.rejects(getDoc(doc(db,`users/${user.uid}/obligations/private`)),{code:'permission-denied'});
    await assert.rejects(getBytes(ref(storage,`users/${user.uid}/attachments/private`)),{code:'storage/unauthorized'});
  } finally {if(user)await deleteUser(user);await terminate(db);await deleteApp(app);}
});
