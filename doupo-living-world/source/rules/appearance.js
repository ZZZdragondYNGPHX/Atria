import {CANON_KEYS} from '../pools/cast.js';
import {pool} from '../pools/index.js';
import {eligible,draw} from './pools.js';
export const assetId=(id,kind)=>appearanceEntry(id)?.value[kind+'Asset']||'';
export const appearanceEntry=id=>pool('appearances').entries.find(e=>e.id===id);
export function assignAppearance(key,p,years,seed,used=[]){
 if(CANON_KEYS.includes(key)&&!pool('appearances').entries.some(e=>e.conditions.key.in.includes(key))){p.appearance='';return;}
 const context={key:pool('appearances').entries.some(e=>e.conditions.key.in.includes(key))?key:'',sex:p.sex,age:years};
 const old=appearanceEntry(p.appearance);if(old&&eligible(old,context))return;
 const available=pool('appearances').entries.filter(e=>eligible(e,context));
 // Dedicated character periods have explicit gaps; never disguise them with a
 // different person's face. The caller publishes missing artwork honestly.
 p.appearance=available.length?draw('appearances',{context,seed,label:key+':age:'+years,used}).entry.id:'';
}
export function appearanceView(id){const e=appearanceEntry(id);return {profile:id,period:e?.value.period||'',ready:!!e&&e.status==='ready',portraitAsset:e?assetId(id,'portrait'):'',chibiAsset:e?assetId(id,'chibi'):''};}
