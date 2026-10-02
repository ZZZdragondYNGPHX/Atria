// Optional Phase 5 declarations; all effects belong to the Native Lifetime candidate.
import { assertTaskValue, taskId } from './native-task-contract.js';
const S = (maxLength = 128, values) => ({ type: 'string', maxLength, ...(values ? { enum: values } : {}) });
const I = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', minimum, maximum });
const B = { type: 'boolean' };
const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const A = (items, maxItems) => ({ type: 'array', items, maxItems });
export const ENTERPRISE_ACTIONS = {
    'progress.learn': O({ domain: S(24, ['investigation', 'commerce', 'occult']), sourceId: S() }),
    'career.take': O({ roleId: S(), institutionId: S(), sourceId: S() }),
    'career.leave': O({ id: S() }),
    'identity.change': O({ mode: S(24, ['retain', 'retire', 'hide', 'declare_dead', 'replace']), name: S(80), method: S(16, ['legitimate', 'forged']), sourceId: S() }),
    'asset.acquire': O({ placeId: S(), sourceId: S() }),
    'asset.manage': O({ id: S(), action: S(24, ['capitalize', 'withdraw', 'repair', 'transfer', 'bequeath', 'regularize']), otherId: S(), amount: I(0, 1000000), sourceId: S() }),
    'organization.charter': O({ institutionId: S(), agenda: S(16, ['service', 'profit', 'secrecy']), sourceId: S() }),
    'organization.department': O({ institutionId: S(), parentId: S(), leaderId: S(), name: S(80), workforce: I(1, 10000) }),
    'organization.policy': O({ institutionId: S(), agenda: S(16, ['service', 'profit', 'secrecy']) }),
    'delegate.create': O({ domain: S(24, ['business', 'investigation', 'research', 'family']), targetId: S(), agentId: S(), officeId: S(), institutionId: S(), objective: S(240), maxSpend: I(0, 1000000), risk: I(0, 3), prohibited: O({ debt: B, occult: B, church: B, force: B }), lossThreshold: I(1, 1000000), reportYears: I(1, 10), escalateOccult: B }),
    'delegate.review': O({ id: S(), action: S(16, ['audit', 'resume', 'revoke']) }),
};
// Group related verbs to stay inside the unchanged 24 Lifetime-command budget.
const families = {
    'career.change': ['career.take', 'career.leave'],
    'asset.change': ['asset.acquire', 'asset.manage'],
    'organization.change': ['organization.charter', 'organization.department', 'organization.policy'],
    'delegate.change': ['delegate.create', 'delegate.review'],
};
export const ENTERPRISE_OPERATIONS = Object.fromEntries(Object.entries(ENTERPRISE_ACTIONS).filter(([k]) => !Object.values(families).flat().includes(k)));
for (const [family, verbs] of Object.entries(families)) {
    const properties = Object.assign({}, ...verbs.map(v => ENTERPRISE_ACTIONS[v].properties));
    properties.verb = S(32, verbs);
    ENTERPRISE_OPERATIONS[family] = O(properties);
}
const defaultValue = s => s.type === 'object' ? Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, defaultValue(v)])) : s.type === 'boolean' ? false : s.type === 'integer' ? s.minimum : s.enum?.[0] ?? '';
// Convenience for typed callers; this only builds data, never applies authority.
export function enterpriseCommand(operation, input) {
    if (!ENTERPRISE_ACTIONS[operation]) return { operation, input };
    assertTaskValue(input, ENTERPRISE_ACTIONS[operation]);
    const family = Object.entries(families).find(([, verbs]) => verbs.includes(operation))?.[0];
    if (!family) return { operation, input };
    return { operation: family, input: { ...defaultValue(ENTERPRISE_OPERATIONS[family]), ...input, verb: operation } };
}
export function assertEnterprisePolicy(p, lifetime, lifecycle) {
    assertTaskValue(p, O({ schemaVersion: I(1, 1), maxRecords: I(16, 256), initialReserves: I(0, 1000000), endowmentSource: S(), identityDomainId: S(), matureRank: I(1, 5),
        roles: A(O({ id: S(), permission: S(24, ['investigate', 'trade', 'manage', 'research', 'legal']), obligation: S(160), institutionRequired: B, minimumRank: I(0, 5), domain: S(24, ['investigation', 'commerce', 'occult']) }), 12),
        propertyPrices: O({ location: I(1, 1000000), business: I(1, 1000000), district: I(1, 1000000) }) }));
    if (!lifetime.renewal || !p.roles.length || new Set(p.roles.map(x => x.id)).size !== p.roles.length) throw new TypeError('Enterprise requires renewal and unique roles');
    if (p.identityDomainId && !lifecycle?.domains.find(d => d.id === p.identityDomainId)?.recordSchema?.properties?.public_identity_id) throw new TypeError('Enterprise identity projection binding');
    for (const r of p.roles) taskId(r.id);
    taskId(p.endowmentSource);
    return structuredClone(p);
}
