import { createGameLogicRuntime } from '../logic/runtime.js';
import { createReducerRegistry } from '../logic/reducers.js';
import { loadGameWorldDefinition } from './package.js';
import { assertValidWorldState } from './schema.js';

export const GAME_RUNTIME_STATE_NAMESPACE = 'atri_game_runtime';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function normalizeRuntimeState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const events = Array.isArray(source.events)
        ? source.events.filter(event => event && typeof event === 'object').map(clone)
        : [];
    const maxSeq = events.reduce((max, event) => Math.max(max, Number(event.seq) || 0), 0);
    return {
        schemaVersion: 1,
        nextEventSeq: Math.max(maxSeq + 1, Number.isInteger(source.nextEventSeq) ? source.nextEventSeq : 1),
        events,
    };
}

function eventState(nativeRuntime) {
    return normalizeRuntimeState(nativeRuntime.snapshot?.states?.[GAME_RUNTIME_STATE_NAMESPACE]);
}

function nativeIdentity(nativeRuntime) {
    const snapshot = nativeRuntime.snapshot;
    if (!snapshot?.session?.sessionId || !snapshot?.revision?.revisionId || !snapshot?.revision?.branchId) {
        throw new Error('Native Game World requires current Session/Branch/Revision identity');
    }
    return {
        sessionId: snapshot.session.sessionId,
        branchId: snapshot.revision.branchId,
        revisionId: snapshot.revision.revisionId,
    };
}

function currentWorldState(nativeRuntime, definition) {
    const root = nativeRuntime.snapshot?.states?.atri_world_state;
    if (!root) throw new Error('Native Game World state is unavailable');
    if (definition.worldId === null) return clone(root.initialState ?? {});
    const slot = root.worlds?.[definition.worldId];
    if (!slot || slot.worldRevisionId !== definition.worldRevisionId) {
        throw new Error('Native Game World revision changed unexpectedly');
    }
    return clone(slot.state);
}

function nextWorldRoot(nativeRuntime, definition, nextState) {
    const root = clone(nativeRuntime.snapshot.states.atri_world_state);
    if (definition.worldId === null) {
        root.initialState = clone(nextState);
    } else {
        root.worlds[definition.worldId] = {
            ...root.worlds[definition.worldId],
            state: clone(nextState),
        };
    }
    return root;
}

export async function createGameWorldSession(options = {}) {
    const packageState = options.packageState;
    const nativeRuntime = options.nativeRuntime;
    if (!nativeRuntime?.active || !nativeRuntime.snapshot || typeof nativeRuntime.commitStatePatch !== 'function') {
        throw new Error('Game World session requires the active Native Session Runtime');
    }

    const definition = loadGameWorldDefinition(packageState, { nativeRuntime });
    const reducerRegistry = options.reducerRegistry || createReducerRegistry(options.reducers || {});
    if (!reducerRegistry || typeof reducerRegistry.toMap !== 'function' || typeof reducerRegistry.list !== 'function') {
        throw new Error('Game World session requires a Reducer Registry');
    }
    const reducers = reducerRegistry.toMap();

    function getState() {
        const state = currentWorldState(nativeRuntime, definition);
        assertValidWorldState(state, definition.schema);
        return state;
    }

    function getJournal() {
        const state = eventState(nativeRuntime);
        const identity = nativeIdentity(nativeRuntime);
        return {
            version: 1,
            nextSeq: state.nextEventSeq,
            events: clone(state.events),
            branchId: identity.branchId,
            revisionId: identity.revisionId,
        };
    }

    function projectEvents(drafts) {
        const identity = nativeIdentity(nativeRuntime);
        const runtimeState = eventState(nativeRuntime);
        let state = getState();
        const committed = [];
        for (const draft of Array.isArray(drafts) ? drafts : []) {
            const type = String(draft?.type || '').trim();
            if (!type) throw new Error('World Event type must be a non-empty string');
            const reducer = reducers.get(type);
            if (typeof reducer !== 'function') {
                throw new Error("No World reducer registered for event type '" + type + "'");
            }
            const seq = runtimeState.nextEventSeq++;
            const event = {
                id: 'event:' + identity.branchId + ':' + seq,
                seq,
                type,
                payload: clone(draft?.payload ?? {}),
                ...(draft?.meta && typeof draft.meta === 'object' && !Array.isArray(draft.meta)
                    ? { meta: clone(draft.meta) }
                    : {}),
                branchId: identity.branchId,
            };
            const next = reducer(deepFreeze(clone(state)), clone(event));
            if (!next || typeof next !== 'object' || Array.isArray(next)) {
                throw new Error("World reducer '" + type + "' must return an object state");
            }
            assertValidWorldState(next, definition.schema);
            state = clone(next);
            committed.push(event);
            runtimeState.events.push(clone(event));
        }
        return { identity, state, committed, runtimeState };
    }

    function simulateEvents(eventDrafts) {
        const projected = projectEvents(eventDrafts);
        return {
            state: clone(projected.state),
            events: clone(projected.committed),
            committed: clone(projected.committed),
            branchId: projected.identity.branchId,
            revisionId: projected.identity.revisionId,
        };
    }

    async function commitEvents(eventDrafts) {
        const projected = projectEvents(eventDrafts);
        if (projected.committed.length === 0) {
            return {
                state: clone(projected.state),
                committed: [],
                branchId: projected.identity.branchId,
                revisionId: projected.identity.revisionId,
            };
        }

        const next = await nativeRuntime.commitStatePatch({
            atri_world_state: nextWorldRoot(nativeRuntime, definition, projected.state),
            [GAME_RUNTIME_STATE_NAMESPACE]: projected.runtimeState,
        });
        return {
            state: getState(),
            committed: clone(projected.committed),
            branchId: next.revision.branchId,
            revisionId: next.revision.revisionId,
        };
    }

    const logicRuntime = createGameLogicRuntime({
        commands: options.commands || [],
        rules: options.rules || [],
        ruleLimits: options.ruleLimits,
        rngSeed: options.rngSeed ?? (
            packageState?.descriptor?.packageVersionId
                ? packageState.descriptor.packageVersionId + ':' + packageState.descriptor.entryPointId
                : undefined
        ),
        world: {
            getState,
            getJournal,
            getSnapshot() {
                const identity = nativeIdentity(nativeRuntime);
                return {
                    state: getState(),
                    branchId: identity.branchId,
                    revisionId: identity.revisionId,
                };
            },
            commitEvents,
            simulateEvents,
        },
    });

    return Object.freeze({
        definition: Object.freeze(clone(definition)),

        async syncBranch() {
            return {
                ...nativeIdentity(nativeRuntime),
                state: getState(),
            };
        },

        getState,
        getJournal,

        getSessionId() {
            return nativeIdentity(nativeRuntime).sessionId;
        },

        getBranchId() {
            return nativeIdentity(nativeRuntime).branchId;
        },

        getRevisionId() {
            return nativeIdentity(nativeRuntime).revisionId;
        },

        getCommands() {
            return logicRuntime.listCommands();
        },

        getEventTypes() {
            return reducerRegistry.list();
        },

        getRules() {
            return logicRuntime.listRules();
        },

        getInterpretationMappings() {
            return [...(options.interpretations || [])];
        },

        validateCommand(commandId, args) {
            return logicRuntime.validateCommand(commandId, args);
        },

        dispatchCommandInternal(commandId, args) {
            return logicRuntime.dispatch(commandId, args);
        },

        simulateCommandInternal(commandId, args) {
            return logicRuntime.simulate(commandId, args);
        },

        commitEventsInternal(eventDrafts) {
            return commitEvents(eventDrafts);
        },
    });
}
