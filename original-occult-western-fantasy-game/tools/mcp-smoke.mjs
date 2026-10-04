// Real stdio MCP + real Atria HTTP/Native shell, with owned temporary data only.
// Run with Node 22: node tools/mcp-smoke.mjs --core <checkout> --mcp <atria-mcp>
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const arg=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],name+' is required');return path.resolve(process.argv[i+1]);};
const routePreflightOnly=process.argv.includes('--route-preflight-only');
const core=arg('--core'),mcp=arg('--mcp'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=p=>import(pathToFileURL(path.join(core,p)).href);
const sdk=p=>import(pathToFileURL(path.join(mcp,'node_modules/@modelcontextprotocol/sdk/dist/esm',p)).href);
const {Client}=await sdk('client/index.js'),{StdioClientTransport}=await sdk('client/stdio.js'),{ElicitRequestSchema}=await sdk('types.js');
const {inspectAtriaPackageContainer}=await load('src/native/index.js');
const archive=await fs.readFile(path.join(root,'releases/3.0.0.atria'));
const {manifest,sourceFiles,containerHash}=inspectAtriaPackageContainer(archive);
const logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
const scratch=await fs.mkdtemp(path.join(tmpdir(),'atria-open-lives-mcp-'));
const output=path.join(root,routePreflightOnly?'build/mcp-route-preflight-3.0.0':'build/mcp-3.0.0');await fs.mkdir(output,{recursive:true});
await fs.mkdir(path.join(core,'.artifacts'),{recursive:true});
const artifactDir=await fs.mkdtemp(path.join(core,'.artifacts/open-lives-mcp-'));
const artifactPath=path.relative(core,path.join(artifactDir,'3.0.0.atria')).split(path.sep).join('/');
await fs.writeFile(path.join(core,artifactPath),archive);
const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const origin='http://127.0.0.1:'+port;
const config=path.join(scratch,'config.yaml');await fs.writeFile(config,await fs.readFile(path.join(core,'default/config.yaml')));
const actions=routePreflightOnly?['package.install.review','package.install']:['package.install.review','package.install','work.start','chat.send','session.save','session.restore','session.delete'];
const policy=path.join(scratch,'policy.json');await fs.writeFile(policy,JSON.stringify({version:1,actionIds:actions}));
let client,setup,proxy,provider,runtime,log='',sessionId,requests=0,failNarrator=false,diagnostics=null,routePreflight=null;
const approvals=[],receipts=[],checks=[],captures=[],httpErrors=[];
const sockets=new Set();
const check=s=>{checks.push(s);console.log('PASS '+s);};
const stop=async()=>{if(runtime?.exitCode===null){const stopped=new Promise(r=>runtime.once('exit',r));runtime.kill();await Promise.race([stopped,delay(10000)]);if(runtime.exitCode===null){runtime.kill('SIGKILL');await stopped;}}};
try{
 provider=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const b of req)chunks.push(b);const body=JSON.parse(Buffer.concat(chunks));requests++;
  let message;
  if(body.tools?.length){const text=body.messages.at(-1)?.content||'';const selection=text.includes('修补')?{id:'roleplay.work',input:{method:'repair'}}:{id:'roleplay.express',input:{method:'say',text:'今天暂且如此。'}};
   const i=logic.transactions.filter(t=>t.intent.expose).findIndex(t=>t.id===selection.id);assert(i>=0);
   message={content:'',tool_calls:[{id:'local-mcp-action',type:'function',function:{name:body.tools[i].function.name,arguments:JSON.stringify(selection.input)}}]};
  }else if(JSON.stringify(body.messages).includes('Return one bounded local proposal'))message={content:JSON.stringify({decision:'defer',batchId:'world_batch_01',kind:'person',name:'',description:'',parentId:'location.old_ferry',templateId:'neighbour'})};
  else {if(failNarrator){res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');return;}message={content:JSON.stringify('河岸的日常仍在继续。你方才的言行已有回应，下一步如何，你可以再做决定。')};}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message}]}));
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 runtime=spawn(process.execPath,[path.join(core,'server.js'),'--port='+port,'--dataRoot='+path.join(scratch,'data'),'--configPath='+config,'--browserLaunchEnabled=false','--listen=false','--whitelist=127.0.0.1','--disableCsrf=false'],{cwd:core,stdio:['ignore','pipe','pipe']});
 runtime.stdout.on('data',b=>{log=(log+b).slice(-150000);});runtime.stderr.on('data',b=>{log=(log+b).slice(-150000);});
 const deadline=Date.now()+180000;
 while(true){assert.equal(runtime.exitCode,null,log.slice(-4000));try{if((await fetch(origin+'/csrf-token',{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}assert(Date.now()<deadline,'Atria startup timeout');await delay(500);}
 const {request}=await import(pathToFileURL(path.join(mcp,'node_modules/playwright/index.mjs')).href);setup=await request.newContext();
 const post=async(p,data)=>{const token=await(await setup.get(origin+'/csrf-token')).json();const r=await setup.post(origin+p,{data,headers:{'x-csrf-token':token.token}});try{const v=await r.json();assert(r.ok(),p+': '+JSON.stringify(v));return v;}finally{await r.dispose();}};
 const snapshot=()=>post('/api/native/session/load',{sessionId});
 // Trusted fixture creation uses the same FS authority, exclusively in scratch.
 const {FsEngine}=await load('src/storage/engines/fs-engine.js'),{USER_DIRECTORY_TEMPLATE,DEFAULT_USER}=await load('src/constants.js');
 const dirs=Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([k,v])=>[k,path.join(scratch,'data',DEFAULT_USER.handle,v)]));
 const engine=new FsEngine({directoriesByHandle:handle=>{assert.equal(handle,DEFAULT_USER.handle);return dirs;}});
 const {seedGenerationProfiles}=await load('tests/native/helpers/generation-fixture.js');
 const seeded=await seedGenerationProfiles({engine,handle:DEFAULT_USER.handle,endpoint:'http://127.0.0.1:'+provider.address().port+'/v1/chat/completions',roles:routePreflightOnly?['narrator']:['narrator','intent_resolver']});
 await fs.writeFile(path.join(dirs.root,'secrets.json'),JSON.stringify({api_key_openai:[{id:'p4-synthetic-key',value:'local-synthetic-only',label:'Disposable MCP fixture',active:true}]}));
 const binding={scope:'player',runtimeRouteId:seeded.routes[0].runtimeRouteId},slotBindings={narrative:binding,structured:binding};
 // Onboarding is outside this game's scope; seed its completed flag in the
 // owned temporary account before any test browser is opened.
 await post('/api/settings/patch',{operations:[{op:'add',path:'/firstRun',value:false}]});
 // The proxy adds a trusted fixture navigation bootstrap to the real shell.
 // APIs, static assets, Runtime identity and Native renderer remain production.
 proxy=http.createServer(async(req,res)=>{if(req.url.startsWith('/mcp-game-fixture')){
   const upstream=await fetch(origin+'/');const html=await upstream.text();
   const bootstrap=`<script type="module">try {const end=Date.now()+60000;while(!performance.getEntriesByName('[init] complete').length||!globalThis.Atria?.getContext?.()?.getRequestHeaders||typeof globalThis.Atria?.openNativeSession!=='function'){if(Date.now()>end)throw Error('Atria shell timeout');await new Promise(r=>setTimeout(r,100));}globalThis.Atria.shell?.getLearningCenter?.()?.close();globalThis.Atria.getContext().capabilitySettings.atri_task_bindings={${JSON.stringify(manifest.packageId)}:${JSON.stringify(slotBindings)}};await globalThis.Atria.openNativeSession(${JSON.stringify(sessionId)});globalThis.Atria.shell?.getLearningCenter?.()?.close();document.body.dataset.mcpFixtureReady='true';}catch(e){document.body.dataset.mcpFixtureError=e.message;console.error(e);}</script>`;
   res.writeHead(200,{'Content-Type':'text/html','x-atria-server-boot-id':upstream.headers.get('x-atria-server-boot-id')});res.end(html.replace('</body>',bootstrap+'</body>'));return;
  }
  const upstream=http.request(origin+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port}},r=>{
   if(r.statusCode>=400){let bytes='';r.on('data',b=>{bytes=(bytes+b).slice(0,8192);});r.on('end',()=>{let error;try{error=JSON.parse(bytes).error;}catch{}httpErrors.push({path:req.url.split('?')[0],method:req.method,status:r.statusCode,error});});}
   res.writeHead(r.statusCode,r.headers);r.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
 });
 proxy.on('upgrade',(req,socket,head)=>{
  const upstream=http.request(origin+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port}});
  upstream.on('upgrade',(response,peer,peerHead)=>{
   for(const s of [socket,peer]){sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>s.destroy());}
   socket.write('HTTP/1.1 '+response.statusCode+' '+response.statusMessage+'\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');
   if(peerHead.length)socket.write(peerHead);if(head.length)peer.write(head);socket.pipe(peer);peer.pipe(socket);
  });upstream.on('error',()=>socket.destroy());upstream.end();
 });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const proxyOrigin='http://127.0.0.1:'+proxy.address().port;
 client=new Client({name:'open-lives-disposable-mcp-smoke',version:'1.0.0'},{capabilities:{elicitation:{form:{}}}});
 client.setRequestHandler(ElicitRequestSchema,async req=>{const review=JSON.parse(req.params.message.slice(req.params.message.indexOf('\n')+1));assert.equal(req.params.mode,'form');assert(actions.includes(review.action));approvals.push({action:review.action,binding:review.binding});return {action:'accept',content:{authorize:true,uses:1}};});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcp,'src/cli.js'),'--repo',core,'--url',proxyOrigin,'--policy',policy,'--data-root',path.join(scratch,'data')],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('ATRIA_'))),stderr:'pipe'});
 await client.connect(transport);
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:90000});assert(!r.isError,name+': '+JSON.stringify(r));return r;};
 const json=r=>JSON.parse(r.content.find(c=>c.type==='text').text);
 const read=async(action,input={})=>{const r=json(await call('atri_read',{action,input}));assert.notEqual(r.ok,false,JSON.stringify(r));return r.ok===true?r.data:r;};
 const mutate=async(risk,action,input)=>{const r=json(await call('atri_'+risk,{action,input}));assert.equal(r.receipt.status,'succeeded',JSON.stringify(r));receipts.push(r.receipt);return r;};
 const status=json(await call('atri_status'));assert.equal(status.runtimeSourceMatch,'EXACT');assert.equal(status.provenance.server.mutationGuards,1);assert.equal(status.provenance.server.highRiskGuards,1);
 assert.equal((await client.listTools()).tools.length,18);check('18 real stdio MCP tools; main source EXACT; mutation/high-risk guards enabled');
 const captured=await read('package.artifact.capture',{path:artifactPath});const artifactId=captured.artifactId;
 assert.equal(captured.contentHash,containerHash);const preflight=await read('package.install.preflight',{artifactId});
 const reviewed=await mutate('interact','package.install.review',{artifactId,preflightHash:preflight.preflightHash,grantedPermissions:['generation']});
 await mutate('mutate','package.install',{artifactId,reviewReceiptId:reviewed.receipt.receiptId});
 if(routePreflightOnly){
  const query={packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,slotBindings};
  const before=await read('route.list');assert.deepEqual(before.routes.map(r=>r.role),['role.narrator']);
  const missing=await post('/api/native/generation/task-bindings/preflight',query);
  assert(missing.slots.every(slot=>!slot.error),'Authored purposes should accept the narrator route');
  assert.equal(missing.ready,false);assert.deepEqual(missing.turnRoutes.map(r=>[r.role,r.error]),[['intent_resolver','native_generation_route_missing']]);
  check('Actual 3.0.0 Package rejects narrator-only setup despite complete authored purposes');
  const resolver={...seeded.routes[0],runtimeRouteId:'route_'+crypto.randomUUID().replaceAll('-',''),displayName:'Disposable intent resolver',role:'role.intent_resolver'};
  await seeded.persistence.saveRuntimeRoute(DEFAULT_USER.handle,resolver);
  const after=await read('route.list');assert.deepEqual(after.routes.map(r=>r.role).sort(),['role.intent_resolver','role.narrator']);
  const ready=await post('/api/native/generation/task-bindings/preflight',query);assert.equal(ready.ready,true);assert(ready.turnRoutes.every(r=>!r.error));
  routePreflight={missing,ready};
  assert.equal(requests,0);check('Adding the exact role clears readiness with zero provider calls and no Session');
 }else{
 const started=await mutate('mutate','work.start',{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId,displayTitle:'MCP local Open Lives'});
 sessionId=started.receipt.created.find(item=>item.kind==='session').id;check('MCP captures exact released 3.0.0 bytes, reviews permission, installs and starts Work');
 let base=await snapshot();
 base=await post('/api/native/session/command',{sessionId,expectedRevisionId:base.revision.revisionId,command:{type:'lifecycle',invocationId:'mcp-fixture-ready',action:{kind:'experience.ready'}}});
 const sendsBefore=requests;
 base=await post('/api/native/session/begin',{sessionId,expectedRevisionId:base.revision.revisionId,invocationId:'mcp-fixture-begin',input:{mode:'ordinary',name:'林',appearance:'墨迹留在袖口。',residence:'local',livelihood:'craft',attachment:'friend',contact:'rumour',aim:'settle'}});
 assert.equal(requests,sendsBefore);check('Owned HTTP fixture Ready/begin starts an ordinary life with zero provider sends');
 const value=(s,id='roleplay_summary')=>s.states.atri_lifecycle.domains[id].records.find(r=>r.id==='main').value;
 const send=async(text,id)=>{const before=await snapshot();const r=await mutate('mutate','chat.send',{sessionId,expectedRevisionId:before.revision.revisionId,invocationId:id,userInput:text,slotBindings});
   if(r.result.data.operationId){const end=Date.now()+30000;while(true){const op=await read('generation.status',{operationId:r.result.data.operationId});if(op.status==='completed')break;assert(!['failed','cancelled','stale'].includes(op.status),JSON.stringify(op));assert(Date.now()<end,'Generation timeout');await delay(100);}}
   return snapshot();};
 base=await send('我修补渡口的绳索。','mcp-game-turn-1');assert.equal(value(base).economy.coins,32);assert.equal(value(base).progress.effectiveTurns,1);
 const saved=await mutate('mutate','session.save',{sessionId,expectedRevisionId:base.revision.revisionId,displayName:'MCP before second work'});
 const savedRevision=base.revision.revisionId;base=await send('我再修补一件工具。','mcp-game-turn-2');assert.equal(value(base).economy.coins,44);assert.equal(value(base).progress.effectiveTurns,2);
 const rejected=await client.callTool({name:'atri_mutate',arguments:{action:'chat.send',input:{sessionId,expectedRevisionId:savedRevision,invocationId:'mcp-stale-turn',userInput:'过期请求',slotBindings}}});assert.equal(rejected.isError,true);
 const currentRevision=base.revision.revisionId;assert.equal((await snapshot()).revision.revisionId,currentRevision);
 await mutate('mutate','session.restore',{sessionId,expectedRevisionId:currentRevision,saveId:saved.result.data.saveId});base=await snapshot();assert.equal(value(base).economy.coins,32);assert.equal(value(base).progress.effectiveTurns,1);
 assert((await read('chat.read',{sessionId})).entries?.length>0);check('MCP free text resolves two Native work turns, rejects stale revision and restores exact saved resources');
 const open=async(width,height)=>{await call('atri_browser_open',{path:'/mcp-game-fixture',reload:true,width,height});await call('atri_browser_observe',{operation:'wait',selector:'body[data-mcp-fixture-ready="true"]',timeout:60000});await call('atri_browser_observe',{operation:'wait',selector:'[data-node-id="story"]',timeout:60000});await call('atri_browser_observe',{operation:'wait',selector:'[data-node-id="loading"]',state:'hidden',timeout:60000});};
 for(const [width,height]of [[375,812],[390,844],[844,390],[390,400],[1440,900]]){
  await open(width,height);const observed=json(await call('atri_browser_observe',{selector:'[data-node-id="lives"]'}));assert.deepEqual(observed.viewport,{width,height});
  assert.equal(observed.provenance.runtimeSourceMatch,'EXACT');assert.equal(observed.provenance.browserFreshness,'CURRENT');
  assert(observed.accessibility.includes('Atria 开放生活志')&&observed.accessibility.includes('我修补渡口的绳索。'),'Actual saved game content missing');
  const shot=await call('atri_browser_screenshot');const img=shot.content.find(c=>c.type==='image');const name=`game-${width}x${height}.jpg`;await fs.writeFile(path.join(output,name),Buffer.from(img.data,'base64'));
  await fs.writeFile(path.join(output,`game-${width}x${height}.json`),JSON.stringify(observed,null,2));captures.push({width,height,file:name});
 }
 check('MCP observes real shell-mounted Native game at 375/390 mobile, landscape, reduced-height and desktop viewports');
 diagnostics=json(await call('atri_browser_diagnostics'));assert(!diagnostics.events.some(e=>e.type==='pageerror'||e.type==='http-error'),JSON.stringify(diagnostics));assert.deepEqual(httpErrors,[]);await call('atri_browser_close');
 }
 const summary={coreHead:execFileSync('git',['-C',core,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pluginHead:execFileSync('git',['-C',mcp,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),archiveSha256:containerHash,packageVersionId:manifest.packageVersionId,isolatedData:true,provider:'Local synthetic HTTP; no paid model',requests,checks,captures,approvals,receipts,status,diagnostics,httpErrors,routePreflight,
  limits:routePreflightOnly?['MCP installs and reads routes; owning HTTP preflight is read-only','No Session, browser, real provider or personal configuration touched']:['Desktop Chromium viewports; not Android or physical soft keyboard','Trusted disposable shell bootstrap opens Session; MCP browser performs observation only','Ready/begin fixture uses owning HTTP authority; subsequent install/start/chat/save/restore use real MCP','Deterministic client form approvals test protocol, not human approval UX']};
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log('Evidence: '+output);
}catch(error){await fs.writeFile(path.join(output,'failure.txt'),error.stack+'\n');if(client){for(const tool of ['atri_browser_diagnostics','atri_browser_observe','atri_browser_screenshot'])try{const r=await client.callTool({name:tool,arguments:{}});const img=r.content?.find(c=>c.type==='image');if(img)await fs.writeFile(path.join(output,'failure.jpg'),Buffer.from(img.data,'base64'));else await fs.writeFile(path.join(output,'failure-'+tool+'.json'),JSON.stringify(r,null,2));}catch{}}throw error;
}finally{await client?.close();await setup?.dispose();for(const s of sockets)s.destroy();for(const s of [proxy,provider])if(s){s.closeAllConnections();await new Promise(r=>s.close(r));}await stop();await fs.writeFile(path.join(output,'runtime.log'),log);await fs.rm(artifactDir,{recursive:true,force:true});await fs.rm(scratch,{recursive:true,force:true});}
