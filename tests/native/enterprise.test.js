import { describe, test, expect } from '@jest/globals';
import { fixture, act, life, enterprise as e, caseFile, business, delegate } from './helpers/enterprise-fixture.js';
import { anniversary, people } from '../../public/shared/native-lifetime-runtime.js';
import { validateLifetimes } from '../../src/native/lifetime-authority.js';
import { validateHistory } from '../../src/native/history-authority.js';
import { enterpriseView } from '../../public/shared/native-enterprise-runtime.js';
const clone = structuredClone;
const year = n => anniversary(0, n);
const normalize = v => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, normalize(v[k])])) : v;
describe('Native progression, property and delegation', () => {
    test('an active retained credential can establish its ordinary name but cannot authorize replacement', () => {
        const s = fixture(), id = life(s).continuity.publicIdentityId;
        const input = { mode: 'retain', name: 'Ordinary name', method: 'legitimate', sourceId: id };
        const named = act(s, 'identity.change', input);
        expect(e(named).identities[id].name).toBe(input.name); expect(life(named).continuity.protagonistId).toBe(life(s).continuity.protagonistId);
        expect(() => act(s, 'identity.change', { ...input, mode: 'replace' })).toThrow('identity evidence');
        expect(() => act(s, 'identity.change', { ...input, method: 'forged' })).toThrow('identity evidence');
    });
    test('delegation policy updates preserve responsibility and reject occult escalation removal atomically', () => {
        let { s, assetId } = business(); s = delegate(s, assetId);
        const contract = Object.values(e(s).contracts)[0], prior = clone(contract);
        const policy = { id: contract.id, objective: 'Maintain the original responsibility with lower spending.', maxSpend: 75, risk: 1, prohibited: { debt: true, occult: true, church: false, force: true }, lossThreshold: 50, reportYears: 3, escalateOccult: true };
        s = act(s, 'delegate.policy', policy);
        const current = e(s).contracts[contract.id];
        expect(current).toMatchObject({ ...policy, targetId: prior.targetId, agentId: prior.agentId, since: prior.since, status: prior.status });
        expect(enterpriseView(s).contracts[0].prohibited).toEqual(policy.prohibited);
        const before = clone(s); expect(() => act(s, 'delegate.policy', { ...policy, escalateOccult: false })).toThrow('delegation policy'); expect(s).toEqual(before);
        s = act(s, 'delegate.review', { id: contract.id, action: 'revoke' });
        expect(() => act(s, 'delegate.policy', policy)).toThrow('policy authority');
    });
    test('identity projection is required after ready, not during pre-ready session publication', () => {
        const s = fixture(), lifecycle = s.manifest.runtime.experienceContract.lifecycleRuntime;
        lifecycle.lifetimes.enterprise.identityDomainId = 'continuity';
        lifecycle.domains = [{ id: 'continuity', recordSchema: { properties: { public_identity_id: { type: 'string' } } } }];
        s.states.atri_lifecycle.domains.continuity = { records: [] };
        expect(() => validateLifetimes(s, { complete: true })).not.toThrow();
        s.states.atri_lifecycle.ready = true;
        expect(() => validateLifetimes(s, { complete: true })).toThrow('identity projection');
        s.states.atri_lifecycle.domains.continuity.records.push({ id: 'main', value: { public_identity_id: life(s).continuity.publicIdentityId } });
        expect(() => validateLifetimes(s, { complete: true })).not.toThrow();
    });
    test('suspended credentials also remove the actor career and delegated permission', () => {
        let { s, sourceId, assetId } = business(); s = delegate(s, assetId);
        s = act(s, 'identity.change', { mode: 'hide', name: '', method: 'legitimate', sourceId });
        expect(people(life(s)).hero.career.occupation).toBe('private citizen');
        expect(Object.values(e(s).contracts)[0].status).toBe('escalated');
    });
    test('closed investigation venues permit attributed archive recording, never live settlement', () => {
        let { s, sourceId } = caseFile(fixture());
        s = act(s, null, {}, 90 * 1440);
        s = act(s, 'matter.open', { grammarId: 'document_fraud', hookId: '' });
        const m = Object.values(life(s).renewal.active)[0];
        s = act(s, 'world.change', { id: m.placeId, operation: 'burn', otherId: '', sourceId, name: '' });
        for (const action of m.path) s = act(s, 'matter.act', { id: m.id, action, presentation: '' });
        expect(life(s).renewal.active[m.id].evidence.every(x => x.mode === 'archival-review')).toBe(true);
        expect(() => act(s, 'matter.act', { id: m.id, action: 'settle', presentation: '' })).toThrow('archival');
        s = act(s, 'matter.act', { id: m.id, action: 'record', presentation: '' });
        expect(life(s).renewal.canonical[m.id].closed).toBe(90 * 1440);
        expect(life(s).renewal.places[m.placeId].status).toBe('burned');
    });
    test.each([17, 71, 731])('seed %i: 20 years without routine interruption; split intervals preserve world truth', seed => {
        let { s, assetId } = business(seed); s = delegate(s, assetId); const base = s;
        const whole = act(s, null, {}, year(20));
        for (let n = 1; n <= 20; n++) s = act(s, null, {}, year(n));
        expect(e(s)).toEqual(e(whole)); expect(Object.values(e(s).contracts)[0].reviews).toBe(4);
        expect(Object.values(e(s).contracts)[0].status).toBe('active'); expect(Object.values(e(s).movements).filter(m => m.kind === 'earned_trade').length).toBe(4);
        expect(life(whole).work.events).toBeLessThan(20); expect(e(act(normalize(base), null, {}, year(20)))).toEqual(e(whole));
        validateHistory(whole); validateLifetimes(whole, { complete: true });
    });
    test('identity rotation strands real titles, bank and licenses; continuity is paid and old obligations persist', () => {
        let { s, sourceId, assetId } = business(); s = delegate(s, assetId);
        const prior = life(s).continuity.publicIdentityId;
        s = act(s, 'identity.change', { mode: 'replace', name: 'Later public name', method: 'forged', sourceId });
        expect(e(s).identities[prior].status).toBe('retired'); expect(e(s).assets[assetId].status).toBe('stranded');
        expect(Object.values(e(s).roles)[0].status).toBe('suspended'); expect(Object.values(e(s).contracts)[0].status).toBe('escalated');
        const frozen = clone(s); expect(() => act(s, 'asset.manage', { id: assetId, action: 'withdraw', amount: 10, otherId: '', sourceId })).toThrow('legal access'); expect(s).toEqual(frozen);
        s = act(s, 'asset.manage', { id: 'treasury', action: 'regularize', amount: 0, otherId: '', sourceId });
        s = act(s, 'asset.manage', { id: assetId, action: 'regularize', amount: 0, otherId: '', sourceId });
        expect(e(s).assets[assetId].identityId).toBe(life(s).continuity.publicIdentityId);
        expect(e(s).identities[prior].liabilities).toBe(1); expect(enterpriseView(s).roles).toHaveLength(0);
    });
    test('inheritance and reconstruction never return transferred property or embodied progress', () => {
        let { s, sourceId, assetId } = business(); s = act(s, 'progress.learn', { domain: 'occult', sourceId });
        s = act(s, 'asset.manage', { id: assetId, action: 'bequeath', otherId: 'partner', amount: 0, sourceId });
        s = act(s, 'protagonist.die', { sourceId: 'partner' }); expect(e(s).assets[assetId].ownerId).toBe('partner');
        expect(e(s).progress.embodied).toBe(0); expect(e(s).progress.occult).toBe(1);
        s = act(s, null, {}, life(s).continuity.returnAt); expect(e(s).assets[assetId].ownerId).toBe('partner');
        expect(() => act(s, 'asset.manage', { id: assetId, action: 'withdraw', amount: 1, otherId: '', sourceId })).toThrow('owner');
    });
    test('skills mature without numeric runaway; new evidence retains horizontal knowledge', () => {
        let s = fixture();
        for (let i = 0; i < 5; i++) { s = act(s, null, {}, i * 90 * 1440); let sourceId; ({ s, sourceId } = caseFile(s)); s = act(s, 'progress.learn', { domain: 'investigation', sourceId }); expect(() => act(s, 'progress.learn', { domain: 'investigation', sourceId })).toThrow('already learned'); }
        expect(e(s).progress.investigation).toBe(3); expect(e(s).progress.knowledge).toHaveLength(5);
        const forged = clone(s); e(forged).progress.investigation = 100; expect(() => validateLifetimes(forged)).toThrow('cap');
    });
    test('authority excess pauses before spending; insolvency actually closes the world business', () => {
        let { s, assetId } = business(); s = delegate(s, assetId, { maxSpend: 1 }); const balance = e(s).assets[assetId].balance;
        s = act(s, null, {}, year(20)); expect(e(s).assets[assetId].balance).toBe(balance); expect(Object.values(e(s).contracts)[0].report.reason).toBe('capital_authority');
        let b = business(); b.s = act(b.s, 'asset.manage', { id: b.assetId, action: 'withdraw', amount: 300, otherId: '', sourceId: b.sourceId }); b.s = delegate(b.s, b.assetId);
        b.s = act(b.s, null, {}, year(5)); expect(e(b.s).assets[b.assetId].status).toBe('seized'); expect(life(b.s).renewal.places.river_foundry.status).toBe('closed');
    });
    test('hidden corruption has real losses; audit reveals it without rewriting past balances', () => {
        let found = false;
        for (const seed of [17, 71, 731, 13, 97]) {
            let { s, assetId } = business(seed); s = delegate(s, assetId, { risk: 2 }); const id = Object.keys(e(s).contracts)[0];
            s = act(s, null, {}, year(5)); const concealed = Object.values(e(s).events).filter(x => x.kind === 'corruption' && !x.public); if (!concealed.length) continue;
            found = true; const balance = e(s).assets[assetId].balance;
            expect(JSON.stringify(enterpriseView(s))).not.toContain('corruption'); expect(e(s).assets[assetId].debt).toBeGreaterThan(0);
            s = act(s, 'delegate.review', { id, action: 'audit' }); expect(e(s).assets[assetId].balance).toBe(balance);
            expect(e(s).contracts[id].report.reason).toBe('discovered_corruption'); expect(Object.values(e(s).events).some(x => x.kind === 'audit' && x.detail.discovered.length > 0)).toBe(true);
            break;
        }
        expect(found).toBe(true);
    });
    test('player-founded culture diverges and rejects founder instructions; office succession stays native', () => {
        let { s, sourceId, assetId } = business(); s = act(s, 'world.change', { id: '', operation: 'found', otherId: '', sourceId, name: 'Civic Trust' });
        const institutionId = life(s).renewal.last.id;
        s = act(s, 'career.take', { roleId: 'administrator', institutionId, sourceId });
        s = act(s, 'organization.charter', { institutionId, agenda: 'service', sourceId });
        const root = e(s).nodes[e(s).organizations[institutionId].rootId], leader = life(s).offices[root.officeId].holderId;
        const interest = e(s).agents[leader].interest, agenda = interest === 'service' ? 'profit' : 'service';
        s = act(s, 'organization.policy', { institutionId, agenda });
        s = act(s, 'organization.department', { institutionId, parentId: root.id, leaderId: 'partner', name: 'Operations', workforce: 400 });
        expect(Object.keys(people(life(s))).length).toBeLessThan(10); expect(enterpriseView(s).organizations[0].workforce).toBe(401);
        s = delegate(s, assetId, { agentId: '', officeId: root.officeId, institutionId });
        s = act(s, null, {}, year(15)); expect(e(s).organizations[institutionId].agenda).toBe(interest); expect(e(s).organizations[institutionId].autonomy).toBeGreaterThanOrEqual(2);
        s = act(s, 'organization.policy', { institutionId, agenda }); expect(e(s).organizations[institutionId].agenda).toBe(interest);
        expect(Object.values(e(s).events).some(x => x.kind === 'founder_order_refused')).toBe(true);
        s = act(s, 'world.change', { id: institutionId, operation: 'dissolve', otherId: '', sourceId, name: '' });
        s = act(s, null, {}, year(50)); expect(life(s).offices[root.officeId].holderId).toBe(''); expect(e(s).organizations[institutionId].status).toBe('dissolved');
    });
    test('office delegation replaces departed agents; named delegation cannot resurrect them', () => {
        let { s, sourceId, assetId } = business(); s = delegate(s, assetId);
        s = act(s, 'person.exit', { id: 'deputy', reason: 'retired', sourceId }); expect(Object.values(e(s).contracts)[0].report.reason).toBe('agent_unavailable');
        expect(() => delegate(s, assetId, { targetId: 'other' })).toThrow('eligible');
    });
    test('budget rejection and ledger tampering are atomic; projection never aliases state', () => {
        let { s, sourceId, assetId } = business(); const before = clone(s);
        expect(() => act(s, 'asset.acquire', { placeId: 'river_foundry', sourceId })).toThrow('already titled'); expect(s).toEqual(before);
        const forged = clone(s); e(forged).reserves++; expect(() => validateLifetimes(forged)).toThrow('treasury ledger');
        const limited = clone(s); limited.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes.enterprise.maxRecords = Object.values(e(s)).filter(x => x && typeof x === 'object').reduce((n, x) => n + Object.keys(x).length, 0) - 10;
        const frozen = clone(limited); expect(() => act(limited, 'asset.manage', { id: assetId, action: 'capitalize', amount: 1, otherId: '', sourceId })).toThrow('budget'); expect(limited).toEqual(frozen);
        const view = enterpriseView(s); view.assets[0].ownerId = 'forged'; expect(e(s).assets[assetId].ownerId).toBe('hero');
    });
    test('family logistics do not replace presence, and explicit reconciliation starts a new absence interval', () => {
        let s = act(fixture(),'longevity.bind',{ routeId:'covenant' });
        s = act(s,'bond.form',{ firstId:'hero',secondId:'partner',kind:'marriage',visibility:'public',consent:true });const bond = Object.keys(life(s).bonds)[0];
        s = delegate(s,bond,{ domain:'family' });s = act(s,null,{},year(10));expect(life(s).bonds[bond].state).toBe('estranged');
        s = act(s,'bond.change',{ id:bond,state:'active',consent:true });s = act(s,null,{},year(15));expect(life(s).bonds[bond].state).toBe('active');
    });
    test('delegated investigations resolve ordinary evidence but escalate occult risks to the protagonist',()=>{
        const outcomes = new Set();
        for(const seed of [17,71,731,13,97,233]) {
            let { s,sourceId } = caseFile(fixture(seed));s = act(s,'career.take',{ roleId:'independent_verifier',institutionId:'',sourceId });
            s = act(s,null,{},90 * 1440);s = act(s,'matter.open',{ grammarId:'document_fraud',hookId:'' });const m = Object.values(life(s).renewal.active)[0];
            s = delegate(s,m.id,{ domain:'investigation' });s = act(s,null,{},97 * 1440);const c = Object.values(e(s).contracts)[0];outcomes.add(c.status);
            const ordinary = m.structure.anomaly === 'none';
            expect(c.status).toBe(ordinary ? 'completed' : 'escalated');
            expect(life(s).renewal.canonical[m.id]?.closed).toBe(ordinary ? 97 * 1440 : undefined);
            expect(Boolean(life(s).renewal.active[m.id])).toBe(!ordinary);
        }
        expect(outcomes.has('completed')).toBe(true);expect(outcomes.has('escalated')).toBe(true);
    });
    test('office contract follows a real successor, while transfer removes the former owner authority',()=>{
        let { s,sourceId,assetId } = business();s = act(s,'world.change',{ id:'',operation:'found',otherId:'',sourceId,name:'Trust' });const institutionId = life(s).renewal.last.id;
        s = act(s,'career.take',{ roleId:'administrator',institutionId,sourceId });s = act(s,'organization.charter',{ institutionId,agenda:'service',sourceId });
        const root = e(s).nodes[e(s).organizations[institutionId].rootId],prior = life(s).offices[root.officeId].holderId;
        s = delegate(s,assetId,{ agentId:'',officeId:root.officeId,institutionId });s = act(s,'person.exit',{ id:prior,reason:'retired',sourceId });
        const successor = life(s).offices[root.officeId].holderId;expect(successor).not.toBe(prior);expect(Object.values(e(s).contracts)[0].agentId).toBe(successor);
        expect(Object.values(e(s).events).some(x=>x.kind === 'delegate_succession')).toBe(true);
        s = act(s,'asset.manage',{ id:assetId,action:'transfer',otherId:'partner',amount:0,sourceId });expect(Object.values(e(s).contracts)[0].status).toBe('escalated');
    });
});
