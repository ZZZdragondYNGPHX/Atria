import {DAY,placeOf} from '../content/catalog.js';
import {copy,qty,add,idleActivity} from './state.js';
import {realm} from './realm.js';
import {artById,artKnown,artReason,mastery,resources,improve,recoverQi,cancelStudy} from './progression.js';
import {capabilities,injure,treatCondition,awarenessRestriction} from './condition.js';
import {gearEffects,wear,ward} from './equipment.js';
import {canPerceive} from './perception.js';
import {pathTo,lineClear,occupiedAt,reachablePositions} from './spatial.js';
export {lineClear} from './spatial.js';
import {contentSha256 as sha} from './hash.js';
import {recordCombatQuestResult} from './combat-results.js';
import {emptyEncounter,activeEncounter,member} from './combat-state.js';
export {emptyEncounter,activeEncounter,member} from './combat-state.js';

export const ROUND_MINUTES=1;
export const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const participant=(id,side,at)=>({id,side,joined:at,status:'active',actions:0,harmFrom:[],guard:0,shield:0,reaction:'',cover:'',evade:0,flight:false,statuses:[],resistUntil:0});
const random=(e,key)=>parseInt(sha(e.seed+'|'+e.round+'|'+key).slice(0,8),16)%100;
const log=(e,actor,code,text,target='')=>{e.log.push({round:e.round,actor,target,code,text:text.slice(0,256)});if(e.log.length>24)e.log.shift();};
const usable=(e,r)=>r?.value.alive&&r.value.hp>10&&r.value.place===e.place&&member(e,r.id)?.status==='active';
const find=(c,id)=>c.rows.find(r=>r.id===id);
const visible=(c,who,id)=>{const other=find(c,id);return other&&(who.id===id||canPerceive(who.value,other.value));};
export function joinEncounter(c,e,id,side){
 const r=find(c,id);if(!r?.value.alive||r.value.place!==e.place||member(e,id))return '无法重复入场或隔地加入';
 if(c.w.conflicts.some(f=>f.encounter?.id!==e.id&&activeEncounter(f.encounter)&&member(f.encounter,id))||activeEncounter(c.w.combat)&&c.w.combat.id!==e.id&&member(c.w.combat,id))return '人物已被另一场交锋占用';
 const n=c.touch(id);
 if(n.activity.kind&&n.activity.kind!=='conflict'){
  c.pause?.(r);if(!n.suspended.kind)n.suspended={...copy(n.activity),pausedAt:c.w.time};
 }
 if(n.study.switching.kind)cancelStudy(n);
 if(['learn','switch'].includes(n.suspended.kind))n.suspended=idleActivity();
 for(const held of c.rows.filter(r=>r.value.control.holder===id))if(!c.w.releases.includes(held.id))c.w.releases.push(held.id);
 n.activity={...idleActivity(),kind:'conflict',target:e.id,started:c.w.time,due:c.w.time+ROUND_MINUTES,source:e.id};
 n.next=Math.min(n.next,c.w.time+ROUND_MINUTES);e.participants.push(participant(id,side,e.round));
 log(e,id,'joined',n.name+'实际加入交锋。');return '';
}
export function startEncounter(c,a,b,{id,reason='hostility',objective='disengage',protectedId='',spar=false,initiator=a}={}){
 const one=find(c,a),two=find(c,b);
 if(!one||!two||a===b||!canPerceive(one.value,two.value)||one.value.place!==two.value.place||distance(one.value,two.value)>9)return {error:'双方没有实际接触'};
 if(activeEncounter(c.w.combat)&&[a,b].some(id=>member(c.w.combat,id)))return {error:'人物已有未结束交锋'};
 if([one,two].some(r=>c.w.conflicts.some(f=>activeEncounter(f.encounter)&&member(f.encounter,r.id))))return {error:'人物已经参与另一场交锋'};
 if(spar&&(two.value.species||two.value.hp<65||two.value.injury>20||!['','rest','train'].includes(two.value.activity.kind)||capabilities(two.value).communicate||c.level?.(two.value,one.value)<0))return {error:'对方根据当前伤势、安排或关系拒绝切磋'};
 const e={...emptyEncounter(),id:id||'battle-'+sha(a+'|'+b+'|'+c.w.time+'|'+c.w.serial).slice(0,36),enemy:b,round:1,phase:'choice',place:one.value.place,
  reason:spar?'spar':reason,objective:spar?'proof':objective,protected:protectedId,started:c.w.time,seed:sha(id||a+'|'+b+'|'+c.w.time+'|'+c.w.serial)};
 const err=joinEncounter(c,e,a,'a')||joinEncounter(c,e,b,'b');if(err)return {error:err};
 if(a==='player'){
  for(const key of c.w.companions){const ally=find(c,key);if(ally&&ally.value.place===e.place&&canPerceive(one.value,ally.value)&&ally.value.hp>=40&&!ally.value.control.holder&&['','rest','train'].includes(ally.value.activity.kind))joinEncounter(c,e,key,'a');}
 }
 c.history('conflict_started',[initiator,a===initiator?b:a,e.id],spar?one.value.name+'在对方同意后开始切磋。':find(c,initiator).value.name+'发起了当前敌对接触。');
 return {encounter:e};
}
const baseAction=(actor,kind,target='',item='',x=0,y=0,move=false)=>({actor,kind,target,item,x,y,move});
function definition(d){return d.kind==='technique'?artById(d.item)?.value:null;}
export function decisionReason(c,e,d,initial=false){
 const r=find(c,d.actor),m=member(e,d.actor);if(!usable(e,r))return '主体已失去作战能力或退出';
 const p=r.value,mental=awarenessRestriction(p);if(mental)return mental;
 if(!initial&&m.statuses.some(s=>s.kind==='bound'&&s.until>=e.round)&&!['surrender','accept','breathe'].includes(d.kind))return '短时拘束打断当前行动';
 if(d.move){if(capabilities(p).move)return capabilities(p).move;const path=pathTo(e.place,p,d,occupiedAt(c.rows,e.place,[r.id]));if(!path||path.length>2)return '基础位移仅允许两步可走路径，落点须未被占据';}
 const origin=d.move?{...p,x:d.x,y:d.y}:p,target=find(c,d.target),t=target?.value;
 if(e.reason==='spar'&&(d.kind==='consume'||d.kind==='technique'&&(artById(d.item)?.value.weapon||artById(d.item)?.value.material||['area','sweep','projectile','bind'].includes(artById(d.item)?.value.kind))))return '切磋约定三轮徒手对招，不用兵刃、道具、投射或强控';
 if(d.kind==='technique'){
  const entry=artById(d.item),reason=artReason(p,entry,c.w.time,{ready:true});if(reason)return reason;
  const a=entry.value;
  if(['evade','withdraw','flight','shield','parry','stabilize'].includes(a.kind)){
   if(a.move){const path=pathTo(e.place,origin,d,occupiedAt(c.rows,e.place,[r.id]));if(!path||path.length>a.move)return '身法落点受阻、已占用或超出实际路径范围';}
   return '';
  }
  if(a.kind==='area'){if(distance(origin,d)>a.range||!lineClear(e.place,origin,d))return '落点超出射程或被阻挡';return '';}
  if(!target||!visible(c,r,d.target)||!t.alive||t.place!==e.place)return '目标已不可感知或离场';
  if(a.kind==='cover'||a.kind==='signal'){if(d.target===d.actor||!member(e,d.target)||member(e,d.target).side!==m.side)return '需要另一位同场同方对象';}
  const range=a.kind==='rush'?a.range+a.move:a.range;
  if(distance(origin,t)>range||!lineClear(e.place,origin,t))return '目标超出射程或路径受阻';
  if(['strike','rush','sweep'].includes(a.kind)&&member(e,d.target)?.flight&&!m.flight)return '目标已实际腾空，当前近身斗技无法触及';
  if(a.kind==='rush'){const path=pathTo(e.place,origin,t,occupiedAt(c.rows,e.place,[r.id,d.target]));if(!path||path.length>a.move+a.range)return '突进的实际可走路径超过距离';}
 }else if(d.kind==='attack'){
  if(capabilities(p).attack)return capabilities(p).attack;
  if(member(e,d.target)?.flight&&!m.flight)return '目标已实际腾空，普通近身攻击无法触及';
  if(!t?.alive||!visible(c,r,d.target)||t.place!==e.place||distance(origin,t)>1||!lineClear(e.place,origin,t))return '普通攻击需要实际近身且路径畅通';
 }else if(d.kind==='consume'){
  if(d.item!=='medicine'||qty(p,d.item)<1||c.w.time-p.lastMedicine<60)return '缺少疗伤散或未到服药间隔';
  if(capabilities(p).grip)return capabilities(p).grip;
  if(d.target&&d.target!==r.id&&(!t?.alive||t.place!==e.place||!visible(c,r,d.target)||distance(origin,t)>1))return '救治对象不在可接触范围';
 }else if(d.kind==='prepare'){
  const entry=artById(d.item);if(!entry?.value.prepare)return '此招不需要蓄势';
  const reason=artReason(p,entry,c.w.time);if(reason)return reason;
  if(entry.value.material&&qty(p,entry.value.material)<1)return '缺少准备所需耗材';
  if(p.qi<5+resources(p).upkeep)return '蓄势需要五斗气，并支付辅助运转';
 }else if(d.kind==='rescue'){
  if(!t?.alive||t.place!==e.place||!visible(c,r,d.target)||t.hp>10||distance(origin,t)>1||capabilities(p).grip||member(e,d.target)?.side!==m.side)return '只能在近身且可持握时救援同方失能者';
 }else if(d.kind==='retreat'){
  if(capabilities(p).move)return capabilities(p).move;
 }else if(['surrender','negotiate'].includes(d.kind)){
  if(capabilities(p).communicate)return capabilities(p).communicate;
  if(!t?.alive||!visible(c,r,d.target)||distance(origin,t)>6||member(e,d.target)?.side===m.side)return '没有实际可沟通的对方';
  if(d.kind==='surrender'&&d.item){const amount=Number(d.item.slice(5));if(!/^gold:\d+$/.test(d.item)||!Number.isSafeInteger(amount)||amount>p.gold)return '提出的金币条件超过实际持有，或格式无效';}
 }else if(['surrender','accept','negotiate'].includes(d.kind)&&capabilities(p).communicate)return capabilities(p).communicate;
 else if(!['guard','breathe','surrender','accept','negotiate','move','rescue'].includes(d.kind))return '不是可执行的交锋行动';
 return '';
}
function approach(c,e,r,t,max=2,away=false){
 const p=r.value,s=placeOf(e.place);if(!s||capabilities(p).move)return null;
 const candidates=reachablePositions(e.place,p,max,occupiedAt(c.rows,e.place,[r.id])).map(at=>({...at,dist:distance(at,t.value)}));
 candidates.sort((a,b)=>(away?b.dist-a.dist:a.dist-b.dist)||a.path-b.path||a.x-b.x||a.y-b.y);return candidates[0]||null;
}
export function chooseDecision(c,e,id){
 const r=find(c,id),m=member(e,id),p=r.value;
 const offer=e.offers.find(o=>o.to===id&&['offered','truce_offered'].includes(o.status)&&find(c,o.actor)&&canPerceive(p,find(c,o.actor).value)&&distance(p,find(c,o.actor).value)<=6);
 if(offer&&!p.species&&p.traits.caution>=(offer.status==='truce_offered'?45:35)&&
  (offer.status!=='truce_offered'||c.level?.(p,find(c,offer.actor).value)>=0))return baseAction(id,'accept',offer.actor);
 if(e.objective==='protect'&&e.protected===id&&!capabilities(p).move)return baseAction(id,'retreat');
 const request=e.requests.find(q=>q.round===e.round&&q.actor===id&&q.reply==='accepted');
 if(request?.kind==='goal'&&request.item==='retreat')return baseAction(id,'retreat');
 const foes=e.participants.filter(t=>t.side!==m.side&&t.side!=='neutral'&&t.status==='active').map(t=>find(c,t.id)).filter(t=>t&&usable(e,t)&&canPerceive(p,t.value)).sort((a,b)=>Number(request?.kind==='goal'&&request.item==='focus'&&b.id===request.target)-Number(request?.kind==='goal'&&request.item==='focus'&&a.id===request.target)||distance(p,a.value)-distance(p,b.value)||a.id.localeCompare(b.id));
 const t=foes[0];if(!t)return baseAction(id,'guard');
 if(request?.kind==='action'){const proposed=baseAction(id,'technique',request.target,request.item);if(!decisionReason(c,e,proposed,true))return proposed;request.reply='adjusted';}
 if(p.hp<35&&qty(p,'medicine')&&c.w.time-p.lastMedicine>=60)return baseAction(id,'consume',id,'medicine');
 if(p.hp<25&&p.traits.caution>45)return baseAction(id,'retreat');
 if(p.qi<12&&!p.species)return baseAction(id,'breathe');
 const entries=p.study.library.map(k=>artById(k.id)).filter(a=>a?.value.type==='combat'&&!artReason(p,a,c.w.time,{ready:true})&&(e.reason!=='spar'||!a.value.weapon&&!a.value.material&&!['area','sweep','projectile','bind'].includes(a.value.kind)));
 const defensive=entries.find(a=>['shield','parry'].includes(a.value.kind));
 const flight=entries.find(a=>a.value.kind==='flight');if(flight&&!m.flight&&distance(p,t.value)>2)return baseAction(id,'technique',id,flight.id);
 if(defensive&&p.hp<60&&random(e,id+':defend')<35)return baseAction(id,'technique',id,defensive.id);
 const candidates=entries.filter(a=>['strike','rush','projectile','bind'].includes(a.value.kind)).sort((a,b)=>(b.value.power-b.value.qiCost/3)-(a.value.power-a.value.qiCost/3)||a.id.localeCompare(b.id));
 for(const a of candidates){const d=baseAction(id,'technique',t.id,a.id);
  if(p.species&&p.generation.origin==='kite'&&a.value.kind==='projectile'){const at=approach(c,e,r,t,2,true);if(at){Object.assign(d,{x:at.x,y:at.y,move:at.path>0});if(!decisionReason(c,e,d,true))return d;d.move=false;}}
  if(!decisionReason(c,e,d,true))return d;
 }
 const at=approach(c,e,r,t,2,p.species&&p.generation.origin==='kite');
 const d=baseAction(id,'attack',t.id,'',at?.x||0,at?.y||0,!!at&&at.path>0);if(!decisionReason(c,e,d,true))return d;
 if(at)return baseAction(id,'move','', '',at.x,at.y,true);
 return baseAction(id,'guard');
}
export function requestCompanion(c,e,args){
 if(e.phase!=='choice')return '本轮已经锁定';
 if(args.qty!==e.round)return '指令来自旧回合';
 const actor=find(c,'player'),r=find(c,args.target),m=member(e,args.target);
 if(!r||!m||m.side!==member(e,'player')?.side||r.id==='player'||!canPerceive(actor.value,r.value)||distance(actor.value,r.value)>6||capabilities(actor.value).communicate||capabilities(r.value).communicate)return '短令未能实际传达';
 if(e.requests.filter(q=>q.round===e.round).length>=2)return '本轮已传达两条短令';
 if(!['goal','action'].includes(args.detail)||args.detail==='goal'&&!['retreat','focus'].includes(args.item))return '短令只支持集火、撤离目标或具体已知斗技请求';
 let reply='accepted';
 if(r.value.hp<30||c.level?.(r.value,actor.value)<0||args.detail==='action'&&args.item&&!artKnown(r.value,artById(args.item)))reply='refused';
 const target=args.text||e.enemy;if(!(args.detail==='goal'&&args.item==='retreat')&&!visible(c,r,target))reply='refused';
 e.requests.push({round:e.round,actor:r.id,kind:args.detail==='action'?'action':'goal',item:args.item,target,reply});
 log(e,r.id,'request_'+reply,r.value.name+(reply==='accepted'?'收到短令，将依据现场自主执行。':'拒绝当前请求。'));
 return '';
}
export function lockRound(c,e,d){
 if(e.phase!=='choice')return '本轮已锁定，继续结算即可';
 const reason=decisionReason(c,e,d,true);if(reason)return reason;
 // Each NPC is collected under its own granted cognition on a later commit.
 // Its policy receives the encounter and observation, never the player's d.
 e.queue=[d];e.cursor=0;e.phase='collecting';return '';
}
const speed=(r,m)=>Math.max(0,realm(r.value.rank).speed+resources(r.value).drive+m.evade-(m.statuses.some(s=>s.kind==='unstable')?4:0)-Math.floor(r.value.injury/20));
const priority=d=>definition(d)?.priority||(['guard','accept'].includes(d.kind)?3:d.kind==='surrender'?2:0);
function finish(c,e){
 for(const m of e.participants){const r=find(c,m.id);if(!r)continue;
  if(!r.value.alive)m.status='dead';else if(r.value.hp<=10)m.status='incapacitated';else if(r.value.place!==e.place)m.status='left';
 }
 const sides=[...new Set(e.participants.filter(m=>m.status==='active'&&m.side!=='neutral').map(m=>m.side))];
 const protectedMember=member(e,e.protected),protectedPerson=find(c,e.protected),exit=placeOf(e.place)?.exit;
 if(e.objective==='protect'&&protectedPerson?.value.alive&&exit&&distance(protectedPerson.value,exit)<=1){e.result='protected';e.winner=protectedMember.side;}
 else if(e.objective==='protect'&&protectedMember?.status==='dead'){e.result='protection_failed';}
 else if(e.objective==='protect'&&!e.participants.some(m=>m.side===protectedMember?.side&&m.status==='active')){e.result='protection_failed';}
 else if(sides.length<=1&&e.objective!=='protect'){
  if(e.reason==='spar'){const safe=e.participants.every(m=>find(c,m.id)?.value.alive)&&!e.participants.some(m=>['left','withdrew','surrendered'].includes(m.status));e.result=safe?'proof_completed':'proof_stopped';e.winner=safe?'a':'';}
  else{e.result='contact_ended';e.winner=sides[0]||'';}
 }
 else if(e.reason==='spar'&&(e.phase==='resolving'&&e.round>=3&&e.queue.length>0&&e.cursor>=e.queue.length||e.participants.some(m=>find(c,m.id)?.value.hp<=30))){e.result='proof_completed';e.winner=e.participants.every(m=>find(c,m.id)?.value.alive)?'a':'';}
 if(!e.result)return;
 e.phase='closed';e.queue=[];e.enemy='';
 recordCombatQuestResult(c,e);
 c.history('conflict_closed',[e.id],e.result==='protected'?'保护对象已实际抵达出口。':'本次接触结束，伤势、消耗和未清事项持续。');
}
function hit(c,e,d,target,v,index,depth=0){
 const r=find(c,d.actor),p=r.value,t=target.value,tm=member(e,target.id);
 const noticed=canPerceive(t,p);
 const key=d.actor+':'+target.id+':'+index+':'+depth;
 const valid=d.actor===target.id||canPerceive(p,t);
 const cover=tm&&e.participants.find(m=>m.cover===target.id&&m.status==='active'&&distance(find(c,m.id).value,t)<=3);
 if(cover&&depth===0){const protector=find(c,cover.id);cover.cover='';log(e,protector.id,'intercept','援护者接下这次实际攻击。',target.id);return hit(c,e,d,protector,v,index,1);}
 const chance=Math.max(5,Math.min(99,(v.accuracy||94)+Math.min(5,Math.floor(mastery(p,d.item)/80))-(tm?.evade||0)*4-(valid?0:20)-(member(e,d.actor)?.statuses.some(s=>s.kind==='unstable')?15:0)));
 if(random(e,key+':hit')>=chance){log(e,d.actor,'miss',p.name+'出手后落空。',target.id);return;}
 const atk=realm(p.rank).strength,def=realm(t.rank).strength,gear=gearEffects(p),armor=gearEffects(t),resource=resources(p),resist=resources(t);
 const quality=d.kind==='technique'?Math.floor((resource.quality-100)/4):0;
 const raw=v.kind==='bind'&&!v.power?0:Math.max(0,Math.round(atk+(v.power||0)+quality+gear.attack+Math.floor(mastery(p,d.item)/30)-def*.72-armor.defense-resist.defense-(tm?.guard||0)));
 let damage=raw;
 if(tm?.shield){const absorbed=Math.min(tm.shield,damage);tm.shield-=absorbed;damage-=absorbed;log(e,target.id,'absorbed','护体吸收'+absorbed+'点作用。',d.actor);}
 if(damage>0)damage=Math.max(0,damage-ward(t));
 c.touch(target.id);c.touch(d.actor);wear(p,'hand',1);if(damage)wear(t,'body',1);
 if(damage){
  if(tm&&noticed&&!tm.harmFrom.includes(d.actor)&&tm.harmFrom.length<8)tm.harmFrom.push(d.actor);
  const before=t.hp,injuryBefore=t.injury,woundId='w-'+sha(e.id+'|'+e.round+'|'+key).slice(0,38);
  if(damage>=18&&t.condition.wounds.length<8){const part=t.species?'torso':random(e,key+':part')<50?'left_arm':'right_leg';
   if(!t.condition.missing.includes(part))injure(t,{id:woundId,part,kind:damage>=40?'fracture':'trauma',severity:Math.min(90,Math.ceil(damage/2)),at:c.w.time,source:e.id,cause:v.name||'普通攻击'});
  }
  // injure records the wound; the single resolved hit owns total HP/injury loss.
  t.hp=Math.max(0,before-damage);t.injury=Math.min(100,injuryBefore+Math.ceil(damage/6));
  if(damage>=12)t.study.prepared=[];
  log(e,d.actor,'damage',p.name+'对'+t.name+'造成'+damage+'点实际伤害。',target.id);
  if(!t.hp)c.death(target.id,'交锋重伤',{observations:false});
 }else log(e,d.actor,v.kind==='bind'&&!v.power?'control_contact':'unbroken',v.kind==='bind'&&!v.power?p.name+'的气索触及目标，继续检查实际抗性。':p.name+'命中，但没有穿透实际防护。',target.id);
 let controlled=false;
 if(v.status&&tm&&t.alive&&t.hp>10&&(v.status!=='bound'||tm.resistUntil<e.round)){
  const resistance=Math.max(0,(realm(t.rank).stage-realm(p.rank).stage)*25+resist.resistance);
  if(random(e,key+':status')>=resistance){controlled=true;const pending=e.queue.slice(e.cursor).some(q=>q.actor===target.id);tm.statuses=tm.statuses.filter(s=>s.kind!==v.status);tm.statuses.push({kind:v.status,until:e.round+(v.status==='bound'&&pending?0:1)});if(v.status==='bound')tm.resistUntil=e.round+2;log(e,d.actor,'control_applied','短时干扰实际生效；强控结束后保留两轮同类抗性。',target.id);}
 }
 if(tm?.reaction&&depth===0&&distance(p,t)<=1){const reaction=artById(tm.reaction),cost=reaction?.value.reactionCost||8;tm.reaction='';
  if(reaction&&t.qi>=cost&&!artReason(t,reaction,c.w.time)){t.qi-=cost;hit(c,e,baseAction(target.id,'technique',d.actor,reaction.id),r,{...reaction.value,power:6},0,1);}
 }
 return damage>0||controlled;
}
export function executeNext(c,e){
 if(e.phase==='collecting'){
  const next=e.participants.find(m=>m.status==='active'&&!e.queue.some(d=>d.actor===m.id));
  if(next){if(c.mindLoaded&&!c.mindLoaded(next.id))throw Error('ungranted combat cognition');e.queue.push(chooseDecision(c,e,next.id));}
  else e.phase='resolving';
  return;
 }
 if(e.phase==='cleanup'){
  const m=e.participants[e.cursor],r=m&&find(c,m.id);
  if(r?.value.alive){if(c.mindLoaded&&!c.mindLoaded(r.id))throw Error('ungranted aftermath cognition');const n=c.touch(m.id);if(n.activity.source===e.id)n.activity=idleActivity();n.next=Math.max(n.next,c.w.time+60);n.plan='交锋后重新检查原活动与持续伤势';n.study.prepared=[];c.aftermath?.(e,r);}
  e.cursor++;if(e.cursor>=e.participants.length)e.phase='closed';return;
 }
 if(e.phase!=='resolving')return;
 const remaining=e.queue.slice(e.cursor).sort((a,b)=>priority(b)-priority(a)||speed(find(c,b.actor),member(e,b.actor))-speed(find(c,a.actor),member(e,a.actor))||random(e,a.actor+':tie')-random(e,b.actor+':tie')||a.actor.localeCompare(b.actor));
 e.queue.splice(e.cursor,e.queue.length-e.cursor,...remaining);
 const d=e.queue[e.cursor++],r=find(c,d.actor),p=r?.value,m=member(e,d.actor);
 const reason=decisionReason(c,e,d);if(reason)log(e,d.actor,'invalid',reason,d.target);
 else{
  c.capture(e.id+'.'+e.round+'.'+d.actor,'conflict',[d.actor],'battle:'+e.id,d.actor==='player'?'owner':'scene',true);
  c.touch(d.actor);m.actions++;const v=definition(d),upkeep=resources(p).upkeep;p.qi=Math.max(0,p.qi-upkeep);
  if(d.move){p.x=d.x;p.y=d.y;log(e,d.actor,'moved',p.name+'按基础位移移动。');}
  if(d.kind==='technique'){
   let effective=false;
   p.qi-=v.qiCost;
   if(v.material)add(p,v.material,-1);
   if(v.prepare)p.study.prepared=p.study.prepared.filter(k=>k.id!==d.item);
   if(['evade','withdraw','rush','flight'].includes(v.kind)){
    if(v.kind==='rush'){const target=find(c,d.target),path=pathTo(e.place,p,target.value,occupiedAt(c.rows,e.place,[d.actor,d.target])),steps=Math.min(v.move,Math.max(0,path.length-1));if(steps){p.x=path[steps-1].x;p.y=path[steps-1].y;}}
    else if(v.kind==='flight'){m.flight=true;m.evade=3;}
    else{p.x=d.x;p.y=d.y;m.evade=v.kind==='evade'?4:2;}
   }
   if(v.kind==='shield')m.shield=v.power+Math.floor(resources(p).quality/10);
   else if(v.kind==='parry'){m.guard=12;m.reaction=d.item;}
   else if(v.kind==='cover')m.cover=d.target;
   else if(v.kind==='stabilize'){m.statuses=m.statuses.filter(s=>s.kind!=='unstable');m.evade=1;}
   else if(v.kind==='signal'){const ally=member(e,d.target);ally.statuses=ally.statuses.filter(s=>s.kind!=='unstable');ally.evade+=1;}
   else if(!['evade','withdraw','flight'].includes(v.kind)){
    let targets=v.kind==='area'?c.rows.filter(t=>t.value.alive&&t.value.place===e.place&&distance(t.value,d)<=v.radius&&lineClear(e.place,d,t.value)):v.kind==='sweep'?c.rows.filter(t=>t.id!==d.actor&&t.value.alive&&t.value.place===e.place&&distance(p,t.value)<=v.range&&lineClear(e.place,p,t.value)):[find(c,d.target)];
    for(const t of targets.filter(Boolean)){
     if(!member(e,t.id))e.participants.push(participant(t.id,'neutral',e.round));
     c.capture(e.id+'.'+e.round+'.'+d.actor,'conflict',[t.id],'battle:'+e.id);
     for(let n=0;n<(v.hits||1)&&t.value.alive&&t.value.hp>10;n++)if(hit(c,e,d,t,v,n)&&t.value.rank>=p.rank-9)effective=true;
    }
   }
   if(effective)improve(p,d.item,2,c.w.time);
   log(e,d.actor,'technique',p.name+'施展'+v.name+'，消耗'+v.qiCost+'斗气。',d.target);
  }else if(d.kind==='attack'){c.capture(e.id+'.'+e.round+'.'+d.actor,'conflict',[d.target],'battle:'+e.id);hit(c,e,d,find(c,d.target),{name:'普通攻击',power:0,accuracy:96},0);}
  else if(d.kind==='guard'){m.guard=12;log(e,d.actor,'guard',p.name+'以主要行动防守。');}
  else if(d.kind==='breathe'){const gain=recoverQi(p,0,true);log(e,d.actor,'breathe',p.name+'以主要行动调息，恢复'+gain+'斗气。');}
  else if(d.kind==='prepare'){p.qi-=5;p.study.prepared=p.study.prepared.filter(k=>k.id!==d.item);p.study.prepared.push({id:d.item,until:c.w.time+10,source:e.id});log(e,d.actor,'prepared','蓄势已投入五斗气，占用本轮主要行动。');}
  else if(d.kind==='consume'){const t=find(c,d.target||d.actor);c.touch(t.id);add(p,'medicine',-1);p.lastMedicine=c.w.time;treatCondition(t.value,'medicine',c.w.time);log(e,d.actor,'medicine','实际消耗一份疗伤散，占用主要行动。',t.id);}
  else if(d.kind==='retreat'){
   const exit=placeOf(e.place)?.exit,path=exit&&pathTo(e.place,p,exit,occupiedAt(c.rows,e.place,[d.actor]));
   if(path&&!capabilities(p).move){const n=Math.min(4,path.length);if(n){p.x=path[n-1].x;p.y=path[n-1].y;}
    if(distance(p,exit)<=1){m.status='left';log(e,d.actor,'retreated',p.name+'沿实际路径脱离；同伴仍各自决定。');}
    else log(e,d.actor,'retreating',p.name+'向出口移动，仍可能受到追击。');
   }else log(e,d.actor,'retreat_blocked','撤离路径受阻。');
  }else if(d.kind==='rescue'){
   const target=find(c,d.target),exit=placeOf(e.place)?.exit,path=exit&&pathTo(e.place,p,exit,occupiedAt(c.rows,e.place,[d.actor,d.target]));
   if(path?.length){c.touch(target.id);const count=Math.min(2,path.length),at=path[count-1],trailing=count>1?path[count-2]:{x:p.x,y:p.y};target.value.x=trailing.x;target.value.y=trailing.y;p.x=at.x;p.y=at.y;log(e,d.actor,'rescue','救援者承担主要行动，将失能同伴向实际出口转移。',target.id);}
  }else if(d.kind==='surrender'){
   e.offers=e.offers.filter(o=>o.actor!==d.actor);const gold=d.item?Number(d.item.slice(5)):0;e.offers.push({actor:d.actor,to:d.target,gold,status:'offered'});
   log(e,d.actor,'surrender_offered',p.name+'提出投降'+(gold?'并承诺交付'+gold+'金币':'')+'，仍等待对方实际接受。');
  }else if(d.kind==='accept'){
   const offer=e.offers.find(o=>o.actor===d.target&&o.to===d.actor&&['offered','truce_offered'].includes(o.status)),sender=offer&&find(c,offer.actor);
   const pact=sender&&c.w.promises.find(q=>q.item==='truce'&&[q.giver,q.receiver].includes(d.actor)&&[q.giver,q.receiver].includes(sender.id));
   if(offer&&sender?.value.alive&&canPerceive(p,sender.value)&&distance(p,sender.value)<=6&&sender.value.gold>=offer.gold&&(pact||c.w.promises.length<64)){
    c.capture(e.id+'.'+e.round+'.'+d.actor,'conflict',[sender.id],'battle:'+e.id);
    const agreed={id:'truce-'+e.id,giver:sender.id,receiver:d.actor,item:'truce',qty:1,due:c.w.time,status:'fulfilled'};
    if(pact)Object.assign(pact,agreed);else c.w.promises.push(agreed);
    if(offer.status==='truce_offered'){offer.status='truce_accepted';member(e,offer.actor).status='withdrew';m.status='withdrew';log(e,d.actor,'mediated',p.name+'实际同意停止本次接触，双方个人退出；其他人仍各自决定。',offer.actor);}
    else{offer.status='accepted';if(offer.gold){c.touch(sender.id);sender.value.gold-=offer.gold;p.gold+=offer.gold;}member(e,offer.actor).status='surrendered';log(e,d.actor,'surrender_accepted',p.name+'接受投降'+(offer.gold?'，约定的'+offer.gold+'金币已经实际交割':'')+'；拘束仍须近身建立。',offer.actor);}
   }
   else log(e,d.actor,'invalid','提议、实际交割条件或约定承载已失效，没有完成接受。');
  }else if(d.kind==='negotiate'){
   e.offers=e.offers.filter(o=>o.actor!==d.actor);e.offers.push({actor:d.actor,to:d.target,gold:0,status:'truce_offered'});
   log(e,d.actor,'truce_offered',p.name+'请求双方停止本次接触，等待对方根据本人安排回应。',d.target);
  }
  const last=e.log.at(-1),observer=find(c,'player'),hiddenTarget=last?.target&&observer&&!visible(c,observer,last.target);
  c.history('conflict_round',[d.actor,d.target,e.id].filter(Boolean),hiddenTarget?'一个主要行动已经完成，视线外的具体结果尚未核实。':last?.text||'一个主要行动已完成。');
 }
 // Accepting an offer is the receiver's own major action on the next round.
 finish(c,e);
 if(e.result){e.phase='world';e.clock=c.w.time+ROUND_MINUTES;}
 if(e.phase!=='closed'&&e.cursor>=e.queue.length){e.phase='world';e.clock=c.w.time+ROUND_MINUTES;}
}
export function nextRound(c,e){
 if(e.phase!=='world'||c.w.time<e.clock)return;
 if(e.result){e.phase='cleanup';e.cursor=0;return;}
 e.round++;e.queue=[];e.cursor=0;e.phase='choice';e.requests=e.requests.filter(q=>q.round>=e.round-1);
 for(const m of e.participants){if(m.status==='waiting'){m.status='active';m.joined=e.round;}m.guard=0;m.evade=0;m.reaction='';m.cover='';m.statuses=m.statuses.filter(s=>s.until>=e.round);
  const n=find(c,m.id)?.value;if(n)n.study.prepared=n.study.prepared.filter(k=>k.until>=c.w.time);
 }
 finish(c,e);
}
export function combatView(c,e){
 const player=find(c,'player');if(!e.id||!member(e,'player'))return {id:'',enemy:'',round:0,guard:false,phase:'idle',objective:'',result:'',winner:'',page:0,pages:1,total:0,participants:[],log:[],requests:[],offers:[],techniques:[]};
 const observed=e.participants.filter(m=>visible(c,player,m.id)),offers=e.offers.filter(o=>o.actor==='player'||o.to==='player'),pages=Math.max(1,Math.ceil(Math.max(observed.length,offers.length)/8)),page=Math.min(c.w.combatPage,pages-1);
 const publicLog=e.log.filter(l=>{
  if(l.actor==='player'&&l.target&&!visible(c,player,l.target)&&['damage','miss','unbroken','control_contact','control_applied'].includes(l.code))return false;
  return l.actor==='player'||l.target==='player'||visible(c,player,l.actor);
 }).slice(-8).map(l=>({...l,target:l.target&&visible(c,player,l.target)?l.target:'',
  text:l.target&&l.target!=='player'&&!visible(c,player,l.target)?'可见人物向视线外完成了一次作用，具体结果尚未核实。':l.actor==='player'||l.target==='player'?l.text:l.text.replace(/\d+点实际伤害/g,'实际伤害').replace(/消耗\d+斗气/g,'付出实际消耗')}));
 return {id:e.id,enemy:e.enemy,round:e.round,guard:false,phase:e.phase,objective:e.objective,result:e.result,winner:e.winner,page,pages,total:observed.length,
  participants:observed.slice(page*8,(page+1)*8).map(m=>{const p=find(c,m.id).value;return {id:m.id,name:p.name,side:m.side,status:m.status,x:p.x,y:p.y,signs:p.hp<=10?'失去战斗能力':p.hp<40?'明显虚弱':'仍可行动',shielded:m.shield>0,controlled:m.statuses.some(s=>s.kind==='bound'),species:p.species};}),
  log:publicLog,requests:copy(e.requests.filter(q=>q.round===e.round)),offers:copy(offers.slice(page*8,(page+1)*8)),
  techniques:player.value.study.library.map(k=>artById(k.id)).filter(e=>e?.value.type==='combat').map(a=>({id:a.id,name:a.value.name,kind:a.value.kind,qiCost:a.value.qiCost,range:a.value.range,radius:a.value.radius||0,reason:artReason(player.value,a,c.w.time,{ready:true})}))};
}
