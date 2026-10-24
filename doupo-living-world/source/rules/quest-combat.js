import {activeEncounter,startEncounter,joinEncounter,emptyEncounter,member} from './combat.js';
import {canPerceive} from './perception.js';
const threat=(c,t)=>c.w.conflicts.find(f=>f.status==='active'&&activeEncounter(f.encounter)&&f.place===c.p.place&&[f.a,f.b].includes(t.target)&&f.encounter.participants.some(m=>{const p=c.row(m.id)?.value;return p&&canPerceive(c.p,p);}));
export function combatQuestEligible(c,t){
 if(t.id==='QC30'){const n=c.row(t.target)?.value;return !!n?.alive&&n.hp>=65&&n.injury<=20&&!n.destination&&['','rest','train'].includes(n.activity.kind);}
 return !!threat(c,t);
}
export function performCombatQuest(c,q,t,choice){
 const fail=text=>({ok:false,code:'quest_conditions',text,spent:0,complete:false});
 const ev=(kind,target,text)=>{q.evidence.push({kind,target,place:c.p.place,at:c.w.time,text:text.slice(0,256)});if(q.evidence.length>8)q.evidence.shift();q.progress=text;};
 const started=q.evidence.find(e=>e.kind==='combat_start');
 if(started){
  const receipt=q.evidence.find(e=>e.kind==='combat_result'&&e.target===started.target);
  if(!receipt)return fail('交锋尚未按真实目标结束，请完成本次接触。');
  const outcome=JSON.parse(receipt.text);
  const success=outcome.contributed&&(t.id==='QC28'?outcome.result==='protected'&&outcome.protectedAlive:t.id==='QC29'?outcome.alive&&outcome.result!=='protection_failed':outcome.alive&&outcome.result==='proof_completed'&&outcome.winner==='a');
  if(!success)return fail('本次真实结果未满足约定；可以清算或放弃，不能凭胜利标签补发成果。');
  q.choice=choice;q.earned=q.reward;q.progress=t.id==='QC28'?'受援者实际抵达出口，物资与伤势保留。':t.id==='QC29'?'原接触已经停止，双方均存活；不声明永久和解。':'完成双方同意的徒手三轮演武，未伪造药师或宗门认证。';
  return {ok:true,code:'quest_work_complete',text:q.progress,spent:0,complete:true};
 }
 if(activeEncounter(c.w.combat))return fail('已有玩家交锋尚未结束。');
 if(t.id==='QC30'){
  const start=startEncounter(c,'player',t.target,{spar:true});
  if(start.error)return fail(start.error);
  c.w.combat=start.encounter;
 }else{
  const f=threat(c,t);if(!f)return fail('当前没有本人可见且威胁目标的真实冲突。');
  const e=f.encounter,side=member(e,t.target)?.side;
  const error=joinEncounter(c,e,'player',side);if(error)return fail(error);
  if(e.phase!=='choice')member(e,'player').status='waiting';
  if(side!=='a'){for(const m of e.participants)m.side=m.side==='a'?'b':m.side==='b'?'a':m.side;}
  e.enemy=e.participants.find(m=>m.side!=='a'&&m.side!=='neutral')?.id||'';
  e.objective=t.id==='QC28'?'protect':'stop';e.protected=t.id==='QC28'?t.target:'';
  c.w.combat=e;f.status='foreground';f.encounter=emptyEncounter();
 }
 ev('combat_start',c.w.combat.id,'接入实际交锋；约定目标为'+c.w.combat.objective+'，成果只能由真实接触产生。');
 q.choice=choice;
 return {ok:true,code:'quest_progress',text:q.progress,spent:0,complete:false};
}
