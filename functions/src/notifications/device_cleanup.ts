import {FieldValue,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {identifier,revision} from '../shared/validation.js';
import {bindingMatches,readNotificationBinding,readNotificationDevice} from './device_validation.js';

export async function invalidateNotificationDevice(uid:string,installationId:string,generation:number,tokenHash:string,db:Firestore):Promise<boolean> {
  const ref=db.doc(`users/${identifier(uid)}/notificationDevices/${identifier(installationId)}`);
  return db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);if(!snapshot.exists)return false;
    const device=readNotificationDevice(uid,installationId,snapshot.data()!);
    if(!device.active||device.tokenGeneration!==generation||device.tokenHash!==tokenHash)return false;
    const bindingRef=tokenHash===null?null:db.collection('notificationTokenBindings').doc(tokenHash);
    const binding=bindingRef?(await transaction.get(bindingRef)).data():undefined;
    if(binding)readNotificationBinding(tokenHash,binding);
    transaction.update(ref,{active:false,channel:'none',revision:revision(device.revision+1),updatedAt:FieldValue.serverTimestamp()});
    if(binding&&bindingRef&&bindingMatches(binding,uid,installationId,device.bindingGeneration,device.tokenGeneration))
      transaction.update(bindingRef,{active:false,generation:revision(binding.generation+1),updatedAt:FieldValue.serverTimestamp()});
    return true;
  });
}
export async function cleanupNotificationDevices(db:Firestore,now=new Date(),limit=100):Promise<{examined:number;deactivated:number}> {
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(now.getTime()))throw new Error('Invalid notification cleanup boundary.');
  const cutoff=Timestamp.fromMillis(now.getTime()-90*86400000);
  const stale=await db.collectionGroup('notificationDevices').where('active','==',true).where('lastSeenAt','<=',cutoff).orderBy('lastSeenAt').limit(limit).get();
  let deactivated=0;
  for(const snapshot of stale.docs) {
    const uid=snapshot.ref.parent.parent?.id,data=snapshot.data();
    if(!uid||snapshot.ref.parent.parent?.parent.id!=='users')continue;
    // Recheck inactivity after the page read; a concurrent heartbeat wins.
    const retired=await db.runTransaction(async transaction=>{
      const current=(await transaction.get(snapshot.ref)).data();if(!current)return false;
      const device=readNotificationDevice(uid,snapshot.id,current);
      if(!device.active||!(device.lastSeenAt instanceof Timestamp)||device.lastSeenAt.toMillis()>cutoff.toMillis()||
        device.tokenGeneration!==data.tokenGeneration||device.tokenHash!==data.tokenHash)return false;
      const bindingRef=device.tokenHash===null?null:db.collection('notificationTokenBindings').doc(device.tokenHash);
      const binding=bindingRef?(await transaction.get(bindingRef)).data():undefined;if(binding)readNotificationBinding(device.tokenHash,binding);
      transaction.update(snapshot.ref,{active:false,channel:'none',revision:revision(device.revision+1),updatedAt:FieldValue.serverTimestamp()});
      if(binding&&bindingRef&&bindingMatches(binding,uid,snapshot.id,device.bindingGeneration,device.tokenGeneration))
        transaction.update(bindingRef,{active:false,generation:revision(binding.generation+1),updatedAt:FieldValue.serverTimestamp()});return true;
    });
    if(retired)deactivated++;
  }
  return {examined:stale.size,deactivated};
}
