import {ok,modeText,isTerminal,terminalText,companionRows} from './roleplay-model.js';
const labels={'self':'自身境况',people:'人物关系',belongings:'随身物件',world:'地点与见闻',saves:'存档与继续'};
const set=(c,k,v)=>c.set('component.'+k,v);
let summary={},visible={},run={},revision='',epoch='',busy=false,refreshing=false,serial=0,tab='self',saveId='';
function render(c){set(c,'tab',tab);set(c,'heading',labels[tab]);set(c,'tabs',Object.entries(labels).map(([id,label])=>({id,label,selected:id===tab?'true':'false'})));set(c,'isSaves',tab==='saves');set(c,'rows',run.status==='terminal'?[{id:'terminal',label:'人生终局',text:terminalText(run)}]:companionRows(tab,summary,visible));}
async function refresh(c){
 if(refreshing)return;refreshing=true;set(c,'loading',true);set(c,'saveDisabled',true);set(c,'restoreDisabled',true);
 try{
  run=ok(await c.bridge.snapshot('run'));set(c,'modeLabel',modeText(run.mode));set(c,'ironman',run.mode==='ironman');set(c,'terminal',isTerminal(run));set(c,'terminalText',isTerminal(run)?terminalText(run):'');
  if(run.status==='terminal'){summary={};visible={};set(c,'saves',[]);render(c);set(c,'error','');return;}
  const receipt=await c.bridge.snapshot('session');revision=ok(receipt).revisionId;epoch=receipt.epoch;
  summary=ok(await c.bridge.page('roleplay_summary',{})).find(r=>r.id==='main')?.value||{};
  visible=ok(await c.bridge.page('roleplay_visible',{})).find(r=>r.id==='main')?.value||{};
  const saves=ok(await c.bridge.page('saves',{}));set(c,'saves',saves.map(s=>({id:s.saveId,label:s.displayName||'已保存的存档',selected:s.saveId===saveId?'true':'false'})));
  render(c);set(c,'saveDisabled',busy||run.status!=='active');set(c,'restoreDisabled',busy||run.mode!=='ordinary'||run.status==='pending');set(c,'error','');
 }catch(e){set(c,'error','资料未能完整读取。请刷新后再保存或恢复。');}
 finally{refreshing=false;set(c,'loading',false);}
}
async function poll(c){for(;;){await c.scheduler.timer(1800);if(busy||refreshing)continue;try{const r=await c.bridge.snapshot('session');if(ok(r).revisionId!==revision||r.epoch!==epoch){saveId='';set(c,'restoreReview',false);await refresh(c);}}catch{/* Terminal run can remain readable after its Session is cleaned. */}}}
export default {
 async init(c){await refresh(c);void poll(c);},
 async event(c,e){
  if(e.type!=='click'||busy)return;
  if(e.node==='drawer-tabs'){await c.scheduler.yield();tab=c.state.tab;saveId='';set(c,'restoreReview',false);render(c);await refresh(c);return;}
  if(e.node==='drawer-refresh'){await refresh(c);return;}
  if(e.node==='save-list'){if(c.state.restoreDisabled)return;await c.scheduler.yield();saveId=c.state.saveId;set(c,'saveId',saveId);set(c,'restoreReview',true);set(c,'saves',c.state.saves.map(s=>({...s,selected:s.id===saveId?'true':'false'})));return;}
  if(e.node==='cancelRestore'){saveId='';set(c,'restoreReview',false);await refresh(c);return;}
  if(e.node==='save'||e.node==='restore'){
   if(e.node==='save'&&c.state.saveDisabled||e.node==='restore'&&(c.state.restoreDisabled||!saveId||!c.state.restoreReview))return;
   busy=true;set(c,'busy',true);set(c,'saveDisabled',true);set(c,'restoreDisabled',true);set(c,'error','');
   const id=e.node,input=id==='save'?{displayName:summary.player.name+' · 第 '+(Math.floor(summary.progress.minutes/1440)+1)+' 日'}:{saveId};
   try{ok(await c.bridge.invoke(id,input,{revision,epoch,idempotencyKey:'lives-'+id+'-'+c.clock()+'-'+ ++serial}));set(c,'notice',id==='save'?'当前进度已保存。':'已回到所选存档。');saveId='';set(c,'restoreReview',false);}
   catch(err){set(c,'error',(id==='save'?'保存':'恢复')+'尚未确认。先刷新当前进度，再决定是否重试。');}
   finally{busy=false;set(c,'busy',false);await refresh(c);try{await c.scheduler.frame();await c.node('closeCompanion','focus');}catch{}}return;
  }
 }
};
