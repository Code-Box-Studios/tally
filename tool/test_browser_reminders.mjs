import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const applicationUrl = process.env.TALLY_FLUTTER_WEB_URL ?? 'http://localhost:7358/';
const application = new URL(applicationUrl);
if (application.hostname !== 'localhost' || application.protocol !== 'http:' ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw Error('Local demo browser and Firestore emulator required.');
}
function browser(script) {
  const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', 'run'], {
    input: script, encoding: 'utf8', env: process.env,
  });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
const verificationScript = `
await page.eval(()=>{location.hash='/settings/reminders/inbox';});
await page.eval(()=>window.__qaWait('Mark read'));
const result=await page.eval(()=>{
 const text=window.__qaText();
 for(const expected of ['Loan to remember','John’s repayment','Electricity','₱7,000 PHP','USD','Amount needed · PHP','Today'])if(!text.includes(expected))throw Error('Missing inbox content: '+expected);
 return {nativeCurrencies:true,unknownAmount:true,groupedToday:true};
});
await page.eval(()=>window.__qaClick('Mark read'));
await page.eval(async()=>{
 for(let i=0;i<60;i++){
  if(window.__qaText().includes('Read'))return;
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('Read receipt missing');
});
await page.eval(()=>window.__qaClick('View obligation'));
await page.wait(400);
if(!await page.eval(()=>location.hash.includes('?period=')))throw Error('Exact billing period missing');
await page.eval(()=>{location.hash='/settings/reminders/inbox';});
await page.wait(300);
console.log(JSON.stringify({...result,readReceipt:true,exactPeriod:true,unhandled:await page.eval(()=>window.__qaUnhandled.length)}));
`;
if(process.argv.includes('--verify-only')) { console.log(browser(verificationScript)); process.exit(0); }
const opened = spawnSync('npx', ['-y', 'chrome-devtools-axi', 'open', applicationUrl], {
  encoding: 'utf8', env: process.env,
});
if (opened.status !== 0) throw Error(opened.stderr || opened.stdout);
const setup = browser(`
await page.open(${JSON.stringify(applicationUrl)});
await page.wait(1200);
await page.eval(() => {
 if(!document.body.innerText.includes('Running in emulator mode.'))throw Error('Demo application required');
 document.querySelector('[aria-label="Enable accessibility"]')?.click();
 const label=e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/\\s+/g,' ').trim();
 window.__qaAction=text=>[...document.querySelectorAll('[role="button"],[role="menuitem"],[role="tab"],button')].find(e=>label(e)===text||label(e).startsWith(text+' Tab '));
 window.__qaClick=text=>{const e=window.__qaAction(text);if(!e)throw Error('Missing action: '+text);e.click();};
 window.__qaFill=async(text,value)=>{
  const find=()=>[...document.querySelectorAll('input,textarea')].find(e=>(e.getAttribute('aria-label')||'').startsWith(text));
  let e=find();if(!e)throw Error('Missing field: '+text);e.focus();await new Promise(r=>setTimeout(r,250));
  if(!e.isConnected)e=find();e.value=value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  await new Promise(r=>setTimeout(r,150));e.blur();
 };
 window.__qaText=()=>[...document.querySelectorAll('[aria-label],flt-semantics')].map(e=>label(e)).join(' ');
 window.__qaWait=async label=>{for(let i=0;i<60;i++){if(window.__qaAction(label))return;await new Promise(r=>setTimeout(r,200));}throw Error('Missing action: '+label);};
 window.__qaUnhandled=[];window.addEventListener('unhandledrejection',e=>window.__qaUnhandled.push(String(e.reason)));
 window.__qaAccount={email:'qa-reminders-'+crypto.randomUUID()+'@example.test',password:crypto.randomUUID().replaceAll('-','')+'7'};
});
await page.eval(()=>window.__qaWait('New to Tally? Create an account'));
await page.eval(()=>window.__qaClick('New to Tally? Create an account'));
await page.wait(200);
await page.click('input[aria-label="Email"]');
await page.wait(300);
await page.eval(()=>window.__qaFill('Email',window.__qaAccount.email));
await page.click('input[aria-label="Password"]');
await page.wait(300);
await page.type(await page.eval(()=>window.__qaAccount.password));
await page.eval(()=>window.__qaClick('Create account'));
await page.eval(()=>window.__qaWait('Start using Tally'));
await page.click('input[aria-label="Timezone"]');
await page.wait(300);
await page.eval(()=>window.__qaFill('Timezone','Asia/Manila'));
await page.eval(()=>window.__qaClick('Start using Tally'));
await page.eval(()=>window.__qaWait('Settings'));
await page.eval(()=>{location.hash='/settings/reminders';});
await page.eval(()=>window.__qaWait('Save reminders'));
await page.click('input[aria-label="Days before due"]');
await page.wait(300);
await page.eval(()=>window.__qaFill('Days before due','7, 3, 0'));
await page.click('input[aria-label="Reminder time (HH:mm)"]');
await page.wait(300);
await page.eval(()=>window.__qaFill('Reminder time (HH:mm)','00:00'));
await page.click('input[aria-label="Quiet hours start (HH:mm)"]');
await page.wait(300);
await page.eval(()=>window.__qaFill('Quiet hours start (HH:mm)','00:00'));
await page.click('input[aria-label="Quiet hours end (HH:mm)"]');
await page.wait(300);
await page.eval(()=>window.__qaFill('Quiet hours end (HH:mm)','00:00'));
await page.eval(()=>window.__qaClick('Save reminders'));
await page.eval(async()=>{
 for(let i=0;i<60;i++){
  if(window.__qaText().includes('Reminder settings saved.'))return;
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('Preferences were not saved');
});
const owner=await page.eval(async()=>{
 if(!window.__qaText().includes('Reminder settings saved.'))throw Error('Preferences were not saved');
 const before=Notification.permission;window.__qaClick('Allow notifications on this device');
 await new Promise(r=>setTimeout(r,200));if(Notification.permission!==before)throw Error('Emulator requested OS permission');
 const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-tally',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.__qaAccount,returnSecureToken:true})});
 const user=await response.json();if(!response.ok)throw Error('Synthetic sign-in failed');window.__qaUser=user;
 window.__qaCall=async(name,payload)=>{
  const response=await fetch('http://127.0.0.1:5001/demo-tally/asia-southeast1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.idToken},body:JSON.stringify({data:{commandId:crypto.randomUUID(),expectedOwnerUid:user.localId,payload}})});
  const data=await response.json();if(data.error)throw Error(name+': '+data.error.message);return data.result;
 };
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const common={description:'Synthetic emulator verification',notes:'',currency:'PHP',amountMinor:700000,originationDate:day,dueDate:day,contactId:null,categoryId:'default-personal-loan',paymentSourceId:null,interestInfo:null};
 window.__qaLoans=[await window.__qaCall('createObligation',{...common,title:'Loan to remember',direction:'owedByMe'}),await window.__qaCall('createObligation',{...common,title:'John’s repayment',direction:'owedToMe',currency:'USD',amountMinor:12500})];
 const recurrence={frequency:'monthly',unit:'months',interval:1,anchorDate:day,preferredDay:Number(day.slice(-2)),monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:day,endDate:null,ruleVersion:1};
 window.__qaBill=await window.__qaCall('createRecurring',{title:'Electricity',description:'Variable bill',notes:'',contactId:null,categoryId:'default-utilities',currency:'PHP',amountKind:'variable',defaultAmountMinor:350000,paymentMode:'manual',paymentSourceId:null,recurrence,reminderPolicy:{enabled:true,offsetDays:[3,0],localTime:'00:00'}});
 return {uid:user.localId,obligationIds:[...window.__qaLoans.map(x=>x.obligationId),window.__qaBill.obligationId]};
});
console.log(JSON.stringify(owner));
`);
const {uid,obligationIds} = JSON.parse(setup);
if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('Invalid synthetic owner.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
initializeApp({projectId: 'demo-tally'});
const db = getFirestore();
const {runReadyJob} = require('./lib/src/jobs/dispatch.js');
let processed = 0;
for (let round = 0; round < 15; round++) {
  const now = new Date();
  const jobs = await db.collection('systemJobs').where('userId', '==', uid).get();
  let count = 0;
  for (const doc of jobs.docs) {
    const job = doc.data();
    if (job.status === 'pending' && job.nextRunAt?.toMillis() <= now.getTime() && await runReadyJob(doc.id, db)) count++;
  }
  processed += count;
  if (!count) break;
}
const reminders = await db.collection(`users/${uid}/reminders`).get();
const published = reminders.docs.filter(doc => doc.data().visible);
if (published.length < 3 || obligationIds.some(id => !published.some(doc => doc.data().obligationId === id))) throw Error('Each owned fixture must have a published reminder.');
if ((await db.collection(`users/${uid}/payments`).get()).size !== 0) throw Error('Reminder processing changed payment history.');
console.log(browser(verificationScript));
console.log(JSON.stringify({processed, published: published.length, paymentHistoryUnchanged: true}));
