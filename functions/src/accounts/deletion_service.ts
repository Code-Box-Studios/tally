import {FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {revision} from '../shared/validation.js';
import {deletionView,parseDeletionJob,requireRecentAuthentication,validateDeletionRequest,validateDeletionStatusRequest,
  type DeletionView} from './deletion_contract.js';

export async function requestAccountDeletion(uid:string,input:unknown,authTime:unknown,db:Firestore,now?:Date):Promise<DeletionView> {
  const {commandId}=validateDeletionRequest(uid,input);
  const root=db.doc(`users/${uid}`);const jobRef=db.doc(`accountDeletionJobs/${uid}`);
  return db.runTransaction(async transaction=>{
    const [job,profile]=await Promise.all([transaction.get(jobRef),transaction.get(root)]);
    // The permanent UID job is the acceptance receipt. Retrying cannot start a
    // second deletion or require new authentication for an already accepted one.
    if(job.exists)return deletionView(parseDeletionJob(uid,job.data()));
    const trustedNow=now??new Date();
    requireRecentAuthentication(authTime,trustedNow);
    const data=profile.data();
    if(!data||data.userId!==uid||data.schemaVersion!==1||data.accountStatus!=='active')
      throw new HttpsError('failed-precondition','Your account is unavailable.');
    let nextRevision:number;
    try {nextRevision=revision(data.revision)+1;}
    catch {throw new HttpsError('failed-precondition','Your account needs recovery.');}
    transaction.create(jobRef,{
      userId:uid,schemaVersion:1,requestCommandId:commandId,status:'pending',step:'revokeSessions',
      collectionIndex:0,nextRunAt:Timestamp.fromDate(trustedNow),attempts:0,leaseToken:null,leaseGeneration:0,
      leaseExpiresAt:null,lastErrorCode:null,storageObjectName:null,storageGeneration:null,
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),completedAt:null,
    });
    transaction.update(root,{accountStatus:'deleting',revision:nextRevision,updatedAt:FieldValue.serverTimestamp()});
    return {userId:uid,status:'pending',step:'revokeSessions'};
  });
}

export async function getAccountDeletionStatus(uid:string,input:unknown,db:Firestore):Promise<DeletionView|null> {
  validateDeletionStatusRequest(uid,input);
  const job=await db.doc(`accountDeletionJobs/${uid}`).get();
  return job.exists?deletionView(parseDeletionJob(uid,job.data())):null;
}
