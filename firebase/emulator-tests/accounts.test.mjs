import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, createUserWithEmailAndPassword, deleteUser} from 'firebase/auth';
import {getFunctions, connectFunctionsEmulator, httpsCallable} from 'firebase/functions';
import {getFirestore, connectFirestoreEmulator, doc, getDoc, terminate} from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const {initializeApp: initializeAdmin, deleteApp: deleteAdmin} = require('firebase-admin/app');
const {getFirestore: adminFirestore} = require('firebase-admin/firestore');

test('private account bootstrap is isolated, concurrent-safe and preserves revisioned preferences', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:/);
  const app = initializeApp({projectId:'demo-tally',apiKey:'demo-tally',appId:'demo-tally',authDomain:'demo-tally.firebaseapp.com'}, 'accounts');
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'asia-southeast1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const bootstrap = httpsCallable(functions, 'bootstrapUser');
  const update = httpsCallable(functions, 'updateProfile');
  const admin = initializeAdmin({projectId:'demo-tally'}, 'account-fixtures');
  let user;
  try {
    await assert.rejects(bootstrap({}), {code:'functions/unauthenticated'});
    user = (await createUserWithEmailAndPassword(auth, `account-${Date.now()}@example.test`, 'local-test-password')).user;
    const results = await Promise.all([bootstrap({}), bootstrap({})]);
    for (const result of results) {
      assert.equal(result.data.profile.userId, user.uid);
      assert.equal(result.data.profile.defaultCurrency, 'PHP');
      assert.equal(result.data.profile.timezone, 'Asia/Manila');
      assert.equal(result.data.profile.themeMode, 'system');
      assert.equal(result.data.profile.revision, 1);
      assert.equal(result.data.profile.onboardingComplete, false);
    }
    const userRef = adminFirestore(admin).doc(`users/${user.uid}`);
    const categories = await userRef.collection('categories').get();
    assert.equal(categories.size, 14);
    const stored = (await userRef.get()).data();
    assert.equal(typeof stored.createdAt.toMillis(), 'number');
    assert.equal(stored.schemaVersion, 1);
    const payload = {commandId:'onboard-1', expectedRevision:1, defaultCurrency:'USD',timezone:'America/New_York',themeMode:'dark',onboardingComplete:true};
    const updated = await update(payload);
    assert.equal(updated.data.profile.revision, 2);
    assert.equal(updated.data.profile.defaultCurrency, 'USD');
    assert.deepEqual((await update(payload)).data, updated.data);
    await assert.rejects(update({...payload, defaultCurrency:'EUR'}), {code:'functions/already-exists'});
    await assert.rejects(update({...payload, commandId:'stale'}), {code:'functions/aborted'});
    for (const invalid of [
      {...payload,commandId:'bad-currency',expectedRevision:2,defaultCurrency:'XYZ'},
      {...payload,commandId:'bad-zone',expectedRevision:2,timezone:'Asia/Fiction'},
      {...payload,commandId:'bad-owner',expectedRevision:2,userId:'bob'},
      {...payload,commandId:'bad-rev',expectedRevision:-1},
    ]) await assert.rejects(update(invalid), {code:'functions/invalid-argument'});
    assert.equal((await bootstrap({})).data.profile.defaultCurrency, 'USD');
    assert.equal((await userRef.collection('categories').get()).size, 14);
    assert.equal((await getDoc(doc(db, `users/${user.uid}`))).data().timezone, 'America/New_York');
    await assert.rejects(getDoc(doc(db, 'users/another-owner')), {code:'permission-denied'});
    await userRef.update({accountStatus:'deleting'});
    await assert.rejects(bootstrap({}), {code:'functions/failed-precondition'});
    await assert.rejects(update({...payload,commandId:'deleted-update',expectedRevision:2}), {code:'functions/failed-precondition'});
    assert.equal((await userRef.get()).data().accountStatus, 'deleting');
  } finally {
    if(user) await deleteUser(user);
    await terminate(db); await deleteApp(app); await deleteAdmin(admin);
  }
});
