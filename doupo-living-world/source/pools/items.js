import {arts} from './arts.js';
export const items={id:'items',version:1,entries:[
 ...[{id:'food',name:'干粮',price:3,kind:'supply'},{id:'herb',name:'常用药草',price:8,kind:'material'},
 {id:'redleaf',name:'赤叶药材',price:35,kind:'unique'},{id:'medicine',name:'基础疗伤散',price:22,kind:'medicine'},
 {id:'relic',name:'支洞遗留的修炼札记',price:180,kind:'unique'},
 {id:'throwing-knife',name:'投掷短刃',price:6,kind:'supply'},{id:'fire-sand',name:'赤焰砂',price:18,kind:'material'},{id:'meat',name:'兽食肉',price:4,kind:'material'}].map(v=>({id:v.id,weight:1,status:'ready',conditions:{},value:v})),
 ...arts.entries.filter(e=>e.status==='ready'&&e.value.item).map(e=>({id:e.value.item,weight:e.weight,status:'ready',conditions:{},value:{id:e.value.item,name:e.value.name+'抄本',price:e.value.price,kind:'manual',art:e.id}}))
]};
