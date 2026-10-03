import { regionalSources } from './regional-authority.js';
import { enterpriseSources } from './enterprise-authority.js';
import { renewalSources } from './renewal-authority.js';
import { lifetimeSources } from '../../public/shared/native-lifetime-runtime.js';
import { createHash } from 'node:crypto';
import { hashNativeDocument } from './repositories/common.js';
import { historyPolicy, HISTORY_OPERATIONS, ARTIFACT_KINDS } from '../../public/shared/native-history-contract.js';
import { initialHistory, historyIndex } from '../../public/shared/native-history-runtime.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { protectedTaskResult, taskResultTombstone } from './lifecycle-authority.js';

const copy = v => structuredClone(v);
const same = (a, b) => a === undefined || b === undefined ? a === b : hashNativeDocument(a) === hashNativeDocument(b);
const record = (snapshot, domain, id = 'main') => snapshot.states.atri_lifecycle.domains[domain]?.records.find(r => r.id === id)?.value;
const sourceValue = (snapshot, source) => Object.hasOwn(source, 'value') ? source.value : source.path.reduce((v, k) => v?.[k], record(snapshot, source.domainId, source.recordId));
export const historySources = snapshot => [...(historyPolicy(snapshot)?.sources ?? []), ...lifetimeSources(snapshot), ...renewalSources(snapshot), ...enterpriseSources(snapshot), ...regionalSources(snapshot)];
const lifetimeMeaning = state => { if (!state) return null; const { work: _work, resolvedTick: _tick, ...value } = state; return value; };
const id = h => 'history.' + h.nextId++;
function anchor(h, event) { h.anchors[event.id] ??= { ...copy(event), tier: 'archive' }; }
function find(h, key) { const position = h.positions[key]; return h.facts[key] ?? h.artifacts[key] ?? h.hooks[key] ?? h.anchors[key] ?? (position && h[position.tier]?.[position.at]); }
function summary(event) {
    return { id: event.id, kind: 'summary', tier: 'cold', tick: event.tick, year: event.year, from: event.from, to: event.tick, fromYear: event.fromYear,
        firstTurn: event.turn, lastTurn: event.turn, count: 1, public: true, refs: event.refs, summary: event.summary, weight: 1 };
}
function merge(h, a, b) {
    return { id: id(h), kind: 'summary', tier: 'archive', tick: b.to, year: b.year, from: a.from, to: b.to, fromYear: a.fromYear,
        firstTurn: a.firstTurn, lastTurn: b.lastTurn, count: a.count + b.count, public: true,
        refs: [...new Set([...a.refs, ...b.refs])].sort(), summary: 'Archived activity interval; precise consequences remain in the canonical ledger.', weight: a.weight + b.weight };
}
export function compactHistory(h, policy, now = 0) {
    while (h.hot.length && (h.hot.length > policy.hot || now - h.hot[0].tick > 7 * 1440)) { const event = h.hot.shift(); h.warm.push({ ...event, tier: 'warm' }); }
    while (h.warm.length && (h.warm.length > policy.warm || now - h.warm[0].tick > 2 * 365 * 1440)) h.cold.push(summary(h.warm.shift()));
    while (h.cold.length && (h.cold.length > policy.cold || now - h.cold[0].tick > 20 * 365 * 1440)) {
        h.archive.push({ ...h.cold.shift(), tier: 'archive' }); h.compacted++;
        while (h.archive.length > 1 && h.archive.at(-1).weight === h.archive.at(-2).weight) {
            const b = h.archive.pop(), a = h.archive.pop(); h.archive.push(merge(h, a, b));
        }
    }
    h.index = historyIndex(h);
}
function operate(snapshot, h, op, args, event) {
    assertTaskValue(args, HISTORY_OPERATIONS[op]);
    const actor = snapshot.manifest.actors[0].actorId;
    const source = args.sourceId ? find(h, args.sourceId) : null;
    if (args.sourceId && !source?.public) throw new TypeError('History evidence unavailable');
    if (op === 'artifact.create') {
        if (!ARTIFACT_KINDS.includes(args.kind) || !args.title.trim() || !args.content.trim()) throw new TypeError('Artifact requires an attributed record');
        const parent = args.parentId ? h.artifacts[args.parentId] : null;
        if (args.parentId && (!parent || ['destroyed', 'lost'].includes(parent.status))) throw new TypeError('Artifact copy source unavailable');
        const key = id(h);
        event.targetId = key; event.status = 'held'; event.refs = [...new Set([...event.refs, ...(source?.refs ?? []), 'artifact:' + key])];
        h.artifacts[key] = { id: key, kind: 'artifact', artifactKind: args.kind, title: args.title, content: args.content,
            // Authorship is authority; the truth of a document's assertions is not.
            public: true, authenticity: parent ? 'copy' : 'authored', status: 'held', tick: event.tick, year: event.year,
            refs: [...new Set([...(source?.refs ?? event.refs), 'artifact:' + key])], sourceId: args.sourceId, parentId: args.parentId,
            creatorId: actor, holderId: actor, origin: event.id, provenance: [{ eventId: event.id, tick: event.tick, status: 'held', holderId: actor }] };
        if (['event', 'summary'].includes(source?.kind)) anchor(h, source);
    } else if (op === 'artifact.change') {
        const artifact = h.artifacts[args.id];
        if (!artifact || artifact.holderId !== actor || artifact.status === 'destroyed' || artifact.status === args.status) throw new TypeError('Artifact transition unavailable');
        event.targetId = artifact.id; event.status = args.status; event.refs = [...new Set([...event.refs, ...artifact.refs])];
        artifact.status = args.status;
        artifact.provenance.push({ eventId: event.id, tick: event.tick, status: args.status, holderId: actor });
    } else if (op === 'hook.create') {
        if (!source || !args.title.trim()) throw new TypeError('Hook requires historical evidence');
        const key = id(h);
        event.targetId = key; event.status = 'dormant'; event.refs = [...new Set([...event.refs, ...source.refs])];
        h.hooks[key] = { id: key, kind: 'hook', title: args.title, sourceId: source.id, status: 'dormant', public: true,
            tick: event.tick, year: event.year, refs: copy(source.refs), origin: event.id, transitions: [] };
        if (['event', 'summary'].includes(source.kind)) anchor(h, source);
    } else if (op === 'hook.change') {
        const hook = h.hooks[args.id];
        if (!hook || !['dormant', 'active'].includes(hook.status) || hook.status === args.status) throw new TypeError('Hook transition unavailable');
        event.targetId = hook.id; event.status = args.status; event.refs = [...new Set([...event.refs, ...hook.refs])];
        hook.status = args.status; hook.transitions.push({ eventId: event.id, tick: event.tick, status: args.status });
    } else if (op === 'memory.mark') {
        const target = find(h, args.id);
        if (!target?.public) throw new TypeError('Memory source unavailable');
        if (same(h.memory[args.id], { marked: args.marked, journaled: args.journaled })) throw new TypeError('Memory no change');
        event.targetId = args.id; event.memory = { marked: args.marked, journaled: args.journaled };
        h.memory[args.id] = { marked: args.marked, journaled: args.journaled };
        if (['event', 'summary'].includes(target.kind)) anchor(h, target);
    } else if (op !== 'compact') throw new TypeError('Unknown history operation');
    if (op !== 'compact') { event.summary += event.status ? ' (' + event.status + ')' : ''; anchor(h, event); }
}
export function prepareHistory(base, candidate, transaction, resolution, operation = null, { countTurn = true } = {}) {
    const policy = historyPolicy(candidate); if (!policy) return;
    const state = candidate.states.atri_lifecycle, h = state.history ??= initialHistory();
    const sources = historySources(candidate);
    const scans = sources.length - policy.sources.length + policy.meaningfulDomains.reduce((n, d) => n + state.domains[d].records.length, 0)
        + policy.sources.reduce((n, source) => n + state.domains[source.domainId].records.length, 0);
    if (scans > 4096) throw new TypeError('History source scan budget');
    if (countTurn) h.transactions++;
    const clock = state.clocks[policy.clockId], previousTick = base.states.atri_lifecycle.clocks[policy.clockId];
    const chronology = record(candidate, policy.chronologyDomain);
    const changed = !same(lifetimeMeaning(base.states.atri_lifecycle.lifetimes), lifetimeMeaning(state.lifetimes)) || clock !== previousTick || policy.meaningfulDomains.some(d => !same(base.states.atri_lifecycle.domains[d]?.records.map(r => r.value), state.domains[d]?.records.map(r => r.value)));
    const meaningful = changed || (operation && operation.operation !== 'compact');
    if (!meaningful && !operation) return;
    const event = { id: id(h), kind: 'event', tier: 'hot', turn: h.turns + Number(Boolean(meaningful && countTurn)), origin: countTurn ? 'player' : 'host',
        tick: clock, from: previousTick, year: chronology.calendar.year, fromYear: record(base, policy.chronologyDomain).calendar.year, sequence: chronology.sequence,
        public: true, transaction: transaction.id, outcome: resolution.outcome, summary: operation ? operation.operation + ': ' + resolution.outcome : clock !== previousTick ? 'Advance canonical time by ' + (clock - previousTick) + ' minutes; resolve due obligations.' : transaction.verb + ': ' + resolution.outcome,
        refs: ['actor:' + candidate.manifest.actors[0].actorId, 'era:' + chronology.era_id] };
    for (const source of sources) {
        const value = sourceValue(candidate, source);
        if (value === undefined || Buffer.byteLength(JSON.stringify(value)) > 8192) throw new TypeError('Missing or oversized canonical source');
        const previous = h.heads[source.id] ? h.facts[h.heads[source.id]] : null;
        if (previous && same(previous.value, value)) continue;
        const factId = id(h);
        h.facts[factId] = { id: factId, kind: 'fact', key: source.id, label: source.label, value: copy(value), public: source.public,
            tick: clock, year: event.year, refs: copy(source.refs), eventId: event.id, previousId: previous?.id ?? '',
            provenance: { sessionId: base.session.sessionId, branchId: base.revision.branchId, sequence: chronology.sequence, source: source.domainId + '.' + source.recordId + '.' + source.path.join('.') } };
        h.heads[source.id] = factId;
        if (source.public) event.refs = [...new Set([...event.refs, ...source.refs])];
        anchor(h, event);
    }
    if (h.anchors[event.id]) h.anchors[event.id] = { ...copy(event), tier: 'archive' };
    for (const legacy of Object.values(state.lifetimes?.legacies ?? {})) {
        if (!legacy.transferEvent || legacy.status !== 'inherited') continue;
        const artifact = h.artifacts[legacy.sourceId];
        if (!artifact || artifact.provenance.some(p => p.lifetimeEvent === legacy.transferEvent)) continue;
        artifact.provenance.push({ eventId: event.id, tick: legacy.tick, status: artifact.status, holderId: legacy.heirId, lifetimeEvent: legacy.transferEvent });
        anchor(h, event);
    }
    for (const matter of Object.values(state.lifetimes?.renewal?.active ?? {})) {
        if (!matter.hookId) continue;
        const hook = h.hooks[matter.hookId];
        if (hook.transitions.some(t => t.matterId === matter.id && t.status === 'active')) continue;
        if (hook.status !== 'dormant') throw new TypeError('Renewal hook activation conflict');
        hook.status = 'active';hook.transitions.push({ eventId: event.id, tick: clock, status: 'active', matterId: matter.id });anchor(h, event);
    }
    for (const matter of Object.values(state.lifetimes?.renewal?.canonical ?? {})) {
        if (!matter.hookTransitions) continue;
        const hook = h.hooks[matter.hookId];
        if (hook.transitions.some(t => t.matterId === matter.id && t.status === 'resolved')) continue;
        if (hook.status !== 'active') throw new TypeError('Renewal hook status conflict');
        for (const status of matter.hookTransitions) hook.transitions.push({ eventId: event.id, tick: clock, status, matterId: matter.id });
        hook.status = 'resolved';anchor(h, event);
    }
    if (state.lifetimes?.renewal?.last && !same(base.states.atri_lifecycle.lifetimes?.renewal?.last, state.lifetimes.renewal.last)) {
        const last = state.lifetimes.renewal.last;
        event.summary = last.operation + ': ' + (last.summary ?? last.action ?? last.outcome ?? last.id);
        event.refs = [...new Set([...event.refs, ...(last.refs ?? [])])];
    }
    if (operation) operate(candidate, h, operation.operation, operation.input, event);
    if (operation?.operation === 'compact') h.checkpointRequested = true;
    if (h.anchors[event.id]) h.anchors[event.id] = { ...copy(event), tier: 'archive' };
    if (meaningful) { if (countTurn) h.turns++; h.hot.push(event); }
    compactHistory(h, policy, clock);
    validateHistory(candidate);
}
export function validateHistory(snapshot) {
    const policy = historyPolicy(snapshot), h = snapshot.states.atri_lifecycle?.history;
    if (!policy) { if (h) throw new TypeError('Undeclared history'); return; }
    if (!h || !Number.isSafeInteger(h.transactions) || h.transactions < h.turns || h.schemaVersion !== 1 || !Number.isSafeInteger(h.turns) || h.turns < 0 || !Number.isSafeInteger(h.nextId) || h.nextId < 1
        || h.hot.length > policy.hot || h.warm.length > policy.warm || h.cold.length > policy.cold || h.archive.length > 54) throw new TypeError('History retention invariant');
    const sources = historySources(snapshot), sourceMap = new Map(sources.map(source => [source.id, source]));
    if (sources.length > 4096) throw new TypeError('History lifecycle source budget');
    const durable = Object.keys(h.facts).length + Object.keys(h.artifacts).length + Object.keys(h.hooks).length + Object.keys(h.anchors).length;
    if (durable > policy.maxDurable || Buffer.byteLength(JSON.stringify(h)) > policy.maxBytes) throw new TypeError('History durable budget; explicit archival policy required');
    for (const source of sources) {
        const fact = h.facts[h.heads[source.id]];
        if (h.turns && (!fact || fact.public !== source.public)) throw new TypeError('Canonical source missing or wrong disclosure');
        if (fact && !same(fact.value, sourceValue(snapshot, source))) throw new TypeError('Canonical fact contradicts authority');
    }
    for (const fact of Object.values(h.facts)) {
        const source = sourceMap.get(fact.key), previous = h.facts[fact.previousId];
        if (!source || fact.public !== source.public || fact.provenance.sessionId !== snapshot.session.sessionId
            || fact.provenance.source !== source.domainId + '.' + source.recordId + '.' + source.path.join('.')
            || !h.anchors[fact.eventId] || (fact.previousId && (!previous || previous.key !== fact.key || previous.tick > fact.tick
                || Number(previous.id.split('.')[1]) >= Number(fact.id.split('.')[1])))) throw new TypeError('Canonical provenance');
    }
    for (const artifact of Object.values(h.artifacts)) {
        if (snapshot.states.atri_lifecycle.lifetimes && artifact.provenance.at(-1)?.holderId !== artifact.holderId) throw new TypeError('Artifact custody contradiction');
        if (!h.anchors[artifact.origin] || (artifact.parentId && !h.artifacts[artifact.parentId]) || artifact.provenance.some((p, i, rows) => !h.anchors[p.eventId] || (i && p.tick < rows[i - 1].tick))) throw new TypeError('Artifact provenance');
    }
    const indexed = copy(h); const expectedIndex = historyIndex(indexed);
    if (!same(h.index, expectedIndex) || !same(h.positions, indexed.positions) || !same(h.yearRanges, indexed.yearRanges)) throw new TypeError('History index mismatch');
    if (h.retired && (!/^[0-9a-f]{65536}$/.test(h.retired))) throw new TypeError('History replay filter');
}
// Bounded fail-closed replay fence. False positives reject; never double-apply.
// Exact recent retries retain their receipts. Archived retries explicitly expire.
function positions(key) {
    const digest = createHash('sha256').update(key).digest();
    return Array.from({ length: 8 }, (_, i) => digest.readUInt32BE(i * 4) % (32768 * 8));
}
export function retiredInvocation(h, key) {
    if (!h?.retired) return false; const bits = Buffer.from(h.retired, 'hex');
    return positions(key).every(p => (bits[p >> 3] & (1 << (p % 8))) !== 0);
}
export function retireInvocation(h, key) {
    const bits = h.retired ? Buffer.from(h.retired, 'hex') : Buffer.alloc(32768);
    for (const p of positions(key)) bits[p >> 3] |= 1 << (p % 8);
    h.retired = bits.toString('hex'); h.retiredCount++;
}
// Portable checkpoints sever only linear ancestry. Branch graphs/save points are
// retained by SaveSystem; never rewrite/delete an existing revision or branch.
export function checkpointHistory(base, states, timeline, taskRecord) {
    const policy = historyPolicy(base), h = states.atri_lifecycle?.history;
    if (!policy || !h || !taskRecord || taskRecord.kind !== 'turn' || (h.transactions - h.checkpoint < policy.checkpointTurns && !h.checkpointRequested)) return null;
    const tasks = states.atri_task_results;
    const candidate = { ...base, states };
    if (tasks?.records.some(r => r.pinned || (r.kind !== 'turn' && protectedTaskResult(candidate, states.atri_lifecycle, r)))) throw new TypeError('History checkpoint has protected Task dependencies');
    const lifecycle = states.atri_lifecycle;
    const retained = (lifecycle.taskTombstones ?? []).filter(r => r.kind !== 'turn').length
        + (tasks?.records.filter(r => r.kind !== 'turn').length ?? 0)
        + (lifecycle.receipts?.length ?? 0) + (lifecycle.activityTombstones?.length ?? 0);
    if (retained > base.manifest.runtime.experienceContract.lifecycleRuntime.retention?.maxReceipts) throw new TypeError('Lifecycle receipt retention limit reached');
    h.checkpoint = h.transactions; h.checkpointRequested = false;
    states.atri_lifecycle.taskTombstones = (states.atri_lifecycle.taskTombstones ?? []).filter(r => {
        if (r.kind !== 'turn') return true;
        retireInvocation(h, r.invocationId); return false;
    });
    if (tasks) tasks.records = tasks.records.filter(r => {
        if (r.kind !== 'turn') {
            states.atri_lifecycle.taskTombstones.push(taskResultTombstone(r));
            return false;
        }
        if (r.status !== 'applied' || r.pinned) return true;
        retireInvocation(h, r.invocationId); return false;
    });
    const receipts = states.atri_action_receipts;
    if (receipts) receipts.receipts = receipts.receipts.filter(r => {
        if (!r.authorityId) return true;
        retireInvocation(h, r.idempotencyKey); return false;
    });
    if (states.atri_game_runtime) states.atri_game_runtime.events = [];
    // Keep the latest approved reply readable, but not its user/pre-action
    // anchor. Retry explicitly expires across this boundary; new turns can retry.
    // Earlier raw dialogue is represented by Chronicle, not replayable transcript.
    return { timeline: timeline.at(-1)?.role === 'assistant' ? [timeline.at(-1)] : [], parentRevisionId: null };
}
