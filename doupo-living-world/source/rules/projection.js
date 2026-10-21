import {PLACES,KINDS,PLAYER,YEAR} from '../content/catalog.js';
import {age,copy,price} from './state.js';
export function observePerson(key,n){return {key,actor:n.actor,sex:n.sex,name:n.name,role:n.role,place:n.place,x:n.x,y:n.y,alive:n.alive,status:n.alive?'here':'deceased',needItem:n.alive?n.needitem:'',needQty:n.alive?n.needqty:0,reply:n.alive?n.decision:'',activity:n.plan,contact:n.alive};}
export function project(w,rows,memories,result){
 const p=rows.find(r=>r.id==='player').value;
 const observed=new Map(memories.filter(r=>r.value.actor===PLAYER&&r.value.kind==='person').map(r=>{const n=JSON.parse(r.value.text);return [n.key,{...n,status:n.alive?'last_known':'deceased',contact:false,reply:'',needItem:'',needQty:0}];}));
 for(const r of rows)if(r.id!=='player'&&r.value.place===p.place)observed.set(r.id,observePerson(r.id,r.value));
 const allPeople=[...observed.values()].sort((a,b)=>Number(b.status==='here')-Number(a.status==='here')||a.key.localeCompare(b.key));
 const peoplePages=Math.max(1,Math.ceil(allPeople.length/12)),peoplePage=Math.min(w.peoplePage,peoplePages-1),people=allPeople.slice(peoplePage*12,(peoplePage+1)*12);
 const allClues=memories.filter(r=>r.value.actor===PLAYER&&r.value.kind!=='person').sort((a,b)=>b.value.at-a.value.at||a.id.localeCompare(b.id)),cluesPages=Math.max(1,Math.ceil(allClues.length/8)),cluesPage=Math.min(w.cluesPage,cluesPages-1);
 const clues=allClues.slice(cluesPage*8,(cluesPage+1)*8).map(r=>({id:r.id,kind:r.value.kind,text:r.value.text.slice(0,192),source:r.value.source,at:r.value.at}));
 return {cluesPage,cluesPages,peoplePage,peoplePages,peopleTotal:allPeople.length,created:w.created,time:w.time,place:p.place,x:p.x,y:p.y,name:p.name,rank:p.rank,hp:p.hp,qi:p.qi,injury:p.injury,gold:p.gold,alive:p.alive,age:age(p,w.time),inventory:copy(p.inventory),skills:copy(p.skills),quotes:w.stocks.filter(s=>s.place===p.place).map(s=>({item:s.item,qty:s.qty,price:price(s.item),quote:s.quote})),people,
 known:copy(w.known),clues,family:copy(w.families.filter(f=>f.a==='player'||f.b==='player')).slice(-4),promises:copy(w.promises.filter(f=>f.giver==='player'||f.receiver==='player')).slice(-32),
 opportunities:w.unique.filter(u=>allClues.some(r=>r.value.kind==='opportunity'&&r.value.text.includes(u.id==='redleaf'?'赤叶':'支洞'))).map(u=>({id:u.id,state:u.owner==='player'?'obtained':'reported',text:u.owner==='player'?'已取得':'这是所得线索，当前归属需调查。'})),
 operation:w.appraisals.length?{kind:'appraise',target:'',end:w.time,detail:'',stopped:false}:w.op.kind?copy(w.op):w.plan.length?{kind:'plan',target:'',end:w.time,detail:'',stopped:false}:copy(w.op),combat:copy(w.combat),result,actions:(!p.alive?['restore']:(w.op.kind||w.appraisals.length||w.plan.length)?['continue','cancel']:KINDS.filter(k=>!['continue','cancel','create'].includes(k)))};
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
