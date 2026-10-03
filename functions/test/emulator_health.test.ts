import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmulatorHealthRequest } from '../src/emulator_health.js';

test('authenticated demo probe returns only the verified UID', () => {
  assert.deepEqual(validateEmulatorHealthRequest({}, 'alice', true, 'demo-tally'), { mode: 'emulator', userId: 'alice' });
});
for (const [name, input, uid, emulator, project, code] of [
  ['no auth', {}, undefined, true, 'demo-tally', 'unauthenticated'],
  ['real runtime', {}, 'alice', false, 'demo-tally', 'failed-precondition'],
  ['real project', {}, 'alice', true, 'tally-production', 'failed-precondition'],
  ['missing project', {}, 'alice', true, undefined, 'failed-precondition'],
  ['payload owner', {userId:'bob'}, 'alice', true, 'demo-tally', 'invalid-argument'],
  ['null input', null, 'alice', true, 'demo-tally', 'invalid-argument'],
  ['array input', [], 'alice', true, 'demo-tally', 'invalid-argument'],
] as const) {
  test(name, () => assert.throws(() => validateEmulatorHealthRequest(input, uid, emulator, project), { code }));
}
