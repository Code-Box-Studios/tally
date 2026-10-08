import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if (process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL !== 'http://127.0.0.1:36931' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.GCLOUD_PROJECT !== 'demo-tally') throw Error('Owned local browser and demo emulators required.');
const tool = fileURLToPath(new URL('./test_browser_offline_sync.mjs', import.meta.url));
for (const mode of ['--setup', '--save-offline', '--reload-offline', '--reconnect', '--receipt-check', '--owner-switch', '--visual-check']) {
  execFileSync(process.execPath, [tool, mode], {stdio: 'inherit', env: {...process.env, TALLY_FLUTTER_WEB_URL: 'http://localhost:7364/', METADATA_SERVER_DETECTION: 'none'}});
}
console.log('Verified actual offline save, full reload, one canonical payment, and owner isolation.');
