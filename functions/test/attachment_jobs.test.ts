import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase-admin/firestore';
import {attachmentFinalizationId,parseAttachmentObject,assertAttachmentLease} from '../src/attachments/attachment_jobs.js';
import {attachmentCleanupId} from '../src/attachments/cleanup_jobs.js';
import {canStartJob,shouldRunPrompt} from '../src/jobs/dispatch.js';

const now=new Date('2026-10-06T12:00:00Z');
test('file event identities preserve opaque generations and reject foreign buckets or malformed paths',()=>{
 const generation='18446744073709551615',event={bucket:'demo-tally.appspot.com',name:'users/alice/attachments/file-1/content',generation};
 assert.deepEqual(parseAttachmentObject(event,'demo-tally.appspot.com'),{uid:'alice',attachmentId:'file-1',storagePath:event.name,bucket:event.bucket,generation});
 const key=attachmentFinalizationId('alice','file-1',generation);
 assert.equal(key,attachmentFinalizationId('alice','file-1',generation));
 for(const value of [attachmentFinalizationId('bob','file-1',generation),attachmentFinalizationId('alice','file-2',generation),attachmentFinalizationId('alice','file-1','1'),attachmentCleanupId('alice','file-1')])assert.notEqual(value,key);
 for(const patch of [{bucket:'other'}, {name:'users/alice/attachments/file-1/other'}, {name:'users/alice/attachments/../content'}, {generation:42}, {generation:'0'}, {generation:'01'}, {generation:'1e9'}])assert.equal(parseAttachmentObject({...event,...patch},'demo-tally.appspot.com'),null);
});
test('attachment leases fence tokens, newer job generations and expired work',()=>{
 const job={status:'leased',generation:1,leaseGeneration:1,leaseToken:'token',leaseExpiresAt:Timestamp.fromMillis(now.getTime()+1)};
 assert.equal(assertAttachmentLease(job,'token',now),true);
 assert.equal(assertAttachmentLease({...job,leaseToken:'other'},'token',now),false);
 assert.equal(assertAttachmentLease({...job,generation:2},'token',now),false);
 assert.throws(()=>assertAttachmentLease({...job,leaseExpiresAt:Timestamp.fromDate(now)},'token',now));
});
test('both attachment job kinds share bounded prompt dispatch and its time reserve',()=>{
 for(const kind of ['attachmentFinalization','attachmentCleanup']){
  assert.equal(shouldRunPrompt({kind,schemaVersion:1,status:'pending',nextRunAt:Timestamp.fromDate(now)},now),true);
  assert.equal(canStartJob(kind,59_999),false);assert.equal(canStartJob(kind,60_000),true);
 }
});

test('file processing has one monotonic budget inside the dispatch time reserve',async()=>{
 const {AttachmentWorkBudget}=await import('../src/attachments/work_budget.js');let elapsed=0;
 const budget=new AttachmentWorkBudget(()=>elapsed);budget.assertAvailable();elapsed=54_999;budget.assertAvailable();
 elapsed=55_000;assert.throws(()=>budget.assertAvailable(),{code:'deadline-exceeded'});
});
