import assert from 'node:assert/strict';
import http from 'node:http';
export async function verify({load,native,manifest,archive,sourceFiles}) {
 const {makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js');
 const {services}=await load('tests/native/helpers/session-fixture.js');
 const {NativeGenerationHost}=await load('src/native/adapters/generation-host.js');
 const {seedGenerationProfiles}=await load('tests/native/helpers/generation-fixture.js');
 const {createHttpGenerationProvider}=await load('src/native/adapters/http-generation-provider.js');
 const {projectInformation}=await load('public/shared/native-information-runtime.js');
 const {readContent,validateContent}=await import('./content-check.mjs');
 const {assertShape}=await import('./content-schema.mjs');
 const {validateRoleplay}=await import('./roleplay-schema.mjs');
 const resources=await readContent(),content=validateContent(resources,manifest),data=resources.get('roleplay.foundation').value;
 const h=await makeTempFsEngine(),svc=services(h),logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
 const seen=[],works=[];
 const staticWork=logic.transactions.map(t=>({id:t.id,commands:t.effects.filter(e=>e.kind==='app.command').length+logic.derivedPublications.reduce((n,p)=>n+p.effects.length,0),effects:t.effects.length+logic.derivedPublications.reduce((n,p)=>n+p.effects.length,0)}));
 assert(staticWork.every(w=>w.commands<=24&&w.effects<=32));let selection,failNarrator=false,failTask=false,proposal,base,host,binding,serial=0,commits=0,lastPrepared;
 const rawCommit=svc.core._sessions.commitSnapshot,rawPrepare=svc.core.prepareAuthorityTurn;
 svc.core._sessions.commitSnapshot=async function(...args){commits++;return rawCommit.apply(this,args);};
 svc.core.prepareAuthorityTurn=async function(...args){const result=await rawPrepare.apply(this,args);lastPrepared=result.prepared;works.push(result.prepared.work);return result;};
 const safe=value=>{content.assertSafe(value);const str=JSON.stringify(value);assert(!str.includes('world_batch_') || !str.includes('roleplay_world'),'private domain is not a public binding');};
 const server=http.createServer(async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));seen.push(body);content.assertSafe(body);
   let message;
   if(body.tools?.length){const tools=logic.transactions.filter(t=>t.intent.expose);const index=tools.findIndex(t=>t.id===selection.transactionId);message={content:'',tool_calls:[{id:'first_action',type:'function',function:{name:body.tools[index].function.name,arguments:JSON.stringify(selection.input)}}]};}
   else if(JSON.stringify(body.messages).includes('Return one bounded local proposal')){if(failTask){res.writeHead(503);res.end('{}');return;}message={content:JSON.stringify(proposal)};}
   else if(failNarrator){res.writeHead(503);res.end('{}');return;}
   else message={content:JSON.stringify('The Host-approved outcome is recorded. Further intentions await your decision.')};
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message}]}));
  }catch(e){console.error(e);res.writeHead(500);res.end('{}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const value=(id='roleplay_world',record='main')=>base.states.atri_lifecycle.domains[id]?.records.find(r=>r.id===record)?.value;
 const input=(id='turn-'+ ++serial,text='Act on the current scene.')=>({sessionId:base.session.sessionId,revisionId:base.revision.revisionId,invocationId:id,userInput:text,slotBindings:{narrative:binding,structured:binding}});
 const ordinary={mode:'ordinary',name:'Lin',appearance:'Ink-stained sleeves',residence:'local',livelihood:'craft',attachment:'friend',contact:'rumour',aim:'settle'};
 const traveller={...ordinary,residence:'arrival',livelihood:'letters',attachment:'solo',contact:'demonstration',aim:'belong'};
 const fresh=async choices=>{
  base=await svc.core.create(h.handle,{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId});
  base=await svc.core.applyLifecycleCommand(h.handle,base.session.sessionId,{type:'lifecycle',invocationId:'ready',action:{kind:'experience.ready'}},{expectedRevisionId:base.revision.revisionId});
  const pending=structuredClone(base);const sends=seen.length,count=commits;
  base=await svc.core.beginStory(h.handle,base.session.sessionId,{input:choices,invocationId:'begin',expectedRevisionId:base.revision.revisionId});
  assert.equal(commits,count+1);assert.equal(seen.length,sends);assert.equal(value('roleplay_player').name,choices.name);assert.equal(value().progress.effectiveTurns,0);assert.equal(base.timeline.filter(m=>m.role==='assistant').length,1);
  assert.equal((await svc.core.beginStory(h.handle,pending.session.sessionId,{input:choices,invocationId:'begin',expectedRevisionId:pending.revision.revisionId})).revision.revisionId,base.revision.revisionId);
  for(const key of ['residence','livelihood','contact','aim'])assert.equal(value('roleplay_player').background[key],data.questions.find(q=>q.id===key).options.find(o=>o.id===choices[key]).text);
  return pending;
 };
 const act=async(transactionId,args={},expected='automatic',text)=>{
  const request=input(undefined,text);const before=commits;const priorTurns=value().progress.effectiveTurns;const sends=seen.length;
  base=await host.executeTurn(h.handle,request,undefined,undefined,{transaction:{transactionId,input:args}});
  assert.equal(commits,before+1);assert.equal(lastPrepared.receipt.result.outcome,expected,transactionId);
  assert.equal(value().progress.minutes,base.states.atri_lifecycle.clocks.world);
  assert(value().progress.effectiveTurns-priorTurns<=1);assert.equal(seen.length,sends+1,'typed turn only narrates');
  safe(lastPrepared.receipt);return request;
 };
 try{
  await svc.packageInstaller.install(h.handle,archive,{grantedPermissions:['generation']});
  const seeded=await seedGenerationProfiles({...h,endpoint:'http://127.0.0.1:'+server.address().port+'/v1/chat/completions',roles:['narrator','intent_resolver']});
  host=new NativeGenerationHost({...seeded,sessionCore:svc.core,packageInstaller:svc.packageInstaller,providers:{'provider.openai-compatible':createHttpGenerationProvider()},secretPort:{resolveSecret:async()=> 'local-synthetic-only'}});
  const queueSimulation=host.queueSimulation.bind(host);host.queueSimulation=()=>{}; // Hold only automatic dispatch while testing explicit durable-queue delivery.
  binding={scope:'player',runtimeRouteId:seeded.routes[0].runtimeRouteId};
  await fresh(ordinary);
  assert.equal(value('roleplay_player').location,'location.old_ferry');assert.equal(value().economy.coins,20);assert.equal(value().relation.created,true);assert.equal(value().claim.active,false);
  await act('roleplay.work',{method:'repair'});assert.equal(value().economy.coins,32);
  await fresh(traveller);assert.equal(value('roleplay_player').location,'location.lodging');assert.equal(value().relation.created,false);
  await act('roleplay.work',{method:'copy'});
  const checks=['zero-send atomic/idempotent starts; authored fragments/resources/solo relationship','real work and canonical time'];
  const travel=to=>act('roleplay.travel',{to});
  const talk=(targetId,method='ask_training')=>act('roleplay.talk',{targetId,method,text:'I would like to understand the terms.'});
  const route=async institution=>{
   const i=data.institutions.find(i=>i.id===institution);
   await fresh(institution==='church'?ordinary:traveller);
   await travel(i.place);await talk(institution);
   await act('roleplay.learn',{institution,method:'accept_price',acceptPrice:true},'impossible');assert.equal(value().claim.active,false);
   await act('roleplay.learn',{institution,method:'study',acceptPrice:false});
   await act('roleplay.practice',{institution});assert.equal(value().routes[institution].sourceId,i.carrier);
   await act('roleplay.learn',{institution,method:'accept_price',acceptPrice:false},'impossible');assert.equal(value().claim.active,false);
   await act('roleplay.learn',{institution,method:'accept_price',acceptPrice:true});assert.equal(value().claim.seed,i.seed);assert.equal(value().claim.active,true);
   await act('roleplay.invoke',{targetId:i.carrier});await act('roleplay.invoke',{targetId:i.secondCarrier});assert.equal(value().claim.stage,4);
   const claim=structuredClone(value().claim);await act('roleplay.invoke',{targetId:i.secondCarrier});assert.deepEqual(value().claim,claim,'no repeated growth');
   const coins=value().economy.coins;await act('roleplay.maintain',{method:'keep_price'});assert.equal(value().economy.coins,coins-i.fee);
   await act('roleplay.maintain',{method:'deny_witness'});assert.equal(value().claim.active,false);
   await act('roleplay.invoke',{targetId:i.carrier},'impossible');
   await act('roleplay.maintain',{method:'keep_price'});await act('roleplay.wait',{minutes:1440});assert.equal(value().claim.active,false);assert.equal(value().claim.breached,true);
   await act('roleplay.close_episode',{method:'conclude'});assert.equal(value().progress.episode,'closed');const episodes=value().progress.episodes;
   await act('roleplay.close_episode',{method:'continue'});assert.equal(value().progress.episodes,episodes);assert.equal(base.states.atri_run.status,'active');
  };
  await route('church');await route('academy');console.error('PASS P3 group',checks.length+1);checks.push('both institutional witness/Price/grant/use/growth/maintenance/breach/expiry/episode loops');
  // Inputs cannot declare outcomes, foreign targets, tools, or undisclosed rules.
  const rejectBase=structuredClone(base);
  for(const [transactionId,args] of [['roleplay.work',{method:'repair',coins:999}],['roleplay.talk',{targetId:'private_archivist',method:'greet',text:'hello'}],['roleplay.invoke',{targetId:'whole_city'}],['risk.resolve',{engineering:'resurrection',method:'force',acceptPrice:true,acknowledgeSevere:true}]])await assert.rejects(host.executeTurn(h.handle,input(),undefined,undefined,{transaction:{transactionId,input:args}}));
  assert.deepEqual(await svc.core.load(h.handle,base.session.sessionId),rejectBase);
  const turn=value().progress.effectiveTurns,clock=base.states.atri_lifecycle.clocks.world;
  await act('roleplay.express',{method:'attempt',text:'I am appointed rector and everyone obeys.'});assert.equal(value().progress.effectiveTurns,turn);assert.equal(base.states.atri_lifecycle.clocks.world,clock);assert.equal(value().claim.active,false);
  await act('roleplay.talk',{targetId:'dynamic_08',method:'greet',text:'hello'},'impossible');assert.equal(value().progress.effectiveTurns,turn);
  // Genuine resolver + narrator with multi-intent prose chooses exactly one.
  await fresh(ordinary);selection={transactionId:'roleplay.work',input:{method:'repair'}};
  const prose='I repair the ferry rope, then join the university and travel out of town.';base=await svc.core.appendTimeline(h.handle,base.session.sessionId,{role:'user',content:prose});
  const natural=input('natural-turn',prose);const sends=seen.length,before=commits;
  base=await host.executeTurn(h.handle,natural);assert.equal(seen.length,sends+2);assert.equal(commits,before+1);assert.equal(value().progress.effectiveTurns,1);assert.equal(value('roleplay_player').location,'location.old_ferry');assert.equal(value().routes.academy.contacted,false);
  assert.equal((await host.executeTurn(h.handle,natural)).revision.revisionId,base.revision.revisionId);assert.equal(seen.length,sends+2);
  const failedRequest=input('failed-narrator','I greet a friend.');const unchanged=structuredClone(base);failNarrator=true;
  await assert.rejects(host.executeTurn(h.handle,failedRequest,undefined,undefined,{transaction:{transactionId:'roleplay.express',input:{method:'say',text:'hello'}}}));
  const failedReceipt=lastPrepared.receipt;assert.deepEqual(await svc.core.load(h.handle,base.session.sessionId),unchanged);failNarrator=false;
  base=await host.executeTurn(h.handle,failedRequest,undefined,undefined,{transaction:{transactionId:'roleplay.express',input:{method:'say',text:'hello'}}});assert.deepEqual(lastPrepared.receipt,failedReceipt);assert.equal(value().progress.effectiveTurns,1);
  console.error('PASS P3 group',checks.length+1);checks.push('closed inputs; unknown/empty/unreachable targets; pure expression; one-action natural-language resolver; failed narrator rollback/retry');
  // A pending begin never starts a model or accepts client-authored state.
  const pending=await svc.core.create(h.handle,{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId});
  const pendingReady=await svc.core.applyLifecycleCommand(h.handle,pending.session.sessionId,{type:'lifecycle',invocationId:'ready',action:{kind:'experience.ready'}},{expectedRevisionId:pending.revision.revisionId});
  for(const bad of [{...ordinary,residence:'guest',attachment:'solo'},{...ordinary,name:''},{...ordinary,aim:'become_god'},{...ordinary,initialStateOverlay:{wealth:999}}])await assert.rejects(svc.core.beginStory(h.handle,pending.session.sessionId,{input:bad,invocationId:'invalid',expectedRevisionId:pendingReady.revision.revisionId}));
  assert.deepEqual(await svc.core.load(h.handle,pending.session.sessionId),pendingReady);
  const chosen={...traveller,aim:'explore'};const started=await svc.core.beginStory(h.handle,pending.session.sessionId,{input:chosen,invocationId:'confirmed',expectedRevisionId:pendingReady.revision.revisionId});
  await assert.rejects(svc.core.beginStory(h.handle,pending.session.sessionId,{input:{...chosen,mode:'ironman'},invocationId:'confirmed',expectedRevisionId:pendingReady.revision.revisionId}));assert.equal(started.states.atri_run.mode,'ordinary');
  console.error('PASS P3 group',checks.length+1);checks.push('invalid/contradictory starts remain pending; changed pre-confirmation choice commits; post-confirmation mode is frozen');
  // Dynamic creative input is bounded, scoped and anchored by the actual queue.
  const background=async payload=>{
   proposal=payload;const old=structuredClone(base),count=commits;
   const result=await host.executeLifecycle(h.handle,{sessionId:base.session.sessionId,revisionId:base.revision.revisionId,slotBindings:{structured:binding}});base=result.snapshot;assert.equal(value().progress.effectiveTurns,old.states.atri_lifecycle.domains.roleplay_world.records[0].value.progress.effectiveTurns);assert.deepEqual(base.timeline,old.timeline);return {result,commits:commits-count};
  };
  await fresh(ordinary);
  await act('roleplay.attention',{targetId:'location.old_ferry',method:'follow'});
  for(let n=0;n<4;n++)await act('roleplay.work',{method:'carry'});
  assert.equal(base.states.atri_lifecycle.outbox.filter(i=>i.status==='pending').length,1);
  const queued=base.states.atri_lifecycle.outbox.find(i=>i.status==='pending');assert.equal(queued.input.objects.length,3);assert.equal(queued.input.slotId,'dynamic_01');
  const generated={decision:'introduce',batchId:queued.input.batchId,kind:'affair',name:'A small ferry errand',description:'Help carry one ordinary basket.',parentId:queued.input.parentId,templateId:'short_job'};
  const beforeTask=seen.length;const promoted=await background(generated);assert.equal(promoted.commits,1);assert.equal(seen.length,beforeTask+1);assert.equal(value().dynamic.dynamic_01.known,true);assert.equal(value().dynamic.dynamic_01.sourceBatchId,queued.input.batchId);assert.equal(value().proposal.pending,false);
  const encounter=structuredClone(value().dynamic.dynamic_01);const coins=value().economy.coins;await act('roleplay.help',{targetId:'dynamic_01'});assert.equal(value().economy.coins,coins+8);assert.equal(value().dynamic.dynamic_01.revision,2);
  await act('roleplay.help',{targetId:'dynamic_01'},'impossible');assert.equal(value().economy.coins,coins+8);
  // Save/import preserves both generated identity and real queue/budget state.
  const exported=await svc.saveSystem.exportSession(h.handle,base.session.sessionId);const target=await makeTempFsEngine();
  try{const dest=services(target);await dest.packageInstaller.install(target.handle,archive,{grantedPermissions:['generation']});const imported=await dest.saveSystem.importSave(target.handle,exported.archive);assert.deepEqual(imported.states.atri_lifecycle.domains,base.states.atri_lifecycle.domains);const reopened=await dest.core.load(target.handle,imported.session.sessionId);assert.equal(reopened.states.atri_lifecycle.domains.roleplay_world.records[0].value.dynamic.dynamic_01.id,encounter.id);}finally{await target.cleanup();}
  // Fill every remaining identity through real queued Tasks; reject mismatches,
  // then consume a new window, never recycling a prior slot.
  let invalidChecked=false,templateChecked=false;
  let fillSteps=0;
  while(value().schedule.slot<=8){assert(++fillSteps<24,'bounded slot fill');
   for(let wait=0;!base.states.atri_lifecycle.outbox.some(i=>i.status==='pending');wait++){assert(wait<12,'bounded eligible window');await act('roleplay.work',{method:'carry'});}
   const q=base.states.atri_lifecycle.outbox.find(i=>i.status==='pending');const slot=q.input.slotId;
   if(!invalidChecked){await background({...generated,batchId:'forged',parentId:q.input.parentId});assert.equal(value().dynamic[slot].known,false);invalidChecked=true;continue;}
   if(!templateChecked){await background({...generated,batchId:q.input.batchId,parentId:q.input.parentId,kind:'person'});assert.equal(value().dynamic[slot].known,false);templateChecked=true;continue;}
   const n=value().schedule.slot,template=n%2===0?'neighbour':'workbench',kind=template==='neighbour'?'person':'place';
   await background({decision:'introduce',batchId:q.input.batchId,kind,name:'Local '+n,description:'An ordinary public '+kind,parentId:q.input.parentId,templateId:template});
   assert.equal(value().dynamic[slot].known,true);assert.equal(value().dynamic.dynamic_01.id,encounter.id);assert.equal(value().dynamic.dynamic_01.fulfilled,true);
  }
  assert.equal(Object.values(value().dynamic).filter(e=>e.known).length,8);const allIds=Object.values(value().dynamic).map(e=>e.id);assert.equal(new Set(allIds).size,8);
  for(let n=0;n<5;n++)await act('roleplay.work',{method:'carry'});assert(!base.states.atri_lifecycle.outbox.some(i=>i.status==='pending'));
  const sendsAtFull=seen.length;await background(generated);assert.equal(seen.length,sendsAtFull);
  await act('roleplay.talk',{targetId:'dynamic_02',method:'greet',text:'Hello again.'});
  await act('roleplay.visit_place',{targetId:'dynamic_03',method:'enter'});assert.equal(value('roleplay_player').location,'dynamic_03');await act('roleplay.visit_place',{targetId:'dynamic_03',method:'leave'});assert.equal(value('roleplay_player').location,'location.old_ferry');
  console.error('PASS P3 group',checks.length+1);checks.push('actual bounded Task→private inbox→same-CAS template promotion; invalid batch/kind-template consumed; eight never-reused identities; generated person/place/job interaction; save-container import');
  await fresh(ordinary);for(let n=0;n<4;n++)await act('roleplay.work',{method:'carry'});
  const untrusted=base.states.atri_lifecycle.outbox.find(i=>i.status==='pending');proposal={...generated,batchId:untrusted.input.batchId,parentId:untrusted.input.parentId,claim:{active:true,rule:'Resurrection'}};
  const untrustedBase=structuredClone(base),untrustedSends=seen.length;
  await assert.rejects(host.executeLifecycle(h.handle,{sessionId:base.session.sessionId,revisionId:base.revision.revisionId,slotBindings:{structured:binding}}));
  assert.deepEqual(await svc.core.load(h.handle,base.session.sessionId),untrustedBase);assert.equal(value().claim.active,false);assert.equal(value().dynamic.dynamic_01.known,false);assert.equal(seen.length,untrustedSends+1);
  // Warm delay is eight turns; cold is persisted with no autonomous scan.
  await fresh(traveller);for(let n=0;n<3;n++)await act('roleplay.work',{method:'copy'});assert(!base.states.atri_lifecycle.outbox.some(i=>i.status==='pending'));
  await act('roleplay.work',{method:'copy'});let warm=base.states.atri_lifecycle.outbox.find(i=>i.status==='pending');assert(warm);
  await background({decision:'defer',batchId:warm.input.batchId,kind:'person',name:'',description:'',parentId:warm.input.parentId,templateId:'neighbour'});assert.equal(value().schedule.nextEligibleTurn,12);
  for(let n=0;n<7;n++)await act('roleplay.work',{method:'copy'});assert(!base.states.atri_lifecycle.outbox.some(i=>i.status==='pending'));
  await act('roleplay.attention',{targetId:'location.lodging',method:'leave'});const coldTurn=value().progress.effectiveTurns;assert.equal(value().schedule.nextEligibleTurn,coldTurn+24);
  await act('roleplay.wait',{minutes:1440});assert(!base.states.atri_lifecycle.outbox.some(i=>i.status==='pending'));
  await act('roleplay.attention',{targetId:'location.lodging',method:'follow'});await act('roleplay.work',{method:'copy'});assert(base.states.atri_lifecycle.outbox.some(i=>i.status==='pending'));
  // Actual provider failure consumes two sends in the fixed four-turn window.
  failTask=true;const failureBase=structuredClone(base),failureSends=seen.length;
  await assert.rejects(host.executeLifecycle(h.handle,{sessionId:base.session.sessionId,revisionId:base.revision.revisionId,slotBindings:{structured:binding}}));
  assert.deepEqual(await svc.core.load(h.handle,base.session.sessionId),failureBase);assert.equal(seen.length,failureSends+2);
  failTask=false;await assert.rejects(host.executeLifecycle(h.handle,{sessionId:base.session.sessionId,revisionId:base.revision.revisionId,slotBindings:{structured:binding}}),e=>e.code==='native_generation_budget_exhausted');assert.equal(seen.length,failureSends+2);
  const restorePoint=await svc.saveSystem.manualSave(h.handle,base.session.sessionId);
  await act('roleplay.work',{method:'copy'});const staleSends=seen.length;await background(generated);assert.equal(seen.length,staleSends);assert(!base.states.atri_lifecycle.outbox.some(i=>i.status==='pending'));
  base=await svc.core.restoreSavePoint(h.handle,base.session.sessionId,restorePoint.saveId,{expectedRevisionId:base.revision.revisionId});
  await assert.rejects(host.executeLifecycle(h.handle,{sessionId:base.session.sessionId,revisionId:base.revision.revisionId,slotBindings:{structured:binding}}),e=>e.code==='native_generation_budget_exhausted');assert.equal(seen.length,staleSends);
  console.error('PASS P3 group',checks.length+1);checks.push('hot 4/warm 8/cold 24-and-recontact; one pending; actual two-send background limit; stale cancellation; ordinary restore does not refund');
  await fresh(traveller);for(let n=0;n<3;n++)await act('roleplay.work',{method:'copy'});
  const executeLifecycle=host.executeLifecycle.bind(host);let automaticTask;let notifyAutomatic;
  const automaticBegan=new Promise(resolve=>{notifyAutomatic=resolve;});
  host.executeLifecycle=(...args)=>{automaticTask=executeLifecycle(...args);notifyAutomatic();return automaticTask;};host.queueSimulation=queueSimulation;
  proposal={decision:'introduce',batchId:value().schedule.batchId,kind:'person',name:'A lodging neighbour',description:'An ordinary adult at the public counter.',parentId:'location.lodging',templateId:'neighbour'};
  const autoCommits=commits,autoSends=seen.length;
  await act('roleplay.work',{method:'copy'});await automaticBegan;base=(await automaticTask).snapshot;
  assert.equal(commits,autoCommits+2);assert.equal(seen.length,autoSends+2);assert.equal(value().dynamic.dynamic_01.parentId,'location.lodging');
  host.queueSimulation=()=>{};host.executeLifecycle=executeLifecycle;
  console.error('PASS P3 group',checks.length+1);checks.push('actual Host automatic post-turn dispatch: one foreground CAS then one bounded background CAS');
  // Research without practice produces no institution evidence. Injury/death
  // follow the declared Fortune under a real candidate proof, never model text.
  const riskInput={seed:'claim.seed.unlost_evidence',engineering:'personal_carrier',method:'careful',acceptPrice:true,acknowledgeSevere:false};
  const prepareIllegal=async mode=>{
   await fresh({...ordinary,mode});await travel('location.cathedral');await talk('church');await act('roleplay.learn',{institution:'church',method:'study',acceptPrice:false});await act('roleplay.practice',{institution:'church'});await talk('church','ask_practice');
   await act('roleplay.research',{engineering:'unsupported',text:'Can I resurrect everyone?'});assert.equal(value().pursuit.stage,0);assert.equal(value().claim.active,false);
   await travel('location.old_ferry');await travel('location.signal_house');await act('roleplay.research',{engineering:'personal_carrier',text:'Use my own preserved token.'});assert.equal(value().pursuit.stage,0);
  };
  await prepareIllegal('ordinary');
  await act('risk.resolve',{...riskInput,seed:'claim.seed.name_mismatch'},'impossible');assert.equal(value().claim.active,false);
  const saveAlive=await svc.saveSystem.manualSave(h.handle,base.session.sessionId);let riskOutcomes=new Set();
  for(let n=0;!value().claim.active&&n<24;n++){base=await host.executeTurn(h.handle,input(),undefined,undefined,{transaction:{transactionId:'risk.resolve',input:{...riskInput,engineering:'narrow_condition'}}});riskOutcomes.add(lastPrepared.receipt.result.outcome);}
  assert.equal(value().claim.tradition,'personal');assert.equal(value().claim.engineering,'narrow_condition');
  await act('roleplay.invoke',{targetId:data.illegal.carrier});await travel('location.old_ferry');await act('roleplay.invoke',{targetId:data.illegal.carrier},'impossible');await travel('location.signal_house');
  for(let attempt=0;attempt<24&&base.states.atri_run.status==='active';attempt++){
   if(value().pursuit.stage>=3&&!value().pursuit.assisted)await act('roleplay.petition',{method:'request_supervision'});
   if(value().claim.active)await act('roleplay.maintain',{method:'deny_witness'});
   const args=attempt===0?riskInput:{...riskInput,method:'force',acknowledgeSevere:true};
   const request=input();base=await host.executeTurn(h.handle,request,undefined,undefined,{transaction:{transactionId:'risk.resolve',input:args}});riskOutcomes.add(lastPrepared.receipt.result.outcome);
   if(lastPrepared.receipt.result.outcome==='success')assert.equal(value().claim.tradition,'personal');
  }
  assert.equal(base.states.atri_run.status,'dead');assert(riskOutcomes.has('death'));assert(riskOutcomes.has('failure')||riskOutcomes.has('partial'));
  const dead=base;await assert.rejects(host.executeTurn(h.handle,input(),undefined,undefined,{transaction:{transactionId:'roleplay.express',input:{method:'say',text:'I am alive'}}}));
  base=await svc.core.restoreSavePoint(h.handle,base.session.sessionId,saveAlive.saveId,{expectedRevisionId:dead.revision.revisionId});assert.equal(base.states.atri_run.status,'active');assert.equal(value().claim.active,false);
  // Public practice supplies one identified witness report; deterministic
  // investigation advances only from that evidence and recorded deadlines.
  await travel('location.old_ferry');let probe=input();base=await host.executeTurn(h.handle,probe,undefined,undefined,{transaction:{transactionId:'risk.resolve',input:riskInput}});assert.equal(value().pursuit.sourceId,'ferry_witness_report');assert.equal(value().pursuit.stage,1);
  await act('roleplay.wait',{minutes:60});assert.equal(value().pursuit.stage,2);await act('roleplay.wait',{minutes:60});assert.equal(value().pursuit.stage,3);
  if(value().claim.active)await act('roleplay.maintain',{method:'deny_witness'});
  base=await host.executeTurn(h.handle,input(),undefined,undefined,{transaction:{transactionId:'risk.resolve',input:riskInput}});assert.equal(value().pursuit.repeated,true);
  await act('roleplay.wait',{minutes:120});assert.equal(value().pursuit.stage,4);const restrictedTurns=value().progress.effectiveTurns;await act('roleplay.work',{method:'carry'},'impossible');assert.equal(value().progress.effectiveTurns,restrictedTurns);
  await act('roleplay.petition',{method:'request_supervision'});assert.equal(value().pursuit.stage,5);assert.equal(value().pursuit.sourceId,'ferry_witness_report');
  await prepareIllegal('ironman');const ironId=base.session.sessionId;const ironSave=await svc.saveSystem.manualSave(h.handle,ironId);const resume=await svc.saveSystem.exportSession(h.handle,ironId);assert.equal(native.inspectAtriaSaveContainer(resume.archive).save.schemaVersion,2);
  const resumeTarget=await makeTempFsEngine();try{const dest=services(resumeTarget);await dest.packageInstaller.install(resumeTarget.handle,archive,{grantedPermissions:['generation']});const imported=await dest.saveSystem.importSave(resumeTarget.handle,resume.archive);assert.equal(imported.states.atri_run.mode,'ironman');assert.equal(imported.revision.revisionId,base.revision.revisionId);assert.deepEqual(imported.states.atri_lifecycle.domains,base.states.atri_lifecycle.domains);}finally{await resumeTarget.cleanup();}
  await assert.rejects(svc.core.restoreSavePoint(h.handle,ironId,ironSave.saveId));
  for(let attempt=0;attempt<24&&base.states.atri_run.status==='active';attempt++){
   if(value().pursuit.stage>=3&&!value().pursuit.assisted)await act('roleplay.petition',{method:'request_supervision'});
   if(value().claim.active)await act('roleplay.maintain',{method:'deny_witness'});
   base=await host.executeTurn(h.handle,input(),undefined,undefined,{transaction:{transactionId:'risk.resolve',input:{...riskInput,method:'force',acknowledgeSevere:true}}});
  }
  assert.equal(base.states.atri_run.status,'dead');assert.equal((await svc.core.runStatus(h.handle,ironId)).cleanup,'complete');await assert.rejects(svc.saveSystem.importSave(h.handle,resume.archive));assert.equal(await svc.sessionRepo.get(h.handle,ironId),null);
  console.error('PASS P3 group',checks.length+1);checks.push('bounded personal Claim research/practice; actual rebound/death; source-backed report→verification→summons→repeat-supported detention→supervised remedy; ordinary recovery; ironman rollback refusal/current resume/terminal cleanup');
  for(const view of manifest.runtime.experienceContract.informationRuntime.views)safe(projectInformation(dead,view.id,{purpose:view.exposure[0]}));
  for(const mutate of [d=>d.questions[0].options.push(d.questions[0].options[0]),d=>d.dynamicTemplates[0].wage=999,d=>d.institutions[0].definitionId='institution.unknown',d=>d.illegal.effect='resurrect']){const copy=structuredClone(data);mutate(copy);assert.throws(()=>validateRoleplay(copy,content.all,assertShape));}
  assert(!JSON.stringify(seen).includes('world_proposal'));assert(!JSON.stringify(seen).includes('receive_proposal'));
  return {profile:'open-roleplay',phase:'P3',checks,content:content.metrics,compiled:{transactions:logic.transactions.length,playerPrimitives:logic.transactions.filter(t=>t.intent.expose).length,simulationJobs:manifest.runtime.experienceContract.simulationRuntime.jobs.length,maximumStaticCommands:Math.max(...staticWork.map(w=>w.commands)),maximumStaticEffects:Math.max(...staticWork.map(w=>w.effects))},requests:seen.length,maximumForegroundPreparedWork:Object.fromEntries(['readGrants','appCommands','effects'].map(k=>[k,Math.max(...works.map(w=>w[k]))]))};
 }finally{svc.core._sessions.commitSnapshot=rawCommit;svc.core.prepareAuthorityTurn=rawPrepare;await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await h.cleanup();}
}
