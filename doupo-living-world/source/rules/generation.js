import {person,learn} from './state.js';
import {drawAndRemember,randomInt} from './pools.js';
import {assignAppearance} from './appearance.js';
import {artById,artContext,learnArt,initializeArts,emptyStudy} from './progression.js';
import {pool} from '../pools/index.js';
import {creatures} from '../pools/creatures.js';
import {realm} from './realm.js';
import {placeBody} from './spatial.js';
import {DAY,YEAR,regionOf} from '../content/catalog.js';
export function generatePerson(w,rows,key,source,place,parents=[]){
 const template=drawAndRemember(w,'people.templates',{context:{source,region:regionOf(place)?.id},label:key,used:rows.map(r=>r.value.generation.template)}),v=template.value;
 const sex=randomInt(w.poolSeed,key+':sex',0,1)?'male':'female';
 const years=randomInt(w.poolSeed,key+':age',v.minAge,v.maxAge),rank=randomInt(w.poolSeed,key+':rank',v.minRank,v.maxRank);
 const surname=parents.length?parents[0].name.slice(0,1):drawAndRemember(w,'names.surnames',{label:key+':surname'}).value.name;
 const names=sex==='male'?'names.male':'names.female';
 let name='';for(let i=0;i<33;i++){name=surname+drawAndRemember(w,names,{label:key+':given:'+i}).value.name;if(!rows.some(r=>r.value.name===name))break;}
 if(rows.some(r=>r.value.name===name))throw Error('name pool exhausted for surname');
 const p=person(key,name,place,v.role,years,rank,years>=18?'reciprocal':'unavailable',v.plan);
 Object.assign(p,{sex,born:w.time-years*YEAR,deathAt:w.time+(82-years)*YEAR,next:w.time+(source==='birth'?30:7)*DAY,updated:w.time,fire:v.fire,wood:v.wood,soul:v.soul,
 gold:source==='birth'?0:randomInt(w.poolSeed,key+':gold',45,150),generation:{template:template.id,origin:v.origin,source,version:pool('people.templates').version}});
 p.appearance='';assignAppearance('',p,years,w.poolSeed+key,rows.map(r=>r.value.appearance));
 initializeArts(p,key,'generation:'+source);
 const family=artById(v.art);
 if(family){
  const type=family.value.type==='cultivation'&&p.rank<10?'basic':family.value.type,art=drawAndRemember(w,'arts',{context:artContext(p,w.time),label:key+':art',used:rows.map(r=>r.value.study[type]),exclude:pool('arts').entries.filter(e=>e.value.type!==type||!e.value.item).map(e=>e.id)});
  if(art){learnArt(p,art,'generation:'+source);if(art.value.type==='cultivation')p.study.cultivation=art.id;p.generation.origin=v.origin+'，已有'+art.value.name+'的修习基础';}
 }
 if(source!=='birth'&&p.role==='healer')learn(p,'healing');
 if(source==='birth'){p.skills=[];p.gear=[];p.inventory=[{item:'food',qty:0},{item:'herb',qty:0}];p.study=emptyStudy();}
 // Temperament varies independently of occupation and face.
 for(const trait of ['ambition','care','caution'])p.traits[trait]=randomInt(w.poolSeed,key+':'+trait,20,90);
 placeBody(p,rows);return {id:key,value:p};
}
export function generateCreature(w,rows,species,place){
 const entry=creatures.entries.find(e=>e.id===species),v=entry?.value;
 if(!v||!v.habitat.includes(place)||w.beastSpawn.includes(species))return null;
 const key='beast-'+species,p=person(key,v.name,place,'beast',3,10+(v.tier-1)*9,'unavailable','原创物种：'+v.behavior);
 p.species=species;p.affinity='neutral';p.fire=0;p.wood=0;p.soul=1;p.gold=0;p.inventory=[{item:v.food,qty:2}];p.skills=[];p.gear=[];p.study=emptyStudy();p.speechReady=false;p.needitem='';p.needqty=0;
 learnArt(p,artById(v.ability),'species:'+species,100);
 p.qi=realm(p.rank).capacity;p.born=w.time-3*YEAR;p.deathAt=w.time+40*YEAR;p.updated=w.time;p.next=w.time+180;p.appearance='';
 p.generation={template:species,origin:v.behavior,source:'habitat:'+place,version:creatures.version};p.social=[];p.goals=[];p.motives=[];
 p.traits={ambition:v.behavior==='territorial'?80:55,care:20,caution:v.behavior==='territorial'?25:v.behavior==='kite'?80:v.behavior==='ambush'?70:55};
 p.x=8;p.y=7;placeBody(p,rows);w.beastSpawn.push(species);return {id:key,value:p};
}
