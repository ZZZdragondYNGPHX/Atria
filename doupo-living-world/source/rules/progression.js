import {pool} from '../pools/index.js';
import {eligible} from './pools.js';
import {skill,learn,qty,age} from './state.js';
export const artByItem=item=>pool('arts').entries.find(e=>e.status==='ready'&&e.value.item===item);
export const artById=id=>pool('arts').entries.find(e=>e.status==='ready'&&e.id===id);
export const artContext=(p,time)=>({age:age(p,time),rank:p.rank,fire:p.fire,wood:p.wood,soul:p.soul});
export const artKnown=(p,e)=>!!e&&(!!skill(p,'art:'+e.id)||(e.id==='steady'&&!!skill(p,'basic'))||(e.id==='stone-palm'&&p.study.combat==='stone-palm'&&!!skill(p,'palm'))||(e.id==='healing-formula'&&!!skill(p,'formula')));
export function activeArt(p,type){const e=artById(p.study[type]);if(e&&e.value.type===type&&artKnown(p,e))return e;return artById(type==='cultivation'?'steady':'stone-palm');}
export function learnArt(p,e){
 if(e.id!=='stone-palm'&&e.value.type==='combat'&&p.study.combat==='stone-palm'&&skill(p,'palm')&&!skill(p,'art:stone-palm'))learn(p,'art:stone-palm',skill(p,'palm'));
 learn(p,'art:'+e.id);learn(p,e.value.core);
 if(['cultivation','combat'].includes(e.value.type))p.study[e.value.type]=e.id;
 if(e.value.type==='formula'&&p.fire>=3&&p.wood>=1&&p.soul>=3&&!skill(p,'refining'))learn(p,'refining');
}
export function trainingEffort(p,units,baseCost){
 const e=activeArt(p,'cultivation'),xpRate=e.value.xpRate,qiRate=e.value.qiRate;
 let worked=0;for(let i=0;i<units;i++){
  const cost=baseCost*qiRate+p.study.qiCarry,pay=Math.floor(cost/100);if(p.qi<pay)break;
  p.qi-=pay;p.study.qiCarry=cost%100;const gain=Math.max(1,skill(p,'basic')*p.soul)*xpRate+p.study.xpCarry;p.xp+=Math.floor(gain/100);p.study.xpCarry=gain%100;worked++;
 }return worked;
}
export function combatArt(p){const e=activeArt(p,'combat');return {...e.value,id:e.id,level:artKnown(p,e)?skill(p,'art:'+e.id)||skill(p,'palm'):0};}
export function artsView(p,time){return pool('arts').entries.filter(e=>e.status==='ready'&&(artKnown(p,e)||qty(p,e.value.item)>0)).map(e=>({id:e.id,name:e.value.name,type:e.value.type,tier:e.value.tier,attribute:e.value.attribute,item:e.value.item,known:artKnown(p,e),level:artKnown(p,e)?skill(p,'art:'+e.id)||skill(p,e.value.core):0,active:artKnown(p,e)&&p.study[e.value.type]===e.id,eligible:eligible(e,artContext(p,time)),xpRate:e.value.xpRate||0,qiRate:e.value.qiRate||0,qiCost:e.value.qiCost||0,power:e.value.power||0,arms:e.value.arms||0,source:qty(p,e.value.item)>0?'持有抄本':'已经学会'}));}
