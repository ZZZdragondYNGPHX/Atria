import {CAST,PLAYER,DAY,YEAR,POLICY,ITEMS,PLACES,initialGear} from '../content/catalog.js';
import {contentSha256} from './hash.js';
import {initialCondition,injure,conditionAwareness} from './condition.js';
import {assignAppearance} from './appearance.js';
export const copy=v=>JSON.parse(JSON.stringify(v));
export const qty=(p,id)=>p.inventory.find(x=>x.item===id)?.qty||0;
export function add(p,item,n){let row=p.inventory.find(x=>x.item===item);if(!row){row={item,qty:0};p.inventory.push(row);}row.qty+=n;if(row.qty<0)throw Error('inventory');}
export const skill=(p,id)=>p.skills.find(x=>x.id===id)?.level||0;
export function learn(p,id,n=1){let row=p.skills.find(x=>x.id===id);if(!row){row={id,level:0};p.skills.push(row);}row.level=Math.min(100,row.level+n);}
export const age=(p,t)=>Math.max(0,Math.floor((t-p.born)/YEAR));
// Admission varies these fields; the remaining newborn/arrival state uses the
// same person defaults, keeping the computation schema within Native limits.
export const NEW_PERSON_FIELDS=['sex','name','home','place','role','x','born','rank','gold','inventory','skills','plan','next','updated','deathAt','parentA','parentB','ward','preference','visited','traits','social','gear','appearance','generation','study','fire','wood','soul'];
export const idleActivity=()=>({kind:'',target:'',item:'',started:0,due:0,progress:0,pausedAt:0,source:''});
export const freeControl=()=>({holder:'',since:0,until:0,source:''});
export function person(key,name,place,role,years,rank,preference,description=''){
 const female=['su','xuner','yan','ning','lin-mother','gao-child','qiao','lian','shu'].includes(key)||(!CAST.some(c=>c[0]===key)&&key!=='player'&&parseInt(contentSha256(key).slice(0,8),16)%2===0);
 const value={actor:key==='player'?PLAYER:'',sex:female?'female':'male',name,place,home:place,role,x:3+(name.length%5),y:7,born:-years*YEAR,alive:true,rank,xp:0,hp:100,qi:100,injury:0,gold:120,
 appearance:'',generation:{template:'',origin:description,source:'authored',version:1},study:{cultivation:'steady',combat:'stone-palm',xpCarry:0,qiCarry:0},condition:initialCondition(),gear:initialGear(key,role),control:freeControl(),activity:idleActivity(),suspended:idleActivity(),speechReady:true,displayed:'',displayedAt:0,interaction:{kind:'',target:'',place:'',at:0,source:'',relation:''},health:'',
 traits:{ambition:30+parseInt(contentSha256(key).slice(0,2),16)%60,care:25+parseInt(contentSha256(key).slice(2,4),16)%65,caution:25+parseInt(contentSha256(key).slice(4,6),16)%65},goals:[],motives:[],social:[],
 inventory:[{item:'food',qty:role==='child'?0:12},{item:'herb',qty:role==='child'?0:role==='herbalist'?6:1}],skills:role==='child'?[]:[{id:'basic',level:1}],fire:2,wood:0,soul:2,
 destination:'',arriveAt:0,plan:description||'维持生计并修炼',next:DAY+(name.length%7)*60,updated:0,deathAt:(82-years)*YEAR,
 partner:'',parentA:'',parentB:'',ward:'',needitem:role==='herbalist'?'medicine':'food',needqty:role==='herbalist'?1:3,preference,chat:'',decision:'',choice:'',visited:[place],lastSocial:0,lastMedicine:-DAY};
 if(role!=='none')assignAppearance(key,value,years,key);value.health=conditionAwareness(value);return value;
}
export function initialPeople(){const rows=CAST.map(([key,name,place,role,years,rank,romance,desc])=>({id:key,value:person(key,name,place,role,years,rank,romance?'reciprocal':'unavailable',desc)}));
 rows.push({id:'player',value:person('player','尚未创建','wutan.inn','player',20,4,'player')});
 rows.find(x=>x.id==='su').value.parentA='su-father';rows.find(x=>x.id==='lin').value.parentA='lin-mother';rows.find(x=>x.id==='gao-child').value.parentA='gao';
 for(const id of ['su','ning','tang']){const p=rows.find(x=>x.id===id).value;p.fire=4;p.wood=1;p.soul=4;learn(p,'refining',1);learn(p,'formula',1);}
 const father=rows.find(x=>x.id==='su-father').value;
 injure(father,{id:'opening-su-father',part:'left_leg',kind:'fracture',severity:70,at:0,source:'opening',cause:'原创开局：既有腿伤，尚未获得指定处置'});
 father.injury=35;father.hp=85;
 learn(rows.find(x=>x.id==='ning').value,'healing',1);
 for(const r of rows){const n=r.value;for(const key of [n.parentA,n.parentB,n.ward].filter(Boolean)){const relative=rows.find(other=>other.id===key);if(relative){n.social.push({a:r.id,b:key,kind:'family',place:relative.value.home,at:0,source:'opening:known-family',confidence:'known'});relative.value.social.push({a:key,b:r.id,kind:'family',place:n.home,at:0,source:'opening:known-family',confidence:'known'});}}}
 for(const [a,b,kind] of [['su','ning','healer'],['ning','lian','friend'],['lu','bo','competitor'],['bo','lu','competitor']]){const n=rows.find(r=>r.id===a).value,t=rows.find(r=>r.id===b).value;n.social.push({a,b,kind,place:t.home,at:0,source:'opening:prior-contact',confidence:'known'});}
 for(const key of ['lu','bo','he','min','zhou'])learn(rows.find(r=>r.id===key).value,'palm');
 rows.find(r=>r.id==='lu').value.traits.ambition=85;rows.find(r=>r.id==='lu').value.traits.caution=35;
 for(const r of rows)r.value.health=conditionAwareness(r.value);
 return rows;}
function initialStocks(){
 const base=PLACES.filter(p=>p.region!=='mountain').flatMap(p=>ITEMS.filter(i=>['food','herb','medicine','manual','technique','formula'].includes(i.id)).map(i=>({place:p.id,item:i.id,qty:8,gold:800,quote:1})));
 const special=['manual-wood','manual-stone','manual-fire','manual-wind','technique-short','technique-finger','technique-heavy'];
 for(const [i,item] of special.entries())base.push({place:i<4?'wutan.auction':'qingshan.guild',item,qty:2,gold:800,quote:1});
 if(base.length>64)throw Error('shop stock capacity');return base;
}
export function initialWorld(){return {created:false,origin:'',background:'',time:0,serial:0,producedGold:0,consumedGold:0,cap:POLICY.liveCap,poolSeed:'',poolRecent:[],initialResidents:0,focus:'',peopleFilter:'nearby',peoplePage:0,cluesPage:0,relationKeys:[],plan:[],planText:'',planResults:[],companions:[],appraisals:[],reservations:[],families:[],
 unique:[{id:'redleaf',owner:'',status:'available'},{id:'relic',owner:'',status:'sealed'}],
 stocks:initialStocks(),
 peopleKeys0:['player',...CAST.map(c=>c[0])],peopleKeys1:[],peopleKeys2:[],mindKeys:['player',CAST.slice().sort((a,b)=>a[1].length%7-b[1].length%7||a[0].localeCompare(b[0]))[0][0]],
 releases:[],knownCauses:[],ecology:PLACES.filter(p=>p.region==='mountain').map(p=>({place:p.id,herbs:24,capacity:24,updated:0})),messages:[],conflicts:[],shipments:[],
 organizations:[{id:'wutan-herbal',place:'wutan.herbal',leader:'su',members:['su','su-father'],gold:180,herbs:4,output:0,updated:0,status:'active'},
 {id:'qingshan-herbal',place:'qingshan.herbal',leader:'tang',members:['tang','lu','bo'],gold:220,herbs:4,output:0,updated:0,status:'active'}],
 promises:[],agenda:{actor:'',record:'',due:0},op:{kind:'',target:'',end:0,detail:'',stopped:false},combat:{enemy:'',round:0,guard:false},nextMarket:30*DAY,nextImmigration:90*DAY,
 known:['wutan.inn','wutan.market','wutan.herbal','wutan.auction','wutan.clan','wutan.gate','qingshan.inn','qingshan.herbal','qingshan.guild','mountain.camp'],history:[]};}
export function record(w,kind,refs,text){w.history.push({at:w.time,kind,refs,text:text.slice(0,256)});if(w.history.length>24)w.history.shift();}
export const price=id=>ITEMS.find(i=>i.id===id)?.price||0;
export const infoItem=(id,v)=>({id:'personal:'+id,sourceId:'personal',recordId:id,semantic:'belief',data:{text:v.text,target:v.target,kind:v.kind,at:v.at,source:v.source},epistemicStatus:v.status,channel:v.channel,actorId:v.actor});
