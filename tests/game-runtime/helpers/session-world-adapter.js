import { assertValidWorldState } from '../../../public/scripts/extensions/game-runtime/world/schema.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function reducersMap(value) {
    return value instanceof Map ? new Map(value) : new Map(Object.entries(value || {}));
}

/**
 * Tests-only Session-style World adapter.
 *
 * It deliberately has no swipe/floor/branch-path model. Tests that exercise
 * Game Logic need only the current Native Branch/Revision identity plus
 * atomic event projection/commit behavior.
 */
export function createSessionWorldTestAdapter(options = {}) {
    const initialState = clone(options.initialState ?? {});
    const schema = clone(options.schema ?? { type: 'object' });
    const reducers = reducersMap(options.reducers);
    const persistence = options.persistence;
    if (!persistence || typeof persistence.read !== 'function' || typeof persistence.update !== 'function') {
        throw new Error('Session World test adapter requires persistence.read/update');
    }

    assertValidWorldState(initialState, schema);

    let state = clone(initialState);
    let journal = { version: 1, nextSeq: 1, events: [] };
    let revision = 1;
    const branchId = String(options.branchId || 'branch_test');

    function normalizedJournal(value) {
        const source = value && typeof value === 'object' ? value : {};
        const events = Array.isArray(source.events) ? clone(source.events) : [];
        const maxSeq = events.reduce((max, event) => Math.max(max, Number(event?.seq) || 0), 0);
        return {
            version: 1,
            nextSeq: Math.max(maxSeq + 1, Number.isInteger(source.nextSeq) ? source.nextSeq : 1),
            events,
        };
    }

    async function load() {
        const raw = await persistence.read();
        if (raw && typeof raw === 'object') {
            state = clone(raw.state ?? initialState);
            journal = normalizedJournal(raw.journal);
        } else {
            state = clone(initialState);
            journal = normalizedJournal(null);
        }
        assertValidWorldState(state, schema);
        return getSnapshot();
    }

    function project(drafts) {
        const nextJournal = normalizedJournal(journal);
        let nextState = clone(state);
        const committed = [];
        for (const draft of Array.isArray(drafts) ? drafts : []) {
            const type = String(draft?.type || '').trim();
            const reducer = reducers.get(type);
            if (!type || typeof reducer !== 'function') {
                throw new Error(`No World reducer registered for event type '${type}'`);
            }
            const seq = nextJournal.nextSeq++;
            const event = {
                id: `event:${branchId}:${seq}`,
                seq,
                type,
                payload: clone(draft?.payload ?? {}),
                ...(draft?.meta && typeof draft.meta === 'object' ? { meta: clone(draft.meta) } : {}),
                branchId,
            };
            const projected = reducer(clone(nextState), clone(event));
            assertValidWorldState(projected, schema);
            nextState = clone(projected);
            nextJournal.events.push(clone(event));
            committed.push(event);
        }
        return { state: nextState, journal: nextJournal, committed };
    }

    function simulateEvents(drafts) {
        const projected = project(drafts);
        return {
            state: clone(projected.state),
            events: clone(projected.committed),
            committed: clone(projected.committed),
            branchId,
            revisionId: `revision_test_${revision}`,
        };
    }

    async function commitEvents(drafts) {
        const projected = project(drafts);
        if (projected.committed.length === 0) {
            return {
                state: clone(state),
                events: [],
                committed: [],
                branchId,
                revisionId: `revision_test_${revision}`,
            };
        }
        await persistence.update(() => ({
            schemaVersion: 1,
            state: clone(projected.state),
            journal: clone(projected.journal),
        }));
        state = clone(projected.state);
        journal = normalizedJournal(projected.journal);
        revision += 1;
        return {
            state: clone(state),
            events: clone(projected.committed),
            committed: clone(projected.committed),
            branchId,
            revisionId: `revision_test_${revision}`,
        };
    }

    function getState() {
        return clone(state);
    }

    function getJournal() {
        return clone(journal);
    }

    function getSnapshot() {
        return {
            state: getState(),
            journal: getJournal(),
            branchId,
            revisionId: `revision_test_${revision}`,
        };
    }

    return Object.freeze({
        load,
        getState,
        getJournal,
        getSnapshot,
        simulateEvents,
        commitEvents,
    });
}
