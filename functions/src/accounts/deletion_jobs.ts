import {randomUUID} from 'node:crypto';
import {FieldValue,Timestamp,type Firestore,type Transaction} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions';
import {identifier} from '../shared/validation.js';
import {canClaimDeletionJob,deletionLeaseMatches,deletionRetryDelay,deletionNetwork,parseDeletionJob,
  type ActiveDeletionJob,type DeletionClock,type DeletionLease} from './deletion_contract.js';
import {runAccountDeletionJob,type AccountDeletionDependencies} from './deletion_worker.js';

export class DeletionLeaseLost extends Error {}
export class DeletionNeedsRecovery extends Error {
  constructor(readonly safeCode:'unsupported-structure'|'profile-fence'|'invalid-job') {super(safeCode);}
}
export const liveDeletionClock:DeletionClock={now:()=>new Date(),monotonicMs:()=>performance.now()};
export async function claimAccountDeletion(uid:string,db:Firestore,clock:DeletionClock):Promise<DeletionLease|null> {
  identifier(uid);const ref=db.doc(`accountDeletionJobs/${uid}`);
  return db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);if(!snapshot.exists)return null;
    const raw=snapshot.data()!;
    // Never rewrite a foreign or future-schema fence to fit today's worker.
    if(raw.userId!==uid||raw.schemaVersion!==1)return null;
    let job;
    try {job=parseDeletionJob(uid,raw);}
    catch {
      transaction.update(ref,{status:'needsRecovery',lastErrorCode:'invalid-job',leaseToken:null,
        leaseExpiresAt:null,updatedAt:FieldValue.serverTimestamp()});return null;
    }
    const now=clock.now();if(!canClaimDeletionJob(job,now)||job.status==='complete')return null;
    const profile=(await transaction.get(db.doc(`users/${uid}`))).data();
    if(profile&&(profile.userId!==uid||profile.schemaVersion!==1||profile.accountStatus!=='deleting')||
        !profile&&job.step!=='deleteProfile'||job.attempts>=1000000||job.leaseGeneration>=1000000) {
      transaction.update(ref,{status:'needsRecovery',lastErrorCode:'profile-fence',leaseToken:null,
        leaseExpiresAt:null,updatedAt:FieldValue.serverTimestamp()});return null;
    }
    const token=randomUUID(),generation=job.leaseGeneration+1;
    transaction.update(ref,{status:'leased',leaseToken:token,leaseGeneration:generation,
      leaseExpiresAt:Timestamp.fromMillis(now.getTime()+120000),attempts:job.attempts+1,updatedAt:FieldValue.serverTimestamp()});
    return {uid,token,generation};
  });
}
export async function readLeasedDeletion(transaction:Transaction,db:Firestore,lease:DeletionLease,clock:DeletionClock):Promise<ActiveDeletionJob> {
  const ref=db.doc(`accountDeletionJobs/${lease.uid}`);
  const [snapshot,profileDoc]=await Promise.all([transaction.get(ref),transaction.get(db.doc(`users/${lease.uid}`))]);
  if(!snapshot.exists)throw new DeletionLeaseLost();
  const job=parseDeletionJob(lease.uid,snapshot.data());
  if(!deletionLeaseMatches(job,lease,clock.now()))throw new DeletionLeaseLost();
  const profile=profileDoc.data();
  if(profile&&(profile.userId!==lease.uid||profile.schemaVersion!==1||profile.accountStatus!=='deleting')||
      !profile&&job.step!=='deleteProfile')throw new DeletionNeedsRecovery('profile-fence');
  return job;
}
export function guardDeletionLease(job:ActiveDeletionJob,lease:DeletionLease,clock:DeletionClock):void {
  if(!deletionLeaseMatches(job,lease,clock.now()))throw new DeletionLeaseLost();
}
export type DeletionProgress=Partial<Pick<ActiveDeletionJob,'step'|'collectionIndex'|'storageObjectName'|'storageGeneration'>>;
export async function updateDeletionProgress(db:Firestore,lease:DeletionLease,clock:DeletionClock,patch:DeletionProgress):Promise<void> {
  await db.runTransaction(async transaction=>{
    const job=await readLeasedDeletion(transaction,db,lease,clock);
    parseDeletionJob(lease.uid,{...job,...patch});guardDeletionLease(job,lease,clock);
    transaction.update(db.doc(`accountDeletionJobs/${lease.uid}`),{...patch,updatedAt:FieldValue.serverTimestamp()});
  });
}
export async function releaseAccountDeletion(db:Firestore,lease:DeletionLease,clock:DeletionClock,error?:unknown):Promise<void> {
  const ref=db.doc(`accountDeletionJobs/${lease.uid}`);
  await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);if(!snapshot.exists)return;
    const job=parseDeletionJob(lease.uid,snapshot.data());const now=clock.now();
    if(!deletionLeaseMatches(job,lease,now))return;
    const recovery=error instanceof DeletionNeedsRecovery;
    transaction.update(ref,{status:recovery?'needsRecovery':'pending',leaseToken:null,leaseExpiresAt:null,
      nextRunAt:Timestamp.fromMillis(now.getTime()+(error&&!recovery?deletionRetryDelay(job.attempts):0)),
      lastErrorCode:recovery?error.safeCode:error?'cleanup-delayed':null,updatedAt:FieldValue.serverTimestamp()});
  });
}
export async function dispatchAccountDeletionJobs(db:Firestore,dependencies:AccountDeletionDependencies,injectedNow?:Date,limit=5):Promise<{examined:number;processed:number}> {
  if(!Number.isInteger(limit)||limit<1||limit>5)throw new Error('Invalid account deletion dispatch limit.');
  const start=performance.now(),now=injectedNow??new Date(),jobs=db.collection('accountDeletionJobs');
  const [pending,expired]=await deletionNetwork(()=>Promise.all([
    jobs.where('status','==','pending').where('nextRunAt','<=',Timestamp.fromDate(now)).orderBy('nextRunAt').limit(limit).get(),
    jobs.where('status','==','leased').where('leaseExpiresAt','<=',Timestamp.fromDate(now)).orderBy('leaseExpiresAt').limit(limit).get(),
  ]));
  const candidates=[...new Map([...pending.docs,...expired.docs].map(doc=>[doc.id,doc])).values()].sort((a,b)=>{
    const instant=(data:Record<string,unknown>)=>((data.status==='pending'?data.nextRunAt:data.leaseExpiresAt) as Timestamp).toMillis();
    return instant(a.data())-instant(b.data())||a.id.localeCompare(b.id);
  }).slice(0,limit);
  let examined=0,processed=0;
  for(const candidate of candidates) {
    if(performance.now()-start>=360000)break;
    examined++;
    const clock=injectedNow?{now:()=>injectedNow,monotonicMs:()=>performance.now()}:liveDeletionClock;
    if(await runAccountDeletionJob(candidate.id,db,dependencies,clock))processed++;
  }
  logger.info('Account deletion sweep',{kind:'accountDeletion',examined,processed});
  return {examined,processed};
}
