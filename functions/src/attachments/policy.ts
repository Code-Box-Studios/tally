import {Buffer} from 'node:buffer';
import {exactObject} from '../shared/callable.js';
import {enumValue,identifier,invalid} from '../shared/validation.js';

export const maxAttachmentBytes=10485760;
export const maxAttachmentsPerTarget=10;
export const attachmentTypes=['obligation','instance','payment'] as const;
export const attachmentMimeTypes=['image/jpeg','image/png','image/webp','application/pdf'] as const;
export type AttachmentMimeType=typeof attachmentMimeTypes[number];
export interface AttachmentReservationPayload {
 readonly targetType:typeof attachmentTypes[number];readonly targetId:string;
 readonly filename:string;readonly contentType:AttachmentMimeType;
 readonly sizeBytes:number;readonly sha256:string|null;
}
export function validateAttachmentReservation(input:unknown):AttachmentReservationPayload {
 const data=exactObject(input,['targetType','targetId','filename','contentType','sizeBytes','sha256']);
 const filename=data.filename,sizeBytes=data.sizeBytes,checksum=data.sha256;
 if(typeof filename!=='string'||filename.length<1||filename.length>150||filename.trim()!==filename||filename==='.'||filename==='..'||
  /[/\\\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(filename))return invalid('Choose a file with a short, safe filename.');
 if(typeof sizeBytes!=='number'||!Number.isSafeInteger(sizeBytes)||sizeBytes<1||sizeBytes>maxAttachmentBytes)return invalid('Choose a file between one byte and 10 MiB.');
 if(checksum!==null&&(typeof checksum!=='string'||!/^[a-f0-9]{64}$/.test(checksum)))return invalid('Invalid file checksum.');
 return Object.freeze({targetType:enumValue(data.targetType,attachmentTypes),targetId:identifier(data.targetId),filename,
  contentType:enumValue(data.contentType,attachmentMimeTypes),sizeBytes,sha256:checksum as string|null});
}
export function sniffAttachment(bytes:Uint8Array):AttachmentMimeType|null {
 if(bytes.length<1||bytes.length>maxAttachmentBytes)return null;
 const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255&&buffer.at(-2)===255&&buffer.at(-1)===217)return 'image/jpeg';
 if(buffer.length>=45&&buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&
  buffer.readUInt32BE(8)===13&&buffer.toString('ascii',12,16)==='IHDR'&&buffer.readUInt32BE(16)>0&&buffer.readUInt32BE(20)>0&&
  buffer.readUInt32BE(buffer.length-12)===0&&buffer.toString('ascii',buffer.length-8,buffer.length-4)==='IEND')return 'image/png';
 if(buffer.length>=20&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.readUInt32LE(4)+8===buffer.length&&
  buffer.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(buffer.toString('ascii',12,16))&&
  buffer.readUInt32LE(16)<=buffer.length-20)return 'image/webp';
 if(/^%PDF-(?:1\.[0-7]|2\.0)(?:\s|$)/.test(buffer.toString('ascii',0,12))&&
  /%%EOF\s*$/.test(buffer.toString('ascii',Math.max(0,buffer.length-1024))))return 'application/pdf';
 return null;
}
