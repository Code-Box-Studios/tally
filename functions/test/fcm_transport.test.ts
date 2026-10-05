import {test} from 'node:test';
import assert from 'node:assert/strict';
const transport=()=>require('../src/notifications/fcm_transport.js') as {
  FcmNotificationTransport:new(sender:{send:(message:Record<string,unknown>)=>Promise<string>},environment:{emulator:boolean;projectId:string})=>{
    send:(message:{token:string;title:string;body:string;data:Record<string,string>})=>Promise<string>;
  };
};
const message=()=>({token:'synthetic-notification-token-browser',title:'John owes PHP 500',body:'Private agreement notes',
  data:{reminderId:'reminder-1',obligationId:'loan-1',instanceId:'period-1'}});
test('FCM adapter always uses generic external text and IDs-only data',async()=>{
  const sent:Record<string,unknown>[]=[];
  const sender={send:async(value:Record<string,unknown>)=>{sent.push(value);return 'service-acceptance-id';}};
  const adapter=new (transport().FcmNotificationTransport)(sender,{emulator:false,projectId:'tally-staging'});
  assert.equal(await adapter.send(message()),'delivered');assert.equal(sent.length,1);
  assert.deepEqual(sent[0]!.notification,{title:'Tally reminder',body:'Open Tally to see what’s due.'});
  assert.deepEqual(sent[0]!.data,message().data);
  assert.equal(JSON.stringify(sent).includes('John'),false);assert.equal(JSON.stringify(sent).includes('500'),false);
  assert.equal(JSON.stringify(sent).includes('agreement'),false);
});
test('FCM demo/emulator guard never invokes the real sender',async()=>{
  let calls=0;const sender={send:async()=>{calls++;return 'not-called';}};
  for(const environment of [{emulator:true,projectId:'demo-tally'},{emulator:false,projectId:'demo-tally'},
    {emulator:true,projectId:'tally-staging'}]) {
    const adapter=new (transport().FcmNotificationTransport)(sender,environment);
    assert.equal(await adapter.send(message()),'retry');
  }
  assert.equal(calls,0);
});
test('FCM invalid registration results are distinct from retryable configuration and network errors',async()=>{
  for(const [code,expected] of [['messaging/registration-token-not-registered','invalid'],
    ['messaging/invalid-registration-token','invalid'],['messaging/invalid-argument','retry'],
    ['messaging/third-party-auth-error','retry'],['messaging/internal-error','retry']]) {
    const sender={send:async():Promise<string>=>{throw {code,message:'Private token detail must never be logged'};}};
    const adapter=new (transport().FcmNotificationTransport)(sender,{emulator:false,projectId:'tally-staging'});
    assert.equal(await adapter.send(message()),expected);
  }
});
test('FCM extra data and malformed IDs are rejected before SDK dispatch',async()=>{
  let calls=0;const sender={send:async()=>{calls++;return 'not-called';}};
  const adapter=new (transport().FcmNotificationTransport)(sender,{emulator:false,projectId:'tally-staging'});
  await assert.rejects(adapter.send({...message(),data:{...message().data,amount:'500'}}));
  await assert.rejects(adapter.send({...message(),data:{...message().data,instanceId:'../other'}}));
  assert.equal(calls,0);
});
test('FCM limits transport retention to the original external expiry',async()=>{
 const sent:Record<string,unknown>[]=[];const sender={send:async(value:Record<string,unknown>)=>{sent.push(value);return 'acceptance';}};
 const Adapter=transport().FcmNotificationTransport;
 const adapter=new Adapter(sender,{emulator:false,projectId:'tally-staging'});
 const expiresAt=new Date(Date.now()+60000);
 await adapter.send({...message(),expiresAt} as Parameters<typeof adapter.send>[0]);
 const android=sent[0]!.android as {ttl:number};assert.ok(android.ttl>0&&android.ttl<=60000);
 const web=sent[0]!.webpush as {headers:{TTL:string}};assert.ok(Number(web.headers.TTL)<=60);
 await adapter.send({...message(),expiresAt:new Date(0)} as Parameters<typeof adapter.send>[0]);assert.equal(sent.length,1);
});
