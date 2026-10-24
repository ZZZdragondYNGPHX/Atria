import {placeOf,KINDS,PLAYER,ITEMS} from '../content/catalog.js';
import {age,copy,price,qty} from './state.js';
import {conditionSigns,conditionDetail,capabilities} from './condition.js';
import {canPerceive} from './perception.js';
import {CANON_KEYS} from '../pools/cast.js';
import {KEY_CHARACTERS} from '../pools/appearances.js';
import {appearanceView} from './appearance.js';
import {artsView,resources,artByItem} from './progression.js';
import {realm,growthNeed} from './realm.js';
import {combatView,activeEncounter} from './combat.js';
import {remainsView} from './remains.js';
import {questView} from './quests.js';
import {questActivityView} from './quest-activities.js';
export function observePerson(key,n,at){
 const labels={buy:'采购补给',work:'做工',rest:'休息',train:'修炼',learn:'研读',switch:'转换主修',inheritance:'前往领取遗产',breakthrough:'调息蓄气',travel:'赶路',gather:'采集',forage:'寻找补给',refine:'炼药',produce:'加工药材',treat:'照护伤者',repair_service:'修理器物',repair_wait:'等候修理',watch:'观察周围动静',guard_control:'看守',conflict:'发生争执'};
 return {key,actor:n.actor,sex:n.sex,name:n.name,role:n.role,place:n.place,x:n.x,y:n.y,alive:n.alive,status:n.alive?'here':'deceased',needItem:n.alive&&!n.species?n.needitem:'',needQty:n.alive&&!n.species?n.needqty:0,reply:n.alive?n.decision.slice(0,512):'',activity:n.alive?labels[n.activity.kind]||'在此停留':'已故',contact:n.alive&&!capabilities(n).communicate,signs:conditionSigns(n),observedAt:at,carrying:n.displayed&&qty(n,n.displayed)>0?n.displayed:'',appearance:appearanceView(n.appearance)};
}
export function project(w,rows,memories,result){
 const p=rows.find(r=>r.id==='player').value;
 const fighting=activeEncounter(w.combat),pageSize=fighting?4:12,markerSize=fighting?6:12;
 const observed=new Map(memories.filter(r=>r.value.actor===PLAYER&&r.value.kind==='person').map(r=>{const n=JSON.parse(r.value.text);return [n.key,{...n,status:n.alive?'last_known':'deceased',contact:false,reply:'',needItem:'',needQty:0}];}));
 for(const r of rows)if(r.id!=='player'&&canPerceive(p,r.value))observed.set(r.id,observePerson(r.id,r.value,w.time));
 const nearby=[...observed.values()].filter(n=>n.status==='here').sort((a,b)=>a.key.localeCompare(b.key)),knownPeople=[...observed.values()].filter(n=>n.status!=='here').sort((a,b)=>b.observedAt-a.observedAt||a.key.localeCompare(b.key));
 const allPeople=w.peopleFilter==='known'?knownPeople:nearby;
 const priority=n=>n.key===w.focus?['selected',0]:n.key===w.agenda.record||n.key===w.combat.enemy||n.activity==='发生争执'?['interaction',1]:(KEY_CHARACTERS.includes(n.key)||CANON_KEYS.includes(n.key))?['key',2]:n.key===p.partner||w.companions.includes(n.key)||p.social.some(e=>e.b===n.key&&e.kind==='family'&&e.confidence==='known')?['relation',3]:null;
 const candidates=nearby.map(n=>({n,importance:priority(n)})).filter(r=>r.importance).sort((a,b)=>a.importance[1]-b.importance[1]||a.n.key.localeCompare(b.n.key));
 const markers=candidates.slice(0,markerSize).map(({n,importance})=>({key:n.key,name:n.name,x:n.x,y:n.y,reason:importance[0],appearance:n.appearance}));
 const focus=nearby.some(n=>n.key===w.focus)?w.focus:'';
 const peoplePages=Math.max(1,Math.ceil(allPeople.length/pageSize)),peoplePage=Math.min(w.peoplePage,peoplePages-1),people=allPeople.slice(peoplePage*pageSize,(peoplePage+1)*pageSize);
 const allClues=memories.filter(r=>r.value.actor===PLAYER&&r.value.kind!=='person').sort((a,b)=>b.value.at-a.value.at||a.id.localeCompare(b.id)),cluesPages=Math.max(1,Math.ceil(allClues.length/8)),cluesPage=Math.min(w.cluesPage,cluesPages-1);
 const clues=allClues.slice(cluesPage*8,(cluesPage+1)*8).map(r=>({id:r.id,kind:r.value.kind,text:r.value.text.slice(0,192),source:r.value.source,at:r.value.at}));
 const library=artsView(p,w.time,w.artsPage,fighting?4:8),resource=resources(p),settling=['collecting','resolving','world','cleanup'].includes(w.combat.phase);
 return {quests:questView(w,rows,p),activities:questActivityView(w,rows,p),remains:remainsView(w,rows,p),cluesPage,cluesPages,peoplePage,peoplePages,peopleTotal:allPeople.length,peopleFilter:w.peopleFilter,nearbyTotal:nearby.length,knownPeopleTotal:knownPeople.length,focus,markers,markerTotal:candidates.length,markersTruncated:candidates.length>markers.length,appearance:appearanceView(p.appearance),arts:library.rows,artsPage:library.page,artsPages:library.pages,artsTotal:library.total,
 realm:realm(p.rank).label,qiCapacity:resource.capacity,qiQuality:resource.quality,xp:p.xp,growthNeed:growthNeed(p),primary:p.study.cultivation,auxiliary:copy(p.study.auxiliary),switching:copy(p.study.switching),hotbar:copy(p.study.hotbar),
 created:w.created,time:w.time,place:p.place,placeName:placeOf(p.place)?.name||'途中路段',x:p.x,y:p.y,name:p.name,sex:p.sex,rank:p.rank,hp:p.hp,qi:p.qi,injury:p.injury,gold:p.gold,alive:p.alive,age:age(p,w.time),inventory:copy(p.inventory),skills:copy(p.skills),quotes:w.stocks.filter(s=>s.place===p.place).map(s=>({item:s.item,qty:s.qty,price:price(s.item),quote:s.quote})),people,
 condition:conditionDetail(p),gear:copy(p.gear),control:copy(p.control),social:copy(p.social),goals:copy(p.goals),events:copy(w.knownCauses),
 messages:w.messages.filter(m=>m.sender==='player'||m.receiver==='player'&&m.status==='delivered').slice(-8).map(m=>({id:m.id,sender:m.sender,receiver:m.receiver,kind:m.kind,status:m.sender==='player'&&m.receiver!=='player'?'sent':m.status,at:m.created,summary:m.text.slice(0,128),event:m.sender==='player'?m.evidence:m.receipt})),workshops:w.organizations.filter(o=>o.place===p.place).map(o=>({id:o.id,place:o.place,status:o.status,output:o.output})),
 known:copy(w.known),clues,family:copy(w.families.filter(f=>f.a==='player'||f.b==='player')).slice(-4),promises:copy(w.promises.filter(f=>f.giver==='player'||f.receiver==='player')).slice(-32),
 opportunities:w.unique.filter(u=>allClues.some(r=>r.value.kind==='opportunity'&&r.value.text.includes(u.id==='redleaf'?'赤叶':'支洞'))).map(u=>({id:u.id,state:u.owner==='player'?'obtained':'reported',text:u.owner==='player'?'已取得':'这是所得线索，当前归属需调查。'})),
 operation:w.deaths.length?{kind:'inherit',target:'',end:w.time,detail:'',stopped:false}:w.combat.phase==='cleanup'&&w.appraisals.length?{kind:'appraise',target:'',end:w.time,detail:'',stopped:false}:settling?{kind:'combat',target:w.combat.id,end:w.combat.clock||w.time,detail:'',stopped:false}:w.appraisals.length?{kind:'appraise',target:'',end:w.time,detail:'',stopped:false}:w.initialResidents?{kind:'initialize',target:'',end:w.time,detail:'',stopped:false}:w.op.kind?copy(w.op):w.plan.length?{kind:'plan',target:'',end:w.time,detail:'',stopped:false}:copy(w.op),
 combat:combatView({w,rows},w.combat),result,actions:(w.deaths.length||settling?['continue','focus','browse']:!p.alive?['restore']:(w.op.kind||w.appraisals.length||w.plan.length||w.initialResidents)?['continue','cancel','focus','browse']:fighting?['battle','command','attack','technique','guard','retreat','surrender','consume','breathe','prepare','accept','negotiate','rescue','browse','focus']:KINDS.filter(k=>!['continue','cancel','create'].includes(k)))};
}
export function intentProjection(v){
 const selected={created:v.created,time:v.time,name:v.name,sex:v.sex,place:v.place,placeName:v.placeName,x:v.x,y:v.y,rank:v.rank,realm:v.realm,hp:v.hp,qi:v.qi,qiCapacity:v.qiCapacity,primary:v.primary,artsPage:v.artsPage,artsPages:v.artsPages,gold:v.gold,alive:v.alive,inventory:v.inventory,skills:v.skills,arts:v.arts.map(a=>({id:a.id,name:a.name,type:a.type,tier:a.tier,item:a.item,known:a.known,reason:a.reason,active:a.active})),quotes:v.quotes.map(q=>({item:q.item,name:ITEMS.find(i=>i.id===q.item)?.name||q.item,tier:artByItem(q.item)?.value.tier||'',availableQty:q.qty,unitPrice:q.price,actionDetail:String(q.quote)})),known:v.known,peopleFilter:v.peopleFilter,peoplePage:v.peoplePage,peoplePages:v.peoplePages,nearbyTotal:v.nearbyTotal,focus:v.focus,markers:v.markers.map(n=>({key:n.key,name:n.name,x:n.x,y:n.y,reason:n.reason})),
  people:v.people.map(n=>({key:n.key,name:n.name,place:n.place,x:n.x,y:n.y,alive:n.alive,contact:n.contact,status:n.status,needItem:n.needItem,needQty:n.needQty,signs:n.signs.slice(0,2),carrying:n.carrying})),
  remains:v.remains,unavailable:v.condition.capabilities.filter(c=>!c.available),operation:v.operation,combat:{...v.combat,log:[],techniques:v.combat.techniques.map(a=>({id:a.id,name:a.name,kind:a.kind,qiCost:a.qiCost,range:a.range,radius:a.radius,reason:a.reason})),participants:v.combat.participants.map(p=>({id:p.id,name:p.name,side:p.side,status:p.status,x:p.x,y:p.y}))},
  families:v.family.map(f=>({id:f.id,a:f.a,b:f.b,status:f.status})),promises:v.promises.filter(p=>p.status==='open').slice(-4),
  events:v.events.slice(-4).map(e=>({id:e.id,summary:e.summary.slice(0,96)})),clues:v.clues.slice(0,2).map(c=>({id:c.id,text:c.text.slice(0,96)})),
  quests:v.quests.known.map(q=>({id:q.id,title:q.title,status:q.status,options:q.options})),activities:v.activities.instances.map(a=>({id:a.id,title:a.title,stage:a.stage,options:a.options})),activityOpenings:v.activities.openings,
  result:{code:v.result.code,text:v.result.text.slice(0,120),at:v.result.at,spent:v.result.spent},actions:v.actions,truncated:false};
 const bytes=s=>{let n=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c>=0xd800&&c<=0xdbff&&i+1<s.length){n+=4;i++;}else n+=c<128?1:c<2048?2:3;}return n;};
 let text=JSON.stringify(selected);
 while(text.length*3>8192&&bytes(text)>8192){
  selected.truncated=true;
  const list=[selected.clues,selected.events,selected.quests,selected.activities,selected.activityOpenings,selected.promises,selected.families,selected.people,selected.markers,selected.arts,selected.remains.rows,selected.combat.log,selected.combat.techniques].find(a=>a.length>0);
  if(!list)throw Error('essential intent projection capacity');list.pop();text=JSON.stringify(selected);
 }
 return text;
}
export {pathTo} from './spatial.js';
