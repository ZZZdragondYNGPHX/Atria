import {PLACES,KINDS,PLAYER,YEAR} from '../content/catalog.js';
import {age,copy,price} from './state.js';
export function project(w,rows,memories,result){
 const p=rows.find(r=>r.id==='player').value;
 const people=rows.filter(r=>r.id!=='player' && (r.value.place===p.place || p.visited.includes('person:'+r.id))).map(r=>({key:r.id,actor:r.value.actor,name:r.value.name,role:r.value.role,place:r.value.place===p.place?r.value.place:'',
 x:r.value.place===p.place?r.value.x:0,y:r.value.place===p.place?r.value.y:0,alive:r.value.place===p.place?r.value.alive:!memories.some(m=>m.value.actor===PLAYER&&m.value.kind==='death'&&m.value.text.includes(r.value.name)),status:r.value.place===p.place?'here':'last_known',needItem:r.value.place===p.place?r.value.needItem:'',needQty:r.value.place===p.place?r.value.needQty:0,reply:r.value.place===p.place?r.value.decision:'',activity:r.value.place===p.place?r.value.plan:'尚无近况',contact:r.value.alive&&r.value.place===p.place}));
 const clues=memories.filter(r=>r.value.actor===PLAYER).map(r=>({id:r.id,kind:r.value.kind,text:r.value.text,source:r.value.source,at:r.value.at})).slice(-16).map(c=>({...c,text:c.text.slice(0,512)}));
 return {created:w.created,time:w.time,place:p.place,x:p.x,y:p.y,name:p.name,rank:p.rank,hp:p.hp,qi:p.qi,injury:p.injury,gold:p.gold,alive:p.alive,age:age(p,w.time),inventory:copy(p.inventory),skills:copy(p.skills),quotes:w.stocks.filter(s=>s.place===p.place).map(s=>({item:s.item,qty:s.qty,price:price(s.item),quote:s.quote})),people,
 known:copy(w.known),clues,family:copy(w.families.filter(f=>f.a==='player'||f.b==='player')).slice(0,4),promises:copy(w.promises.filter(f=>f.giver==='player'||f.receiver==='player')).slice(0,32),
 opportunities:w.unique.filter(u=>clues.some(c=>c.kind==='opportunity'&&c.text.includes(u.id==='redleaf'?'赤叶':'支洞'))).map(u=>({id:u.id,state:u.owner==='player'?'obtained':'reported',text:u.owner==='player'?'已取得':'这是所得线索，当前归属需调查。'})),
 operation:w.appraisals.length?{kind:'appraise',target:'',end:w.time,detail:'',stopped:false}:copy(w.op),combat:copy(w.combat),result,actions:(!p.alive?['restore']:(w.op.kind||w.appraisals.length)?['continue','cancel']:KINDS.filter(k=>!['continue','cancel','create'].includes(k)))};
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
