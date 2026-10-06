import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWebEnvironment} from './web_environment.mjs';
const config={TALLY_ENVIRONMENT:'production',TALLY_PROJECT_ID:'tally-test-production',TALLY_FUNCTIONS_REGION:'asia-southeast1',TALLY_FIREBASE_API_KEY:'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',TALLY_FIREBASE_APP_ID:'1:123456789:web:abcdef',TALLY_FIREBASE_MESSAGING_SENDER_ID:'123456789',TALLY_FIREBASE_AUTH_DOMAIN:'tally-test-production.firebaseapp.com',TALLY_FIREBASE_STORAGE_BUCKET:'tally-test-production.firebasestorage.app',TALLY_APP_CHECK_WEB_SITE_KEY:'site-key-for-tests'};
test('configured production web build accepts complete public configuration',()=>assert.doesNotThrow(()=>validateWebEnvironment(config)));
test('missing defines fail before Flutter build',()=>assert.throws(()=>validateWebEnvironment({})));
test('rejects mismatch, emulator, different app platform, or secret-bearing config',()=>{
 for(const update of [{TALLY_ENVIRONMENT:'staging'},{TALLY_PROJECT_ID:'demo-tally'},{TALLY_FIREBASE_APP_ID:'1:987654321:web:abcdef'},{TALLY_FIREBASE_APP_ID:'1:123456789:android:abcdef'},{TALLY_FIREBASE_AUTH_DOMAIN:'another.firebaseapp.com'},{TALLY_APP_CHECK_WEB_SITE_KEY:''},{FIREBASE_PRIVATE_KEY:'never-in-build'}]){
  assert.throws(()=>validateWebEnvironment({...config,...update}));
 }
});
test('web push public key is optional and checked without accepting secrets',()=>{
 assert.doesNotThrow(()=>validateWebEnvironment({...config,TALLY_WEB_PUSH_VAPID_KEY:'B'+'A'.repeat(86)}));
 assert.throws(()=>validateWebEnvironment({...config,TALLY_WEB_PUSH_VAPID_KEY:'private-key'}));
});
