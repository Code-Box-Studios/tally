import { onCall } from 'firebase-functions/v2/https';
import { validateEmulatorHealthRequest } from './emulator_health.js';
import {getAuth} from 'firebase-admin/auth';
import {bootstrapProfile,updateProfile as updateAccountProfile} from './accounts/profile.js';
import {database,exactObject,ownerCallable} from './shared/callable.js';
import {saveCatalog as saveOwnerCatalog} from './catalog/catalog.js';
import {createObligation as createOwnerObligation,editObligation as editOwnerObligation,cancelObligation as cancelOwnerObligation} from './obligations/obligation_service.js';

const emulator = process.env.FUNCTIONS_EMULATOR === 'true';
export const emulatorHealth = onCall(
  { enforceAppCheck: !emulator },
  request => validateEmulatorHealthRequest(request.data, request.auth?.uid, emulator, process.env.GCLOUD_PROJECT),
);

export const bootstrapUser = ownerCallable(async (uid,data) => {
  exactObject(data,[]);
  const user = await getAuth().getUser(uid);
  return {profile:await bootstrapProfile(uid,{displayName:user.displayName ?? null,photoUrl:user.photoURL ?? null},database)};
});
export const updateProfile = ownerCallable(async (uid,data) => ({profile:await updateAccountProfile(uid,data,database)}));
export const saveCatalog = ownerCallable((uid,data)=>saveOwnerCatalog(uid,data,database));
export const createObligation = ownerCallable((uid,data)=>createOwnerObligation(uid,data,database));
export const editObligation = ownerCallable((uid,data)=>editOwnerObligation(uid,data,database));
export const cancelObligation = ownerCallable((uid,data)=>cancelOwnerObligation(uid,data,database));
