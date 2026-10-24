import {copy} from './state.js';
import {canPerceive} from './perception.js';
import {contentSha256 as sha} from './hash.js';

const visibleKinds=new Set(['bodily_harm','death','conflict_started','conflict_round','conflict_retreat','captured','released','escaped','seizure','treatment','repair_started','repair','repair_cancelled','birth','marriage','npc_share','family_supply','npc_delivery','shipment_arrival']);
const outcome=(person,n)=>({person,alive:n.alive,place:n.place,x:n.x,y:n.y,rank:n.rank,skills:copy(n.skills),hp:n.hp,qi:n.qi,injury:n.injury,condition:copy(n.condition),gear:copy(n.gear),inventory:copy(n.inventory),control:copy(n.control)});
export function causalLedger(w,rows){
 const entries=new Map();let current=null;
 function capture(id,kind,keys,source='',visibility='scene',force=false){
  id='event-'+sha('causal|'+id).slice(0,40);
  if(!current||force){
   if(!entries.has(id))entries.set(id,{id,value:{key:id,mode:'delta',kind,at:w.time,updated:w.time,source,participants:[],before:[],after:[],facts:[],playerKnown:false,publicDetails:[]},owner:false,scene:false});
   current=entries.get(id);
  }
  const player=rows.find(r=>r.id==='player')?.value;
  if(visibility==='owner'&&keys[0]==='player')current.owner=true;
  if(visibility==='scene'&&player&&keys.some(key=>{const n=rows.find(r=>r.id===key);return n&&(key==='player'||canPerceive(player,n.value));}))current.scene=true;
  for(const key of keys.filter(Boolean))if(!current.value.participants.includes(key)){
   if(current.value.participants.length>=16)throw Error('causal participant capacity');
   current.value.participants.push(key);const n=rows.find(r=>r.id===key);if(n)current.value.before.push(outcome(key,n.value));
  }
  return current.id;
 }
 function fact(kind,refs,text){
  if(!current)return;if(current.value.facts.length>=16)throw Error('causal fact capacity');
  current.value.facts.push({kind,at:w.time,refs:copy(refs),text:text.slice(0,512)});current.value.updated=w.time;
  const player=rows.find(r=>r.id==='player')?.value,actors=refs.map(key=>rows.find(r=>r.id===key)).filter(Boolean);
  const ownedMessage=kind==='message_received'&&refs[1]==='player'||kind==='message_sent'&&refs[0]==='player'||kind==='message_content'&&refs[0]==='player';
  const observed=player&&actors.length>0&&actors.every(r=>canPerceive(player,r.value));
  if(ownedMessage||visibleKinds.has(kind)&&(refs.includes('player')||observed)){
   current.value.playerKnown=true;for(let at=0;at<Math.min(512,text.length);at+=256)current.value.publicDetails.push(text.slice(at,at+256));
  }
 }
 function finish(extra=[]){
  const all=[...rows,...extra];
  const result=[...entries.values()].filter(entry=>entry.value.facts.length).map(entry=>{
   const before=[],after=[];
   for(const key of entry.value.participants){
    const old=entry.value.before.find(n=>n.person===key),row=all.find(r=>r.id===key);if(!row)continue;
    const next=outcome(key,row.value);if(!old){after.push(next);continue;}
    const left={person:key,place:old.place},right={person:key,place:next.place};
    for(const field of Object.keys(next).filter(k=>!['person','place'].includes(k))){
     if(JSON.stringify(old[field])===JSON.stringify(next[field]))continue;
     if(['inventory','gear','skills'].includes(field)){
      const id=v=>v.id||v.item,ids=new Set([...old[field],...next[field]].filter(v=>JSON.stringify(old[field].find(a=>id(a)===id(v)))!==JSON.stringify(next[field].find(a=>id(a)===id(v)))).map(id));
      left[field]=old[field].filter(v=>ids.has(id(v)));right[field]=next[field].filter(v=>ids.has(id(v)));
     }else if(field==='condition'){
      const ids=new Set([...old.condition.wounds,...next.condition.wounds].filter(v=>JSON.stringify(old.condition.wounds.find(a=>a.id===v.id))!==JSON.stringify(next.condition.wounds.find(a=>a.id===v.id))).map(v=>v.id));
      left.condition={missing:old.condition.missing,wounds:old.condition.wounds.filter(v=>ids.has(v.id))};right.condition={missing:next.condition.missing,wounds:next.condition.wounds.filter(v=>ids.has(v.id))};
     }else{left[field]=old[field];right[field]=next[field];}
    }
    if(entry.value.kind==='conflict'){left.rank=old.rank;right.rank=next.rank;left.skills=old.skills;right.skills=next.skills;}
    before.push(left);after.push(right);
   }
   return {id:entry.id,value:{...entry.value,before,after}};
  });
  if(result.length>2)throw Error('causal publication capacity');
  for(const row of result.filter(r=>r.value.playerKnown)){
   const reference={id:row.id,at:row.value.at,summary:row.value.publicDetails[0]||'已知事件'};
   w.knownCauses=w.knownCauses.filter(r=>r.id!==row.id);w.knownCauses.push(reference);
   if(w.knownCauses.length>16)w.knownCauses.shift(); // directory only; the Domain record is retained.
  }
  return result;
 }
 return {capture,fact,finish,current:()=>current?.id||''};
}
