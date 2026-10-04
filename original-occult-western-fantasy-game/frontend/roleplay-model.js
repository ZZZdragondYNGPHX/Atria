import {data} from './roleplay-catalog.js';
export const ok=r=>{if(!r?.ok)throw Error(r?.error?.code||'bridge_transport_failed');return r.data;};
export const modeText=mode=>mode==='ironman'?'铁人模式：只续当前进度，不能回退；死亡后清理本局保存。':'普通模式：可保存并明确恢复较早经历。';
export const isTerminal=run=>['dead','terminal'].includes(run.status);
export const terminalText=run=>run.mode==='ironman'?'规则已确认死亡。本局不能续玩或恢复旧进度。'+(run.cleanup==='complete'?'宿主已完成本局保存清理。':'宿主正在处理本局保存清理；重新读取可检查完成状态。'):'规则已确认死亡。你可以在随身记事的保存页明确选择一份较早保存，恢复那时的经历。';
export const locationLabel=(id,visible={})=>data.places.find(p=>p.id===id)?.label||Object.values(visible.entries||{}).find(e=>e.known&&e.id===id)?.name||'当前地点';
export function startReview(state){
 const conflict=data.incompatibilities.find(c=>c.residence===state.residence&&c.attachment===state.attachment);
 if(conflict)throw Error(conflict.reason);
 if(!state.name.trim()||state.name.trim().length>48)throw Error('请写下 1–48 字称呼。');
 if(state.appearance.length>160)throw Error('个人修饰最多 160 字。');
 const options=data.questions.map(q=>{const o=q.options.find(o=>o.id===state[q.id]);if(!o)throw Error('请回答：'+q.prompt);return o;});
 return state.name.trim()+'，一位普通成年人。\n'+modeText(state.mode)+'\n\n'+options.map(o=>o.text).join('\n\n')+'\n\n随身生活钱：'+options[1].coins+' 枚硬币。'+(state.appearance?'\n个人修饰：'+state.appearance:'');
}
export function background(summary){const p=summary.player;return p.name+'，普通成年人。\n'+Object.values(p.background).join('\n\n')+'\n\n'+summary.relation.text+(p.appearance?'\n\n个人修饰：'+p.appearance:'');}
export function suggestions(summary){
 const at=summary.player.location;
 const lines=at==='location.old_ferry'?[['work','打听一份短工','我想在渡口找一份修补或搬运短工，先问清能做的事。'],['talk','去旅舍看看','我沿路去三渡旅舍，打听今天的床位。']]:at==='location.lodging'?[['talk','与米拉交谈','我向公开柜台的米拉问好，问问今天附近有什么消息。'],['work','询问抄写工作','我想在旅舍接一份普通抄写工作。']]:[['talk','向这里的人请教','我向这里的公开接待人员问好，问问我可以了解什么。'],['rest','稍作休息','我想在这里歇一会儿，缓一缓疲劳。']];
 if(summary.progress.episode==='closed')lines.unshift(['continue','继续生活','我想继续生活，展开下一段经历。']);
 return lines.slice(0,3).map(([id,label,text])=>({id,label,text}));
}
const row=(id,label,text)=>({id,label,text:String(text||'尚无公开记录。')});
export function companionRows(tab,s,v){
 if(!s.player?.started)return [row('empty','故事尚未开始','请先确认你的生活境况。')];
 if(tab==='self')return [row('identity',s.player.name,background(s)),row('condition','眼下境况',[s.conditions.injured?'有伤在身。':'未记录受伤。',s.conditions.tired?'感到疲劳。':'未记录疲劳。',s.conditions.notice,s.pursuit.stage?'已知追查：'+s.pursuit.knownFact:''].filter(Boolean).join('\n')),row('claim','超凡与义务',s.claim.accepted?[s.claim.active?'当前能力可用。':'当前能力不可用。',s.claim.rule,'锚点：'+s.claim.anchor,'代价：'+s.claim.price,s.claim.breached?'已记录违约；维护与补救仍须满足实际条件。':''].filter(Boolean).join('\n'):'尚未取得超凡能力。可从公开礼仪、课程或已知机会开始了解。')];
 if(tab==='people')return [row('relation',s.relation.created?s.relation.name:'独自生活',s.relation.text+(s.relation.created?'\n'+(s.relation.kept?'约定已履行。':s.relation.overdue?'约定已逾期。':'关系与约定仍在。'):'')),...Object.values(v.entries||{}).filter(e=>e.known&&e.kind==='person').map(e=>row(e.id,e.name,e.description+'\n所在：'+locationLabel(e.parentId,v)))];
 if(tab==='belongings')return [row('coins','生活资源',s.economy.coins+' 枚硬币。'+(s.economy.arrears?'\n拖欠：'+s.economy.arrears+' 枚硬币。':'')),row('tool','随身物件',({repair_kit:'普通修补工具。',writing_kit:'笔与纸。',none:'未记录专用工具。'})[s.player.tool]),...(s.claim.accepted?[row('carrier','见证载体',s.claim.anchor+(s.conditions.carrierBroken?'\n载体已损坏。':''))]:[])];
 if(tab==='world')return [row('place',locationLabel(s.player.location,v),data.places.find(p=>p.id===s.player.location)?.text||'已公开的本地地点。'),...Object.values(s.routes).filter(r=>r.contacted).map((r,i)=>row('institution_'+i,r.institutionName,(r.witnessed?'已经亲自复核见证。':r.taught?'已参加学习。':'已接触公开接待。')+'加入与义务以实际经历为准。')),...Object.values(v.entries||{}).filter(e=>e.known&&e.kind!=='person').map(e=>row(e.id,e.name,e.description+'\n所在：'+locationLabel(e.parentId,v)+(e.fulfilled?'\n已完成，仍保留这段见闻。':'')))];
 return [];
}
