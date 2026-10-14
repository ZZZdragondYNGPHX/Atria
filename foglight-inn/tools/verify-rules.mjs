import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from './compile.mjs';
import {cleanup} from './cleanup.mjs';
import {initial,execute,projection} from '../runtime/game.js';
const core=path.resolve(process.argv[process.argv.indexOf('--core')+1]);
const load=p=>import(pathToFileURL(path.join(core,p)).href);
const {makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js');
const {services}=await load('tests/native/helpers/session-fixture.js');
const {prepareAuthorityTurn}=await load('src/native/authority-turn.js');
const f=await compile(core,{ui:false}),h=await makeTempFsEngine(),svc=services(h);
let base,installed,counter=0;const sessions=[];
const state=()=>base.states.atri_lifecycle.domains.fog_game.records[0].value.state;
async function act(kind,target='',detail='',text=''){
 const input={kind,target,detail,text,token:'check-'+ ++counter};
 base=await svc.core.appendTimeline(h.handle,base.session.sessionId,{role:'user',content:kind+':'+target});
 const {proof,prepared}=await prepareAuthorityTurn(svc.core,h.handle,base,installed,{transactionId:'fog.act',input});
 const req={envelope:{schemaVersion:1,narrative:'[模拟旁白] '+prepared.receipt.result.label,outcomes:[],diagnostics:[]},invocationId:input.token,authorityProof:proof};
 const opts={expectedRevisionId:base.revision.revisionId},previous=base;
 base=await svc.core.finalizeTurn(h.handle,base.session.sessionId,req,opts);
 const repeat=await svc.core.finalizeTurn(h.handle,base.session.sessionId,req,opts);assert.equal(repeat.revision.revisionId,base.revision.revisionId);
 assert.notEqual(previous.revision.revisionId,base.revision.revisionId);return state();
}
const ready=async()=>{base=await svc.core.create(h.handle,{packageId:f.manifest.packageId,packageVersionId:f.manifest.packageVersionId,entryPointId:f.manifest.entryPoints[0].entryPointId});sessions.push(base.session.sessionId);base=await svc.core.applyLifecycleCommand(h.handle,base.session.sessionId,{type:'lifecycle',invocationId:'ready-'+ ++counter,action:{kind:'experience.ready'}},{expectedRevisionId:base.revision.revisionId});await act('start','','','小满');};
const waitUntil=async n=>{while(state().spent_ap<n){if(state().ration_pending)await act('ration','warm');await act('wait');}if(state().ration_pending)await act('ration','warm');};
try{
 const built=f.native.buildAtriaPackageContainer({manifest:f.manifest,sourceFiles:f.files,assetPayloads:f.assets});await svc.packageInstaller.install(h.handle,built.archive,{grantedPermissions:['generation']});const opened=await svc.packageInstaller.open(h.handle,f.manifest.packageId,f.manifest.packageVersionId);installed={...opened,entryPoint:opened.manifest.entryPoints[0]};
 for(const route of ['light','harbor','stay']){
  await ready();assert.equal(state().spent_ap,0);const p0=state().stock.parts;
  if(route==='light'){await act('move','lighthouse');assert.equal(state().spent_ap,0);await act('repair','light');await act('repair','light');await act('move','pier');await act('register');await act('move','inn');await act('pack');}
  if(route==='harbor'){await act('move','pier');await act('repair','pier');await act('repair','pier');await act('coordinate');await act('move','inn');await act('pack');}
  await waitUntil(6);assert.equal(state().rations[0],'warm');const savedStock={...state().stock};
  await waitUntil(14);await waitUntil(24);assert.equal(state().spent_ap,24);assert.equal(state().final_plan,'');
  const g=state();assert(projection(g).routes[route]);assert.equal(g.stock.supplies,3);assert.equal(g.stock.fuel,route==='light'?0:1);assert(g.stock.parts<=p0);assert(savedStock.supplies===5);
  const save=await svc.core.createSavePoint(h.handle,base.session.sessionId,{expectedRevisionId:base.revision.revisionId,displayName:'Final '+route});
  await act('final',route);assert.equal(state().final_plan,route);assert.equal(projection(state()).epilogues.length,4);
  base=await svc.core.restoreSavePoint(h.handle,base.session.sessionId,save.saveId,{expectedRevisionId:base.revision.revisionId});assert.equal(state().final_plan,'');assert.equal(state().spent_ap,24);
  await act('final',route);console.log('PASS real Core route, duplicate finalize, final SavePoint restore: '+route);
 }
 await ready();await act('assist','lin','light');assert.equal(state().jobs[0].due,3);assert.equal(state().stock.parts,3);await act('move','pier');await act('register');assert.equal(state().facilities.light,0);await act('move','inn');await act('pack');assert.equal(state().facilities.light,2);assert.equal(state().stock.parts,1);
 await waitUntil(5);await act('wait');assert.equal(state().ration_pending,1);
 const pendingSave=await svc.core.createSavePoint(h.handle,base.session.sessionId,{expectedRevisionId:base.revision.revisionId,displayName:'待配给'});const pending=structuredClone(state());
 assert.throws(()=>execute(state(),{kind:'wait',target:'',detail:'',text:'',token:'invalid'}));await act('ration','emergency');assert.equal(state().stock.supplies,6);
 base=await svc.core.restoreSavePoint(h.handle,base.session.sessionId,pendingSave.saveId,{expectedRevisionId:base.revision.revisionId});assert.deepEqual(state(),pending);assert.equal(state().ration_pending,1);await act('ration','warm');assert.equal(state().stock.supplies,5);
 console.log('PASS assistance delay/reservations and pending ration persisted by real Core SavePoint');
 // Exhaustive cheap checks run the exact same deterministic rule function; they
 // are simulation evidence, separate from the installed-Core checks above.
 let g=initial(),n=0;const run=(kind,target='',detail='')=>g=execute(g,{kind,target,detail,text:kind==='start'?'测试':'',token:'s'+ ++n});run('start');run('assist','lin','light');run('cancelJob','lin','light');assert.equal(g.spent_ap,1);assert.equal(g.stock.parts,3);assert.equal(projection(g).reserved.parts,0);
 while(g.spent_ap<23){if(g.ration_pending)run('ration','emergency');run('wait');}if(g.ration_pending)run('ration','emergency');assert(projection(g).actions.filter(a=>a.kind==='assist').every(a=>!a.enabled));run('wait');assert(projection(g).routes.stay);run('final','stay');assert.equal(g.spent_ap,24);
 console.log('PASS deterministic cancellation, late assistance refusal, emergency safety and final zero-AP decision');
}finally{await cleanup(core,h,svc,sessions);}
