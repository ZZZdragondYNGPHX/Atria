import {pool} from '../pools/index.js';
import {eligible} from './pools.js';
import {skill,learn,qty,age} from './person-data.js';
import {capabilities,awarenessRestriction} from './condition.js';
import {realm,growthNeed,canAdvance} from './realm.js';
export const artByItem=item=>item?pool('arts').entries.find(e=>e.status==='ready'&&e.value.item===item):undefined;
export const artById=id=>pool('arts').entries.find(e=>e.status==='ready'&&e.id===id);
export const artContext=(p,time)=>({age:age(p,time),rank:p.rank,fire:p.fire,wood:p.wood,soul:p.soul,affinity:p.affinity});
export const artKnown=(p,e)=>!!e&&p.study.library.some(k=>k.id===e.id&&k.progress>0);
export const mastery=(p,id)=>p.study.library.find(k=>k.id===id)?.progress||0;
export const emptyStudy=()=>({cultivation:'steady',combat:'',xpCarry:0,qiCarry:0,library:[],auxiliary:[],hotbar:[],prepared:[],
 switching:{kind:'',id:'',from:'',started:0,due:0,settled:0},restCarry:0,practiceCarry:0});
export function learnArt(p,e,source='study',progress=10){
 if(!e)throw Error('unknown ability definition');
 const old=p.study.library.find(k=>k.id===e.id);if(old)return false;
 if(p.study.library.length>=64)throw Error('learning library capacity');
 p.study.library.push({id:e.id,progress,practiced:0,source});
 if(e.value.type==='basic'&&!skill(p,'basic'))learn(p,'basic');
 if(e.value.type==='formula'&&!skill(p,'formula'))learn(p,'formula');
 if(e.value.type==='combat'&&!p.study.combat)p.study.combat=e.id;
 if(e.value.type==='combat'&&p.study.hotbar.length<6)p.study.hotbar.push(e.id);
 return true;
}
export function initializeArts(p,key,source='opening'){
 p.study=emptyStudy();p.affinity=p.wood>0?'wood':p.fire>=3?'fire':key==='lin'||key==='min'?'wind':'neutral';
 if(p.role==='child'||p.species)return;
 learnArt(p,artById('steady'),source,60);
 learnArt(p,artById('short-fist'),source,30);
 if(p.rank>=10){const primary=p.affinity==='fire'?'fire-breath':p.affinity==='wood'?'wood-breath':p.affinity==='wind'?'wind-breath':'stone-breath';learnArt(p,artById(primary),source,80);p.study.cultivation=primary;}
 if(['mercenary','guide','guard','rival','gatherer','cultivator','leader'].includes(p.role)){
  for(const id of ['stone-palm','willow-step',...(p.gear.some(g=>g.type==='blade')?['blade-cut','return-parry']:[])])learnArt(p,artById(id),source,60);
 }
 for(const e of pool('arts').entries.filter(e=>e.status==='ready'&&e.value.category==='realm'&&p.rank>=e.value.minRank))learnArt(p,e,'realm:'+p.rank,100);
 p.qi=Math.min(p.qi,resources(p).capacity);
}
export function activeArt(p,type='cultivation'){
 const e=artById(p.study[type]);if(e&&artKnown(p,e)&&(e.value.type===type||type==='cultivation'&&e.value.type==='basic'))return e;
 if(type==='cultivation')return artById('steady');
 return undefined;
}
export function auxiliaryEffects(p){
 const result={recovery:0,defense:0,resistance:0,upkeep:0},primary=activeArt(p).value;
 for(const id of p.study.auxiliary){const e=artById(id);
  if(!e||!artKnown(p,e)||!e.value.compatible?.includes(primary.attribute)||p.qi<e.value.upkeep)continue;
  for(const key of Object.keys(result))result[key]+=key==='upkeep'?e.value[key]||0:Math.floor((e.value[key]||0)*(40+Math.min(100,mastery(p,id))*.6)/100);
 }
 return result;
}
export function resources(p){
 const r=realm(p.rank),e=activeArt(p).value,m=mastery(p,p.study.cultivation),factor=n=>100+Math.floor(((n||100)-100)*Math.min(100,m)/100);
 const a=auxiliaryEffects(p),spec=p.species?pool('creatures').entries.find(e=>e.id===p.species)?.value:null;
 return {capacity:Math.floor(r.capacity*factor(e.capacity)/100),quality:factor(e.quality),recovery:factor(e.recovery)+a.recovery,drive:(e.drive||0)+(spec?.body==='winged'?2:0),defense:a.defense+Math.floor((spec?.resistance||0)/5),resistance:a.resistance+(spec?.resistance||0),upkeep:a.upkeep};
}
export function artReason(p,e,time=0,{ready=false}={}){
 if(!e)return '能力定义不存在';
 if(!artKnown(p,e))return '尚未学会';
 if(!eligible(e,artContext(p,time))||p.rank<(e.value.minRank||1))return '境界或属性资格不足';
 if(p.species&&e.value.category!=='innate')return '不适用于此种族身体';
 const v=e.value,mental=awarenessRestriction(p);if(mental)return mental;
 if(v.type==='combat'&&capabilities(p).technique)return capabilities(p).technique;
 const unusable=part=>p.condition.missing.includes(part)||p.condition.wounds.some(w=>w.part===part&&w.severity>=30);
 if(!p.species&&v.arms&&['left_arm','right_arm'].filter(unusable).length>2-v.arms)return '可用手臂不足';
 if(v.weapon&&!p.gear.some(g=>g.type===v.weapon&&g.equipped&&g.durability>0))return '缺少完好且已装备的兵器';
 if(v.attribute==='fire'&&p.fire<3)return '缺少火向驱动资格';
 if(ready&&p.qi<v.qiCost+resources(p).upkeep)return '斗气不足（含当前辅助运转）';
 if(ready&&v.material&&qty(p,v.material)<1)return '缺少实际耗材';
 if(ready&&v.prepare&&!p.study.prepared.some(k=>k.id===e.id&&k.until>=time))return '需要先蓄势准备';
 return '';
}
export function improve(p,id,amount,at){
 const k=p.study.library.find(k=>k.id===id);if(!k||!amount)return;
 k.progress=Math.min(1000,k.progress+amount);k.practiced=at;
}
export function trainingEffort(p,units,baseCost){
 const e=activeArt(p).value;
 let worked=0;for(let i=0;i<units;i++){
  const cost=baseCost*(e.qiRate||100)+p.study.qiCarry,pay=Math.floor(cost/100)+resources(p).upkeep;if(p.qi<pay)break;
  p.qi-=pay;p.study.qiCarry=cost%100;const gain=Math.max(1,p.soul)*(e.xpRate||100)+p.study.xpCarry;p.xp+=Math.floor(gain/100);p.study.xpCarry=gain%100;
  improve(p,p.study.cultivation,1,p.updated);worked++;
 }return worked;
}
export function recoverQi(p,minutes,combat=false){
 if(p.species?capabilities(p).technique:capabilities(p).train)return 0;
 const r=resources(p),passiveRate=r.recovery-auxiliaryEffects(p).recovery,raw=combat?Math.floor(18*r.recovery/100):minutes*passiveRate+p.study.restCarry;
 const gain=combat?raw:Math.floor(raw/1800);if(!combat)p.study.restCarry=raw%1800;
 const before=p.qi;p.qi=Math.min(r.capacity,p.qi+gain);return p.qi-before;
}
export function beginStudy(p,e,kind,time){
 if(!e||p.study.switching.kind)return '已有学习或换修尚未完成';
 if(kind==='learn'&&(artKnown(p,e)||!e.value.item||qty(p,e.value.item)<1))return '需要持有尚未学会的真实抄本';
 if(!eligible(e,artContext(p,time))||p.rank<e.value.minRank||p.species)return '境界、属性或种族不满足条件';
 if(capabilities(p).learn||capabilities(p).train)return '当前身体不适合研习或换修';
 if(kind==='switch'&&(!artKnown(p,e)||e.value.type!=='cultivation'||p.study.cultivation===e.id))return '只能换修已学会的另一门正式功法';
 if(kind==='switch'&&(qty(p,'food')<1||p.qi<15))return '换修需要一份干粮与十五斗气';
 if(kind==='switch'){p.qi-=15;const food=p.inventory.find(i=>i.item==='food');food.qty--;}
 const duration=kind==='switch'?1440:e.value.tier.startsWith('玄')?1440:360;
 p.study.switching={kind,id:e.id,from:p.study.cultivation,started:time,due:time+duration,settled:0};
 return '';
}
export function settleStudy(p,until){
 const s=p.study.switching;if(!s.kind)return '';
 s.settled=Math.max(s.settled,Math.min(until,s.due)-s.started);
 if(until<s.due)return 'pending';
 const e=artById(s.id);
 if(!e||!eligible(e,artContext(p,until))||capabilities(p).train||s.kind==='learn'&&qty(p,e.value.item)<1){p.study.switching={kind:'',id:'',from:'',started:0,due:0,settled:0};return 'failed';}
 if(s.kind==='learn')learnArt(p,e,'manual:'+e.value.item);
 else{p.study.cultivation=e.id;p.study.auxiliary=p.study.auxiliary.filter(id=>artById(id).value.compatible.includes(e.value.attribute));p.qi=Math.min(p.qi,resources(p).capacity);}
 p.study.switching={kind:'',id:'',from:'',started:0,due:0,settled:0};return 'completed';
}
export function cancelStudy(p){const old=p.study.switching;p.study.switching={kind:'',id:'',from:'',started:0,due:0,settled:0};return old;}
export function advanceRealm(p,time){
 if(!canAdvance(p))return false;
 p.xp-=growthNeed(p);p.qi-=40;p.rank++;
 for(const e of pool('arts').entries.filter(e=>e.status==='ready'&&e.value.category==='realm'&&p.rank>=e.value.minRank))learnArt(p,e,'realm:'+p.rank,100);
 return true;
}
export function combatArt(p){
 const e=activeArt(p,'combat');return e?{...e.value,id:e.id,level:Math.ceil(mastery(p,e.id)/10)}:{id:'',level:0,qiCost:0,power:0,arms:0};
}
export function artsView(p,time,page=0,size=8){
 const list=pool('arts').entries.filter(e=>e.status==='ready'&&(artKnown(p,e)||e.value.item&&qty(p,e.value.item)>0)),pages=Math.max(1,Math.ceil(list.length/size));
 return {page:Math.min(page,pages-1),pages,total:list.length,rows:list.slice(Math.min(page,pages-1)*size,(Math.min(page,pages-1)+1)*size).map(e=>({id:e.id,name:e.value.name,type:e.value.type,tier:e.value.tier,attribute:e.value.attribute,item:e.value.item,known:artKnown(p,e),level:Math.ceil(mastery(p,e.id)/10),active:artKnown(p,e)&&(p.study.cultivation===e.id||p.study.auxiliary.includes(e.id)),eligible:eligible(e,artContext(p,time))&&p.rank>=e.value.minRank,xpRate:e.value.xpRate||0,qiRate:e.value.qiRate||0,qiCost:e.value.qiCost||0,power:e.value.power||0,arms:e.value.arms||0,source:qty(p,e.value.item)>0?'持有抄本':p.study.library.find(k=>k.id===e.id)?.source||'',reason:artReason(p,e,time,{ready:e.value.type==='combat'}),category:e.value.category,prepared:p.study.prepared.some(k=>k.id===e.id&&k.until>=time),hotbar:p.study.hotbar.includes(e.id)}))};
}
