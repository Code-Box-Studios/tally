import {HttpsError, onCall, type CallableRequest} from 'firebase-functions/v2/https';
import {getApps, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

export const region = 'asia-southeast1';
const emulator = process.env.FUNCTIONS_EMULATOR === 'true';
const projectId = process.env.GCLOUD_PROJECT;
const demoEmulator = emulator && /^demo-[a-z0-9-]+$/.test(projectId ?? '');
if (!getApps().length) initializeApp();
export const database = getFirestore();

export function authorizeCaller(uid: string | undefined, attested: boolean, inEmulator: boolean, project: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('permission-denied', 'Account unavailable.');
  if (!attested && !(inEmulator && /^demo-[a-z0-9-]+$/.test(project ?? ''))) {
    throw new HttpsError('failed-precondition', 'Application verification required.');
  }
  return uid;
}

export function ownerCallable<T>(handler: (uid: string, data: unknown, request: CallableRequest) => Promise<T>) {
  return onCall({region, enforceAppCheck: !demoEmulator, maxInstances: 10}, async request => {
    const uid = authorizeCaller(request.auth?.uid, request.app !== undefined, emulator, projectId);
    return handler(uid, request.data, request);
  });
}

export function exactObject(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Invalid request.');
  }
  const object = input as Record<string, unknown>;
  if (Object.keys(object).some(key => !fields.includes(key)) || fields.some(key => !(key in object))) {
    throw new HttpsError('invalid-argument', 'Invalid request fields.');
  }
  return object;
}
