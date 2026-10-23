import {PLACES,KINDS,PLAYER} from '../content/catalog.js';
import {age,copy,price,qty} from './state.js';
import {conditionSigns,conditionDetail,capabilities} from './condition.js';
import {canPerceive} from './perception.js';
export function observePerson(key,n,at){
 const labels={buy:'采购补给',work:'做工',rest:'休息',train:'修炼',learn:'研读',breakthrough:'调息蓄气',travel:'赶路',gather:'采集',forage:'寻找补给',refine:'炼药',produce:'加工药材',treat:'照护伤者',repair_service:'修理器物',repair_wait:'等候修理',watch:'观察周围动静',guard_control:'看守',conflict:'发生争执'};
 return {key,actor:n.actor,sex:n.sex,name:n.name,role:n.role,place:n.place,x:n.x,y:n.y,alive:n.alive,status:n.alive?'here':'deceased',needItem:n.alive?n.needitem:'',needQty:n.alive?n.needqty:0,reply:n.alive?n.decision:'',activity:n.alive?labels[n.activity.kind]||'在此停留':'已故',contact:n.alive&&!capabilities(n).communicate,signs:conditionSigns(n),observedAt:at,carrying:n.displayed&&qty(n,n.displayed)>0?n.displayed:''};
}
export function project(w,rows,memories,result){
 const p=rows.find(r=>r.id==='player').value;
 const observed=new Map(memories.filter(r=>r.value.actor===PLAYER&&r.value.kind==='person').map(r=>{const n=JSON.parse(r.value.text);return [n.key,{...n,status:n.alive?'last_known':'deceased',contact:false,reply:'',needItem:'',needQty:0}];}));
 for(const r of rows)if(r.id!=='player'&&canPerceive(p,r.value))observed.set(r.id,observePerson(r.id,r.value,w.time));
 const allPeople=[...observed.values()].sort((a,b)=>Number(b.status==='here')-Number(a.status==='here')||a.key.localeCompare(b.key));
 const peoplePages=Math.max(1,Math.ceil(allPeople.length/12)),peoplePage=Math.min(w.peoplePage,peoplePages-1),people=allPeople.slice(peoplePage*12,(peoplePage+1)*12);
 const allClues=memories.filter(r=>r.value.actor===PLAYER&&r.value.kind!=='person').sort((a,b)=>b.value.at-a.value.at||a.id.localeCompare(b.id)),cluesPages=Math.max(1,Math.ceil(allClues.length/8)),cluesPage=Math.min(w.cluesPage,cluesPages-1);
 const clues=allClues.slice(cluesPage*8,(cluesPage+1)*8).map(r=>({id:r.id,kind:r.value.kind,text:r.value.text.slice(0,192),source:r.value.source,at:r.value.at}));
 return {cluesPage,cluesPages,peoplePage,peoplePages,peopleTotal:allPeople.length,created:w.created,time:w.time,place:p.place,x:p.x,y:p.y,name:p.name,rank:p.rank,hp:p.hp,qi:p.qi,injury:p.injury,gold:p.gold,alive:p.alive,age:age(p,w.time),inventory:copy(p.inventory),skills:copy(p.skills),quotes:w.stocks.filter(s=>s.place===p.place).map(s=>({item:s.item,qty:s.qty,price:price(s.item),quote:s.quote})),people,
 condition:conditionDetail(p),gear:copy(p.gear),control:copy(p.control),social:copy(p.social),goals:copy(p.goals),events:copy(w.knownCauses),
 messages:w.messages.filter(m=>m.sender==='player'||m.receiver==='player'&&m.status==='delivered').slice(-8).map(m=>({id:m.id,sender:m.sender,receiver:m.receiver,kind:m.kind,status:m.sender==='player'&&m.receiver!=='player'?'sent':m.status,at:m.created,summary:m.text.slice(0,128),event:m.sender==='player'?m.evidence:m.receipt})),workshops:w.organizations.filter(o=>o.place===p.place).map(o=>({id:o.id,place:o.place,status:o.status,output:o.output})),
 known:copy(w.known),clues,family:copy(w.families.filter(f=>f.a==='player'||f.b==='player')).slice(-4),promises:copy(w.promises.filter(f=>f.giver==='player'||f.receiver==='player')).slice(-32),
 opportunities:w.unique.filter(u=>allClues.some(r=>r.value.kind==='opportunity'&&r.value.text.includes(u.id==='redleaf'?'赤叶':'支洞'))).map(u=>({id:u.id,state:u.owner==='player'?'obtained':'reported',text:u.owner==='player'?'已取得':'这是所得线索，当前归属需调查。'})),
 operation:w.appraisals.length?{kind:'appraise',target:'',end:w.time,detail:'',stopped:false}:w.op.kind?copy(w.op):w.plan.length?{kind:'plan',target:'',end:w.time,detail:'',stopped:false}:copy(w.op),combat:copy(w.combat),result,actions:(!p.alive?['restore']:(w.op.kind||w.appraisals.length||w.plan.length)?['continue','cancel']:KINDS.filter(k=>!['continue','cancel','create'].includes(k)))};
}
export function intentProjection(v){
 const selected={created:v.created,time:v.time,name:v.name,place:v.place,x:v.x,y:v.y,rank:v.rank,hp:v.hp,qi:v.qi,gold:v.gold,alive:v.alive,inventory:v.inventory,skills:v.skills,quotes:v.quotes,known:v.known,
  people:v.people.map(n=>({key:n.key,name:n.name,place:n.place,x:n.x,y:n.y,alive:n.alive,contact:n.contact,status:n.status,needItem:n.needItem,needQty:n.needQty,signs:n.signs.slice(0,2),carrying:n.carrying})),
  unavailable:v.condition.capabilities.filter(c=>!c.available),operation:v.operation,combat:v.combat,
  families:v.family.map(f=>({id:f.id,a:f.a,b:f.b,status:f.status})),promises:v.promises.filter(p=>p.status==='open').slice(-4),
  events:v.events.slice(-4).map(e=>({id:e.id,summary:e.summary.slice(0,96)})),clues:v.clues.slice(0,2).map(c=>({id:c.id,text:c.text.slice(0,96)})),
  result:{code:v.result.code,text:v.result.text.slice(0,120),at:v.result.at,spent:v.result.spent},actions:v.actions,truncated:false};
 const bytes=s=>{let n=0;for(const char of s){const c=char.codePointAt(0);n+=c<128?1:c<2048?2:c<65536?3:4;}return n;};
 let text=JSON.stringify(selected);
 while(bytes(text)>8192){
  selected.truncated=true;
  const list=[selected.clues,selected.events,selected.promises,selected.families,selected.people].find(a=>a.length>0);
  if(!list)throw Error('essential intent projection capacity');list.pop();text=JSON.stringify(selected);
 }
 return text;
}
// Grid BFS has a stable neighbor order. Preview and settlement use this same rule.
export function pathTo(place,from,to){
 const s=PLACES.find(p=>p.id===place);if(!s)return null;
 const valid=(x,y)=>x>=0&&y>=0&&x<s.width&&y<s.height&&!s.blocks.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);
 if(!valid(to.x,to.y)||!valid(from.x,from.y))return null;
 const queue=[{x:from.x,y:from.y,path:[]}],seen=new Set([from.x+','+from.y]);
 for(let at=0;at<queue.length;at++){const c=queue[at];if(c.x===to.x&&c.y===to.y)return c.path;
 for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const x=c.x+dx,y=c.y+dy,key=x+','+y;if(valid(x,y)&&!seen.has(key)){seen.add(key);queue.push({x,y,path:[...c.path,{x,y}]});}}}return null;
}
