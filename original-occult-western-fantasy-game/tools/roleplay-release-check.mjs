import assert from 'node:assert/strict';
import {ROLEPLAY_VERSION_ID} from './roleplay-compile.mjs';
import {readContent,validateContent} from './content-check.mjs';

export async function verify({load,native,manifest,sourceFiles,assetPayloads,archive,mode}) {
 const inspected=native.inspectAtriaPackageContainer(archive);
 assert.deepEqual(inspected.manifest,native.assertAtriaPackageManifest(manifest));
 for(const [actual,expected]of [[inspected.sourceFiles,sourceFiles],[inspected.assets,assetPayloads]]){
  assert.equal(actual.size,expected.size);
  for(const [id,bytes]of expected)assert(actual.get(id)?.equals(bytes),'Release payload differs: '+id);
 }
 assert.equal(manifest.version,'3.0.0');assert.equal(manifest.packageVersionId,ROLEPLAY_VERSION_ID);
 const contract=manifest.runtime.experienceContract,logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
 const publications=logic.derivedPublications.flatMap(p=>p.effects);
 const budgets={transactions:logic.transactions.length,playerPrimitives:logic.transactions.filter(t=>t.intent.expose).length,simulationJobs:contract.simulationRuntime.jobs.length,
  maximumStaticCommands:Math.max(...logic.transactions.map(t=>[...t.effects,...publications].filter(e=>e.kind==='app.command').length)),
  maximumStaticEffects:Math.max(...logic.transactions.map(t=>t.effects.length+publications.length))};
 assert.deepEqual(budgets,{transactions:19,playerPrimitives:17,simulationJobs:2,maximumStaticCommands:23,maximumStaticEffects:23});
 assert.deepEqual(contract.generationBudget,{schemaVersion:1,resolverAttempts:2,narratorAttempts:2,turnAttempts:4,backgroundAttempts:2,backgroundWindowTurns:4,backgroundPeriodTurns:20,backgroundPeriodAttempts:10,turnCounter:{domainId:'play_progress',recordId:'main',field:'effectiveTurns'}});
 assert.deepEqual(contract.storyStart,{schemaVersion:1,transactionId:'story.begin',narrativeField:'opening'});
 assert.deepEqual(contract.runPolicy,{schemaVersion:1,deathTransactions:['risk.resolve'],deathOutcome:'death'});
 for(const id of ['authority-transaction','world-simulation','story-start','generation-budget','run-policy'])assert(contract.capabilities.some(c=>c.id===id&&c.version===1&&c.required));
 for(const resource of manifest.resources)assert.deepEqual(resource.origin,{scope:'package',packageId:manifest.packageId,packageVersionId:manifest.packageVersionId});
 const index=JSON.parse(sourceFiles.get(manifest.runtime.experience.frontend.entry));
 assert.equal(index.version,3);assert.equal(index.primaryView,'view:main');
 const bridge=JSON.parse(sourceFiles.get(index.resources.find(r=>r.id==='bridge').path));
 assert.equal(bridge.bindings.length,16);
 assert.deepEqual(bridge.bindings.filter(b=>!b.target.service).map(b=>({kind:b.kind,domainId:b.target.domainId})),[{kind:'read',domainId:'roleplay_summary'},{kind:'read',domainId:'roleplay_visible'}]);
 assert(bridge.bindings.filter(b=>b.target.service).every(b=>b.target.service.startsWith('host.')));
 const content=validateContent(await readContent(),manifest);
 const {makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js'),{services}=await load('tests/native/helpers/session-fixture.js');
 const {projectInformation}=await load('public/shared/native-information-runtime.js');
 const h=await makeTempFsEngine();
 try{
  const svc=services(h);
  await assert.rejects(svc.packageInstaller.install(h.handle,archive),/permission grant/);
  await svc.packageInstaller.install(h.handle,archive,{grantedPermissions:['generation']});
  const opened=await svc.packageInstaller.open(h.handle,manifest.packageId,manifest.packageVersionId);
  assert.deepEqual(opened.manifest,inspected.manifest);
  let session=await svc.core.create(h.handle,{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId});
  assert.equal(session.states.atri_lifecycle.ready,false);
  session=await svc.core.applyLifecycleCommand(h.handle,session.session.sessionId,{type:'lifecycle',invocationId:'p5-release-ready',action:{kind:'experience.ready'}},{expectedRevisionId:session.revision.revisionId});
  session=await svc.core.beginStory(h.handle,session.session.sessionId,{input:{mode:'ordinary',name:'Lin',appearance:'Ink-stained sleeves',residence:'local',livelihood:'craft',attachment:'friend',contact:'rumour',aim:'settle'},invocationId:'p5-release-begin',expectedRevisionId:session.revision.revisionId});
  assert.equal(session.states.atri_run.mode,'ordinary');assert.equal(session.states.atri_run.status,'active');
  for(const view of contract.informationRuntime.views)content.assertSafe(projectInformation(session,view.id,{purpose:view.exposure[0]}));
  const corrupt=Buffer.from(archive);corrupt[corrupt.length-1]^=1;
  assert.throws(()=>native.inspectAtriaPackageContainer(corrupt));
  return {phase:5,profile:'open-roleplay-release',mode,version:manifest.version,packageVersionId:manifest.packageVersionId,archiveSha256:inspected.containerHash,archiveBytes:archive.length,compiledSourceBytes:[...sourceFiles.values()].reduce((n,b)=>n+b.length,0),budgets,data:content.metrics,checks:['Exact archive manifest, compiled Native files and Data assets match source','Independent v3 identity, immutable origins and required Core capabilities','Fixed static work and actual-send budget declarations','Native v3 bridge exposes only two public projections and fixed Host services','Permission refusal, real FS install/reopen, Ready and deterministic begin','Disclosure-safe Views and corrupted archive refusal']};
 }finally{await h.cleanup();}
}
