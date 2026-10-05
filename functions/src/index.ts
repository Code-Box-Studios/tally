import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {enqueueProjection,dispatchProjectionJobs,refreshDashboard as requestDashboardRefresh} from './jobs/projection_jobs.js';
import {repairFiniteDebt as repairOwnerFiniteDebt} from './dashboard/repair.js';
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
import {createRecurring as createOwnerRecurring,editRecurring as editOwnerRecurring,changeRecurringLifecycle as changeOwnerRecurringLifecycle} from './recurring/recurring_service.js';
import {setRecurringAmount as setOwnerRecurringAmount,editRecurringInstance as editOwnerRecurringInstance,skipRecurringInstance as skipOwnerRecurringInstance} from './recurring/instance_service.js';
import {dispatchRecurringJobs} from './jobs/recurring_dispatch.js';

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
export const createRecurring = ownerCallable((uid,data)=>createOwnerRecurring(uid,data,database));
export const editRecurring = ownerCallable((uid,data)=>editOwnerRecurring(uid,data,database));
export const changeRecurringLifecycle = ownerCallable((uid,data)=>changeOwnerRecurringLifecycle(uid,data,database));
export const setRecurringAmount = ownerCallable((uid,data)=>setOwnerRecurringAmount(uid,data,database));
export const editRecurringInstance = ownerCallable((uid,data)=>editOwnerRecurringInstance(uid,data,database));
export const skipRecurringInstance = ownerCallable((uid,data)=>skipOwnerRecurringInstance(uid,data,database));

export const createInstallment = ownerCallable((uid,data)=>createOwnerInstallment(uid,data,database));
export const editInstallment = ownerCallable((uid,data)=>editOwnerInstallment(uid,data,database));
export const cancelInstallment = ownerCallable((uid,data)=>cancelOwnerInstallment(uid,data,database));
export const recordInstallmentPayment = ownerCallable((uid,data)=>recordOwnerInstallmentPayment(uid,data,database));

export const refreshDashboard=ownerCallable((uid,data)=>requestDashboardRefresh(uid,data,database));
export const repairFiniteDebt=ownerCallable((uid,data)=>repairOwnerFiniteDebt(uid,data,database));
export const projectFinancialMutation=onDocumentWritten(
  {document:'users/{uid}/ledgerState/current',region:'asia-southeast1',retry:true,maxInstances:10},
  async event=>{if(event.data?.after.exists)await enqueueProjection(event.params.uid,database);},
);
export const projectProfileChange=onDocumentWritten(
  {document:'users/{uid}',region:'asia-southeast1',retry:true,maxInstances:10},
  async event=>{if(event.data?.after.exists)await enqueueProjection(event.params.uid,database);},
);
export const processFinancialProjections=onSchedule(
  {schedule:'every 5 minutes',timeZone:'UTC',region:'asia-southeast1',timeoutSeconds:540,memory:'1GiB',maxInstances:2},
  async()=>{await dispatchProjectionJobs(database);},
);
export const processRecurringSchedules=onSchedule(
  {schedule:'every 5 minutes',timeZone:'UTC',region:'asia-southeast1',timeoutSeconds:540,memory:'1GiB',maxInstances:2},
  async()=>{await dispatchRecurringJobs(database);},
);
