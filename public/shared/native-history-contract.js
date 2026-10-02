import { fields, json } from './native-values.js';
import { taskId } from './native-task-contract.js';

const integer = (n, low, high) => { if (!Number.isSafeInteger(n) || n < low || n > high) throw new TypeError('History bound'); return n; };
const S = (n = 128) => ({ type: 'string', maxLength: n });
const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const HISTORY_OPERATIONS = Object.freeze({
    'artifact.create': O({ kind: S(32), title: S(160), content: S(2048), sourceId: S(), parentId: S() }),
    'artifact.change': O({ id: S(), status: { ...S(32), enum: ['held', 'archived', 'damaged', 'lost', 'destroyed'] } }),
    'hook.create': O({ title: S(160), sourceId: S() }),
    'hook.change': O({ id: S(), status: { ...S(32), enum: ['active', 'expired', 'disproven', 'resolved'] } }),
    'memory.mark': O({ id: S(), marked: { type: 'boolean' }, journaled: { type: 'boolean' } }),
    compact: O({}),
});
export const ARTIFACT_KINDS = ['photograph', 'letter', 'contract', 'will', 'newspaper', 'case_file', 'diary', 'property_record', 'ritual_record', 'heirloom', 'recording'];
export function assertHistoryPolicy(raw, lifecycle) {
    fields(raw, ['schemaVersion', 'clockId', 'chronologyDomain', 'meaningfulDomains', 'sources', 'hot', 'warm', 'cold', 'maxDurable', 'maxBytes', 'checkpointTurns'], 'History policy');
    if (raw.schemaVersion !== 1 || !lifecycle.clocks.some(c => c.id === raw.clockId)) throw new TypeError('History clock');
    const domain = id => { taskId(id); const d = lifecycle.domains.find(d => d.id === id); if (!d) throw new TypeError('History domain'); return d; };
    const chronology = domain(raw.chronologyDomain).recordSchema.properties;
    if (chronology.calendar?.properties?.year?.type !== 'integer' || chronology.era_id?.type !== 'string' || chronology.sequence?.type !== 'integer') throw new TypeError('History chronology');
    if (!Array.isArray(raw.meaningfulDomains) || raw.meaningfulDomains.length > 32 || new Set(raw.meaningfulDomains).size !== raw.meaningfulDomains.length) throw new TypeError('History sources');
    raw.meaningfulDomains.forEach(domain);
    if (!Array.isArray(raw.sources) || raw.sources.length > 64 || new Set(raw.sources.map(s => s.id)).size !== raw.sources.length) throw new TypeError('History sources');
    for (const s of raw.sources) {
        fields(s, ['id', 'domainId', 'recordId', 'path', 'public', 'refs', 'label'], 'History fact source'); taskId(s.id); taskId(s.recordId);
        let schema = domain(s.domainId).recordSchema;
        if (!Array.isArray(s.path) || !s.path.length || s.path.length > 8) throw new TypeError('History path');
        for (const key of s.path) { taskId(key); schema = schema?.properties?.[key]; }
        if (!schema || typeof s.public !== 'boolean' || typeof s.label !== 'string' || s.label.length > 160) throw new TypeError('History fact disclosure');
        if (!Array.isArray(s.refs) || s.refs.length > 16 || s.refs.some(r => typeof r !== 'string' || !/^(actor|family|location|institution|case|claim|era|artifact):[a-zA-Z0-9._-]{1,128}$/.test(r))) throw new TypeError('History facet');
    }
    integer(raw.hot, 1, 32); integer(raw.warm, 1, 128); integer(raw.cold, 1, 128);
    integer(raw.maxDurable, 32, 8192); integer(raw.maxBytes, 65536, 4194304); integer(raw.checkpointTurns, 16, 256);
    return json(raw);
}
export const historyPolicy = snapshot => snapshot.manifest.runtime?.experienceContract?.lifecycleRuntime?.history;
