import {people,places,available,whereabouts} from '../runtime/public.js';
import {ok,row,put,read,readGame,operation,focus,audioLabel,syncAudio} from './client.js';
import {images} from './media-catalog.js';
let revision='',game=null,view=null,refreshing=false,selected='',seen=0,serial=0,pending=null,queue=[],paragraphs=[],reading=0,autoToken=0;
function showParagraph(c){put(c,'body',paragraphs[reading]||'');put(c,'hasNext',reading<paragraphs.length-1);put(c,'hasPrevious',reading>0);put(c,'readProgress',paragraphs.length>1?(reading+1)+' / '+paragraphs.length:'');}
const open=(c,mode,id='')=>{autoToken++;put(c,'auto',false);c.emit('open',{mode,id});};
function update(c){
 put(c,'time',view.time+' · 本段余 '+(game.spent_ap===24?0:2-game.spent_ap%2)+' 次');put(c,'place',view.place);put(c,'weather',view.weather);
 put(c,'resources','粮 '+game.stock.supplies+'　燃 '+game.stock.fuel+'　件 '+game.stock.parts);
 put(c,'scene',{kind:'exact',id:!game.started&&!c.state.creation?'cover':images.includes(view.image)?view.image:'inn-day'});const present=view.people.filter(p=>p.here&&p.available);
 if(!present.some(p=>p.id===selected))selected=present.find(p=>images.includes(p.id))?.id||present[0]?.id||'';
 put(c,'hasPortrait',!!selected&&!game.final_plan&&images.includes(selected));if(selected&&images.includes(selected))put(c,'portrait',{kind:'exact',id:selected});
 put(c,'people',present.map(p=>row(p.id,p.name)));put(c,'continued',game.started);put(c,'playing',game.started);put(c,'title',!game.started&&!c.state.creation);
 const primary=['ration','repair','investigate','meal','wait','final','echo'];
 let actions=view.actions.filter(a=>primary.includes(a.kind));if(selected)actions=[...view.actions.filter(a=>a.kind==='talk'&&a.target===selected),...actions];
 put(c,'actions',actions.slice(0,8).map(a=>row(a.id,a.label,'',!a.enabled,a.reason)));put(c,'final',game.spent_ap===24&&!game.final_plan);put(c,'ended',!!game.final_plan);
 put(c,'goal',game.ration_pending?'刚才的工作已结算，请单独安排当夜配给。':game.spent_ap===24&&!game.final_plan?'普通行动结束。核对准备后免费确认最终安排；安全留守始终可达。':game.final_plan?'三天已经留下记录。你可以回看、保存或返回 Atria。':'第三夜结束前安排去处。查看、普通移动和回看不推进时间。');
 if(game.sequence!==seen){seen=game.sequence;autoToken++;paragraphs=game.last.body.split(/\n+/).filter(Boolean);reading=0;showParagraph(c);put(c,'speaker',game.last.title);put(c,'receipt',game.last.summary);put(c,'narrative','');put(c,'epilogues',view.epilogues.map(p=>row(p.id,p.name,p.text)));}
}
async function refresh(c){if(refreshing)return;refreshing=true;try{const before=await read(c,'session');const data=await readGame(c);const after=await read(c,'session');if(before.revisionId!==after.revisionId)throw Error('changed_during_read');revision=after.revisionId;game=data.game;view=data.view;update(c);try{const messages=ok(await c.bridge.snapshot('messages',{}));const last=messages.filter(m=>m.role==='assistant').at(-1);if(last)put(c,'narrative',last.content);}catch{}try{put(c,'sound',audioLabel(await syncAudio(c,game)));}catch{put(c,'sound','声音暂不可用，文字与行动完整');}put(c,'notice','当前记录已核对');put(c,'error','');}catch(e){put(c,'error','读取尚未完成，输入仍保留。请核对当前结果或从菜单恢复。');}finally{refreshing=false;put(c,'loading',false);}}
async function submitStart(c){if(pending)return;if(refreshing||!revision){put(c,'notice','正在核对初始进度，请读取完成后再开始。');return;}const name=c.state.name.trim();if(!name||name.length>48){put(c,'error','请写下 1—48 字称呼。');await focus(c,'name');return;}
 pending={kind:'start',target:'',detail:'',text:JSON.stringify({name,preference:c.state.preference}),token:'start-'+c.clock()+'-'+ ++serial};put(c,'busy',true);put(c,'notice','正在接过这三天的托付…');
 try{ok(await c.bridge.invoke('act',pending,{revision,idempotencyKey:pending.token}));put(c,'creation',false);await refresh(c);pending=null;}catch(e){await refresh(c);if(game?.started){pending=null;put(c,'creation',false);}else put(c,'error','开始尚未确认。先核对结果，草稿仍在；未确认前不会另发一笔。');}finally{put(c,'busy',false);}}
async function send(c){if(c.state.busy||!game?.started)return;const text=c.state.draft.trim();if(!text){put(c,'error','先写下眼前想做的事。');return;}put(c,'busy',true);put(c,'notice','正在理解你的打算；时间和物资没有变化。');put(c,'error','');
 try{const options=view.actions.map(a=>({id:a.id,label:a.label,note:a.note+(a.enabled?'':'；当前条件：'+a.reason)}));const result=await operation(c,'intent',{text,options});queue=result.candidates.map(id=>view.actions.find(a=>a.id===id)).filter(Boolean);put(c,'candidates',queue.map(a=>row(a.id,a.label,'',false,a.costText)));put(c,'hasCandidates',!!queue.length);put(c,'notice',result.clarification||'理解完成。请逐项打开方案，查看代价后确认。');}
 catch(e){put(c,'error','理解请求没有完成，原文仍在；未提交任何行动，可安全修改后再试。');}finally{put(c,'busy',false);}}
async function poll(c){for(;;){await c.scheduler.timer(1400);if(refreshing||c.state.busy)continue;try{const s=await read(c,'session');if(s.revisionId!==revision)await refresh(c);}catch{}}}
export default {
 update(c){put(c,'fontClass',c.props.settings.large?'stage large':'stage');},
 async init(c){await refresh(c);try{const p=await read(c,'persona');if(p.name)put(c,'name',p.name.slice(0,48));}catch{}void poll(c);},
 async event(c,e){
  if(e.type==='click'&&['present-events','actions-events','candidate-events'].includes(e.node))e={...e,node:e.targetNode,value:e.targetValue};
  if(e.type==='keydown'&&e.node==='draft'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){await send(c);return;}if(e.type!=='click')return;
  if(e.node==='refresh'){await refresh(c);return;}if(e.node==='stop'){try{ok(await c.bridge.invoke('cancel',{}));put(c,'notice','已请求停止；正在核对是否已提交。');await refresh(c);}catch{put(c,'error','停止状态未知，请核对当前结果。');}return;}
  if(e.node==='title-exit'){open(c,'exit');return;}if(e.node==='title-settings'||e.node==='menu'||e.node==='ending-menu'){open(c,'settings');return;}
  if(c.state.busy)return;
  if(e.node==='new'){if(game?.started){open(c,'new');return;}put(c,'title',false);put(c,'creation',true);put(c,'scene',{kind:'exact',id:'inn-day'});await focus(c,'name');return;}
  if(e.node==='creation-back'){put(c,'creation',false);put(c,'title',true);put(c,'scene',{kind:'exact',id:'cover'});return;}
  if(e.node==='continue'){put(c,'title',false);put(c,'playing',true);return;}
  if(e.node==='persona'){ok(await c.bridge.invoke('personaSelect',{}));const p=await read(c,'persona');if(p.name)put(c,'name',p.name.slice(0,48));return;}
  if(e.node==='begin'||e.node==='enable-sound'){if(e.node==='enable-sound')try{put(c,'sound',audioLabel(ok(await c.bridge.invoke('audioEnable',{}))));}catch{}await submitStart(c);return;}
  if(e.node==='map'){open(c,'map');return;}if(e.node==='people'){open(c,'people');return;}if(e.node==='resources'){open(c,'resources');return;}if(e.node==='notes'){open(c,'notes');return;}
  if(e.node==='observe'){open(c,'observe');return;}if(e.node==='messages'){open(c,'messages');return;}
  if(e.node==='preference-calm'||e.node==='preference-direct'){put(c,'preference',e.node==='preference-calm'?'平和':'简洁直接');return;}
  if(e.node==='log'){open(c,'log');return;}if(e.node==='final'){open(c,'final');return;}
  if(e.node==='action'||e.node==='candidate'){const id=e.value;open(c,'preview',id);return;}
  if(e.node==='select-person'){selected=e.value;update(c);put(c,'speaker',people[selected].name);put(c,'body','“'+people[selected].greeting+'”');put(c,'receipt','普通问候 · 不推进时间');put(c,'narrative','');open(c,'person',selected);return;}
  if(e.node==='hide'){put(c,'hidden',true);return;}if(e.node==='show'){put(c,'hidden',false);return;}
  if(e.node==='next-paragraph'||e.node==='previous-paragraph'){autoToken++;reading=Math.max(0,Math.min(paragraphs.length-1,reading+(e.node==='next-paragraph'?1:-1)));showParagraph(c);return;}
  if(e.node==='auto'){const token=++autoToken;put(c,'notice','AUTO 仅阅读已有段落；所有安排都等你确认。');if(game.ration_pending||game.spent_ap===24)return;while(reading<paragraphs.length-1){await c.scheduler.timer(5500);if(token!==autoToken||c.state.busy||c.state.draft)return;reading++;showParagraph(c);}return;}
  if(e.node==='send'){await send(c);return;}
 }
};
