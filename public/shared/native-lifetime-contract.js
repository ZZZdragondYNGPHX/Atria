import { assertRenewalPolicy, RENEWAL_OPERATIONS } from './native-renewal-contract.js';
// Optional, declarative human-lifetime policy. All writes remain Native candidates.
import { fields, json } from './native-values.js';
import { assertTaskValue, taskId } from './native-task-contract.js';
export const I = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', minimum, maximum });
const S = (maxLength = 128, values) => ({ type: 'string', maxLength, ...(values ? { enum: values } : {}) });
const B = { type: 'boolean' };
export const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const A = (items, maxItems = 16) => ({ type: 'array', items, maxItems });
const date = I(-Number.MAX_SAFE_INTEGER);
export const LIFETIME_OPERATIONS = {
    ...RENEWAL_OPERATIONS,
    'person.enter': O({ name: S(80), birthTick: date, cause: S(24, ['migration', 'hiring', 'recruitment', 'case']), sourceId: S(), institutionId: S() }),
    'person.promote': O({ id: S(), sourceId: S() }),
    'person.exit': O({ id: S(), reason: S(24, ['retired', 'missing', 'dead']), sourceId: S() }),
    'person.return': O({ id: S(), sourceId: S() }),
    'person.career': O({ id: S(), occupation: S(80), institutionId: S(), sourceId: S() }),
    'person.health': O({ id: S(), impairment: S(160), sourceId: S() }),
    'bond.form': O({ firstId: S(), secondId: S(), kind: S(24, ['romance', 'marriage', 'partnership']), visibility: S(16, ['public', 'secret']), consent: B }),
    'bond.change': O({ id: S(), state: S(24, ['separated', 'estranged', 'active']), consent: B }),
    'family.conceive': O({ parentId: S(), otherParentId: S(), name: S(80), consent: B }),
    'family.adopt': O({ parentId: S(), otherParentId: S(), childId: S(), visibility: S(16, ['public', 'secret']), consent: B }),
    'legacy.pledge': O({ ownerId: S(), heirId: S(), kind: S(24, ['artifact', 'favor', 'grudge', 'secret', 'obligation', 'institutional_tie', 'claim']), sourceId: S() }),
    'office.nominate': O({ officeId: S(), actorId: S() }),
    'longevity.bind': O({ routeId: S() }),
    'longevity.offer': O({ id: S(), routeId: S(), consent: B }),
    'protagonist.die': O({ sourceId: S() }),
};
export const lifetimePolicy = s => s.manifest.runtime?.experienceContract?.lifecycleRuntime?.lifetimes;
export function assertLifetimePolicy(raw, lifecycle) {
    fields(raw, ['schemaVersion', 'clockId', 'chronologyDomain', 'protagonistId', 'publicIdentityId', 'seed', 'adultAge', 'retirementAge', 'mortalityAge', 'gestationTicks', 'maxPeople', 'maxEvents', 'maxBytes', 'initialPopulation', 'people', 'offices', 'routes', 'actorSource', 'renewal'], 'Lifetime policy');
    if (raw.schemaVersion !== 1 || !lifecycle.history || !lifecycle.clocks.some(c => c.id === raw.clockId) || raw.clockId !== lifecycle.history.clockId || raw.chronologyDomain !== lifecycle.history.chronologyDomain) throw new TypeError('Lifetime clock/history authority');
    for (const key of ['protagonistId', 'publicIdentityId']) taskId(raw[key]);
    for (const [key, lo, hi] of [['seed', 0, 2147483647], ['adultAge', 16, 30], ['retirementAge', 40, 90], ['mortalityAge', 60, 120], ['gestationTicks', 1440, 525600], ['maxPeople', 8, 512], ['maxEvents', 16, 1024], ['maxBytes', 16384, 1048576], ['initialPopulation', 100, 10000000]]) assertTaskValue(raw[key], I(lo, hi));
    if (raw.adultAge >= raw.retirementAge || raw.retirementAge >= raw.mortalityAge) throw new TypeError('Lifetime ages');
    const person = O({ id: S(), name: S(80), birthTick: date, tier: S(1, ['A', 'B']), institutionId: S(), occupation: S(80), sourceRecordId: S() });
    const office = O({ id: S(), institutionId: S(), title: S(80), holderId: S(), rule: S(24, ['seniority', 'nomination']) });
    const route = O({ id: S(), label: S(160), agingDivisor: I(1, 100), returnTicks: I(1440, 5256000), claimCost: I(1, 100), exposureCost: I(1, 100) });
    assertTaskValue(raw.people, A(person, 32)); assertTaskValue(raw.offices, A(office, 16)); assertTaskValue(raw.routes, A(route, 4));
    for (const list of [raw.people, raw.offices, raw.routes]) if (!list.length || new Set(list.map(x => x.id)).size !== list.length) throw new TypeError('Lifetime policy identity');
    if (!raw.people.some(p => p.id === raw.protagonistId) || raw.people.some(p => p.birthTick > 0)) throw new TypeError('Lifetime authored birth');
    for (const p of raw.people) { taskId(p.id); if (p.sourceRecordId && !raw.actorSource) throw new TypeError('Lifetime authored source'); }
    for (const o of raw.offices) { taskId(o.id); taskId(o.institutionId); if (!raw.people.some(p => p.id === o.holderId && p.institutionId === o.institutionId)) throw new TypeError('Lifetime initial office holder'); }
    if (raw.actorSource) {
        assertTaskValue(raw.actorSource, O({ domainId: S(), identityField: S(), nameField: S(), aliveField: S(), introducedPath: A(S(), 8) }));
        const schema = lifecycle.domains.find(d => d.id === raw.actorSource.domainId)?.recordSchema;
        for (const key of ['identityField', 'nameField', 'aliveField']) if (!schema?.properties[raw.actorSource[key]]) throw new TypeError('Lifetime actor source field');
        let stamp = schema; for (const key of raw.actorSource.introducedPath)stamp = stamp?.properties?.[key];
        if (stamp?.type !== 'integer') throw new TypeError('Lifetime introduction source');
    }
    if (raw.renewal !== undefined) assertRenewalPolicy(raw.renewal);
    return json(raw);
}
