import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Pin one shared data release independently of platform/managed ICU versions.
const source='https://data.iana.org/time-zones/releases/tzdata2026c.tar.gz';
const expectedHash='e4a178a4477f3d0ea77cc31828ff72aa38feff8d61aa13e7e99e142e9d902be4';
const temporary=mkdtempSync(join(tmpdir(),'tally-timezones-'));
try {
  const archive=process.argv[2]
    ? readFileSync(process.argv[2])
    : execFileSync('curl',['--fail','--silent','--show-error',source],{maxBuffer:2_000_000});
  if(createHash('sha256').update(archive).digest('hex')!==expectedHash)throw new Error('Timezone source checksum mismatch.');
  writeFileSync(join(temporary,'source.tar.gz'),archive);
  execFileSync('tar',['-xzf',join(temporary,'source.tar.gz'),'-C',temporary]);
  if(readFileSync(join(temporary,'version'),'utf8').trim()!=='2026c')throw new Error('Unexpected timezone release.');
  const sources=['africa','antarctica','asia','australasia','etcetera','europe','northamerica','southamerica','backward'];
  writeFileSync(join(temporary,'rearguard.zi'),execFileSync('awk',['-v','DATAFORM=rearguard','-f',join(temporary,'ziguard.awk'),...sources.map(file=>join(temporary,file))]));
  // zic normally retains a POSIX future-rule tail, which timezone0.11.1 does
  // not interpret. An upper range emits explicit future transitions instead.
  const upper=Date.UTC(2201,0,1)/1000;
  execFileSync('zic',['-b','fat','-r',`/@${upper}`,'-d',join(temporary,'zoneinfo'),join(temporary,'rearguard.zi')]);
  execFileSync('dart',['run','tool/encode_tally_timezones.dart',join(temporary,'zoneinfo'),resolve('lib/core/dates/tally_timezones.g.dart'),resolve('functions/src/generated/timezones.json')],{stdio:'inherit'});
  execFileSync('dart',['format','lib/core/dates/tally_timezones.g.dart'],{stdio:'inherit'});
} finally {
  rmSync(temporary,{recursive:true,force:true});
}
