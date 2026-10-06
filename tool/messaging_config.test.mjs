import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {generateMessagingConfig} from './messaging_config.mjs';
const config={TALLY_ENVIRONMENT:'production',TALLY_PROJECT_ID:'tally-test-production',TALLY_FUNCTIONS_REGION:'asia-southeast1',TALLY_FIREBASE_API_KEY:'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',TALLY_FIREBASE_APP_ID:'1:123456789:web:abcdef',TALLY_FIREBASE_MESSAGING_SENDER_ID:'123456789',TALLY_FIREBASE_AUTH_DOMAIN:'tally-test-production.firebaseapp.com',TALLY_FIREBASE_STORAGE_BUCKET:'tally-test-production.firebasestorage.app',TALLY_APP_CHECK_WEB_SITE_KEY:'site-key-for-tests'};
test('service-worker config includes only checked public Firebase options',()=>{
 const js=generateMessagingConfig({...config,TALLY_WEB_PUSH_VAPID_KEY:'B'+'A'.repeat(86)},'production');
 assert.ok(js.includes('tally-test-production'));assert.equal(js.includes('site-key-for-tests'),false);
 assert.equal(js.includes('TALLY_FUNCTIONS_REGION'),false);assert.equal(js.includes('VAPID'),false);
 assert.throws(()=>generateMessagingConfig({...config,FIREBASE_PRIVATE_KEY:'secret'},'production'));
 assert.throws(()=>generateMessagingConfig({...config,TALLY_PROJECT_ID:'demo-tally'},'production'));
});
