import {data} from './roleplay-catalog.js';
export const ok=r=>{if(!r?.ok)throw Error(r?.error?.code||'bridge_transport_failed');return r.data;};
export const modeText=mode=>mode==='ironman'?'铁人模式：只能继续当前进度，无法回退；死亡后清除本局存档。':'普通模式：可以保存，也可以读取较早的存档。';
export const isTerminal=run=>['dead','terminal'].includes(run.status);
export const terminalText=run=>run.mode==='ironman'?'这一生已经结束，无法继续，也不能读取旧存档。'+(run.cleanup==='complete'?'本局存档已清除。':'宿主正在处理本局保存清理；刷新可检查完成状态。'):'这一生已经结束。你可以打开随身记事，在存档页选择较早的存档，回到那时的经历。';
export const locationLabel=(id,visible={})=>data.places.find(p=>p.id===id)?.label||Object.values(visible.entries||{}).find(e=>e.known&&e.id===id)?.name||'当前地点';
export function startReview(state){
 const conflict=data.incompatibilities.find(c=>c.residence===state.residence&&c.attachment===state.attachment);
 if(conflict)throw Error(conflict.reason);
 if(!state.name.trim()||state.name.trim().length>48)throw Error('请写下 1–48 字称呼。');
 if(state.appearance.length>160)throw Error('外观或态度最多 160 字。');
 const options=data.questions.map(q=>{const o=q.options.find(o=>o.id===state[q.id]);if(!o)throw Error('请回答：'+q.prompt);return o;});
 return state.name.trim()+'，一位普通成年人。\n'+modeText(state.mode)+'\n\n'+options.map(o=>o.text).join('\n\n')+'\n\n随身生活钱：'+options[1].coins+' 枚硬币。'+(state.appearance?'\n外观或态度：'+state.appearance:'');
}
export function background(summary){const p=summary.player;return p.name+'，普通成年人。\n'+Object.values(p.background).join('\n\n')+'\n\n'+summary.relation.text+(p.appearance?'\n\n外观或态度：'+p.appearance:'');}
export function suggestions(summary){
 const at=summary.player.location;
 const lines=at==='location.old_ferry'?[['work','打听一份短工','我想在渡口找一份修补或搬运短工，先问清能做的事。'],['talk','去旅舍看看','我沿路去三渡旅舍，打听今天的床位。']]:at==='location.lodging'?[['talk','与米拉交谈','我走到柜台前，向米拉问好，问她今天附近有什么消息。'],['work','询问抄写工作','我想问问旅舍有没有抄写的活。']]:[['talk','向这里的人请教','我向这里的接待人员问好，问问这里有什么值得了解的事。'],['rest','稍作休息','我想在这里歇一会儿，缓一缓疲劳。']];
 if(summary.progress.episode==='closed')lines.unshift(['continue','继续生活','我想继续生活，展开下一段经历。']);
 return lines.slice(0,3).map(([id,label,text])=>({id,label,text}));
}
const row=(id,label,text)=>({id,label,text:String(text||'尚无公开记录。')});
export function companionRows(tab,s,v){
 if(!s.player?.started)return [row('empty','故事尚未开始','请先确认你的生活境况。')];
 if(tab==='self')return [row('identity',s.player.name,background(s)),row('condition','眼下境况',[s.conditions.injured?'有伤在身。':'目前没有伤势。',s.conditions.tired?'感到疲劳。':'目前精神尚好。',s.conditions.notice,s.pursuit.stage?'已知追查：'+s.pursuit.knownFact:''].filter(Boolean).join('\n')),row('claim','超凡与义务',s.claim.accepted?[s.claim.active?'当前能力可用。':'当前能力不可用。',s.claim.rule,'锚点：'+s.claim.anchor,'代价：'+s.claim.price,s.claim.breached?'你已违约，需要履行相应义务才能补救。':''].filter(Boolean).join('\n'):'尚未获得超凡能力。可以先去参加礼仪或课程，了解它们的用途与代价。')];
 if(tab==='people')return [row('relation',s.relation.created?s.relation.name:'独自生活',s.relation.text+(s.relation.created?'\n'+(s.relation.kept?'约定已履行。':s.relation.overdue?'约定已逾期。':'关系与约定仍在。'):'')),...Object.values(v.entries||{}).filter(e=>e.known&&e.kind==='person').map(e=>row(e.id,e.name,e.description+'\n所在：'+locationLabel(e.parentId,v)))];
 if(tab==='belongings')return [row('coins','生活资源',s.economy.coins+' 枚硬币。'+(s.economy.arrears?'\n拖欠：'+s.economy.arrears+' 枚硬币。':'')),row('tool','随身物件',({repair_kit:'普通修补工具。',writing_kit:'笔与纸。',none:'没有专用工具。'})[s.player.tool]),...(s.claim.accepted?[row('carrier','见证载体',s.claim.anchor+(s.conditions.carrierBroken?'\n载体已损坏。':''))]:[])];
 if(tab==='world')return [row('place',locationLabel(s.player.location,v),data.places.find(p=>p.id===s.player.location)?.text||'已公开的本地地点。'),...Object.values(s.routes).filter(r=>r.contacted).map((r,i)=>row('institution_'+i,r.institutionName,(r.witnessed?'已经亲自复核见证。':r.taught?'已参加学习。':'曾来这里问询。')+'是否加入、承担什么义务，要看之后的经历。')),...Object.values(v.entries||{}).filter(e=>e.known&&e.kind!=='person').map(e=>row(e.id,e.name,e.description+'\n所在：'+locationLabel(e.parentId,v)+(e.fulfilled?'\n已完成，仍保留这段见闻。':'')))];
 return [];
}
