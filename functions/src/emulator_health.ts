import { HttpsError } from 'firebase-functions/v2/https';

/** Local connection probe. Ownership always comes from verified Firebase Auth. */
export function validateEmulatorHealthRequest(
  input: unknown,
  uid: string | undefined,
  emulator: boolean,
  projectId: string | undefined,
): { mode: 'emulator'; userId: string } {
  if (!emulator || !projectId || !/^demo-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(projectId) || projectId.length > 30) {
    throw new HttpsError('failed-precondition', 'This probe requires local demo emulators.');
  }
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to check the local connection.');
  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).length !== 0) {
    throw new HttpsError('invalid-argument', 'Send an empty request.');
  }
  return { mode: 'emulator', userId: uid };
}
