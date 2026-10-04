import { enterpriseCommand } from '../../../public/shared/native-enterprise-contract.js';
import { lifetimePolicyFixture } from './lifetime-policy.js';
import { renewalPolicy } from './renewal-policy.js';
import { enterprisePolicy } from './enterprise-policy.js';
import { initialLifetimes, prepareLifetimes } from '../../../src/native/lifetime-authority.js';
import { initialHistory } from '../../../public/shared/native-history-runtime.js';
import { prepareHistory } from '../../../src/native/history-authority.js';
import { civil } from '../../../public/shared/native-lifetime-runtime.js';
export function fixture(seed = 17) {
    const policy = lifetimePolicyFixture('hero', seed); policy.renewal = structuredClone(renewalPolicy); policy.enterprise = structuredClone(enterprisePolicy);
    const history = { schemaVersion: 1, clockId: 'world', chronologyDomain: 'chronology', meaningfulDomains: [], sources: [], hot: 8, warm: 24, cold: 32, maxDurable: 4096, maxBytes: 2097152, checkpointTurns: 64 };
    return { manifest: { actors: [{ actorId: 'hero' }], runtime: { experienceContract: { lifecycleRuntime: { lifetimes: policy, history } } } }, session: { sessionId: 'world.one' }, revision: { revisionId: 'rev.one', branchId: 'branch.one' }, timeline: [], states: { atri_lifecycle: { clocks: { world: 0 }, history: initialHistory(), lifetimes: initialLifetimes(policy), domains: { chronology: { records: [{ id: 'main', value: { sequence: 0, calendar: { year: 1 }, era_id: 'opening' } }] } } } } };
}
export function act(base, operation = null, input = {}, tick = base.states.atri_lifecycle.clocks.world) {
    const s = structuredClone(base); s.states.atri_lifecycle.clocks.world = tick; const c = s.states.atri_lifecycle.domains.chronology.records[0].value; c.sequence++; c.calendar.year = civil(tick).year;
    prepareLifetimes(base, s, operation ? enterpriseCommand(operation, input) : null); prepareHistory(base, s, { id: 'lifetime', verb: 'lifetime' }, { outcome: 'automatic' }); return s;
}
export const life = s => s.states.atri_lifecycle.lifetimes;
export const enterprise = s => life(s).enterprise;
export function caseFile(s) {
    s = act(s, 'matter.open', { grammarId: 'document_fraud', hookId: '' }); const m = Object.values(life(s).renewal.active)[0];
    for (const action of m.path) s = act(s, 'matter.act', { id: m.id, action, presentation: '' });
    s = act(s, 'matter.act', { id: m.id, action: 'record', presentation: '' }); return { s, sourceId: m.id };
}
export function business(seed = 17) {
    let { s, sourceId } = caseFile(fixture(seed)); s = act(s, 'longevity.bind', { routeId: 'covenant' });
    s = act(s, 'career.take', { roleId: 'merchant', institutionId: '', sourceId });
    s = act(s, 'asset.acquire', { placeId: 'river_foundry', sourceId }); const assetId = Object.keys(enterprise(s).assets)[0];
    s = act(s, 'asset.manage', { id: assetId, action: 'capitalize', amount: 300, otherId: '', sourceId }); return { s, sourceId, assetId };
}
export function delegate(s, assetId, overrides = {}) {
    return act(s, 'delegate.create', { domain: 'business', targetId: assetId, agentId: 'deputy', officeId: '', institutionId: '', objective: 'Maintain safe premises and grow the business conservatively.', maxSpend: 100, risk: 0, prohibited: { debt: true, occult: true, church: true, force: true }, lossThreshold: 100, reportYears: 5, escalateOccult: true, ...overrides });
}
