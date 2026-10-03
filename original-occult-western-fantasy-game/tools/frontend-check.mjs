import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {safeDomains,schemaNodes} from './frontend-compile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function verify({load,native,manifest,archive,sourceFiles}){
 const {makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js');
 const {services}=await load('tests/native/helpers/session-fixture.js');
 const {NativeGenerationHost}=await load('src/native/adapters/generation-host.js');
 const {seedGenerationProfiles}=await load('tests/native/helpers/generation-fixture.js');
 const {createHttpGenerationProvider}=await load('src/native/adapters/http-generation-provider.js');
 const {FrontendBridgeService}=await load('src/native/frontend/host-bridge.js');
 const {buildAuthorityObservation}=await load('src/native/authority-transaction.js');
 const {projectInformation,queryInformationGraph}=await load('public/shared/native-information-runtime.js');
 const {readContent,validateContent}=await import('./content-check.mjs');
 const content=validateContent(await readContent(),manifest);
 const safe=v=>content.assertSafe(v);
 const contract=manifest.runtime.experienceContract,logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
 assert.equal(logic.transactions.length,64);assert.equal(logic.derivedPublications[0].reads.length,9);assert.equal(logic.derivedPublications[0].effects.length,15);
 assert.deepEqual(contract.authorityRuntime.intentObservation.viewIds,['player.overview']);
 assert(contract.informationRuntime.graphs.every(g=>g.nodeSource==='investigation.details'));
 for(const id of ['authority-transaction','world-simulation'])assert(contract.capabilities.some(c=>c.id===id&&c.version===1&&c.required));
 const index=JSON.parse(sourceFiles.get(manifest.runtime.experience.frontend.entry));
 const descriptor=JSON.parse(sourceFiles.get(index.resources.find(r=>r.id==='bridge').path));
 assert.equal(descriptor.bindings.filter(b=>b.target.transactionId).length,logic.transactions.filter(t=>t.intent.expose).length);
 assert.deepEqual(descriptor.bindings.filter(b=>b.target.domainId).map(b=>b.target.domainId),[...safeDomains,...['chronology','long_term_stance'].filter(id=>contract.lifecycleRuntime.domains.some(d=>d.id===id))]);
 assert(!descriptor.bindings.some(b=>b.target.resourceId||b.target.commandId));
 const domains=contract.lifecycleRuntime.domains;const budgets={transactions:64,publicationReads:9,publicationCommands:15,evidenceSchema:schemaNodes(domains.find(d=>d.id==='evidence').recordSchema),summarySchema:schemaNodes(domains.find(d=>d.id==='opening_summary_projection').recordSchema),graphSchema:schemaNodes(domains.find(d=>d.id==='investigation_nodes_projection').recordSchema)};
 for(const b of descriptor.bindings){assert(schemaNodes(b.inputSchema)<=256);assert(schemaNodes(b.outputSchema)<=256);}
 const h=await makeTempFsEngine(),svc=services(h),bridge=new FrontendBridgeService();let session,host,binding,fail=false,serial=0,requests=0,lastProof;const work=[],typedRequests=[];let maximumObservationBytes=0;
 const prepare=svc.core.prepareAuthorityTurn;svc.core.prepareAuthorityTurn=async function(...args){const p=await prepare.apply(this,args);lastProof=p.prepared;work.push(p.prepared.work);const observation=buildAuthorityObservation(args[1]);safe(observation);maximumObservationBytes=Math.max(maximumObservationBytes,Buffer.byteLength(JSON.stringify(observation)));assert(maximumObservationBytes<=16384);return p;};
 const packageFiles=Object.fromEntries([...sourceFiles].map(([p,b])=>[p,b.toString('base64')]));
 const getConfig=(await load('webpack.config.js')).default;const coreDir=path.resolve(process.argv[process.argv.indexOf('--core')+1]);
 const bundles=path.join(coreDir,path.relative(process.cwd(),getConfig({forceDist:true}).output.path));
 const publicRoot=path.join(coreDir,'public');
 const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 const body=async req=>{const a=[];for await(const c of req)a.push(c);return JSON.parse(Buffer.concat(a).toString()||'{}');};
 const service=()=>({...svc,generationHost:host,taskBindings:async()=>({narrative:binding,structured:binding})});
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/v1/chat/completions'){const b=await body(req);safe(b);requests++;if(fail){json(res,{},503);return;}const tool=b.tools?.find(t=>JSON.stringify(t.function.parameters).includes('"text"'));
   const message=b.tools?.length?{content:'',tool_calls:[{id:'p8',type:'function',function:{name:tool?.function.name??b.tools[0].function.name,arguments:JSON.stringify({text:'A revisable account based only on acquired evidence.'})}}]}:{content:JSON.stringify(b.response_format?.json_schema?.schema?.type==='object'?{text:'Compare independent provenance. This is advice, not authority.'}:'The declared attempt is recorded. Consult the current record for its result; no hidden cause is established.')};json(res,{choices:[{message}]});return;}
  if(u.pathname==='/compiled'){json(res,{entry:manifest.runtime.experience.frontend.entry,files:packageFiles,sessionId:session.session.sessionId});return;}
  if(u.pathname==='/snapshot'){json(res,{revision:session.revision.revisionId});return;}
  if(u.pathname==='/api/native/session/frontend/open'){const b=await body(req);json(res,await bridge.open(service(),h.handle,session.session.sessionId,b.previous));return;}
  if(u.pathname==='/api/native/session/frontend/request'){const b=await body(req);if(b.method==='action.invoke')typedRequests.push(structuredClone(b));const r=await bridge.request(service(),h.handle,b);if(b.method==='action.invoke'&&r.ok)session=await svc.core.load(h.handle,session.session.sessionId);safe(r);json(res,r);return;}
  if(u.pathname==='/api/native/session/frontend/close'){json(res,{});return;}
  if(u.pathname==='/composer-submit'){const b=await body(req);session=await svc.core.appendTimeline(h.handle,session.session.sessionId,{role:'user',content:b.text},{expectedRevisionId:b.revision});session=await host.executeTurn(h.handle,{sessionId:session.session.sessionId,revisionId:session.revision.revisionId,invocationId:'p8-composer-'+ ++serial,userInput:b.text,slotBindings:{narrative:binding,structured:binding}});json(res,{});return;}
  if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eastbank Native P8 verification</title><style>html,body,#surface{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="surface"></div><script type="module" src="/mount.js"></script></body></html>');return;}
  if(u.pathname==='/mount.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await fs.readFile(path.join(root,'tools/frontend-mount.js'),'utf8'));return;}
  const p=u.pathname==='/atria-script.bundle.js'?path.join(bundles,'atria-script.bundle.js'):path.resolve(publicRoot,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(publicRoot+path.sep)&&!p.startsWith(bundles+path.sep))throw Error('Invalid static path');res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream'});res.end(await fs.readFile(p));
 }catch(e){console.error('HTTP',req.url,e.message);if(!res.headersSent)json(res,{error:e.message},500);else res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  await svc.packageInstaller.install(h.handle,archive,{grantedPermissions:['generation']});
  const seeded=await seedGenerationProfiles({...h,endpoint:url+'/v1/chat/completions',roles:['narrator','intent_resolver']});host=new NativeGenerationHost({...seeded,sessionCore:svc.core,packageInstaller:svc.packageInstaller,providers:{'provider.openai-compatible':createHttpGenerationProvider()},secretPort:{resolveSecret:async()=> 'local-test-only'}});binding={scope:'player',runtimeRouteId:seeded.routes[0].runtimeRouteId};
  session=await svc.core.create(h.handle,{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId});session=await svc.core.applyLifecycleCommand(h.handle,session.session.sessionId,{type:'lifecycle',invocationId:'p8-ready',action:{kind:'experience.ready'}},{expectedRevisionId:session.revision.revisionId});
  console.error('P8 UI URL',url);
  if(process.argv.includes('--serve'))await new Promise(()=>{});
  const {browserChecks}=await import('./frontend-browser-check.mjs');
  const actNative=async(transactionId,input)=>{session=await svc.core.appendTimeline(h.handle,session.session.sessionId,{role:'user',content:'P8 presentation fixture: '+transactionId});const p=await svc.core.prepareAuthorityTurn(h.handle,session,{transactionId,input});assert.equal(p.prepared.receipt.result.outcome,'automatic',transactionId);session=await svc.core.finalizeTurn(h.handle,session.session.sessionId,{invocationId:'p8-native-'+ ++serial,authorityProof:p.proof,envelope:{schemaVersion:1,narrative:'The qualified source or arrangement is recorded.',outcomes:[],diagnostics:[]}},{expectedRevisionId:session.revision.revisionId});};
  const result=await browserChecks({load,url,root,version:manifest.version,getSession:()=>session,actNative,setFailure:v=>{fail=v;},getLastProof:()=>lastProof,getTypedRequests:()=>typedRequests});
  if(process.argv.includes('--phase7-ui-only'))return {scope:'Phase 7 focused diagnostic, not stage acceptance',...result};
  for(const id of ['player.case_graph','reflection.case_graph'])safe(queryInformationGraph(session,id,'main',{purpose:id==='player.case_graph'?'display':'context'}));
  safe(projectInformation(session,'player.overview',{purpose:'display'}));
  const saved=await svc.saveSystem.manualSave(h.handle,session.session.sessionId);const exported=await svc.saveSystem.exportSnapshot(h.handle,session.session.sessionId,saved.saveId);
  const target=await makeTempFsEngine();try{const restoredServices=services(target);await restoredServices.packageInstaller.install(target.handle,archive,{grantedPermissions:['generation']});const restored=await restoredServices.saveSystem.importSave(target.handle,exported.archive);assert.equal(restored.session.packageVersionId,manifest.packageVersionId);assert.deepEqual(restored.states.atri_lifecycle.domains,session.states.atri_lifecycle.domains);const continued=await restoredServices.core.applyLifecycleCommand(target.handle,restored.session.sessionId,{type:'lifecycle',invocationId:'p8-restored-next-day',action:{kind:'clock.advance',commandId:'advance',ticks:1440}},{expectedRevisionId:restored.revision.revisionId});assert(continued.states.atri_lifecycle.domains.claims.records.find(r=>r.id==='main').value.active);assert(continued.states.atri_lifecycle.domains.settlements.records.find(r=>r.id==='main').value.convergence.hearing.filed);}finally{await target.cleanup();}
  if(!contract.lifecycleRuntime.history){const before=structuredClone(session);await assert.rejects(svc.core.prepareAuthorityTurn(h.handle,session,{transactionId:'opening.day',input:{day:31}}));assert.deepEqual(session,before);result.checks.push('bounded v1 day31 request rejects without mutation');}
  result.checks.push('actual exported save container into fresh FS; same immutable version and next-day Claim/Hearing continuation','both declared Graphs and overview privacy');
  return {phase:'P8',budgets,requests,maximumObservationBytes,...result,maximumWork:Object.fromEntries(['readGrants','appCommands','effects'].map(k=>[k,Math.max(0,...work.map(w=>w[k]))]))};
 }finally{bridge.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await h.cleanup();}
}
