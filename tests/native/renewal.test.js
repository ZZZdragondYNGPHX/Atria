import {semanticDistance} from '../../public/shared/native-renewal-contract.js';
import {renewalPolicy} from './helpers/renewal-policy.js';
import {describe,test,expect} from '@jest/globals';
import {lifetimePolicyFixture} from './helpers/lifetime-policy.js';
import {initialLifetimes,prepareLifetimes,validateLifetimes} from '../../src/native/lifetime-authority.js';
import {initialHistory,queryHistory} from '../../public/shared/native-history-runtime.js';
import {prepareHistory,validateHistory} from '../../src/native/history-authority.js';
import {anniversary,civil,instant,lifetimeView,people} from '../../public/shared/native-lifetime-runtime.js';
const copy=structuredClone;
function fixture(seed=17){
    const policy=lifetimePolicyFixture('hero',seed);
    policy.renewal = structuredClone(renewalPolicy);
    const history={schemaVersion:1,clockId:'world',chronologyDomain:'chronology',meaningfulDomains:[],sources:[],hot:8,warm:24,cold:32,maxDurable:4096,maxBytes:2097152,checkpointTurns:64};
    return {manifest:{actors:[{actorId:'hero'}],runtime:{experienceContract:{lifecycleRuntime:{lifetimes:policy,history}}}},session:{sessionId:'world.one'},revision:{revisionId:'rev.one',branchId:'branch.one'},timeline:[],
        states:{atri_lifecycle:{clocks:{world:0},history:initialHistory(),lifetimes:initialLifetimes(policy),domains:{chronology:{records:[{id:'main',value:{sequence:0,calendar:{year:1},era_id:'opening'}}]}}}}};
}
function act(base,operation=null,input={},tick=base.states.atri_lifecycle.clocks.world){
    const s=copy(base);s.states.atri_lifecycle.clocks.world=tick;const c=s.states.atri_lifecycle.domains.chronology.records[0].value;c.sequence++;c.calendar.year=civil(tick).year;
    prepareLifetimes(base,s,operation?{operation,input}:null);prepareHistory(base,s,{id:'lifetime',verb:'lifetime'},{outcome:'automatic'});return s;
}
const life=s=>s.states.atri_lifecycle.lifetimes;
const renewal = s => life(s).renewal;
const open = s => act(s, 'matter.open', {grammarId:'', hookId:''});
function finish(s, canonical = false) {
    const m = Object.values(renewal(s).active)[0];
    for (const action of m.path) s = act(s, 'matter.act', {id:m.id, action, presentation:''});
    return act(s, 'matter.act', {id:m.id, action:canonical?'record':'settle', presentation:''});
}
describe('Native renewable content', () => {
    test.each([17,71,731])('seed %i: real content, semantic distance and canonical promotion', seed => {
        let s = act(fixture(seed), 'longevity.bind', {routeId:'covenant'});
        for(let i=0;i<80;i++) { s=act(s,null,{},i*30*1440);s=open(s);s=finish(s,i%20===0); }
        expect(renewal(s).completed).toBe(80);expect(Object.keys(renewal(s).canonical)).toHaveLength(4);
        expect(renewal(s).recent).toHaveLength(64);
        const recent=renewal(s).recent;for(let i=0;i<recent.length;i++)for(let j=0;j<i;j++){ const distance=semanticDistance(recent[i].structure,recent[j].structure);expect(distance).toBeGreaterThan(0);if(recent[i].tick-recent[j].tick<90*1440)expect(distance).toBeGreaterThanOrEqual(3); }
        expect(Object.values(s.states.atri_lifecycle.history.facts).some(f=>f.key.startsWith('renewal.renewal.'))).toBe(true);
        validateLifetimes(s,{complete:true});validateHistory(s);
    });
    test('renaming and template IDs are not novelty', () => {
        expect(semanticDistance({subject:'heir',name:'A',grammarId:'one'},{subject:'heir',name:'B',grammarId:'two'})).toBe(0);
    });
    test('invalid action and budget failure preserve the original candidate', () => {
        const s=open(fixture()), before=copy(s), id=Object.keys(renewal(s).active)[0];
        expect(()=>act(s,'matter.act',{id,action:'invent evidence',presentation:''})).toThrow();expect(s).toEqual(before);
        const capped=copy(s);capped.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes.maxBytes=10;
        expect(()=>finish(capped)).toThrow('budget');expect(s).toEqual(before);
    });
    test('geography and institution lineage preserve causal sources and close old offices', () => {
        let s=finish(open(fixture()),true), sourceId=Object.keys(renewal(s).canonical)[0];
        const change=(id,operation,otherId='',name='')=>{s=act(s,'world.change',{id,operation,otherId,name,sourceId});};
        change('old_quay','burn');change('old_quay','rebuild');change('old_quay','protect');
        change('','found','','New archive');const institutionId=renewal(s).last.id;
        change(institutionId,'split','','Successor');expect(life(s).institutions[institutionId].status).toBe('dissolved');
        expect(life(s).institutions[institutionId].successors).toHaveLength(2);
        const original=Object.keys(life(s).institutions).find(id=>id!==institutionId&&!id.startsWith('renewal.'));
        change(original,'dissolve');s=act(s,null,{},anniversary(0,20));
        expect(Object.values(life(s).offices).filter(o=>o.institutionId===original).every(o=>!o.holderId)).toBe(true);
        validateHistory(s);
    });
});

function hist(s,operation,input) { const n=copy(s);prepareHistory(s,n,{id:'history',verb:'history'},{outcome:'automatic'},{operation,input});return n; }
test('real dormant hook, artifact and marked history survive reuse and normalization', () => {
    let s=act(fixture(),null,{},1),h=()=>s.states.atri_lifecycle.history;
    const fact=Object.values(h().facts)[0];
    s=hist(s,'artifact.create',{kind:'letter',title:'Old testimony',content:'Attributed evidence',sourceId:fact.id,parentId:''});
    const artifact=Object.keys(h().artifacts)[0];s=hist(s,'memory.mark',{id:artifact,marked:true,journaled:true});
    s=hist(s,'hook.create',{title:'Unresolved testimony',sourceId:artifact});const hook=Object.keys(h().hooks)[0];
    expect(()=>act(s,'matter.open',{grammarId:'cold_case',hookId:hook})).toThrow('eligible');
    s=act(s,null,{},100*1440);s=act(s,'matter.open',{grammarId:'cold_case',hookId:hook});s=finish(s);
    const matter=Object.values(renewal(s).canonical)[0];expect(matter.sourceId).toBe(artifact);expect(matter.artifactId).toBe(artifact);
    expect(h().hooks[hook].status).toBe('resolved');expect(h().hooks[hook].transitions.map(t=>t.status)).toEqual(['active','resolved']);
    expect(h().memory[artifact].marked).toBe(true);
    expect(()=>act(s,'matter.open',{grammarId:'cold_case',hookId:hook})).toThrow('eligible');
    const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,normalize(v[k])])):v;
    const a=open(s),b=open(normalize(s));expect(renewal(a)).toEqual(renewal(b));validateHistory(b);
    const forged=copy(s);renewal(forged).nextId=1;expect(()=>validateLifetimes(forged)).toThrow('cursor');
});

test('absence escalates once at the real deadline without simulating every day',()=>{
    let s=open(fixture());const m=Object.values(renewal(s).active)[0], deadline=m.deadline;
    s=act(s,null,{},deadline+100*1440);expect(renewal(s).active[m.id].escalated).toBe(true);
    expect(renewal(s).canonical[m.id].tick).toBe(deadline);const pressure=renewal(s).places[m.placeId].pressure;
    s=act(s,null,{},deadline+200*1440);expect(renewal(s).places[m.placeId].pressure).toBe(pressure);
    s=finish(s);expect(renewal(s).canonical[m.id].closed).toBe(deadline+200*1440);
});

test('family grammar requires a real public family and exposes no hidden truth',async()=>{
    let s=fixture();expect(()=>act(s,'matter.open',{grammarId:'family_obligation',hookId:''})).toThrow();
    s=act(s,'family.conceive',{parentId:'hero',otherParentId:'partner',name:'Child',consent:true});s=act(s,null,{},403200);
    s=act(s,'matter.open',{grammarId:'family_obligation',hookId:''});const m=Object.values(renewal(s).active)[0];expect(life(s).kinship[m.familyId]).toBeDefined();
    const {renewalView}=await import('../../public/shared/native-renewal-runtime.js');const view=renewalView(s);expect(JSON.stringify(view)).not.toContain(m.structure.truth);
    view[0].evidence.push({fake:true});expect(m.evidence).toHaveLength(0);
    expect(()=>act(s,'matter.act',{id:m.id,action:m.path[0],presentation:'x'.repeat(321)})).toThrow();
    expect(()=>act(s,'matter.act',{id:m.id,action:m.path[0],presentation:'',truth:'rewrite canon'})).toThrow();
});
test('merger, business and district creation retain causes and reject resurrection',()=>{
    let s=finish(open(fixture()),true),sourceId=Object.keys(renewal(s).canonical)[0];
    const change=(id,operation,otherId='',name='')=>{s=act(s,'world.change',{id,operation,otherId,name,sourceId});return renewal(s).last.id;};
    const first=change('','found','','First circle'),second=change('','found','','Second circle');
    change(first,'merge',second,'United circle');expect(life(s).institutions[first].successors).toEqual(life(s).institutions[second].successors);
    const successor=life(s).institutions[first].successors[0];expect(life(s).institutions[successor].predecessors).toEqual([first,second]);
    expect(Object.values(life(s).offices).some(o=>o.institutionId===successor&&o.holderId)).toBe(true);
    expect(()=>change(first,'split','','Invalid restoration')).toThrow();
    const district=change('','zone_district','','New ward'),business=change('','open_business',district,'Ward workshop');
    expect(renewal(s).places[business].origin).toBe(sourceId);change(business,'repurpose','','Public clinic');change(business,'protect');
    expect(()=>change(business,'demolish')).toThrow('protected');validateHistory(s);
});
