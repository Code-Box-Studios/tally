import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";

const cli = process.env.TALLY_SUPABASE_CLI ?? "/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase";
const status = JSON.parse(spawnSync(cli, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).stdout);
assert.equal(status.API_URL, "http://127.0.0.1:56321", "Use the isolated local Tally stack");
const users = [];
async function request(path, token, body, method = "POST") {
  const response = await fetch(status.API_URL + path, {
    method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Connection: "close" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Local borrower fixture failed: ${response.status}`);
  return response.json();
}
async function account(role) {
  const email = `expo-borrower-${role}-${randomUUID()}@example.test`, password = randomBytes(24).toString("base64url");
  const user = await request("/auth/v1/admin/users", status.SERVICE_ROLE_KEY, { email, password, email_confirm: true });
  users.push(user);
  const session = await request("/auth/v1/token?grant_type=password", status.ANON_KEY, { email, password });
  const actor = { id: user.id, email, password, token: session.access_token };
  await invoke(actor, "bootstrapUser", {});
  return actor;
}
async function invoke(actor, name, input) {
  return (await request("/functions/v1/tally-api", actor.token, { name, input })).result;
}
const command = (actor, name, payload) => invoke(actor, name, { expectedOwnerUid: actor.id, commandId: randomUUID(), payload });
const env = {
  ...process.env,
  CHROME_DEVTOOLS_AXI_BROWSER_URL: process.env.TALLY_QA_BROWSER ?? "http://127.0.0.1:9242",
  CHROME_DEVTOOLS_AXI_SESSION: process.env.TALLY_QA_SESSION ?? `tally-borrower-${randomUUID()}`,
};
function browser(args, input) {
  const result = spawnSync("npx", ["-y", "chrome-devtools-axi@0.1.41", ...args], { env, input, encoding: "utf8", timeout: 60000 });
  if (result.status !== 0) throw new Error(result.stdout || result.stderr || "Borrower browser command failed");
  return result.stdout;
}
const helpers = `
const button=label=>'[role="button"][aria-label="'+label+'"]';
async function click(label){await page.wait(button(label),15000);await page.click(button(label));}
async function check(text){for(let n=0;n<60;n++){const body=await page.eval(()=>document.body.innerText);if(body.includes(text)){const size=await page.eval(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));if(size.content>size.width)throw new Error('Horizontal layout overflow');return;}await page.wait(250);}throw new Error('Missing '+text+': '+await page.eval(()=>document.body.innerText));}
async function settings(){if(!(await page.eval(()=>!!document.querySelector('[aria-label="Settings"]'))))await click('More');await click('Settings');}
async function logout(){await settings();await click('Sign out');await page.wait('input[aria-label="Email"]',15000);}
`;
function run(script) { console.log(browser(["run"], helpers + script).trim()); }
function login(actor, onboard = true, destination = "/sign-in") {
  run(`await page.open('http://localhost:7385${destination}');await page.wait('input[aria-label="Email"]',15000);
    await page.fill('input[aria-label="Email"]',${JSON.stringify(actor.email)});
    await page.fill('input[aria-label="Password"]',${JSON.stringify(actor.password)});await click('Sign in');
    ${onboard ? "await check('Welcome to Tally.');await click('Open my workspace');" : ""}
    await page.wait('[aria-label="Home"]',15000);
  `);
}
try {
  const owner = await account("owner"), borrower = await account("recipient");
  const categories = await request("/rest/v1/tally_categories?select=id&limit=1", owner.token, null, "GET");
  const loan = await command(owner, "createObligation", {
    title: "Shared browser loan", description: "Private owner description", notes: "PRIVATE_OWNER_ONLY",
    direction: "owedToMe", currency: "PHP", amountMinor: 10000, originationDate: "2020-01-01", dueDate: "2090-02-01",
    categoryId: categories[0].id, contactId: null, paymentSourceId: null, interestInfo: null,
  });
  const share = await command(owner, "createBorrowerShare", { obligationId: loan.obligationId, email: borrower.email });
  browser(["open", "about:blank"]);
  if (process.env.TALLY_QA_VIEWPORT) browser(["emulate", "--viewport", process.env.TALLY_QA_VIEWPORT]);
  // The parent journey may leave an unrelated synthetic session signed in.
  run(`await page.open('http://localhost:7385/borrower');await page.wait(1000);if(await page.eval(()=>!!document.querySelector('[aria-label="Home"]')))await logout();`);
  login(borrower, true, "/borrower");
  run(`await page.open('http://localhost:7385/shared');await click('Accept invitation');await check('Payment schedule');await check('₱100.00');
    if((await page.eval(()=>document.body.innerText)).includes('PRIVATE_OWNER_ONLY'))throw new Error('Owner notes leaked');
    await click('Submit payment proof');await page.fill('input[aria-label="Amount paid"]','25');
    await page.fill('input[aria-label="Payment reference"]','000123');await click('Review proof');
    await check('Draft');await check('Reference: 000123');await check('₱100.00');
    await click('Send proof for approval');await check('Withdraw proof');await check('₱100.00');
    console.log('PASS borrower accepts invitation, sends proof, and balance stays unchanged');await logout();
  `);
  login(owner);
  run(`await click('Obligations');await click('Shared browser loan');await click('Share with borrower');
    await check('Pending review');await check('000123');await click('Review approval');
    await check('from ₱100.00 to ₱75.00');await click('Approve and record payment');await check('Approved');
    await click('Done');await check('₱75.00');console.log('PASS owner review records one payment');await logout();
  `);
  login(borrower, false);
  run(`await page.open('http://localhost:7385/shared');await click('View shared loan');await check('₱75.00');await check('Approved');
    console.log('PASS borrower sees approved proof and updated balance');
  `);
  // UI sign-out revokes every session, including the original fixture tokens.
  for (const actor of [owner, borrower]) {
    const session = await request("/auth/v1/token?grant_type=password", status.ANON_KEY, { email: actor.email, password: actor.password });
    actor.token = session.access_token;
  }
  const shared = await invoke(borrower, "borrowerView", { ownerId: owner.id, shareId: share.shareId });
  assert.equal(shared.loan.remainingMinor, 7500);
  assert.equal(shared.loan.payments.length, 1);
  await command(owner, "revokeBorrowerShare", { shareId: share.shareId });
  run(`await click('Refresh');for(let n=0;n<60;n++){if(!(await page.eval(()=>document.body.innerText)).includes('Remaining balance'))break;await page.wait(250);}
    if((await page.eval(()=>document.body.innerText)).includes('Remaining balance'))throw new Error('Revoked loan details remain visible');
    await click('All shared loans');await check('No shared loans yet');console.log('PASS revocation hides shared details');await logout();
  `);
} finally {
  for (const user of users.reverse()) await request(`/auth/v1/admin/users/${user.id}`, status.SERVICE_ROLE_KEY, null, "DELETE");
}
