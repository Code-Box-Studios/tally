import {createServer} from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

if (process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL !== 'http://127.0.0.1:36931') throw Error('Use the owned localhost QA browser.');
const origin = 'http://localhost:7363';
const environment = `deletion-qa-${randomUUID()}`;
const opfs = process.env.TALLY_DELETION_STORAGE === 'opfs';
if (process.env.TALLY_DELETION_STORAGE && !['opfs','indexedDb'].includes(process.env.TALLY_DELETION_STORAGE)) throw Error('Choose opfs or indexedDb.');
const root = resolve('build/deletion-storage-probe');
const mime = {'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.ttf':'font/ttf'};
const server = createServer((request,response) => {
  const path = new URL(request.url,origin).pathname;
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(`${root}/`) || !existsSync(file)) {response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store',...(opfs?{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}:{})});
  response.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(7363,'127.0.0.1',resolve);});
const env = {...process.env,CHROME_DEVTOOLS_AXI_SESSION:'tally-deletion-storage'};
const command = (args, input) => new Promise((resolve,reject)=>{
  const child=spawn('npx',['-y','chrome-devtools-axi',...args],{env,stdio:['pipe','pipe','pipe']});
  let output='',errors='';
  child.stdout.on('data',chunk=>{output+=chunk;});
  child.stderr.on('data',chunk=>{errors+=chunk;});
  child.once('error',reject);child.once('close',status=>resolve({status,output,errors}));
  child.stdin.end(input??'');
});
const script = `
await page.open(${JSON.stringify(origin)});
const ready = async (second=false) => {
  for(let i=0;i<150;i++) {
    if(await page.eval(second?()=>typeof window.__deletionTab?.tallyDeletionProbe==='function':()=>typeof window.tallyDeletionProbe==='function'))return;
    await page.wait(100);
  }
  throw Error('Deletion probe did not start.');
};
await ready();
const environment=${JSON.stringify(environment)};
const call=(name,owner='alice',extra={},second=false)=>{
  const args={owner:'deletion-qa-'+owner,environment,...extra};
  const host=second?'window.__deletionTab':'window';
  return page.eval('async () => JSON.parse(await '+host+'.tallyDeletionProbe('+JSON.stringify(name)+','+JSON.stringify(JSON.stringify(args))+'))');
};
const assert=(value,message)=>{if(!value)throw Error(message);};
const opened=await call('open','alice',{hold:true});
assert(${JSON.stringify(opfs)} ? ['opfsShared','opfsLocks'].includes(opened.mode) : opened.mode==='sharedIndexedDb','Unexpected storage implementation: '+opened.mode);
await call('open','bob');
await call('open','alice',{environment:environment+'-staging'});
await call('mark','alice',{phase:'accepted'});
await page.eval('() => {window.__cleanupDone=false;window.__cleanupResult=null;window.tallyDeletionProbe("purge",'+JSON.stringify(JSON.stringify({owner:'deletion-qa-alice',environment}))+').then(value=>{window.__cleanupDone=true;window.__cleanupResult=JSON.parse(value);});}');
await page.wait(100);
assert(!(await page.eval(()=>window.__cleanupDone)),'Cleanup ignored an owned handle.');
assert((await call('inspect')).databases===2,'Cleanup erased before close.');
await call('release');
for(let i=0;i<150 && !(await page.eval(()=>window.__cleanupDone));i++)await page.wait(100);
assert((await page.eval(()=>window.__cleanupResult))?.ok===true,'Accepted cleanup did not finish.');
const gone=await call('inspect');
assert(gone.databases===0&&!gone.profile&&!gone.trusted&&gone.phase===null,'Alice namespace survived.');
assert(!(await call('canReopen')).allowed,'Completed owner reopened local storage.');
const bob=await call('inspect','bob'), staging=await call('inspect','alice',{environment:environment+'-staging'});
assert(bob.databases===2&&bob.profile&&bob.trusted,'Bob namespace changed.');
assert(staging.databases===2&&staging.profile&&staging.trusted,'Staging namespace changed.');
await call('open','uncertain');await call('mark','uncertain',{phase:'uncertain'});
assert(!(await call('purge','uncertain')).ok,'Uncertain deletion erased storage.');
const uncertain=await call('inspect','uncertain');
assert(uncertain.databases===2&&uncertain.profile&&uncertain.phase==='uncertain','Uncertain storage changed.');
for(const kind of ['future','foreign']) {
  await call('open',kind);await call('close',kind);await call('corrupt',kind,{kind});
  await call('mark',kind,{phase:'accepted'});
  assert(!(await call('purge',kind)).ok,kind+' database was erased.');
  const remaining=await call('inspect',kind);
  assert(remaining.databases===2&&remaining.profile&&remaining.phase==='cleanupRequired',kind+' preflight was not atomic.');
}
await call('open','blocked');await call('close','blocked');
await page.eval('() => {window.__deletionTab=window.open('+JSON.stringify(${JSON.stringify(origin)})+');}');
await ready(true);
await call('open','blocked',{},true);
await call('mark','blocked',{phase:'accepted'});
assert(!(await call('lateWrite','blocked',{},true)).allowed,'Accepted owner wrote from another tab.');
assert(!(await call('purge','blocked')).ok,'Open second tab falsely reported erasure.');
const blocked=await call('inspect','blocked');
assert(blocked.databases>0&&blocked.phase==='cleanupRequired','Blocked tab lost its retry marker.');
await call('close','blocked',{},true);
assert((await call('purge','blocked')).ok,'Retry after second tab close failed.');
assert((await call('inspect','blocked')).databases===0,'Retry left private databases.');
assert(!(await call('canReopen','blocked',{},true)).allowed,'Another tab reopened completed owner storage.');
await page.eval(()=>window.__deletionTab.close());
for(const owner of ['bob','uncertain'])await call('close',owner);
await call('close','alice',{environment:environment+'-staging'});
console.log(JSON.stringify({mode:opened.mode,ownedHandlesAwaited:true,exactOwnerErased:true,bobPreserved:true,stagingPreserved:true,uncertainPreserved:true,futureAndForeignPreserved:true,blockedSecondTabRetried:true,lateWriteBlocked:true,completedOwnerCannotReopen:true,contracts:10}));
`;
try {
  let listed=await command(['pages']);
  if(listed.status!==0)throw Error('Cannot list owned probe tabs.');
  const ids=output=>[...output.matchAll(/^\s*(\d+),http:\/\/localhost:7363\/[^,]*,/gm)].map(match=>Number(match[1]));
  if(!ids(listed.output).length) {
    const opened=await command(['newpage',origin]);
    if(opened.status!==0&&!`${opened.output}${opened.errors}`.includes('No page is currently selected'))throw Error('Cannot create probe tab.');
    listed=await command(['pages']);
  }
  const owned=ids(listed.output);
  if(!owned.length||(await command(['selectpage',String(Math.max(...owned))])).status!==0)throw Error('Cannot select owned probe tab.');
  const result=await command(['run'],script);
  process.stdout.write(result.output);process.stderr.write(result.errors);
  if(result.status!==0)throw Error('Deletion storage browser contracts failed.');
  if(!result.output.includes('"blockedSecondTabRetried":true')||!result.output.includes('"contracts":10'))throw Error('No verified deletion storage evidence.');
} finally {await new Promise(resolve=>server.close(resolve));}
