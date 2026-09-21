import { createGameLogicRuntime } from '../logic/runtime.js';
import { createReducerRegistry } from '../logic/reducers.js';
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

    const reducerRegistry = options.reducerRegistry || createReducerRegistry(options.reducers || {});
    if (!reducerRegistry || typeof reducerRegistry.toMap !== 'function' || typeof reducerRegistry.list !== 'function') {
        throw new Error('Game World session requires a Reducer Registry');
    }

    const runtime = createWorldRuntime({
        initialState: definition.initialState,
        schema: definition.schema,
        reducers: reducerRegistry.toMap(),
        persistence: options.persistence || createChatStateWorldPersistence(context),
        snapshotEvery: options.snapshotEvery,
        maxSnapshots: options.maxSnapshots,
    });

    await runtime.load(buildGameBranchPath(getChat()));

    const logicRuntime = createGameLogicRuntime({
        commands: options.commands || [],
        rules: options.rules || [],
        ruleLimits: options.ruleLimits,
        rngSeed: options.rngSeed ?? (
            packageState?.manifest?.id
                ? packageState.manifest.id + '@' + String(packageState.manifest.version || '0')
                : undefined
        ),
        world: {
            getState: () => runtime.getState(),
            getJournal: () => runtime.getJournal(),
            getSnapshot: () => runtime.getSnapshot(),
            commitEvents: eventDrafts => runtime.commitEvents(eventDrafts, {
                branchPath: buildGameBranchPath(getChat()),
            }),
            simulateEvents: eventDrafts => runtime.simulateEvents(eventDrafts, {
                branchPath: buildGameBranchPath(getChat()),
            }),
        },
    });

    async function syncRuntimeBranch() {
        return runtime.switchBranch(buildGameBranchPath(getChat()));
    }

    return Object.freeze({
        definition: Object.freeze(structuredClone(definition)),

        async syncBranch() {
            return syncRuntimeBranch();
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

        getCommands() {
            return logicRuntime.listCommands();
        },

        getEventTypes() {
            return reducerRegistry.list();
        },

        getRules() {
            return logicRuntime.listRules();
        },

        validateCommand(commandId, args) {
            return logicRuntime.validateCommand(commandId, args);
        },

        async dispatchCommandInternal(commandId, args) {
            await syncRuntimeBranch();
            return logicRuntime.dispatch(commandId, args);
        },

        async simulateCommandInternal(commandId, args) {
            await syncRuntimeBranch();
            return logicRuntime.simulate(commandId, args);
        },

        async commitEventsInternal(eventDrafts) {
            return runtime.commitEvents(eventDrafts, {
                branchPath: buildGameBranchPath(getChat()),
            });
        },
    });
}
