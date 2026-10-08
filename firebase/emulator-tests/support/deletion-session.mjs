import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getFirestore,connectFirestoreEmulator,terminate} from 'firebase/firestore';
const require=createRequire(new URL('../../../functions/package.json',import.meta.url));
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=require('firebase-admin/app');
const {getFirestore:adminFirestore}=require('firebase-admin/firestore');
const {getAuth:adminAuthentication}=require('firebase-admin/auth');
const {getStorage:adminStorage}=require('firebase-admin/storage');

export async function withDeletionOwner(label,run) {
  for(const field of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])
    if(!/^127\.0\.0\.1:\d+$/.test(process.env[field]??''))throw Error(`Local ${field} required.`);
  if(process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199'||process.env.GCLOUD_PROJECT!=='demo-tally')
    throw Error('Account deletion tests require only the demo-tally emulators.');
  const name=`deletion-${label}-${Date.now()}-${Math.random()}`;
  const app=initializeApp({projectId:'demo-tally',apiKey:'demo-tally',appId:'demo-tally',authDomain:'demo-tally.firebaseapp.com'},name);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
  const functions=getFunctions(app,'asia-southeast1');connectFunctionsEmulator(functions,'127.0.0.1',5001);
  const admin=initializeAdmin({projectId:'demo-tally',storageBucket:'demo-tally.appspot.com'},name);
  const adminDb=adminFirestore(admin);const adminAuth=adminAuthentication(admin);const bucket=adminStorage(admin).bucket();
  let user;
  try {
    user=(await createUserWithEmailAndPassword(auth,`${label}-${Date.now()}-${Math.floor(Math.random()*1e6)}@example.test`,'local-test-password')).user;
    const call=async(name,payload)=>(await httpsCallable(functions,name)(payload)).data;
    await call('bootstrapUser',{});
    const root=adminDb.doc(`users/${user.uid}`);const jobRef=adminDb.doc(`accountDeletionJobs/${user.uid}`);
    const command=(commandId,payload)=>({commandId,expectedOwnerUid:user.uid,payload});
    return await run({user,auth,call,command,root,jobRef,adminDb,adminAuth,bucket,db});
  } finally {
    // Admin teardown remains possible after the feature disables/deletes Auth.
    // Only this synthetic fixture's captured UID and exact private prefix apply.
    if(user) {
      const root=adminDb.doc(`users/${user.uid}`);
      if((await root.get()).exists)await root.update({accountStatus:'deleting'});
      await bucket.deleteFiles({prefix:`users/${user.uid}/attachments/`,force:true});
      await adminDb.recursiveDelete(root);
      for(const collection of ['systemJobs','notificationTokenBindings']) {
        const rows=await adminDb.collection(collection).where('userId','==',user.uid).get();
        for(const row of rows.docs)await row.ref.delete();
      }
      await adminDb.doc(`accountDeletionJobs/${user.uid}`).delete();
      try {await adminAuth.deleteUser(user.uid);}catch(error){if(error.code!=='auth/user-not-found')throw error;}
    }
    await terminate(db);await deleteApp(app);await deleteAdmin(admin);
  }
}
