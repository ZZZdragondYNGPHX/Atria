import { createCommandRegistry } from './command-registry.js';
import { createDeterministicRng } from './rng.js';
import { createRulesEngine } from './rules.js';
import { runCommandValidators } from './validators.js';

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

function assertWorldContract(world) {
    for (const method of ['getState', 'getJournal', 'getSnapshot', 'commitEvents', 'simulateEvents']) {
        if (typeof world?.[method] !== 'function') {
            throw new Error('Game Logic Runtime requires world.' + method + '()');
        }
    }
}

function normalizeEventDrafts(output, commandId) {
    const drafts = Array.isArray(output)
        ? output
        : (Array.isArray(output?.events) ? output.events : null);
    if (!drafts) {
        throw new Error(`Command '${commandId}' must return an event array or { events }`);
    }

    return drafts.map((draft, index) => {
        if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
            throw new Error(`Command '${commandId}' event ${index} must be an object`);
        }
        const type = String(draft.type || '').trim();
        if (!type) {
            throw new Error(`Command '${commandId}' event ${index} requires a type`);
        }
        const meta = draft.meta && typeof draft.meta === 'object' && !Array.isArray(draft.meta)
            ? clone(draft.meta)
            : null;
        return {
            type,
            payload: clone(draft.payload ?? {}),
            ...(meta ? { meta } : {}),
        };
    });
}

function getTransactionIdentity(world, commandId, rngSeed) {
    const journal = world.getJournal();
    const snapshot = world.getSnapshot();
    const nextSeq = Number.isInteger(journal?.nextSeq) ? journal.nextSeq : 1;
    const branchPath = Array.isArray(snapshot?.branchPath) ? [...snapshot.branchPath] : [];
    const branchKey = branchPath.length > 0 ? branchPath.join('.') : 'root';
    const transactionId = 'tx:' + nextSeq + ':' + branchKey + ':' + commandId;
    return {
        transactionId,
        branchPath,
        rngSeed: String(rngSeed) + '|' + transactionId,
    };
}

export function createGameLogicRuntime(options = {}) {
    const world = options.world;
    assertWorldContract(world);

    const registry = options.registry || createCommandRegistry(options.commands || []);
    if (!registry || typeof registry.get !== 'function' || typeof registry.list !== 'function' || typeof registry.validate !== 'function') {
        throw new Error('Game Logic Runtime requires a Command Registry');
    }

    const rulesEngine = options.rulesEngine || createRulesEngine(options.rules || [], options.ruleLimits || {});
    if (!rulesEngine || typeof rulesEngine.process !== 'function' || typeof rulesEngine.listRules !== 'function') {
        throw new Error('Game Logic Runtime requires a Rules Engine');
    }

    const rngSeed = options.rngSeed ?? 'atria-game-runtime-v1';
    let commitQueue = Promise.resolve();

    async function execute(commandId, args = {}, options = {}) {
        const validation = registry.validate(commandId, args);
        if (!validation.ok) {
            throw new Error(
                `Command '${String(commandId || '').trim()}' validation failed: `
                + validation.errors.slice(0, 8).join('; '),
            );
        }

        const beforeState = clone(world.getState());
        const commandView = Object.freeze({
            id: validation.command.id,
            ...(validation.command.description ? { description: validation.command.description } : {}),
        });
        const semanticValidation = await runCommandValidators(validation.command.validators, {
            command: commandView,
            args: validation.args,
            world: beforeState,
        });
        if (!semanticValidation.ok) {
            throw new Error(
                `Command '${validation.command.id}' rejected: `
                + semanticValidation.errors.slice(0, 8).join('; '),
            );
        }

        const identity = getTransactionIdentity(world, validation.command.id, rngSeed);
        const transactionId = identity.transactionId;
        const rng = createDeterministicRng(identity.rngSeed);
        const mode = options.simulate === true ? 'simulation' : 'commit';
        const executionContext = Object.freeze({
            transactionId,
            mode,
            command: commandView,
            args: deepFreeze(clone(validation.args)),
            world: deepFreeze(clone(beforeState)),
            rng,
        });

        const output = await validation.command.execute(executionContext);
        const initialEvents = normalizeEventDrafts(output, validation.command.id).map(event => ({
            ...event,
            meta: {
                ...(event.meta || {}),
                command: {
                    id: validation.command.id,
                    transactionId,
                },
            },
        }));

        if (initialEvents.length === 0) {
            return {
                ok: true,
                status: 'no_change',
                transactionId,
                commandId: validation.command.id,
                args: clone(validation.args),
                beforeState,
                afterState: clone(beforeState),
                events: [],
                rngTrace: rng.trace(),
                ruleTrace: [],
                committed: false,
            };
        }

        const ruled = await rulesEngine.process(initialEvents, {
            beforeState,
            project: events => world.simulateEvents(events),
            context: {
                transactionId,
                command: commandView,
                args: validation.args,
                rng,
            },
        });
        const rngTrace = rng.trace();
        const transactionEvents = ruled.events.map((event, index) => ({
            ...event,
            meta: {
                ...(event.meta || {}),
                command: {
                    id: validation.command.id,
                    transactionId,
                },
                ...(index === 0 && rngTrace.length > 0 ? { rngTrace } : {}),
            },
        }));

        const projected = options.simulate === true
            ? await world.simulateEvents(transactionEvents)
            : await world.commitEvents(transactionEvents);

        return {
            ok: true,
            status: options.simulate === true ? 'simulated' : 'committed',
            transactionId,
            commandId: validation.command.id,
            args: clone(validation.args),
            beforeState,
            afterState: clone(projected.state),
            events: clone(projected.committed || projected.events || []),
            branchPath: clone(projected.branchPath || identity.branchPath),
            rngTrace,
            ruleTrace: clone(ruled.trace),
            committed: options.simulate !== true,
        };
    }

    return Object.freeze({
        listCommands: () => registry.list(),
        listRules: () => rulesEngine.listRules(),
        validateCommand: (commandId, args) => {
            const result = registry.validate(commandId, args);
            return {
                ok: result.ok,
                errors: [...result.errors],
                command: result.command ? {
                    id: result.command.id,
                    ...(result.command.description ? { description: result.command.description } : {}),
                    argsSchema: clone(result.command.argsSchema),
                } : null,
                args: clone(result.args),
            };
        },
        dispatch(commandId, args) {
            const run = () => execute(commandId, args, { simulate: false });
            const pending = commitQueue.then(run, run);
            commitQueue = pending.catch(() => undefined);
            return pending;
        },
        async simulate(commandId, args) {
            await commitQueue;
            return execute(commandId, args, { simulate: true });
        },
    });
}
