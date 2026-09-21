/**
 * Non-persistent R6 Studio simulation harness.
 *
 * It compiles the same source documents and executes the same R3 simulation
 * path used by Game Runtime, but its persistence adapter is memory-only and
 * records any attempted writes. A valid simulation must finish with zero
 * persistence writes and unchanged authoritative runtime state/journal.
 */

import { compileDeclarativeLogic } from '../../game-runtime/logic/declarative.js';
import { createGameLogicRuntime } from '../../game-runtime/logic/runtime.js';
import { createReducerRegistry } from '../../game-runtime/logic/reducers.js';
import { createCommandToolCatalog } from '../../game-runtime/llm/tools.js';
import { compileGameObservationDefinitions } from '../../game-runtime/llm/declarative-observations.js';
import { createWorldObservationProjector } from '../../game-runtime/llm/observation.js';
import { compileGameSelectorDefinitions } from '../../game-runtime/ui/declarative.js';
import { createSelectorRuntime } from '../../game-runtime/ui/selectors.js';
import { createWorldRuntime } from '../../game-runtime/world/runtime.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createSimulationPersistence() {
    let value = null;
    let writes = 0;
    return Object.freeze({
        async read() {
            return clone(value);
        },
        async update(updater) {
            writes += 1;
            value = clone(await updater(clone(value)));
            return clone(value);
        },
        inspect() {
            return clone(value);
        },
        get writes() {
            return writes;
        },
    });
}

function normalizeProject(project = {}) {
    if (!isPlainObject(project.schema)) throw new Error('Studio simulation requires World Schema');
    if (!isPlainObject(project.initialState)) throw new Error('Studio simulation requires Initial State');
    if (!isPlainObject(project.logic)) throw new Error('Studio simulation requires Game Logic');

    return {
        schema: clone(project.schema),
        initialState: clone(project.initialState),
        logic: clone(project.logic),
        selectors: Array.isArray(project.selectors) ? clone(project.selectors) : [],
        observations: Array.isArray(project.observations) ? clone(project.observations) : [],
        packageId: String(project.packageId || 'studio.preview'),
        packageVersion: String(project.packageVersion || '0.0.0'),
    };
}

function selectorSnapshot(definitions, state) {
    if (!definitions.length) return {};
    const runtime = createSelectorRuntime({
        getWorldState: () => state,
        definitions,
    });
    return runtime.snapshot();
}

function projectObservation(projector, world, events, role, purpose, commandId = '') {
    return projector.project({
        world,
        events,
        context: {
            purpose,
            role,
            ...(commandId ? { commandId } : {}),
        },
    });
}

export async function createStudioSimulationHarness(projectInput = {}) {
    const project = normalizeProject(projectInput);
    const compiled = compileDeclarativeLogic(project.logic);
    const reducerRegistry = createReducerRegistry(compiled.reducers);
    const persistence = createSimulationPersistence();
    const world = createWorldRuntime({
        initialState: project.initialState,
        schema: project.schema,
        reducers: reducerRegistry.toMap(),
        persistence,
    });
    await world.load([0]);

    const logic = createGameLogicRuntime({
        world,
        commands: compiled.commands,
        rules: compiled.rules,
        rngSeed: project.packageId + '@' + project.packageVersion,
    });
    const selectorDefinitions = compileGameSelectorDefinitions(project.selectors);
    const observationProjectors = compileGameObservationDefinitions(project.observations);
    const observationRuntime = createWorldObservationProjector({
        projectors: observationProjectors,
    });

    async function simulate(commandId, args = {}, options = {}) {
        const role = String(options.role || 'intent_resolver');
        const beforeState = world.getState();
        const beforeJournal = world.getJournal();
        const beforeObservation = projectObservation(
            observationRuntime,
            beforeState,
            beforeJournal.events || [],
            role,
            'studio_command_tools',
            commandId,
        );
        const commandTools = await createCommandToolCatalog(logic.listCommands(), {
            role,
            observation: beforeObservation,
        });
        const validation = logic.validateCommand(commandId, args);

        if (!validation.ok) {
            return Object.freeze({
                ok: false,
                status: 'invalid',
                commandId: String(commandId || ''),
                args: clone(args),
                validation: clone(validation),
                beforeState: clone(beforeState),
                projectedState: clone(beforeState),
                events: Object.freeze([]),
                rngTrace: Object.freeze([]),
                ruleTrace: Object.freeze([]),
                commandTools,
                observation: beforeObservation,
                selectors: Object.freeze(selectorSnapshot(selectorDefinitions, beforeState)),
                mutation: Object.freeze({
                    persistenceWrites: persistence.writes,
                    stateUnchanged: sameValue(beforeState, world.getState()),
                    journalUnchanged: sameValue(beforeJournal, world.getJournal()),
                }),
                committed: false,
            });
        }

        const result = await logic.simulate(commandId, args);
        const afterLiveState = world.getState();
        const afterLiveJournal = world.getJournal();
        const observation = projectObservation(
            observationRuntime,
            result.afterState,
            result.events,
            role,
            'studio_simulation',
            commandId,
        );
        const mutation = Object.freeze({
            persistenceWrites: persistence.writes,
            stateUnchanged: sameValue(beforeState, afterLiveState),
            journalUnchanged: sameValue(beforeJournal, afterLiveJournal),
        });

        if (
            mutation.persistenceWrites !== 0
            || !mutation.stateUnchanged
            || !mutation.journalUnchanged
            || result.committed !== false
        ) {
            throw new Error('Studio simulation violated the non-persistence contract');
        }

        return Object.freeze({
            ok: true,
            status: result.status,
            transactionId: result.transactionId,
            commandId: result.commandId,
            args: clone(result.args),
            validation: clone(validation),
            beforeState: clone(result.beforeState),
            projectedState: clone(result.afterState),
            events: Object.freeze(clone(result.events)),
            rngTrace: Object.freeze(clone(result.rngTrace)),
            ruleTrace: Object.freeze(clone(result.ruleTrace)),
            commandTools,
            observation,
            selectors: Object.freeze(selectorSnapshot(selectorDefinitions, result.afterState)),
            mutation,
            committed: false,
        });
    }

    return Object.freeze({
        listCommands() {
            return clone(logic.listCommands());
        },
        listRules() {
            return clone(logic.listRules());
        },
        listEventTypes() {
            return clone(reducerRegistry.list());
        },
        validateCommand(commandId, args) {
            return clone(logic.validateCommand(commandId, args));
        },
        getInitialState() {
            return clone(world.getState());
        },
        getInitialJournal() {
            return clone(world.getJournal());
        },
        simulate,
    });
}
