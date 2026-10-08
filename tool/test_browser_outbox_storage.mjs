import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// Only the compiled isolated probe and public SQLite assets are served.
if (process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL !== 'http://127.0.0.1:36931') throw Error('Use the owned localhost QA browser.');
const origin = 'http://localhost:7362';
const environment = `qa-${randomUUID()}`;
const files = new Map([
  ['/probe.js', ['build/outbox-storage-probe.js', 'application/javascript']],
  ['/drift_worker.js', ['web/drift_worker.js', 'application/javascript']],
  ['/sqlite3.wasm', ['web/sqlite3.wasm', 'application/wasm']],
]);
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store'});
    response.end('<!doctype html><html><title>Tally isolated storage probe</title><body><script src="probe.js"></script></body></html>');
  } else if (files.has(request.url)) {
    const [file, mime] = files.get(request.url);
    response.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'no-store'});
    response.end(readFileSync(resolve(file)));
  } else { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(7362, '127.0.0.1', resolve); });
const script = `
await page.open(${JSON.stringify(origin)});
for(let i=0;i<50;i++) { if(await page.eval(()=>typeof window.tallyOutboxProbe==='function')) break; await page.wait(100); }
const environment=${JSON.stringify(environment)};
const call = (name, args={})=> page.eval('async () => JSON.parse(await window.tallyOutboxProbe('+JSON.stringify(name)+','+JSON.stringify(JSON.stringify(args))+'))');
const opened=await call('open',{environment});
if(!opened.durable) throw Error('Actual browser lacks safe storage: '+opened.mode);
const saved=await call('enqueue');
if(saved.sequence!==1||saved.payload!=='{"amountMinor":2500,"currency":"PHP"}')throw Error('Wrong persisted command');
await call('close');
await page.open(${JSON.stringify(origin)});
for(let i=0;i<50;i++) { if(await page.eval(()=>typeof window.tallyOutboxProbe==='function')) break; await page.wait(100); }
await call('open',{environment});
const restored=await call('read');
if(restored.sequence!==1||restored.payload!==saved.payload||restored.state!=='queued')throw Error('Reload lost the command');
const winner=await call('claim',{token:'first-tab'});
if(!winner.acquired)throw Error('First tab could not claim');
await page.eval('() => {window.__secondTab=window.open('+JSON.stringify(${JSON.stringify(origin)})+');}');
for(let i=0;i<50;i++) { if(await page.eval(()=>typeof window.__secondTab?.tallyOutboxProbe==='function')) break; await page.wait(100); }
const second = (name,args={})=>page.eval('async () => JSON.parse(await window.__secondTab.tallyOutboxProbe('+JSON.stringify(name)+','+JSON.stringify(JSON.stringify(args))+'))');
await second('open',{environment});
const blocked=await second('claim',{token:'second-tab'});
if(blocked.acquired)throw Error('Two actual tabs acquired the same lease');
await call('release');
const next=await second('claim',{token:'second-tab'});
if(!next.acquired||next.generation<=winner.generation)throw Error('Released lease was not fenced');
const secondRead=await second('read');
if(secondRead.payload!==saved.payload||secondRead.sequence!==1)throw Error('Tab changed immutable payload');
await second('release'); await second('close'); await call('close');
await page.eval(()=>window.__secondTab.close());
console.log(JSON.stringify({mode:opened.mode,reloadDurable:true,multiTabFenced:true,payloadUnchanged:true}));
`;
try {
  // spawnSync would block this process's HTTP server, so keep the CLI asynchronous.
  const {spawn} = await import('node:child_process');
  const env = {...process.env, CHROME_DEVTOOLS_AXI_SESSION: 'tally-outbox-storage'};
  const command = args => new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', 'chrome-devtools-axi', ...args], {env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '', errors = '';
    child.stdout.on('data', chunk => {output += chunk;});
    child.stderr.on('data', chunk => {errors += chunk;});
    child.once('error', reject);
    child.once('close', status => resolve({status, output, errors}));
  });
  const ownedTabs = output => [...output.matchAll(/^\s*(\d+),http:\/\/localhost:7362\/[^,]*,/gm)].map(match => Number(match[1]));
  let listed = await command(['pages']);
  if (listed.status !== 0) throw Error('Cannot list the owned probe tabs.');
  if (!ownedTabs(listed.output).length) {
    const opened = await command(['newpage', origin]);
    // The bridge may create the requested tab while reporting lost selection.
    // Resolve it from the owned origin and select explicitly before page.run.
    if (opened.status !== 0 && !`${opened.output}${opened.errors}`.includes('No page is currently selected')) throw Error('Cannot create the owned probe tab.');
    listed = await command(['pages']);
    if (listed.status !== 0) throw Error('Cannot list the new owned probe tab.');
  }
  const ids = ownedTabs(listed.output);
  if (!ids.length || (await command(['selectpage', String(Math.max(...ids))])).status !== 0) throw Error('Cannot select the owned probe tab.');
  const child = spawn('npx', ['-y', 'chrome-devtools-axi', 'run'], {env: {...process.env, CHROME_DEVTOOLS_AXI_SESSION: 'tally-outbox-storage'}, stdio: ['pipe', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => {output += chunk;});
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); child.stdin.end(script);
  const status = await new Promise((resolve, reject)=>{child.once('error',reject);child.once('close',resolve);});
  if (status !== 0) throw Error(`Storage probe browser command failed with exit ${status}.`);
  if (!output.includes('"reloadDurable":true') || !output.includes('"multiTabFenced":true')) throw Error('Storage probe returned no verified browser evidence.');
} finally { await new Promise(resolve=>server.close(resolve)); }
