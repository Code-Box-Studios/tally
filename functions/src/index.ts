import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onObjectFinalized} from 'firebase-functions/v2/storage';
import {enqueueProjection,refreshDashboard as requestDashboardRefresh} from './jobs/projection_jobs.js';
import {repairFiniteDebt as repairOwnerFiniteDebt} from './dashboard/repair.js';
import { onCall } from 'firebase-functions/v2/https';
import { validateEmulatorHealthRequest } from './emulator_health.js';
import {getAuth} from 'firebase-admin/auth';
import {bootstrapProfile,updateProfile as updateAccountProfile} from './accounts/profile.js';
import {requestAccountDeletion as requestOwnerAccountDeletion,getAccountDeletionStatus as getOwnerAccountDeletionStatus} from './accounts/deletion_service.js';
import {dispatchAccountDeletionJobs} from './accounts/deletion_jobs.js';
import {runAccountDeletionJob,FirebaseAccountDeletionAuth} from './accounts/deletion_worker.js';
import {FirebaseAccountDeletionStorage} from './accounts/deletion_storage.js';
import {parseDeletionJob,canClaimDeletionJob} from './accounts/deletion_contract.js';
import {database,exactObject,ownerCallable,authorizeCaller} from './shared/callable.js';
import {saveCatalog as saveOwnerCatalog} from './catalog/catalog.js';
import {createObligation as createOwnerObligation,editObligation as editOwnerObligation,cancelObligation as cancelOwnerObligation} from './obligations/obligation_service.js';
import {recordPayment as recordOwnerPayment,recordInstallmentPayment as recordOwnerInstallmentPayment} from './payments/payment_service.js';
import {createInstallment as createOwnerInstallment,editInstallment as editOwnerInstallment,cancelInstallment as cancelOwnerInstallment} from './obligations/installment_service.js';
import {correctPayment as correctOwnerPayment} from './payments/corrections.js';
import {createRecurring as createOwnerRecurring,editRecurring as editOwnerRecurring,changeRecurringLifecycle as changeOwnerRecurringLifecycle} from './recurring/recurring_service.js';
import {setRecurringAmount as setOwnerRecurringAmount,editRecurringInstance as editOwnerRecurringInstance,skipRecurringInstance as skipOwnerRecurringInstance} from './recurring/instance_service.js';
import {dispatchReadyJobs,runReadyJob,shouldRunPrompt,promptWorkerEnabled} from './jobs/dispatch.js';
import {confirmDeduction as confirmOwnerDeduction,reportDeductionFailure as reportOwnerDeductionFailure} from './recurring/automatic_service.js';
import {updateNotificationPreferences as updateOwnerNotificationPreferences,setObligationReminder as setOwnerObligationReminder} from './notifications/preference_service.js';
import {markReminderRead as markOwnerReminderRead} from './notifications/inbox_service.js';
import {enqueueOwnerReminders} from './notifications/reconciliation.js';
import {registerNotificationDevice as registerOwnerNotificationDevice,unregisterNotificationDevice as unregisterOwnerNotificationDevice,
  listNotificationDevices as listOwnerNotificationDevices} from './notifications/device_service.js';
import {cleanupNotificationDevices} from './notifications/device_cleanup.js';
import {reserveAttachment as reserveOwnerAttachment,removeAttachment as removeOwnerAttachment} from './attachments/reservation_service.js';
import {uploadAttachment as uploadOwnerAttachment} from './attachments/upload_service.js';
import {downloadAttachment as downloadOwnerAttachment} from './attachments/download_service.js';
import {FirebaseAttachmentStorageGateway} from './attachments/storage_gateway.js';
import {enqueueAttachmentFinalization} from './attachments/attachment_jobs.js';
import {cleanupExpiredAttachments} from './attachments/cleanup.js';

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
export const requestAccountDeletion=ownerCallable((uid,data,request)=>requestOwnerAccountDeletion(uid,data,request.auth?.token.auth_time,database));
export const getAccountDeletionStatus=ownerCallable((uid,data)=>getOwnerAccountDeletionStatus(uid,data,database));
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
export const confirmDeduction = ownerCallable((uid,data)=>confirmOwnerDeduction(uid,data,database));
export const reportDeductionFailure = ownerCallable((uid,data)=>reportOwnerDeductionFailure(uid,data,database));
export const updateNotificationPreferences=ownerCallable((uid,data)=>updateOwnerNotificationPreferences(uid,data,database));
export const markReminderRead=ownerCallable((uid,data)=>markOwnerReminderRead(uid,data,database));
export const setObligationReminder=ownerCallable((uid,data)=>setOwnerObligationReminder(uid,data,database));
export const registerNotificationDevice=ownerCallable((uid,data)=>registerOwnerNotificationDevice(uid,data,database));
export const unregisterNotificationDevice=ownerCallable((uid,data)=>unregisterOwnerNotificationDevice(uid,data,database));
export const listNotificationDevices=ownerCallable((uid,data)=>listOwnerNotificationDevices(uid,data,database));
export const reserveAttachment=ownerCallable((uid,data)=>reserveOwnerAttachment(uid,data,database));
export const removeAttachment=ownerCallable((uid,data)=>removeOwnerAttachment(uid,data,database));
export const uploadAttachment=onCall(
  {region:'asia-southeast1',enforceAppCheck:!(emulator&&/^demo-[a-z0-9-]+$/.test(process.env.GCLOUD_PROJECT??'')),memory:'512MiB',concurrency:2,maxInstances:5,timeoutSeconds:120},
  request=>uploadOwnerAttachment(authorizeCaller(request.auth?.uid,request.app!==undefined,emulator,process.env.GCLOUD_PROJECT),request.data,database,new FirebaseAttachmentStorageGateway()),
);
export const downloadAttachment=onCall(
  {region:'asia-southeast1',enforceAppCheck:!(emulator&&/^demo-[a-z0-9-]+$/.test(process.env.GCLOUD_PROJECT??'')),memory:'512MiB',concurrency:2,maxInstances:5,timeoutSeconds:120},
  request=>downloadOwnerAttachment(authorizeCaller(request.auth?.uid,request.app!==undefined,emulator,process.env.GCLOUD_PROJECT),request.data,database,new FirebaseAttachmentStorageGateway()),
);
export const finalizePrivateFile=onObjectFinalized(
  {region:'asia-southeast1',retry:true,maxInstances:10},
  event=>enqueueAttachmentFinalization(event.data,database).then(()=>{}),
);
export const expirePrivateFileReservations=onSchedule(
  {schedule:'every 60 minutes',timeZone:'UTC',region:'asia-southeast1',timeoutSeconds:540,maxInstances:1},
  async()=>{await cleanupExpiredAttachments(database,new FirebaseAttachmentStorageGateway());},
);

export const createInstallment = ownerCallable((uid,data)=>createOwnerInstallment(uid,data,database));
export const editInstallment = ownerCallable((uid,data)=>editOwnerInstallment(uid,data,database));
export const cancelInstallment = ownerCallable((uid,data)=>cancelOwnerInstallment(uid,data,database));
export const recordInstallmentPayment = ownerCallable((uid,data)=>recordOwnerInstallmentPayment(uid,data,database));

export const refreshDashboard=ownerCallable((uid,data)=>requestDashboardRefresh(uid,data,database));
export const repairFiniteDebt=ownerCallable((uid,data)=>repairOwnerFiniteDebt(uid,data,database));
export const projectFinancialMutation=onDocumentWritten(
  {document:'users/{uid}/ledgerState/current',region:'asia-southeast1',retry:true,maxInstances:10},
  async event=>{if(event.data?.after.exists)await Promise.all([enqueueProjection(event.params.uid,database),enqueueOwnerReminders(event.params.uid,database)]);},
);
export const projectProfileChange=onDocumentWritten(
  {document:'users/{uid}',region:'asia-southeast1',retry:true,maxInstances:10},
  async event=>{if(event.data?.after.exists)await Promise.all([enqueueProjection(event.params.uid,database),enqueueOwnerReminders(event.params.uid,database)]);},
);
export const reconcileReminderPreferences=onDocumentWritten(
  {document:'users/{uid}/notificationPreferences/default',region:'asia-southeast1',retry:true,maxInstances:10},
  async event=>{if(event.data?.after.exists)await enqueueOwnerReminders(event.params.uid,database);},
);
export const processFinancialJobs=onSchedule(
  {schedule:'every 5 minutes',timeZone:'UTC',region:'asia-southeast1',timeoutSeconds:540,memory:'1GiB',maxInstances:2},
  async()=>{await dispatchReadyJobs(database);},
);
export const retireStaleNotificationDevices=onSchedule(
  {schedule:'every 24 hours',timeZone:'UTC',region:'asia-southeast1',timeoutSeconds:540,maxInstances:1},
  async()=>{await cleanupNotificationDevices(database);},
);
export const processReadyFinancialJob=onDocumentWritten(
  {document:'systemJobs/{jobId}',region:'asia-southeast1',retry:true,maxInstances:10,timeoutSeconds:540,memory:'1GiB',concurrency:2},
  async event=>{
    if(!promptWorkerEnabled(emulator,process.env.GCLOUD_PROJECT,process.env.TALLY_EMULATOR_JOB_MODE))return;
    if(event.data?.after.exists&&shouldRunPrompt(event.data.after.data()))await runReadyJob(event.params.jobId,database);
  },
);
export const processAcceptedAccountDeletion=onDocumentWritten(
  {document:'accountDeletionJobs/{uid}',region:'asia-southeast1',retry:true,maxInstances:5,timeoutSeconds:180,concurrency:1},
  async event=>{
    if(!promptWorkerEnabled(emulator,process.env.GCLOUD_PROJECT,process.env.TALLY_EMULATOR_JOB_MODE)||!event.data?.after.exists)return;
    let job;
    try {job=parseDeletionJob(event.params.uid,event.data.after.data());}catch{return;}
    if(canClaimDeletionJob(job,new Date()))await runAccountDeletionJob(event.params.uid,database,
      {auth:new FirebaseAccountDeletionAuth(),storage:new FirebaseAccountDeletionStorage()});
  },
);
export const recoverAccountDeletions=onSchedule(
  {schedule:'every 5 minutes',timeZone:'UTC',region:'asia-southeast1',timeoutSeconds:540,maxInstances:1},
  async()=>{
    if(!promptWorkerEnabled(emulator,process.env.GCLOUD_PROJECT,process.env.TALLY_EMULATOR_JOB_MODE))return;
    await dispatchAccountDeletionJobs(database,{auth:new FirebaseAccountDeletionAuth(),storage:new FirebaseAccountDeletionStorage()});
  },
);
