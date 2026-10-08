import {readdirSync} from 'node:fs';
import {join} from 'node:path';

// Legacy migration fixtures deliberately remove canonical preferences. Keep
// their pending trigger work separate from unrelated financial/file fixtures.
// Discover files on every run so a new test cannot disappear from the full gate.
export function emulatorSuitePlan(root) {
  function files(folder) {
    return readdirSync(join(root,'firebase',folder))
      .filter(name=>name.endsWith('.test.mjs')).sort().map(name=>{
        if(!/^[a-z0-9_-]+\.test\.mjs$/.test(name))throw Error('Unsafe emulator test filename.');
        return `firebase/${folder}/${name}`;
      });
  }
  const prompt=files('prompt-tests');
  const deterministic=[...files('rules-tests'),...files('emulator-tests')];
  if(!prompt.length||!deterministic.length)throw Error('Required emulator suites are empty.');
  const legacy='firebase/emulator-tests/notification_commands.test.mjs';
  const plan=[{mode:'automatic',files:prompt}];
  if(deterministic.includes(legacy))plan.push({mode:'manual',files:[legacy]});
  const remaining=deterministic.filter(path=>path!==legacy);
  if(remaining.length)plan.push({mode:'manual',files:remaining});
  return plan;
}
