import {createHash} from 'node:crypto';
import {FieldValue, type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {exactObject} from '../shared/callable.js';

const currencies = ['PHP','USD','EUR','SGD','AUD','JPY','GBP'] as const;
const themes = ['light','dark','system'] as const;
type Currency = typeof currencies[number];
type Theme = typeof themes[number];
export interface ProfileView {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  defaultCurrency: Currency;
  timezone: string;
  locale: string;
  themeMode: Theme;
  onboardingComplete: boolean;
  accountStatus: 'active';
  revision: number;
  schemaVersion: 1;
}
export interface ProfileUpdate {
  commandId: string;
  expectedOwnerUid: string;
  expectedRevision: number;
  defaultCurrency: Currency;
  timezone: string;
  themeMode: Theme;
  onboardingComplete: boolean;
}
const categoryDefaults = [
  ['personal-loan','Personal Loan'],['rent','Rent'],['utilities','Utilities'],
  ['subscription','Subscription'],['credit-card','Credit Card'],['insurance','Insurance'],
  ['vehicle','Vehicle'],['education','Education'],['family','Family'],['business','Business'],
  ['housing','Housing'],['membership','Membership'],['installment','Installment'],['other','Other'],
] as const;

export function validateProfileUpdate(input: unknown): ProfileUpdate {
  const data = exactObject(input,['commandId','expectedOwnerUid','expectedRevision','defaultCurrency','timezone','themeMode','onboardingComplete']);
  if (typeof data.commandId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.commandId) ||
      typeof data.expectedOwnerUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.expectedOwnerUid) ||
      typeof data.expectedRevision !== 'number' || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1 || data.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      !currencies.includes(data.defaultCurrency as Currency) || !themes.includes(data.themeMode as Theme) ||
      typeof data.onboardingComplete !== 'boolean' || typeof data.timezone !== 'string' || data.timezone.length > 100) {
    throw new HttpsError('invalid-argument','Check your account preferences.');
  }
  // ICU validates real IANA zones. Offset strings are deliberately not accepted.
  if (data.timezone !== 'UTC' && !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(data.timezone)) {
    throw new HttpsError('invalid-argument','Choose an IANA timezone.');
  }
  try {new Intl.DateTimeFormat('en',{timeZone:data.timezone});}
  catch {throw new HttpsError('invalid-argument','Choose a supported timezone.');}
  return data as unknown as ProfileUpdate;
}

function activeProfile(uid: string, data: Record<string, unknown> | undefined): ProfileView {
  if (!data || data.userId !== uid || data.accountStatus !== 'active' || data.schemaVersion !== 1 ||
      !currencies.includes(data.defaultCurrency as Currency) || !themes.includes(data.themeMode as Theme) ||
      typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision) || data.revision < 1) {
    throw new HttpsError('failed-precondition','Your account is unavailable.');
  }
  return {
    userId:uid,displayName:data.displayName as string,photoUrl:data.photoUrl as string|null,
    defaultCurrency:data.defaultCurrency as Currency,timezone:data.timezone as string,locale:data.locale as string,
    themeMode:data.themeMode as Theme,onboardingComplete:data.onboardingComplete as boolean,
    accountStatus:'active',revision:data.revision,schemaVersion:1,
  };
}

export async function bootstrapProfile(uid: string, identity: {displayName:string|null;photoUrl:string|null}, db: Firestore): Promise<ProfileView> {
  const profileRef = db.doc(`users/${uid}`);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(profileRef);
    if (existing.exists) return activeProfile(uid,existing.data());
    // A persistent deletion fence survives profile removal.
    const deletion = await transaction.get(db.doc(`accountDeletionJobs/${uid}`));
    if (deletion.exists) throw new HttpsError('failed-precondition','Your account is unavailable.');
    const profile: ProfileView = {
      userId:uid,displayName:identity.displayName?.slice(0,120) ?? '',photoUrl:identity.photoUrl,
      defaultCurrency:'PHP',timezone:'Asia/Manila',locale:'en',themeMode:'system',
      onboardingComplete:false,accountStatus:'active',revision:1,schemaVersion:1,
    };
    const audit = {userId:uid,schemaVersion:1,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
    transaction.create(profileRef,{...profile,...audit});
    for (const [id,name] of categoryDefaults) {
      transaction.create(profileRef.collection('categories').doc(`default-${id}`),{
        ...audit,name,searchName:name.toLocaleLowerCase('en'),iconKey:null,isDefault:true,active:true,revision:1,
      });
    }
    transaction.create(profileRef.collection('notificationPreferences').doc('current'),{
      ...audit,enabled:true,pushEnabled:false,offsetDays:[3,0],localTime:'09:00',revision:1,
    });
    transaction.create(profileRef.collection('ledgerState').doc('current'),{
      ...audit,revision:0,formulaVersion:1,lastMutationAt:FieldValue.serverTimestamp(),
    });
    return profile;
  });
}

export async function updateProfile(uid: string, input: unknown, db: Firestore): Promise<ProfileView> {
  const data = validateProfileUpdate(input);
  // This is a session fence, never an authoritative owner. All paths use uid.
  if (data.expectedOwnerUid !== uid) throw new HttpsError('permission-denied','Your sign-in changed. Please try again.');
  // Explicit field order is stable across retries and client map order.
  const payloadHash = createHash('sha256').update(JSON.stringify([
    'updateProfile',data.expectedRevision,data.defaultCurrency,data.timezone,data.themeMode,data.onboardingComplete,
  ])).digest('hex');
  const profileRef = db.doc(`users/${uid}`);
  const receiptRef = profileRef.collection('commandReceipts').doc(data.commandId);
  return db.runTransaction(async transaction => {
    const [profileDoc,receipt] = await Promise.all([transaction.get(profileRef),transaction.get(receiptRef)]);
    const current = activeProfile(uid,profileDoc.data());
    if (receipt.exists) {
      if (receipt.data()?.payloadHash !== payloadHash || receipt.data()?.commandType !== 'updateProfile') {
        throw new HttpsError('already-exists','This action identifier was already used.');
      }
      return receipt.data()!.result as ProfileView;
    }
    if (current.revision !== data.expectedRevision) throw new HttpsError('aborted','Preferences changed. Refresh and try again.');
    if (current.onboardingComplete && !data.onboardingComplete) throw new HttpsError('failed-precondition','Setup is already complete.');
    const result: ProfileView = {...current,defaultCurrency:data.defaultCurrency,timezone:data.timezone,themeMode:data.themeMode,onboardingComplete:data.onboardingComplete,revision:current.revision+1};
    transaction.update(profileRef,{defaultCurrency:result.defaultCurrency,timezone:result.timezone,themeMode:result.themeMode,onboardingComplete:result.onboardingComplete,revision:result.revision,updatedAt:FieldValue.serverTimestamp()});
    transaction.create(receiptRef,{
      userId:uid,schemaVersion:1,payloadHash,commandType:'updateProfile',result,
      recordedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    });
    return result;
  });
}
