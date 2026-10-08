import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectConsoleDiagnostics} from './browser_console_privacy.mjs';
if (process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL !== 'http://127.0.0.1:36931' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.GCLOUD_PROJECT !== 'demo-tally') throw Error('Owned local browser and demo emulators required.');
const tool = fileURLToPath(new URL('./test_browser_offline_sync.mjs', import.meta.url));
const browserEnv = {...process.env, CHROME_DEVTOOLS_AXI_SESSION: 'tally-offline-sync', CHROME_DEVTOOLS_AXI_PORT: '9478'};
function privateBrowserOutput(args, input) {
  const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', ...args], {encoding: 'utf8', input, env: browserEnv});
  if (result.status !== 0) throw Error('Owned browser diagnostic collection failed.');
  return result.stdout;
}
async function auditConsole(phase) {
  // Credentials remain in process RAM. Console contents are never written to
  // the gate log, including when a diagnostic causes the gate to fail.
  const forbiddenValues = JSON.parse(privateBrowserOutput(['run'], 'console.log(JSON.stringify(await page.eval(()=>[window.__qaAccount?.password,window.__qaBob?.password].filter(Boolean))));'));
  const pages = privateBrowserOutput(['pages']);
  const ids = [...pages.matchAll(/^\s*(\d+),http:\/\/localhost:7364\/[^,]*,/gm)].map(match => Number(match[1]));
  if (ids.length !== 1) throw Error('One owned application tab is required for diagnostics.');
  const completeConsoleText = async (name, args) => {
    // CLI calls can leave the bridge's HTTP keep-alive socket idle between
    // phases. A fresh HTTP request avoids reusing a socket the bridge closed;
    // it does not reconnect the bridge's persistent browser/CDP session.
    const response = await fetch('http://127.0.0.1:9478/call', {method: 'POST', headers: {'Content-Type': 'application/json', Connection: 'close'}, body: JSON.stringify({name, args: {...args, pageId: ids[0]}}), signal: AbortSignal.timeout(10000)});
    const data = await response.json();
    if (!response.ok || typeof data.result !== 'string' || data.result.length > 1000000) throw Error('Complete owned console diagnostics unavailable.');
    return data.result;
  };
  let page = 0, messageCount = 0, expanded = 0;
  do {
    const listing = await completeConsoleText('list_console_messages', {pageSize: 5, pageIdx: page});
    const options = {forbiddenValues, page, pageSize: 5};
    const {messageCount: count, detailIds, nextPage} = inspectConsoleDiagnostics(listing, options);
    // Keep the same CDP session so collecting diagnostics cannot reset Offline.
    const details = await Promise.all(detailIds.map(id => completeConsoleText('get_console_message', {msgid: Number(id)})));
    inspectConsoleDiagnostics(listing, {...options, details});
    messageCount += count; expanded += details.length; page = nextPage;
  } while (page !== null);
  console.log(JSON.stringify({phase, diagnosticMessages: messageCount, expandedDiagnostics: expanded, privateMarkers: 0, unhandledFlutterErrors: 0}));
}
for (const mode of ['--setup', '--save-offline', '--reload-offline', '--reconnect', '--receipt-check', '--owner-switch', '--visual-check']) {
  execFileSync(process.execPath, [tool, mode], {stdio: 'inherit', env: {...process.env, TALLY_FLUTTER_WEB_URL: 'http://localhost:7364/', METADATA_SERVER_DETECTION: 'none'}});
  await auditConsole(mode);
}
console.log('Verified offline save/full reload, one canonical payment, dependent creation, receipt isolation, owner isolation and reported console privacy.');
