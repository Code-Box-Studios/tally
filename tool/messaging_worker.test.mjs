import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../web/firebase-messaging-sw.js', import.meta.url), 'utf8');
function worker() {
  const listeners = new Map(), opened = [];
  const self = {
    location: {origin: 'https://tally.example'},
    clients: {openWindow: async url => { opened.push(url); }},
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  runInNewContext(source, {self, URL, URLSearchParams, importScripts() {}});
  return {listeners, opened};
}
async function click(data) {
  const state = worker();
  let stopped = false, closed = false, completion;
  state.listeners.get('notificationclick')({
    notification: {data, close() {closed = true;}},
    stopImmediatePropagation() {stopped = true;},
    waitUntil(value) {completion = value;},
  });
  await completion;
  assert.ok(stopped && closed);
  return new URL(state.opened[0]);
}
test('notification clicks use Flutter hash routing with only validated owned-target IDs', async () => {
  const url = await click({FCM_MSG: {data: {reminderId: 'r-1', obligationId: 'loan-1', instanceId: 'period-1'}}});
  assert.equal(url.origin, 'https://tally.example');
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
  assert.equal(url.hash, '#/settings/reminders/inbox?reminder=r-1&obligation=loan-1&period=period-1');
});
test('malformed notification targets open the private inbox without untrusted IDs', async () => {
  for (const data of [null, {reminderId: '../escape', obligationId: 'loan', instanceId: 'period'},
    {reminderId: 'r', obligationId: 'loan', instanceId: 'period', amount: 500}]) {
    const url = await click(data);
    assert.equal(url.href, 'https://tally.example/#/settings/reminders/inbox');
  }
});
