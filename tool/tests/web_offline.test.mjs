import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {prepareWebOffline} from '../prepare_web_offline.mjs';

const version = 'a'.repeat(64), scope = 'http://localhost:7364/';
function worker() {
  const handlers = new Map(), entries = new Map([[scope+'index.html',new Response('public shell')]]);
  const cache = {match:async key=>entries.get(key),addAll:async keys=>{for(const key of keys)entries.set(key,new Response('public asset'));}};
  const deleted = [], keys = ['unrelated-cache','tally-public-shell-%2Fstaging%2F-old','tally-public-shell-%2F-old','tally-public-shell-%2F-'+version];
  const self = {registration:{scope},clients:{claim:async()=>{}},__TALLY_SHELL_MANIFEST:{version,assets:['index.html','main.dart.js'],sdk:['https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js']},addEventListener:(name,handler)=>handlers.set(name,handler)};
  runInNewContext(readFileSync('web/tally-shell-sw.js','utf8'), {self,URL,Set,Error,importScripts:()=>{},caches:{open:async()=>cache,keys:async()=>keys,delete:async key=>{deleted.push(key);return true;}},fetch:async()=>{throw Error('Offline');}});
  function fetch(url,{method='GET',mode='cors'}={}) {let response;handlers.get('fetch')({request:{url,method,mode},respondWith:value=>{response=value;}});return response;}
  return {handlers,fetch,entries,deleted};
}
test('compiled manifest is deterministic and changes with app assets',()=>{
  const dir=mkdtempSync(join(tmpdir(),'tally-shell-'));
  try {
    for(const file of ['main.dart.js','flutter_bootstrap.js','tally-shell-sw.js','drift_worker.js','sqlite3.wasm','firebase-messaging-sw.js'])writeFileSync(join(dir,file),'public asset');
    writeFileSync(join(dir,'index.html'),'<html><head></head><body></body></html>');
    const first=prepareWebOffline(dir),second=prepareWebOffline(dir);
    assert.equal(first.version,second.version);assert(!first.assets.includes('firebase-messaging-sw.js'));
    writeFileSync(join(dir,'main.dart.js'),'new app');assert.notEqual(prepareWebOffline(dir).version,first.version);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('worker never intercepts financial, auth, attachment or POST requests',()=>{
  const {fetch}=worker();
  for(const url of [scope+'users/alice/payments',scope+'receipt.pdf','https://firestore.googleapis.com/v1/users/alice','https://identitytoolkit.googleapis.com/v1/accounts:lookup','https://firebasestorage.googleapis.com/v0/b/private/o/receipt','https://www.gstatic.com/firebasejs/12.20.0/firebase-auth.js'])assert.equal(fetch(url),undefined);
  assert.equal(fetch(scope+'main.dart.js',{method:'POST'}),undefined);
});
test('offline navigation returns only the public app shell',async()=>{
  const {fetch}=worker();const response=await fetch(scope+'obligations/private-id',{mode:'navigate'});
  assert.equal(await response.text(),'public shell');
});
test('worker activation removes only obsolete caches for its own scope',async()=>{
  const {handlers,deleted}=worker();let work;
  handlers.get('activate')({waitUntil:value=>{work=value;}});await work;
  assert.deepEqual(deleted,['tally-public-shell-%2F-old']);
});
