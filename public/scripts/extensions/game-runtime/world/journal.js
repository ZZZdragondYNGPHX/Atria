import {
    getGameBranchId,
    isGameBranchPathCompatible,
    normalizeGameBranchPath,
} from './branch.js';

export const WORLD_JOURNAL_VERSION = 1;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) {
        deepFreeze(child, seen);
    }
    return value;
}

function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const seq = Number(raw.seq);
    const type = String(raw.type || '').trim();
    const id = String(raw.id || '').trim();
    if (!Number.isInteger(seq) || seq < 1 || !type || !id) return null;

    let branchPath;
    try {
        branchPath = normalizeGameBranchPath(raw.branchPath);
    } catch {
        return null;
    }

    return {
        id,
        seq,
        type,
        payload: clone(raw.payload ?? {}),
        branchPath,
        branchId: getGameBranchId(branchPath),
    };
}

function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const seq = Number(raw.seq);
    if (!Number.isInteger(seq) || seq < 0 || !raw.state || typeof raw.state !== 'object') return null;

    let branchPath;
    try {
        branchPath = normalizeGameBranchPath(raw.branchPath);
    } catch {
        return null;
    }

    return {
        id: String(raw.id || ('snapshot:' + seq + ':' + getGameBranchId(branchPath))),
        seq,
        branchPath,
        branchId: getGameBranchId(branchPath),
        state: clone(raw.state),
    };
}

export function normalizeWorldJournal(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const events = Array.isArray(input.events)
        ? input.events.map(normalizeEvent).filter(Boolean).sort((a, b) => a.seq - b.seq)
        : [];

    const uniqueEvents = [];
    const seenSeq = new Set();
    const seenId = new Set();
    for (const event of events) {
        if (seenSeq.has(event.seq) || seenId.has(event.id)) continue;
        seenSeq.add(event.seq);
        seenId.add(event.id);
        uniqueEvents.push(event);
    }

    const maxSeq = uniqueEvents.reduce((max, event) => Math.max(max, event.seq), 0);
    const snapshots = Array.isArray(input.snapshots)
        ? input.snapshots.map(normalizeSnapshot).filter(Boolean).sort((a, b) => a.seq - b.seq)
        : [];

    return {
        version: WORLD_JOURNAL_VERSION,
        nextSeq: Math.max(maxSeq + 1, Number.isInteger(input.nextSeq) ? input.nextSeq : 1),
        events: uniqueEvents,
        snapshots,
    };
}

export function appendWorldEvents(journal, drafts, branchPath) {
    const next = normalizeWorldJournal(journal);
    const path = normalizeGameBranchPath(branchPath);
    const branchId = getGameBranchId(path);
    const committed = [];

    for (const draft of Array.isArray(drafts) ? drafts : []) {
        const type = String(draft?.type || '').trim();
        if (!type) {
            throw new Error('World Event type must be a non-empty string');
        }

        const seq = next.nextSeq++;
        const event = {
            id: 'event:' + seq,
            seq,
            type,
            payload: clone(draft?.payload ?? {}),
            branchPath: [...path],
            branchId,
        };
        next.events.push(event);
        committed.push(clone(event));
    }

    return { journal: next, committed };
}

function chooseSnapshot(journal, branchPath) {
    const compatible = journal.snapshots
        .filter(snapshot => isGameBranchPathCompatible(snapshot.branchPath, branchPath))
        .sort((a, b) => b.seq - a.seq);
    return compatible[0] || null;
}

export function replayWorldJournal(options) {
    const journal = normalizeWorldJournal(options?.journal);
    const branchPath = normalizeGameBranchPath(options?.branchPath);
    const reducers = options?.reducers instanceof Map
        ? options.reducers
        : new Map(Object.entries(options?.reducers || {}));
    const snapshot = chooseSnapshot(journal, branchPath);

    let state = clone(snapshot?.state ?? options?.initialState ?? {});
    const fromSeq = snapshot?.seq ?? 0;
    const appliedEventIds = [];

    for (const event of journal.events) {
        if (event.seq <= fromSeq) continue;
        if (!isGameBranchPathCompatible(event.branchPath, branchPath)) continue;

        const reducer = reducers.get(event.type);
        if (typeof reducer !== 'function') {
            throw new Error('No World reducer registered for event type \'\'' + event.type + '\'\'');
        }

        const input = deepFreeze(clone(state));
        const next = reducer(input, clone(event));
        if (!next || typeof next !== 'object') {
            throw new Error('World reducer \'\'' + event.type + '\' must return an object state');
        }
        state = clone(next);
        appliedEventIds.push(event.id);
    }

    return {
        state,
        appliedEventIds,
        snapshot: snapshot ? clone(snapshot) : null,
        branchPath,
        branchId: getGameBranchId(branchPath),
        lastSeq: journal.events.reduce((max, event) => Math.max(max, event.seq), fromSeq),
    };
}

export function addWorldSnapshot(journal, options) {
    const next = normalizeWorldJournal(journal);
    const branchPath = normalizeGameBranchPath(options?.branchPath);
    const seq = Number(options?.seq);
    if (!Number.isInteger(seq) || seq < 0) {
        throw new Error('World snapshot seq must be a non-negative integer');
    }

    const snapshot = {
        id: 'snapshot:' + seq + ':' + getGameBranchId(branchPath),
        seq,
        branchPath,
        branchId: getGameBranchId(branchPath),
        state: clone(options?.state ?? {}),
    };

    next.snapshots = next.snapshots.filter(existing => existing.id !== snapshot.id);
    next.snapshots.push(snapshot);
    next.snapshots.sort((a, b) => a.seq - b.seq);

    const maxSnapshots = Number.isInteger(options?.maxSnapshots) && options.maxSnapshots > 0
        ? options.maxSnapshots
        : 24;
    if (next.snapshots.length > maxSnapshots) {
        next.snapshots = next.snapshots.slice(-maxSnapshots);
    }

    return { journal: next, snapshot: clone(snapshot) };
}
