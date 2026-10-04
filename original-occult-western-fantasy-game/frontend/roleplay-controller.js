import {data} from './roleplay-catalog.js';
import {ok,modeText,isTerminal,terminalText,startReview,background,locationLabel,suggestions} from './roleplay-model.js';
let revision='',epoch='',refreshing=false,serial=0,pendingStart=null,cursor=null,messagePage=null,submitted=null,readingHistory=false,publishedTail='';
let verified=false;
const flags={loading:true,busy:false,terminal:false,uncertain:false};
const set=(c,k,v)=>{if(Object.hasOwn(flags,k))flags[k]=v;c.set('component.'+k,v);};
async function focus(c,id){try{await c.scheduler.frame();await c.node(id,'focus');}catch{/* A hidden/recovered node is no longer a focus target. */}}
function step(c,n){set(c,'step',n);set(c,'previous',n>0);set(c,'identityStep',n===0);set(c,'questionStep',n>0&&n<6);set(c,'reviewStep',n===6);set(c,'stepText',n===0?'写下称呼，选择保存方式':n===6?'开始前，再读一遍':'生活境况 '+n+' / 5');set(c,'question',n===0?'先认识你。':n===6?'这是你的起点。':data.questions[n-1].prompt);if(n>0&&n<6){const q=data.questions[n-1];set(c,'options',q.options.map(o=>({...Object.fromEntries(['id','label','text'].map(k=>[k,o[k]])),selected:c.state[q.id]===o.id?'true':'false'})));}}
function lock(c){set(c,'writeDisabled',!verified||flags.loading||flags.busy||!!pendingStart);set(c,'sendDisabled',!verified||flags.loading||flags.busy||flags.terminal||flags.uncertain);}
async function messages(c,next=false){
 const result=await c.bridge.snapshot('messages',next&&cursor?{beforeSequence:cursor}:{});const rows=ok(result);cursor=rows[0]?.sequence>0?rows[0].sequence:null;readingHistory=next;set(c,'latestAvailable',next);
 messagePage=rows;set(c,'messages',rows.filter(m=>!(m.sequence===0&&m.role==='user'&&m.content==='Begin story')).map(m=>({id:m.messageId,role:m.role==='user'?'你的言行':'故事',text:m.content,kind:m.role==='user'?'message player-message':'message narration'})));set(c,'nextMessages',!!cursor);
}
async function refresh(c,keepReading=false){
 if(refreshing)return;refreshing=true;verified=false;set(c,'loading',true);lock(c);
 try{
  const run=ok(await c.bridge.snapshot('run'));
  set(c,'terminal',isTerminal(run));set(c,'ironman',run.mode==='ironman');set(c,'modeLabel',modeText(run.mode));set(c,'terminalText',isTerminal(run)?terminalText(run):'');
  if(run.status==='terminal'){
   set(c,'entry',false);set(c,'creation',false);set(c,'story',true);set(c,'location','人生终局');set(c,'time',modeText(run.mode));set(c,'suggestions',[]);set(c,'messages',[]);set(c,'background','');set(c,'nextMessages',false);set(c,'episodeClosed',false);set(c,'error','');return;
  }
  const status=await c.bridge.snapshot('session'),current=ok(status);revision=current.revisionId;epoch=status.epoch;publishedTail=current.tailMessageId;
  if(run.status==='pending'){verified=true;set(c,'story',false);return;}
  const summary=ok(await c.bridge.page('roleplay_summary',{})).find(r=>r.id==='main')?.value;
  const visible=ok(await c.bridge.page('roleplay_visible',{})).find(r=>r.id==='main')?.value||{};
  if(!summary?.player.started)throw Error('public_summary_unavailable');
  pendingStart=null;set(c,'startRetry',false);set(c,'entry',false);set(c,'creation',false);set(c,'story',true);
  set(c,'background',background(summary));set(c,'location',locationLabel(summary.player.location,visible));
  const minute=summary.progress.minutes;set(c,'time','第 '+(Math.floor(minute/1440)+1)+' 日 · '+String(Math.floor(minute%1440/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')+' · '+(run.mode==='ironman'?'铁人':'普通'));
  set(c,'suggestions',isTerminal(run)?[]:suggestions(summary));set(c,'episodeClosed',summary.progress.episode==='closed');
  // Keep the current reading page until the player explicitly refreshes/advances.
  if(keepReading&&messagePage&&(readingHistory||messagePage.length===32)){set(c,'latestAvailable',true);}else await messages(c);verified=true;set(c,'error','');
 }catch(e){set(c,'error','读取尚未完成。请刷新；草稿和选择仍保留。');}
 finally{refreshing=false;set(c,'loading',false);lock(c);}
}
async function begin(c){
 if(c.state.busy)return;
 if(!pendingStart){try{startReview(c.state);}catch(e){set(c,'error',e.message);return;}const input=Object.fromEntries(['mode','name','appearance',...data.questions.map(q=>q.id)].map(k=>[k,k==='name'?c.state.name.trim():c.state[k]]));pendingStart={input:{inputJson:JSON.stringify(input),invocationId:'lives-'+c.clock()+'-'+ ++serial},options:{revision,epoch,idempotencyKey:'begin-'+c.clock()+'-'+serial}};}
 set(c,'busy',true);set(c,'error','');lock(c);
 try{ok(await c.bridge.invoke('begin',pendingStart.input,pendingStart.options));pendingStart=null;await refresh(c);set(c,'notice','你的生活已开始。');}
 catch(e){set(c,'error','开始尚未确认。刷新可检查是否已经开始；未确认前只重试开始。');set(c,'startRetry',true);}
 finally{set(c,'busy',false);lock(c);}
}
async function send(c){
 if(c.state.sendDisabled||c.state.busy)return;
 const text=c.state.draft.trim();if(!text){set(c,'error','先写下你想说的话，或试着做的事。');await focus(c,'draft');return;}
 submitted={text,tail:publishedTail};set(c,'busy',true);set(c,'error','');set(c,'notice','正在等待世界回应…');lock(c);
 try{ok(await c.bridge.invoke('composer_set',{text}));ok(await c.bridge.invoke('composer_submit',{}));await refresh(c,true);
  const generation=ok(await c.bridge.snapshot('generation'));if(publishedTail!==submitted.tail&&generation.state==='idle'){set(c,'draft','');set(c,'draftRows',3);submitted=null;set(c,'uncertain',false);set(c,'notice','故事已更新。');}
  else {set(c,'uncertain',true);set(c,'notice','宿主已接收言行，回应尚未确认。请刷新故事。');}
 }catch(e){set(c,'uncertain',true);set(c,'error','暂时无法确认回应是否完成。草稿已保留，请先刷新查看故事。');await refresh(c);}
 finally{set(c,'busy',false);lock(c);}
}
async function poll(c){for(;;){await c.scheduler.timer(1800);if(refreshing||c.state.busy)continue;try{
 const run=ok(await c.bridge.snapshot('run'));if(!verified||isTerminal(run)!==c.state.terminal||run.status==='terminal'){await refresh(c);continue;}
 const r=await c.bridge.snapshot('session'),status=ok(r);if(status.revisionId!==revision||r.epoch!==epoch)await refresh(c,true);
 if(submitted&&publishedTail!==submitted.tail&&ok(await c.bridge.snapshot('generation')).state==='idle'){if(c.state.draft.trim()===submitted.text){set(c,'draft','');set(c,'draftRows',3);}submitted=null;set(c,'uncertain',false);set(c,'notice','故事已更新。');lock(c);}
 }catch{/* Reads recover through the Native epoch; never replay an action. */}}}
export default {
 async init(c){await refresh(c);if(!flags.terminal)try{set(c,'draft',ok(await c.bridge.snapshot('composer')).text);}catch{}void poll(c);},
 async event(c,e){
  if(e.type==='input'&&e.node==='draft'){set(c,'draftRows',Math.min(10,Math.max(3,e.value.split('\n').length+Math.ceil(e.value.length/48))));return;}
  if(e.type!=='click')return;
  if(e.node==='exit'){try{ok(await c.bridge.invoke('exit',{}));}catch(err){set(c,'error','暂时没能返回，请从 Atria 的故事入口打开列表。');}return;}
  if(e.node==='refresh'){await refresh(c);return;}
  if(e.node==='stop'){try{ok(await c.bridge.invoke('cancel',{}));set(c,'notice','已请求停止，请刷新查看故事停在何处。');}catch(err){set(c,'error','停止尚未确认。请刷新故事检查当前回应。');}return;}
  if(e.node==='recover'){try{ok(await c.bridge.invoke('recover',{}));await refresh(c);set(c,'uncertain',false);lock(c);}catch(err){set(c,'error','暂时没能恢复连接。草稿还在，请稍后再试。');}return;}
  if(c.state.busy)return;
  if(e.node==='newStory'){set(c,'entry',false);set(c,'creation',true);step(c,0);await focus(c,'question-heading');return;}
  if(e.node==='ordinary'||e.node==='ironman'){if(pendingStart)return;set(c,'mode',e.value);set(c,'ordinarySelected',e.value==='ordinary'?'true':'false');set(c,'ironmanSelected',e.value==='ironman'?'true':'false');return;}
  if(e.node==='question-options'){if(pendingStart)return;await c.scheduler.yield();const chosen=c.state.choiceId,q=data.questions[c.state.step-1];set(c,q.id,chosen);set(c,'options',q.options.map(o=>({id:o.id,label:o.label,text:o.text,selected:o.id===chosen?'true':'false'})));set(c,'error','');return;}
  if(e.node==='next'||e.node==='nextQuestion'){
   if(pendingStart)return;try{if(c.state.step===0){if(!c.state.name.trim()||c.state.name.trim().length>48)throw Error('请写下 1–48 字称呼。');if(c.state.appearance.length>160)throw Error('外观或态度最多 160 字。');}else if(!c.state[data.questions[c.state.step-1].id])throw Error('请选择一种境况，再继续。');if(c.state.step===5)set(c,'review',startReview(c.state));set(c,'error','');step(c,c.state.step+1);await focus(c,'question-heading');}catch(err){set(c,'error',err.message);}return;
  }
  if(e.node==='previous'){if(pendingStart)return;step(c,c.state.step-1);set(c,'error','');await focus(c,'question-heading');return;}
  if(e.node==='begin'||e.node==='retryBegin'){await begin(c);return;}
  if(e.node==='suggest'){if(c.state.sendDisabled)return;const suggestion=c.state.suggestions.find(s=>s.id===e.value);if(suggestion){const draft=c.state.draft?c.state.draft+'\n'+suggestion.text:suggestion.text;set(c,'draft',draft);set(c,'draftRows',Math.min(10,Math.max(3,draft.split('\n').length+Math.ceil(draft.length/48))));await focus(c,'draft');}return;}
  if(e.node==='send'){await send(c);return;}
  if(e.node==='latestMessages'){readingHistory=false;await messages(c);return;}
  if(e.node==='nextMessages'){if(cursor)try{await messages(c,true);}catch{set(c,'error','这页故事已变化，请刷新。');}return;}
 }
};
