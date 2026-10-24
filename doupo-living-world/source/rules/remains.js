import {canPerceive} from './perception.js';
import {qty,add} from './person-data.js';
import {ITEMS,GEAR} from '../content/catalog.js';
export const visibleRemains=(w,p)=>w.corpses.filter(r=>canPerceive(p,r)).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
export function remainsView(w,rows,p){
 const all=visibleRemains(w,p),pages=Math.max(1,Math.ceil(all.length/3)),page=Math.min(w.corpsePage,pages-1);
 return {page,pages,total:all.length,rows:all.slice(page*3,(page+1)*3).map(e=>{
  const n=rows.find(r=>r.id===e.id)?.value,near=Math.abs(p.x-e.x)+Math.abs(p.y-e.y)<=1,opened=w.searchedCorpses.includes(e.id)&&near&&!!n;
  return {id:e.id,name:e.name,x:e.x,y:e.y,at:e.at,near,opened,heir:e.heir==='player',
   items:opened?[...(n.gold?[{id:'gold',name:'金币',qty:n.gold}]:[]),...n.inventory.filter(i=>i.qty>0).map(i=>({id:i.item,name:ITEMS.find(e=>e.id===i.item)?.name||i.item,qty:i.qty})),...n.gear.map(g=>({id:'gear:'+g.id,name:(GEAR[g.type]?.name||'器物')+' · '+g.durability+'耐久 / '+g.charges+'充能',qty:1}))]:[]};
 })};
}
export function takeRemains(c,fromId,toId,item,amount=1){
 const source=c.row(fromId)?.value,target=c.row(toId)?.value;
 if(!Number.isInteger(amount)||amount<1||fromId===toId)return false;
 if(!source||!target||!target.alive||source.place!==target.place||Math.abs(source.x-target.x)+Math.abs(source.y-target.y)>1)return false;
 if(source.alive&&source.control.holder!==toId)return false;
 if(item==='gold'){
  if(source.gold<amount)return false;c.touch(fromId);c.touch(toId);source.gold-=amount;target.gold+=amount;return true;
 }
 if(item.startsWith('gear:')){
  const at=source.gear.findIndex(g=>g.id===item.slice(5));if(at<0||target.gear.length>=4||amount!==1)return false;
  c.touch(fromId);c.touch(toId);const g=source.gear.splice(at,1)[0];g.equipped=false;target.gear.push(g);return true;
 }
 if(qty(source,item)<amount||target.inventory.length>=24&&!target.inventory.some(i=>i.item===item))return false;
 c.touch(fromId);c.touch(toId);add(source,item,-amount);add(target,item,amount);return true;
}
export function inheritAtScene(c,deadId,heirId){
 const entry=c.w.corpses.find(e=>e.id===deadId&&e.heir===heirId),dead=c.row(deadId)?.value;if(!entry||!dead)return 0;
 let count=0;
 if(dead.gold&&takeRemains(c,deadId,heirId,'gold',dead.gold))count++;
 for(const i of dead.inventory.filter(i=>i.qty>0))if(takeRemains(c,deadId,heirId,i.item,i.qty))count++;
 for(const g of [...dead.gear])if(takeRemains(c,deadId,heirId,'gear:'+g.id,1))count++;
 return count;
}
