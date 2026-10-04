import { describe, test, expect } from '@jest/globals';
import { fixture as enterpriseFixture, act, life, caseFile } from './helpers/enterprise-fixture.js';
import { regionalPolicy } from './helpers/regional-policy.js';
import { queryHistory } from '../../public/shared/native-history-runtime.js';
import { initialLifetimes, validateLifetimes } from '../../src/native/lifetime-authority.js';
import { regionalCommand, assertRegionalPolicy } from '../../public/shared/native-regional-contract.js';
import { regionalView } from '../../public/shared/native-regional-runtime.js';
import { anniversary, people } from '../../public/shared/native-lifetime-runtime.js';
const year = n => anniversary(0, n);
function fixture(seed = 17) {
    const s = enterpriseFixture(seed), policy = s.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes;
    policy.regional = structuredClone(regionalPolicy); s.states.atri_lifecycle.lifetimes = initialLifetimes(policy);
    return act(s, 'longevity.bind', { routeId: 'covenant' });
}
function region(s, verb, input) { const c = regionalCommand(verb, input); return act(s, c.operation, c.input); }
function travel(s, regionId) { s = region(s, 'travel', { regionId, mode: 'coach' }); return act(s, null, {}, life(s).regional.journey.arrives); }
const normalize = v => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, normalize(v[k])])) : v;
describe('Native regional history in the shared Lifetime candidate', () => {
    test('cold history materializes after decades; original hub changes and never resets', () => {
        let s = fixture(), old = structuredClone(life(s).regional.regions.eastbank);
        s = travel(s, 'northreach'); s = act(s, null, {}, year(40));
        const w = life(s).regional;
        expect(w.regions.eastbank.population.present).not.toBe(old.population.present);
        expect(w.regions.salt_coast.materializedAt).toBeNull();
        expect(Object.values(w.events).filter(e => e.kind === 'era').length).toBeGreaterThanOrEqual(2);
        const truth = structuredClone(w.regions.salt_coast.population);
        s = travel(s, 'salt_coast'); expect(life(s).regional.regions.salt_coast.population).toEqual(truth);
        const local = Object.values(people(life(s))).find(p => p.regionId === 'salt_coast' && p.id !== 'hero');
        expect(local.identity.birthTick).toBeLessThan(local.identity.introducedTick);
        expect(local.identity.introducedTick).toBeGreaterThan(year(40));
        s = travel(s, 'eastbank'); expect(life(s).regional.regions.eastbank.materializedAt).toBe(0);
        expect(people(life(s)).leader.status.kind).not.toBe('active');
        validateLifetimes(s, { complete: true });
    });
    test.each([17, 71, 731])('split/whole sparse resolution and JSON order seed %i', seed => {
        const base = fixture(seed), whole = act(base, null, {}, year(50));
        let split = base; for (const n of [3, 11, 23, 37, 50]) split = act(split, null, {}, year(n));
        const a = structuredClone(life(whole)), b = structuredClone(life(split)); delete a.work; delete b.work;
        expect(b).toEqual(a);
        const reordered = act(normalize(base), null, {}, year(50)); expect(life(reordered)).toEqual(life(whole));
        expect(life(whole).work.events).toBeLessThan(100);
        const rs = Object.values(life(whole).regional.regions); expect(rs.reduce((n, r) => n + r.population.inflow - r.population.outflow, 0)).toBe(0);
    });
    test('intermediate Native simulation clock may reach arrival before Lifetime resolution', () => {
        const s = region(fixture(), 'travel', { regionId: 'northreach', mode: 'coach' });
        s.states.atri_lifecycle.clocks.world = life(s).regional.journey.arrives;
        expect(() => validateLifetimes(s)).not.toThrow();
        expect(() => validateLifetimes(s, { complete: true })).toThrow('resolved clock');
    });
    test('travel consumes clock time, money, blocks remote personal action and uses new transport', () => {
        let s = fixture(), reserves = life(s).enterprise.reserves;
        expect(() => region(s, 'travel', { regionId: 'northreach', mode: 'motor' })).toThrow('transport');
        s = region(s, 'travel', { regionId: 'northreach', mode: 'coach' }); const duration = life(s).regional.journey.arrives;
        expect(duration).toBe(12 * 1440); expect(life(s).enterprise.reserves).toBeLessThan(reserves);
        expect(() => act(s, 'matter.open', { grammarId: '', hookId: '' })).toThrow('transit');
        s = act(s, null, {}, duration - 1); expect(life(s).regional.currentRegionId).toBe('eastbank');
        s = act(s, null, {}, duration); expect(life(s).regional.currentRegionId).toBe('northreach');
        s = act(s, null, {}, year(40)); s = region(s, 'travel', { regionId: 'eastbank', mode: 'motor' });
        expect(life(s).regional.journey.arrives - life(s).regional.journey.departed).toBeLessThan(duration);
    });
    test('era is conditional, not a date label; investments require local evidence and real authority', () => {
        let s = fixture(); const p = s.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes;
        for (const r of Object.values(life(s).regional.regions)) { r.capital = 0; r.economy = 'banking_crisis'; }
        const sourceBefore = JSON.stringify(s);
        expect(() => region(s, 'invest', { regionId: 'eastbank', project: 'transport', sourceId: 'fake' })).toThrow(); expect(JSON.stringify(s)).toBe(sourceBefore);
        const { s: c, sourceId } = caseFile(s); s = act(c, 'career.take', { roleId: 'merchant', institutionId: '', sourceId });
        const balance = life(s).enterprise.reserves; s = region(s, 'invest', { regionId: 'eastbank', project: 'transport', sourceId });
        expect(life(s).enterprise.reserves).toBe(balance - 100); expect(life(s).regional.regions.eastbank.eraId).toBe(p.regional.eras[0].id);
        expect(() => region(s, 'invest', { regionId: 'northreach', project: 'transport', sourceId })).toThrow('local resolved evidence');
    });
    test('fidelity has earned multi-hub relevance and does not erase assets, history or identity', () => {
        let { s, sourceId } = caseFile(fixture()); s = act(s, 'career.take', { roleId: 'merchant', institutionId: '', sourceId });
        s = act(s, 'asset.acquire', { placeId: 'river_foundry', sourceId }); s = travel(s, 'northreach');
        const before = structuredClone(life(s).enterprise);
        expect(() => region(s, 'fidelity', { regionId: 'eastbank', tier: 'cold' })).toThrow('connections');
        s = region(s, 'fidelity', { regionId: 'eastbank', tier: 'active' });
        expect(Object.values(life(s).regional.regions).filter(r => r.tier === 'active')).toHaveLength(2);
        expect(life(s).enterprise).toEqual(before);
        expect(() => region(s, 'fidelity', { regionId: 'salt_coast', tier: 'active' })).toThrow('interests');
    });
    test('unrelated bonds and transferred property cannot authorize a remote hub', () => {
        let { s, sourceId } = caseFile(fixture()); s = act(s, 'career.take', { roleId: 'merchant', institutionId: '', sourceId });
        s = act(s, 'asset.acquire', { placeId: 'river_foundry', sourceId });
        const id = Object.keys(life(s).enterprise.assets)[0]; s = act(s, 'asset.manage', { id, action: 'transfer', amount: 0, otherId: 'partner', sourceId });
        s = act(s, 'bond.form', { firstId: 'leader', secondId: 'partner', kind: 'partnership', visibility: 'public', consent: true });
        s = travel(s, 'northreach');
        expect(() => region(s, 'fidelity', { regionId: 'eastbank', tier: 'active' })).toThrow('interests');
    });
    test('macro domains affect geography and bounded view does not leak or mutate hidden state', () => {
        const s = act(fixture(), null, {}, year(50)), w = life(s).regional, events = Object.values(w.events).filter(e => e.kind === 'macro');
        for (const domain of ['economy', 'law', 'war', 'migration', 'health', 'movement', 'occult', 'technology']) expect(events.some(e => e.detail[domain])).toBe(true);
        expect(Object.values(life(s).renewal.places).some(p => p.cause?.startsWith('regional.'))).toBe(true);
        const view = regionalView(s); expect(JSON.stringify(view)).not.toMatch(/loyalty|ambition|concealed|hidden/); view.regions[0].technology.research = 99;
        expect(life(s).regional.regions[view.regions[0].id].technology.research).toBeLessThan(9);
        expect(Buffer.byteLength(JSON.stringify(regionalView(s)))).toBeLessThan(6000);
    });
    test('remote birth uses the parent residence; demotion compacts only empty hot details', () => {
        let s = fixture(); s = act(s, 'family.conceive', { parentId: 'partner', otherParentId: '', name: 'Resident child', consent: true });
        const identity = structuredClone(people(life(s)).partner.identity);
        s = travel(s, 'northreach'); expect(people(life(s)).partner.detail).toBeNull();
        s = act(s, null, {}, year(1)); const childId = Object.values(life(s).kinship)[0].childId;
        expect(people(life(s))[childId].regionId).toBe('eastbank'); expect(people(life(s)).partner.identity).toEqual(identity);
        s = travel(s, 'eastbank'); expect(people(life(s)).partner.detail.residence).toBe('eastbank');
    });
    test('Era-sensitive grammar is unavailable early and uses later systemic rules', () => {
        let s = fixture(); const p = s.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes;
        p.regional.grammarEras = [{ grammarId: 'document_fraud', minimum: 2, maximum: 2 }];
        expect(() => act(s, 'matter.open', { grammarId: 'document_fraud', hookId: '' })).toThrow('grammar unavailable');
        s = act(s, null, {}, year(40)); s = act(s, 'matter.open', { grammarId: 'document_fraud', hookId: '' });
        const m = Object.values(life(s).renewal.active)[0]; expect(m.eraId).toBe('era.regulated'); expect(m.regionId).toBe('eastbank');
        const hidden = Object.values(s.states.atri_lifecycle.history.facts).find(f => f.value?.kind === 'occult');
        expect(hidden.public).toBe(false); expect(queryHistory(s, { id: hidden.id }).items).toHaveLength(0);
    });
    test('schema, chronology, population tampering and unchanged budget fail closed', () => {
        const s = fixture(), p = s.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes;
        expect(() => assertRegionalPolicy(p.regional, p)).not.toThrow();
        const bad = structuredClone(s); life(bad).regional.regions.eastbank.population.present++; expect(() => validateLifetimes(bad)).toThrow('population conservation');
        p.regional.maxRecords = 1; const before = structuredClone(s); expect(() => act(s, null, {}, year(50))).toThrow('record budget'); expect(s).toEqual(before);
    });
});
