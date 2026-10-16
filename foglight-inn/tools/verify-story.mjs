import assert from 'node:assert/strict';
import {initial,execute,projection} from '../runtime/game.js';
import {whereabouts} from '../runtime/public.js';
let g=initial(),serial=0;const act=(kind,target='',detail='')=>g=execute(g,{kind,target,detail,text:'小满',token:'story-'+ ++serial});
const go=place=>{if(g.location!==place)act('move',place);};
const until=n=>{while(g.spent_ap<n){if(g.ration_pending)act('ration','emergency');act('wait');}if(g.ration_pending)act('ration','emergency');};
act('start');until(8);
for(const n of ['zhou','lin','xu','shen']){go(whereabouts(g,n));act('talk',n,'private');act('promise',n,'accept');go({zhou:'radio',lin:'store',xu:'inn',shen:'pier'}[n]);act('deliver',n);if(g.ration_pending)act('ration','emergency');assert.equal(g.promises[n],'done');}
assert(!g.npc_known.xu.includes('shen_letter'));assert(!g.npc_known.lin.includes('old_callsign_zhou'));assert(g.npc_known.shen.includes('shen_letter'));
const knowledge=g.knowledge.find(k=>k.id==='shen_letter');go(whereabouts(g,'lin'));act('share','lin',knowledge.id);assert(g.npc_known.lin.includes(knowledge.id));assert(g.memories.some(m=>m.npc==='lin'&&m.source.includes('转述')));
until(24);act('final','stay');assert.equal(projection(g).epilogues.length,4);assert(projection(g).epilogues.every(p=>!p.text.includes('留下简短清单')));
act('echo','listen');const after=structuredClone(g);assert.throws(()=>act('echo','off'));assert.deepEqual(g,after);
console.log('PASS actual rule function: four timely promises, sourced sharing, private knowledge isolation, epilogues and one optional echo');
g=initial();act('start');until(20);go(whereabouts(g,'zhou'));act('talk','zhou','private');act('promise','zhou','accept');act('wait');assert.equal(g.promises.zhou,'overdue');if(g.ration_pending)act('ration','emergency');go('radio');act('deliver','zhou');assert.equal(g.promises.zhou,'late');
console.log('PASS actual rule function: deadline expiry, independent ration and honest late delivery');
