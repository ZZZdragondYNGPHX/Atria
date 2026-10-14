import fs from 'node:fs/promises';
import path from 'node:path';
import {root,S,I,B,O,A,hash} from './compile.mjs';
const EMPTY={type:'object',properties:{},additionalProperties:false};
export const panelRequest=O({mode:S(32),id:S(160)});
const preferences=O({large:B,reduced:B,hint:I(1,3)});
export async function frontend({core,load,files,manifest,contract,logic,schemas}){
 const {fixedHostTarget}=await load('public/shared/native-frontend-host.js');
 const bindings=[{id:'act',kind:'action',target:{transactionId:'fog.act'},inputSchema:schemas.input,outputSchema:EMPTY}];
 for(const [id,domainId,schema] of [['game','fog_game',O({state:schemas.state})],['view','fog_view',O({view:schemas.view})]])bindings.push({id,kind:'read',target:{domainId},inputSchema:EMPTY,outputSchema:A(O({id:S(64),value:schema}),10000)});
 for(const [id,service,method] of [['session','host.session','status'],['saves','host.session','saves'],['save','host.session','save'],['restore','host.session','restore'],['exit','host.session','exit'],['recover','host.session','recover'],['reload','host.session','reload'],['persona','host.persona','status'],['personaSelect','host.persona','openSelector'],['messages','host.conversation','recent'],['chatHistory','host.tasks','presentation'],['cancel','host.conversation','cancel']]){
  const t=fixedHostTarget({service,method});bindings.push({id,kind:t.kind,target:{service,method},inputSchema:t.inputSchema,outputSchema:t.outputSchema,...(t.collection?{collection:{pageSize:64,orderBy:'createdAt',filters:[],search:[]}}:{})});
 }
 for(const [id,task] of [['intent','fog.intent'],...['zhou','lin','xu','shen'].map(n=>['chat-'+n,'fog.chat.'+n])]){const t=contract.taskRuntime.tasks.find(t=>t.id===task);bindings.push({id,kind:'operation',target:{taskId:task,variantId:'default'},inputSchema:t.inputSchema,outputSchema:t.variants[0].outputSchema});}
 for(const [id,method] of [['audio','audioStatus'],['audioEnable','enableAudio'],['audioPrefs','setAudioPreferences'],['audioScene','setAudioScene'],['audioStop','stopAudio']]){const t=fixedHostTarget({service:'host.media',method});bindings.push({id,kind:t.kind,target:{service:'host.media',method},inputSchema:t.inputSchema,outputSchema:t.outputSchema});}
 files.set('frontend/bridge.json',Buffer.from(JSON.stringify({version:1,bindings})));
 const assets=[];
 for(const name of await fs.readdir(path.join(root,'media/images'))){if(!name.endsWith('.webp')||name==='inn-night.webp')continue;const id=name.slice(0,-5),source='media/'+name;files.set('frontend/media/'+name,await fs.readFile(path.join(root,'media/images',name)));assets.push({id,source,mediaType:'image/webp'});}
 for(const name of await fs.readdir(path.join(root,'media/audio'))){if(!name.endsWith('.wav'))continue;const id='aud-'+name.slice(0,-4),source='audio/'+name;files.set('frontend/audio/'+name,await fs.readFile(path.join(root,'media/audio',name)));assets.push({id,source,mediaType:'audio/wav'});}
 const {mainState,panelState}=await import('./ui-state.mjs');
 files.set('frontend/media-catalog.js',Buffer.from('export const images='+JSON.stringify(assets.map(a=>a.id))+';'));
 const stateContract=state=>({schema:O(Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v.schema]))),initial:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,v.value]))});
 const rootContract={state:{ui:{schema:O({request:panelRequest}),initial:{request:{mode:'map',id:''}}},prefs:{schema:preferences,initial:{large:false,reduced:false,hint:1}}},interactions:{open:[{kind:'set',target:'ui.request',value:{get:'event.value'}},{kind:'overlay.open',target:'panel'}]}};
 files.set('frontend/Root.aui',Buffer.from('<template><component node-id="stage" class="stage-shell" ref="Main" prop:settings="prefs" on:open="open" /></template><contract>'+JSON.stringify(rootContract)+'</contract>'));
 files.set('frontend/PanelRoot.aui',Buffer.from('<template><component node-id="panelRoot" class="panel-shell" ref="Panel" prop:request="ui.request" prop:settings="prefs" on:settings="settings" on:close="close" /></template><contract>'+JSON.stringify({interactions:{close:[{kind:'overlay.close'}],settings:Object.keys(preferences.properties).map(k=>({kind:'set',target:'prefs.'+k,value:{get:'event.value.'+k}}))}})+'</contract>'));
 for(const [id,state,emits,props,extra] of [['Main',mainState,{open:panelRequest},{settings:{schema:preferences}},{}],['Panel',panelState,{close:EMPTY,settings:preferences},{request:{schema:panelRequest},settings:{schema:preferences}},{}]]){
  const template=await fs.readFile(path.join(root,'frontend',id+'.aui'),'utf8');
  const {parseAui}=await load('src/native/frontend/aui-parser.js');const refs=[];
  const walk=(n,repeated=false)=>{repeated||=!!n.each;if(!repeated)refs.push(n.id);for(const child of n.children||[])if(typeof child==='object')walk(child,repeated);};walk(parseAui('<template>'+template+'</template>',id+'.aui').ast.root);
  const c={state:{component:stateContract(state)},controller:{source:id.toLowerCase()+'.js',required:true},nodeRefs:refs,uses:bindings.map(b=>b.id),emits,props,...extra};
  files.set('frontend/'+id+'.aui',Buffer.from('<template>'+template+'</template><contract>'+JSON.stringify(c)+'</contract>'));
  files.set('frontend/'+id.toLowerCase()+'.js',await fs.readFile(path.join(root,'frontend',id.toLowerCase()+'.js')));
 }
 files.set('frontend/theme.css',await fs.readFile(path.join(root,'frontend/theme.css')));
 files.set('frontend/client.js',await fs.readFile(path.join(root,'frontend/client.js')));
 const index={format:'atria-frontend-source',version:3,primaryView:'main',bridge:'bridge.json',views:[{id:'main',root:'Root',surface:'app.root'},{id:'panel',root:'PanelRoot',surface:'app.root'}],components:['Root','Main','PanelRoot','Panel'].map(id=>({id,source:id+'.aui'})),styles:[{id:'theme',source:'theme.css'}],assets};
 files.set('frontend/index.json',Buffer.from(JSON.stringify(index)));
 const {compileFrontend}=await load('src/native/frontend/compiler.js');const built=compileFrontend({source:'frontend/index.json',files,mode:'full',experienceContract:contract,transactions:logic.transactions});
 for(const [p,b] of built.files)files.set(p,b);
 manifest.runtime.experience={mode:'full',frontend:{kind:'native',version:3,entry:built.entry},features:[{id:'frontend-script',version:1,required:true},{id:'frontend-audio',version:1,required:true}]};
}
