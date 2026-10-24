// Record layout groups rule state beneath one explicit read grant. Identity and
// availability remain native first-class fields; nothing is stored twice.
import {settledQuest} from './quest-state.js';
export const MIND_FIELDS=['traits','goals','motives','social'];
export function packPerson(p){const {actor,alive,health,...rest}=p;return {actor,alive,state:{body:Object.fromEntries(Object.entries(rest).filter(([key])=>!MIND_FIELDS.includes(key))),mind:Object.fromEntries(MIND_FIELDS.map(key=>[key,rest[key]])),health}};}
export function unpackPerson(p){return {...p.state.body,...p.state.mind,health:p.state.health||'',actor:p.actor,alive:p.alive};}
// Intern repeated object layouts once per bounded ledger. Numeric tags distinguish
// arrays from objects; decoding restores every field, including empty/zero values.
function compactValue(value,shapes,strings){
 if(typeof value==='string'&&value.length>24){let at=strings.indexOf(value);if(at<0){at=strings.length;strings.push(value);}return [-2,at];}
 if(Array.isArray(value))return [-1,...value.map(v=>compactValue(v,shapes,strings))];
 if(value&&typeof value==='object'){
  const keys=Object.keys(value),signature=keys.join('|');let at=shapes.findIndex(s=>s.join('|')===signature);
  if(at<0){at=shapes.length;shapes.push(keys);}
  return [at,...keys.map(k=>compactValue(value[k],shapes,strings))];
 }
 return value;
}
function expandValue(value,shapes,strings=[]){
 if(!Array.isArray(value))return value;
 if(value[0]===-2)return strings[value[1]];
 if(value[0]===-1)return value.slice(1).map(v=>expandValue(v,shapes,strings));
 const keys=shapes[value[0]];if(!keys||keys.length!==value.length-1)throw Error('quest persistence layout');
 return Object.fromEntries(keys.map((k,i)=>[k,expandValue(value[i+1],shapes,strings)]));
}
const encode=(value,limit)=>{const shapes=[],strings=[],data=compactValue(value,shapes,strings),text=JSON.stringify(['ledger-v2',shapes,strings,data]);if(text.length>limit*32768)throw Error('quest persistence capacity');const chunks=[];for(let i=0;i<text.length;i+=32768)chunks.push(text.slice(i,i+32768));return chunks;};
const decode=chunks=>{const value=JSON.parse(chunks.join(''));return Array.isArray(value)&&value[0]==='ledger-v2'?expandValue(value[3],value[1],value[2]):Array.isArray(value)&&value[0]==='ledger-v1'?expandValue(value[2],value[1]):value;};
// One world record remains authoritative. Chunking avoids the host's schema-node
// ceiling; decoded fields have explicit author schemas and are never model input.
export function byteLength(text){return text.length+(text.match(/[\u0080-\u07ff]/g)||[]).length+2*(text.match(/[\u0800-\uffff]/g)||[]).length-2*(text.match(/[\ud800-\udbff][\udc00-\udfff]/g)||[]).length;}
export function packWorld(w,budget=60000){
 const {serial,quests,questActivities,combat,conflicts,...state}=w;
 let packed={serial,state:{...state,quests:encode(quests,4),questActivities:encode(questActivities,2),combat:encode(combat,4),conflicts:encode(conflicts,4)}};
 let size=byteLength(JSON.stringify(packed));
 // The host measures the complete value in UTF-8, not individual JSON chunks.
 // Reclaim only fully settled detail; aggregate facts and all obligations survive.
 while(size>budget){
  const reclaimable=quests.instances.filter(settledQuest);if(!reclaimable.length)break;
  // Geometric batches bound encoding passes under the Native CPU deadline.
  // Keep newer detail when possible; never scan/re-encode once per old contract.
  const batch=reclaimable.slice(0,Math.max(1,Math.ceil(reclaimable.length/2)));
  for(const q of batch){quests.instances.splice(quests.instances.indexOf(q),1);quests.history.push({id:q.id,seed:q.seed,status:q.status,at:w.time,paid:q.paid,text:q.progress.slice(0,256)});if(quests.history.length>24)quests.history.shift();}
  packed.state.quests=encode(quests,4);
  size=byteLength(JSON.stringify(packed));
 }
 if(size>65536)throw Error('world persistence capacity: unresolved obligations retained');
 return packed;
}
export function unpackWorld(w){return {...w.state,quests:decode(w.state.quests),questActivities:decode(w.state.questActivities),combat:decode(w.state.combat),conflicts:decode(w.state.conflicts),serial:w.serial};}
