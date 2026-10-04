import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function verify({load,manifest,archive,sourceFiles}){
 const {makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js');
 const {services}=await load('tests/native/helpers/session-fixture.js');
 const {NativeGenerationHost}=await load('src/native/adapters/generation-host.js');
 const {seedGenerationProfiles}=await load('tests/native/helpers/generation-fixture.js');
 const {createHttpGenerationProvider}=await load('src/native/adapters/http-generation-provider.js');
 const {FrontendBridgeService}=await load('src/native/frontend/host-bridge.js');
 const {readContent,validateContent}=await import('./content-check.mjs');
 const content=validateContent(await readContent(),manifest);
 const logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
 const h=await makeTempFsEngine(),svc=services(h),bridge=new FrontendBridgeService();
 let session,host,binding,serial=0,requests=0,failNarrator=false,dropBegin=false,commits=0;
 const rawCommit=svc.core._sessions.commitSnapshot;
 svc.core._sessions.commitSnapshot=async function(...args){commits++;return rawCommit.apply(this,args);};
 const files=Object.fromEntries([...sourceFiles].map(([p,b])=>[p,b.toString('base64')]));
 const index=JSON.parse(sourceFiles.get(manifest.runtime.experience.frontend.entry));
 const descriptor=JSON.parse(sourceFiles.get(index.resources.find(r=>r.id==='bridge').path));
 assert.deepEqual(descriptor.bindings.filter(b=>b.target.domainId).map(b=>b.target.domainId),['roleplay_summary','roleplay_visible']);
 assert(!descriptor.bindings.some(b=>b.target.transactionId||b.target.commandId));
 const coreDir=path.resolve(process.argv[process.argv.indexOf('--core')+1]);
 const config=(await load('webpack.config.js')).default({forceDist:true});
 const publicRoot=path.join(coreDir,'public'),bundles=path.join(coreDir,path.relative(process.cwd(),config.output.path));
 const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 const body=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
 const service=()=>({...svc,generationHost:host,taskBindings:async()=>({narrative:binding,structured:binding})});
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/v1/chat/completions'){
   const b=await body(req);requests++;content.assertSafe(b);let message;
   if(b.tools?.length){const text=b.messages.at(-1)?.content||'';let selection={id:'roleplay.express',input:{method:'say',text:'我愿意看看今天的生活。'}};
    if(text.includes('修补'))selection={id:'roleplay.work',input:{method:'repair'}};
    else if(text.includes('继续生活'))selection={id:'roleplay.close_episode',input:{method:'continue'}};
    else if(text.includes('收束'))selection={id:'roleplay.close_episode',input:{method:'conclude'}};
    const i=logic.transactions.filter(t=>t.intent.expose).findIndex(t=>t.id===selection.id);
    message={content:'',tool_calls:[{id:'p4-action',type:'function',function:{name:b.tools[i].function.name,arguments:JSON.stringify(selection.input)}}]};
   }else if(JSON.stringify(b.messages).includes('Return one bounded local proposal'))message={content:JSON.stringify({decision:'defer',batchId:'world_batch_01',kind:'person',name:'',description:'',parentId:'location.old_ferry',templateId:'neighbour'})};
   else {if(failNarrator){json(res,{},503);return;}message={content:JSON.stringify('河岸的日常仍在继续。你方才的言行已有回应，眼下的境况记在随身记事中。下一步如何，你可以再做决定。')};}
   json(res,{choices:[{message}]});return;
  }
  if(u.pathname==='/compiled'){json(res,{entry:manifest.runtime.experience.frontend.entry,files,sessionId:session.session.sessionId});return;}
  if(u.pathname==='/snapshot'){json(res,{revision:session.revision.revisionId});return;}
  if(u.pathname==='/api/native/session/frontend/open'){const b=await body(req);json(res,await bridge.open(service(),h.handle,session.session.sessionId,b.previous));return;}
  if(u.pathname==='/api/native/session/frontend/request'){
   const b=await body(req),r=await bridge.request(service(),h.handle,b);content.assertSafe(r);
   if(b.method==='action.invoke'&&r.ok){try{session=await svc.core.load(h.handle,session.session.sessionId);}catch{/* Ironman terminal cleanup removes its Session. */}}
   if(dropBegin&&b.bindingId==='begin'&&r.ok){dropBegin=false;res.writeHead(200,{'Content-Type':'application/json'});res.end('{');return;}
   if(!r.ok)console.error('P4 bridge refused',b.bindingId,r.error?.code);
   json(res,r);return;
  }
  if(u.pathname==='/api/native/session/frontend/close'){json(res,{});return;}
  if(u.pathname==='/composer-submit'){
   const b=await body(req);session=await svc.core.appendTimeline(h.handle,session.session.sessionId,{role:'user',content:b.text},{expectedRevisionId:b.revision});
   session=await host.executeTurn(h.handle,{sessionId:session.session.sessionId,revisionId:session.revision.revisionId,invocationId:'p4-composer-'+ ++serial,userInput:b.text,slotBindings:{narrative:binding,structured:binding}});json(res,{});return;
  }
  if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Lives Native P4</title><style>html,body,#surface{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="surface"></div><script type="module" src="/mount.js"></script></body></html>');return;}
  if(u.pathname==='/mount.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await fs.readFile(path.join(root,'tools/roleplay-mount.js'),'utf8'));return;}
  const p=u.pathname==='/atria-script.bundle.js'?path.join(bundles,'atria-script.bundle.js'):path.resolve(publicRoot,'.'+decodeURIComponent(u.pathname));
  if(!p.startsWith(publicRoot+path.sep)&&!p.startsWith(bundles+path.sep))throw Error('Invalid static path');
  res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream'});res.end(await fs.readFile(p));
 }catch(e){console.error('P4 HTTP',req.url,e.message);if(!res.headersSent)json(res,{error:e.message},500);else res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const fresh=async()=>{session=await svc.core.create(h.handle,{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId});session=await svc.core.applyLifecycleCommand(h.handle,session.session.sessionId,{type:'lifecycle',invocationId:'ready',action:{kind:'experience.ready'}},{expectedRevisionId:session.revision.revisionId});};
 const act=async(transactionId,input)=>{session=await host.executeTurn(h.handle,{sessionId:session.session.sessionId,revisionId:session.revision.revisionId,invocationId:'p4-setup-'+ ++serial,userInput:'Local presentation setup',slotBindings:{narrative:binding,structured:binding}},undefined,undefined,{transaction:{transactionId,input}});};
 try{
  await svc.packageInstaller.install(h.handle,archive,{grantedPermissions:['generation']});
  const seeded=await seedGenerationProfiles({...h,endpoint:url+'/v1/chat/completions',roles:['narrator','intent_resolver']});
  host=new NativeGenerationHost({...seeded,sessionCore:svc.core,packageInstaller:svc.packageInstaller,providers:{'provider.openai-compatible':createHttpGenerationProvider()},secretPort:{resolveSecret:async()=> 'local-synthetic-only'}});
  host.queueSimulation=()=>{}; // Focused UI harness; P3 owns the background-delivery evidence.
  binding={scope:'player',runtimeRouteId:seeded.routes[0].runtimeRouteId};
  await fresh();console.error('P4 Native UI',url);
  if(process.argv.includes('--serve'))await new Promise(()=>{});
  const {browserChecks}=await import('./roleplay-browser-check.mjs');
  const result=await browserChecks({load,url,root,getSession:()=>session,fresh,act,getRequests:()=>requests,getCommits:()=>commits,setFailure:v=>{failNarrator=v;},setDropBegin:()=>{dropBegin=true;},appendReadingFixture:async()=>{for(let i=0;i<38;i++)session=await svc.core.appendTimeline(h.handle,session.session.sessionId,{role:'assistant',content:'本地阅读排版样本 '+i+'。'+ '河岸的行人继续往来。'.repeat(40)});}});
  return {phase:4,scope:'actual Native browser / isolated FS / synthetic HTTP provider',requests,...result};
 }finally{bridge.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await h.cleanup();}
}
