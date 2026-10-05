import {FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeMetadataCommand} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';

export async function markReminderRead(uid:string,input:unknown,db:Firestore) {
  return executeMetadataCommand(uid,input,'markReminderRead',input=>{
    const raw=exactObject(input,['reminderId','expectedRevision']);
    return {reminderId:identifier(raw.reminderId),expectedRevision:revision(raw.expectedRevision)};
  },async(context,payload)=>{
    const current=await context.read('reminders',payload.reminderId);
    if(current.reminderId!==payload.reminderId||current.visible!==true||current.status==='cancelled'||
      !(current.scheduledAt instanceof Timestamp)||current.scheduledAt.toMillis()>Date.now())
      throw new HttpsError('failed-precondition','This reminder is unavailable.');
    if(revision(current.revision)!==payload.expectedRevision)throw new HttpsError('aborted','This reminder changed. Refresh and try again.');
    const reminderRevision=current.readAt===null?revision(current.revision+1):current.revision;
    if(current.readAt===null)context.update('reminders',payload.reminderId,{readAt:FieldValue.serverTimestamp(),revision:reminderRevision});
    return {reminderId:payload.reminderId,reminderRevision};
  },db);
}
