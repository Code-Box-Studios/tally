import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateRecurrence,occurrenceAt,nextOccurrence,occurrencesThrough} from '../src/recurring/recurrence.js';
import {scheduledInstant} from '../src/recurring/scheduled_time.js';
import {supportedZones,timezoneDataVersion,localWallMilliseconds} from '../src/shared/zone_data.js';

const fixtures=JSON.parse(readFileSync(resolve(__dirname,'../../../firebase/fixtures/recurrence.json'),'utf8')) as {
  cases:{name:string;rule:Record<string,unknown>;expected:string[]}[];
  instants:{name:string;date:string;time:string;zone:string;instant:string}[];
};
for(const fixture of fixtures.cases)test(`recurrence: ${fixture.name}`,()=>{
  const rule=validateRecurrence(fixture.rule);
  const result=occurrencesThrough(rule,null,fixture.expected.at(-1)!,30);
  assert.deepEqual(result.occurrences.map(value=>value.date),fixture.expected);
  assert.equal(result.hasMore,false);
  const last=result.occurrences.at(-1)!;
  assert.equal(occurrenceAt(rule,last.index),last.date);
  if(rule.endDate || last.date==='2199-12-31')assert.equal(nextOccurrence(rule,last.date),null);
});
for(const fixture of fixtures.instants)test(`scheduled instant: ${fixture.name}`,()=>{
  assert.equal(scheduledInstant(fixture.date,fixture.time,fixture.zone).toISOString(),fixture.instant);
});
test('recurrence validation rejects forged rules and ambiguous time inputs',()=>{
  const base=fixtures.cases[0]!.rule;
  for(const patch of [
    {frequency:'hourly'},{unit:'hours'},{interval:0},{interval:1.5},{interval:366},{interval:2},
    {preferredDay:0},{preferredDay:32},{preferredDay:null},{monthEnd:'true'},{ruleVersion:0},
    {anchorDate:'2026-02-30'},{startDate:'1899-12-31'},{startDate:'2025-01-01'},
    {endDate:'2026-01-30'},{timezone:'Not/A_Zone'},{timezone:'+08:00'},
    {localDeductionTime:'24:00'},{localDeductionTime:'9:00'},{localDeductionTime:'09:00:00'},
    {unknown:1},
  ])assert.throws(()=>validateRecurrence({...base,...patch}),{code:'invalid-argument'});
  for(const args of [['2026-02-30','09:00','Asia/Manila'],['2026-10-04','24:00','Asia/Manila'],['2026-10-04','09:00','bad']] as const)
    assert.throws(()=>scheduledInstant(args[0],args[1],args[2]),{code:'invalid-argument'});
  const rule=validateRecurrence(base);
  for(const index of [-1,0.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>occurrenceAt(rule,index),{code:'invalid-argument'});
  for(const limit of [0,31,1.5])assert.throws(()=>occurrencesThrough(rule,null,'2026-12-31',limit),{code:'invalid-argument'});
});
test('daily continuation conserves every key and directly seeks centuries ahead',()=>{
  const rule=validateRecurrence({...fixtures.cases[0]!.rule,frequency:'custom',unit:'days',interval:1,preferredDay:null,anchorDate:'1900-01-01',startDate:'1900-01-01'});
  const first=occurrencesThrough(rule,null,'1900-03-05');
  assert.equal(first.occurrences.length,30);assert.equal(first.hasMore,true);
  const second=occurrencesThrough(rule,first.occurrences.at(-1)!.date,'1900-03-05');
  assert.equal(second.occurrences.length,30);assert.equal(second.hasMore,true);
  const last=occurrencesThrough(rule,second.occurrences.at(-1)!.date,'1900-03-05');
  assert.equal(last.occurrences.length,4);assert.equal(last.hasMore,false);
  assert.equal(new Set([...first.occurrences,...second.occurrences,...last.occurrences].map(row=>row.date)).size,64);
  assert.equal(nextOccurrence(rule,'2199-12-30')!.date,'2199-12-31');
  assert.equal(nextOccurrence(rule,'2199-12-31'),null);
});
test('all bundled zones share the same pinned future civil-time adapter',()=>{
  assert.equal(timezoneDataVersion,'2026c');
  assert.ok(supportedZones.length>400);
  for(const zone of supportedZones) {
    const instant=scheduledInstant('2099-07-01','09:00',zone);
    assert.equal(localWallMilliseconds(instant.getTime(),zone),Date.UTC(2099,6,1,9),zone);
  }
});
