import assert from 'node:assert/strict';
export async function networkChecks(h) {
 const {act,actNative,fresh,create,value,session,load,svc,fsHandle,archive,native,manifest,sourceFiles,safe,bridge,host,binding,queryInformationGraph,projectInformation,makeTempFsEngine,services,freeText}=h;
 const {readContent,validateContent}=await import('./content-check.mjs');const resources=await readContent();
 for(const mutate of [r=>delete r.get('cases.signature.property').value.items[0].runtime,r=>r.get('cases.signature.property').value.items[0].runtime.sources[0].slot='arbitrary',r=>r.get('cases.signature.burial').value.items[0].runtime.sources[1].role='continuity',r=>r.get('cases.signature.railway').value.items[0].runtime.sources[0].dangerous=true,r=>r.get('cases.signature.railway').value.items[0].runtime.actor='actor.missing',r=>delete r.get('cases.patterns.network_a').value.items[0].canon.requiredEvidenceRoles,r=>r.get('cases.signature.property').value.items[0].runtime.sources[0].text='x'.repeat(2049)]){const copy=structuredClone(resources);mutate(copy);assert.throws(()=>validateContent(copy,manifest));}
 const logic=JSON.parse(sourceFiles.get('runtime/logic.json'));
 const result={phase:'P6',orders:[],prepared:0,nativeCommits:0,typed:0,checks:[]};
 const nact=async(id,args={},expected='automatic')=>{await actNative('network.'+id,args,expected);result.nativeCommits++;};
 const network=(id='world_matters')=>value(id,id==='evidence'?'network':'main').network;
 const createNative=async()=>{for(const [id,input]of [['identity',{name:'Lin',pronouns:'they',age:29,appearance:'Work coat'}],['origin',{choice:'origin.clerical_household'}],['prior_life',{choice:'prior_life.legal'}],['faith',{choice:'faith.distanced'}],['anchor',{name:'Rin',relationship:'friend',place:'office'}],['reason',{reason:'Maintain ordinary continuity.'}]])await actNative(id,input);};
 const open=async()=>{await fresh();await createNative();await actNative('acquire_mortuary',{method:'inspect_death'});await actNative('acquire_register',{method:'request_old_register'});await actNative('compare',{method:'compare_independent_sources'});await actNative('preserve',{method:'separate_and_witness'});};
 const selected=['property','burial','railway'];
 const methods={property:['registry_copy','estate_extract','household_schedule','walk_boundary'],burial:['parish_extract','negative_search','consented_fund_copy','compare_carriers'],railway:['record_perimeter','certified_dispatch','enter_loading_line','worker_shift_stubs']};
 const dispositions={property:['shared_use','modern_title','customary_easement','withdraw'],burial:['dual_recognition','church_custody','civil_reburial','withdraw'],railway:['seal','controlled_route','preserve_echo','withdraw']};
 const v=(base,id,record='main')=>base.states.atri_lifecycle.domains[id].records.find(r=>r.id===record)?.value;
 const {prepareAuthorityTransaction,buildAuthorityObservation}=await load('src/native/authority-transaction.js');
 let installed;
 const prepare=async(base,id,input={},expected='automatic')=>{
  const before=structuredClone(base);installed??=await svc.core._openPackage(fsHandle,base.session.packageId,base.session.packageVersionId,base.session.entryPointId);
  const prepared={prepared:await prepareAuthorityTransaction(base,installed,{transactionId:id.includes('.')?id:'network.'+id,input,anchor:buildAuthorityObservation(base).anchor,playerMessageId:base.timeline.at(-1).messageId})};
  assert.deepEqual(base,before,'Preparation never mutates source');assert.equal(prepared.prepared.receipt.result.outcome,expected,id);safe(prepared.prepared.receipt);
  assert(prepared.prepared.work.readGrants<=16);assert(prepared.prepared.work.appCommands<=24);assert(prepared.prepared.work.effects<=32);result.prepared++;result.maximumPreparedWork??={readGrants:0,appCommands:0,effects:0};for(const k of Object.keys(result.maximumPreparedWork))result.maximumPreparedWork[k]=Math.max(result.maximumPreparedWork[k],prepared.prepared.work[k]);
  return {...base,states:prepared.prepared.candidate.states};
 };
 if(!process.argv.includes('--network-state')){
 await fresh();await createNative();await nact('open',{case:'property'},'impossible');assert.equal(network().property.mandate,false);
 await actNative('acquire_mortuary',{method:'inspect_death'});await actNative('acquire_register',{method:'request_old_register'});await actNative('compare',{method:'compare_independent_sources'});await actNative('preserve',{method:'separate_and_witness'});
 }
 // The matrix uses actual Native preparation, not a local substitute evaluator.
 let base=await svc.core.appendTimeline(fsHandle,session().session.sessionId,{role:'user',content:'Network contract permutations'});
 if(process.argv.includes('--network-state')){
  installed=await svc.core._openPackage(fsHandle,base.session.packageId,base.session.packageVersionId,base.session.entryPointId);
  const {prepareLifecycle}=await load('src/native/lifecycle-authority.js');
  const initialized=await prepareLifecycle(base,installed,{kind:'app.command',domainId:'progression',commandId:'breach',recordId:'main',args:{preserved:true,breached:true}});base={...base,states:initialized.states};const ready=await prepareLifecycle(base,installed,{kind:'app.command',domainId:'player_life',commandId:'step_6',recordId:'main',args:{step:6,reason:'Native test baseline',licensed:true}});base={...base,states:ready.states};
 }
 const permutations=[['property','burial','railway'],['property','railway','burial'],['burial','property','railway'],['burial','railway','property'],['railway','property','burial'],['railway','burial','property']];
 for(const order of permutations){let candidate=base;for(const k of order){candidate=await prepare(candidate,'open',{case:k});candidate=await prepare(candidate,'acquire_'+k,{method:methods[k][0]});candidate=await prepare(candidate,'acquire_'+k,{method:methods[k][1]});candidate=await prepare(candidate,'compare',{case:k});}
  for(const k of selected){assert.equal(v(candidate,'world_matters').network[k].mandate,true);assert(v(candidate,'beliefs').network_findings[k]);}
  const nodes=v(candidate,'investigation_nodes_projection','burial');assert(nodes.detail.incomplete);assert.equal(nodes.detail.deliberate_stabilization,false);result.orders.push(order.join('>'));
 }
 let supported=base;
 for(const k of selected){supported=await prepare(supported,'open',{case:k});supported=await prepare(supported,'interview',{case:k});supported=await prepare(supported,'compare',{case:k},'impossible');supported=await prepare(supported,'acquire_'+k,{method:methods[k][0]});if(k!=='railway')supported=await prepare(supported,'acquire_'+k,{method:methods[k][2]});supported=await prepare(supported,'compare',{case:k},'impossible');supported=await prepare(supported,'acquire_'+k,{method:methods[k][1]});
  for(const disposition of dispositions[k]){let end=await prepare(supported,'settle_'+k,{disposition});assert.equal(v(end,'settlements').network[k].disposition,disposition);assert.equal(v(end,'institutional_records').network[k],disposition);assert.equal(v(end,'relations',k).kind,disposition);const ev=structuredClone(v(end,'evidence','network'));end=await prepare(end,'reopen',{case:k});assert.equal(v(end,'settlements').network[k].disposition,disposition);assert.deepEqual(v(end,'evidence','network'),ev);}
 }
 // Alternate role paths and environmental danger are genuinely different.
 let alternate=base;
 for(const k of selected){alternate=await prepare(alternate,'open',{case:k});alternate=await prepare(alternate,'prepare',{case:k});alternate=await prepare(alternate,'acquire_'+k,{method:methods[k][2]});alternate=await prepare(alternate,'acquire_'+k,{method:methods[k][3]});alternate=await prepare(alternate,'compare',{case:k});assert(v(alternate,'beliefs').network_findings[k]);}
 assert.equal(v(alternate,'conditions').rail_injury,false);
 const beforeEvidence=structuredClone(v(alternate,'evidence','network'));
 for(const pair of ['property_burial','property_railway','burial_railway'])alternate=await prepare(alternate,'merge',{pair});
 let graph=queryInformationGraph(alternate,'player.case_graph','property',{purpose:'display'});assert.equal(graph.nodes.length,3);assert.equal(graph.edges.length,3);safe(graph);
 alternate=await prepare(alternate,'split',{pair:'property_burial'});alternate=await prepare(alternate,'split',{pair:'property_railway'});graph=queryInformationGraph(alternate,'player.case_graph','property',{purpose:'display'});assert.equal(graph.edges.length,0);assert.deepEqual(v(alternate,'evidence','network'),beforeEvidence);
 // Exact daily pressure boundaries use the existing Native scheduler, not a
 // test implementation. Late discovery must not reset those occurrences.
 let calendar=base;
 calendar=await prepare(calendar,'opening.wait',{minutes:2880});calendar=await prepare(calendar,'opening.wait',{minutes:1440});
 for(const k of selected)assert.equal(v(calendar,'world_matters').network[k].expired,false);
 for(const [day,k]of [[4,'property'],[5,'burial'],[6,'railway']]){calendar=await prepare(calendar,'opening.wait',{minutes:1440});assert.equal(v(calendar,'world_matters').day,day);assert.equal(v(calendar,'world_matters').network[k].expired,true);}
 let horizon=alternate;while(v(horizon,'world_matters').day<30)horizon=await prepare(horizon,'opening.wait',{minutes:2880});
 if(horizon.states.atri_lifecycle.domains.chronology){const continued=await prepare(horizon,'opening.wait',{minutes:1440});assert(v(continued,'world_matters').day>30);}else{const held=structuredClone(horizon);await assert.rejects(prepare(horizon,'opening.wait',{minutes:1440}));assert.deepEqual(horizon,held);}
 if(process.argv.includes('--network-state'))return {...result,checks:['Native prepared order/routes/dispositions/merge-split matrix; no HTTP or save claims']};
 // Typed live campaign: late discovery, two active supports, injury, settlement,
 // two independent pattern instances, free text equivalence and actual restore.
 await open();await nact('open',{case:'railway'});await nact('acquire_railway',{method:'enter_loading_line'},'costly');assert.equal(value('conditions').rail_injury,true);await nact('care');assert.equal(value('conditions').rail_care,true);assert.equal(value('conditions').rail_injury,true);await nact('acquire_railway',{method:'enter_loading_line'},'costly');assert.equal(value('conditions').rail_care,false);await nact('care');
 await nact('acquire_railway',{method:'worker_shift_stubs'});await nact('compare',{case:'railway'});await nact('settle_railway',{disposition:'seal'});
 await nact('open',{case:'property'});await nact('acquire_property',{method:'walk_boundary'});await nact('acquire_property',{method:'household_schedule'});await nact('settle_property',{disposition:'shared_use'});await nact('property_referral');assert.equal(network('evidence').railway.s1.known,true);
 await nact('open',{case:'burial'});await nact('interview',{case:'burial'});await nact('acquire_burial',{method:'compare_carriers'});await nact('acquire_burial',{method:'consented_fund_copy'});await nact('settle_burial',{disposition:'dual_recognition'});
 await act('network.merge',{pair:'property_burial'});await act('network.merge',{pair:'property_railway'});result.typed+=2;
 const observed=buildAuthorityObservation(session());safe(observed);assert(Buffer.byteLength(JSON.stringify(observed),'utf8')<=16384);for(const k of selected)assert(observed.items.some(i=>i.sourceId==='investigation.nodes'&&i.recordId===k),'Intent sees each acquired Case bundle');
 for(const g of manifest.runtime.experienceContract.informationRuntime.graphs){const graph=queryInformationGraph(session(),g.id,'property',{purpose:g.viewId==='player.investigation'?'display':'context'});assert.equal(graph.nodes.length,3);safe(graph);}
 for(const k of selected)for(const slot of ['p0','p1']){
  await nact('pattern_open',{case:k,slot,claimant:k+' household '+slot});await nact('pattern_reply',{case:k,slot},'impossible');await nact('pattern_request',{case:k,slot});await nact('pattern_reply',{case:k,slot});await nact('pattern_settle',{case:k,slot,disposition:slot==='p0'?'qualified_remedy':'refer_review'});
  assert.equal(network()[k][slot].disposition,slot==='p0'?'qualified_remedy':'refer_review');assert.equal(network()[k][slot].remedy_due,slot==='p0');assert.equal(network()[k][slot].review_due,slot==='p1');assert(network()[k][slot].duty);
 }
 await nact('pattern_open',{case:'property',slot:'p0',claimant:'Replacement'},'impossible');
 const preserved=structuredClone(network('evidence'));await freeText('network.reopen',{case:'railway'});assert.deepEqual(network('evidence'),preserved);assert.equal(network('settlements').railway.disposition,'seal');
 // All three institutions keep concrete arrangements after the passage of time.
 await actNative('wait',{minutes:2880});await actNative('wait',{minutes:2880});await actNative('wait',{minutes:2880});for(const k of selected)assert.equal(network()[k].expired,false);
 const saved=await svc.saveSystem.manualSave(fsHandle,session().session.sessionId);const exported=await svc.saveSystem.exportSnapshot(fsHandle,session().session.sessionId,saved.saveId);
 const target=await makeTempFsEngine();try{const restoredServices=services(target);await restoredServices.packageInstaller.install(target.handle,archive,{grantedPermissions:['generation']});const restored=await restoredServices.saveSystem.importSave(target.handle,exported.archive);assert.deepEqual(restored.states.atri_lifecycle.domains,session().states.atri_lifecycle.domains);const continued=await restoredServices.core.applyLifecycleCommand(target.handle,restored.session.sessionId,{type:'lifecycle',invocationId:'p6-restored-day',action:{kind:'clock.advance',commandId:'advance',ticks:1440}},{expectedRevisionId:restored.revision.revisionId});assert.equal(v(continued,'settlements').network.railway.disposition,'seal');assert.equal(v(continued,'conditions').rail_injury,true);assert.equal(v(continued,'world_matters').network.property.p1.disposition,'refer_review');}finally{await target.cleanup();}
 await open();await actNative('wait',{minutes:2880});await actNative('wait',{minutes:2880});await actNative('wait',{minutes:2880});for(const k of selected)assert.equal(network()[k].expired,true);
 for(const k of selected)await nact('open',{case:k});await nact('acquire_railway',{method:'enter_loading_line'},'impossible');await nact('prepare',{case:'railway'});await nact('acquire_railway',{method:'enter_loading_line'});await nact('acquire_railway',{method:'certified_dispatch'});await nact('settle_railway',{disposition:'controlled_route'});assert.equal(network().railway.expired,true,'Late repair cannot undo the closure event');
 for(const view of manifest.runtime.experienceContract.informationRuntime.views)safe(projectInformation(session(),view.id,{purpose:view.exposure[0]}));
 const invalid=await svc.core.appendTimeline(fsHandle,session().session.sessionId,{role:'user',content:'Invalid network inputs'});
 for(const [id,input] of [['open',{case:'hearing'}],['acquire_property',{method:'secret_estate_truth'}],['pattern_open',{case:'property',slot:'p2',claimant:'X'}],['pattern_open',{case:'property',slot:'p0',claimant:'x'.repeat(65)}],['merge',{pair:'property_burial',deliberate_stabilization:true}]])await assert.rejects(svc.core.prepareAuthorityTurn(fsHandle,invalid,{transactionId:'network.'+id,input}));
 result.checks=['six order permutations through actual Native preparation','same-side/testimony rejection and both route pairs','all twelve dispositions and persistent multi-party consequences','shared graph merge/split without Evidence copies','early hazard, escort, injury care and late closure continuity','six reusable pattern instances with isolated source roles','Native Turn commits plus two typed HTTP merges and free-text one-CAS/retry semantics','actual save-container import and next-day continuation','no completion-count or deliberate/deep revelation','privacy and malformed-input rejection'];
 return result;
}
