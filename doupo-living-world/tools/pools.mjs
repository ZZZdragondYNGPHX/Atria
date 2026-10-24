// Author-time validation. Runtime consumers use the same registered entries.
export function validatePools(pools){
 const ids=new Set(),identifier=/^[a-z][a-z0-9._-]*$/;
 for(const p of pools){
  if(!identifier.test(p.id)||ids.has(p.id)||!Number.isSafeInteger(p.version)||p.version<1||!p.kind||!p.source||!Array.isArray(p.entries)||!p.entries.length)throw Error('invalid pool '+p.id);
  ids.add(p.id);const entries=new Set();
  for(const e of p.entries){
   if(!(identifier.test(e.id)||(p.id==='quests.templates'&&/^QC[0-9]{2}$/.test(e.id)))||entries.has(e.id)||!Number.isFinite(e.weight)||e.weight<0||!['ready','reserve'].includes(e.status)||!e.value||typeof e.value!=='object'||!e.conditions||Array.isArray(e.conditions))throw Error('invalid pool entry '+p.id+':'+e.id);
   entries.add(e.id);
   for(const [field,rule] of Object.entries(e.conditions)){
    if(!identifier.test(field)||!rule||typeof rule!=='object'||Object.keys(rule).some(k=>!['in','min','max'].includes(k))||!Object.keys(rule).length||rule.in!==undefined&&(!Array.isArray(rule.in)||!rule.in.length)||rule.min!==undefined&&!Number.isFinite(rule.min)||rule.max!==undefined&&!Number.isFinite(rule.max)||rule.min!==undefined&&rule.max!==undefined&&rule.min>rule.max)throw Error('invalid pool condition '+p.id+':'+e.id+':'+field);
   }
  }
 }
 const get=id=>pools.find(p=>p.id===id),arts=get('arts').entries;
 for(const e of get('people.templates').entries)if(e.value.art&&!arts.some(a=>a.id===e.value.art&&a.status==='ready'))throw Error('unavailable initial art '+e.id);
 for(const e of arts.filter(e=>e.status==='ready'&&e.value.item))if(!get('items').entries.some(i=>i.id===e.value.item&&i.value.art===e.id&&i.status==='ready'))throw Error('missing art item '+e.id);
 const refs=new Set();for(const e of get('appearances').entries.filter(e=>e.status==='ready'))for(const kind of ['portrait','chibi']){
  const ref=e.value[kind+'Asset'];if(!/^asset_[a-f0-9]{32}$/.test(ref)||refs.has(ref)||!e.value[kind])throw Error('invalid paired appearance '+e.id);refs.add(ref);
 }
 const questPool=get('quests.templates');
 if(questPool){
  const actors=new Set(get('people.authored').entries.map(e=>e.id)),places=new Set(get('world.places').entries.map(e=>e.id)),items=new Set(get('items').entries.map(e=>e.id));
  for(const e of questPool.entries){const q=e.value;
   if(q.id!==e.id||!q.operation||!['exclusive','personal','opportunity','public'].includes(q.mode)||!['notice','conversation','observation'].includes(q.discovery)||!['escrow','credit','none'].includes(q.payment)||!Array.isArray(q.choices)||q.choices.length<2)throw Error('invalid quest definition '+e.id);
   for(const key of ['issuer','target'])if(q[key]&&!actors.has(q[key]))throw Error('unknown quest actor '+e.id+':'+key);
   for(const key of ['place','destination'])if(!places.has(q[key]))throw Error('unknown quest place '+e.id+':'+key);
   if(q.item&&!items.has(q.item))throw Error('unknown quest item '+e.id);
   if(new Set(q.choices.map(x=>x.id)).size!==q.choices.length||q.choices.some(x=>!x.operation||!x.label||!x.detail))throw Error('invalid quest choices '+e.id);
  }
 }
}
