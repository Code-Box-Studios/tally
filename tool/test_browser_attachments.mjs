import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chooseLocalFile} from './support/browser_file_chooser.mjs';

const origin = process.env.TALLY_FLUTTER_WEB_URL ?? 'http://localhost:7358/';
if (new URL(origin).hostname !== 'localhost' || new URL(origin).protocol !== 'http:' ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199') throw Error('Local demo app and emulators required.');
function browser(script) {
  const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', 'run'], {input: script, encoding: 'utf8', env: process.env});
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
initializeApp({projectId: 'demo-tally', storageBucket: 'demo-tally.appspot.com'});
const db = getFirestore();
const {runReadyJob} = require('./lib/src/jobs/dispatch.js');
const mode = process.argv[2];
if (mode === '--setup' || mode === '--setup-resume' || mode === '--new-fixture') {
  const setupScript=`
await page.eval(async()=>{
 if(location.origin!==${JSON.stringify(new URL(origin).origin)})throw Error('Demo page required');
 document.querySelector('[aria-label="Enable accessibility"]')?.click();
 for(let i=0;i<100&&!document.body.innerText.includes('Running in emulator mode.');i++)await new Promise(r=>setTimeout(r,200));
 if(!document.body.innerText.includes('Running in emulator mode.'))throw Error('Visible demo environment proof required');
 const label=e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/\\s+/g,' ').trim();
 window.__qaAction=text=>[...document.querySelectorAll('[role="button"],[role="menuitem"],[role="tab"],button')].find(e=>label(e)===text||label(e).startsWith(text+' Tab '));
 window.__qaClick=text=>{const e=window.__qaAction(text);if(!e)throw Error('Missing action: '+text);e.click();};
 window.__qaText=()=>[...document.querySelectorAll('[aria-label],flt-semantics')].map(label).join(' ');
 window.__qaWait=async text=>{for(let i=0;i<100;i++){if(window.__qaText().includes(text))return;await new Promise(r=>setTimeout(r,200));}throw Error('Missing content: '+text);};
 window.__qaFill=async(text,value)=>{
  const find=()=>[...document.querySelectorAll('input,textarea')].find(e=>(e.getAttribute('aria-label')||'').startsWith(text));
  let e=find();if(!e)throw Error('Missing field: '+text);e.focus();await new Promise(r=>setTimeout(r,250));
  if(!e.isConnected)e=find();e.value=value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));await new Promise(r=>setTimeout(r,150));e.blur();
 };
 window.__qaUnhandled=[];window.addEventListener('unhandledrejection',e=>window.__qaUnhandled.push(String(e.reason)));
 window.__qaAccount={email:'qa-files-'+crypto.randomUUID()+'@example.test',password:crypto.randomUUID().replaceAll('-','')+'7'};
});
await page.eval(()=>window.__qaWait('New to Tally? Create an account'));
await page.eval(()=>window.__qaClick('New to Tally? Create an account'));
await page.wait(200);
await page.click('input[aria-label="Email"]');await page.wait(300);
await page.eval(()=>window.__qaFill('Email',window.__qaAccount.email));
await page.click('input[aria-label="Password"]');await page.wait(300);
await page.type(await page.eval(()=>window.__qaAccount.password));
await page.eval(()=>window.__qaClick('Create account'));
await page.eval(()=>window.__qaWait('Start using Tally'));
await page.click('input[aria-label="Timezone"]');await page.wait(300);
await page.eval(()=>window.__qaFill('Timezone','Asia/Manila'));
await page.eval(()=>window.__qaClick('Start using Tally'));
await page.eval(()=>window.__qaWait('Home'));
const owner=await page.eval(async()=>{
 const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-tally',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.__qaAccount,returnSecureToken:true})});
 const user=await response.json();if(!response.ok)throw Error('Synthetic sign-in failed');window.__qaUser=user;
 window.__qaCall=async(name,payload)=>{
  const response=await fetch('http://127.0.0.1:5001/demo-tally/asia-southeast1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.idToken},body:JSON.stringify({data:{commandId:crypto.randomUUID(),expectedOwnerUid:user.localId,payload}})});
  const data=await response.json();if(data.error)throw Error(name+': '+data.error.message);return data.result;
 };
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 window.__qaLoan=await window.__qaCall('createObligation',{title:'Receipt verification',description:'Synthetic private file QA',notes:'',currency:'PHP',amountMinor:100000,originationDate:day,dueDate:day,contactId:null,categoryId:'default-personal-loan',paymentSourceId:null,interestInfo:null,direction:'owedByMe'});
 location.hash='/obligations/'+window.__qaLoan.obligationId;
 return {uid:user.localId,obligationId:window.__qaLoan.obligationId};
});
await page.eval(()=>window.__qaWait('Record payment'));
console.log(JSON.stringify(owner));
`;
  console.log(browser(mode==='--setup' ? setupScript : setupScript.slice(setupScript.indexOf('const owner=await page.eval('))));
} else if (mode === '--foreign-check') {
  console.log(browser(`
const result=await page.eval(async()=>{
 if(!window.__qaOriginal||window.__qaOriginal.uid===window.__qaUser.localId)throw Error('Actual second owner required');
 const response=await fetch('http://127.0.0.1:5001/demo-tally/asia-southeast1/reserveAttachment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+window.__qaUser.idToken},body:JSON.stringify({data:{commandId:crypto.randomUUID(),expectedOwnerUid:window.__qaUser.localId,payload:{targetType:'obligation',targetId:window.__qaOriginal.obligationId,filename:'receipt.pdf',contentType:'application/pdf',sizeBytes:3,sha256:null}}})});
 const data=await response.json();if(!(['NOT_FOUND','PERMISSION_DENIED'].includes(data.error?.status)||data.error?.status==='FAILED_PRECONDITION'&&data.error.message==='A linked record is unavailable.'))throw Error('Original target was not owner-denied');
 location.hash='/obligations/'+window.__qaOriginal.obligationId;
 return {secondOwner:true,foreignTargetDenied:true};
});
await page.eval(()=>window.__qaWait('this record is unavailable'));
if(await page.eval(()=>window.__qaText().includes('receipt.png')))throw Error('Original private file visible');
await page.eval(()=>{location.hash='/obligations/'+window.__qaLoan.obligationId;});
await page.eval(()=>window.__qaWait('Record payment'));
console.log(JSON.stringify({...result,foreignWorkspaceDenied:true,unhandled:await page.eval(()=>window.__qaUnhandled.length)}));
`));
} else if (mode === '--upload') {
  const localFile = process.argv[3];
  if (!localFile) throw Error('A genuine local receipt path is required.');
  const bytes = readFileSync(localFile);
  if(bytes.length<1||bytes.length>10485760)throw Error('A bounded receipt fixture is required.');
  const owner = JSON.parse(browser('console.log(JSON.stringify(await page.eval(()=>({uid:window.__qaUser.localId,obligationId:window.__qaLoan.obligationId}))));'));
  const payments = await db.collection(`users/${owner.uid}/payments`).where('obligationId','==',owner.obligationId).get();
  if (payments.size > 1 || payments.size === 1 && payments.docs[0].data().amountMinor !== 30000) throw Error('Use a new fixture; existing payment history must be preserved.');
  console.log(browser(`
if(${payments.empty}) {
 await page.eval(()=>window.__qaClick('Record payment'));
 await page.wait(200);
 await page.eval(()=>window.__qaFill('Amount','300'));
 await page.eval(()=>window.__qaClick('Record payment'));
}
await page.eval(()=>window.__qaWait('Receipts'));
if(!await page.eval(()=>window.__qaText().includes('₱700 PHP')))throw Error('Canonical remaining balance missing');
if(!await page.eval(()=>!!window.__qaAction('Add file')))await page.eval(()=>window.__qaClick('Receipts'));
await page.eval(()=>window.__qaWait('Add file'));
await page.eval(()=>{
 window.__qaNetwork=[];
 const fetchBefore=window.fetch;window.fetch=function(input,...rest){window.__qaNetwork.push(String(input?.url||input));return fetchBefore.call(this,input,...rest);};
 const openBefore=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...rest){window.__qaNetwork.push(String(url));return openBefore.call(this,method,url,...rest);};
});
`));
  await chooseLocalFile(browser,localFile,origin);
  console.log(browser("await page.eval(()=>window.__qaWait('Checking file'));console.log(JSON.stringify({uploaded:true,unhandled:await page.eval(()=>window.__qaUnhandled.length)}));"));
} else if (mode === '--finalize') {
  const owner = JSON.parse(browser(`console.log(JSON.stringify(await page.eval(()=>({uid:window.__qaUser.localId,obligationId:window.__qaLoan.obligationId}))));`));
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(owner.uid)) throw Error('Invalid synthetic owner.');
  let processed=0;
  for(let round=0;round<8;round++) {
    const jobs=await db.collection('systemJobs').where('userId','==',owner.uid).get(); let count=0;
    for(const doc of jobs.docs) if(doc.data().status==='pending' && doc.data().nextRunAt.toMillis()<=Date.now() && await runReadyJob(doc.id,db)) count++;
    processed+=count;if(!count)break;
  }
  const files=await db.collection(`users/${owner.uid}/attachments`).where('obligationId','==',owner.obligationId).get();
  if(files.size!==1||files.docs[0].data().state!=='ready')throw Error('Actual worker did not publish one file.');
  const payment=await db.collection(`users/${owner.uid}/payments`).where('obligationId','==',owner.obligationId).get();
  if(payment.size!==1||payment.docs[0].data().amountMinor!==30000)throw Error('Receipt altered canonical payment.');
  const parent=(await db.doc(`users/${owner.uid}/obligations/${owner.obligationId}`).get()).data();
  if(parent.remainingMinor!==70000)throw Error('Receipt altered balance.');
  const file=files.docs[0].data();
  const {getStorage}=require('firebase-admin/storage');
  const [metadata]=await getStorage().bucket().file(file.storagePath).getMetadata();
  if(metadata.metadata?.firebaseStorageDownloadTokens)throw Error('Ready file has a managed bearer token.');
  const unauthorized=await fetch('http://127.0.0.1:9199/v0/b/demo-tally.appspot.com/o/'+encodeURIComponent(file.storagePath)+'?alt=media&token=forged-demo-token');
  if(unauthorized.status!==403)throw Error('Unauthenticated bearer-style request was not denied.');
  browser(`await page.eval(()=>{window.__qaExpectedSHA=${JSON.stringify(file.sha256)};window.__qaAttachmentId=${JSON.stringify(files.docs[0].id)};});`);
  console.log(JSON.stringify({...owner,attachmentId:files.docs[0].id,processed,paymentUnchanged:true,tokenAbsent:true,unauthorizedDenied:true}));
} else if (mode === '--verify') {
  const result=JSON.parse(browser(`
await page.eval(()=>window.__qaWait('Ready'));
await page.eval(()=>{
 const createBefore=URL.createObjectURL;window.__qaExportBlob=null;
 URL.createObjectURL=function(blob){const url=createBefore.call(this,blob);window.__qaExportBlob=blob;window.__qaExportURL=url;return url;};
});
await page.eval(()=>window.__qaClick('Open file'));
await page.eval(()=>window.__qaWait('Save or share'));
const preview=await page.eval(()=>({privateImage:window.__qaText().includes('receipt.png'),noBearer:!window.__qaNetwork.some(url=>/[?&]token=/.test(url)),protectedRead:window.__qaNetwork.some(url=>new RegExp('/downloadAttachment(?:[?#]|$)').test(url))}));
if(!preview.privateImage||!preview.noBearer||!preview.protectedRead)throw Error('Private preview failed');
await page.eval(()=>window.__qaClick('Save or share'));
await page.wait(1200);
const exported=await page.eval(async()=>{
 const bytes=await window.__qaExportBlob.arrayBuffer();
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 window.__qaExportBlob=null;
 if(digest!==window.__qaExpectedSHA)throw Error('Exported bytes differ from verified receipt');
 try {await fetch(window.__qaExportURL);throw Error('Local URL was not revoked');} catch(error) {if(error.message==='Local URL was not revoked')throw error;}
 return true;
});
console.log(JSON.stringify({...preview,explicitExport:exported,uid:await page.eval(()=>window.__qaUser.localId),attachmentId:await page.eval(()=>window.__qaAttachmentId),unhandled:await page.eval(()=>window.__qaUnhandled.length)}));
`));
  const file=await db.doc(`users/${result.uid}/attachments/${result.attachmentId}`).get();
  const {getStorage}=require('firebase-admin/storage');
  const [metadata]=await getStorage().bucket().file(file.data().storagePath).getMetadata();
  if(metadata.metadata?.firebaseStorageDownloadTokens)throw Error('Preview/export generated a managed token.');
  const removed=JSON.parse(browser(`
await page.eval(()=>window.__qaClick('Close'));
await page.eval(()=>window.__qaClick('Remove'));
await page.eval(()=>window.__qaWait('Remove file?'));
await page.eval(()=>window.__qaClick('Remove file'));
await page.eval(()=>window.__qaWait('Attachment removed'));
await page.eval(()=>{location.hash='/activity';});
await page.eval(()=>window.__qaWait('File removed'));
for(const label of ['File added','File ready']) {const text=await page.eval(()=>window.__qaText());if(!text.includes(label))throw Error('Missing file activity: '+label);}
console.log(JSON.stringify({tombstone:true,unhandled:await page.eval(()=>window.__qaUnhandled.length)}));
`));
  console.log(JSON.stringify({...result,...removed,tokenAbsentAfterExport:true}));
} else if (mode === '--screenshots') {
  const out='docs/quality/screenshots/attachments';mkdirSync(out,{recursive:true});
  const evidence=[];
  for(const [name,width,height,dark] of [['desktop-light',1440,1100,false],['desktop-dark',1440,1100,true],['mobile-light',375,812,false],['mobile-dark',375,812,true]]) {
    for(const args of [['emulate','--viewport',`${width}x${height}x1`,'--color-scheme',dark?'dark':'light'],['screenshot',`${out}/${name}.png`]]) {
      const result=spawnSync('npx',['-y','chrome-devtools-axi',...args],{encoding:'utf8',env:process.env});
      if(result.status!==0)throw Error(result.stderr||result.stdout);
      if(args[0]==='emulate') {
        browser('await page.wait(500);');
        const scroll=spawnSync('npx',['-y','chrome-devtools-axi','scroll',width<600?'bottom':'top'],{encoding:'utf8',env:process.env});
        if(scroll.status!==0)throw Error(scroll.stderr||scroll.stdout);
        browser('await page.wait(300);');
        if(width<600)browser("await page.eval(()=>window.__qaClick('Open file'));await page.eval(()=>window.__qaWait('Save or share'));");
      }
    }
    if(width<600)browser("await page.eval(()=>window.__qaClick('Close'));await page.wait(200);");
    const bytes=readFileSync(`${out}/${name}.png`);
    evidence.push({name,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  if(new Set(evidence.map(x=>x.sha256)).size!==4)throw Error('Screenshots must reflect four distinct actual layouts.');
  writeFileSync(`${out}/manifest.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
} else throw Error('Use --setup, --new-fixture, --foreign-check, --upload <path>, --finalize, --verify or --screenshots.');
