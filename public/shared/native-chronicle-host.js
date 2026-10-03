import { enterpriseView } from './native-enterprise-runtime.js';
import { regionalView } from './native-regional-runtime.js';
import { lifetimePolicy } from './native-lifetime-contract.js';
import { lifetimeView, people } from './native-lifetime-runtime.js';
import { queryHistory } from './native-history-runtime.js';
import { historyPolicy } from './native-history-contract.js';
import { civil, instant, anniversary } from './native-lifetime-runtime.js';

const S = maxLength => ({ type: 'string', maxLength });
const O = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const N = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const CHRONICLE_QUERY = O({ id: S(128), kind: { ...S(16), enum: ['event', 'summary', 'fact', 'artifact', 'hook'] }, facet: { ...S(16), enum: ['year', 'actor', 'family', 'location', 'institution', 'case', 'claim', 'era', 'artifact'] }, value: S(128), cursor: S(2048) }, []);
export const CHRONICLE_ROW = O({ id: S(128), label: S(512), kind: S(32), date: S(256), text: S(32768), source: S(8192), custody: S(8192), marked: { type: 'boolean' }, journaled: { type: 'boolean' }, clarity: S(16), refs: { type: 'array', maxItems: 64, items: O({ facet: S(32), value: S(128) }) }, refCount: N });
export const CHRONICLE_PAGE = O({ revision: S(128), rows: { type: 'array', maxItems: 12, items: CHRONICLE_ROW }, next: S(2048) });
export const WORLD_QUERY = O({ view: { ...S(16), enum: ['people', 'identity', 'delegation', 'regions'] }, id: S(128), cursor: S(2048) }, ['view']);
export const INTERVAL_QUERY = O({ quantity: { ...N, minimum: 1 }, unit: { ...S(16), enum: ['minutes', 'days', 'months', 'years'] } });
export const INTERVAL_RESULT = O({ from: N, target: N, minutes: N, fromText: S(128), targetText: S(128) });
export function formatCivil(tick) {
    if (!Number.isSafeInteger(tick)) throw new TypeError('Invalid chronology instant');
    const c = civil(tick), pad = n => String(n).padStart(2, '0');
    return `Year ${c.year}, ${pad(c.month)}-${pad(c.day)}, ${pad(Math.floor(c.minute / 60))}:${pad(c.minute % 60)}`;
}
const label = key => key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
function describe(value, prefix = '') {
    if (value === null || value === undefined) return prefix + ': Not recorded';
    if (typeof value !== 'object') return (prefix ? prefix + ': ' : '') + String(value);
    return Object.entries(value).map(([key, item]) => describe(item, prefix ? prefix + ' / ' + label(key) : label(key))).join('\n');
}
export function readChronicle(snapshot, input) {
    const query = { ...input, limit: 12, memory: true };
    if (query.cursor) query.cursor = JSON.parse(query.cursor); else delete query.cursor;
    const page = queryHistory(snapshot, query);
    return { revision: page.anchor.revisionId, next: page.next ? JSON.stringify(page.next) : '', rows: page.items.map(item => {
        const refs = item.refs ?? [];
        return { id: item.id, label: item.label ?? item.title ?? item.summary ?? item.id,
            kind: ({ fact: 'Recorded fact', summary: 'Historical summary', event: 'Recorded event', artifact: 'Attributed artifact', hook: 'Historical connection' })[item.kind],
            date: formatCivil(item.tick) + (Number.isSafeInteger(item.from) && item.from !== item.tick ? ' (from ' + formatCivil(item.from) + ')' : ''),
            text: item.kind === 'fact' ? describe(item.value) : item.content ?? item.summary ?? describe(item),
            source: describe({ id: item.id, ...(item.eventId ? { eventId: item.eventId } : {}), ...(item.previousId ? { previousId: item.previousId } : {}), ...(item.sourceId ? { sourceId: item.sourceId } : {}), ...(item.origin ? { origin: item.origin } : {}), ...(item.provenance ? { provenance: item.provenance } : {}) }),
            custody: describe({ ...(item.status ? { status: item.status } : {}), ...(item.holderId ? { holderId: item.holderId } : {}), ...(item.parentId ? { copyParent: item.parentId } : {}), ...(item.current !== undefined ? { currentFact: item.current } : {}), ...(item.count !== undefined ? { summarizedEvents: item.count } : {}), ...(item.provenanceCount !== undefined ? { provenanceLinks: item.provenanceCount, displayedLatestLinks: item.provenance.length } : {}), ...(item.transitions ? { transitions: item.transitions, transitionCount: item.transitionCount } : {}) }),
            marked: item.memory.marked, journaled: item.memory.journaled, clarity: item.memory.clarity,
            refs: refs.slice(0, 64).map(ref => { const at = ref.indexOf(':'); return { facet: ref.slice(0, at), value: ref.slice(at + 1) }; }), refCount: refs.length };
    }) };
}
export function reviewInterval(snapshot, { quantity, unit }) {
    const policy = historyPolicy(snapshot);
    const from = snapshot.states.atri_lifecycle?.clocks[policy?.clockId];
    if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(quantity) || quantity < 1) throw new TypeError('Invalid calendar interval');
    let target;
    if (unit === 'years') target = anniversary(from, quantity);
    else if (unit === 'months') {
        const date = civil(from), absolute = (date.year - 1) * 12 + date.month - 1 + quantity;
        if (!Number.isSafeInteger(absolute)) throw new TypeError('Calendar interval overflow');
        const year = Math.floor(absolute / 12) + 1, month = absolute % 12 + 1;
        const next = instant({ year: year + Number(month === 12), month: month === 12 ? 1 : month + 1, day: 1 });
        const lastDay = civil(next - 1440).day;
        target = instant({ year, month, day: Math.min(date.day, lastDay), minute: date.minute });
    } else if (unit === 'days' || unit === 'minutes') target = from + quantity * (unit === 'days' ? 1440 : 1);
    else throw new TypeError('Unsupported calendar unit');
    if (!Number.isSafeInteger(target) || target <= from || !Number.isSafeInteger(target - from)) throw new TypeError('Calendar interval overflow');
    return { from, target, minutes: target - from, fromText: formatCivil(from), targetText: formatCivil(target) };
}

// Only the pre-existing disclosure-safe views cross this Host boundary. Actor
// biography is public in lifetimeSources; secret bonds and pregnancies do not.
export function readWorldView(snapshot, input) {
    const policy = lifetimePolicy(snapshot), state = snapshot.states.atri_lifecycle?.lifetimes;
    if (!policy || !state) throw new TypeError('Long-life view unavailable');
    const now = snapshot.states.atri_lifecycle.clocks[policy.clockId], signature = JSON.stringify({ view: input.view, id: input.id ?? '' });
    let offset = 0;
    if (input.cursor) { const c = JSON.parse(input.cursor); if (c.revision !== snapshot.revision.revisionId || c.signature !== signature || !Number.isSafeInteger(c.offset) || c.offset < 0) throw new TypeError('Stale world view cursor'); offset = c.offset; }
    let entries;
    if (input.view === 'people' || input.view === 'identity') {
        const actors = people(state), ids = input.view === 'identity' ? [policy.protagonistId] : input.id ? [input.id].filter(id => Object.hasOwn(actors, id)) : Object.keys(actors).sort((a, b) => a === policy.protagonistId ? -1 : b === policy.protagonistId ? 1 : a.localeCompare(b, 'en'));
        entries = ids.map(id => ({ id }));
        const page = entries.slice(offset, offset + 12).map(({ id }) => {
            const actor = actors[id], view = lifetimeView(snapshot, id);
            const relations = [...Object.values(state.bonds), ...Object.values(state.kinship)].filter(r => r.visibility !== 'secret' && r.refs?.includes('actor:' + id));
            const terms = Object.values(state.terms).filter(r => r.visibility !== 'secret' && r.refs?.includes('actor:' + id));
            const text = describe(view) + '\nBirth date: ' + formatCivil(actor.identity.birthTick) + '\n' + (relations.length ? describe({ relationships: relations.slice(0, 8), relationshipCount: relations.length }) : 'No family relationships recorded. Your life can continue without founding a family.') + '\n' + describe({ officeTerms: terms.slice(-8), officeTermCount: terms.length });
            return { id, label: view.name, text, source: 'Native public person record; actor:' + id, kind: id === policy.protagonistId ? 'Continuous protagonist' : 'Person', refs: [{ facet: 'actor', value: id }] };
        });
        return worldPage(snapshot, page, offset + page.length < entries.length ? { revision: snapshot.revision.revisionId, signature, offset: offset + page.length } : null, now);
    }
    if (input.view === 'delegation') {
        const view = enterpriseView(snapshot);
        entries = [...view.contracts.map(x => ({ ...x, kind: 'Delegated responsibility' })), ...view.organizations.map(x => ({ ...x, kind: 'Organization' })), ...view.assets.map(x => ({ ...x, kind: 'Holding' })), ...view.roles.map(x => ({ ...x, kind: 'Active role' }))];
    } else if (input.view === 'regions') {
        const view = regionalView(snapshot);
        entries = view.regions.map(r => ({ ...r, kind: r.id === view.currentRegionId ? 'Current base' : 'Connected region', era: policy.regional.eras.find(e => e.id === r.eraId)?.label ?? r.eraId, journey: view.journey, alerts: view.alerts }));
    } else throw new TypeError('Unknown public world view');
    if (input.id) entries = entries.filter(e => e.id === input.id);
    const page = entries.slice(offset, offset + 12).map(e => ({ id: e.id, label: e.name ?? e.id, kind: e.kind, text: describe(e), source: 'Native disclosed ' + input.view + ' view; bounded current reports, not concealed runtime truth.', refs: [] }));
    return worldPage(snapshot, page, offset + page.length < entries.length ? { revision: snapshot.revision.revisionId, signature, offset: offset + page.length } : null, now);
}
function worldPage(snapshot, rows, next, now) {
    return { revision: snapshot.revision.revisionId, next: next ? JSON.stringify(next) : '', rows: rows.map(r => ({ ...r, date: formatCivil(now), custody: 'Current public projection. Historical sources remain in Chronicle.', marked: false, journaled: false, clarity: 'clear', refCount: r.refs.length })) };
}
