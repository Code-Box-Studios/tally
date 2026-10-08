import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectConsoleDiagnostics} from '../browser_console_privacy.mjs';

const listing = message => `console:\n## Console messages\nShowing 1-1 of 1 (Page 1 of 1).\nmsgid=7 [warn] ${message} (1 args)`;

test('the real empty-page response confirms zero diagnostics while malformed output still fails', () => {
  assert.deepEqual(inspectConsoleDiagnostics('console:\n## Console messages\n<no console messages found>\nhelp[2]:\n  Run `chrome-devtools-axi console-get <id>` to see a specific message\n'), {messageCount: 0, detailIds: []});
});

test('offline SDK transport diagnostics are allowed without printing their contents', () => {
  assert.deepEqual(inspectConsoleDiagnostics(listing('Failed to load resource: net::ERR_INTERNET_DISCONNECTED')), {messageCount: 1, detailIds: ['7']});
});

test('browser issue messages without an argument count are audited too', () => {
  assert.deepEqual(inspectConsoleDiagnostics('## Console messages\nShowing 1-1 of 1 (Page 1 of 1).\nmsgid=52 [issue] A form field has no id or name attribute'), {messageCount: 1, detailIds: ['52']});
});

test('reported credentials and private financial values fail with a redacted error', () => {
  for (const value of ['password: synthetic-secret', 'idToken=synthetic-token', 'qa-sync-synthetic@example.test', 'amountMinor: 25000', 'Pending layout verification', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJzeW50aGV0aWMifQ.signature', 'Synthetic exact secret']) {
    let failure;
    try { inspectConsoleDiagnostics(listing(value), {forbiddenValues: ['Synthetic exact secret']}); } catch (error) { failure = error; }
    assert.ok(failure, 'A private diagnostic must fail the gate');
    assert.equal(failure.message, 'Private data appeared in browser console diagnostics.');
    assert.ok(!failure.message.includes(value));
  }
});

test('expanded object diagnostics receive the same privacy check', () => {
  assert.throws(() => inspectConsoleDiagnostics(listing('Object'), {details: ['message:\nID: 7\nMessage: {refreshToken: "synthetic"}']}), /Private data appeared/);
});

test('truncated or unknown console output cannot report a successful audit', () => {
  assert.throws(() => inspectConsoleDiagnostics(listing('Transport').replace('of 1 (', 'of 2 (')), /Incomplete browser console diagnostics/);
  assert.throws(() => inspectConsoleDiagnostics('Bridge failed'), /Incomplete browser console diagnostics/);
});

test('bounded console pages cover every listed row and reject CLI truncation', () => {
  const first = 'console:\n## Console messages\nShowing 1-2 of 3 (Page 1 of 2).\nmsgid=48 [error] Offline (0 args) [2 times]\nmsgid=50 [warn] Transport (6 args)';
  assert.deepEqual(inspectConsoleDiagnostics(first, {page: 0, pageSize: 2}), {messageCount: 2, detailIds: ['48', '50'], totalMessages: 3, nextPage: 1});
  const last = 'console:\n## Console messages\nShowing 3-3 of 3 (Page 2 of 2).\nmsgid=51 [error] Offline (0 args)';
  assert.deepEqual(inspectConsoleDiagnostics(last, {page: 1, pageSize: 2}), {messageCount: 1, detailIds: ['51'], totalMessages: 3, nextPage: null});
  assert.throws(() => inspectConsoleDiagnostics(first + '\n... (truncated, 4723 chars total)', {page: 0, pageSize: 2}), /Incomplete browser console diagnostics/);
});

test('unhandled Flutter runtime and layout errors fail separately from offline warnings', () => {
  for (const message of ['Unhandled exception: synthetic', 'A RenderFlex overflowed by 14 pixels']) {
    assert.throws(() => inspectConsoleDiagnostics(listing(message)), /Flutter runtime error appeared/);
  }
});
