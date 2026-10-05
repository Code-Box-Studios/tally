import {createHash} from 'node:crypto';
import {FieldPath,FieldValue,Timestamp,type DocumentData,type DocumentReference,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {identifier,localToday,revision} from '../shared/validation.js';
import {invalidLedger} from '../payments/ledger.js';
import {nextCivilBoundary} from '../jobs/leases.js';
import {calculateProjection} from './projection.js';

export const projectionFormulaVersion=1;
export const contactSummaryId=(contactId:string):string=>`contact-${createHash('sha256').update(identifier(contactId)).digest('hex')}`;
export interface ProjectionResult {status:'published'|'stale';sourceRevision:number;nextRefreshAt:Date}
export function projectionProfile(uid:string,data:DocumentData|undefined):DocumentData {
  if(!data || data.userId!==uid || data.schemaVersion!==1 || data.accountStatus!=='active')
    throw new HttpsError('failed-precondition','Your account is unavailable.');
  revision(data.revision);localToday(data.timezone);return data;
}
export function projectionLedger(uid:string,data:DocumentData|undefined):DocumentData {
  if(!data || data.userId!==uid || data.schemaVersion!==1 || data.formulaVersion!==projectionFormulaVersion || !Number.isSafeInteger(data.revision) || data.revision<0 || data.revision>=Number.MAX_SAFE_INTEGER)return invalidLedger();
  return data;
}
export async function scanOwnerCollection(root:DocumentReference,collection:string,deadline:number):Promise<DocumentData[]> {
  const records:DocumentData[]=[];let cursor:string|null=null;
  const identities:Record<string,string>={obligations:'obligationId',obligationInstances:'instanceId',payments:'paymentId',paymentEvidence:'evidenceId'};
  for(;;) {
    if(performance.now()>deadline)throw new HttpsError('deadline-exceeded','Financial totals are still updating.');
    let query=root.collection(collection).orderBy(FieldPath.documentId()).limit(250);
    if(cursor!==null)query=query.startAfter(cursor);
    const page=await query.get();
    for(const document of page.docs) {
      const data=document.data();const identity=identities[collection];
      if(data.userId!==root.id || data.schemaVersion!==1 || (identity && data[identity]!==document.id))return invalidLedger();
      records.push(collection==='contacts'?{...data,contactId:document.id}:data);
    }
    if(page.size<250)return records;
    cursor=page.docs[page.size-1]!.id;
  }
}
export async function projectOwner(uid:string,db:Firestore,injectedNow?:Date):Promise<ProjectionResult> {
  identifier(uid);const clock=injectedNow?()=>injectedNow:()=>new Date();const now=clock();
  const root=db.doc(`users/${uid}`);const ledgerRef=root.collection('ledgerState').doc('current');
  const [profileDoc,ledgerDoc]=await Promise.all([root.get(),ledgerRef.get()]);
  const profile=projectionProfile(uid,profileDoc.data());const ledger=projectionLedger(uid,ledgerDoc.data());
  const financialDay=localToday(profile.timezone,now);const yearMonth=financialDay.slice(0,7);
  const deadline=performance.now()+180_000;
  const [obligations,instances,payments,contacts,paymentEvidence]=await Promise.all(['obligations','obligationInstances','payments','contacts','paymentEvidence'].map(collection=>scanOwnerCollection(root,collection,deadline)));
  const projection=calculateProjection({obligations:obligations!,instances:instances!,payments:payments!,contacts:contacts!,paymentEvidence:paymentEvidence!},{uid,timezone:profile.timezone,yearMonth,today:financialDay,now});
  const zones=new Set<string>([profile.timezone,...instances!.map(instance=>instance.timezone as string)]);
  const nextRefreshAt=new Date(Math.min(...[...zones].map(zone=>nextCivilBoundary(zone,now).getTime())));
  const result=(status:'published'|'stale'):ProjectionResult=>({status,sourceRevision:ledger.revision,nextRefreshAt});
  const records=[...Object.values(projection.currencies).map(bucket=>({id:`dashboard-${bucket.currency}`,data:{kind:'dashboard',...bucket}})),
    ...Object.values(projection.contacts).map(contact=>({id:contactSummaryId(contact.contactId),data:{kind:'contact',...contact}}))];
  for(let start=0;start<records.length;start+=200) {
    if(performance.now()>deadline)throw new HttpsError('deadline-exceeded','Financial totals are still updating.');
    const chunk=records.slice(start,start+200);
    const published=await db.runTransaction(async transaction=>{
      if(performance.now()>deadline)throw new HttpsError('deadline-exceeded','Financial totals are still updating.');
      const [currentProfile,currentLedger]=await Promise.all([transaction.get(root),transaction.get(ledgerRef)]);
      const current=projectionProfile(uid,currentProfile.data());const currentSource=projectionLedger(uid,currentLedger.data());
      if(currentSource.revision!==ledger.revision || current.revision!==profile.revision || current.timezone!==profile.timezone ||
        localToday(current.timezone,clock())!==financialDay || clock().getTime()>=nextRefreshAt.getTime())return false;
      const refs=chunk.map(record=>root.collection('summaries').doc(record.id));
      const existing=await Promise.all(refs.map(ref=>transaction.get(ref)));
      if(performance.now()>deadline)throw new HttpsError('deadline-exceeded','Financial totals are still updating.');
      if(clock().getTime()>=nextRefreshAt.getTime())return false;
      for(let index=0;index<chunk.length;index++) {
        const prior=existing[index]!.data();if(prior && (prior.userId!==uid || prior.schemaVersion!==1))return invalidLedger();
        transaction.set(refs[index]!,{...chunk[index]!.data,userId:uid,schemaVersion:1,
          sourceRevision:ledger.revision,profileRevision:profile.revision,formulaVersion:projectionFormulaVersion,yearMonth,
          timezone:profile.timezone,financialDay,validUntil:Timestamp.fromDate(nextRefreshAt),computedAt:FieldValue.serverTimestamp(),
          createdAt:prior?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      }
      return true;
    });
    if(!published)return result('stale');
  }
  return result('published');
}
