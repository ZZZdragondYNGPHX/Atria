import {qty,add} from './state.js';
import {capabilities} from './condition.js';

import {GEAR} from '../content/catalog.js';
export {GEAR} from '../content/catalog.js';
export function gearEffects(p){
 const ability=capabilities(p);let attack=0,defense=0;
 for(const g of p.gear){const spec=GEAR[g.type],repairing=[p.activity,p.suspended].some(a=>a.kind==='repair_wait'&&a.item===g.id);if(!spec||repairing||!g.equipped||spec.durability&&g.durability<=0||spec.slot==='hand'&&ability.grip)continue;attack+=spec.attack;defense+=spec.defense;}
 return {attack,defense};
}
export function wear(p,slot,amount){for(const g of p.gear)if(g.equipped&&g.slot===slot&&GEAR[g.type].durability)g.durability=Math.max(0,g.durability-amount);}
// Rough terrain abrades equipped tools and protection only on actual arrival.
export function travelWear(p,risk){if(!(risk>0))return;wear(p,'hand',1);wear(p,'body',1);}
export function ward(p){const g=p.gear.find(g=>g.equipped&&g.type==='ward'&&g.charges>0);if(!g||capabilities(p).grip)return 0;g.charges--;return 8;}
export function repair(p,id){
 const g=p.gear.find(g=>g.id===id),spec=g&&GEAR[g.type];
 if(!spec?.durability||g.durability>=spec.durability||qty(p,'herb')<1)return false;
 add(p,'herb',-1);g.durability=Math.min(spec.durability,g.durability+20);return true;
}
