import {describe,test,expect} from '@jest/globals';
import {lifetimePolicyFixture} from './helpers/lifetime-policy.js';
import {initialLifetimes,prepareLifetimes,validateLifetimes,nextAttentionTick} from '../../src/native/lifetime-authority.js';
import {initialHistory,queryHistory} from '../../public/shared/native-history-runtime.js';
import {prepareHistory,validateHistory} from '../../src/native/history-authority.js';
import {anniversary,civil,instant,lifetimeView,people} from '../../public/shared/native-lifetime-runtime.js';
const copy=structuredClone;
function fixture(seed=17){
    const policy=lifetimePolicyFixture('hero',seed);
    const history={schemaVersion:1,clockId:'world',chronologyDomain:'chronology',meaningfulDomains:[],sources:[],hot:8,warm:24,cold:32,maxDurable:4096,maxBytes:2097152,checkpointTurns:64};
    return {manifest:{actors:[{actorId:'hero'}],runtime:{experienceContract:{lifecycleRuntime:{lifetimes:policy,history}}}},session:{sessionId:'world.one'},revision:{revisionId:'rev.one',branchId:'branch.one'},timeline:[],
        states:{atri_lifecycle:{clocks:{world:0},history:initialHistory(),lifetimes:initialLifetimes(policy),domains:{chronology:{records:[{id:'main',value:{sequence:0,calendar:{year:1},era_id:'opening'}}]}}}}};
}
function act(base,operation=null,input={},tick=base.states.atri_lifecycle.clocks.world){
    const s=copy(base);s.states.atri_lifecycle.clocks.world=tick;const c=s.states.atri_lifecycle.domains.chronology.records[0].value;c.sequence++;c.calendar.year=civil(tick).year;
    prepareLifetimes(base,s,operation?{operation,input}:null);prepareHistory(base,s,{id:'lifetime',verb:'lifetime'},{outcome:'automatic'});return s;
}
const life=s=>s.states.atri_lifecycle.lifetimes;
const child=s=>Object.values(life(s).pregnancies).find(p=>p.status==='born').childId;
const birth=s=>{s=act(s,'family.conceive',{parentId:'hero',otherParentId:'partner',name:'Child',consent:true});return act(s,null,{},s.states.atri_lifecycle.clocks.world+403200);};
describe('Native human lifetimes',()=>{
    test('attention uses exact public family milestones without mutation or private pregnancy disclosure',()=>{
        let s=act(fixture(),'longevity.bind',{routeId:'covenant'});
        s=act(s,'family.conceive',{parentId:'hero',otherParentId:'partner',name:'Child',consent:true});
        const pregnancy=Object.values(life(s).pregnancies)[0], before=copy(s),target=anniversary(0,200);
        expect(nextAttentionTick(s,target)).toBe(pregnancy.due);expect(s).toEqual(before);
        pregnancy.visibility='secret';expect(nextAttentionTick(s,target)).toBeGreaterThan(pregnancy.due);
        pregnancy.visibility='public';s=act(s,null,{},pregnancy.due);expect(Object.values(life(s).pregnancies)[0].status).toBe('born');
        expect(nextAttentionTick(s,s.states.atri_lifecycle.clocks.world+1)).toBe(s.states.atri_lifecycle.clocks.world+1);
    });
    test('Gregorian birthdays, including pre-epoch and leap birthdays',()=>{
        for(const tick of [-14400000,-1440,0,1440,anniversary(0,200)])expect(instant(civil(tick))).toBe(tick);
        const leap=instant({year:4,month:2,day:29});expect(civil(anniversary(leap,1))).toMatchObject({year:5,month:2,day:28});
    });
    test.each([17,71,731])('seed %i: generations, offices and compact precise history',seed=>{
        let s=act(fixture(seed),'longevity.bind',{routeId:'covenant'});s=birth(s);const first=child(s),born=people(life(s))[first].identity.birthTick;
        s=act(s,null,{},anniversary(born,20));expect(people(life(s))[first].matured).toBe(true);
        s=act(s,'family.conceive',{parentId:first,otherParentId:'',name:'Grandchild',consent:true});s=act(s,null,{},s.states.atri_lifecycle.clocks.world+403200);
        expect(Object.values(life(s).kinship)).toHaveLength(2);
        s=act(s,null,{},anniversary(0,90));expect(lifetimeView(s,'hero').chronologicalAge).toBe(118);expect(lifetimeView(s,'hero').apparentAge).toBeLessThan(45);
        expect(life(s).archive[first].status.kind).toBe('dead');expect(Object.values(life(s).milestones).some(e=>e.kind==='retired'&&e.people.includes(first))).toBe(true);expect(Object.values(life(s).terms).length).toBeGreaterThan(2);
        expect(life(s).work.events).toBeLessThan(40);expect(life(s).population.births).toBeGreaterThan(0);
        validateLifetimes(s,{complete:true});validateHistory(s);
        expect(queryHistory(s,{facet:'family',value:first}).items.length).toBeGreaterThan(0);
    });
    test('consent, chronology, duplicate relationships and invalid nominees fail closed',()=>{
        let s=birth(fixture());const id=child(s),before=copy(s);
        expect(()=>act(s,'bond.form',{firstId:'hero',secondId:id,kind:'marriage',visibility:'public',consent:true})).toThrow();
        expect(()=>act(s,'family.adopt',{parentId:id,otherParentId:'',childId:'hero',visibility:'public',consent:true})).toThrow();
        expect(()=>act(s,'office.nominate',{officeId:'registrar',actorId:id})).toThrow();expect(s).toEqual(before);
        s=act(s,'bond.form',{firstId:'hero',secondId:'partner',kind:'marriage',visibility:'public',consent:true});
        expect(()=>act(s,'bond.form',{firstId:'hero',secondId:'partner',kind:'marriage',visibility:'public',consent:true})).toThrow();
        const bond=Object.values(life(s).bonds)[0].id;s=act(s,'bond.change',{id:bond,state:'separated',consent:false});s=act(s,'bond.change',{id:bond,state:'active',consent:true});
        s=act(s,'person.exit',{id:'partner',reason:'dead',sourceId:'hero'});expect(life(s).bonds[bond].state).toBe('widowed');
        expect(()=>act(s,'person.return',{id:'partner',sourceId:'hero'})).toThrow();
    });
    test('ordinary death preserves identity, transfers artifact and returns with cost',()=>{
        let s=act(fixture(),'bond.form',{firstId:'hero',secondId:'partner',kind:'partnership',visibility:'public',consent:true});
        const fact=Object.values(s.states.atri_lifecycle.history.facts)[0];let c=copy(s);
        prepareHistory(s,c,{id:'artifact',verb:'artifact'},{outcome:'automatic'},{operation:'artifact.create',input:{kind:'heirloom',title:'Ring',content:'Family record',sourceId:fact.id,parentId:''}});s=c;
        const artifact=Object.values(s.states.atri_lifecycle.history.artifacts)[0].id;
        s=act(s,'legacy.pledge',{ownerId:'hero',heirId:'partner',kind:'artifact',sourceId:artifact});s=act(s,'protagonist.die',{sourceId:'partner'});
        expect(life(s).continuity.scars).toBe(1);expect(s.states.atri_lifecycle.history.artifacts[artifact].holderId).toBe('partner');
        s=act(s,null,{},life(s).continuity.returnAt);expect(life(s).continuity.returns).toBe(1);expect(lifetimeView(s,'hero').status).toBe('active');expect(life(s).continuity.claimBurden).toBeGreaterThan(0);validateHistory(s);
    });
    test('causal admission, rare consensual longevity and bounded event work',()=>{
        let s=act(fixture(),'longevity.bind',{routeId:'covenant'});
        expect(()=>act(s,'person.enter',{name:'Injected',birthTick:-5256000,cause:'migration',sourceId:'constructor',institutionId:''})).toThrow();
        s=act(s,'longevity.offer',{id:'partner',routeId:'covenant',consent:false});expect(people(life(s)).partner.route.id).toBe('');
        s=act(s,'longevity.offer',{id:'partner',routeId:'covenant',consent:true});expect(life(s).continuity.grants).toBe(1);expect(life(s).continuity.claimBurden).toBe(6);
        const bad=copy(s);life(bad).nextId=1;expect(()=>validateLifetimes(bad)).toThrow('cursor');
        const capped=copy(s);capped.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes.maxEvents=1;expect(()=>act(capped,null,{},anniversary(0,90))).toThrow('budget');
        expect(life(s).people.partner.route.id).toBe('covenant');
    });
    test('JSON key normalization, split interval equivalence, no-op accounting and forged imports',()=>{
        let s=act(fixture(),'longevity.bind',{routeId:'covenant'});
        const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,reorder(v[k])])):v;
        const a=act(s,null,{},anniversary(0,60)),b=act(act(s,null,{},anniversary(0,30)),null,{},anniversary(0,60));
        const stable=x=>{const v=copy(life(x));delete v.work;return v;};expect(stable(a)).toEqual(stable(b));
        expect(act(reorder(s),null,{},anniversary(0,60))).toEqual(a);
        const no=act(a);expect(no.states.atri_lifecycle.history.turns).toBe(a.states.atri_lifecycle.history.turns);
        const bad=copy(a);life(bad).archive.leader.identity.birthTick=1;expect(()=>validateLifetimes(bad,{complete:true})).toThrow();
        const corrupt=copy(a);life(corrupt).continuity.claimBurden++;expect(()=>validateHistory(corrupt)).toThrow();
    });
});
