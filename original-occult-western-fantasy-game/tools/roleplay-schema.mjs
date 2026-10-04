import assert from 'node:assert/strict';
const text = (maxLength=512) => ({type:'string',minLength:1,maxLength});
const integer = (minimum=0,maximum=1000000) => ({type:'integer',minimum,maximum});
const object = properties => ({type:'object',properties,required:Object.keys(properties)});
const list = (items,minItems=1,maxItems=16) => ({type:'array',items,minItems,maxItems});
export const roleplaySchema = object({
 schemaVersion:integer(1,1),rulesVersion:text(64),
 questions:list(object({id:text(32),prompt:text(),options:list(object({id:text(32),label:text(64),text:text(),location:text(96),coins:integer(0,100),tool:text(32)}),3,4)}),5,5),
 incompatibilities:list(object({residence:text(32),attachment:text(32),reason:text()})),
 places:list(object({id:text(96),label:text(64),text:text()}),6,6),
 routes:list(object({from:text(96),to:text(96),minutes:integer(1,60)})),
 institutions:list(object({id:text(32),definitionId:text(96),label:text(64),place:text(96),seed:text(96),carrier:text(64),secondCarrier:text(64),rule:text(),training:text(),anchor:text(),price:text(),fee:integer(0,4)}),2,2),
 dynamicTemplates:list(object({id:text(32),kind:text(16),role:text(32),wage:integer(0,8)}),3,3),
 illegal:object({warning:text(),carrier:text(64),rule:text(),price:text()})
});
// Options have dimension-specific fields; all other structures stay closed.
roleplaySchema.properties.questions.items.properties.options.items.required=['id','label','text'];
export function validateRoleplay(data,all,assertShape) {
 assertShape(data,roleplaySchema,'roleplay.foundation');
 assert.equal(data.rulesVersion,'open-roleplay-1');
 assert.deepEqual(data.questions.map(q=>q.id),['residence','livelihood','attachment','contact','aim']);
 for(const q of data.questions)assert.equal(new Set(q.options.map(o=>o.id)).size,q.options.length);
 for(const q of data.questions)for(const o of q.options){
  assert.deepEqual(Object.keys(o).sort(),(q.id==='residence'?['id','label','text','location']:q.id==='livelihood'?['id','label','text','coins','tool']:['id','label','text']).sort());
  if(o.location)assert.equal(all.get(o.location)?.kind,'location');
 }
 for(const p of data.places)assert.equal(all.get(p.id)?.kind,'location');
 assert.equal(new Set(data.places.map(p=>p.id)).size,6);
 for(const r of data.routes)for(const id of [r.from,r.to])assert(data.places.some(p=>p.id===id));
 for(const r of data.incompatibilities){assert(data.questions[0].options.some(o=>o.id===r.residence));assert(data.questions[2].options.some(o=>o.id===r.attachment));}
 assert.deepEqual(data.institutions.map(i=>i.id),['church','academy']);
 for(const i of data.institutions){assert.equal(all.get(i.definitionId)?.kind,'institution');assert.equal(all.get(i.seed)?.kind,'claim_seed');assert(data.places.some(p=>p.id===i.place));}
 assert.deepEqual(data.dynamicTemplates.map(t=>[t.id,t.kind,t.role,t.wage]),[['neighbour','person','ordinary_neighbour',0],['workbench','place','public_workbench',0],['short_job','affair','ordinary_short_job',8]]);
 return data;
}
