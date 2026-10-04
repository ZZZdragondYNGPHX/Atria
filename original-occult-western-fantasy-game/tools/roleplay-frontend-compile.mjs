import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {O,S,I,B} from './roleplay-compile.mjs';
import {schemaNodes} from './frontend-compile.mjs';

// Authoring only. The shipped controller reads projections and fixed Host services.
export async function compileRoleplayFrontend({root,compiled,manifest,data,load}) {
 const {fixedHostTarget}=await load('public/shared/native-frontend-host.js');
 const bridge={version:1,bindings:[]};
 for(const domainId of ['roleplay_summary','roleplay_visible']){
  const domain=compiled.domains.find(d=>d.id===domainId);
  const outputSchema=O({id:S(64),value:domain.recordSchema});
  assert(schemaNodes(outputSchema)<=256);
  bridge.bindings.push({id:domainId,kind:'read',target:{domainId},inputSchema:O({}),outputSchema,collection:{pageSize:8,orderBy:'id'}});
 }
 for(const [id,service,method] of [['begin','session','begin'],['run','session','run'],['session','session','status'],['messages','conversation','recent'],['save','session','save'],['saves','session','saves'],['restore','session','restore'],['composer','composer','get'],['composer_set','composer','set'],['composer_submit','composer','submit'],['generation','conversation','generation'],['cancel','conversation','cancel'],['recover','session','recover'],['exit','session','exit']]){
  const target={service:'host.'+service,method},spec=fixedHostTarget(target);
  bridge.bindings.push({id,kind:spec.kind,target,inputSchema:spec.inputSchema,outputSchema:spec.outputSchema,...(spec.collection?{collection:{pageSize:id==='messages'?32:32,orderBy:id==='messages'?'sequence':'saveId'}}:{})});
 }
 const array=(items,maxItems)=>({type:'array',items,maxItems});
 const row=O({id:S(128),label:S(256),text:S(8192)});
 const option=O({id:S(64),label:S(64),text:S(512),selected:S(5)});
 const common={loading:B,busy:B,error:S(1024),notice:S(1024),modeLabel:S(64),terminal:B,terminalText:S(1024),writeDisabled:B,ironman:B};
 const main=O({...common,entry:B,creation:B,story:B,identityStep:B,questionStep:B,reviewStep:B,previous:B,step:I(0,6),stepText:S(128),question:S(256),options:array(option,4),choiceId:S(64),mode:S(16),ordinarySelected:S(5),ironmanSelected:S(5),name:S(65536),appearance:S(65536),residence:S(32),livelihood:S(32),attachment:S(32),contact:S(32),aim:S(32),review:S(4096),background:S(4096),location:S(128),time:S(128),draft:S(65536),draftRows:I(3,10),sendDisabled:B,uncertain:B,startRetry:B,messages:array(O({id:S(128),role:S(32),text:S(65536),kind:S(32)}),32),nextMessages:B,latestAvailable:B,suggestions:array(O({id:S(32),label:S(96),text:S(512)}),3),episodeClosed:B});
 const drawer=O({...common,tab:S(16),heading:S(128),rows:array(row,32),tabs:array(O({id:S(16),label:S(32),selected:S(5)}),5),isSaves:B,saves:array(O({id:S(128),label:S(256),selected:S(5)}),32),saveId:S(128),restoreReview:B,restoreDisabled:B,saveDisabled:B});
 const init=s=>s.type==='object'?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,init(v)])):s.type==='array'?[]:s.type==='boolean'?false:s.type==='integer'?s.minimum:'';
 const mainInitial={...init(main),entry:true,loading:true,writeDisabled:true,sendDisabled:true,mode:'ordinary',ordinarySelected:'true',ironmanSelected:'false',draftRows:3};
 const drawerInitial={...init(drawer),loading:true,writeDisabled:true,saveDisabled:true,restoreDisabled:true,tab:'self',heading:'自身境况'};
 const mainInteractions={openCompanion:[{kind:'overlay.open',target:'companion'}],choose:[{kind:'set',target:'component.choiceId',value:{get:'item.id'}}],suggest:[{kind:'set',target:'component.draft',value:{op:'choose',args:[{get:'component.draft'},{op:'concat',args:[{get:'component.draft'},'\n',{get:'item.text'}]},{get:'item.text'}]}},{kind:'focus',target:'draft'}]};
 const drawerInteractions={closeCompanion:[{kind:'overlay.close'}],chooseTab:[{kind:'set',target:'component.tab',value:{get:'item.id'}}],chooseSave:[{kind:'set',target:'component.saveId',value:{get:'item.id'}}]};
 const files=new Map();
 for(const [name,state,initial,controller,interactions] of [['OpenLives',main,mainInitial,'roleplay-controller.js',mainInteractions],['Companion',drawer,drawerInitial,'roleplay-companion.js',drawerInteractions]]){
  assert(schemaNodes(state)<=256);
  const template=await fs.readFile(path.join(root,'frontend',name+'.aui'),'utf8');
  const nodeRefs=name==='OpenLives'?['refresh','newStory','name','appearance','ordinary','ironman','question-heading','question-options','next','nextQuestion','previous','begin','retryBegin','draft','send','stop','recover','nextMessages','latestMessages','exit']:['closeCompanion','drawer-tabs','save-list','save','restore','cancelRestore','drawer-refresh'];
  const presentation={uses:bridge.bindings.map(b=>b.id),controller:{source:controller,required:true},nodeRefs,state:{component:{schema:state,initial}},interactions};
  files.set('frontend/'+name+'.aui',Buffer.from(template+'\n<contract>'+JSON.stringify(presentation)+'</contract>\n<style>'+await fs.readFile(path.join(root,'frontend/roleplay.css'),'utf8')+'</style>'));
 }
 files.set('frontend/frontend.json',Buffer.from(JSON.stringify({format:'atria-frontend-source',version:3,primaryView:'main',bridge:'bridge.json',views:[{id:'main',root:'OpenLives',surface:'app.root'},{id:'companion',root:'Companion',surface:'app.root'}],components:[{id:'OpenLives',source:'OpenLives.aui'},{id:'Companion',source:'Companion.aui'}]})));
 files.set('frontend/bridge.json',Buffer.from(JSON.stringify(bridge)));
 const publicCatalogue=Object.fromEntries(['questions','incompatibilities','places'].map(key=>[key,data[key]]));
 files.set('frontend/roleplay-catalog.js',Buffer.from('export const data='+JSON.stringify(publicCatalogue)+';'));
 for(const name of ['roleplay-controller.js','roleplay-companion.js','roleplay-model.js'])files.set('frontend/'+name,await fs.readFile(path.join(root,'frontend',name)));
 manifest.runtime.experience.features=[{id:'frontend-script',version:1,required:true}];
 return {files,budget:{mainSchema:schemaNodes(main),drawerSchema:schemaNodes(drawer),bindings:bridge.bindings.length,readDomains:['roleplay_summary','roleplay_visible']}};
}
