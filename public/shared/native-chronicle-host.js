import { enterpriseView } from './native-enterprise-runtime.js';
import { regionalView, reviewTravel } from './native-regional-runtime.js';
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
export const WORLD_QUERY = O({ view: { ...S(16), enum: ['people', 'identity', 'delegation', 'regions', 'institutions', 'places', 'orientation', 'travel'] }, id: S(128), cursor: S(2048), transport: { ...S(16), enum: ['coach', 'rail', 'motor'] } }, ['view']);
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
    const actors = people(state), name = id => actors[id]?.identity.name ?? id;
    if (input.view === 'travel') {
        const reviewed = reviewTravel(state, policy, input.id, input.transport, now);
        return worldPage(snapshot, [{ id: reviewed.to, label: 'Review travel', kind: 'Requested journey', text: `Origin: ${reviewed.origin}. Destination: ${reviewed.destination}. Transport: ${reviewed.mode}. Duration: ${reviewed.duration} exact minutes. Arrival target: ${formatCivil(reviewed.arrives)}. Departure cost: ${reviewed.cost}. This starts a journey; arrival requires time advancement and may be interrupted. Review known family, holdings and delegated commitments before departure.`, source: 'Native shared route/calendar calculation; current revision, not an outcome forecast.', refs: [{ facet: 'location', value: reviewed.to }] }], null, now);
    }
    if (input.view === 'orientation') {
        const regional = policy.regional ? regionalView(snapshot) : null, base = regional?.regions.find(r => r.id === regional.currentRegionId);
        const identity = policy.enterprise ? enterpriseView(snapshot).identity : { name: name(policy.protagonistId) };
        const date = snapshot.states.atri_lifecycle.domains?.[policy.chronologyDomain]?.records.find(r => r.id === 'main')?.value;
        const interval = date?.last_interval;
        const milestones = Object.values(state.milestones).filter(m => m.visibility !== 'secret' && m.tick === now).slice(-4).map(m => label(m.kind));
        const receipt = interval && interval.requested_until > interval.from ? `${interval.interrupted ? 'Interrupted' : 'Completed'} interval. Requested: ${formatCivil(interval.requested_until)}. Resolved: ${formatCivil(interval.resolved_until)}.${interval.interrupted ? ' Attention: ' + (milestones.join(', ') || 'Journey arrival or continuity change') + '.' : ''} Remaining exact minutes: ${interval.requested_until - interval.resolved_until}. Review a new request before continuing.` : 'No time interval recorded.';
        const status = actors[policy.protagonistId].status.kind;
        return worldPage(snapshot, [{ id: 'orientation', label: identity.name, kind: 'Current orientation', text: [base ? `Current base: ${base.name}. Local Era: ${policy.regional.eras.find(e => e.id === base.eraId)?.label ?? base.eraId}.` : '', receipt, status === 'absent' ? 'Absent — return pending. Personal actions are unavailable; public history remains readable.' : '', regional?.journey ? `Journey: ${regional.journey.from} to ${regional.journey.to}. Arrival due: ${formatCivil(regional.journey.arrives)}.` : ''].filter(Boolean).join('\n'), source: status, refs: base ? [{ facet: 'location', value: base.id }] : [] }], null, now);
    }
    if (input.view === 'people' || input.view === 'identity') {
        const ids = input.view === 'identity' ? [policy.protagonistId] : input.id ? [input.id].filter(id => Object.hasOwn(actors, id)) : Object.keys(actors).sort((a, b) => a === policy.protagonistId ? -1 : b === policy.protagonistId ? 1 : a.localeCompare(b, 'en'));
        entries = ids.map(id => {
            const actor = actors[id], view = lifetimeView(snapshot, id);
            const relations = [...Object.values(state.bonds), ...Object.values(state.kinship)].filter(r => r.visibility !== 'secret' && r.refs?.includes('actor:' + id));
            const terms = Object.values(state.terms).filter(r => r.visibility !== 'secret' && r.actorId === id);
            const status = { dead: 'Deceased', retired: 'Retired', missing: 'Missing', absent: 'Absent — return pending', active: 'Active' }[view.status];
            const biography = [`Status: ${status}`, `Chronological age: ${view.chronologicalAge}${view.status === 'dead' ? ' at death' : ''}`, `Apparent age: ${view.apparentAge}`, ...(id === policy.protagonistId ? [`Public identity duration: ${view.publicIdentityAge} years`] : []), `Birth date: ${formatCivil(actor.identity.birthTick)}`, `Introduced: ${formatCivil(actor.identity.introducedTick)}; ${actor.identity.origin.cause}`, `Occupation: ${view.occupation || 'Not recorded'}`, `Institution: ${view.institutionId || 'Not recorded'}`, `Longevity route: ${policy.routes.find(r => r.id === view.routeId)?.label ?? 'None recorded'}`];
            if (id === policy.protagonistId) {
                const c = state.continuity;
                biography.push(`Known Claim burden: ${c.claimBurden}; documentary exposure: ${c.exposure}; embodied scars: ${c.scars}.`, c.returnAt === null ? `Reconstructed returns: ${c.returns}.` : `Return due: ${formatCivil(c.returnAt)}.`);
                if (policy.enterprise) biography.push('Current public identity: ' + describe(enterpriseView(snapshot).identity), 'Known title, bank and role dependencies: ' + describe({ bankAccessible: enterpriseView(snapshot).bankAccessible, holdings: enterpriseView(snapshot).assets, roles: enterpriseView(snapshot).roles }));
            }
            const lineage = relations.slice(0, 8).map(r => r.childId ? `${r.kind === 'biological' ? 'Birth lineage' : 'Adoption'}: ${r.parents.map(name).join(' and ')} → ${name(r.childId)}; ${formatCivil(r.tick ?? actors[r.childId].identity.birthTick)}` : `${r.kind}: ${r.people.map(name).join(' and ')}; ${r.state}; since ${formatCivil(r.from)}`);
            const tenures = terms.slice(-8).map(t => `${state.offices[t.officeId]?.title ?? t.officeId}: ${formatCivil(t.from)} to ${t.to === null ? 'present' : formatCivil(t.to)}. ${t.reason || 'Current tenure'}. Current holder: ${name(state.offices[t.officeId]?.holderId || 'Vacant')}.`);
            return { id, label: id === policy.protagonistId && policy.enterprise ? enterpriseView(snapshot).identity.name : view.name, text: biography.join('\n') + '\n\n' + (lineage.length ? 'Known family and relationships:\n' + lineage.join('\n') + `\nShowing ${lineage.length} of ${relations.length} known links. Browse this person’s historical sources for earlier links.` : 'No family relationships recorded. Your life can continue without founding a family.') + '\n\nOffice history:\n' + (tenures.join('\n') || 'No office terms recorded.'), source: 'Native public person record; actor:' + id, kind: id === policy.protagonistId ? 'Continuous protagonist' : 'Person', refs: [{ facet: 'actor', value: id }] };
        });
        return pageWorldEntries(snapshot, entries, input, signature, offset, now);
    }
    if (input.view === 'institutions' || input.view === 'places') {
        const facet = input.view === 'places' ? 'location' : 'institution';
        entries = Object.values(input.view === 'places' ? state.renewal?.places ?? {} : state.institutions).filter(e => e.visibility !== 'secret').map(e => ({ id: e.id, label: e.name ?? e.id, kind: input.view === 'places' ? 'Place' : 'Institution', text: describe({ ...e, founded: formatCivil(e.founded), ...(Number.isSafeInteger(e.changed) ? { changed: formatCivil(e.changed) } : {}), ...(Number.isSafeInteger(e.ended) ? { ended: formatCivil(e.ended) } : {}) }), source: 'Public entity record. Browse historical sources for previous names and uses; closed entities require Native eligibility review.', refs: [{ facet, value: e.id }, ...(e.predecessors ?? []).map(value => ({ facet, value })), ...(e.successors ?? []).map(value => ({ facet, value }))] }));
        return pageWorldEntries(snapshot, entries, input, signature, offset, now);
    }
    if (input.view === 'delegation') {
        const view = enterpriseView(snapshot);
        entries = [...view.contracts.map(x => ({ ...x, name: label(x.domain) + ': ' + name(x.agentId), nextReview: formatCivil(x.nextReview), report: x.report ? { ...x.report, tick: formatCivil(x.report.tick) } : 'No recent report; this does not establish success.', kind: 'Delegated responsibility' })), ...view.organizations.map(x => ({ ...x, name: state.institutions[x.id]?.name ?? x.id, leader: name(x.leaderId || 'Vacant'), kind: 'Organization' })), ...view.assets.map(x => ({ ...x, name: state.renewal.places[x.placeId]?.name ?? x.id, since: formatCivil(x.since), kind: 'Holding' })), ...view.roles.map(x => ({ ...x, name: label(x.roleId), kind: 'Active role' }))];
    } else if (input.view === 'regions') {
        const view = regionalView(snapshot);
        entries = view.regions.map(r => ({ ...r, tier: r.tier === 'cold' ? 'Distant record; summaries may lag local events' : 'Connected public reports', materializedAt: Number.isSafeInteger(r.materializedAt) ? formatCivil(r.materializedAt) : 'Detailed local records not yet inspected', kind: r.id === view.currentRegionId ? 'Current base' : r.tier === 'cold' ? 'Distant record' : 'Connected region', era: policy.regional.eras.find(e => e.id === r.eraId)?.label ?? r.eraId, journey: view.journey, alerts: view.alerts }));
    } else throw new TypeError('Unknown public world view');
    if (input.id) entries = entries.filter(e => e.id === input.id);
    entries = entries.map(e => ({ id: e.id, label: e.name ?? e.id, kind: e.kind, text: describe(e), source: 'Native disclosed ' + input.view + ' view; bounded current reports, not concealed runtime truth.', refs: input.view === 'regions' ? [{ facet: 'location', value: e.id }] : [{ facet: 'actor', value: policy.protagonistId }] }));
    return pageWorldEntries(snapshot, entries, input, signature, offset, now);
}
function pageWorldEntries(snapshot, entries, input, signature, offset, now) {
    if (input.id) entries = entries.filter(e => e.id === input.id);
    const rows = []; let bytes = 0;
    for (const row of entries.slice(offset, offset + 12)) {
        const size = new TextEncoder().encode(JSON.stringify(row)).length;
        if (bytes + size > 10000) { if (!rows.length) throw new TypeError('Public detail exceeds bounded view; select historical sources'); break; }
        bytes += size; rows.push(row);
    }
    return worldPage(snapshot, rows, offset + rows.length < entries.length ? { revision: snapshot.revision.revisionId, signature, offset: offset + rows.length } : null, now);
}

function worldPage(snapshot, rows, next, now) {
    return { revision: snapshot.revision.revisionId, next: next ? JSON.stringify(next) : '', rows: rows.map(r => ({ ...r, date: formatCivil(now), custody: 'Current public projection. Historical sources remain in Chronicle.', marked: false, journaled: false, clarity: 'clear', refCount: r.refs.length })) };
}
