import {createHash} from 'node:crypto';
import {FieldValue,type DocumentReference,type DocumentData,type Firestore,type Transaction,type WhereFilterOp} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from './callable.js';
import {identifier,revision} from './validation.js';
import {stageProjectionMutation} from '../jobs/projection_jobs.js';
import {stageReminderReconciliation} from '../notifications/reconciliation_job.js';

export function commandDocumentId(commandId:string,role:string):string {
  if(!/^[a-z][a-zA-Z0-9-]{0,31}$/.test(role))throw new Error('Invalid internal command role.');
  return `${role}-${createHash('sha256').update(JSON.stringify([commandId,role])).digest('hex')}`;
}
function ordered(value:unknown):unknown {
  if(Array.isArray(value))return value.map(ordered);
  if(value!==null && typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,item])=>[key,ordered(item)]));
  return value;
}
export class OwnerCommandContext {
  private writes:Array<{kind:'create'|'update';ref:DocumentReference;data:DocumentData}> = [];
  private guards:Array<()=>void> = [];
  constructor(private readonly transaction:Transaction,readonly root:DocumentReference,readonly uid:string,readonly commandId:string,readonly profile:DocumentData) {}
  id(role:string):string {return commandDocumentId(`${this.uid}:${this.commandId}`,role);}
  ref(collection:string,id:string):DocumentReference {return this.root.collection(collection).doc(identifier(id));}
  audit():DocumentData {return {userId:this.uid,schemaVersion:1,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};}
  async maybeRead(collection:string,id:string):Promise<DocumentData|null> {
    const snapshot=await this.transaction.get(this.ref(collection,id));const data=snapshot.data();
    if(!snapshot.exists)return null;
    if(!data || data.userId!==this.uid || data.schemaVersion!==1)throw new HttpsError('failed-precondition','A linked record is unavailable.');
    return data;
  }
  async read(collection:string,id:string):Promise<DocumentData> {
    const data=await this.maybeRead(collection,id);
    if(!data)throw new HttpsError('failed-precondition','A linked record is unavailable.');
    return data;
  }
  create(collection:string,id:string,data:DocumentData):void {this.writes.push({kind:'create',ref:this.ref(collection,id),data:{...data,...this.audit()}});}
  update(collection:string,id:string,data:DocumentData):void {this.writes.push({kind:'update',ref:this.ref(collection,id),data:{...data,updatedAt:FieldValue.serverTimestamp()}});}
  async readSystemJob(id:string):Promise<DocumentData|null> {
    const snapshot=await this.transaction.get(this.root.firestore.collection('systemJobs').doc(identifier(id)));
    if(!snapshot.exists)return null;
    const data=snapshot.data()!;
    if(data.userId!==this.uid || data.schemaVersion!==1)throw new HttpsError('failed-precondition','A linked job is unavailable.');
    return data;
  }
  systemJob(id:string,data:DocumentData,exists:boolean):void {
    this.writes.push({kind:exists?'update':'create',ref:this.root.firestore.collection('systemJobs').doc(identifier(id)),
      data:exists?{...data,userId:this.uid,updatedAt:FieldValue.serverTimestamp()}:{...data,...this.audit()}});
  }
  async notificationBinding(hash:string):Promise<DocumentData|null> {
    if(!/^[a-f0-9]{64}$/.test(hash))throw new HttpsError('internal','Invalid notification reference.');
    const snapshot=await this.transaction.get(this.root.firestore.collection('notificationTokenBindings').doc(hash));
    const data=snapshot.data();
    if(data&&(data.schemaVersion!==1||data.tokenHash!==hash))throw new HttpsError('failed-precondition','Your notifications need recovery.');
    return data??null;
  }
  stageNotificationBinding(hash:string,data:DocumentData,exists:boolean):void {
    if(!/^[a-f0-9]{64}$/.test(hash)||data.userId!==this.uid||data.tokenHash!==hash)
      throw new HttpsError('internal','Invalid notification ownership.');
    this.writes.push({kind:exists?'update':'create',ref:this.root.firestore.collection('notificationTokenBindings').doc(hash),
      data:{...data,...(exists?{updatedAt:FieldValue.serverTimestamp()}:this.audit())}});
  }
  async retireBoundNotificationDevice(uid:string,installationId:string,hash:string,generation:number):Promise<boolean> {
    const ref=this.root.firestore.doc(`users/${identifier(uid)}/notificationDevices/${identifier(installationId)}`);
    const data=(await this.transaction.get(ref)).data();
    if(!data)return false;
    if(data.userId!==uid||data.schemaVersion!==1||data.installationId!==installationId)
      throw new HttpsError('failed-precondition','Your notifications need recovery.');
    if(data.tokenHash!==hash||data.tokenGeneration!==generation)return false;
    this.writes.push({kind:'update',ref,data:{active:false,channel:'none',revision:revision(data.revision+1),updatedAt:FieldValue.serverTimestamp()}});
    return true;
  }
  async countWhere(collection:string,filters:readonly {field:string;op:WhereFilterOp;value:unknown}[]):Promise<number> {
    let query=this.root.collection(collection).where('userId','==',this.uid);
    for(const filter of filters)query=query.where(filter.field,filter.op,filter.value);
    const snapshot=await this.transaction.get(query.count());
    return snapshot.data().count;
  }
  activity(type:string,data:DocumentData):void {
    const role=`activity-${type}`;
    // Keep every legacy short-role ID stable. New long event names use their
    // full type in the hash seed rather than truncating distinct action names.
    const id=role.length<=32?this.id(role):commandDocumentId(JSON.stringify([this.uid,this.commandId,type]),'activity');
    this.create('activities',id,{type,recordedAt:FieldValue.serverTimestamp(),...data});
  }
  beforeCommit(guard:()=>void):void {this.guards.push(guard);}
  commit():void {
    // Recheck time-sensitive server leases after every transaction read,
    // including the projection job read staged by executeOwnerCommand.
    for(const guard of this.guards)guard();
    for(const write of this.writes){if(write.kind==='create')this.transaction.create(write.ref,write.data);else this.transaction.update(write.ref,write.data);}
  }
}
export async function executeOwnerCommand<P,R>(uid:string,input:unknown,type:string,validate:(payload:unknown)=>P,handler:(context:OwnerCommandContext,payload:P)=>Promise<R>,db:Firestore):Promise<R> {
  return runOwnerCommand(uid,input,type,validate,handler,db,true);
}
export async function executeMetadataCommand<P,R>(uid:string,input:unknown,type:string,validate:(payload:unknown)=>P,handler:(context:OwnerCommandContext,payload:P)=>Promise<R>,db:Firestore):Promise<R> {
  return runOwnerCommand(uid,input,type,validate,handler,db,false);
}
async function runOwnerCommand<P,R>(uid:string,input:unknown,type:string,validate:(payload:unknown)=>P,handler:(context:OwnerCommandContext,payload:P)=>Promise<R>,db:Firestore,financial:boolean):Promise<R> {
  identifier(uid);
  const envelope=exactObject(input,['commandId','expectedOwnerUid','payload']);
  const commandId=identifier(envelope.commandId);const expectedOwner=identifier(envelope.expectedOwnerUid);
  if(uid!==expectedOwner)throw new HttpsError('permission-denied','Your sign-in changed. Please try again.');
  const payload=validate(envelope.payload);
  const hash=createHash('sha256').update(JSON.stringify(ordered({type,payload}))).digest('hex');
  const root=db.doc(`users/${uid}`);const receiptRef=root.collection('commandReceipts').doc(commandId);const ledgerRef=root.collection('ledgerState').doc('current');
  return db.runTransaction(async transaction=>{
    const [profileDoc,receipt,ledgerDoc]=await Promise.all([transaction.get(root),transaction.get(receiptRef),financial?transaction.get(ledgerRef):null]);
    const profile=profileDoc.data();const ledger=ledgerDoc?.data();
    if(!profile || profile.userId!==uid || profile.accountStatus!=='active' || profile.schemaVersion!==1)throw new HttpsError('failed-precondition','Your account is unavailable.');
    if(receipt.exists){
      const data=receipt.data()!;
      if(data.userId!==uid || data.commandType!==type || data.payloadHash!==hash)throw new HttpsError('already-exists','This action identifier was already used.');
      return data.result as R;
    }
    if(financial&&(!ledger || ledger.userId!==uid || ledger.schemaVersion!==1 || !Number.isSafeInteger(ledger.revision) || ledger.revision<0 || ledger.revision>=Number.MAX_SAFE_INTEGER))throw new HttpsError('failed-precondition','Your financial records need recovery.');
    const context=new OwnerCommandContext(transaction,root,uid,commandId,profile);
    const result=await handler(context,payload);
    if(financial) {
      await stageProjectionMutation(context,ledger!.revision+1,new Date());
      await stageReminderReconciliation(context);
    }
    context.create('commandReceipts',commandId,{commandType:type,payloadHash:hash,result,recordedAt:FieldValue.serverTimestamp()});
    if(financial)context.update('ledgerState','current',{revision:ledger!.revision+1,lastMutationAt:FieldValue.serverTimestamp()});
    context.commit();
    return result;
  });
}
