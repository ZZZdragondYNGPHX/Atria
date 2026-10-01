// Build-time physical packing only. Independent Evidence IDs survive inside a bounded
// record; the Host still owns all reads, commands, validation and publication.
export function compactOpening(opening) {
 const {logic,lifecycle,information}=opening;
 const O=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 const F=formula=>({formula});
 const evidence=lifecycle.domains.find(d=>d.id==='evidence');
 const records=['mortuary','insurance','register','police'];
 const oldSchema=structuredClone(evidence.recordSchema), oldInitial=structuredClone(evidence.initial);
 evidence.recordSchema=O(Object.fromEntries(records.map(r=>[r,structuredClone(oldSchema)])));
 evidence.initial=Object.fromEntries(records.map(r=>[r,structuredClone(oldInitial)]));
 for(const c of evidence.commands){
  if(c.id==='bootstrap'){c.assign=structuredClone(evidence.initial);continue;}
  const r=c.id.slice('acquire_'.length);
  c.assign=Object.fromEntries(Object.entries(c.assign).map(([k,v])=>[r+'.'+k,v]));
 }
 lifecycle.automations=lifecycle.automations.filter(a=>a.action.domainId!=='evidence');
 lifecycle.automations.push({id:'evidence.second_death.bootstrap',scopeId:'world',trigger:{kind:'experience.ready'},action:{kind:'app.command',domainId:'evidence',commandId:'bootstrap',recordId:'second_death',args:{}},maxCatchUp:1});
 const publication=logic.derivedPublications[0];
 publication.reads=publication.reads.filter(r=>r.domainId!=='evidence');
 publication.reads.push({id:'opening_evidence',domainId:'evidence',recordId:'second_death',fields:records});
 const rewrite=value=>{
  if(typeof value==='string')return records.reduce((s,r)=>s.replaceAll('reads.evidence_'+r+'.','reads.opening_evidence.'+r+'.'),value);
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
  return value;
 };
 publication.effects=publication.effects.map(rewrite);
 for(const t of logic.transactions){
  for(const e of t.effects)if(e.kind==='app.command'&&e.domainId==='evidence')e.recordId='second_death';
  for(const r of t.reads)if(r.domainId==='evidence'){
   const record=r.recordId;r.recordId='second_death';r.fields=r.fields.map(f=>record+'.'+f);
   const replace=v=>typeof v==='string'?v.replaceAll('reads.'+r.id+'.','reads.'+r.id+'.'+record+'.'):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;
   t.resolution=replace(t.resolution);t.effects=replace(t.effects);
  }
 }
 // One safe summary command replaces six per-domain writes. Discriminators stay
 // top-level because Information uses explicit field names, not inferred paths.
 const ids=['player_status_projection','player_progression_projection','player_epistemic_projection','player_claim_projection','player_settlement_projection','player_obligations_projection'];
 const domains=ids.map(id=>lifecycle.domains.find(d=>d.id===id));
 const props=Object.fromEntries(domains.map(d=>[d.id,d.recordSchema]));
 const initial=Object.fromEntries(domains.map(d=>[d.id,d.initial]));
 const epi=domains.find(d=>d.id==='player_epistemic_projection');
 for(const k of ['actor','status','channel','testimony_status','testimony_channel']){props[k]=epi.recordSchema.properties[k];initial[k]=epi.initial[k];}
 const schema=O(props), id='opening_summary_projection';
 lifecycle.domains=lifecycle.domains.filter(d=>!ids.includes(d.id));
 lifecycle.domains.push({id,scopeId:'session',schemaVersion:1,recordSchema:schema,initial,commands:[{id:'publish',argsSchema:schema,event:id+'.publish',assign:Object.fromEntries(Object.keys(props).map(k=>[k,F('args.'+k)]))}],retention:{maxItems:64,maxLogicalBytes:65536,keepPinned:true,keepReferenced:true}});
 for(const source of information.sources)if(ids.includes(source.domainId)){source.fields=source.fields.map(f=>[source.domainId,...f]);source.domainId=id;}
 const originals=publication.effects.filter(e=>ids.includes(e.domainId));
 const variants=originals.filter(e=>e.domainId==='player_progression_projection');
 publication.effects=publication.effects.filter(e=>!ids.includes(e.domainId));
 for(const variant of variants){
  const args=Object.fromEntries(ids.map(id=>[id,(id===variant.domainId?variant:originals.find(e=>e.domainId===id)).args]));
  for(const k of ['actor','status','channel','testimony_status','testimony_channel'])args[k]=F('reads.beliefs_main.'+k);
  publication.effects.push({kind:'app.command',domainId:id,commandId:'publish',recordId:'main',args,when:variant.when});
 }
 // Graph edges represent the currently selected independent support pair. All
 // acquired source nodes remain available; superseded nodes are not deleted.
 publication.effects=publication.effects.filter(e=>e.domainId!=='investigation_edges');
 for(const [slot,key]of [['current_support','current_source'],['old_support','old_source']])publication.effects.push({kind:'app.command',domainId:'investigation_edges',commandId:'publish',recordId:slot,args:{from:'main',to:F('reads.progression_main.'+key),text:'Current independent support selection; other acquired sources remain world Evidence.'},when:'reads.progression_main.'+key+' != ""'});
 return opening;
}
