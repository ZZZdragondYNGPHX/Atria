import { historyPolicy } from './native-history-contract.js';
import { fields } from './native-values.js';

export function initialHistory() {
    return { schemaVersion: 1, turns: 0, transactions: 0, nextId: 1, hot: [], warm: [], cold: [], archive: [], facts: {}, heads: {}, artifacts: {}, hooks: {}, memory: {}, anchors: {}, index: {}, positions: {}, yearRanges: [], compacted: 0, checkpoint: 0, checkpointRequested: false, retired: '', retiredCount: 0 };
}
export function historyItems(h) {
    return [...new Map([...Object.values(h.anchors), ...h.archive, ...h.cold, ...h.warm, ...h.hot,
        ...Object.values(h.facts), ...Object.values(h.artifacts), ...Object.values(h.hooks)].map(item => [item.id, item])).values()]
        .sort((a, b) => Number(a.id.slice(8)) - Number(b.id.slice(8)));
}
export function historyIndex(h) {
    const index = {}; h.positions = {};
    h.yearRanges = h.archive.filter(item => item.fromYear !== item.year).map(item => ({ from: item.fromYear, to: item.year, id: item.id }));
    for (const tier of ['hot', 'warm', 'cold', 'archive']) h[tier].forEach((item, at) => { h.positions[item.id] = { tier, at }; });
    for (const item of historyItems(h)) {
        for (const key of new Set(['kind:' + item.kind, 'year:' + item.year, ...(item.refs ?? [])])) (index[key] ??= []).push(item.id);
    }
    return index;
}
function lookup(h, id) {
    const position = h.positions[id];
    return h.facts[id] ?? h.artifacts[id] ?? h.hooks[id] ?? (position ? h[position.tier][position.at] : h.anchors[id]);
}
export function queryHistory(snapshot, query = {}) {
    fields(query, ['kind', 'facet', 'value', 'id', 'limit', 'cursor', 'memory', 'key', 'tick', 'clockId'], 'Chronicle query');
    const h = snapshot.states.atri_lifecycle?.history;
    if (!historyPolicy(snapshot) || !h) throw new TypeError('History is not declared');
    const limit = query.limit ?? 12;
    if (!Number.isInteger(limit) || limit < 1 || limit > 32 || (query.kind !== undefined && !['event', 'summary', 'fact', 'artifact', 'hook'].includes(query.kind))) throw new TypeError('Chronicle bound');
    if (query.memory !== undefined && typeof query.memory !== 'boolean') throw new TypeError('Chronicle memory mode');
    const facets = ['year', 'actor', 'family', 'location', 'institution', 'case', 'claim', 'era', 'artifact'];
    if (query.facet !== undefined && (!facets.includes(query.facet) || !['string', 'number'].includes(typeof query.value))) throw new TypeError('Chronicle facet');
    if (query.value !== undefined && query.facet === undefined) throw new TypeError('Chronicle facet required');
    if (query.id !== undefined && (typeof query.id !== 'string' || query.id.length > 128)) throw new TypeError('Chronicle id');
    if (query.key !== undefined) return queryFactAt(snapshot, query);
    if (query.tick !== undefined || query.clockId !== undefined) throw new TypeError('A temporal fact query requires its Domain key');
    const signature = JSON.stringify({ id: query.id, kind: query.kind, facet: query.facet, value: query.value, limit, memory: query.memory ?? false });
    let offset = 0;
    if (query.cursor !== undefined) {
        fields(query.cursor, ['revisionId', 'signature', 'offset'], 'Chronicle cursor');
        if (query.cursor.revisionId !== snapshot.revision.revisionId || query.cursor.signature !== signature || !Number.isSafeInteger(query.cursor.offset) || query.cursor.offset < 0) throw new TypeError('Stale Chronicle cursor');
        offset = query.cursor.offset;
    }
    let ids = query.id ? [query.id] : query.facet ? h.index[query.facet + ':' + query.value] ?? [] : query.kind ? h.index['kind:' + query.kind] ?? [] : h.hot.map(e => e.id);
    let indexScanned = 0;
    if (query.id && query.facet) throw new TypeError('Choose identity or facet');
    if (query.facet === 'year') {
        const year = Number(query.value); if (!Number.isSafeInteger(year) || year < 1) throw new TypeError('Chronicle year');
        indexScanned = h.yearRanges.length;
        ids = [...new Set([...ids, ...h.yearRanges.filter(r => r.from <= year && year <= r.to).map(r => r.id)])];
    }
    const items = []; let scanned = 0, characters = 0;
    // A page walks at most 128 postings, never a broad archive. Continue via cursor.
    while (offset < ids.length && scanned < 128 && items.length < limit) {
        const item = lookup(h, ids[offset++]); scanned++;
        if (!item || !item.public || (query.kind && item.kind !== query.kind)) continue;
        const result = structuredClone(item);
        if (result.provenance && Array.isArray(result.provenance)) { result.provenanceCount = result.provenance.length; result.provenance = result.provenance.slice(-8); }
        if (result.transitions) { result.transitionCount = result.transitions.length; result.transitions = result.transitions.slice(-8); }
        if (item.kind === 'fact') result.current = h.heads[item.key] === item.id;
        if (query.memory) {
            const memory = h.memory[item.id];
            const tick = snapshot.states.atri_lifecycle.clocks[historyPolicy(snapshot).clockId];
            result.memory = { marked: memory?.marked ?? false, journaled: memory?.journaled ?? false,
                clarity: memory?.marked || memory?.journaled || item.kind !== 'event' || tick - item.tick < 20 * 365 * 1440 ? 'clear' : 'faded' };
        }
        const size = JSON.stringify(result).length;
        if (characters + size > 12000) { offset--; break; }
        characters += size; items.push(result);
    }
    return { schemaVersion: 1, anchor: { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId },
        items, scanned, indexScanned, next: offset < ids.length ? { revisionId: snapshot.revision.revisionId, signature, offset } : null };
}

// Follow the original domain-owned previous-value chain in bounded pages. No
// replay, current-value inference or new history store is involved.
function queryFactAt(snapshot, query) {
    if (typeof query.key !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(query.key)
        || ['id', 'facet', 'value', 'memory'].some(key => query[key] !== undefined)
        || (query.kind !== undefined && query.kind !== 'fact')) throw new TypeError('Invalid fact query');
    const policy = historyPolicy(snapshot), h = snapshot.states.atri_lifecycle.history;
    const clockId = policy.clockId, now = snapshot.states.atri_lifecycle.clocks[clockId];
    const tick = query.tick ?? now;
    if (query.clockId !== undefined && query.clockId !== clockId) throw new TypeError('Fact query Clock mismatch');
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > now) throw new TypeError('Fact query Tick unavailable');
    const signature = JSON.stringify({ key: query.key, tick, clockId });
    let id = h.heads[query.key] ?? '';
    if (query.cursor !== undefined) {
        fields(query.cursor, ['revisionId', 'signature', 'factId'], 'Fact cursor');
        if (query.cursor.revisionId !== snapshot.revision.revisionId || query.cursor.signature !== signature
            || typeof query.cursor.factId !== 'string' || !/^history\.[1-9][0-9]*$/.test(query.cursor.factId)) throw new TypeError('Stale Fact cursor');
        id = query.cursor.factId;
    }
    const items = []; let scanned = 0;
    // A private current source never reveals even the existence of older rows.
    if (h.facts[h.heads[query.key]]?.public) while (id && scanned++ < 128) {
        const fact = h.facts[id];
        if (!fact || fact.key !== query.key) throw new TypeError('Fact history unavailable');
        if (fact.tick <= tick) {
            if (fact.public) items.push({ ...structuredClone(fact), current: h.heads[query.key] === fact.id,
                validFrom: fact.tick, ...(Object.hasOwn(fact, 'validUntil') ? { validUntil: fact.validUntil } : {}) });
            id = ''; break;
        }
        id = fact.previousId;
    } else id = '';
    return { schemaVersion: 1, anchor: { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId },
        clockId, tick, items, scanned: Math.min(scanned, 128), indexScanned: 0,
        next: id ? { revisionId: snapshot.revision.revisionId, signature, factId: id } : null };
}
export function historyMetrics(snapshot) {
    const h = snapshot.states.atri_lifecycle?.history;
    if (!h) throw new TypeError('History is not declared');
    const bytes = x => new TextEncoder().encode(JSON.stringify(x)).length;
    return { turns: h.turns, tiers: { hot: h.hot.length, warm: h.warm.length, cold: h.cold.length, archive: h.archive.length },
        durable: Object.keys(h.facts).length + Object.keys(h.artifacts).length + Object.keys(h.hooks).length + Object.keys(h.anchors).length,
        rawHistoryBytes: bytes(h.hot), historyBytes: bytes(h), stateBytes: bytes(snapshot.states), timelineItems: snapshot.timeline.length,
        projectionBytes: bytes(queryHistory(snapshot)), compacted: h.compacted, checkpoint: h.checkpoint, retiredInvocations: h.retiredCount };
}
