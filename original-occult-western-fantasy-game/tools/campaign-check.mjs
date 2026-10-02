import assert from 'node:assert/strict';

// P9 integration only: every state transition uses the installed Native authority.
export async function campaignChecks(h) {
 const {svc,fsHandle,manifest,archive,load,safe,makeTempFsEngine,services}=h;
 const {readContent}=await import('./content-check.mjs');
 const content=await readContent();
 const {buildAuthorityObservation}=await load('src/native/authority-transaction.js');
 const {queryInformationGraph}=await load('public/shared/native-information-runtime.js');
 await h.fresh();let s=h.session(),serial=0;
 const result={phase:'P9',nativeCommits:0,order:['headline','property','company','burial','accident','railway'],maximumObservationBytes:0,maximumWork:{readGrants:0,appCommands:0,effects:0},checks:[]};
 const value=(state,id)=>state.states.atri_lifecycle.domains[id].records.find(r=>r.id==='main').value;
 const inspect=state=>{const observation=buildAuthorityObservation(state);safe(observation);const bytes=Buffer.byteLength(JSON.stringify(observation));assert(bytes<=16384);result.maximumObservationBytes=Math.max(result.maximumObservationBytes,bytes);for(const g of manifest.runtime.experienceContract.informationRuntime.graphs)safe(queryInformationGraph(state,g.id,'main',{purpose:g.viewId==='player.investigation'?'display':'context'}));};
 const execute=async(core,handle,state,id,input={},expected='automatic',append=true)=>{
  if(append)state=await core.appendTimeline(handle,state.session.sessionId,{role:'user',content:'P9 integrated campaign '+id});
  const p=await core.prepareAuthorityTurn(handle,state,{transactionId:id,input});assert.equal(p.prepared.receipt.result.outcome,expected,id);safe(p.prepared.receipt);
  for(const [k,max]of Object.entries({readGrants:16,appCommands:24,effects:32})){assert(p.prepared.work[k]<=max);result.maximumWork[k]=Math.max(result.maximumWork[k],p.prepared.work[k]);}
  state=await core.finalizeTurn(handle,state.session.sessionId,{invocationId:'p9-campaign-'+ ++serial,authorityProof:p.proof,envelope:{schemaVersion:1,narrative:'The qualified action is recorded.',outcomes:[],diagnostics:[]}},{expectedRevisionId:state.revision.revisionId});result.nativeCommits++;inspect(state);console.error('PASS P9',id);return state;
 };
 const act=async(id,input={},expected)=>{s=await execute(svc.core,fsHandle,s,id,input,expected);};
 for(const [id,input]of [
  ['identity',{name:'Campaign Verifier',pronouns:'they',age:31,appearance:'Work coat'}],['origin',{choice:'origin.clerical_household'}],['prior_life',{choice:'prior_life.legal'}],['faith',{choice:'faith.distanced'}],['anchor',{name:'Rin',relationship:'friend',place:'office'}],['reason',{reason:'Preserve qualified public records.'}],
  ['acquire_mortuary',{method:'inspect_death'}],['acquire_register',{method:'request_old_register'}],['compare',{method:'compare_independent_sources'}],['preserve',{method:'separate_and_witness'}],['seed_unlost_evidence',{seed:'claim.seed.unlost_evidence'}],['consult',{method:'qualified_civic_or_church_consultation'}],['stabilize_unlost_evidence_civic',{tradition:'civic',seed:'claim.seed.unlost_evidence',acceptPrice:true}],['settle_notify_authority',{disposition:'notify_authority'}]
 ])await act('opening.'+id,input);
 const a={property:[['walk_boundary','household_schedule'],'shared_use'],burial:[['compare_carriers','consented_fund_copy'],'dual_recognition'],railway:[['record_perimeter','certified_dispatch'],'seal']};
 const b={company:'coexist',accident:'regulate',headline:'publish_incomplete'};
 for(const key of result.order){
  if(a[key]){
   await act('network.open',{case:key});
   for(const method of a[key][0])await act('network.acquire_'+key,{method});
   await act('network.settle_'+key,{disposition:a[key][1]});
  }else{
   const kit=content.get('cases.signature.'+key).value.items[0];
   await act('convergence.manage',{case:key,operation:'open',disposition:'none'});
   if(s.states.atri_lifecycle.domains.chronology){await act('convergence.manage',{case:key,operation:'prepare',disposition:'none'});assert(value(s,'world_matters').convergence[key].prepared);}
   for(const i of [0,3])await act('convergence.source_'+i%2,{method:kit.runtime.sources[i].method});
   await act('convergence.manage',{case:key,operation:'settle',disposition:b[key]});
  }
 }
 assert(value(s,'opening_summary_projection').convergence.eligible);
 if(s.states.atri_lifecycle.domains.chronology){
  // Phase 1's bounded write consolidation must retain both maintain and release semantics.
  const item=content.get('defs.claims.seeds').value.items.find(a=>a.id==='claim.seed.custody_break');
  for(const operation of ['consult','invest','maintain','invoke','release'])await act('convergence.claim',{item:item.id,rule:item.canon.coreRule,condition:item.canon.condition??item.canon.conditionFamily,primitive:item.canon.primitive,tradition:'civic',operation,acceptPrice:true});
  assert.equal(value(s,'claims').catalog.active,false);assert.equal(value(s,'claims').catalog.applied,false);assert.equal(value(s,'claims').catalog.consulted,false);
 }
 const dims={history:'attributed_public',stability:'preserve_arrangements',justice:'compensation',power:'shared_council',religion:'dual_registry',accountability:'independent_audit'};
 for(const operation of ['petition','examine','settle'])await act('convergence.hearing',{operation,...dims});
 const committed=structuredClone(s);
 assert(value(committed,'settlements').convergence.hearing.filed);
 // Retry Reply forks at the coherent user boundary, not a cosmetic re-narration.
 s=await svc.core.retryReply(fsHandle,s.session.sessionId,{messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId});
 assert.notEqual(s.revision.branchId,committed.revision.branchId);assert.equal(s.timeline.at(-1).role,'user');assert.equal(value(s,'settlements').convergence.hearing.filed,false);
 s=await execute(svc.core,fsHandle,s,'convergence.hearing',{operation:'settle',...dims,history:'protected_archive'},'automatic',false);
 assert.equal(value(s,'settlements').convergence.hearing.history,'protected_archive');
 const old=await svc.core.load(fsHandle,s.session.sessionId,{revisionId:committed.revision.revisionId});assert.deepEqual(old.states,committed.states);assert.deepEqual(old.timeline,committed.timeline);
 result.checks.push('One continuous committed campaign: creation, Breach, Claim, opening Settlement, all six interleaved Signatures and six-dimensional Hearing','Actual Retry Reply restores pre-effect authority; alternate execution leaves original committed branch unchanged');
 const save=await svc.saveSystem.manualSave(fsHandle,s.session.sessionId);const exported=await svc.saveSystem.exportSnapshot(fsHandle,s.session.sessionId,save.saveId);
 const target=await makeTempFsEngine();try{
  const next=services(target);await next.packageInstaller.install(target.handle,archive,{grantedPermissions:['generation']});let restored=await next.saveSystem.importSave(target.handle,exported.archive);
  assert.equal(restored.session.packageVersionId,manifest.packageVersionId);assert.deepEqual(restored.states.atri_lifecycle.domains,s.states.atri_lifecycle.domains);
  while(value(restored,'world_matters').day<30){const minutes=Math.min(2880,(30-value(restored,'world_matters').day)*1440);restored=await execute(next.core,target.handle,restored,'opening.wait',{minutes});}
  assert.equal(value(restored,'world_matters').day,30);assert.equal(value(restored,'settlements').convergence.hearing.history,'protected_archive');assert(value(restored,'claims').active);
  if(restored.states.atri_lifecycle.domains.chronology){restored=await execute(next.core,target.handle,restored,'opening.wait',{minutes:1440});assert.equal(value(restored,'world_matters').day,31);assert.deepEqual(value(restored,'continuity'),value(s,'continuity'));}
  else {const before=await next.core.load(target.handle,restored.session.sessionId);await assert.rejects(next.core.prepareAuthorityTurn(target.handle,restored,{transactionId:'opening.wait',input:{minutes:1440}}));assert.deepEqual(await next.core.load(target.handle,restored.session.sessionId),before);}
  inspect(restored);
 }finally{await target.cleanup();}
 result.checks.push(s.states.atri_lifecycle.domains.chronology?'Actual save-container import, preserved Claim/Hearing and Day 31 continuation':'Explicit v1 fixture: save import, bounded day30 and atomic day31 rejection','Player observation and both full-detail Graphs checked after each committed action');return result;
}
