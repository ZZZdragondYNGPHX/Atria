import {O,A,S} from './schema.mjs';

// Integration consumes these authored targets through the Native compiler.
// Schemas come from the same rules/domain/task declarations as installation.
export function bridgeSource(logic,contract){
 const empty={type:'object',properties:{},additionalProperties:false},action=(id,transactionId,execution)=>({id,kind:'action',target:{transactionId,...(execution?{execution}:{})},inputSchema:logic.transactions.find(t=>t.id===transactionId).inputSchema,outputSchema:empty});
 const bindings=[{id:'screen',kind:'read',target:{domainId:'dw_public'},inputSchema:empty,outputSchema:A(O({id:S(),value:contract.lifecycleRuntime.domains.find(d=>d.id==='dw_public').recordSchema}),10000)},
  action('act','doupo.act'),action('choice','doupo.choice'),action('plan','doupo.plan'),action('event','doupo.event','deterministic'),
  ...logic.transactions.filter(t=>/^doupo\.bind\d+$/.test(t.id)).map(t=>action(t.id.slice(6),t.id,'deterministic'))];
 for(const kind of ['continue','cancel'])bindings.push({...action(kind,kind==='continue'?'doupo.continue':'doupo.act','deterministic'),inputSchema:empty,mapping:{fields:Object.fromEntries(Object.entries({kind,target:'',item:'',qty:0,x:0,y:0,detail:'',text:'',steps:[]}).map(([key,constant])=>[key,{constant}]))}});
 bindings.push({...action('battleStep','doupo.battle-step','deterministic'),inputSchema:empty,mapping:{fields:Object.fromEntries(Object.entries({kind:'battle-step',target:'',item:'',qty:0,x:0,y:0,detail:'',text:'',steps:[]}).map(([key,constant])=>[key,{constant}]))}});
 bindings.push({...action('acknowledge','doupo.act','deterministic'),inputSchema:O({target:S()}),mapping:{fields:{...Object.fromEntries(Object.entries({kind:'talk',item:'',qty:0,x:0,y:0,detail:'acknowledge',text:'',steps:[]}).map(([key,constant])=>[key,{constant}])),target:{input:'target'}}}});
 bindings.push({...action('browse','doupo.act','deterministic'),inputSchema:O({qty:logic.transactions[0].inputSchema.properties.qty}),mapping:{fields:{...Object.fromEntries(Object.entries({kind:'browse',target:'',item:'',x:0,y:0,detail:'',text:'',steps:[]}).map(([key,constant])=>[key,{constant}])),qty:{input:'qty'}}}});
 bindings.push({...bindings.find(b=>b.id==='browse'),id:'clues',mapping:{fields:{...bindings.find(b=>b.id==='browse').mapping.fields,detail:{constant:'clues'}}}});
 bindings.push({...bindings.find(b=>b.id==='browse'),id:'known-people',mapping:{fields:{...bindings.find(b=>b.id==='browse').mapping.fields,detail:{constant:'known'}}}});
 bindings.push({...bindings.find(b=>b.id==='acknowledge'),id:'focus',mapping:{fields:{...bindings.find(b=>b.id==='acknowledge').mapping.fields,kind:{constant:'focus'},detail:{constant:''}}}});
 bindings.push({...bindings.find(b=>b.id==='acknowledge'),id:'recall',mapping:{fields:{...bindings.find(b=>b.id==='acknowledge').mapping.fields,kind:{constant:'recall'},detail:{constant:''}}}});
 for(const kind of ['condition','profile'])bindings.push({...action(kind,'doupo.act','deterministic'),inputSchema:empty,mapping:{fields:Object.fromEntries(Object.entries({kind,target:'',item:'',qty:0,x:0,y:0,detail:'',text:'',steps:[]}).map(([key,constant])=>[key,{constant}]))}});
 return {version:1,bindings};
}
