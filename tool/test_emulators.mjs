import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const firebase=fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js',import.meta.url));
const nodePath=process.execPath;
async function run(mode,command) {
  const child=spawn(nodePath,[firebase,'emulators:exec','--project','demo-tally','--only','auth,firestore,functions,storage',command],{
    stdio:'inherit',env:{...process.env,TALLY_EMULATOR_JOB_MODE:mode,METADATA_SERVER_DETECTION:'none',
      GOOGLE_CLOUD_PROJECT:'demo-tally',GCLOUD_PROJECT:'demo-tally'},
  });
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0)throw new Error(`The ${mode} emulator suite failed (${code}).`);
}
// Actual Firestore triggers and deterministic financial race tests each need
// their own fresh demo data. Production never honors manual emulator mode.
await run('automatic','node --test firebase/prompt-tests/*.test.mjs');
await run('manual','node --test --test-concurrency=1 firebase/rules-tests/*.test.mjs firebase/emulator-tests/*.test.mjs');
