import {catalog,captions,claimSpecs} from './catalog.js';
import {projectRegister,readable,row} from './inquiry-model.js';
let cached=null, view=null, pending=null, serial=0, currentRevision='', refreshing=false, lastTab='', lastCatalog='', conversationCursor=null, reviewed=null, activeAction='';
const drafts={};
const steps=['opening_identity','opening_origin','opening_prior_life','opening_faith','opening_anchor','opening_reason'];
const stepNames=['Identity','Origin','Prior life','Faith','Living Personal Anchor','Reason'];
const set=(ctx,key,value)=>ctx.set('component.'+key,value);
const ok=r=>{if(!r?.ok)throw Error(r?.error?.code??'bridge_transport_failed');return r.data;};
const empty=()=>row('','','','','','');
function fieldsFor(action){return Object.fromEntries(Array.from({length:7},(_,i)=>{
 const f=action?.fields[i],s=f?.schema;return ['f'+i,{label:f?({history:'Historical Truth',stability:'Current Stability',justice:'Justice',power:'Political Power',religion:'Religious Authority',accountability:'Institutional Accountability',acceptPrice:'Accept the enforceable Price'}[f.name]??f.label):'',value:!f?'':s.type==='boolean'?'false':s.enum?String(s.enum[0]):s.type==='integer'?String(s.minimum??0):'',options:!f?[]:s.type==='boolean'?[{id:'false',label:'Not accepted'},{id:'true',label:'I accept the stated Price'}]:(s.enum??[]).map(v=>({id:String(v),label:captions[v]??claimSpecs.find(c=>c.id===v)?.label??readable(v)})),visible:!!f,select:!!(s?.enum||s?.type==='boolean'),text:!!f&&!s.enum&&s.type!=='boolean'&&s.type!=='integer',numeric:s?.type==='integer',help:!f?'':s.type==='integer'?'Whole number, '+s.minimum+'–'+s.maximum+'.':s.enum?'Choose one declared value.':s.type==='boolean'?'This is a separate explicit Price agreement.':'Up to '+s.maxLength+' characters. Ordinary expression only.'}];}));}
const formSignature=state=>JSON.stringify(Object.values(state.form).map(f=>f.value));
function select(ctx,id){reviewed=null;if(activeAction&&activeAction!==id)drafts[activeAction]=Object.values(ctx.state.form).map(f=>f.value);const action=catalog.find(a=>a.id===id);if(!action)return;lastCatalog='';set(ctx,'selected',id);set(ctx,'actionTitle',action.label);set(ctx,'risk',action.notice);set(ctx,'accepted',false);set(ctx,'blocked',true);const next=fieldsFor(action);if(drafts[id])for(let i=0;i<action.fields.length;i++)next['f'+i].value=action.fields[i].name==='acceptPrice'?'false':drafts[id][i];activeAction=id;set(ctx,'form',next);if(id==='convergence_claim')setCatalog(ctx,action.fields[0].schema.enum[0]);}
function setCatalog(ctx,id){const spec=claimSpecs.find(c=>c.id===id);if(!spec)return;lastCatalog=id;const action=catalog.find(a=>a.id==='convergence_claim');for(const name of ['rule','condition','primitive']){const i=action.fields.findIndex(f=>f.name===name);set(ctx,'form.f'+i+'.value',spec[name]);}}
function navigate(ctx,tab){lastTab=tab;set(ctx,'tab',tab);for(const [key,value] of Object.entries({isNotes:tab==='notes',isEvidence:tab==='evidence',isCases:tab==='cases',isIdentity:tab==='identity'}))set(ctx,key,value);
 if(pending)return;
 let list=view?.life.step<6?catalog.filter(a=>a.id===steps[view.life.step]):catalog.filter(a=>a.group===(tab==='identity'?'identity':tab==='cases'?'cases':'investigation'));
 set(ctx,'choices',list.map(a=>({id:a.id,label:a.label})));if(list.length)select(ctx,list[0].id);
}
function render(ctx,query=ctx.state.search){if(!cached)return;view=projectRegister(cached.summary,cached.nodes,cached.matters,cached.links,query);for(const k of ['evidence','cases','rows','status','terms','matter','time','identity','heading'])set(ctx,k,view[k]);set(ctx,'creation',view.life.step<6);set(ctx,'step',view.life.step);set(ctx,'stepText',view.life.step<6?'Step '+(view.life.step+1)+' of 6: '+stepNames[view.life.step]:'Identity complete.');set(ctx,'edges',view.edges);if(!lastTab||ctx.state.step!==view.life.step)navigate(ctx,ctx.state.tab||'notes');if(ctx.state.hasDetail)detail(ctx,ctx.state.focus);}
function detail(ctx,id){const item=view?.allEvidence.find(r=>r.id===id)??view?.cases.find(r=>r.id===id);if(!item||id==='empty'||id==='search_empty')return;set(ctx,'focus',id);set(ctx,'detail',item);set(ctx,'hasDetail',true);const parent=view.parents[id]??id;const links=view.edges.filter(e=>e.source===parent||e.custody===parent);set(ctx,'edges',links.length?links:[row('no_link','No published relation','Known relation','No relation is published for this record. This says nothing about hidden connections.')]);}
async function readMessages(ctx,cursor){const r=await ctx.bridge.page('messages',{},cursor?{cursor}:{});ok(r);conversationCursor=r.cursor??null;set(ctx,'messages',r.data.map(m=>({id:m.messageId,role:readable(m.role),text:m.content})));}
async function refresh(ctx){if(refreshing)return;refreshing=true;set(ctx,'loading',true);set(ctx,'writeDisabled',true);try{
 const status=ok(await ctx.bridge.snapshot('session'));const loadedRevision=status.revisionId;
 const values=await Promise.all(['opening_summary_projection','player_matters','investigation_nodes_projection','investigation_edges'].map(async id=>ok(await ctx.bridge.page(id,{}))));
 currentRevision=loadedRevision;cached={summary:values[0].find(r=>r.id==='main')?.value??{},matters:values[1],nodes:values[2],links:values[3]};render(ctx);set(ctx,'loading',false);set(ctx,'writeDisabled',ctx.state.busy||!!pending);
 await readMessages(ctx,null);const saves=ok(await ctx.bridge.page('saves',{}));set(ctx,'saves',saves.map(s=>({id:s.saveId,label:s.displayName||'Saved session'})));
 set(ctx,'loading',false);if(!pending)set(ctx,'error','');
 }catch(e){set(ctx,'error','The record could not be refreshed ('+e.message+'). Use Refresh record. No new action was submitted.');set(ctx,'loading',false);}finally{refreshing=false;}}
function inputFor(action,state){const input={};for(let i=0;i<action.fields.length;i++){const {name,schema:s}=action.fields[i],raw=state.form['f'+i].value;let value=raw,why='';if(s.type==='integer'){value=Number(raw);if(!raw.trim()||!Number.isSafeInteger(value)||value<s.minimum||value>s.maximum)why='Enter a whole number from '+s.minimum+' to '+s.maximum+'.';}if(s.type==='boolean')value=raw==='true';if(s.type==='string'&&(raw.length>(s.maxLength??65536)||raw.length<(s.minLength??0)))why='Check the required length.';if(s.enum&&!s.enum.includes(value))why='Choose a declared option.';if(why)throw Object.assign(Error(action.fields[i].label+': '+why),{field:i});input[name]=value;}return input;}
async function invokePending(ctx){if(!pending)return;set(ctx,'busy',true);set(ctx,'writeDisabled',true);set(ctx,'commitLabel','Recording…');set(ctx,'blocked',true);set(ctx,'pending',true);set(ctx,'retry',false);set(ctx,'error','');set(ctx,'notice','Submitting the declared action. Waiting for Atria to confirm…');
 try{const result=await ctx.bridge.invoke(pending.id,pending.input,pending.options);if(!result.ok){const code=result.error?.code??'bridge_transport_failed';set(ctx,'error','Atria has not confirmed this request ('+code+'). Do not create a replacement request. Retry uses the original input, revision and key while this bridge remains valid. If the bridge expired, review committed history after refresh; automatic replay is unavailable.');set(ctx,'retry',!code.includes('epoch'));return;}
 pending=null;set(ctx,'pending',false);set(ctx,'accepted',false);set(ctx,'notice','Atria recorded the result. Inspect the narrative and record: a recorded attempt is not proof that the method was eligible.');await refresh(ctx);
 }catch{set(ctx,'error','The request status is unknown. Retry the original request; do not submit a replacement.');set(ctx,'retry',true);}finally{set(ctx,'busy',false);set(ctx,'writeDisabled',!!pending);set(ctx,'commitLabel','Confirm action');}}
async function advice(ctx,id){if(ctx.state.adviceBusy)return;set(ctx,'adviceBusy',true);set(ctx,'advice','Reading only the approved advisory view…');try{const question=ctx.state.query.trim();if(!question||question.length>256)throw Error('Enter a question of 1–256 characters.');const start=await ctx.bridge.start(id,{context:question});ok(start);let result=start;for(let i=0;i<180&&!['completed','failed','cancelled'].includes(result.status);i++){await ctx.scheduler.timer(500);result=await ctx.bridge.operation(id,start.operationId);ok(result);}if(result.status!=='completed')throw Error('Advisory task did not complete. Retry the advice request when ready.');set(ctx,'advice',result.data.text+'\nAdvisory only; no command was applied.');}catch(e){set(ctx,'advice','Advice unavailable: '+e.message+' No game state was changed.');}finally{set(ctx,'adviceBusy',false);}}
async function poll(ctx){for(;;){await ctx.scheduler.timer(2000);if(ctx.state.selected==='convergence_claim'&&ctx.state.form.f0.value!==lastCatalog)setCatalog(ctx,ctx.state.form.f0.value);set(ctx,'blocked',ctx.state.busy||!!pending||!ctx.state.accepted||ctx.state.loading);set(ctx,'writeDisabled',ctx.state.busy||!!pending||ctx.state.loading);if(ctx.state.busy||refreshing||pending)continue;try{const status=ok(await ctx.bridge.snapshot('session'));if(status.revisionId!==currentRevision)await refresh(ctx);}catch{/* The Native bridge owns epoch recovery. Never replay here. */}}}
export default {
 async init(ctx){set(ctx,'detail',empty());set(ctx,'notice','Player-safe record. If an earlier request was interrupted, inspect committed history before submitting another action.');await refresh(ctx);try{set(ctx,'draft',ok(await ctx.bridge.snapshot('composer')).text);}catch{/* Host boundary displays normal unavailable feedback on use. */}void poll(ctx);},
 async event(ctx,event){
  if(event.type==='change'||event.type==='input'){
   if(event.node==='selectAction'){if(!pending)select(ctx,event.value);return;}
   if(event.node==='search'){render(ctx,event.value);return;}
   if(event.node.startsWith('select_f')||event.node.startsWith('text_f')||event.node.startsWith('numeric_f')){if(reviewed&&formSignature(ctx.state)!==reviewed){reviewed=null;set(ctx,'accepted',false);set(ctx,'blocked',true);}if(ctx.state.selected==='convergence_claim'&&event.node==='select_f0')setCatalog(ctx,event.value);return;}
   if(event.node==='accept-check'){reviewed=event.checked?formSignature(ctx.state):null;set(ctx,'blocked',ctx.state.busy||!!pending||!event.checked||ctx.state.loading);return;}
   return;
  }
  if(event.type!=='click')return;
  if(event.node.startsWith('go_')){navigate(ctx,event.value);return;}
  if(event.node==='skipContent'){await ctx.node({notes:'heading',evidence:'ev-heading',cases:'cases-heading',identity:'identity-heading'}[ctx.state.tab],'focus');return;}
  if(event.node==='continueCreation'){await ctx.node('selectAction','focus');return;}
  if(event.node==='refresh'){await refresh(ctx);return;}
  if(event.node==='selectEvidence'||event.node==='selectCase'){if(event.node==='selectCase')navigate(ctx,'evidence');detail(ctx,event.value);return;}
  if(event.node==='closeDetail'){set(ctx,'hasDetail',false);set(ctx,'edges',view?.edges??[]);return;}
  if(event.node==='nextMessages'){try{if(conversationCursor)await readMessages(ctx,conversationCursor);else set(ctx,'notice','This is the last conversation page. Refresh starts at the first page.');}catch(e){set(ctx,'error','Conversation page expired. Refresh the record.');}return;}
  if(event.node==='reflection'||event.node==='advisor'){await advice(ctx,event.node);return;}
  if(event.node==='cancel'){await ctx.bridge.invoke('cancel',{});return;}
  if(ctx.state.busy)return;
  if(event.node==='retryAction'){await invokePending(ctx);return;}
  if(pending){set(ctx,'error','Resolve the original request before submitting another write.');return;}
  if(event.node==='commit'){
   if(!ctx.state.accepted)return;if(formSignature(ctx.state)!==reviewed){set(ctx,'accepted',false);set(ctx,'blocked',true);set(ctx,'error','The fields changed. Review the current method before confirming again.');return;}try{const action=catalog.find(a=>a.id===ctx.state.selected);const input=inputFor(action,ctx.state);pending={id:action.id,input,options:{revision:currentRevision,idempotencyKey:'p8-'+ctx.clock()+'-'+(++serial)}};await invokePending(ctx);}catch(e){set(ctx,'error',e.message);set(ctx,'blocked',false);if(e.field!==undefined){set(ctx,'form.f'+e.field+'.help',e.message);const field=ctx.state.form['f'+e.field];await ctx.node((field.select?'select_':field.numeric?'numeric_':'text_')+'f'+e.field,'focus');}}return;
  }
  if(event.node==='ask'){
   if(!ctx.state.draft.trim()){set(ctx,'error','Write an action or question before sending.');return;}set(ctx,'busy',true);try{ok(await ctx.bridge.invoke('composer_set',{text:ctx.state.draft}));ok(await ctx.bridge.invoke('composer_submit',{}));set(ctx,'draft','');set(ctx,'notice','Composer submitted. The record updates when Atria publishes the result.');await refresh(ctx);}catch(e){set(ctx,'error','Composer did not confirm submission ('+e.message+'). The draft is preserved. Inspect the conversation before sending again.');}finally{set(ctx,'busy',false);}return;
  }
  if(event.node==='save'){set(ctx,'busy',true);try{ok(await ctx.bridge.invoke('save',{displayName:'Eastbank field register'}));set(ctx,'notice','Committed session saved.');await refresh(ctx);}catch(e){set(ctx,'error','Save failed ('+e.message+'). Retry Create save.');}finally{set(ctx,'busy',false);}return;}
  if(event.node==='restore'){if(!ctx.state.saveId||!ctx.state.saveConfirm){set(ctx,'error','Choose a saved session and confirm that it replaces the active branch.');return;}set(ctx,'busy',true);try{ok(await ctx.bridge.invoke('restore',{saveId:ctx.state.saveId}));}catch(e){set(ctx,'error','Restore was not confirmed ('+e.message+'). Inspect the active record before retrying.');}finally{set(ctx,'busy',false);}}
 }
};
