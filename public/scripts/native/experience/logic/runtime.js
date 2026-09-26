import { createCommandRegistry } from './command-registry.js';
import { createDeterministicRng } from './rng.js';
import { GAME_LOGIC_ERROR_CODES, GameLogicError, wrapGameLogicError } from './errors.js';
import { compileFormula, evaluateFormula } from './formula.js';
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

function createCommandFormulaApi(worldState, args, rng) {
    const formulaWorld = deepFreeze(clone(worldState));
    const formulaArgs = deepFreeze(clone(args));
    const functions = Object.freeze({
        'rng.float': () => rng.float(),
        'rng.int': (minimum, maximum) => rng.int(minimum, maximum),
        'rng.dice': (count, sides, modifier = 0) => rng.dice(count, sides, modifier).total,
    });

    return Object.freeze({
        compile: compileFormula,
        evaluate(sourceOrAst, options = {}) {
            const selectors = options.selectors === undefined
                ? {}
                : deepFreeze(clone(options.selectors));
            return evaluateFormula(sourceOrAst, {
                world: formulaWorld,
                args: formulaArgs,
                selectors,
            }, {
                functions,
            });
        },
    });
}

function getTransactionIdentity(world, commandId, rngSeed) {
    const journal = world.getJournal();
    const snapshot = world.getSnapshot();
    const nextSeq = Number.isInteger(journal?.nextSeq) ? journal.nextSeq : 1;
    const branchId = String(snapshot?.branchId || '').trim();
    const revisionId = String(snapshot?.revisionId || '').trim();
    if (!branchId || !revisionId) {
        throw new Error('Game Logic Runtime requires Native Branch/Revision identity');
    }
    const transactionId = 'tx:' + nextSeq + ':' + branchId + ':' + commandId;
    return {
        transactionId,
        branchId,
        revisionId,
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
    const hasRules = rulesEngine.listRules().length > 0;
    let transactionQueue = Promise.resolve();

    async function execute(commandId, args = {}, options = {}) {
        const validation = registry.validate(commandId, args);
        if (!validation.ok) {
            const normalizedCommandId = String(commandId || '').trim();
            throw new GameLogicError(
                validation.command
                    ? GAME_LOGIC_ERROR_CODES.COMMAND_ARGUMENTS_INVALID
                    : GAME_LOGIC_ERROR_CODES.COMMAND_NOT_FOUND,
                `Command '${normalizedCommandId}' validation failed: `
                    + validation.errors.slice(0, 8).join('; '),
                {
                    stage: 'arguments',
                    commandId: normalizedCommandId || null,
                    details: { errors: validation.errors.slice(0, 8) },
                },
            );
        }

        const beforeState = clone(world.getState());
        const commandView = Object.freeze({
            id: validation.command.id,
            ...(validation.command.description ? { description: validation.command.description } : {}),
        });
        let semanticValidation;
        try {
            semanticValidation = await runCommandValidators(validation.command.validators, {
                command: commandView,
                args: validation.args,
                world: beforeState,
            });
        } catch (error) {
            throw wrapGameLogicError(error, {
                code: GAME_LOGIC_ERROR_CODES.COMMAND_VALIDATOR_FAILED,
                stage: 'preconditions',
                commandId: validation.command.id,
                message: `Command '${validation.command.id}' validator failed`,
            });
        }
        if (!semanticValidation.ok) {
            throw new GameLogicError(
                GAME_LOGIC_ERROR_CODES.COMMAND_PRECONDITION_FAILED,
                `Command '${validation.command.id}' rejected: `
                    + semanticValidation.errors.slice(0, 8).join('; '),
                {
                    stage: 'preconditions',
                    commandId: validation.command.id,
                    details: { errors: semanticValidation.errors.slice(0, 8) },
                },
            );
        }

        const identity = getTransactionIdentity(world, validation.command.id, rngSeed);
        const transactionId = identity.transactionId;
        const rng = createDeterministicRng(identity.rngSeed);
        const formula = createCommandFormulaApi(beforeState, validation.args, rng);
        const mode = options.simulate === true ? 'simulation' : 'commit';
        const executionContext = Object.freeze({
            transactionId,
            mode,
            command: commandView,
            args: deepFreeze(clone(validation.args)),
            world: deepFreeze(clone(beforeState)),
            formula,
            rng,
        });

        let initialEvents;
        try {
            const output = await validation.command.execute(executionContext);
            initialEvents = normalizeEventDrafts(output, validation.command.id).map(event => ({
                ...event,
                meta: {
                    ...(event.meta || {}),
                    command: {
                        id: validation.command.id,
                        transactionId,
                    },
                },
            }));
        } catch (error) {
            throw wrapGameLogicError(error, {
                code: GAME_LOGIC_ERROR_CODES.COMMAND_EXECUTION_FAILED,
                stage: 'command',
                commandId: validation.command.id,
                transactionId,
                message: `Command '${validation.command.id}' execution failed`,
            });
        }

        if (initialEvents.length === 0 && !options.actionRequest) {
            return {
                ok: true,
                status: 'no_change',
                transactionId,
                commandId: validation.command.id,
                command: {
                    id: validation.command.id,
                    args: clone(validation.args),
                },
                args: clone(validation.args),
                beforeState,
                afterState: clone(beforeState),
                events: [],
                rngTrace: rng.trace(),
                ruleTrace: [],
                committed: false,
            };
        }

        let ruled = { events: initialEvents, trace: [] };
        if (hasRules) {
            try {
                ruled = await rulesEngine.process(initialEvents, {
                    beforeState,
                    project: events => world.simulateEvents(events),
                    context: {
                        transactionId,
                        command: commandView,
                        args: validation.args,
                        rng,
                    },
                });
            } catch (error) {
                throw wrapGameLogicError(error, {
                    code: GAME_LOGIC_ERROR_CODES.RULE_EVALUATION_FAILED,
                    stage: 'rules',
                    commandId: validation.command.id,
                    transactionId,
                    message: `Command '${validation.command.id}' rule evaluation failed`,
                });
            }
        }
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

        let projected;
        try {
            projected = options.simulate === true
                ? await world.simulateEvents(transactionEvents)
                : await world.commitEvents(transactionEvents, options.actionRequest);
        } catch (error) {
            const isSimulation = options.simulate === true;
            throw wrapGameLogicError(error, {
                code: isSimulation
                    ? GAME_LOGIC_ERROR_CODES.SIMULATION_FAILED
                    : GAME_LOGIC_ERROR_CODES.COMMIT_FAILED,
                stage: isSimulation ? 'simulation' : 'commit',
                commandId: validation.command.id,
                transactionId,
                message: `Command '${validation.command.id}' ${isSimulation ? 'simulation' : 'commit'} failed`,
            });
        }

        return {
            ok: true,
            status: options.simulate === true ? 'simulated' : 'committed',
            transactionId,
            commandId: validation.command.id,
            command: {
                id: validation.command.id,
                args: clone(validation.args),
            },
            args: clone(validation.args),
            beforeState,
            afterState: clone(projected.state),
            events: clone(projected.committed || projected.events || []),
            branchId: String(projected.branchId || identity.branchId),
            revisionId: String(projected.revisionId || identity.revisionId),
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
        dispatch(commandId, args, actionRequest = null) {
            const run = () => execute(commandId, args, { simulate: false, actionRequest });
            const pending = transactionQueue.then(run, run);
            transactionQueue = pending.catch(() => undefined);
            return pending;
        },
        simulate(commandId, args) {
            const run = () => execute(commandId, args, { simulate: true });
            const pending = transactionQueue.then(run, run);
            transactionQueue = pending.catch(() => undefined);
            return pending;
        },
    });
}
