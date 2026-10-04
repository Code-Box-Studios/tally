import {createHash,randomUUID} from 'node:crypto';
import {FieldValue,Timestamp,type DocumentData,type Firestore} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions';
import {exactObject} from '../shared/callable.js';
import {identifier,localToday,invalid} from '../shared/validation.js';
import {HttpsError} from 'firebase-functions/v2/https';
import {projectOwner,projectionLedger,projectionProfile} from '../dashboard/projector.js';
import {invalidLedger} from '../payments/ledger.js';
import {canClaimLease,leaseMatches} from './leases.js';

export function projectionJobId(uid:string):string {return `projection-${createHash('sha256').update(identifier(uid)).digest('hex')}`;}
function target(profile:DocumentData,ledger:DocumentData,now:Date) {
  return {targetSourceRevision:ledger.revision as number,targetProfileRevision:profile.revision as number,
    targetTimezone:profile.timezone as string,targetDay:localToday(profile.timezone,now)};
}
function sameTarget(job:DocumentData,value:ReturnType<typeof target>):boolean {
  return Object.entries(value).every(([key,entry])=>job[key]===entry);
}
function nextGeneration(job:DocumentData|undefined):number {
  const previous=job?.generation??0;
  if(!Number.isSafeInteger(previous) || previous<0 || previous>=Number.MAX_SAFE_INTEGER)return invalidLedger();
  return previous+1;
}
function assertJob(id:string,job:DocumentData):void {
  if(job.kind!=='ownerProjection' || job.schemaVersion!==1 || projectionJobId(job.userId)!==id)return invalidLedger();
}
const clearedLease={leaseToken:null,leaseGeneration:null,leaseExpiresAt:null};
export async function enqueueProjection(uid:string,db:Firestore,now=new Date(),force=false):Promise<boolean> {
  const root=db.doc(`users/${identifier(uid)}`);const jobRef=db.collection('systemJobs').doc(projectionJobId(uid));
  return db.runTransaction(async transaction=>{
    const [profileDoc,ledgerDoc,jobDoc]=await Promise.all([transaction.get(root),transaction.get(root.collection('ledgerState').doc('current')),transaction.get(jobRef)]);
    const rawProfile=profileDoc.data();const job=jobDoc.data();if(job)assertJob(jobRef.id,job);
    if(!rawProfile || rawProfile.userId!==uid || rawProfile.accountStatus!=='active') {
      if(job)transaction.update(jobRef,{status:'inactive',...clearedLease,nextRunAt:null,updatedAt:FieldValue.serverTimestamp()});
      return false;
    }
    const profile=projectionProfile(uid,rawProfile);const ledger=projectionLedger(uid,ledgerDoc.data());const currentTarget=target(profile,ledger,now);
    const unchanged=job && sameTarget(job,currentTarget);
    if(unchanged && job.status==='leased')return true;
    if(unchanged && job.status==='pending' && (!force || job.nextRunAt.toMillis()<=now.getTime()))return true;
    transaction.set(jobRef,{kind:'ownerProjection',schemaVersion:1,userId:uid,...currentTarget,
      status:'pending',nextRunAt:Timestamp.fromDate(now),...clearedLease,
      generation:unchanged?job.generation:nextGeneration(job),attempts:job?.attempts??0,lastErrorCode:null,
      createdAt:job?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    return true;
  });
}
export interface ProjectionLease {token:string;uid:string;generation:number}
export async function claimProjectionJob(jobId:string,db:Firestore,now=new Date()):Promise<ProjectionLease|null> {
  identifier(jobId);const token=randomUUID();const jobRef=db.collection('systemJobs').doc(jobId);
  return db.runTransaction(async transaction=>{
    const jobDoc=await transaction.get(jobRef);const job=jobDoc.data();if(!job)return null;assertJob(jobId,job);
    if(!canClaimLease({status:job.status,nextRunAt:job.nextRunAt?.toDate()??new Date(8640000000000000),leaseExpiresAt:job.leaseExpiresAt?.toDate()??null},now))return null;
    const root=db.doc(`users/${job.userId}`);
    const [profileDoc,ledgerDoc]=await Promise.all([transaction.get(root),transaction.get(root.collection('ledgerState').doc('current'))]);
    const rawProfile=profileDoc.data();
    if(!rawProfile || rawProfile.userId!==job.userId || rawProfile.accountStatus!=='active') {
      transaction.update(jobRef,{status:'inactive',nextRunAt:null,...clearedLease,updatedAt:FieldValue.serverTimestamp()});return null;
    }
    const profile=projectionProfile(job.userId,rawProfile);const ledger=projectionLedger(job.userId,ledgerDoc.data());
    const currentTarget=target(profile,ledger,now);const generation=sameTarget(job,currentTarget)?job.generation:nextGeneration(job);
    if(!Number.isSafeInteger(job.attempts) || job.attempts<0 || job.attempts>=Number.MAX_SAFE_INTEGER)return invalidLedger();
    transaction.update(jobRef,{...currentTarget,generation,status:'leased',leaseGeneration:generation,leaseToken:token,
      leaseExpiresAt:Timestamp.fromMillis(now.getTime()+6*60_000),attempts:job.attempts+1,updatedAt:FieldValue.serverTimestamp()});
    return {uid:job.userId as string,token,generation:generation as number};
  });
}
export async function finishProjectionJob(jobId:string,db:Firestore,token:string,now:Date,nextRefreshAt:Date):Promise<boolean> {
  const jobRef=db.collection('systemJobs').doc(identifier(jobId));
  return db.runTransaction(async transaction=>{
    const jobDoc=await transaction.get(jobRef);const job=jobDoc.data();if(!job)return false;assertJob(jobId,job);
    if(!leaseMatches(job as Parameters<typeof leaseMatches>[0],token))return false;
    const root=db.doc(`users/${job.userId}`);
    const [profileDoc,ledgerDoc]=await Promise.all([transaction.get(root),transaction.get(root.collection('ledgerState').doc('current'))]);
    const rawProfile=profileDoc.data();
    if(!rawProfile || rawProfile.userId!==job.userId || rawProfile.accountStatus!=='active') {
      transaction.update(jobRef,{status:'inactive',nextRunAt:null,...clearedLease,updatedAt:FieldValue.serverTimestamp()});return false;
    }
    const profile=projectionProfile(job.userId,rawProfile);const ledger=projectionLedger(job.userId,ledgerDoc.data());const currentTarget=target(profile,ledger,now);
    if(!sameTarget(job,currentTarget)) {
      transaction.update(jobRef,{...currentTarget,generation:nextGeneration(job),status:'pending',nextRunAt:Timestamp.fromDate(now),...clearedLease,updatedAt:FieldValue.serverTimestamp()});return false;
    }
    transaction.update(jobRef,{status:'pending',nextRunAt:Timestamp.fromMillis(Math.max(now.getTime(),nextRefreshAt.getTime())),
      ...clearedLease,attempts:0,lastErrorCode:null,lastCompletedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    return true;
  });
}
async function releaseFailedJob(jobId:string,db:Firestore,token:string,now:Date,error:unknown):Promise<void> {
  const code=error instanceof HttpsError?error.code:'internal';
  await db.runTransaction(async transaction=>{
    const ref=db.collection('systemJobs').doc(jobId);const snapshot=await transaction.get(ref);const job=snapshot.data();
    if(!job || !leaseMatches(job as Parameters<typeof leaseMatches>[0],token))return;
    const delay=Math.min(60*60_000,2**Math.min(job.attempts,12)*1000);
    transaction.update(ref,{status:'pending',nextRunAt:Timestamp.fromMillis(now.getTime()+delay),...clearedLease,lastErrorCode:code,updatedAt:FieldValue.serverTimestamp()});
  });
  logger.warn('Projection job will retry.',{jobId,code});
}
export async function dispatchProjectionJobs(db:Firestore,injectedNow?:Date,limit=25):Promise<{processed:number;examined:number}> {
  if(!Number.isInteger(limit) || limit<1 || limit>50)return invalid('Invalid worker batch size.');
  const clock=injectedNow?()=>injectedNow:()=>new Date();const now=clock();const queue=db.collection('systemJobs');
  const [pending,expired]=await Promise.all([
    queue.where('kind','==','ownerProjection').where('status','==','pending').where('nextRunAt','<=',Timestamp.fromDate(now)).orderBy('nextRunAt').limit(limit).get(),
    queue.where('kind','==','ownerProjection').where('status','==','leased').where('leaseExpiresAt','<=',Timestamp.fromDate(now)).orderBy('leaseExpiresAt').limit(limit).get(),
  ]);
  const candidates=[...pending.docs,...expired.docs].sort((a,b)=>{
    const time=(data:DocumentData)=>data.status==='pending'?data.nextRunAt.toMillis():data.leaseExpiresAt.toMillis();
    return time(a.data())-time(b.data()) || a.id.localeCompare(b.id);
  }).slice(0,limit);
  let processed=0;
  for(const candidate of candidates) {
    const lease=await claimProjectionJob(candidate.id,db,clock());if(!lease)continue;
    try {
      const projection=await projectOwner(lease.uid,db,injectedNow);
      if(projection.status==='stale')throw new HttpsError('aborted','Financial totals changed during projection.');
      if(await finishProjectionJob(candidate.id,db,lease.token,clock(),projection.nextRefreshAt))processed++;
    } catch(error) {await releaseFailedJob(candidate.id,db,lease.token,clock(),error);}
  }
  return {processed,examined:candidates.length};
}
export async function refreshDashboard(uid:string,input:unknown,db:Firestore):Promise<{accepted:true}> {
  const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']);identifier(envelope.commandId);exactObject(envelope.payload,[]);
  if(identifier(envelope.expectedOwnerUid)!==uid)throw new HttpsError('permission-denied','Your sign-in changed. Please try again.');
  const root=db.doc(`users/${uid}`);projectionProfile(uid,(await root.get()).data());
  if(!await enqueueProjection(uid,db,new Date(),true))throw new HttpsError('failed-precondition','Your account is unavailable.');
  return {accepted:true};
}
