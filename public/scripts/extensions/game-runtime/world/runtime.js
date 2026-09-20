import { normalizeGameBranchPath } from './branch.js';
import {
    addWorldSnapshot,
    appendWorldEvents,
    normalizeWorldJournal,
    replayWorldJournal,
} from './journal.js';
import { assertValidWorldState } from './schema.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function normalizePersistence(persistence) {
    if (!persistence || typeof persistence.read !== 'function' || typeof persistence.update !== 'function') {
        throw new Error('World Runtime requires persistence.read() and persistence.update()');
    }
    return persistence;
}

export function createWorldRuntime(options = {}) {
    const initialState = clone(options.initialState ?? {});
    const schema = clone(options.schema ?? { type: 'object' });
    const reducers = options.reducers instanceof Map
        ? new Map(options.reducers)
        : new Map(Object.entries(options.reducers || {}));
    const persistence = normalizePersistence(options.persistence);
    const snapshotEvery = Number.isInteger(options.snapshotEvery) && options.snapshotEvery > 0
        ? options.snapshotEvery
        : 20;
    const maxSnapshots = Number.isInteger(options.maxSnapshots) && options.maxSnapshots > 0
        ? options.maxSnapshots
        : 24;

    assertValidWorldState(initialState, schema);

    let activeBranchPath = [];
    let currentState = clone(initialState);
    let currentJournal = normalizeWorldJournal(null);

    function replay(journal, branchPath) {
        const projected = replayWorldJournal({
            initialState,
            journal,
            branchPath,
            reducers,
        });
        assertValidWorldState(projected.state, schema);
        return projected;
    }

    async function load(branchPath = []) {
        const path = normalizeGameBranchPath(branchPath);
        const raw = await persistence.read();
        currentJournal = normalizeWorldJournal(raw);
        const projected = replay(currentJournal, path);
        activeBranchPath = path;
        currentState = projected.state;
        return getSnapshot();
    }

    async function switchBranch(branchPath = []) {
        return load(branchPath);
    }

    async function commitEvents(drafts, options = {}) {
        const branchPath = normalizeGameBranchPath(options.branchPath ?? activeBranchPath);
        let committedResult = null;

        const persisted = await persistence.update((raw) => {
            let journal = normalizeWorldJournal(raw);
            const appended = appendWorldEvents(journal, drafts, branchPath);
            journal = appended.journal;

            const projected = replay(journal, branchPath);
            assertValidWorldState(projected.state, schema);

            const lastCommittedSeq = appended.committed.at(-1)?.seq ?? 0;
            if (lastCommittedSeq > 0 && lastCommittedSeq % snapshotEvery === 0) {
                journal = addWorldSnapshot(journal, {
                    state: projected.state,
                    seq: lastCommittedSeq,
                    branchPath,
                    maxSnapshots,
                }).journal;
            }

            committedResult = {
                state: clone(projected.state),
                committed: clone(appended.committed),
                branchPath: [...branchPath],
                journal: clone(journal),
            };
            return journal;
        });

        currentJournal = normalizeWorldJournal(persisted ?? committedResult?.journal);
        const projected = replay(currentJournal, branchPath);
        activeBranchPath = branchPath;
        currentState = projected.state;

        return {
            state: clone(currentState),
            committed: clone(committedResult?.committed ?? []),
            branchPath: [...activeBranchPath],
        };
    }

    function getState() {
        return clone(currentState);
    }

    function getJournal() {
        return clone(currentJournal);
    }

    function getSnapshot() {
        return {
            state: getState(),
            branchPath: [...activeBranchPath],
            journal: getJournal(),
        };
    }

    return Object.freeze({
        load,
        switchBranch,
        commitEvents,
        getState,
        getJournal,
        getSnapshot,
    });
}
