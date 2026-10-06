import type {Bucket} from '@google-cloud/storage';
import {getStorage} from 'firebase-admin/storage';
import {HttpsError} from 'firebase-functions/v2/https';
import {maxAttachmentBytes,type AttachmentMimeType} from './policy.js';

export interface AttachmentObjectMetadata {
 generation:string;metageneration:string;sizeBytes:number;contentType:string;
 customMetadata:Readonly<Record<string,string>>;hasDownloadTokens:boolean;
}
export interface AttachmentStorageGateway {
 readonly bucket:string;
 metadata(path:string):Promise<AttachmentObjectMetadata|null>;
 create(path:string,bytes:Uint8Array,contentType:AttachmentMimeType,metadata:Readonly<Record<string,string>>):Promise<void>;
 download(path:string,generation:string):Promise<Uint8Array>;
 stripTokens(path:string,generation:string,metageneration:string):Promise<void>;
 delete(path:string,generation:string):Promise<boolean>;
}
const decimal=(value:unknown):string=>{
 if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value))throw new HttpsError('failed-precondition','The file needs verification.');return value;
};
function code(error:unknown):number|undefined {
 return typeof error==='object'&&error!==null&&'code' in error?Number(error.code):undefined;
}
async function bounded<T>(work:Promise<T>):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new HttpsError('deadline-exceeded','File processing is delayed.')),10_000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
export class FirebaseAttachmentStorageGateway implements AttachmentStorageGateway {
 readonly bucket:string;
 constructor(private readonly files:Bucket=getStorage().bucket()){this.bucket=files.name;}
 async metadata(path:string):Promise<AttachmentObjectMetadata|null> {
  try {
   const [data]=await bounded(this.files.file(path).getMetadata());
   const sizeBytes=Number(data.size);
   if(!Number.isSafeInteger(sizeBytes)||sizeBytes<0||typeof data.contentType!=='string')throw new HttpsError('failed-precondition','The file needs verification.');
   const customMetadata:Record<string,string>={};
   for(const [key,value] of Object.entries(data.metadata??{})){
    if(value===null||value===undefined)continue;
    if(typeof value!=='string')throw new HttpsError('failed-precondition','The file needs verification.');customMetadata[key]=value;
   }
   return {generation:decimal(data.generation),metageneration:decimal(data.metageneration),sizeBytes,contentType:data.contentType,
    customMetadata,hasDownloadTokens:!!customMetadata.firebaseStorageDownloadTokens};
  }catch(error){if(code(error)===404)return null;throw error;}
 }
 async create(path:string,bytes:Uint8Array,contentType:AttachmentMimeType,metadata:Readonly<Record<string,string>>):Promise<void> {
  if(bytes.length<1||bytes.length>maxAttachmentBytes)throw new HttpsError('invalid-argument','Choose a file up to10 MiB.');
  await bounded(this.files.file(path).save(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),{
   resumable:false,preconditionOpts:{ifGenerationMatch:0},
   metadata:{contentType,cacheControl:'private, no-store',metadata:{...metadata}},
  }));
 }
 async download(path:string,generation:string):Promise<Uint8Array> {
  decimal(generation);
  const stream=this.files.file(path,{generation,preconditionOpts:{ifGenerationMatch:generation}})
   .createReadStream({start:0,end:maxAttachmentBytes,decompress:false,validation:false});
  return new Promise((resolve,reject)=>{
   const chunks:Buffer[]=[];let size=0;
   const timer=setTimeout(()=>stream.destroy(new HttpsError('deadline-exceeded','File processing is delayed.')),10_000);
   stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxAttachmentBytes)stream.destroy(new HttpsError('failed-precondition','The file is too large.'));else chunks.push(chunk);});
   stream.once('error',error=>{clearTimeout(timer);reject(error);});
   stream.once('end',()=>{clearTimeout(timer);resolve(Buffer.concat(chunks,size));});
  });
 }
 async stripTokens(path:string,generation:string,metageneration:string):Promise<void> {
  decimal(generation);decimal(metageneration);
  const current=await this.metadata(path);
  if(!current||current.generation!==generation||current.metageneration!==metageneration)throw new HttpsError('aborted','The file changed.');
  if(!current.hasDownloadTokens)return;
  await bounded(this.files.file(path,{generation,preconditionOpts:{ifGenerationMatch:generation,ifMetagenerationMatch:metageneration}})
   .setMetadata({metadata:{...current.customMetadata,firebaseStorageDownloadTokens:null},cacheControl:'private, no-store'}));
 }
 async delete(path:string,generation:string):Promise<boolean> {
  decimal(generation);const current=await this.metadata(path);
  if(!current||current.generation!==generation)return false;
  try{await bounded(this.files.file(path,{generation,preconditionOpts:{ifGenerationMatch:generation}}).delete());return true;}
  catch(error){if([404,412].includes(code(error)??0))return false;throw error;}
 }
}
