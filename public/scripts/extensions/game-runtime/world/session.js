import { buildGameBranchPath } from './branch.js';
import { loadGameWorldDefinition } from './package.js';
import { createChatStateWorldPersistence } from './persistence.js';
import { createWorldRuntime } from './runtime.js';

export async function createGameWorldSession(options = {}) {
    const packageState = options.packageState;
    const context = options.context;
    const getChat = typeof options.getChat === 'function'
        ? options.getChat
        : () => context?.chat || [];

    const definition = await loadGameWorldDefinition(packageState, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    if (!definition) {
        return null;
    }

    const runtime = createWorldRuntime({
        initialState: definition.initialState,
        schema: definition.schema,
        reducers: options.reducers || {},
        persistence: options.persistence || createChatStateWorldPersistence(context),
        snapshotEvery: options.snapshotEvery,
        maxSnapshots: options.maxSnapshots,
    });

    await runtime.load(buildGameBranchPath(getChat()));

    return Object.freeze({
        definition: Object.freeze(structuredClone(definition)),

        async syncBranch() {
            return runtime.switchBranch(buildGameBranchPath(getChat()));
        },

        getState() {
            return runtime.getState();
        },

        getJournal() {
            return runtime.getJournal();
        },

        getBranchPath() {
            return [...runtime.getSnapshot().branchPath];
        },

        async commitEventsInternal(eventDrafts) {
            return runtime.commitEvents(eventDrafts, {
                branchPath: buildGameBranchPath(getChat()),
            });
        },
    });
}
