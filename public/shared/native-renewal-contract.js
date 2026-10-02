// Optional renewable-content policy; the existing Lifetime candidate owns state.
import { assertTaskValue, taskId } from './native-task-contract.js';
const S = (n = 128, values) => ({ type: 'string', maxLength: n, ...(values ? { enum: values } : {}) });
const I = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const A = (items, maxItems) => ({ type: 'array', items, maxItems });
export const RENEWAL_DIMENSIONS = ['subject', 'roles', 'truth', 'anomaly', 'path', 'stakes', 'resolution'];
export const RENEWAL_OPERATIONS = {
    'matter.open': O({ grammarId: S(), hookId: S() }),
    'matter.act': O({ id: S(), action: S(32), presentation: S(320) }),
    'world.change': O({ id: S(), operation: S(24, ['found', 'build', 'open_business', 'zone_district', 'expand', 'repurpose', 'rename', 'decline', 'burn', 'demolish', 'rebuild', 'protect', 'merge', 'split', 'dissolve']), otherId: S(), sourceId: S(), name: S(80) }),
};
export function assertRenewalPolicy(p) {
    assertTaskValue(p, O({ schemaVersion: I(1, 1), maxActive: I(1, 4), maxRecent: I(8, 64), cooldownTicks: I(1440, 5256000), minimumDistance: I(2, 6), maxEntities: I(4, 128),
        grammars: A(O({ id: S(), trigger: S(160), responseTicks: I(1440, 525600), ...Object.fromEntries(RENEWAL_DIMENSIONS.map(d => [d, A(S(80), 8)])), actions: A(S(32), 8), historyRequired: { type: 'boolean' }, requiresFamily: { type: 'boolean' } }), 32),
        places: A(O({ id: S(), name: S(80), kind: S(16, ['location', 'business', 'district']), districtId: S(), function: S(80) }), 32) }));
    if (!p.grammars.length || !p.places.length) throw new TypeError('Renewal empty grammar/geography');
    for (const list of [p.grammars, p.places]) {
        if (new Set(list.map(x => x.id)).size !== list.length) throw new TypeError('Renewal duplicate identity');
        for (const x of list) taskId(x.id);
    }
    for (const g of p.grammars) {
        if (g.actions.length < 2 || new Set(g.actions).size !== g.actions.length || RENEWAL_DIMENSIONS.some(d => !g[d].length || new Set(g[d]).size !== g[d].length)) throw new TypeError('Renewal empty/repeated grammar structure');
    }
    for (const x of p.places) if (x.districtId && !p.places.some(d => d.id === x.districtId && d.kind === 'district')) throw new TypeError('Renewal district');
    return structuredClone(p);
}
// Surface text, entity names and grammar IDs deliberately do not enter distance.
export function semanticDistance(a, b) {
    return [...RENEWAL_DIMENSIONS, 'institutionRole', 'historyRole'].reduce((n, d) => n + Number(a[d] !== b[d]), 0);
}
