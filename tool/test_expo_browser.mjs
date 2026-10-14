import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
const cli =
  process.env.TALLY_SUPABASE_CLI ??
  "/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase";
const status = JSON.parse(
  spawnSync(cli, ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).stdout,
);
if (status.API_URL !== "http://127.0.0.1:56321")
  throw new Error("Use the isolated Tally stack.");
const email = "expo-browser-" + randomUUID() + "@example.test",
  password = randomBytes(24).toString("base64url");
async function admin(path, body, method) {
  const response = await fetch(status.API_URL + path, {
    method: method ?? "POST",
    headers: {
      apikey: status.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + status.SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === "DELETE" && response.status === 404) return {};
  if (!response.ok) throw new Error("Local fixture operation failed.");
  return response.json();
}
const user = await admin("/auth/v1/admin/users", {
  email,
  password,
  email_confirm: true,
});
const environment = {
  ...process.env,
  CHROME_DEVTOOLS_AXI_BROWSER_URL:
    process.env.TALLY_QA_BROWSER ?? "http://127.0.0.1:36944",
  CHROME_DEVTOOLS_AXI_SESSION:
    process.env.TALLY_QA_SESSION ?? "tally-expo-" + randomUUID(),
};
function run(script) {
  const result = spawnSync("npx", ["-y", "chrome-devtools-axi@0.1.41", "run"], {
    env: environment,
    input: script,
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(result.stdout.trim());
  if (result.status !== 0) {
    const diagnostic = spawnSync("npx", ["-y", "chrome-devtools-axi@0.1.41", "run"], {
      env: environment, encoding: "utf8", timeout: 15000,
      input: "console.log(JSON.stringify(await page.eval(()=>({path:location.pathname,width:innerWidth,body:document.body.innerText}))));",
    });
    console.log(diagnostic.stdout.trim());
    throw new Error(
      "Browser journey failed: " + (result.error?.code || result.signal || result.stderr || result.stdout),
    );
  }
}
const dueDate = new Date();
dueDate.setUTCDate(dueDate.getUTCDate() + 7);
const dueYear = String(dueDate.getUTCFullYear());
const dueMonth = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(dueDate);
const dueLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(dueDate);
const importCsv = `Title,Type,Amount,Date,Due Date\nBrowser CSV loan,lent,12.34,2020-01-01,${dueDate.toISOString().slice(0, 10)}`;
const viewportArgs = process.env.TALLY_QA_VIEWPORT ? ["--viewport", process.env.TALLY_QA_VIEWPORT] : [];
const helpers = `const sleep=ms=>page.wait(ms);const button=label=>'[role="button"][aria-label="'+label+'"]';const field=label=>'[aria-label="'+label+'"]';const radio=label=>'[role="radio"][aria-label="'+label+'"]';async function click(label){if(['Settings','Activity'].includes(label) && !(await page.eval('!!document.querySelector('+JSON.stringify(button(label))+')'))){await page.click(button('More'));}await page.click(button(label));}async function save(label){const selector='[data-testid="tally-form"] '+button(label);await page.wait(selector,10000);await page.click(selector);await sleep(500);}async function check(text){let body='';for(let attempt=0;attempt<25;attempt++){body=await page.eval(()=>document.body.innerText);if(body.includes(text)){const size=await page.eval(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));if(size.content>size.width)throw new Error('Horizontal layout overflow');console.log('PASS '+text);return;}await sleep(200);}throw new Error('Expected UI text: '+text+'; screen: '+body);}`;
try {
  const opened = spawnSync("npx", ["-y", "chrome-devtools-axi@0.1.41", "open", "about:blank"], {
    env: environment, encoding: "utf8", timeout: 30000,
  });
  if (opened.status !== 0) throw new Error("Browser test page could not be opened.");
  if (viewportArgs.length) {
    const emulation = spawnSync("npx", ["-y", "chrome-devtools-axi@0.1.41", "emulate", ...viewportArgs, "--network", "Fast 4G"], { env: environment, encoding: "utf8" });
    if (emulation.status !== 0) throw new Error("Viewport emulation failed.");
  }
  run(`${helpers}
 await page.open('http://localhost:7385/sign-in');await sleep(500);
 await page.eval(async()=>{for(const key of Object.keys(localStorage)){if(!key.startsWith('tally-auth-'))continue;let session;try{session=JSON.parse(localStorage.getItem(key));}catch{continue;}if(!/^expo-browser-[a-f0-9-]{36}@example\.test$/.test(session?.user?.email??''))continue;const prefix='expo-v1:http://127.0.0.1:56321:'+session.user.id+':';await new Promise(resolve=>{const r=indexedDB.open('tally-expo-v1',1);r.onsuccess=()=>{const tx=r.result.transaction('private','readwrite'),c=tx.objectStore('private').openCursor();c.onsuccess=()=>{if(c.result){if(String(c.result.key).startsWith(prefix))c.result.delete();c.result.continue();}};tx.oncomplete=()=>{r.result.close();resolve();};};});localStorage.removeItem(key);}});

 await page.eval(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();});
 await page.open('about:blank');
 await page.open('http://localhost:7385/sign-in');await sleep(400);
 if(await page.eval(()=>!!document.querySelector('[aria-label="Settings"]'))){await click('Settings');await sleep(300);}if(await page.eval(()=>!!document.querySelector('[aria-label="Sign out"]'))){await click('Sign out');await sleep(400);}
 await page.wait('input[aria-label="Email"]',10000);await page.fill('input'+field('Email'),${JSON.stringify(email)});await page.fill('input'+field('Password'),${JSON.stringify(password)});await save('Sign in');await check('Welcome to Tally.');await save('Open my workspace');await check('Your money, at a glance.');
 await click('People');await sleep(300);await click('Add contact');await page.fill('input'+field('Contact name'),'Browser John');await save('Add contact');await check('Browser John');
 `);
 run(`${helpers}
 await click('Add obligation');await page.click(radio('I lent money'));await page.fill('input'+field('Name'),'Browser John loan');await page.fill('input'+field('Original amount'),'5000');await click('Person / organization: No person selected');await page.click(radio('Browser John'));await click('Due date (optional): No due date yet');await click('Choose year');await click(${JSON.stringify(dueYear)});await click(${JSON.stringify(dueMonth)});await click(${JSON.stringify(dueLabel)});await save('Add obligation');await check('Owed to Me');
 await click('Record payment');await page.fill('input'+field('Payment amount'),'2000');await save('Record payment');await check('₱3,000.00');
 await click('Correct payment');await page.fill('textarea'+field('Reason'),'Wrong test amount');await save('Save correction');await check('Payment reversed');await check('₱5,000.00');
 `);
 run(`${helpers}
 await click('Payoff simulator');await check('This estimate does not change your records.');
 await page.fill('input'+field('Extra monthly payment (PHP)'),'1000');await check('With extra monthly payments');await check('No additional interest is included in this estimate.');await click('Done');await check('₱5,000.00');
 console.log('PASS payoff preview leaves the saved loan balance unchanged');
 await click('Share with borrower');await page.wait('input'+field('Borrower email'),10000);await check('verified email');
 await page.fill('input'+field('Borrower email'),'synthetic@example.test');await click('Review invitation');await check('They must accept within 7 days.');await click('Create invitation');await check('Invited · synthetic@example.test');await check('http://localhost:7385/borrower');
 await click('Revoke access');await check('Received proofs remain available for review.');await click('Confirm revoke');await check('Revoked · synthetic@example.test');await click('Done');await check('₱5,000.00');
 console.log('PASS borrower invitation stays visible and revocation requires confirmation');
 `);
 run(`${helpers}
 await click('Settings');await click('Import spreadsheet');await page.wait('textarea'+field('CSV text'),10000);await page.fill('textarea'+field('CSV text'),${JSON.stringify(importCsv)});
 await click('Match columns');await check('1 rows found.');await click('Preview import');await check('Row 2 · Browser CSV loan');await check('₱12.34');await check('0 invalid');
 await click('Import 1 selected row');await check('Import finished.');await check('Imported and synced.');
 await click('Import another CSV');await page.fill('textarea'+field('CSV text'),${JSON.stringify(importCsv)});await click('Match columns');await click('Preview import');await check('1 possible duplicates');
 if(!(await page.eval(()=>document.querySelector('[role="button"][aria-label="Import 0 selected rows"]')?.getAttribute('aria-disabled')==='true')))throw new Error('Repeated CSV import was not disabled');
 await click('Obligations');await page.click(radio('Owed to Me'));await click('Browser CSV loan');await check('₱12.34');
 console.log('PASS CSV mapping preview saves selected rows and skips a repeated import');
 await click('Record payment');await save('Record payment');await check('Paid-in-full confirmation');
 await click('Paid-in-full confirmation');await check('Share a PDF showing this loan has been settled.');await check('1 confirmed payment');
 await page.eval(()=>{window.__tallyQaOpen=window.open;window.__tallyQaPrinted='';window.open=()=>({opener:null,closed:false,document:{open(){},write(html){window.__tallyQaPdf=html;},close(){}},focus(){},print(){window.__tallyQaPrinted=window.__tallyQaPdf;},close(){}});});
 try {
   await click('Export PDF');
   for(let i=0;i<50;i++){if(await page.eval(()=>!!window.__tallyQaPrinted))break;await sleep(200);}
   await page.eval(()=>{const html=window.__tallyQaPrinted;if(!html.includes('Paid-in-full confirmation')||!html.includes('₱12.34')||!html.includes('₱0.00')||!html.includes('Settled on'))throw new Error('Paid confirmation PDF is incomplete');});
   console.log('PASS paid-in-full confirmation preview and fresh PDF export');
 } finally {await page.eval(()=>{window.open=window.__tallyQaOpen;delete window.__tallyQaOpen;delete window.__tallyQaPdf;delete window.__tallyQaPrinted;});}
 await click('Close confirmation');await click('Correct payment');await page.fill('textarea'+field('Reason'),'Reverse settlement fixture');await save('Save correction');await check('Payment reversed');
 if(await page.eval(()=>!!document.querySelector('[aria-label="Paid-in-full confirmation"]')))throw new Error('Reversed loan still offers a paid confirmation');
 console.log('PASS reversal removes paid confirmation action');

 `);
 run(`${helpers}
 await click('Add obligation');await page.click(radio('Add monthly due'));await page.fill('input'+field('Name'),'Browser Internet');await page.fill('input'+field('Default amount'),'1699');await save('Add obligation');await check('Billing periods');await click('Mark as paid');await save('Record payment');await check('₱1,699.00');await check('Payment recorded');
 `);
 run(`${helpers}
 await click('Calendar');await sleep(300);await page.wait('input[aria-label="Search calendar"]',10000);console.log('PASS Calendar opens');await click('Activity');await sleep(300);await check('Activity');await click('Home');await sleep(300);await check('Owed to you');
 await click('Settings');await click('Saved actions & offline saving');await page.click(radio('Trusted device'));await page.wait('[aria-label="Sync now"]',10000);await check('Saved actions');
 await page.eval(async()=>{await navigator.serviceWorker.ready;});console.log('PASS offline app shell installed');
 `);
  run(`${helpers}
 await click('Settings');
 await page.eval(()=>{window.__tallyQaCreateUrl=URL.createObjectURL;URL.createObjectURL=function(blob){window.__tallyQaExport=blob;return window.__tallyQaCreateUrl.call(URL,blob);};window.__tallyQaPreventDownload=event=>{if(event.target instanceof HTMLAnchorElement&&event.target.download.startsWith('tally-'))event.preventDefault();};document.addEventListener('click',window.__tallyQaPreventDownload,true);});
 try {
   await click('Download all records (JSON)');
   for(let attempt=0;attempt<50;attempt++){if(await page.eval(()=>!!window.__tallyQaExport))break;await sleep(200);}
   await page.eval(async()=>{const value=JSON.parse(await window.__tallyQaExport.text());if(value.format!=='tally-records'||value.profile.userId!==${JSON.stringify(user.id)}||!value.records.contacts.some(row=>row.data.displayName==='Browser John')||!value.records.payments.some(row=>row.data.entryType==='reversal')||Object.hasOwn(value,'access_token'))throw new Error('Incomplete or invalid record export');window.__tallyQaExport=null;});
   await click('Download payments (CSV)');
   for(let attempt=0;attempt<50;attempt++){if(await page.eval(()=>!!window.__tallyQaExport))break;await sleep(200);}
   await page.eval(async()=>{const csv=await window.__tallyQaExport.text();if(!csv.includes('Signed amount (reversals negative)')||!csv.includes('"reversal"')||!csv.includes('"PHP"')||!csv.includes('"Browser John"'))throw new Error('Payment CSV lost financial history');});
   console.log('PASS JSON and payment CSV exports retain owned records and reversals');
 } finally {
   await page.eval(()=>{URL.createObjectURL=window.__tallyQaCreateUrl;document.removeEventListener('click',window.__tallyQaPreventDownload,true);delete window.__tallyQaCreateUrl;delete window.__tallyQaPreventDownload;delete window.__tallyQaExport;});
 }
 await click('Saved actions & offline saving');
 `);
  function browserCommand(...args) {
    const result = spawnSync("npx", ["-y", "chrome-devtools-axi@0.1.41", ...args], { env: environment, encoding: "utf8", timeout: 30000 });
    if (result.status !== 0) throw new Error("Browser tab operation failed: " + result.stderr);
    return result.stdout;
  }
  function selectedPage() {
    const match = browserCommand("pages").match(/^  (\d+),[^\n]*,true$/m);
    if (!match) throw new Error("Browser selection could not be verified.");
    return match[1];
  }
  const originalPage = selectedPage();
  let siblingPage;
  try {
    browserCommand("newpage", "http://localhost:7385/settings/sync?qaWindow=second");
    siblingPage = selectedPage();
    run(`await page.wait('[aria-label="Trusted device"][aria-checked="true"]',10000);`);
    browserCommand("selectpage", originalPage);
    run(`${helpers}await page.click(radio('Do not save private data'));`);
    browserCommand("selectpage", siblingPage);
    run(`await page.wait('[aria-label="Do not save private data"][aria-checked="true"]',10000);await page.wait(16000);
      await page.eval(async()=>{const prefix=${JSON.stringify('expo-v1:http://127.0.0.1:56321:' + user.id + ':')};const keys=await new Promise((resolve,reject)=>{const r=indexedDB.open('tally-expo-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const tx=r.result.transaction('private','readonly'),q=tx.objectStore('private').getAllKeys();q.onsuccess=()=>resolve(q.result.filter(k=>String(k).startsWith(prefix)));tx.oncomplete=()=>r.result.close();};});if(keys.length!==1 || keys[0]!==prefix+'trust')throw new Error('Older workspace repopulated private storage');});
      console.log('PASS shared trust revocation prevents stale private writes');
    `);
  } finally {
    if (siblingPage) browserCommand("closepage", siblingPage);
    browserCommand("selectpage", originalPage);
  }
  run(`${helpers}await page.click(radio('Trusted device'));await page.wait('[aria-label="Trusted device"][aria-checked="true"]',10000);await sleep(500);`);
  run(
    `${helpers}await click('Obligations');await sleep(250);await page.click(radio('Owed to Me'));await click('Browser John loan');await sleep(250);await click('Record payment');await page.fill('input'+field('Payment amount'),'1000');`,
  );
  run(`await page.eval(()=>{window.__tallyQaBeforeNetwork={at:performance.timeOrigin,width:innerWidth,form:!!document.querySelector('[data-testid="tally-form"]')};});`);
  const offline = spawnSync(
    "npx",
    ["-y", "chrome-devtools-axi@0.1.41", "emulate", ...viewportArgs, "--network", "Offline"],
    { env: environment, encoding: "utf8" },
  );
  if (offline.status !== 0) throw new Error("Offline emulation failed.");
  run(
    `${helpers}const draft=await page.eval(()=>({before:window.__tallyQaBeforeNetwork,at:performance.timeOrigin,width:innerWidth,form:!!document.querySelector('[data-testid="tally-form"]')}));if(!draft.form || draft.before?.at!==draft.at)throw new Error('Offline emulation reloaded the unsaved form');console.log('PASS offline switch preserves the current form');await save('Record payment');await check('1 saved action');await page.open('http://localhost:7385/settings/sync');await sleep(600);await check('Record Payment');console.log('PASS offline reload retains the saved payment');`,
  );
  spawnSync(
    "npx",
    ["-y", "chrome-devtools-axi@0.1.41", "emulate", ...viewportArgs, "--network", "Fast 4G"],
    { env: environment, encoding: "utf8" },
  );
  run(
    `${helpers}await click('Sync now');await sleep(500);await check('Nothing waiting on this device');await click('Obligations');await page.click(radio('Owed to Me'));await click('Browser John loan');await sleep(300);await check('₱4,000.00');await click('Settings');await click('Sign out');await sleep(400);await page.wait('input[aria-label="Email"]',10000);console.log('PASS reconnect applies one saved payment and signs out');`,
  );
  run(`${helpers}
    await page.fill('input'+field('Email'),${JSON.stringify(email)});await page.fill('input'+field('Password'),${JSON.stringify(password)});await save('Sign in');await click('Settings');await click('Delete account');await page.fill('input'+field('Current password (email accounts)'),${JSON.stringify(password)});await page.fill('input'+field('Type DELETE'),'DELETE');await save('Delete my account');await page.wait('a[href="/sign-in"]',10000);await page.open('http://localhost:7385/home');await page.wait('input[aria-label="Email"]',10000);console.log('PASS protected deletion clears the private local workspace');
  `);
} finally {
  spawnSync(
    "npx",
    ["-y", "chrome-devtools-axi@0.1.41", "emulate", ...viewportArgs, "--network", "Fast 4G"],
    { env: environment, encoding: "utf8" },
  );
  // Remove only this test's browser rows and session, including failed-test actions.
  try {
    run(
      `await page.eval(async()=>{const owner=${JSON.stringify(user.id)},prefix='expo-v1:http://127.0.0.1:56321:'+owner+':';await new Promise((resolve,reject)=>{const request=indexedDB.open('tally-expo-v1',1);request.onsuccess=()=>{const tx=request.result.transaction('private','readwrite'),store=tx.objectStore('private'),cursor=store.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item){if(String(item.key).startsWith(prefix))item.delete();item.continue();}};tx.oncomplete=()=>{request.result.close();resolve();};tx.onerror=()=>reject(new Error('Fixture storage cleanup failed'));};});for(const key of Object.keys(localStorage)){if(!key.startsWith('tally-auth-'))continue;try{if(JSON.parse(localStorage.getItem(key))?.user?.id===owner)localStorage.removeItem(key);}catch{}}});console.log('PASS owner-scoped browser fixture cleanup');`,
    );
  } catch {
    console.error(
      "Browser fixture cleanup needs recovery; no other owner was touched.",
    );
  }
  await admin("/auth/v1/admin/users/" + user.id, undefined, "DELETE");
}
