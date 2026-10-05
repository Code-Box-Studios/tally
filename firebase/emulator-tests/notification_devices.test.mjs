import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {withOwner} from './support/session.mjs';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app');initializeApp({projectId:'demo-tally'});
const {Timestamp}=require('firebase-admin/firestore');
const token=(label)=>`synthetic-notification-token-${label}`;
const hash=(value)=>createHash('sha256').update(value).digest('hex');
const registration=(installationId,patch={})=>({installationId,platform:'web',token:token(installationId),
  permission:'granted',channel:'push',appVersion:'0.1.0',expectedRevision:0,...patch});
const binding=(owner,value)=>owner.adminDb.collection('notificationTokenBindings').doc(hash(value));
const device=(owner,id)=>owner.root.collection('notificationDevices').doc(id);
const cleanup=()=>require('./lib/src/notifications/device_cleanup.js');

test('two private devices have sanitized permanent receipts without a financial mutation',async()=>withOwner('notification-devices',async owner=>{
  const ledger=(await owner.root.collection('ledgerState').doc('current').get()).data();
  const request=owner.command('browser',registration('browser'));
  const first=await owner.call('registerNotificationDevice',request);
  assert.equal(first.device.installationId,'browser');assert.equal(first.device.revision,1);
  assert.deepEqual(await owner.call('registerNotificationDevice',request),first);
  assert.equal(JSON.stringify(first).includes(token('browser')),false);assert.equal('tokenHash' in first.device,false);
  assert.equal(typeof first.device.lastSeenAt,'string');assert.ok(first.device.lastSeenAt.endsWith('Z'));
  await owner.call('registerNotificationDevice',owner.command('phone',registration('phone',{platform:'android'})));
  const page=await owner.call('listNotificationDevices',owner.command('devices',{limit:1,after:null}));
  assert.equal(page.devices.length,1);assert.ok(page.nextCursor);
  const second=await owner.call('listNotificationDevices',owner.command('devices-next',{limit:1,after:page.nextCursor}));
  assert.equal(second.devices.length,1);assert.notEqual(second.devices[0].installationId,page.devices[0].installationId);
  assert.equal((await owner.root.collection('notificationDevices').get()).size,2);
  assert.deepEqual((await owner.root.collection('ledgerState').doc('current').get()).data(),ledger);
  await assert.rejects(owner.call('registerNotificationDevice',owner.command('browser',registration('browser',{token:token('altered')}))),{code:'functions/already-exists'});
}));
test('rotation retires only the old token binding and rejects stale device writes',async()=>withOwner('notification-rotation',async owner=>{
  await owner.call('registerNotificationDevice',owner.command('first',registration('browser')));
  const updated=await owner.call('registerNotificationDevice',owner.command('rotate',registration('browser',{expectedRevision:1,token:token('new')})));
  assert.equal(updated.device.revision,2);
  assert.equal((await device(owner,'browser').get()).data().tokenGeneration,2);
  assert.equal((await binding(owner,token('browser')).get()).data().active,false);
  assert.equal((await binding(owner,token('new')).get()).data().userId,owner.user.uid);
  await assert.rejects(owner.call('unregisterNotificationDevice',owner.command('old-unregister',{installationId:'browser',expectedRevision:1})),{code:'functions/aborted'});
  assert.equal((await binding(owner,token('new')).get()).data().active,true);
}));
test('token handoff deactivates the previous owner and old unregister preserves new ownership',async()=>withOwner('notification-handoff-a',async owner=>withOwner('notification-handoff-b',async other=>{
  const value=token('shared-browser');
  await owner.call('registerNotificationDevice',owner.command('first',registration('shared',{token:value})));
  const previousGeneration=(await binding(owner,value).get()).data().generation;
  await other.call('registerNotificationDevice',other.command('second',registration('shared',{token:value})));
  const retired=(await device(owner,'shared').get()).data();assert.equal(retired.active,false);assert.equal(retired.revision,2);
  const before=(await binding(other,value).get()).data();assert.equal(before.userId,other.user.uid);assert.equal(before.generation,previousGeneration+1);
  await assert.rejects(other.call('unregisterNotificationDevice',owner.command('foreign',{installationId:'shared',expectedRevision:2})),{code:'functions/permission-denied'});
  await assert.rejects(owner.call('unregisterNotificationDevice',owner.command('stale',{installationId:'shared',expectedRevision:1})),{code:'functions/aborted'});
  await owner.call('unregisterNotificationDevice',owner.command('retire',{installationId:'shared',expectedRevision:2}));
  assert.deepEqual((await binding(other,value).get()).data(),before);
})));
test('a known token with notifications off retires the previous account without enabling push',async()=>withOwner('notification-off-a',async owner=>withOwner('notification-off-b',async other=>{
  const value=token('off-browser');
  await owner.call('registerNotificationDevice',owner.command('first',registration('browser',{token:value})));
  const result=await other.call('registerNotificationDevice',other.command('off',registration('browser',{token:value,channel:'none'})));
  assert.equal(result.device.channel,'none');assert.equal(result.device.active,false);
  assert.equal((await device(owner,'browser').get()).data().active,false);
  assert.equal((await binding(other,value).get()).data().active,false);
  assert.equal((await binding(other,value).get()).data().userId,other.user.uid);
})));
test('private device bindings and delivery receipts reject direct client reads and writes',async()=>withOwner('notification-device-rules',async owner=>{
  for(const path of [`${owner.root.path}/notificationDevices/browser`,`${owner.root.path}/notificationDeliveries/receipt`,
    `notificationTokenBindings/${hash(token('browser'))}`]) {
    await owner.adminDb.doc(path).set({userId:owner.user.uid,schemaVersion:1});
    await assert.rejects(getDoc(doc(owner.db,path)),{code:'permission-denied'});
    await assert.rejects(setDoc(doc(owner.db,path),{userId:owner.user.uid,schemaVersion:1}),{code:'permission-denied'});
  }
  await binding(owner,token('browser')).delete();
}));
test('invalid fields and inactive accounts cannot create notification registrations',async()=>withOwner('notification-device-validation',async owner=>{
  for(const [id,patch] of [['platform',{platform:'unknown'}],['path',{installationId:'../other'}],
    ['token',{token:'short'}],['permission',{permission:'denied'}],['field',{notes:'private notes'}]]) {
    await assert.rejects(owner.call('registerNotificationDevice',owner.command(id,registration('browser',patch))),{code:'functions/invalid-argument'});
    assert.equal((await owner.root.collection('commandReceipts').doc(id).get()).exists,false);
  }
  await owner.root.update({accountStatus:'deleting'});
  await assert.rejects(owner.call('registerNotificationDevice',owner.command('inactive',registration('browser'))),{code:'functions/failed-precondition'});
  assert.equal((await owner.root.collection('notificationDevices').get()).size,0);
}));
test('an old invalid-token result cannot deactivate a rotated registration',async()=>withOwner('notification-invalid-rotation',async owner=>{
  await owner.call('registerNotificationDevice',owner.command('first',registration('browser')));
  const prior=(await device(owner,'browser').get()).data();
  await owner.call('registerNotificationDevice',owner.command('rotate',registration('browser',{expectedRevision:1,token:token('rotated')})));
  assert.equal(await cleanup().invalidateNotificationDevice(owner.user.uid,'browser',prior.tokenGeneration,prior.tokenHash,owner.adminDb),false);
  assert.equal((await device(owner,'browser').get()).data().active,true);
  assert.equal((await binding(owner,token('rotated')).get()).data().active,true);
}));
test('stale device cleanup is bounded to one hundred and keeps a recently seen device',async()=>withOwner('notification-stale',async owner=>{
  await owner.call('registerNotificationDevice',owner.command('current',registration('browser')));
  const base=(await device(owner,'browser').get()).data(),batch=owner.adminDb.batch();
  const old=Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
  for(let i=0;i<120;i++) {
    const id=`stale-${String(i).padStart(3,'0')}`;
    batch.set(device(owner,id),{...base,installationId:id,createdAt:old,updatedAt:old,lastSeenAt:old});
  }
  await batch.commit();
  const result=await cleanup().cleanupNotificationDevices(owner.adminDb,new Date('2026-10-05T00:00:00Z'),100);
  assert.equal(result.examined,100);assert.equal(result.deactivated,100);
  assert.equal((await owner.root.collection('notificationDevices').where('active','==',true).get()).size,21);
  assert.equal((await device(owner,'browser').get()).data().active,true);
  assert.equal((await binding(owner,token('browser')).get()).data().active,true);
}));
