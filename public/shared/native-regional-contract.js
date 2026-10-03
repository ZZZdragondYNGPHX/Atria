// Declarative regions; all mutations belong to the existing Lifetime candidate.
import { assertTaskValue, taskId } from './native-task-contract.js';
const S = (n = 128, values) => ({ type: 'string', maxLength: n, ...(values ? { enum: values } : {}) });
const I = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const A = (items, maxItems) => ({ type: 'array', items, maxItems });
export function regionalCommand(verb, input) {
    if (!['travel', 'fidelity', 'invest'].includes(verb) || Object.keys(input).some(k => !['regionId', 'mode', 'tier', 'project', 'sourceId'].includes(k))) throw new TypeError('Regional command');
    return { operation: 'world.change', input: { operation: 'region.' + verb, id: input.regionId, otherId: input.mode || input.tier || input.project || '', sourceId: input.sourceId || '', name: '' } };
}
export function assertRegionalPolicy(p, policy) {
    assertTaskValue(p, O({ schemaVersion: I(1, 1), openingRegionId: S(), cadenceYears: I(2, 10), maxRecords: I(32, 256), maxActive: I(1, 3),
        regions: A(O({ id: S(), name: S(80), nation: S(80), population: I(100, 10000000), capital: I(0, 100), tension: I(0, 6) }), 8),
        routes: A(O({ from: S(), to: S(), days: I(1, 180) }), 28),
        eras: A(O({ id: S(), label: S(80), threshold: I(0, 8), recordDensity: I(1, 8), transportDivisor: I(1, 8), industry: S(80), occult: S(80) }), 4),
        grammarEras: A(O({ grammarId: S(), minimum: I(0, 3), maximum: I(0, 3) }), 32) }));
    if (!policy.renewal || !policy.enterprise || !p.regions.some(r => r.id === p.openingRegionId) || p.eras.length < 3 || p.eras[0].threshold !== 0) throw new TypeError('Regional prerequisites');
    for (const xs of [p.regions, p.eras]) { if (new Set(xs.map(x => x.id)).size !== xs.length) throw new TypeError('Regional identity'); for (const x of xs) taskId(x.id); }
    for (let i = 1; i < p.eras.length; i++) if (p.eras[i].threshold <= p.eras[i - 1].threshold) throw new TypeError('Regional Era order');
    for (const r of p.routes) if (r.from === r.to || ![r.from, r.to].every(id => p.regions.some(x => x.id === id))) throw new TypeError('Regional route');
    for (const g of p.grammarEras) if (g.minimum > g.maximum || g.maximum >= p.eras.length || !policy.renewal.grammars.some(x => x.id === g.grammarId)) throw new TypeError('Regional grammar Era');
}
