import {Timestamp} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {identifier} from '../shared/validation.js';

export const deletionSteps = ['revokeSessions','storage','tokenBindings','ownerCollections','systemJobs',
  'deleteIdentity','deleteProfile','complete'] as const;
export type DeletionStep = typeof deletionSteps[number];
export type DeletionStatus = 'pending'|'leased'|'needsRecovery'|'complete';
export interface DeletionView {userId:string; status:DeletionStatus; step:DeletionStep;}
export interface CompletedDeletionJob {userId:string; schemaVersion:1; status:'complete'; completedAt:Timestamp;}
export interface ActiveDeletionJob {
  userId:string; schemaVersion:1; requestCommandId:string; status:Exclude<DeletionStatus,'complete'>;
  step:Exclude<DeletionStep,'complete'>; collectionIndex:number; nextRunAt:Timestamp; attempts:number;
  leaseToken:string|null; leaseGeneration:number; leaseExpiresAt:Timestamp|null; lastErrorCode:string|null;
  storageObjectName:string|null; storageGeneration:string|null; createdAt:Timestamp; updatedAt:Timestamp; completedAt:null;
}
export type DeletionJob = ActiveDeletionJob|CompletedDeletionJob;
export interface DeletionLease {uid:string; token:string; generation:number;}
export interface DeletionClock {now():Date; monotonicMs():number;}

function ownedEnvelope(uid:string,input:unknown):Record<string,unknown> {
  identifier(uid);
  const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']);
  identifier(envelope.commandId);
  if(identifier(envelope.expectedOwnerUid)!==uid)
    throw new HttpsError('permission-denied','Your sign-in changed. Please try again.');
  return envelope;
}
export function validateDeletionRequest(uid:string,input:unknown):{commandId:string} {
  const envelope=ownedEnvelope(uid,input);
  const payload=exactObject(envelope.payload,['confirmation']);
  if(payload.confirmation!=='DELETE')throw new HttpsError('invalid-argument','Confirm account deletion.');
  return {commandId:envelope.commandId as string};
}
export function validateDeletionStatusRequest(uid:string,input:unknown):{commandId:string} {
  const envelope=ownedEnvelope(uid,input);
  exactObject(envelope.payload,[]);
  return {commandId:envelope.commandId as string};
}
export function requireRecentAuthentication(authTime:unknown,now:Date):void {
  const age=typeof authTime==='number'?now.getTime()-authTime*1000:NaN;
  if(typeof authTime!=='number'||!Number.isSafeInteger(authTime)||authTime<0||
      !Number.isFinite(age)||age>300000||age< -30000)
    throw new HttpsError('failed-precondition','Sign in again to delete your account.',{reason:'requires-recent-login'});
}
function recovery():never {throw new HttpsError('failed-precondition','Your account deletion needs recovery.');}
function timestamp(value:unknown):value is Timestamp {
  return value instanceof Timestamp&&Number.isSafeInteger(value.toMillis());
}
function boundedInteger(value:unknown,min:number,max:number):value is number {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
}
function validId(value:unknown):value is string {
  return typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export function parseDeletionJob(uid:string,input:unknown):DeletionJob {
  if(!validId(uid)||!input||typeof input!=='object'||Array.isArray(input))return recovery();
  const job=input as Record<string,unknown>;
  if(job.userId!==uid||job.schemaVersion!==1)return recovery();
  const complete=job.status==='complete';
  const fields=complete?['userId','schemaVersion','status','completedAt']:[
    'userId','schemaVersion','requestCommandId','status','step','collectionIndex','nextRunAt','attempts',
    'leaseToken','leaseGeneration','leaseExpiresAt','lastErrorCode','storageObjectName','storageGeneration',
    'createdAt','updatedAt','completedAt',
  ];
  if(Object.keys(job).length!==fields.length||fields.some(field=>!Object.hasOwn(job,field)))return recovery();
  if(complete){if(!timestamp(job.completedAt))return recovery();return job as unknown as CompletedDeletionJob;}
  if(!['pending','leased','needsRecovery'].includes(job.status as string)||!validId(job.requestCommandId)||
      !deletionSteps.slice(0,-1).includes(job.step as ActiveDeletionJob['step'])||
      !boundedInteger(job.collectionIndex,0,16)||!boundedInteger(job.attempts,0,1000000)||
      !boundedInteger(job.leaseGeneration,0,1000000)||!timestamp(job.nextRunAt)||
      !timestamp(job.createdAt)||!timestamp(job.updatedAt)||job.completedAt!==null)return recovery();
  if(job.status==='leased') {
    if(!validId(job.leaseToken)||!timestamp(job.leaseExpiresAt)||job.leaseGeneration===0||job.attempts===0)return recovery();
  } else if(job.leaseToken!==null||job.leaseExpiresAt!==null)return recovery();
  if(job.lastErrorCode!==null&&(typeof job.lastErrorCode!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(job.lastErrorCode)))return recovery();
  if(job.storageObjectName!==null||job.storageGeneration!==null) {
    const prefix=`users/${uid}/attachments/`;
    if(job.step!=='storage'||typeof job.storageObjectName!=='string'||!job.storageObjectName.startsWith(prefix)||
        job.storageObjectName.length<=prefix.length||job.storageObjectName.length>2048||/[\x00-\x1f\x7f]/.test(job.storageObjectName)||
        typeof job.storageGeneration!=='string'||!/^[1-9][0-9]{0,31}$/.test(job.storageGeneration))return recovery();
  }
  return job as unknown as ActiveDeletionJob;
}
export function deletionView(job:DeletionJob):DeletionView {
  return {userId:job.userId,status:job.status,step:job.status==='complete'?'complete':job.step};
}
export function canClaimDeletionJob(job:DeletionJob,now:Date):boolean {
  return job.status==='pending'?job.nextRunAt.toMillis()<=now.getTime():
    job.status==='leased'&&job.leaseExpiresAt!==null&&job.leaseExpiresAt.toMillis()<=now.getTime();
}
export function deletionLeaseMatches(job:DeletionJob,lease:DeletionLease,now:Date):job is ActiveDeletionJob {
  return job.userId===lease.uid&&job.status==='leased'&&job.leaseToken===lease.token&&
    job.leaseGeneration===lease.generation&&job.leaseExpiresAt!==null&&job.leaseExpiresAt.toMillis()>now.getTime();
}
export function canStartDeletionPage(pages:number,elapsedMs:number):boolean {
  return Number.isInteger(pages)&&pages>=0&&pages<10&&Number.isFinite(elapsedMs)&&elapsedMs>=0&&elapsedMs<60000;
}
export function deletionRetryDelay(attempts:number):number {
  return Math.min(3600000,30000*2**Math.min(7,Math.max(0,attempts-1)));
}
export async function deletionNetwork<T>(operation:()=>Promise<T>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([operation(),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new HttpsError('deadline-exceeded','Account cleanup is delayed.')),20000);
    })]);
  } finally {if(timer)clearTimeout(timer);}
}
