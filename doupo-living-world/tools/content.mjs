// Production authoring checks: references must close before packaging.
import {ATLAS_SECTORS} from '../source/pools/atlas.js';
export function validateContent({POOLS,PLACES,ROUTES,REGIONS,CAST,people,world,SOURCES}){
 const sources=new Set(SOURCES.map(s=>s.id)),places=new Map(PLACES.map(p=>[p.id,p])),regions=new Map(REGIONS.map(r=>[r.id,r]));
 const items=new Set(POOLS.find(p=>p.id==='items').entries.filter(e=>e.status==='ready').map(e=>e.id));
 const serviceKinds=new Set(['rest','trade','work','treat','refine','train','repair','investigate','gather']);
 for(const pool of POOLS.filter(p=>['world','people.authored'].some(id=>p.id===id||p.id.startsWith(id+'.'))))for(const entry of pool.entries)if(!sources.has(entry.source))throw Error('unknown source: '+pool.id+':'+entry.id);
 for(const p of PLACES){
  if(!regions.has(p.region)||!p.description||!p.notice||!p.services.every(s=>serviceKinds.has(s))||new Set(p.stock).size!==p.stock.length||p.stock.some(i=>!items.has(i)))throw Error('invalid place content: '+p.id);
  if(p.services.includes('trade')!==!!p.stock.length||p.services.includes('gather')!==!!p.ecology)throw Error('unsupported place service: '+p.id);
  const free=({x,y})=>x>=0&&y>=0&&x<p.width&&y<p.height&&!p.blocks.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);
  if(![p.spawn,p.exit,...p.objects].every(free))throw Error('blocked place anchor: '+p.id);
 }
 for(const r of REGIONS)for(const field of ['arrival','supply','herbal','habitat'])if(!places.has(r[field]))throw Error('unknown regional reference: '+r.id+':'+field);
 for(const r of REGIONS){if(!places.get(r.supply).stock.includes('food')||!places.get(r.herbal).stock.includes('herb')||!places.get(r.habitat).ecology)throw Error('regional livelihood incomplete: '+r.id);}
 const ids=new Set();for(const r of ROUTES){if(ids.has(r.id)||!places.has(r.from)||!places.has(r.to)||r.from===r.to||!Number.isSafeInteger(r.ticks)||r.ticks<=0||!Number.isInteger(r.risk)||r.risk<0)throw Error('invalid route: '+r.id);ids.add(r.id);if(!ROUTES.some(back=>back.from===r.to&&back.to===r.from))throw Error('one-way route: '+r.id);}
 const seen=new Set(['wutan.inn']),queue=[...seen];for(let i=0;i<queue.length;i++)for(const r of ROUTES.filter(r=>r.from===queue[i]))if(!seen.has(r.to)){seen.add(r.to);queue.push(r.to);}if(seen.size!==PLACES.length)throw Error('disconnected world');
 if(PLACES.length>64||CAST.length+4>world.cap||world.stocks.length>96||world.ecology.length>4||world.organizations.length>4)throw Error('authored world capacity');
 if(new Set(CAST.map(c=>c[0])).size!==CAST.length||new Set(CAST.map(c=>c[1])).size!==CAST.length)throw Error('duplicate authored person');
 const keys=new Set(people.map(p=>p.id));
 for(const {id,value:p} of people){if(!places.has(p.home)||!places.has(p.place)||p.social.some(e=>!keys.has(e.a)||!keys.has(e.b)||!places.has(e.place))||[p.parentA,p.parentB,p.ward].some(k=>k&&!keys.has(k)))throw Error('person reference: '+id);}
 for(const p of POOLS.find(p=>p.id==='people.templates').entries)if(p.conditions.region?.in.some(r=>!regions.has(r)))throw Error('template region: '+p.id);
 for(const p of PLACES){
  const local=people.filter(r=>r.value.home===p.id);
  if(p.services.includes('repair')&&!local.some(r=>r.value.role==='artisan')||p.services.includes('treat')&&!local.some(r=>r.value.skills.some(s=>s.id==='healing')))throw Error('missing service provider: '+p.id);
 }
 for(const o of world.organizations)if(!keys.has(o.leader)||o.members.some(k=>!keys.has(k))||!places.has(o.place))throw Error('organization reference: '+o.id);
 const atlas=POOLS.find(p=>p.id==='world.atlas'),sectorIds=new Set(ATLAS_SECTORS.map(s=>s.id)),mapped=new Set();
 for(const e of atlas.entries){const n=e.value;if(!sectorIds.has(n.parent)||n.unlocked!==(e.status==='ready')||n.unlocked!==!!n.region)throw Error('invalid atlas status: '+e.id);if(n.unlocked){if(!regions.has(n.region)||mapped.has(n.region))throw Error('atlas regional reference: '+e.id);mapped.add(n.region);}else if(places.has(n.id)||ROUTES.some(r=>r.from===n.id||r.to===n.id))throw Error('locked atlas participates in travel: '+e.id);}
 if(mapped.size!==REGIONS.length)throw Error('atlas omits playable region');
 return {regions:REGIONS.length,places:PLACES.length,routes:ROUTES.length,authoredPeople:CAST.length,stockRows:world.stocks.length};
}
