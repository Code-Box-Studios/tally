import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,deleteUser} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getFirestore,connectFirestoreEmulator,terminate} from 'firebase/firestore';
import {getStorage,connectStorageEmulator} from 'firebase/storage';
const require=createRequire(new URL('../../../functions/package.json',import.meta.url));
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=require('firebase-admin/app');
const {getFirestore:adminFirestore}=require('firebase-admin/firestore');
const {getStorage:adminStorage}=require('firebase-admin/storage');
export async function withOwner(label,run,{storage:includeStorage=false}={}){
 for(const field of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']){
  if(!/^127\.0\.0\.1:\d+$/.test(process.env[field]??''))throw new Error(`Set local ${field}; live data is prohibited.`);
 }
 if(includeStorage&&process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw new Error('Set the local Storage emulator; live file access is prohibited.');
 const app=initializeApp({projectId:'demo-tally',apiKey:'demo-tally',appId:'demo-tally',authDomain:'demo-tally.firebaseapp.com',storageBucket:'demo-tally.appspot.com'},`${label}-${Date.now()}-${Math.random()}`);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const functions=getFunctions(app,'asia-southeast1');connectFunctionsEmulator(functions,'127.0.0.1',5001);
 const storage=includeStorage?getStorage(app):null;if(storage)connectStorageEmulator(storage,'127.0.0.1',9199);
 const admin=initializeAdmin({projectId:'demo-tally',storageBucket:'demo-tally.appspot.com'},app.name);const adminDb=adminFirestore(admin);
 const adminBucket=includeStorage?adminStorage(admin).bucket():null;
 let user;
 try{
  user=(await createUserWithEmailAndPassword(auth,`${label}-${Date.now()}-${Math.floor(Math.random()*1e6)}@example.test`,'local-test-password')).user;
  const call=async(name,payload)=>(await httpsCallable(functions,name)(payload)).data;
  await call('bootstrapUser',{});
  const root=adminDb.doc(`users/${user.uid}`);
  const command=(id,payload)=>({commandId:id,expectedOwnerUid:user.uid,payload});
  return await run({user,call,command,root,adminDb,db,storage,adminBucket});
 }finally{
  if(user){
    const root=adminDb.doc(`users/${user.uid}`);
    // Match protected account deletion: close ownership before children are
    // removed, so delayed financial triggers never see an active partial ledger.
    await root.update({accountStatus:'deleting'});
    if(adminBucket)await adminBucket.deleteFiles({prefix:`users/${user.uid}/attachments/`,force:true});
    await adminDb.recursiveDelete(root);
    const jobs=await adminDb.collection('systemJobs').where('userId','==',user.uid).get();
    for(const job of jobs.docs)await job.ref.delete();
    await deleteUser(user);
  }
  await terminate(db);await deleteApp(app);await deleteAdmin(admin);
 }
}
export const loan=(overrides={})=>({title:'Personal loan',description:'Borrowed money',notes:'',direction:'owedByMe',currency:'PHP',amountMinor:1_000_000,originationDate:'2020-01-01',dueDate:'2026-10-15',contactId:null,categoryId:'default-personal-loan',paymentSourceId:null,interestInfo:null,...overrides});
export const contact=(overrides={})=>({kind:'person',displayName:'John',organizationType:null,email:null,phone:null,address:null,notes:'',archived:false,...overrides});
export const source=(overrides={})=>({name:'Cash',type:'cash',nickname:null,lastFour:null,notes:'',active:true,...overrides});
