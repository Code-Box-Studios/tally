import {resolve} from 'node:path';

// The CLI has no file-chooser interception command. Keep its session for UI
// operations and use Chrome's native chooser protocol for this one capability.
export async function chooseLocalFile(browser, path, origin) {
  const endpoint=process.env.CHROME_DEVTOOLS_AXI_BROWSER_URL;
  if(endpoint!=='http://127.0.0.1:36931'||new URL(origin).hostname!=='localhost')throw Error('Owned local QA browser required.');
  const uid=JSON.parse(browser('console.log(JSON.stringify(await page.eval(()=>window.__qaUser.localId)));'));
  const pages=await (await fetch(endpoint+'/json/list')).json();
  let connection;
  for(const page of pages.filter(x=>x.type==='page'&&x.url.startsWith(origin))) {
    const candidate=await connect(page.webSocketDebuggerUrl);
    const result=await candidate.send('Runtime.evaluate',{expression:'window.__qaUser?.localId',returnByValue:true});
    if(result.result.value===uid){connection=candidate;break;}
    candidate.close();
  }
  if(!connection)throw Error('The actual signed-in CLI page was not found.');
  try {
    await connection.send('Page.enable',{});
    await connection.send('Page.setInterceptFileChooserDialog',{enabled:true});
    const chooser=connection.event('Page.fileChooserOpened');
    browser("await page.eval(()=>{window.__qaAction('Add file').setAttribute('data-tally-qa-picker','true');});await page.click('[data-tally-qa-picker=\"true\"]');");
    const input=await chooser;
    await connection.send('DOM.setFileInputFiles',{files:[resolve(path)],backendNodeId:input.backendNodeId});
  } finally {
    await connection.send('Page.setInterceptFileChooserDialog',{enabled:false});
    connection.close();
  }
}
async function connect(url) {
  const socket=new WebSocket(url),pending=new Map(),events=new Map();let next=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.id&&pending.has(data.id)){const request=pending.get(data.id);pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(Error(data.error.message)):request.resolve(data.result);}
    if(data.method&&events.has(data.method)){const event=events.get(data.method);events.delete(data.method);clearTimeout(event.timer);event.resolve(data.params);}
  });
  return {
    send(method,params){const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local browser command timed out.'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});},
    event(method){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{events.delete(method);reject(Error('Local browser event timed out.'));},20000);events.set(method,{resolve,reject,timer});});},
    close(){socket.close();for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Local browser closed.'));}for(const event of events.values()){clearTimeout(event.timer);event.reject(Error('Local browser closed.'));}},
  };
}
