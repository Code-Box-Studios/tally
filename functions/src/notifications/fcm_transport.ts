import type {Messaging} from 'firebase-admin/messaging';
import {exactObject} from '../shared/callable.js';
import {identifier} from '../shared/validation.js';
import {notificationToken} from './device_validation.js';
import type {NotificationMessage,NotificationTransport} from './delivery.js';

export class FcmNotificationTransport implements NotificationTransport {
  constructor(private readonly sender:Pick<Messaging,'send'>,private readonly environment:{emulator:boolean;projectId:string}) {}
  async send(message:NotificationMessage):Promise<'delivered'|'invalid'|'retry'> {
    const raw=exactObject(message.data,['reminderId','obligationId','instanceId']);
    const data={reminderId:identifier(raw.reminderId),obligationId:identifier(raw.obligationId),instanceId:identifier(raw.instanceId)};
    const token=notificationToken(message.token);if(token===null)throw new Error('Missing notification registration.');
    // A demo project or any emulator runtime can never invoke real messaging.
    if(this.environment.emulator||/^demo-/.test(this.environment.projectId))return 'retry';
    const expiresAt=message.expiresAt??new Date(Date.now()+86400000);
    if(!Number.isFinite(expiresAt.getTime()))throw new Error('Invalid notification expiry.');
    const ttl=Math.min(86400000,expiresAt.getTime()-Date.now());
    if(ttl<1000)return 'retry';
    try {
      await this.sender.send({token,notification:{title:'Tally reminder',body:'Open Tally to see what’s due.'},data,
        android:{ttl},webpush:{headers:{TTL:String(Math.floor(ttl/1000))},notification:{tag:data.reminderId}},
        apns:{headers:{'apns-expiration':String(Math.floor(expiresAt.getTime()/1000))}}});
      // "Delivered" denotes FCM service acceptance, not a device receipt.
      return 'delivered';
    } catch(error) {
      const code=typeof error==='object'&&error!==null&&'code' in error?(error as {code:unknown}).code:null;
      return code==='messaging/registration-token-not-registered'||code==='messaging/invalid-registration-token'?'invalid':'retry';
    }
  }
}
