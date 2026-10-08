import {getAuth,type Auth} from 'firebase-admin/auth';
import {FieldValue,type DocumentReference,type Firestore} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions';
import {identifier} from '../shared/validation.js';
import {canStartDeletionPage,deletionNetwork,type ActiveDeletionJob,type DeletionClock,type DeletionLease}
  from './deletion_contract.js';
import {claimAccountDeletion,DeletionLeaseLost,DeletionNeedsRecovery,guardDeletionLease,liveDeletionClock,
  readLeasedDeletion,releaseAccountDeletion,updateDeletionProgress} from './deletion_jobs.js';
import {validateDeletionObject,type AccountDeletionStorage} from './deletion_storage.js';

export interface AccountDeletionAuth {revokeAndDisable(uid:string):Promise<void>;deleteIdentity(uid:string):Promise<void>;}
export interface AccountDeletionDependencies {auth:AccountDeletionAuth;storage:AccountDeletionStorage;}
export class FirebaseAccountDeletionAuth implements AccountDeletionAuth {
  constructor(private readonly auth:Auth=getAuth()) {}
  async revokeAndDisable(uid:string):Promise<void> {
    identifier(uid);
    try {await this.auth.revokeRefreshTokens(uid);await this.auth.updateUser(uid,{disabled:true});}
    catch(error){if((error as {code?:string})?.code!=='auth/user-not-found')throw error;}
  }
  async deleteIdentity(uid:string):Promise<void> {
    identifier(uid);
    try {await this.auth.deleteUser(uid);}
    catch(error){if((error as {code?:string})?.code!=='auth/user-not-found')throw error;}
  }
}
export const ownedDeletionCollections=[
  'contacts','obligations','obligationInstances','payments','paymentEvidence','deductionAttempts','categories',
  'paymentSources','attachments','reminders','activities','notificationPreferences','notificationDevices',
  'commandReceipts','ledgerState','summaries',
] as const;
async function knownRoot(root:DocumentReference):Promise<readonly string[]> {
  const names=(await root.listCollections()).map(collection=>collection.id);
  if(names.some(name=>!ownedDeletionCollections.includes(name as typeof ownedDeletionCollections[number])))
    throw new DeletionNeedsRecovery('unsupported-structure');
  return names;
}
async function noChildren(refs:readonly DocumentReference[]):Promise<void> {
  const children=await Promise.all(refs.map(ref=>ref.listCollections()));
  if(children.some(collections=>collections.length>0))throw new DeletionNeedsRecovery('unsupported-structure');
}
async function current(db:Firestore,lease:DeletionLease,clock:DeletionClock):Promise<ActiveDeletionJob> {
  return db.runTransaction(transaction=>readLeasedDeletion(transaction,db,lease,clock));
}
async function ownerPage(db:Firestore,lease:DeletionLease,clock:DeletionClock):Promise<void> {
  const root=db.doc(`users/${lease.uid}`),names=await knownRoot(root);
  await db.runTransaction(async transaction=>{
    const job=await readLeasedDeletion(transaction,db,lease,clock);
    const collection=ownedDeletionCollections[job.collectionIndex];
    if(!collection) {
      guardDeletionLease(job,lease,clock);
      transaction.update(db.doc(`accountDeletionJobs/${lease.uid}`),{step:'systemJobs',updatedAt:FieldValue.serverTimestamp()});return;
    }
    const docs=await transaction.get(root.collection(collection).orderBy('__name__').limit(200));
    if(docs.empty&&names.includes(collection))throw new DeletionNeedsRecovery('unsupported-structure');
    if(docs.docs.some(doc=>doc.data().userId!==lease.uid||doc.data().schemaVersion!==1))
      throw new DeletionNeedsRecovery('unsupported-structure');
    await noChildren(docs.docs.map(doc=>doc.ref));guardDeletionLease(job,lease,clock);
    for(const doc of docs.docs)transaction.delete(doc.ref);
    transaction.update(db.doc(`accountDeletionJobs/${lease.uid}`),{
      ...(docs.empty?{collectionIndex:job.collectionIndex+1}:{}),updatedAt:FieldValue.serverTimestamp(),
    });
  });
}
async function topLevelPage(db:Firestore,lease:DeletionLease,clock:DeletionClock,collection:'notificationTokenBindings'|'systemJobs'):Promise<void> {
  // Select outside the transaction. A transfer after this query is protected by
  // the transactional ownership reread, never the stale selected snapshot.
  const selected=await db.collection(collection).where('userId','==',lease.uid).orderBy('__name__').limit(200).get();
  await db.runTransaction(async transaction=>{
    const job=await readLeasedDeletion(transaction,db,lease,clock);
    const live=await Promise.all(selected.docs.map(doc=>transaction.get(doc.ref)));
    const owned=live.filter(doc=>doc.exists&&doc.data()?.userId===lease.uid);
    if(owned.some(doc=>doc.data()?.schemaVersion!==1))throw new DeletionNeedsRecovery('unsupported-structure');
    await noChildren(owned.map(doc=>doc.ref));guardDeletionLease(job,lease,clock);
    for(const doc of owned)transaction.delete(doc.ref);
    transaction.update(db.doc(`accountDeletionJobs/${lease.uid}`),{
      ...(selected.empty?{step:collection==='notificationTokenBindings'?'ownerCollections':'deleteIdentity'}:{}),
      updatedAt:FieldValue.serverTimestamp(),
    });
  });
}
async function storagePage(db:Firestore,lease:DeletionLease,clock:DeletionClock,storage:AccountDeletionStorage,start:number):Promise<void> {
  let job=await current(db,lease,clock);
  const selection=job.storageObjectName!==null?[{name:job.storageObjectName,generation:job.storageGeneration!}]:
    await storage.listOwned(lease.uid,100);
  if(selection.length>100)throw new DeletionNeedsRecovery('unsupported-structure');
  if(selection.length===0) {
    await updateDeletionProgress(db,lease,clock,{step:'tokenBindings'});return;
  }
  for(const object of selection) {
    if(!canStartDeletionPage(0,clock.monotonicMs()-start))break;
    try {validateDeletionObject(lease.uid,object);}catch{throw new DeletionNeedsRecovery('unsupported-structure');}
    // Save the generation before any destructive RPC. A response loss retries
    // this generation and never uses the latest generation at the same name.
    await updateDeletionProgress(db,lease,clock,{storageObjectName:object.name,storageGeneration:object.generation});
    job=await current(db,lease,clock);guardDeletionLease(job,lease,clock);
    await storage.deleteGeneration(lease.uid,object.name,object.generation);
    await updateDeletionProgress(db,lease,clock,{storageObjectName:null,storageGeneration:null});
  }
}
async function completePage(db:Firestore,lease:DeletionLease,clock:DeletionClock,storage:AccountDeletionStorage):Promise<boolean> {
  const root=db.doc(`users/${lease.uid}`),names=await knownRoot(root);
  if(names.length>0) {
    // An empty query with a surviving collection ID means orphaned descendants
    // under a missing document; normal queries cannot silently purge those.
    const first=await Promise.all(names.map(name=>root.collection(name).limit(1).get()));
    if(first.some(page=>page.empty))throw new DeletionNeedsRecovery('unsupported-structure');
    await updateDeletionProgress(db,lease,clock,{step:'ownerCollections',collectionIndex:0});return false;
  }
  if((await storage.listOwned(lease.uid,1)).length>0) {
    await updateDeletionProgress(db,lease,clock,{step:'storage',collectionIndex:0});return false;
  }
  const [bindings,jobs]=await Promise.all([
    db.collection('notificationTokenBindings').where('userId','==',lease.uid).limit(1).get(),
    db.collection('systemJobs').where('userId','==',lease.uid).limit(1).get(),
  ]);
  if(!bindings.empty||!jobs.empty) {
    await updateDeletionProgress(db,lease,clock,{step:!bindings.empty?'tokenBindings':'systemJobs'});return false;
  }
  await db.runTransaction(async transaction=>{
    const job=await readLeasedDeletion(transaction,db,lease,clock);guardDeletionLease(job,lease,clock);
    transaction.delete(root);
    transaction.set(db.doc(`accountDeletionJobs/${lease.uid}`),{
      userId:lease.uid,schemaVersion:1,status:'complete',completedAt:FieldValue.serverTimestamp(),
    });
  });
  return true;
}
export async function runAccountDeletionJob(uid:string,db:Firestore,dependencies:AccountDeletionDependencies,clock:DeletionClock=liveDeletionClock):Promise<boolean> {
  identifier(uid);let lease:DeletionLease|null=null;let step='claim';const start=clock.monotonicMs();let pages=0;
  try {
    lease=await deletionNetwork(()=>claimAccountDeletion(uid,db,clock));if(!lease)return false;
    while(canStartDeletionPage(pages,clock.monotonicMs()-start)) {
      const job=await deletionNetwork(()=>current(db,lease!,clock));step=job.step;pages++;
      const done=await deletionNetwork(async()=>{
        switch(job.step) {
          case 'revokeSessions':
            await dependencies.auth.revokeAndDisable(uid);
            await updateDeletionProgress(db,lease!,clock,{step:'storage'});break;
          case 'storage':await storagePage(db,lease!,clock,dependencies.storage,start);break;
          case 'tokenBindings':await topLevelPage(db,lease!,clock,'notificationTokenBindings');break;
          case 'ownerCollections':await ownerPage(db,lease!,clock);break;
          case 'systemJobs':await topLevelPage(db,lease!,clock,'systemJobs');break;
          case 'deleteIdentity':
            await dependencies.auth.deleteIdentity(uid);
            await updateDeletionProgress(db,lease!,clock,{step:'deleteProfile'});break;
          case 'deleteProfile':return completePage(db,lease!,clock,dependencies.storage);
        }
        return false;
      });
      if(done){logger.info('Account deletion complete',{kind:'accountDeletion',step:'complete',pages});return true;}
    }
    await deletionNetwork(()=>releaseAccountDeletion(db,lease!,clock));
    logger.info('Account deletion continued',{kind:'accountDeletion',step,pages});return true;
  } catch(error) {
    if(lease&&!(error instanceof DeletionLeaseLost)) {
      try {await deletionNetwork(()=>releaseAccountDeletion(db,lease!,clock,error));}catch{}
    }
    logger.warn('Account deletion delayed',{kind:'accountDeletion',step,pages,
      outcome:error instanceof DeletionNeedsRecovery?'needsRecovery':error instanceof DeletionLeaseLost?'leaseChanged':'delayed'});
    return false;
  }
}
