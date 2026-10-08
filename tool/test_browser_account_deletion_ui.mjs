import {createServer} from 'node:http';
import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {spawn} from 'node:child_process';

if (process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL !== 'http://127.0.0.1:36931') throw Error('Owned local QA browser required.');
const origin = 'http://localhost:7365', root = resolve('build/deletion-ui-probe');
const evidence = resolve('.superpowers/sdd/2026-10-08-tally-account-deletion/task-5-renders');
mkdirSync(evidence, {recursive:true});
const mime = {'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.ttf':'font/ttf'};
const server=createServer((request,response)=>{
  const path=new URL(request.url,origin).pathname;
  const file=resolve(root,`.${path==='/'?'/index.html':path}`);
  if(!file.startsWith(root+'/')||!existsSync(file)){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
  response.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(7365,'127.0.0.1',resolve);});
const env={...process.env,CHROME_DEVTOOLS_AXI_SESSION:'tally-deletion-ui'};
const command=(args,input)=>new Promise((resolve,reject)=>{
  const child=spawn('npx',['-y','chrome-devtools-axi',...args],{env,stdio:['pipe','pipe','pipe']});
  let output='',errors='';
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
  child.once('error',reject);child.once('close',status=>status===0?resolve(output.trim()):reject(Error(errors||output)));
  child.stdin.end(input??'');
});
const cases=[];
for(const width of [400,800,1440])for(const dark of [0,1])cases.push({width,dark,scenario:'confirmation'});
for(const scenario of ['uncertain','cleanup','complete','signout'])for(const width of [400,1440])cases.push({width,dark:1,scenario});
const reports=[];
try {
  await command(['start']);
  await command(['open',origin]);
  for(const entry of cases){
    const {width,dark,scenario}=entry;
    await command(['resize',String(width),'1000']);
    const expected=scenario==='confirmation'?'Delete your account':scenario==='uncertain'?'Could not confirm deletion':'Deletion requested';
    const url=`${origin}/?scale=2&dark=${dark}&scenario=${scenario}`;
    const result=JSON.parse(await command(['run'],`
await page.open(${JSON.stringify(url)});
for(let i=0;i<150;i++){
  if(await page.eval(()=>window.tallyDeletionUiReady===true))break;
  await page.wait(100);
}
await page.wait(500);
const report=await page.eval(()=>{
  const label=e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/\\s+/g,' ').trim();
  const text=[...document.querySelectorAll('[aria-label],flt-semantics')].map(label).join(' ');
  return {text,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,secretFields:[...document.querySelectorAll('input[type="password"]')].length};
});
if(!report.text.includes(${JSON.stringify(expected)}))throw Error('Expected page content missing');
if(report.overflow)throw Error('Horizontal browser overflow');
if(/revokeSessions|deleteIdentity|leaseToken|Everything deleted/.test(report.text))throw Error('Internal or inaccurate status visible');
if(${JSON.stringify(scenario)}==='signout'&&!report.text.includes('Retry sign-out'))throw Error('Missing truthful sign-out retry');
console.log(JSON.stringify({viewport:report.viewport,overflow:report.overflow,content:true}));
`));
    if(result.viewport!==width)throw Error('Viewport resize did not apply');
    const id=`${scenario}-${width}-${dark}`;
    const consoleOutput=await command(['console','--type','error','--limit','100']);
    writeFileSync(resolve(evidence,id+'-console.txt'),consoleOutput+'\n');
    if(/RenderFlex|EXCEPTION|Unhandled|TypeError|RangeError|Assertion failed/i.test(consoleOutput))throw Error('Runtime error in '+id);
    await command(['screenshot',resolve(evidence,id+'.png')]);
    reports.push({...entry,...result});
    console.log(JSON.stringify({render:id,passed:true}));
  }
  const report={renders:reports.length,cases:reports};
  writeFileSync(resolve(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({renders:reports.length,responsive:true,scale:2,lightAndDark:true,truthfulProgress:true}));
} finally {
  server.close();
}
