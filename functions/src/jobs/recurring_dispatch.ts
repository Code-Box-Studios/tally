import {Timestamp,type Firestore} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions';
import {claimRecurringJob,releaseRecurringJob} from './recurring_jobs.js';
import {generateRecurringBatch} from '../recurring/generation.js';

export async function dispatchRecurringJobs(db:Firestore,injectedNow?:Date,limit=25):Promise<{processed:number;examined:number}> {
  if(!Number.isInteger(limit)||limit<1||limit>25)throw new Error('Invalid dispatch limit.');
  const start=Date.now(),now=injectedNow??new Date(),collection=db.collection('systemJobs').where('kind','==','recurringGeneration');
  const [pending,expired]=await Promise.all([
    collection.where('status','==','pending').where('nextRunAt','<=',Timestamp.fromDate(now)).orderBy('nextRunAt').limit(limit).get(),
    collection.where('status','==','leased').where('leaseExpiresAt','<=',Timestamp.fromDate(now)).orderBy('leaseExpiresAt').limit(limit).get(),
  ]);
  const candidates=[...new Map([...pending.docs,...expired.docs].map(doc=>[doc.id,doc])).values()].slice(0,limit);
  let processed=0,examined=0;
  for(const candidate of candidates) {
    if(Date.now()-start>=450000)break;
    examined++;
    const time=injectedNow??new Date();
    let token:string|null=null;
    try {
      const lease=await claimRecurringJob(candidate.id,db,time);if(!lease)continue;token=lease.token;
      await generateRecurringBatch(candidate.id,lease.token,db,time);processed++;
    }catch {
      if(token)await releaseRecurringJob(candidate.id,token,db,injectedNow??new Date());
      logger.warn('Recurring generation delayed',{jobId:candidate.id});
    }
  }
  return {processed,examined};
}
