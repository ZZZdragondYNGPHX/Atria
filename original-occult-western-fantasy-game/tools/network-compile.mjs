// Compile reviewed Case Kits into existing Core contracts. This module runs only
// at build time. It is not shipped as an evaluator, scheduler or authority.
import { compactOpening } from './opening-layout.mjs';
export function compileNetwork(opening, assets, actorDefinitions) {
 compactOpening(opening);
 const {logic,lifecycle,information}=opening;
 const F=formula=>({formula});
 const S=(maxLength=256,values)=>({type:'string',maxLength,...(values?{enum:values}:{})});
 const B={type:'boolean'};
 const fieldsFrom=(schema,path)=>schema.type==='object'?Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,fieldsFrom(s,path+'.'+k)])):F(path);
 const O=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 const keys=['property','burial','railway'];
 const kits=keys.map(key=>assets.find(a=>a.runtime.key===key));
 const domain=id=>lifecycle.domains.find(d=>d.id===id);
 const read=(id,domainId,fields,recordId='main')=>({id,domainId,recordId,fields});
 const command=(id,cid,properties,assign)=>domain(id).commands.push({id:cid,argsSchema:O(properties),assign,event:id+'.'+cid});
 const effect=(domainId,commandId,args={},recordId='main',when)=>({kind:'app.command',domainId,commandId,recordId,args,...(when?{when}:{})});
 function extend(id,key,schema,initial){const d=domain(id);d.recordSchema.properties[key]=schema;d.recordSchema.required.push(key);d.initial[key]=initial;d.commands.find(c=>c.id==='bootstrap').assign[key]=structuredClone(initial);}
 function put(id,cid,path,value,schema,recordId='main',when){command(id,cid,{value:schema},{[path]:F('args.value')});return effect(id,cid,{value},recordId,when);}
 const E=O({id:S(64),text:S(512),issuer:S(96),kind:S(32),known:B,verified:B});
 const blank={id:'',text:'',issuer:'',kind:'',known:false,verified:false};
 const slots=['s0','s1','s2','s3','p0_request','p0_reply','p1_request','p1_reply'];
 const CaseEvidence=O(Object.fromEntries(slots.map(s=>[s,E])));
 const blankCase=Object.fromEntries(slots.map(s=>[s,structuredClone(blank)]));
 const NetworkEvidence=O(Object.fromEntries(keys.map(k=>[k,CaseEvidence])));
 extend('evidence','network',NetworkEvidence,Object.fromEntries(keys.map(k=>[k,structuredClone(blankCase)])));
 lifecycle.automations.push({id:'evidence.network.bootstrap',scopeId:'world',trigger:{kind:'experience.ready'},action:{kind:'app.command',domainId:'evidence',commandId:'bootstrap',recordId:'network',args:{}},maxCatchUp:1});
 const Pattern=O({opened:B,label:S(64),disposition:S(32),duty:S(256),responsible:S(96),remedy_due:B,review_due:B}), pattern={opened:false,label:'',disposition:'none',duty:'',responsible:'',remedy_due:false,review_due:false};
 const Procedure=O({mandate:B,secured:B,expired:B,protected:B,p0:Pattern,p1:Pattern});
 const procedures=Object.fromEntries(keys.map(k=>[k,{mandate:false,secured:false,expired:false,protected:false,p0:structuredClone(pattern),p1:structuredClone(pattern)}]));
 const Link=O({from:S(64),to:S(64)});
 const Network=O({...Object.fromEntries(keys.map(k=>[k,Procedure])),property_burial:Link,property_railway:Link,burial_railway:Link});
 extend('world_matters','network',Network,{...procedures,property_burial:{from:'',to:''},property_railway:{from:'',to:''},burial_railway:{from:'',to:''}});
 const Settlement=O(Object.fromEntries(['disposition','assertion','accepted_by','changed','unresolved','benefit','cost'].map(k=>[k,S(512)])));
 const emptySettlement={disposition:'none',assertion:'No arrangement recorded.',accepted_by:'none',changed:'none',unresolved:'No historical conclusion.',benefit:'none',cost:'none'};
 extend('settlements','network',O(Object.fromEntries(keys.map(k=>[k,Settlement]))),Object.fromEntries(keys.map(k=>[k,structuredClone(emptySettlement)])));
 extend('institutional_records','network',O(Object.fromEntries(keys.map(k=>[k,S(32)]))),Object.fromEntries(keys.map(k=>[k,'none'])));
 for(const field of ['network_testimony','network_findings'])extend('beliefs',field,O(Object.fromEntries(keys.map(k=>[k,S(512)]))),Object.fromEntries(keys.map(k=>[k,''])));
 extend('conditions','rail_injury',B,false);
 extend('conditions','rail_care',B,false);
 // Deadlines are part of the existing deterministic calendar step: no extra
 // polling jobs/read amplification and no late-discovery rewind.
 const daily=domain('world_matters').commands.find(c=>c.id==='day');
 for(const a of kits){const k=a.runtime.key;daily.assign['network.'+k+'.expired']=F('world.network.'+k+'.expired || (world.day + 1 >= '+a.runtime.dueDay+' && !world.network.'+k+'.protected)');}
 const WM=read('wm','world_matters',['day','network']);
 const EV=read('ev','evidence',['network'],'network');
 const READY=read('ready','progression',['breached']);
 const ST=read('settled','settlements',['network']);
 const prepared=k=>'reads.wm.network.'+k+'.mandate';
 const pair=(k,root='reads.ev.network')=>'('+root+'.'+k+'.s0.known || '+root+'.'+k+'.s2.known) && ('+root+'.'+k+'.s1.known || '+root+'.'+k+'.s3.known)';
 const choose=k=>'args.case == "'+k+'"';
 const chosen=condition=>keys.map(k=>'('+choose(k)+' && '+condition(k)+')').join(' || ');
 const caseArg={case:S(16,keys)};
 const tx=(id,properties,reads,allowed,effects,notice,minutes=0)=>{
  const t={id:'network.'+id,verb:'network_'+id,inputSchema:O(properties),intent:{expose:true,description:notice},reads,validators:[],resolution:{kind:'deterministic',cases:[{id:'impossible',when:'!('+allowed+')',outcome:'impossible'}],fallback:'automatic'},effects:[{kind:'world.event',type:'OpeningAction',payload:{verb:'network.'+id,outcome:F('resolution.outcome')}},...effects.map(e=>({...e,when:'resolution.outcome != "impossible"'+(e.when?' && ('+e.when+')':'')})),...(minutes?[{kind:'clock.advance',commandId:'advance',ticks:minutes,when:'resolution.outcome != "impossible"'}]:[])],derivedPublications:['opening.publish'],receipt:{schema:O({verb:S(64),outcome:S(32),notice:S(1024)}),projection:{verb:'network.'+id,outcome:F('resolution.outcome'),notice},maxBytes:2048}};
  logic.transactions.push(t);return t;
 };
 command('player_matters','network_open',{text:S(512)},{text:F('args.text'),status:'open',case_state:'active'});
 // Existing player_matters text is bounded at 256, so authored entry summaries
 // are explicitly checked below rather than weakening its schema.
 command('player_matters','network_close',{}, {status:'closed',case_state:'settled'});
 command('player_matters','network_reopen',{}, {status:'open',case_state:'reopened'});
 const openEffects=[];
 for(const a of kits){const k=a.runtime.key,actor=actorDefinitions.find(x=>x.id===a.runtime.actor);if(a.perspective.publicDescription.length>256)throw new Error('Case entry too long');
  openEffects.push(put('world_matters','mandate_'+k,'network.'+k+'.mandate',true,B,'main',choose(k)),effect('player_matters','network_open',{text:a.perspective.publicDescription},k,choose(k)));
  command('entities','network_'+k,{}, {name:actor.name,alive:true,role:actor.canon.role,location:a.runtime.location,history:'Met through a consented civil inquiry; private motives and memories are not disclosed.'});
  openEffects.push(effect('entities','network_'+k,{},a.runtime.actor.replaceAll('.','_'),choose(k)));
 }
 tx('open',caseArg,[READY,WM],'reads.ready.breached && ('+chosen(k=>'!'+prepared(k))+')',openEffects,'Discover a consented mandate after the opening Breach. Property, burial and railway inquiries are available in any order. Deadlines do not restart.');
 tx('prepare',caseArg,[WM],chosen(prepared),keys.map(k=>put('world_matters','secure_'+k,'network.'+k+'.secured',true,B,'main',choose(k))),'Arrange consent, escort and carrier protection. Railway precautions prevent avoidable inspection Injury, but do not erase earlier Injury.',10);
 for(const a of kits){const k=a.runtime.key;const effects=a.runtime.sources.map(s=>put('evidence','network_'+s.id,'network.'+k+'.'+s.slot,{id:s.id,text:s.text,issuer:s.issuer,kind:s.kind,known:true,verified:true},E,'network','args.method == '+JSON.stringify(s.method)));
  if(k==='railway'){command('conditions','rail_injury',{}, {rail_injury:true,rail_care:false});effects.push(effect('conditions','rail_injury',{},'main','args.method == "enter_loading_line" && !reads.wm.network.railway.secured'));}
  const access=prepared(k)+(k==='railway'?' && (args.method != "enter_loading_line" || !reads.wm.network.railway.expired || reads.wm.network.railway.secured)':'');
  const t=tx('acquire_'+k,{method:S(40,a.runtime.sources.map(s=>s.method))},[WM],access,effects,'Acquire an authorized '+k+' source by the chosen method. Provenance and custody are verified, not a universal causal theory. Inner railway entry without preparation has a known Injury cost, not a Fortune roll. Closed inner entry requires an escort; perimeter/worker routes remain open.',10);
  if(k==='railway')t.resolution.cases.push({id:'known_hazard',when:'args.method == "enter_loading_line" && !reads.wm.network.railway.secured',outcome:'costly'});
 }
 tx('interview',caseArg,[WM],chosen(prepared),kits.map(a=>put('beliefs','network_testimony_'+a.runtime.key,'network_testimony.'+a.runtime.key,a.runtime.testimony,S(512),'main',choose(a.runtime.key))),'Record consented attributed testimony. Community Memory is not Civil Truth; a statement cannot substitute for an independent documentary or physical source.',10);
 tx('compare',caseArg,[WM,EV],chosen(k=>prepared(k)+' && ('+pair(k)+')'),kits.map(a=>put('beliefs','network_finding_'+a.runtime.key,'network_findings.'+a.runtime.key,'Finding from acquired independent roles: '+a.canon.eastbankContribution+' This does not establish the deep cause.',S(512),'main',choose(a.runtime.key))),'Compare independently acquired support roles. Duplicate same-side records and testimony alone cannot satisfy this verification. No completion-count revelation.');
 for(const a of kits){const k=a.runtime.key;const effects=[];
  for(const s of a.runtime.dispositions)effects.push(put('settlements','network_'+k+'_'+s.id,'network.'+k,{disposition:s.id,assertion:'Qualified '+a.name+' disposition; not historical Truth.',accepted_by:s.acceptedBy,changed:s.changed,unresolved:'Deep cause and excluded rights remain open to investigation.',benefit:s.benefit,cost:s.cost},Settlement,'main','args.disposition == '+JSON.stringify(s.id)));
  effects.push(put('institutional_records','network_'+k,'network.'+k,F('args.disposition'),S(32)),effect('player_matters','network_close',{},k));
  command('world_matters','protect_'+k,{protect:B},{['network.'+k+'.protected']:F('args.protect')});
  effects.push(effect('world_matters','protect_'+k,{protect:F('args.disposition != "withdraw"')}));
  command('relations','network_'+k,{disposition:S(32,a.runtime.dispositions.map(s=>s.id)),maintained:B},{text:'Current multi-party arrangement is recorded in the corresponding Settlement; previous commitments remain in the journal.',kind:F('args.disposition'),maintained:F('args.maintained')});
  effects.push(effect('relations','network_'+k,{disposition:F('args.disposition'),maintained:F('args.disposition != "withdraw"')},k));
  tx('settle_'+k,{disposition:S(32,a.runtime.dispositions.map(s=>s.id))},[WM,EV],prepared(k)+' && (args.disposition == "withdraw" || ('+pair(k)+'))',effects,'Commit one qualified '+k+' arrangement across the relevant institutions. Evidence is not erased, past deadline events are not undone, and another inquiry may reopen.',10);
 }
 const dispatch=kits.find(a=>a.runtime.key==='railway').runtime.sources.find(s=>s.id==='railway_closure');
 tx('property_referral',{},[WM,ST],prepared('railway')+' && reads.settled.network.property.disposition == "shared_use"',[effect('evidence','network_railway_closure',{value:{id:dispatch.id,text:dispatch.text,issuer:dispatch.issuer,kind:dispatch.kind,known:true,verified:true}},'network')],'The recorded property shared-use arrangement supplies an expedited rail-dispatch referral. It grants a certified copy, not inner-yard safety or an institutional office.');
 tx('reopen',caseArg,[WM],chosen(prepared),keys.map(k=>effect('player_matters','network_reopen',{},k,choose(k))),'Reopen a player inquiry without resetting time, previous Settlement, access obligations or shared Evidence.');
 const pairs=['property_burial','property_railway','burial_railway'];
 for(const operation of ['merge','split'])tx(operation,{pair:S(32,pairs)},[WM,EV],pairs.map(p=>{const [a,b]=p.split('_');return '(args.pair == "'+p+'" && '+prepared(a)+' && '+prepared(b)+(operation==='merge'?' && ('+pair(a)+') && ('+pair(b)+')':'')+')';}).join(' || '),pairs.map(p=>put('world_matters',operation+'_'+p,'network.'+p,operation==='merge'?{from:p.split('_')[0],to:p.split('_')[1]}:{from:'',to:''},Link,'main','args.pair == "'+p+'"')),operation==='merge'?'Link acquired cross-case supports into a shared inquiry: old ferry households, address lines and transport codes. This is a revisable investigative association, not proof of common cause or merged Evidence ownership.':'Split the linked inquiry; retain all world Evidence, dispositions and institutional records.');
 tx('care',{},[read('injury','conditions',['rail_injury'])],'reads.injury.rail_injury',[put('conditions','rail_care','rail_care',true,B)],'Receive ordinary assessment and wound care. Treatment is recorded but does not instantly erase a persistent Injury.',30);
 // Reusable professional patterns: two fixed independent instance slots per
 // family. Bounded claimant labels cannot invent canon or power.
 const patternArgs={...caseArg,slot:S(2,['p0','p1'])};
 const pe=[],ac=[],se=[];
 const patAllowed=fn=>keys.flatMap(k=>['p0','p1'].map(s=>'('+choose(k)+' && args.slot == "'+s+'" && '+fn(k,s)+')')).join(' || ');
 for(const k of keys)for(const s of ['p0','p1']){
  const cond=choose(k)+' && args.slot == "'+s+'"';
  pe.push(put('world_matters','pattern_'+k+'_'+s,'network.'+k+'.'+s,{opened:true,label:F('args.claimant'),disposition:'none',duty:{property:'Provide a qualified occupancy/relocation remedy without erasing the competing title.',burial:'Maintain a witnessed carrier and deliver the requested recognition or custody certificate.',railway:'Provide an injury-claim assessment and safety response without deciding the disaster cause.'}[k],responsible:{property:'Title desk and housing liaison',burial:'Parish and civic burial desk',railway:'Railway claims desk and worker steward'}[k],remedy_due:false,review_due:false},Pattern,'main',cond));
  for(const role of ['request','reply'])ac.push(put('evidence','pattern_'+k+'_'+s+'_'+role,'network.'+k+'.'+s+'_'+role,{id:k+'_'+s+'_'+role,text:role==='request'?'Consented claimant submission documents the concrete '+k+' remedy sought. It is not a judgment.':'The responsible custodian accepts a bounded remedy obligation or review of the filed duty; historical cause is not adjudicated.',issuer:role==='request'?'Consenting claimant and civil verifier':'Authorized institutional response',kind:'record',known:true,verified:true},E,'network',cond+' && args.role == "'+role+'"'));
  const path='network.'+k+'.'+s;
  command('world_matters','pattern_settle_'+k+'_'+s,{disposition:S(32),remedy:B,review:B},{[path+'.disposition']:F('args.disposition'),[path+'.remedy_due']:F('args.remedy'),[path+'.review_due']:F('args.review')});
  se.push(effect('world_matters','pattern_settle_'+k+'_'+s,{disposition:F('args.disposition'),remedy:F('args.disposition == "qualified_remedy"'),review:F('args.disposition == "refer_review"')},'main',cond));
 }
 tx('pattern_open',{...patternArgs,claimant:{...S(64),minLength:1}},[WM,ST],patAllowed((k,s)=>prepared(k)+' && !reads.wm.network.'+k+'.'+s+'.opened && reads.settled.network.'+k+'.disposition != "none" && reads.settled.network.'+k+'.disposition != "withdraw"'),pe,'Open one of two bounded follow-up instances: occupancy remedy, burial recognition petition or industrial injury claim. A claimant label denotes an ordinary consenting applicant, not external Canon.');
 // Twelve statically enumerated acquisition branches are split by role so the
 // global 24-command limit stays intact even before conditions are evaluated.
 for(const role of ['request','reply'])tx('pattern_'+role,patternArgs,[WM,EV],patAllowed((k,s)=>'reads.wm.network.'+k+'.'+s+'.opened'+(role==='reply'?' && reads.ev.network.'+k+'.'+s+'_request.known':'')),ac.filter(e=>e.commandId.endsWith('_'+role)).map(e=>({...e,when:e.when.replace(' && args.role == "'+role+'"','')})),'Acquire the '+role+' for this independent pattern instance. No reply before a claimant request and no cross-slot evidence reuse.');
 tx('pattern_settle',{...patternArgs,disposition:S(32,['qualified_remedy','refer_review','withdraw'])},[WM,EV],patAllowed((k,s)=>'reads.wm.network.'+k+'.'+s+'.opened && (args.disposition == "withdraw" || (reads.ev.network.'+k+'.'+s+'_request.known && reads.ev.network.'+k+'.'+s+'_reply.known))'),se,'Record a qualified remedy, review referral or withdrawal. This creates a continuing professional procedure, not new Eastbank historical proof.');
 // Existing global publication now reads bounded authority aggregates. No hidden
 // Case truth, private motive or unacquired text is used in these expressions.
 const pub=logic.derivedPublications[0];
 pub.reads.find(r=>r.domainId==='world_matters').fields.push('network');
 pub.reads.find(r=>r.domainId==='settlements').fields.push('network');
 pub.reads.find(r=>r.domainId==='beliefs').fields.push('network_testimony','network_findings');
 pub.reads.push(read('network_evidence','evidence',['network'],'network'),read('network_condition','conditions',['rail_injury','rail_care']));
 const detail=O({evidence:CaseEvidence,procedure:Procedure,settlement:Settlement,incomplete:B,rights_depend:B,active_contradiction:B,organized_movement:B,deliberate_stabilization:B,deep_cause:S(32),injured:B,treated:B,deadline:S(512),late:S(512)});
 const node=domain('investigation_nodes_projection');
 // Case bundles provide bounded graph nodes with stable world Evidence IDs in
 // their acquired payload. Unknown slots are empty, never hidden canon nodes.
 const sparseDetail={...detail,required:[]};
 node.recordSchema.properties.detail=sparseDetail;node.recordSchema.required.push('detail');node.initial.detail={};node.commands.find(c=>c.id==='bootstrap').assign.detail={};
 command(node.id,'network_publish',{text:S(256),subject:S(64),provenance:S(96),custody:S(96),verified:B,detail},{text:F('args.text'),subject:F('args.subject'),provenance:F('args.provenance'),custody:F('args.custody'),verified:F('args.verified'),detail:F('args.detail')});
 information.sources.find(s=>s.id==='investigation.nodes').fields.push(['detail']);
 for(const a of kits){const k=a.runtime.key,ev='reads.network_evidence.network',p=pair(k,ev);pub.effects.push(effect(node.id,'network_publish',{text:a.perspective.publicDescription,subject:k,provenance:'Consented inquiry and acquired sources only',custody:'Civil verification inquiry',verified:false,detail:{evidence:fieldsFrom(CaseEvidence,ev+'.'+k),procedure:fieldsFrom(Procedure,'reads.world_matters_main.network.'+k),settlement:fieldsFrom(Settlement,'reads.settlements_main.network.'+k),incomplete:F(k==='burial'?p:'false'),rights_depend:F(k==='property'?p:'false'),active_contradiction:F(k==='property'?ev+'.property.s3.known':k==='railway'?'('+p+')':'false'),organized_movement:F(k==='railway'?p:'false'),deliberate_stabilization:false,deep_cause:'unresolved',injured:F(k==='railway'?'reads.network_condition.rail_injury':'false'),treated:F(k==='railway'?'reads.network_condition.rail_care':'false'),deadline:a.runtime.pressure,late:'Only when procedure.expired is true: '+a.runtime.late}},k,'reads.world_matters_main.network.'+k+'.mandate'));
 }
 // Shared inquiry links are authoritative associations; a split clears their
 // endpoints. The derived Graph is rebuilt from those current associations.
 for(const p of pairs)pub.effects.push(effect('investigation_edges','publish',{from:F('reads.world_matters_main.network.'+p+'.from'),to:F('reads.world_matters_main.network.'+p+'.to'),text:'Revisable association of acquired supports, not proof of a shared ultimate cause.'},p));
 for(const field of ['network_testimony','network_findings']){
  const pid='opening_summary_projection',d=domain(pid);
  d.recordSchema.properties[field]=domain('beliefs').recordSchema.properties[field];d.recordSchema.required.push(field);d.initial[field]=domain('beliefs').initial[field];
  const c=d.commands[0];c.argsSchema=d.recordSchema;c.assign[field]=F('args.'+field);
  for(const e of pub.effects.filter(e=>e.domainId===pid))e.args[field]=fieldsFrom(domain('beliefs').recordSchema.properties[field],'reads.beliefs_main.'+field);
  information.sources.push({id:'player.'+field,kind:'application',scopeId:'session',domainId:pid,semantic:'belief',fields:keys.map(k=>[field,k]),actorField:'actor',statusField:'status',channelField:field==='network_testimony'?'testimony_channel':'channel'});
 }
 for(const v of information.views)v.sources=information.sources.map(s=>s.id);
 opening.bridge.bindings=logic.transactions.filter(t=>t.intent.expose).map(t=>({id:t.id.replaceAll('.','_'),kind:'action',target:{transactionId:t.id},inputSchema:t.inputSchema,outputSchema:{type:"object",properties:{},additionalProperties:false}}));
 opening.budget={publicationReads:pub.reads.length,publicationCommands:pub.effects.length,transactions:logic.transactions.length};
 return opening;
}
