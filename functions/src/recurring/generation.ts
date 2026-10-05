import {createHash} from 'node:crypto';
import {Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {executeOwnerCommand} from '../shared/commands.js';
import {identifier,localToday} from '../shared/validation.js';
import {exactObject} from '../shared/callable.js';
import {occurrenceInstanceId} from '../shared/occurrence_id.js';
import {assertRecurringLease,recurringJobId} from '../jobs/recurring_jobs.js';
import {nextCivilBoundary} from '../jobs/leases.js';
import {nextOccurrence,occurrenceAt,type RecurringOccurrence} from './recurrence.js';
import {readRecurringState,stateDocument,type RecurringState} from './recurring_validation.js';
import {addCivilDays,readRecurringParent} from './recurring_service.js';
import {periodDocument,stagePeriod} from './period_document.js';

function eligible(state:RecurringState):{next:RecurringOccurrence|null;paused:boolean} {
  const after=state.generationCursor<0?null:occurrenceAt(state.rule,state.generationCursor);
  if(state.generationCursor>=0 && after===null)return {next:null,paused:false};
  let next=nextOccurrence(state.rule,after);
  for(const range of state.pauseRanges) {
    if(!next)break;
    if(next.date<range.startDate)break;
    if(range.endDate===null)return {next:null,paused:true};
    if(next.date<range.endDate) {
      next=nextOccurrence(state.rule,addCivilDays(range.endDate,-1));
      if(next)state.generationCursor=next.index-1;
    }
  }
  if(next && state.endedOn!==null && next.date>state.endedOn)return {next:null,paused:false};
  return {next,paused:false};
}
export async function generateRecurringBatch(jobId:string,token:string,db:Firestore,injectedNow?:Date):Promise<{created:number;hasMore:boolean;nextRunAt:string|null}> {
  identifier(jobId);identifier(token);
  const initial=(await db.collection('systemJobs').doc(jobId).get()).data();
  if(!initial)throw new HttpsError('failed-precondition','The schedule job is unavailable.');
  const uid=identifier(initial.userId),obligationId=identifier(initial.subjectId);
  if(jobId!==recurringJobId(uid,obligationId))throw new HttpsError('failed-precondition','Invalid schedule job.');
  const commandId=`generation-${createHash('sha256').update(JSON.stringify([jobId,token])).digest('hex')}`;
  return executeOwnerCommand(uid,{commandId,expectedOwnerUid:uid,payload:{jobId,token}},'generateRecurring',input=>{
    const raw=exactObject(input,['jobId','token']);return {jobId:identifier(raw.jobId),token:identifier(raw.token)};
  },async context=>{
    const job=await context.readSystemJob(jobId),parent=await readRecurringParent(context,obligationId);
    if(!job||job.kind!=='recurringGeneration'||job.subjectId!==obligationId)throw new HttpsError('failed-precondition','Invalid schedule job.');
    const clock=()=>injectedNow??new Date(),now=clock();
    assertRecurringLease(job,token,parent.revision,now);
    context.beforeCommit(()=>assertRecurringLease(job,token,parent.revision,clock()));
    const state=readRecurringState(parent.recurrence),horizon=addCivilDays(localToday(state.rule.timezone,now),90);
    let created=0,considered=0,candidate=eligible(state);
    while(candidate.next && candidate.next.date<=horizon && considered<30) {
      const {index,date}=candidate.next,instanceId=occurrenceInstanceId(obligationId,`r:${date}`);
      const existing=await context.maybeRead('obligationInstances',instanceId);
      if(existing) {
        if(existing.instanceId!==instanceId||existing.obligationId!==obligationId||existing.occurrenceKey!==`r:${date}`||existing.occurrenceDate!==date||existing.currency!==parent.currency||!existing.snapshot||existing.snapshot.ruleVersion!==state.rule.ruleVersion)
          throw new HttpsError('failed-precondition','A billing period needs recovery.');
      }else {
        stagePeriod(context,parent,periodDocument(parent,state.rule,date,now),now);created++;
      }
      considered++;state.generationCursor=index;state.generatedThrough=date;
      candidate=eligible(state);
    }
    const hasMore=candidate.next!==null && candidate.next.date<=horizon;
    const nextRunAt=hasMore?now:candidate.next?nextCivilBoundary(state.rule.timezone,now):null;
    const obligationRevision=parent.revision+1;
    context.update('obligations',obligationId,{recurrence:stateDocument(state),nextDueDate:null,nextGenerationDate:candidate.next?.date??null,revision:obligationRevision});
    context.systemJob(jobId,{status:candidate.paused?'paused':nextRunAt?'pending':'complete',generation:job.generation+1,targetRevision:obligationRevision,
      nextRunAt:nextRunAt?Timestamp.fromDate(nextRunAt):null,attempts:0,leaseToken:null,leaseGeneration:null,leaseExpiresAt:null,lastError:null},true);
    if(created>0)context.activity('periodsGenerated',{obligationId,title:parent.title,amountMinor:null,currency:null,periodCount:created,generatedThrough:state.generatedThrough});
    return {created,hasMore,nextRunAt:nextRunAt?.toISOString()??null};
  },db);
}
