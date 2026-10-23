import {person} from './state.js';
import {drawAndRemember,randomInt} from './pools.js';
import {assignAppearance} from './appearance.js';
import {artById,artContext,learnArt} from './progression.js';
import {pool} from '../pools/index.js';
import {DAY,YEAR} from '../content/catalog.js';
export function generatePerson(w,rows,key,source,place,parents=[]){
 const template=drawAndRemember(w,'people.templates',{context:{source},label:key,used:rows.map(r=>r.value.generation.template)}),v=template.value;
 const sex=randomInt(w.poolSeed,key+':sex',0,1)?'male':'female';
 const years=randomInt(w.poolSeed,key+':age',v.minAge,v.maxAge),rank=randomInt(w.poolSeed,key+':rank',v.minRank,v.maxRank);
 const surname=parents.length?parents[0].name.slice(0,1):drawAndRemember(w,'names.surnames',{label:key+':surname'}).value.name;
 const names=sex==='male'?'names.male':'names.female';
 let name='';for(let i=0;i<33;i++){name=surname+drawAndRemember(w,names,{label:key+':given:'+i}).value.name;if(!rows.some(r=>r.value.name===name))break;}
 if(rows.some(r=>r.value.name===name))throw Error('name pool exhausted for surname');
 const p=person(key,name,place,v.role,years,rank,years>=18?'reciprocal':'unavailable',v.plan);
 Object.assign(p,{sex,born:w.time-years*YEAR,deathAt:w.time+(82-years)*YEAR,next:w.time+(source==='birth'?30:7)*DAY,updated:w.time,fire:v.fire,wood:v.wood,soul:v.soul,
 gold:source==='birth'?0:randomInt(w.poolSeed,key+':gold',45,150),generation:{template:template.id,origin:v.origin,source,version:1}});
 p.appearance='';assignAppearance('',p,years,w.poolSeed+key,rows.map(r=>r.value.appearance));
 const family=artById(v.art);
 if(family){
  const type=family.value.type,art=drawAndRemember(w,'arts',{context:artContext(p,w.time),label:key+':art',used:rows.map(r=>r.value.study[type]),exclude:pool('arts').entries.filter(e=>e.value.type!==type).map(e=>e.id)});
  learnArt(p,art);p.generation.origin=v.origin+'，已有'+art.value.name+'的修习基础';
 }
 if(source==='birth'){p.skills=[];p.gear=[];p.inventory=[{item:'food',qty:0},{item:'herb',qty:0}];p.study={cultivation:'steady',combat:'stone-palm',xpCarry:0,qiCarry:0};}
 // Temperament varies independently of occupation and face.
 for(const trait of ['ambition','care','caution'])p.traits[trait]=randomInt(w.poolSeed,key+':'+trait,20,90);
 return {id:key,value:p};
}
