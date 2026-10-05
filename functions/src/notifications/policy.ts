import {exactObject} from '../shared/callable.js';
import {boolValue,enumValue,invalid} from '../shared/validation.js';
import {validateScheduledTime} from '../recurring/scheduled_time.js';

export const reminderKinds=['upcoming','dueToday','overdue','automaticUpcoming','automaticConfirmation','owedToMe'] as const;
export type ReminderKind=typeof reminderKinds[number];
export interface NotificationPolicy {
  readonly enabled:boolean;readonly enabledKinds:readonly ReminderKind[];
  readonly offsetDays:readonly number[];readonly localTime:string;
  readonly quietStart:string;readonly quietEnd:string;
  readonly pushEnabled:boolean;readonly localEnabled:boolean;
  readonly allowSensitivePushText:false;readonly timezonePolicy:'savedDueProfileQuiet';
}
const fields=['enabled','enabledKinds','offsetDays','localTime','quietStart','quietEnd','pushEnabled','localEnabled','allowSensitivePushText','timezonePolicy'];
export function defaultNotificationPolicy():NotificationPolicy {
  return validateNotificationPolicy({enabled:true,enabledKinds:[...reminderKinds],offsetDays:[3,0],localTime:'09:00',
    quietStart:'21:00',quietEnd:'08:00',pushEnabled:false,localEnabled:false,
    allowSensitivePushText:false,timezonePolicy:'savedDueProfileQuiet'});
}
export function validateOffsets(input:unknown):readonly number[] {
  if(!Array.isArray(input)||input.length>8||new Set(input).size!==input.length||
    input.some(day=>typeof day!=='number'||!Number.isInteger(day)||day<0||day>365))
    return invalid('Choose up to eight distinct reminder offsets from 0 to 365 days.');
  return Object.freeze([...input] as number[]);
}
export function validateNotificationPolicy(input:unknown):NotificationPolicy {
  const raw=exactObject(input,fields);
  if(!Array.isArray(raw.enabledKinds)||raw.enabledKinds.length>reminderKinds.length||new Set(raw.enabledKinds).size!==raw.enabledKinds.length)
    return invalid('Choose valid reminder categories.');
  const enabledKinds=Object.freeze(raw.enabledKinds.map(value=>enumValue(value,reminderKinds)));
  if(raw.allowSensitivePushText!==false||raw.timezonePolicy!=='savedDueProfileQuiet')return invalid('Unsupported notification privacy or timezone policy.');
  return Object.freeze({enabled:boolValue(raw.enabled),enabledKinds,offsetDays:validateOffsets(raw.offsetDays),
    localTime:validateScheduledTime(raw.localTime),quietStart:validateScheduledTime(raw.quietStart),quietEnd:validateScheduledTime(raw.quietEnd),
    pushEnabled:boolValue(raw.pushEnabled),localEnabled:boolValue(raw.localEnabled),allowSensitivePushText:false,timezonePolicy:'savedDueProfileQuiet'});
}
export function migrateNotificationPolicy(legacy:Record<string,unknown>):NotificationPolicy {
  const defaults=defaultNotificationPolicy();
  return validateNotificationPolicy({...defaults,
    ...Object.fromEntries(fields.filter(field=>Object.hasOwn(legacy,field)).map(field=>[field,legacy[field]]))});
}
