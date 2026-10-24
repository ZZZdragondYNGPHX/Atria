import {YEAR} from '../content/catalog.js';
export const copy=v=>JSON.parse(JSON.stringify(v));
export const qty=(p,id)=>p.inventory.find(x=>x.item===id)?.qty||0;
export function add(p,item,n){let row=p.inventory.find(x=>x.item===item);if(!row){if(p.inventory.length>=24)throw Error('inventory capacity');row={item,qty:0};p.inventory.push(row);}row.qty+=n;if(row.qty<0)throw Error('inventory');}
export const skill=(p,id)=>p.skills.find(x=>x.id===id)?.level||0;
export function learn(p,id,n=1){let row=p.skills.find(x=>x.id===id);if(!row){if(p.skills.length>=16)throw Error('life skill capacity');row={id,level:0};p.skills.push(row);}row.level=Math.min(100,row.level+n);}
export const age=(p,t)=>Math.max(0,Math.floor((t-p.born)/YEAR));
export const idleActivity=()=>({kind:'',target:'',item:'',started:0,due:0,progress:0,pausedAt:0,source:''});
export const freeControl=()=>({holder:'',since:0,until:0,source:''});
