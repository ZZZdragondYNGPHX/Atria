import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
export const safeDomains = ['opening_summary_projection','player_matters','investigation_nodes_projection','investigation_edges'];
export const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = maxLength => ({type:'string',maxLength});
const array = (items,maxItems=128) => ({type:'array',items,maxItems});
const bool = {type:'boolean'};
const option = object({id:string(256),label:string(512)});
export const schemaNodes = s => 1 + Object.values(s.properties??{}).reduce((n,v)=>n+schemaNodes(v),0)+(s.items?schemaNodes(s.items):0);
export async function compileInquiry({root,opening,contract,load}) {
 const {fixedHostTarget}=await load('public/shared/native-frontend-host.js');
 const bridge=structuredClone(opening.bridge), empty=object({});
 for(const domainId of safeDomains){
  const domain=opening.lifecycle.domains.find(d=>d.id===domainId);assert(domain);
  const output=object({id:string(64),value:domain.recordSchema});
  assert(schemaNodes(output)<=256,'Frontend read schema limit');
  bridge.bindings.push({id:domainId,kind:'read',target:{domainId},inputSchema:empty,outputSchema:output,collection:{pageSize:64,orderBy:'id'}});
 }
 for(const [id,service,method] of [['messages','conversation','messages'],['session','session','status'],['save','session','save'],['saves','session','saves'],['restore','session','restore'],['composer','composer','get'],['composer_set','composer','set'],['composer_submit','composer','submit'],['generation','conversation','generation'],['cancel','conversation','cancel']]){
  const target={service:'host.'+service,method}, spec=fixedHostTarget(target);
  bridge.bindings.push({id,kind:spec.kind,target,inputSchema:spec.inputSchema,outputSchema:spec.outputSchema,...(spec.collection?{collection:{pageSize:id==='messages'?8:32,orderBy:id==='messages'?'sequence':'saveId'}}:{})});
 }
 for(const [id,taskId] of [['reflection','case.reflection'],['advisor','claim.advisor']]){
  const task=contract.taskRuntime.tasks.find(t=>t.id===taskId);
  bridge.bindings.push({id,kind:'operation',target:{taskId,variantId:'default'},inputSchema:task.inputSchema,outputSchema:task.variants[0].outputSchema});
 }
 const names={identity:'Ordinary identity',origin:'Origin',prior_life:'Prior life',faith:'Faith',anchor:'Living Personal Anchor',reason:'Reason to practice',acquire_mortuary:'Obtain the recent death certificate',acquire_insurance:'Obtain insurance continuity',acquire_register:'Obtain the old civil entry',acquire_police:'Obtain the police custody extract',family:'Speak with Ada Rook',compare:'Compare independent sources',preserve:'Preserve the contradiction',hypothesis:'Write or revise a hypothesis',lead:'Choose an inquiry direction',private_access:'Request restricted archive access',postpone:'Postpone Investiture',consult:'Request a qualified consultation',invoke:'Invoke the formal Claim',test_copy:'Examine the acquired copy',visit:'Keep the Anchor appointment',wait:'Advance time in minutes',day:'Advance to a day',reopen:'Reopen the inquiry',source_0:'Obtain an institutional source',source_1:'Obtain independent support',manage:'Mandates and arrangements',hearing:'Eastbank Hearing',practice:'Professional Patterns',claim:'Supervised Claim catalog'};
 const label = value => names[value]??value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
 const catalog=opening.logic.transactions.filter(t=>t.intent.expose).map(t=>{
  const key=t.id.split('.')[1];let group=t.id.startsWith('network.')?'cases':t.id.startsWith('convergence.')?'cases':'investigation';
  if(['identity','origin','prior_life','faith','anchor','reason'].includes(key))group='creation';
  if(/seed_|stabilize_|^(postpone|consult|invoke|visit|wait|day|claim)$/.test(key))group='identity';
  // Stance is a structured Authority contract; the retained scalar form must not fabricate it.
  return {id:t.id.replaceAll('.','_'),label:label(key),group,fields:Object.entries(t.inputSchema.properties).filter(([name])=>!['stances','history'].includes(name)).map(([name,schema])=>({name,schema,label:label(name)})),notice:t.receipt.projection.notice};
 });
 const definitions=JSON.parse(await fs.readFile(path.join(root,'data/defs.origins.json'),'utf8')).items;
 const captions=Object.fromEntries(definitions.map(a=>[a.id,a.name??a.title??label(a.id.split('.').at(-1))]));
 // Only the same already-public closed catalog vocabulary used by P7; never ship Canon.
 const claimFields=catalog.find(a=>a.id==='convergence_claim').fields;
 const items=claimFields.find(f=>f.name==='item').schema.enum;
 const claimSpecs=[];
 for(const file of ['defs.claims.seeds','defs.claims.archetypes'])for(const item of JSON.parse(await fs.readFile(path.join(root,'data/'+file+'.json'),'utf8')).items){
  if(items.includes(item.id))claimSpecs.push({id:item.id,label:item.name??item.title??label(item.id.split('.').at(-1)),rule:item.canon.coreRule,condition:item.canon.condition??item.canon.conditionFamily,primitive:item.canon.primitive});
 }
 const field=object({label:string(128),value:string(1024),options:array(option,64),visible:bool,select:bool,text:bool,numeric:bool,help:string(256)});
 const row=object({id:string(128),label:string(256),kind:string(64),text:string(8192),source:string(1024),custody:string(1024)});
 const state=object({tab:string(32),isNotes:bool,isEvidence:bool,isCases:bool,isIdentity:bool,loading:bool,busy:bool,writeDisabled:bool,blocked:bool,commitLabel:string(64),retry:bool,error:string(1024),notice:string(1024),heading:string(256),identity:string(512),time:string(256),matter:string(2048),creation:bool,step:{type:'integer',minimum:0,maximum:6},stepText:string(256),choices:array(option,64),selected:string(64),actionTitle:string(256),risk:string(2048),accepted:bool,form:object(Object.fromEntries(Array.from({length:7},(_,i)=>['f'+i,field]))),rows:array(row),evidence:array(row),cases:array(row),terms:array(row,6),status:array(row),edges:array(row,64),focus:string(128),detail:row,hasDetail:bool,search:string(256),advice:string(4096),adviceBusy:bool,query:string(256),draft:string(65536),messages:array(object({id:string(128),role:string(32),text:string(65536)}),64),saves:array(option,32),saveId:string(128),saveConfirm:bool,pending:bool});
 const init=s=>s.type==='object'?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,init(v)])):s.type==='array'?[]:s.type==='boolean'?false:s.type==='integer'?0:'';
 const initial=init(state);Object.assign(initial,{tab:'notes',isNotes:true,loading:true,writeDisabled:true,commitLabel:'Confirm action',heading:'Before the first case.',matter:'Loading the current player-safe record…',notice:'No action is committed until you confirm it.'});
 assert(schemaNodes(state)<=256,'Presentation schema budget');
 const nodes=[...['notes','evidence','cases','identity'].map(t=>'go_'+t),...Array.from({length:7},(_,i)=>['select_f'+i,'text_f'+i,'numeric_f'+i]).flat(),'skipContent','heading','ev-heading','cases-heading','identity-heading','accept-check','continueCreation','nextMessages','refresh','selectAction','commit','retryAction','reflection','advisor','ask','cancel','save','restore','search','closeDetail','saveSelect','composerInput'];
 const interactions={};
 for(const tab of ['notes','evidence','cases','identity'])interactions['go_'+tab]=[{kind:'set',target:'component.tab',value:tab}];
 interactions.inspect=[{kind:'set',target:'component.focus',value:{get:'item.id'}},{kind:'set',target:'component.detail',value:{get:'item'}},{kind:'set',target:'component.hasDetail',value:true}];
 interactions.inspectCase=[...interactions.inspect,...['Notes','Cases','Identity'].map(k=>({kind:'set',target:'component.is'+k,value:false})),{kind:'set',target:'component.isEvidence',value:true},{kind:'set',target:'component.tab',value:'evidence'}];
 interactions.chooseSave=[{kind:'set',target:'component.saveId',value:{get:'event.value'}}];
 const presentation={uses:bridge.bindings.map(b=>b.id),controller:{source:'inquiry-controller.js',required:true},nodeRefs:nodes,state:{component:{schema:state,initial}},interactions};
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;');
 const fields=Array.from({length:7},(_,i)=>{const id='f'+i,base='component.form.'+id;return '<div node-id="field_'+id+'" class="field" if="'+base+'.visible">'+['select','text','numeric'].map(kind=>'<label node-id="label_'+kind+'_'+id+'" for="'+kind+'_'+id+'" if="'+base+'.'+kind+'" bind:text="'+base+'.label"/>').join('')+'<select node-id="select_'+id+'" id="select_'+id+'" name="choice-'+id+'" autocomplete="off" if="'+base+'.select" bind:value="'+base+'.value" bind:disabled="component.pending" aria-describedby="help_'+id+'"><option node-id="option_'+id+'" each="'+base+'.options" item-key="id" bind:value="item.id" bind:text="item.label"/></select><textarea node-id="text_'+id+'" id="text_'+id+'" name="description-'+id+'" autocomplete="off" rows="2" if="'+base+'.text" bind:value="'+base+'.value" bind:disabled="component.pending" aria-describedby="help_'+id+'"/><input node-id="numeric_'+id+'" id="numeric_'+id+'" name="number-'+id+'" autocomplete="off" type="text" inputmode="numeric" if="'+base+'.numeric" bind:value="'+base+'.value" bind:disabled="component.pending" aria-describedby="help_'+id+'"/><small node-id="help_'+id+'" id="help_'+id+'" bind:text="'+base+'.help"/></div>';}).join('\n');
 let template=await fs.readFile(path.join(root,'frontend/Inquiry.aui'),'utf8');template=template.replace('<!-- FIELDS -->',fields);
 const style=await fs.readFile(path.join(root,'frontend/inquiry.css'),'utf8');
 const files=new Map([['frontend/Main.aui',Buffer.from(template+'\n<contract>'+JSON.stringify(presentation)+'</contract>\n<style>'+style+'</style>')],['frontend/bridge.json',Buffer.from(JSON.stringify(bridge))],['frontend/catalog.js',Buffer.from('export const catalog='+JSON.stringify(catalog)+';\nexport const captions='+JSON.stringify(captions)+';\nexport const claimSpecs='+JSON.stringify(claimSpecs)+';')]]);
 for(const file of ['inquiry-controller.js','inquiry-model.js'])files.set('frontend/'+file,await fs.readFile(path.join(root,'frontend',file)));
 return {files,budget:{presentationSchema:schemaNodes(state),bindings:bridge.bindings.length,reads:safeDomains.map(id=>({id,nodes:schemaNodes(bridge.bindings.find(b=>b.id===id).outputSchema)}))},catalog};
}
