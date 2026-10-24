import {regions,locations,routes} from '../pools/geography.js';
import {cast} from '../pools/cast.js';
export {WORLD_ATLAS,ATLAS_SECTORS,isLockedAtlas} from '../pools/atlas.js';
// Novel names describe setting; all local layouts, routes, timings and formulas
// below are authored game rules, not distances or statistics from the novel.
import {items as itemPool} from '../pools/items.js';
export const ITEMS=itemPool.entries.filter(e=>e.status==='ready').map(e=>e.value);
export const PERIOD = '萧家本轮斗气测试当日晚间，来客会面之前；后续历史不锁定原著结果。';
export const PLAYER = 'actor_4fba8c0c4b6a5dc93ab17ea610f99d08';
export const BACKGROUNDS = [
 {id:'clan',name:'小族旁支',place:'wutan.clan',gold:90,rank:4,fire:2,wood:0,soul:2,contact:'lin',description:'在乌坦城族产做事的成年旁支，得一份家传基础功法。'},
 {id:'apprentice',name:'药铺学徒',place:'wutan.herbal',gold:55,rank:3,fire:4,wood:1,soul:4,contact:'su',description:'成年学徒，熟悉药材，有炼药潜质，仍须学习丹方与控火。'},
 {id:'mercenary',name:'佣兵后辈',place:'qingshan.guild',gold:70,rank:5,fire:1,wood:0,soul:2,contact:'he',description:'成年佣兵的后辈，识路而不等于能独闯山脉。'},
 {id:'wanderer',name:'落脚散修',place:'wutan.inn',gold:115,rank:4,fire:2,wood:0,soul:3,contact:'yan',description:'成年散修，自行负担住食，城中尚无稳固人脉。'},
];
export const REGIONS=regions.entries.map(e=>({id:e.id,...e.value}));
export const PLACES=locations.entries.filter(e=>e.status==='ready').map(e=>e.value);
export const ROUTES=routes.entries.filter(e=>e.status==='ready').map(e=>e.value);
const regionsById=new Map(REGIONS.map(r=>[r.id,r])),placesById=new Map(PLACES.map(p=>[p.id,p])),outgoing=new Map();
for(const route of ROUTES){if(!outgoing.has(route.from))outgoing.set(route.from,[]);outgoing.get(route.from).push(route);}
export const regionOf=place=>regionsById.get(placesById.get(place)?.region);
export const placeOf=id=>placesById.get(id);
export const routesFrom=place=>outgoing.get(place)||[];
// Discover only public neighbors of a personally reached or investigated place.
export function discoverRoutes(w,id){for(const r of routesFrom(id))if(!placeOf(r.to).hidden&&!w.known.includes(r.to))w.known.push(r.to);}

export const KINDS = ['quest','activity','create','move','approach','travel','talk','work','promise','deliver','buy','sell','gift','allocate',
 'investigate','gather','claim','train','learn','breakthrough','rest','refine','consume','attack','technique','guard','retreat','surrender',
 'invite','confess','engage','marry','separate','conceive','care','treat','teach','wait','continue','cancel','clarify','browse','focus','practice','recall','condition','profile','equip','repair','release','message',
 'battle','spar','breathe','prepare','accept','negotiate','command','rescue','loot','capture','search'];
// Each person has a livelihood, finite resources, an origin and a preference.
// Canon characters are not automatically romance candidates or omniscient.
export const CAST=cast.entries.filter(e=>e.status==='ready').map(({value:v})=>[v.id,v.name,v.place,v.role,v.years,v.rank,v.romance,v.description]);
export const BINDINGS=Array.from({length:Math.ceil(CAST.length/8)},(_,i)=>'bind'+i);
export const YEAR = 365*24*60, DAY=24*60;
// Authored equipment effects; these are not statistics asserted by the novel.
export const GEAR={blade:{slot:'hand',attack:5,defense:0,durability:60,charges:0},armor:{slot:'body',attack:0,defense:4,durability:80,charges:0},ward:{slot:'charm',attack:0,defense:0,durability:0,charges:3}};
export function initialGear(key,role){
 if(!['guide','mercenary','guard','rival','gatherer'].includes(role))return [];
 const types=role==='guard'?['blade','armor']:role==='rival'?['blade','ward']:['blade'];
 return types.map(type=>({id:'gear-'+key+'-'+type,type,slot:GEAR[type].slot,equipped:true,durability:GEAR[type].durability,charges:GEAR[type].charges}));
}
export const POLICY = {liveCap:96,low:48,high:84,regionalCap:64,adultYears:18,gestationDays:270,immigrationDays:90};
export const START_KNOWLEDGE = [
 {kind:'novel_memory',text:'你记得小说中的萧炎、古戒与后来的成长，但记忆不等于本局事实，也不向本土人物公开。',source:'玩家创建时选择穿越者'},
 {kind:'rumor',text:'乌坦城与青山镇有药材来往，山脉外缘的赤叶药材有竞争者。',source:'原创本地传闻'},
];
