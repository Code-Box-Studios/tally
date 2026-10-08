import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';

const origin = process.env.TALLY_FLUTTER_WEB_URL ?? 'http://localhost:7364/';
if (new URL(origin).origin !== 'http://localhost:7364' || process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL !== 'http://127.0.0.1:36931' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Owned browser, compiled localhost app and demo emulators required.');
const fixturePath = '.superpowers/sdd/2026-10-07-tally-offline-sync/task-4-browser-fixture.json';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
initializeApp({projectId: 'demo-tally'});
const db = getFirestore();
const env = {...process.env, CHROME_DEVTOOLS_AXI_SESSION: 'tally-offline-sync', CHROME_DEVTOOLS_AXI_PORT: '9478'};
function browser(script) {
  const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', 'run'], {input: script, encoding: 'utf8', env});
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
function openOwnedPage() {
  const opened=spawnSync('npx',['-y','chrome-devtools-axi','newpage',origin],{encoding:'utf8',env});
  if(opened.status!==0&&!String(opened.stderr||opened.stdout).includes('No page is currently selected'))throw Error(opened.stderr||opened.stdout);
  // The bridge can create a tab but lose its selection after the prior selected
  // client closes. Select only the newly owned compiled-QA origin explicitly.
  const listed=spawnSync('npx',['-y','chrome-devtools-axi','pages'],{encoding:'utf8',env});
  if(listed.status!==0)throw Error(listed.stderr||listed.stdout);
  const ids=[...listed.stdout.matchAll(/^\s*(\d+),http:\/\/localhost:7364\/[^,]*,/gm)].map(match=>Number(match[1]));
  if(!ids.length)throw Error('No owned compiled-QA tab was created.');
  const selected=spawnSync('npx',['-y','chrome-devtools-axi','selectpage',String(Math.max(...ids))],{encoding:'utf8',env});
  if(selected.status!==0)throw Error(selected.stderr||selected.stdout);
}
const helpers = `
await page.eval(() => {
 document.querySelector('[aria-label="Enable accessibility"]')?.click();
 const label=e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/\\s+/g,' ').trim();
 window.__qaAction=text=>[...document.querySelectorAll('[role="button"],[role="menuitem"],[role="tab"],[role="switch"],[role="checkbox"],button')].find(e=>label(e)===text||label(e).startsWith(text+' Tab '));
 window.__qaText=()=>[...document.querySelectorAll('[aria-label],flt-semantics')].map(label).join(' ');
 window.__qaWait=async text=>{for(let i=0;i<150;i++){document.querySelector('[aria-label="Enable accessibility"]')?.click();if(window.__qaText().includes(text))return;await new Promise(r=>setTimeout(r,200));}throw Error('Missing content: '+text);};
 window.__qaClick=text=>{const e=window.__qaAction(text);if(!e)throw Error('Missing action: '+text);e.click();};
 window.__qaFill=async(text,value)=>{const find=()=>[...document.querySelectorAll('input,textarea')].find(e=>(e.getAttribute('aria-label')||'').startsWith(text));let e=find();if(!e)throw Error('Missing field: '+text);e.focus();await new Promise(r=>setTimeout(r,250));if(!e.isConnected)e=find();e.value=value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));await new Promise(r=>setTimeout(r,150));e.blur();};
});
`;
async function offline(value) {
  // The CLI bridge keeps its CDP session alive. Closing a temporary CDP socket
  // resets network emulation and cannot prove offline financial behavior.
  const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', 'emulate', ...(value ? ['--network', 'Offline'] : [])], {encoding: 'utf8', env});
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  const blocked = JSON.parse(browser("console.log(JSON.stringify(await page.eval(async()=>{try{await fetch('/tally-offline-network-probe-'+crypto.randomUUID(),{cache:'no-store'});return false;}catch(_){return true;}})));"));
  if (blocked !== value) throw Error('Actual uncached network request does not match the requested connectivity.');
}

const mode = process.argv[2];
if (mode === '--setup') {
  const compiledVersion=readFileSync('build/web-emulator/index.html','utf8').match(/<meta name="tally-shell-version" content="([a-f0-9]{64})"/)?.[1];
  if(!compiledVersion)throw Error('Compiled offline shell version is missing.');
  // Closing owned compiled-QA clients allows a waiting app-shell revision to
  // activate. No user browser tab or other localhost application is closed.
  const listed=spawnSync('npx',['-y','chrome-devtools-axi','pages'],{encoding:'utf8',env});
  if(listed.status!==0)throw Error(listed.stderr||listed.stdout);
  for(const line of listed.stdout.split('\n')) {
    const match=line.match(/^\s*(\d+),(http:\/\/localhost:7364\/[^,]*),/);
    if(match) {const closed=spawnSync('npx',['-y','chrome-devtools-axi','closepage',match[1]],{encoding:'utf8',env});if(closed.status!==0)throw Error(closed.stderr||closed.stdout);}
  }
  openOwnedPage();
  await offline(false);
  for(let attempt=0;attempt<3;attempt++) {
    const status=JSON.parse(browser(`await page.wait(1200);console.log(JSON.stringify(await page.eval(async()=>({expected:document.querySelector('meta[name=\"tally-shell-version\"]')?.content,actual:navigator.serviceWorker.controller?new URL(navigator.serviceWorker.controller.scriptURL).searchParams.get('v'):null,waiting:!!(await navigator.serviceWorker.getRegistration())?.waiting}))));`));
    if(status.expected===compiledVersion&&status.actual===compiledVersion)break;
    if(attempt===2)throw Error('Compiled QA client still uses an older app shell.');
    browser('await page.wait(1500);');
    const tabs=spawnSync('npx',['-y','chrome-devtools-axi','pages'],{encoding:'utf8',env});
    for(const line of tabs.stdout.split('\n')) {const match=line.match(/^\s*(\d+),(http:\/\/localhost:7364\/[^,]*),/);if(match)spawnSync('npx',['-y','chrome-devtools-axi','closepage',match[1]],{encoding:'utf8',env});}
    openOwnedPage();
    await offline(false);
  }
  const fixture = JSON.parse(browser(`
await page.open(${JSON.stringify(origin)}); await page.wait(1200);
${helpers}
await page.eval(async()=>{for(let i=0;i<150;i++){document.querySelector('[aria-label="Enable accessibility"]')?.click();if(window.__qaAction('New to Tally? Create an account')||window.__qaAction('Settings')||window.__qaAction('Sign out'))return;await new Promise(r=>setTimeout(r,200));}throw Error('App did not become ready online');});
if(!await page.eval(()=>Boolean(window.__qaAction('New to Tally? Create an account')))){await page.eval(()=>{location.hash='/settings';});await page.eval(()=>window.__qaWait('Sign out'));await page.eval(()=>window.__qaClick('Sign out'));}
await page.eval(()=>window.__qaWait('New to Tally? Create an account'));
if(!await page.eval(()=>document.body.innerText.includes('Running in emulator mode.')))throw Error('Visible demo environment proof required.');
await page.eval(()=>window.__qaClick('New to Tally? Create an account'));await page.wait(200);
await page.eval(()=>{window.__qaAccount={email:'qa-sync-'+crypto.randomUUID()+'@example.test',password:crypto.randomUUID().replaceAll('-','')+'7'};});
await page.click('input[aria-label="Email"]');await page.wait(300);await page.eval(()=>window.__qaFill('Email',window.__qaAccount.email));
await page.click('input[aria-label="Password"]');await page.wait(300);await page.type(await page.eval(()=>window.__qaAccount.password));
await page.eval(()=>window.__qaClick('Create account'));await page.eval(()=>window.__qaWait('Start using Tally'));
await page.eval(()=>window.__qaClick('Start using Tally'));await page.eval(()=>window.__qaWait('Home'));
const fixture=await page.eval(async()=>{
 const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-tally',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.__qaAccount,returnSecureToken:true})});
 const user=await response.json();if(!response.ok)throw Error('Synthetic sign-in failed');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const result=await fetch('http://127.0.0.1:5001/demo-tally/asia-southeast1/createObligation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.idToken},body:JSON.stringify({data:{commandId:crypto.randomUUID(),expectedOwnerUid:user.localId,payload:{title:'Offline sync verification',description:'Synthetic local QA',notes:'',currency:'PHP',amountMinor:100000,originationDate:day,dueDate:day,contactId:null,categoryId:'default-personal-loan',paymentSourceId:null,interestInfo:null,direction:'owedByMe'}}})});
 const data=await result.json();if(data.error)throw Error('Synthetic loan failed');
 location.hash='/settings/sync';return {uid:user.localId,obligationId:data.result.obligationId};
});
await page.eval(()=>window.__qaWait('Trust this device for offline saving'));
await page.click('[role="switch"]');
await page.eval(()=>window.__qaWait('Offline saving is ready'));
await page.eval('()=>{location.hash="/obligations/'+fixture.obligationId+'";}');
await page.eval(()=>window.__qaWait('Record payment'));
console.log(JSON.stringify(fixture));
`));
  writeFileSync(fixturePath, JSON.stringify(fixture));
  console.log(JSON.stringify({setup:true, ...fixture}));
} else if (mode === '--adopt-setup') {
  const uid = JSON.parse(browser(`console.log(JSON.stringify(await page.eval(async()=>{if(!window.__qaAccount)throw Error('Synthetic setup session missing');const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-tally',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.__qaAccount,returnSecureToken:true})});const user=await response.json();if(!response.ok)throw Error('Synthetic session unavailable');return user.localId;})));`));
  const loans = await db.collection('users/'+uid+'/obligations').where('title','==','Offline sync verification').get();
  if(loans.size!==1)throw Error('Use a fresh synthetic fixture.');
  const fixture={uid,obligationId:loans.docs[0].id}; writeFileSync(fixturePath,JSON.stringify(fixture));
  browser(`${helpers} await page.eval(()=>window.__qaWait('Offline saving is ready')); await page.eval(()=>{location.hash='/obligations/${fixture.obligationId}';}); await page.eval(()=>window.__qaWait('Record payment'));`);
  console.log(JSON.stringify({setup:true,...fixture}));
} else if (mode === '--save-offline') {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  await offline(true);
  browser(`${helpers}
await page.eval(()=>window.__qaClick('Record payment'));await page.wait(200);
await page.eval(()=>window.__qaFill('Amount','300'));
await page.eval(()=>window.__qaClick('Record payment'));
await page.eval(()=>window.__qaWait('Waiting to sync'));
if(await page.eval(()=>window.__qaText().includes('PHP 700.00')))throw Error('Pending payment changed the confirmed balance.');
`);
  const rows = await db.collection('users/'+fixture.uid+'/payments').get();
  if (!rows.empty) throw Error('An offline save mutated canonical payments.');
  console.log(JSON.stringify({offlineSaved:true,canonicalPayments:0}));
} else if (mode === '--reload-offline') {
  await offline(true);
  browser(`await page.eval(()=>{window.__qaColdReloadMarker=true;location.reload();}); await page.wait(2000); ${helpers}
if(await page.eval(()=>Boolean(window.__qaColdReloadMarker)||performance.getEntriesByType('navigation')[0]?.type!=='reload'))throw Error('Offline test did not perform a full document reload');
if(!await page.eval(async()=>{try{await fetch('/tally-offline-network-probe-'+crypto.randomUUID(),{cache:'no-store'});return false;}catch(_){return true;}}))throw Error('Reload allowed an actual uncached network request');
await page.eval(()=>{location.hash='/home';});await page.eval(()=>window.__qaWait('Your money, at a glance.'));
if(await page.eval(()=>/PHP 0\\.00|₱0\\.00/.test(window.__qaText())))throw Error('An uncached offline overview fabricated zero financial totals.');
await page.eval(()=>{location.hash='/settings/sync';});
await page.eval(()=>window.__qaWait('Waiting to sync'));
if(!await page.eval(()=>window.__qaText().includes('PHP')))throw Error('Reload lost the saved payment currency.');
`);
  console.log(JSON.stringify({offlineReloadDurable:true}));
} else if (mode === '--reconnect') {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  await offline(false);
  browser(`${helpers} await page.eval(()=>window.dispatchEvent(new Event('online')));await page.eval(()=>window.__qaWait('No changes waiting on this device'));`);
  let payments, parent;
  for (let i = 0; i < 60; i++) {payments = await db.collection('users/'+fixture.uid+'/payments').get();parent = (await db.doc('users/'+fixture.uid+'/obligations/'+fixture.obligationId).get()).data();if(payments.size === 1 && parent.remainingMinor === 70000)break;await new Promise(r=>setTimeout(r,200));}
  if(payments.size !== 1 || payments.docs[0].data().amountMinor !== 30000 || parent.remainingMinor !== 70000)throw Error('Reconnection did not produce exactly one valid payment and correct balance.');
  console.log(JSON.stringify({oneCanonicalPayment:true,remainingMinor:70000}));
} else if (mode === '--receipt-check') {
  const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
  browser(`${helpers}
await page.eval(()=>{location.hash='/settings/sync';});await page.eval(()=>window.__qaWait('Saved actions'));
await page.eval(()=>window.__qaClick('Waiting to sync'));await page.eval(()=>window.__qaWait('No changes waiting on this device'));
await page.eval(()=>window.__qaClick('History'));await page.eval(()=>window.__qaWait('Confirmed'));
await page.eval(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(e=>{const label=e.getAttribute('aria-label')||e.textContent||'';return label.includes('Payment')&&label.includes('Confirmed');});if(!card)throw Error('Confirmed local payment history is missing');card.click();});
await page.eval(()=>window.__qaWait('Choose receipt'));
`);
  await offline(true);
  browser(`${helpers}
// The automation bridge cancels OS chooser dialogs. Supply a real synthetic
// browser File through the official plugin's input/change boundary, keeping its
// owner checks, hashing, Blob cleanup, SQLite storage and SDK transport real.
await page.eval(()=>{window.__qaOriginalFileClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file'){window.__qaReceiptInput=this;return;}return window.__qaOriginalFileClick.call(this);};window.__qaAction('Choose receipt').id='qa-choose-receipt';});
await page.click('#qa-choose-receipt');
await page.eval(async()=>{try{for(let i=0;i<50&&!window.__qaReceiptInput;i++)await new Promise(r=>setTimeout(r,100));const input=window.__qaReceiptInput;if(!input||!input.isConnected)throw Error('Official file-selector input is missing');const data=new DataTransfer();data.items.add(new File([new Uint8Array([1,2,3])],'offline-receipt-failure.png',{type:'image/png'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));}finally{HTMLInputElement.prototype.click=window.__qaOriginalFileClick;delete window.__qaOriginalFileClick;delete window.__qaReceiptInput;}});
await page.eval(()=>window.__qaWait('Receipt needs review'));
`);
  const payments=await db.collection('users/'+fixture.uid+'/payments').get();
  const parent=(await db.doc('users/'+fixture.uid+'/obligations/'+fixture.obligationId).get()).data();
  const receipts=await db.collection('users/'+fixture.uid+'/attachments').get();
  if(payments.size!==1||parent.remainingMinor!==70000||receipts.size!==0)throw Error('An offline receipt failure changed the payment or published an unconfirmed receipt.');
  browser(`await page.eval(()=>{window.__qaColdReloadMarker=true;location.reload();});await page.wait(2000);${helpers}
if(await page.eval(()=>Boolean(window.__qaColdReloadMarker)||performance.getEntriesByType('navigation')[0]?.type!=='reload'))throw Error('Receipt test did not perform a full document reload');
await page.eval(()=>{location.hash='/settings/sync';});
await page.eval(()=>window.__qaWait('offline-receipt-failure.png'));await page.eval(()=>window.__qaWait('file is unavailable on this device'));
if(await page.eval(()=>window.__qaText().includes('Receipt is published')))throw Error('Browser reload fabricated receipt publication.');
`);
  await offline(false);
  console.log(JSON.stringify({receiptUploadUnconfirmed:true,oneCanonicalPayment:true,remainingMinor:70000,webReloadRequiresReselection:true}));
} else if (mode === '--owner-switch') {
  const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
  browser(`${helpers} await page.eval(()=>{location.hash='/obligations/${fixture.obligationId}';});await page.eval(()=>window.__qaWait('Record payment'));`);
  await offline(true);
  browser(`${helpers}
await page.eval(()=>window.__qaClick('Record payment'));await page.wait(200);await page.eval(()=>window.__qaFill('Amount','100'));await page.eval(()=>window.__qaClick('Record payment'));await page.eval(()=>window.__qaWait('Waiting to sync'));
await page.eval(()=>{location.hash='/settings';});await page.eval(()=>window.__qaWait('Sign out'));await page.eval(()=>window.__qaClick('Sign out'));await page.eval(()=>window.__qaWait('New to Tally? Create an account'));
`);
  const before=await db.collection('users/'+fixture.uid+'/payments').get();if(before.size!==1)throw Error('Offline second payment reached canonical history.');
  await offline(false);
  browser(`${helpers}
await page.eval(()=>window.__qaClick('New to Tally? Create an account'));await page.wait(200);
await page.eval(()=>{window.__qaBob={email:'qa-sync-bob-'+crypto.randomUUID()+'@example.test',password:crypto.randomUUID().replaceAll('-','')+'7'};});
await page.click('input[aria-label=\"Email\"]');await page.wait(300);await page.eval(()=>window.__qaFill('Email',window.__qaBob.email));
await page.click('input[aria-label=\"Password\"]');await page.wait(300);await page.type(await page.eval(()=>window.__qaBob.password));
await page.eval(()=>window.__qaClick('Create account'));await page.eval(()=>window.__qaWait('Start using Tally'));await page.eval(()=>window.__qaClick('Start using Tally'));await page.eval(()=>window.__qaWait('Home'));
await page.eval(()=>{location.hash='/settings/sync';});await page.eval(()=>window.__qaWait('No changes waiting on this device'));
if(await page.eval(()=>window.__qaText().includes('Offline sync verification')||window.__qaText().includes('offline-receipt-failure.png')))throw Error('Previous owner record or receipt visible.');
`);
  await new Promise(r=>setTimeout(r,1200));
  const after=await db.collection('users/'+fixture.uid+'/payments').get();if(after.size!==1)throw Error('Another owner dispatched the previous owner’s pending payment.');
  console.log(JSON.stringify({pendingHiddenForNextOwner:true,previousOwnerNotDispatched:true}));
} else if (mode === '--visual-check') {
  browser(`${helpers} await page.eval(()=>{location.hash='/settings/sync';});await page.eval(()=>window.__qaWait('Trust this device for offline saving'));await page.click('[role="switch"]');await page.eval(()=>window.__qaWait('Offline saving is ready'));await page.eval(()=>{location.hash='/obligations/new';});await page.eval(()=>window.__qaWait('Save obligation'));`);
  const bobUid=JSON.parse(browser(`console.log(JSON.stringify(await page.eval(async()=>{if(!window.__qaBob)throw Error('Synthetic owner session missing');const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-tally',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.__qaBob,returnSecureToken:true})});const user=await response.json();if(!response.ok)throw Error('Synthetic owner unavailable');return user.localId;})));`));
  await offline(true);
  const detailPath = JSON.parse(browser(`${helpers}
await page.eval(()=>window.__qaFill('What is this for?','Pending layout verification'));
await page.eval(()=>window.__qaFill('Original amount','1250'));
await page.eval(()=>window.__qaClick('Save obligation'));await page.eval(()=>window.__qaWait('All saved actions'));
if(!await page.eval(()=>window.__qaText().includes('PHP')))throw Error('Pending detail omitted native currency.');
console.log(JSON.stringify(await page.eval(()=>location.hash)));
`));
  for(const width of [400,800,1440]) {
    for(const theme of ['light','dark']) {
      const emulated=spawnSync('npx',['-y','chrome-devtools-axi','emulate','--viewport',`${width}x1000x1`,'--color-scheme',theme,'--network','Offline'],{encoding:'utf8',env});
      if(emulated.status!==0)throw Error(emulated.stderr||emulated.stdout);
      browser(`${helpers} await page.wait(300);await page.eval(()=>window.__qaWait('All saved actions'));if(await page.eval(()=>document.body.innerText.includes('Bad state:')||document.body.innerText.includes('A RenderFlex overflowed')))throw Error('Layout runtime failure.');`);
      const shot=spawnSync('npx',['-y','chrome-devtools-axi','screenshot',`.superpowers/sdd/2026-10-07-tally-offline-sync/task-4-pending-${width}-${theme}.png`],{encoding:'utf8',env});
      if(shot.status!==0)throw Error(shot.stderr||shot.stdout);
    }
  }
  // Enter activates a real focused Flutter semantics action. No financial
  // action is submitted by this navigation check.
  browser(`${helpers}
await page.eval(()=>{const target=window.__qaAction('All saved actions');target.focus();if(document.activeElement!==target)throw Error('Saved-action navigation is not keyboard focusable');});
await page.press('Enter');await page.eval(()=>window.__qaWait('Saved actions'));
if(!await page.eval(()=>location.hash==='#/settings/sync'))throw Error('Keyboard navigation did not open Sync.');
await page.eval(()=>{location.hash='/home';});await page.eval(()=>window.__qaWait('Your money, at a glance.'));
if(await page.eval(()=>window.__qaText().includes('PHP 1,250.00')))throw Error('Pending obligation entered canonical dashboard totals.');
`);
  browser(`${helpers}
await page.eval(()=>{location.hash=${JSON.stringify(detailPath.replace(/^#/,''))};});await page.eval(()=>window.__qaWait('Record payment'));
await page.eval(()=>window.__qaClick('Record payment'));await page.wait(200);
await page.eval(()=>window.__qaFill('Amount','250'));await page.eval(()=>window.__qaClick('Save payment'));
await page.eval(()=>window.__qaWait('₱250 PHP'));
`);
  const bobRoot=db.doc('users/'+bobUid);
  if(!(await bobRoot.collection('obligations').get()).empty||!(await bobRoot.collection('payments').get()).empty)throw Error('Pending parent or dependent payment mutated confirmed records offline.');
  await offline(false);
  browser(`${helpers}await page.eval(()=>window.dispatchEvent(new Event('online')));await page.eval(()=>{location.hash='/settings/sync';});await page.eval(()=>window.__qaWait('No changes waiting on this device'));`);
  let parents,dependentPayments;
  for(let i=0;i<60;i++) {parents=await bobRoot.collection('obligations').get();dependentPayments=await bobRoot.collection('payments').get();if(parents.size===1&&dependentPayments.size===1)break;await new Promise(r=>setTimeout(r,200));}
  const parent=parents.docs[0]?.data(),dependent=dependentPayments.docs[0]?.data();
  if(parents.size!==1||dependentPayments.size!==1||parent.title!=='Pending layout verification'||parent.originalAmountMinor!==125000||parent.totalPaidMinor!==25000||parent.remainingMinor!==100000||dependent.amountMinor!==25000||dependent.currency!=='PHP'||dependent.obligationId!==parents.docs[0].id)throw Error('Dependent replay did not create exactly one parent/payment with the original amount, currency and balance.');
  console.log(JSON.stringify({pendingDetail:detailPath,widths:[400,800,1440],themes:['light','dark'],keyboardNavigation:true,canonicalTotalsUnchanged:true,oneDependentPayment:true,remainingMinor:100000}));
} else if (mode === '--online') {await offline(false); console.log('Browser restored online.');}
else throw Error('Use --setup, --save-offline, --reload-offline, --reconnect or --online.');
