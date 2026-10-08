import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emulatorSuitePlan} from '../emulator_suite_plan.mjs';

function fixture(run) {
  const root=mkdtempSync(join(tmpdir(),'tally-emulator-plan-'));
  try {
    for(const folder of ['prompt-tests','rules-tests','emulator-tests'])mkdirSync(join(root,'firebase',folder),{recursive:true});
    for(const path of ['prompt-tests/trigger.test.mjs','rules-tests/ownership.test.mjs','emulator-tests/notification_commands.test.mjs','emulator-tests/payments.test.mjs','emulator-tests/new-feature.test.mjs'])writeFileSync(join(root,'firebase',path),'');
    return run(root);
  } finally {rmSync(root,{recursive:true,force:true});}
}

test('legacy preference migration starts in a fresh emulator and every discovered case still runs once',()=>fixture(root=>{
  assert.deepEqual(emulatorSuitePlan(root),[
    {mode:'automatic',files:['firebase/prompt-tests/trigger.test.mjs']},
    {mode:'manual',files:['firebase/emulator-tests/notification_commands.test.mjs']},
    {mode:'manual',files:['firebase/rules-tests/ownership.test.mjs','firebase/emulator-tests/new-feature.test.mjs','firebase/emulator-tests/payments.test.mjs']},
  ]);
}));

test('a test filename with shell syntax is rejected rather than executed or silently omitted',()=>fixture(root=>{
  writeFileSync(join(root,'firebase/emulator-tests','bad;name.test.mjs'),'');
  assert.throws(()=>emulatorSuitePlan(root),/Unsafe emulator test filename/);
}));

test('an empty financial suite cannot make the release gate look successful',()=>fixture(root=>{
  for(const folder of ['rules-tests','emulator-tests']) {
    rmSync(join(root,'firebase',folder),{recursive:true});
    mkdirSync(join(root,'firebase',folder));
  }
  assert.throws(()=>emulatorSuitePlan(root),/Required emulator suites are empty/);
}));
