import { onCall } from 'firebase-functions/v2/https';
import { validateEmulatorHealthRequest } from './emulator_health.js';
import {getAuth} from 'firebase-admin/auth';
import {bootstrapProfile,updateProfile as updateAccountProfile} from './accounts/profile.js';
import {database,exactObject,ownerCallable} from './shared/callable.js';
import {saveCatalog as saveOwnerCatalog} from './catalog/catalog.js';
import {createObligation as createOwnerObligation,editObligation as editOwnerObligation,cancelObligation as cancelOwnerObligation} from './obligations/obligation_service.js';
import {recordPayment as recordOwnerPayment,recordInstallmentPayment as recordOwnerInstallmentPayment} from './payments/payment_service.js';
import {createInstallment as createOwnerInstallment,editInstallment as editOwnerInstallment,cancelInstallment as cancelOwnerInstallment} from './obligations/installment_service.js';
import {correctPayment as correctOwnerPayment} from './payments/corrections.js';

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
export const recordPayment = ownerCallable((uid,data)=>recordOwnerPayment(uid,data,database));
export const correctPayment = ownerCallable((uid,data)=>correctOwnerPayment(uid,data,database));

export const createInstallment = ownerCallable((uid,data)=>createOwnerInstallment(uid,data,database));
export const editInstallment = ownerCallable((uid,data)=>editOwnerInstallment(uid,data,database));
export const cancelInstallment = ownerCallable((uid,data)=>cancelOwnerInstallment(uid,data,database));
export const recordInstallmentPayment = ownerCallable((uid,data)=>recordOwnerInstallmentPayment(uid,data,database));
