import {pool} from '../pools/index.js';
import {contentSha256 as sha} from './hash.js';
export const eligible=(entry,context)=>entry.status==='ready'&&Object.entries(entry.conditions).every(([key,rule])=>{
 const value=context[key];return (!rule.in||rule.in.includes(value))&&(rule.min===undefined||value>=rule.min)&&(rule.max===undefined||value<=rule.max);
});
export function draw(poolId,{context={},seed,label,recent=[],used=[],exclude=[]}){
 const p=pool(poolId);let entries=p.entries.filter(e=>eligible(e,context)&&e.weight>0&&!exclude.includes(e.id));
 if(!entries.length)throw Error('no eligible entry: '+poolId+' '+label);
 const count=e=>used.filter(id=>id===e.id).length,min=Math.min(...entries.map(count));entries=entries.filter(e=>count(e)===min);
 const fresh=entries.filter(e=>!recent.includes(poolId+':'+e.id));if(fresh.length)entries=fresh;
 const total=entries.reduce((n,e)=>n+e.weight,0);let n=parseInt(sha(seed+'|'+poolId+'|'+label).slice(0,12),16)%total;
 const entry=entries.find(e=>(n-=e.weight)<0);return {poolId,version:p.version,entry};
}
export function drawAndRemember(w,poolId,options){
 const selected=draw(poolId,{seed:w.poolSeed,recent:w.poolRecent,...options});
 w.poolRecent.push(poolId+':'+selected.entry.id);if(w.poolRecent.length>64)w.poolRecent.shift();return selected.entry;
}
export const randomInt=(seed,label,min,max)=>min+parseInt(sha(seed+'|'+label).slice(0,12),16)%(max-min+1);
