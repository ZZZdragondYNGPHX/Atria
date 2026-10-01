import assert from 'node:assert/strict';
import {schemaNodes} from './frontend-compile.mjs';
import {readContent,validateContent} from './content-check.mjs';

export async function verify({load,native,manifest,sourceFiles,assetPayloads,archive,mode}) {
 const inspected=native.inspectAtriaPackageContainer(archive),contract=manifest.runtime.experienceContract;
 assert.deepEqual(inspected.manifest,native.assertAtriaPackageManifest(manifest));assert.deepEqual(inspected.sourceFiles,sourceFiles);assert.deepEqual(inspected.assets,assetPayloads);
 const logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
 const count=v=>!v||typeof v!=='object'?0:(v.kind==='app.command'?1:0)+Object.values(v).reduce((n,x)=>n+count(x),0);
 const publication=logic.derivedPublications[0];
 const budgets={transactions:logic.transactions.length,publicationReads:publication.reads.length,publicationCommands:publication.effects.length,maximumStaticCommands:Math.max(...logic.transactions.map(t=>count(t)+count(publication)))};
 for(const [name,id]of [['evidenceSchema','evidence'],['summarySchema','opening_summary_projection'],['graphSchema','investigation_nodes_projection']])budgets[name]=schemaNodes(contract.lifecycleRuntime.domains.find(d=>d.id===id).recordSchema);
 let maxFormula=0;const walk=v=>{if(!v||typeof v!=='object')return;for(const key of ['formula','when','enabled'])if(typeof v[key]==='string')maxFormula=Math.max(maxFormula,v[key].length);for(const x of Object.values(v))walk(x);};walk(logic);walk(contract);budgets.maximumFormula=maxFormula;
 assert.deepEqual(budgets,{transactions:64,publicationReads:9,publicationCommands:15,maximumStaticCommands:24,evidenceSchema:248,summarySchema:232,graphSchema:169,maximumFormula:2000});
 assert.deepEqual(contract.authorityRuntime.policy,{maxReadGrants:16,maxWorldEvents:16,maxAppCommands:24,maxEffects:32,maxReceiptBytes:32768});
 assert.deepEqual(contract.authorityRuntime.intentObservation,{viewIds:['player.overview'],maxItems:64,maxBytes:16384});
 assert.deepEqual(contract.simulationRuntime.policy,{maxSteps:3,maxDeliberations:1,maxAdvanceTicks:2880});
 assert(contract.informationRuntime.graphs.every(g=>g.nodeSource==='investigation.details'));
 for(const id of ['authority-transaction','world-simulation'])assert(contract.capabilities.some(c=>c.id===id&&c.version===1&&c.required));
 for(const resource of manifest.resources)assert.deepEqual(resource.origin,{scope:'package',packageId:manifest.packageId,packageVersionId:manifest.packageVersionId});
 const content=validateContent(await readContent(),manifest);
 const {makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js');const {services}=await load('tests/native/helpers/session-fixture.js');const {projectInformation}=await load('public/shared/native-information-runtime.js');
 const h=await makeTempFsEngine();try{
  const svc=services(h);await assert.rejects(svc.packageInstaller.install(h.handle,archive),/permission grant/);await svc.packageInstaller.install(h.handle,archive,{grantedPermissions:['generation']});
  const opened=await svc.packageInstaller.open(h.handle,manifest.packageId,manifest.packageVersionId);assert.deepEqual(opened.manifest,inspected.manifest);
  let session=await svc.core.create(h.handle,{packageId:manifest.packageId,packageVersionId:manifest.packageVersionId,entryPointId:manifest.entryPoints[0].entryPointId});assert.equal(session.states.atri_lifecycle.ready,false);
  session=await svc.core.applyLifecycleCommand(h.handle,session.session.sessionId,{type:'lifecycle',invocationId:'p9-release-ready',action:{kind:'experience.ready'}},{expectedRevisionId:session.revision.revisionId});assert.equal(session.states.atri_lifecycle.ready,true);
  for(const view of contract.informationRuntime.views)content.assertSafe(projectInformation(session,view.id,{purpose:view.exposure[0]}));
  const corrupt=Buffer.from(archive);corrupt[corrupt.length-1]^=1;assert.throws(()=>native.inspectAtriaPackageContainer(corrupt));
  return {phase:'P9-release',mode,version:manifest.version,packageVersionId:manifest.packageVersionId,archiveSha256:inspected.containerHash,archiveBytes:archive.length,compiledSourceBytes:[...sourceFiles.values()].reduce((n,b)=>n+b.length,0),budgets,data:content.metrics,checks:['Exact saved archive manifest/compiled files/assets match source build','Permission gate, real FS install/reopen, Ready and all five safe Views','Unchanged static/schema/formula/expanded-work policies','Immutable model-resource origins and archive corruption refusal']};
 }finally{await h.cleanup();}
}
