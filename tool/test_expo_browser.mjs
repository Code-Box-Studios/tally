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
  CHROME_DEVTOOLS_AXI_SESSION: "tally-expo-new",
};
function run(script) {
  const result = spawnSync("npx", ["-y", "chrome-devtools-axi", "run"], {
    env: environment,
    input: script,
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(result.stdout.trim());
  if (result.status !== 0)
    throw new Error(
      "Browser journey failed: " + (result.stderr || result.stdout),
    );
}
const helpers = `const sleep=ms=>page.wait(ms);const button=label=>'[role="button"][aria-label="'+label+'"]';const field=label=>'[aria-label="'+label+'"]';const radio=label=>'[role="radio"][aria-label="'+label+'"]';async function click(label){await page.click(button(label));}async function save(label){await page.click('[data-testid="tally-form"] '+button(label));await sleep(500);}async function check(text){let body='';for(let attempt=0;attempt<25;attempt++){body=await page.eval(()=>document.body.innerText);if(body.includes(text)){console.log('PASS '+text);return;}await sleep(200);}throw new Error('Expected UI text: '+text+'; screen: '+body);}`;
try {
  run(`${helpers}
 await page.open('http://localhost:7385');await sleep(500);
 await page.eval(async()=>{for(const key of Object.keys(localStorage)){if(!key.startsWith('tally-auth-'))continue;let session;try{session=JSON.parse(localStorage.getItem(key));}catch{continue;}if(!/^expo-browser-[a-f0-9-]{36}@example\.test$/.test(session?.user?.email??''))continue;const prefix='expo-v1:http://127.0.0.1:56321:'+session.user.id+':';await new Promise(resolve=>{const r=indexedDB.open('tally-expo-v1',1);r.onsuccess=()=>{const tx=r.result.transaction('private','readwrite'),c=tx.objectStore('private').openCursor();c.onsuccess=()=>{if(c.result){if(String(c.result.key).startsWith(prefix))c.result.delete();c.result.continue();}};tx.oncomplete=()=>{r.result.close();resolve();};};});localStorage.removeItem(key);}});

 await page.eval(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();});
 await page.open('http://localhost:7385');await sleep(400);
 if(await page.eval(()=>!!document.querySelector('[aria-label="Settings"]'))){await click('Settings');await sleep(300);}if(await page.eval(()=>!!document.querySelector('[aria-label="Sign out"]'))){await click('Sign out');await sleep(400);}
 await page.wait('input[aria-label="Email"]',10000);await page.fill('input'+field('Email'),${JSON.stringify(email)});await page.fill('input'+field('Password'),${JSON.stringify(password)});await save('Sign in');await check('Welcome to Tally.');await save('Open my workspace');await check('A fresh start.');
 await click('People');await sleep(300);await click('Add contact');await page.fill('input'+field('Name'),'Browser John');await save('Add contact');await check('Browser John');
 await click('+ Add');await page.click(radio('I lent money'));await page.fill('input'+field('Name'),'Browser John loan');await page.fill('input'+field('Original amount'),'5000');await page.click(radio('Browser John'));await page.fill('input'+field('Due date (optional, YYYY-MM-DD)'),'2026-10-12');await save('Add obligation');await check('Owed to Me');
 await click('Record payment');await page.fill('input'+field('Payment amount'),'2000');await save('Record payment');await check('₱3,000.00');
 await click('Correct payment');await page.fill('textarea'+field('Reason'),'Wrong test amount');await save('Save correction');await check('Payment reversed');await check('₱5,000.00');
 await click('+ Add');await page.click(radio('Add monthly due / recurring payment'));await page.fill('input'+field('Name'),'Browser Internet');await page.fill('input'+field('Default amount'),'1699');await save('Add obligation');await check('Billing periods');await click('Mark as paid');await save('Record payment');await check('₱1,699.00');await check('Payment recorded');
 await click('Calendar');await sleep(300);await check('Your financial calendar');await click('Activity');await sleep(300);await check('Activity');await click('Home');await sleep(300);await check('Owed to You');
 await click('Settings');await click('Saved actions & offline saving');await page.click(radio('Trusted device'));await page.wait('[aria-label="Sync now"]',10000);await check('Saved actions');
 await page.eval(async()=>{await navigator.serviceWorker.ready;});console.log('PASS offline app shell installed');
 `);
  run(
    `${helpers}await click('Obligations');await sleep(250);await page.click(radio('Owed to Me'));await click('Browser John loan');await sleep(250);await click('Record payment');await page.fill('input'+field('Payment amount'),'1000');`,
  );
  const offline = spawnSync(
    "npx",
    ["-y", "chrome-devtools-axi", "emulate", "--network", "Offline"],
    { env: environment, encoding: "utf8" },
  );
  if (offline.status !== 0) throw new Error("Offline emulation failed.");
  run(
    `${helpers}await save('Record payment');await check('1 saved action');await page.open('http://localhost:7385/settings/sync');await sleep(600);await check('Record Payment');console.log('PASS offline reload retains the saved payment');`,
  );
  spawnSync(
    "npx",
    ["-y", "chrome-devtools-axi", "emulate", "--network", "Fast 4G"],
    { env: environment, encoding: "utf8" },
  );
  run(
    `${helpers}await click('Sync now');await sleep(500);await check('Nothing waiting on this device');await click('Obligations');await page.click(radio('Owed to Me'));await click('Browser John loan');await sleep(300);await check('₱4,000.00');await click('Settings');await click('Sign out');await sleep(400);await check('Your money, your space.');console.log('PASS reconnect applies one saved payment and signs out');`,
  );
  run(`${helpers}
    await page.fill('input'+field('Email'),${JSON.stringify(email)});await page.fill('input'+field('Password'),${JSON.stringify(password)});await save('Sign in');await click('Settings');await click('Delete account');await page.fill('input'+field('Current password (email accounts)'),${JSON.stringify(password)});await page.fill('input'+field('Type DELETE'),'DELETE');await save('Delete my account');await check('Your money, your space.');console.log('PASS protected deletion clears the private local workspace');
  `);
} finally {
  spawnSync(
    "npx",
    ["-y", "chrome-devtools-axi", "emulate", "--network", "Fast 4G"],
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
