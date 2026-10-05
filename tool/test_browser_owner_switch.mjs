import {spawnSync} from 'node:child_process';

const applicationUrl = process.env.TALLY_FLUTTER_WEB_URL ?? 'http://localhost:7358/';
const application = new URL(applicationUrl);
if (application.hostname !== 'localhost' || application.protocol !== 'http:') {
  throw new Error('This regression requires a localhost demo emulator application.');
}
const script = `
await page.open(${JSON.stringify(applicationUrl)});
await page.wait(1200);
await page.eval(() => {
  if (!document.body.innerText.includes('Running in emulator mode.')) {
    throw Error('Demo emulator application required');
  }
  document.querySelector('[aria-label="Enable accessibility"]')?.click();
  const normalize = value => (value.getAttribute('aria-label') || value.textContent || '').replace(/\\s+/g, ' ').trim();
  window.__qaFindAction = label => [...document.querySelectorAll('[role="button"],[role="menuitem"],[role="tab"],button')].find(value => normalize(value) === label);
  window.__qaClick = label => {
    const action = window.__qaFindAction(label);
    if (!action) throw Error('Missing action: ' + label);
    action.click();
  };
  window.__qaFill = async (label, value) => {
    const find = () => [...document.querySelectorAll('input,textarea')].find(input => (input.getAttribute('aria-label') || '').startsWith(label));
    let input = find();
    if (!input) throw Error('Missing input: ' + label);
    input.focus();
    await new Promise(resolve => setTimeout(resolve, 250));
    if (!input.isConnected) input = find();
    input.value = value;
    input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
    await new Promise(resolve => setTimeout(resolve, 150));
    input.blur();
  };
});
async function waitAction(label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await page.eval('Boolean(window.__qaFindAction(' + JSON.stringify(label) + '))')) return;
    await page.wait(200);
  }
  throw Error('Timed out waiting for: ' + label);
}
await waitAction('New to Tally? Create an account');
await page.eval(() => window.__qaClick('New to Tally? Create an account'));
await page.wait(200);
await page.eval(() => {
  window.__qaAccount = {email: 'qa-owner-' + crypto.randomUUID() + '@example.test', password: crypto.randomUUID() + 'aA7!'};
});
await page.eval(() => window.__qaFill('Email', window.__qaAccount.email));
await page.eval(() => window.__qaFill('Password', window.__qaAccount.password));
await page.eval(() => window.__qaClick('Create account'));
await waitAction('Start using Tally');
await page.eval(() => window.__qaClick('Start using Tally'));
await page.wait(800);
if (await page.eval(() => Boolean(window.__qaFindAction('More')))) {
  await page.eval(() => window.__qaClick('More'));
  await page.wait(200);
}
await waitAction('Settings');
await page.eval(() => window.__qaClick('Settings'));
await waitAction('Sign out');
await page.wait(500);
await page.eval(() => {
  window.__qaUnhandled = [];
  window.addEventListener('unhandledrejection', event => window.__qaUnhandled.push(String(event.reason)));
});
await page.eval(() => window.__qaClick('Sign out'));
await page.wait(800);
const result = await page.eval(() => ({signedOut: location.hash === '#/sign-in', unhandledCount: window.__qaUnhandled.length}));
console.log(JSON.stringify(result));
if (!result.signedOut || result.unhandledCount !== 0) {
  throw Error('Owner cancellation produced ' + result.unhandledCount + ' unhandled rejections');
}
`;
const result = spawnSync('npx', ['-y', 'chrome-devtools-axi', 'run'], {
  input: script,
  encoding: 'utf8',
  env: {...process.env, CHROME_DEVTOOLS_AXI_SESSION: process.env.CHROME_DEVTOOLS_AXI_SESSION ?? 'tally'},
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
