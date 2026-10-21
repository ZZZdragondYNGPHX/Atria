import {CAST,PLAYER,DAY,YEAR,POLICY,ITEMS,PLACES} from '../content/catalog.js';
export const copy=v=>JSON.parse(JSON.stringify(v));
export const qty=(p,id)=>p.inventory.find(x=>x.item===id)?.qty||0;
export function add(p,item,n){let row=p.inventory.find(x=>x.item===item);if(!row){row={item,qty:0};p.inventory.push(row);}row.qty+=n;if(row.qty<0)throw Error('inventory');}
export const skill=(p,id)=>p.skills.find(x=>x.id===id)?.level||0;
export function learn(p,id,n=1){let row=p.skills.find(x=>x.id===id);if(!row){row={id,level:0};p.skills.push(row);}row.level=Math.min(100,row.level+n);}
export const age=(p,t)=>Math.max(0,Math.floor((t-p.born)/YEAR));
export function person(key,name,place,role,years,rank,preference,description=''){
 return {actor:key==='player'?PLAYER:'',sex:['su','xuner','yan','ning','lin-mother','gao-child','qiao','lian','shu'].includes(key)?'female':'male',name,place,home:place,role,x:3+(name.length%5),y:7,born:-years*YEAR,alive:true,rank,xp:0,hp:100,qi:100,injury:0,gold:120,
 inventory:[{item:'food',qty:12},{item:'herb',qty:role==='herbalist'?6:1}],skills:[{id:'basic',level:1}],fire:2,wood:0,soul:2,
 destination:'',arriveAt:0,plan:description||'维持生计并修炼',next:DAY+(name.length%7)*60,updated:0,deathAt:(82-years)*YEAR,
 partner:'',parentA:'',parentB:'',ward:'',needItem:role==='herbalist'?'medicine':'food',needQty:role==='herbalist'?1:3,preference,chat:'',decision:'',choice:'',visited:[place],lastSocial:0};
}
export function initialPeople(){const rows=CAST.map(([key,name,place,role,years,rank,romance,desc])=>({id:key,value:person(key,name,place,role,years,rank,romance?'reciprocal':'unavailable',desc)}));
 rows.push({id:'player',value:person('player','尚未创建','wutan.inn','player',20,4,'player')});
 rows.find(x=>x.id==='su').value.parentA='su-father';rows.find(x=>x.id==='lin').value.parentA='lin-mother';rows.find(x=>x.id==='gao-child').value.parentA='gao';
 for(const id of ['su','ning']){const p=rows.find(x=>x.id===id).value;p.fire=4;p.wood=1;p.soul=4;learn(p,'refining',1);learn(p,'formula',1);}
 rows.find(x=>x.id==='su-father').value.injury=35;return rows;}
export function initialWorld(){return {created:false,origin:'',background:'',time:0,serial:0,producedGold:0,consumedGold:0,cap:POLICY.liveCap,appraisals:[],reservations:[],families:[],
 unique:[{id:'redleaf',owner:'',status:'available'},{id:'relic',owner:'',status:'sealed'}],
 stocks:PLACES.filter(p=>p.region!=='mountain').flatMap(p=>ITEMS.filter(i=>i.kind!=='unique').map(i=>({place:p.id,item:i.id,qty:8,gold:800,quote:1}))).slice(0,64),
 promises:[],agenda:{actor:'',record:'',due:0},op:{kind:'',target:'',end:0,detail:'',stopped:false},combat:{enemy:'',round:0,guard:false},nextMarket:30*DAY,nextImmigration:90*DAY,
 known:['wutan.inn','wutan.market','wutan.herbal','wutan.auction','wutan.clan','wutan.gate','qingshan.inn','qingshan.herbal','qingshan.guild','mountain.camp'],history:[]};}
export function record(w,kind,refs,text){w.history.push({at:w.time,kind,refs,text:text.slice(0,256)});if(w.history.length>64)w.history.shift();}
export const price=id=>ITEMS.find(i=>i.id===id)?.price||0;
export const infoItem=(id,v)=>({id:'personal:'+id,sourceId:'personal',recordId:id,semantic:'belief',data:{text:v.text,target:v.target,kind:v.kind,at:v.at,source:v.source},epistemicStatus:v.status,channel:v.channel,actorId:v.actor});
