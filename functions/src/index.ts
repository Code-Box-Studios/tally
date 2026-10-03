import { onCall } from 'firebase-functions/v2/https';
import { validateEmulatorHealthRequest } from './emulator_health.js';
import {getAuth} from 'firebase-admin/auth';
import {bootstrapProfile,updateProfile as updateAccountProfile} from './accounts/profile.js';
import {database,exactObject,ownerCallable} from './shared/callable.js';

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
