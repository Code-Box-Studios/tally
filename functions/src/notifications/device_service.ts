import {FieldPath,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';
import {executeMetadataCommand} from '../shared/commands.js';
import {identifier,revision} from '../shared/validation.js';
import {owned,reminderRecovery} from './context.js';
import {bindingMatches,deviceView,notificationTokenHash,readNotificationBinding,readNotificationDevice,validateDeviceRegistration,type NotificationDeviceView} from './device_validation.js';

export async function registerNotificationDevice(uid:string,input:unknown,db:Firestore):Promise<{device:NotificationDeviceView}> {
  return executeMetadataCommand(uid,input,'registerNotificationDevice',validateDeviceRegistration,async(context,payload)=>{
    const previous=await context.maybeRead('notificationDevices',payload.installationId);
    if(previous)readNotificationDevice(uid,payload.installationId,previous);
    if((previous?.revision??0)!==payload.expectedRevision)throw new HttpsError('aborted','This device changed. Refresh its notification settings.');
    const hash=payload.token===null?null:notificationTokenHash(payload.token);
    const oldHash=previous?.tokenHash??null;
    const hashes=[...new Set([hash,oldHash].filter((value):value is string=>value!==null))];
    const bindings=new Map(await Promise.all(hashes.map(async value=>{
      const binding=await context.notificationBinding(value);return [value,binding?readNotificationBinding(value,binding):null] as const;
    })));
    const incoming=hash===null?null:bindings.get(hash)!;
    if(incoming&&(incoming.userId!==uid||incoming.installationId!==payload.installationId))
      await context.retireBoundNotificationDevice(incoming.userId,incoming.installationId,hash!,incoming.tokenGeneration);
    const tokenChanged=previous?.tokenHash!==hash||previous?.active!==true||
      (incoming!==null&&(incoming.userId!==uid||incoming.installationId!==payload.installationId));
    const tokenGeneration=previous?tokenChanged?revision(previous.tokenGeneration+1):previous.tokenGeneration:1;
    const active=payload.channel!=='none'&&['granted','provisional'].includes(payload.permission);
    const now=Timestamp.now(),deviceRevision=previous?revision(previous.revision+1):1;
    if(oldHash!==null&&oldHash!==hash) {
      const oldBinding=bindings.get(oldHash);
      if(oldBinding&&bindingMatches(oldBinding,uid,payload.installationId,previous!.bindingGeneration,previous!.tokenGeneration))
        context.stageNotificationBinding(oldHash,{...oldBinding,active:false,generation:revision(oldBinding.generation+1)},true);
    }
    const bindingGeneration=incoming?revision(incoming.generation+1):hash===null?null:1;
    if(hash!==null)context.stageNotificationBinding(hash,{userId:uid,schemaVersion:1,tokenHash:hash,installationId:payload.installationId,
      generation:bindingGeneration,tokenGeneration,active:active&&payload.channel==='push',lastSeenAt:now},incoming!==null);
    const data={...payload,userId:uid,schemaVersion:1,tokenHash:hash,tokenGeneration,bindingGeneration,
      active,revision:deviceRevision,lastSeenAt:now};
    const {expectedRevision,...stored}=data;
    if(previous)context.update('notificationDevices',payload.installationId,stored);
    else context.create('notificationDevices',payload.installationId,stored);
    return {device:deviceView(uid,stored)};
  },db);
}
export async function unregisterNotificationDevice(uid:string,input:unknown,db:Firestore):Promise<{device:NotificationDeviceView}> {
  return executeMetadataCommand(uid,input,'unregisterNotificationDevice',input=>{
    const raw=exactObject(input,['installationId','expectedRevision']);return {installationId:identifier(raw.installationId),expectedRevision:revision(raw.expectedRevision)};
  },async(context,payload)=>{
    const previous=readNotificationDevice(uid,payload.installationId,await context.read('notificationDevices',payload.installationId));
    if(previous.revision!==payload.expectedRevision)throw new HttpsError('aborted','This device changed. Refresh its notification settings.');
    const binding=previous.tokenHash===null?null:await context.notificationBinding(previous.tokenHash);
    if(binding)readNotificationBinding(previous.tokenHash,binding);
    const data={...previous,active:false,channel:'none',revision:revision(previous.revision+1),lastSeenAt:Timestamp.now()};
    if(binding&&bindingMatches(binding,uid,payload.installationId,previous.bindingGeneration,previous.tokenGeneration))
      context.stageNotificationBinding(previous.tokenHash,{...binding,active:false,generation:revision(binding.generation+1)},true);
    context.update('notificationDevices',payload.installationId,{active:false,channel:'none',revision:data.revision,lastSeenAt:data.lastSeenAt});
    return {device:deviceView(uid,data)};
  },db);
}
export async function listNotificationDevices(uid:string,input:unknown,db:Firestore):Promise<{devices:NotificationDeviceView[];nextCursor:string|null}> {
  const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']);identifier(envelope.commandId);
  if(identifier(envelope.expectedOwnerUid)!==uid)throw new HttpsError('permission-denied','Your sign-in changed.');
  const raw=exactObject(envelope.payload,['limit','after']);
  if(!Number.isInteger(raw.limit)||(raw.limit as number)<1||(raw.limit as number)>50)throw new HttpsError('invalid-argument','Choose a bounded device page.');
  const after=raw.after===null?null:identifier(raw.after),root=db.doc(`users/${identifier(uid)}`);
  return db.runTransaction(async transaction=>{
    const profile=owned(uid,(await transaction.get(root)).data());if(profile.accountStatus!=='active')return reminderRecovery();
    let query=root.collection('notificationDevices').orderBy(FieldPath.documentId()).limit(raw.limit as number);
    if(after)query=query.startAfter(after);
    const result=await transaction.get(query),devices=result.docs.map(doc=>deviceView(uid,readNotificationDevice(uid,doc.id,doc.data())));
    return {devices,nextCursor:result.size===raw.limit?result.docs.at(-1)!.id:null};
  });
}
