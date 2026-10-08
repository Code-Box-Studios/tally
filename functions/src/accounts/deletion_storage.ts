import {getStorage} from 'firebase-admin/storage';
import type {Bucket} from '@google-cloud/storage';
import {identifier} from '../shared/validation.js';
import {deletionNetwork} from './deletion_contract.js';

export interface DeletionObject {name:string; generation:string;}
export interface AccountDeletionStorage {
  listOwned(uid:string,limit:number):Promise<readonly DeletionObject[]>;
  deleteGeneration(uid:string,name:string,generation:string):Promise<boolean>;
}
export function validateDeletionObject(uid:string,object:DeletionObject):void {
  const prefix=`users/${identifier(uid)}/attachments/`;
  if(typeof object.name!=='string'||!object.name.startsWith(prefix)||object.name.length<=prefix.length||
      object.name.length>2048||/[\x00-\x1f\x7f]/.test(object.name)||
      typeof object.generation!=='string'||!/^[1-9][0-9]{0,31}$/.test(object.generation))
    throw new Error('Invalid owned deletion object.');
}
export class FirebaseAccountDeletionStorage implements AccountDeletionStorage {
  constructor(private readonly bucket:Bucket=getStorage().bucket()) {}
  async listOwned(uid:string,limit:number):Promise<readonly DeletionObject[]> {
    identifier(uid);
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid deletion Storage page.');
    const [files]=await deletionNetwork(()=>this.bucket.getFiles({prefix:`users/${uid}/attachments/`,
      versions:true,autoPaginate:false,maxResults:limit}));
    if(files.length>limit)throw new Error('Invalid deletion Storage response.');
    return files.map(file=>{
      const object={name:file.name,generation:file.metadata.generation as string};
      validateDeletionObject(uid,object);return object;
    });
  }
  async deleteGeneration(uid:string,name:string,generation:string):Promise<boolean> {
    validateDeletionObject(uid,{name,generation});
    const file=this.bucket.file(name,{generation,preconditionOpts:{ifGenerationMatch:generation}});
    try {
      // Some Storage emulators ignore generation query/precondition parameters.
      // Verify the selected revision too; production still sends both immutable
      // generation and ifGenerationMatch to fence changes after this read.
      const [metadata]=await deletionNetwork(()=>file.getMetadata());
      if(metadata.generation!==generation)return false;
      await deletionNetwork(()=>file.delete());
      return true;
    } catch(error) {
      const code=Number((error as {code?:unknown})?.code);
      if(code===404||code===412)return false;
      throw error;
    }
  }
}
