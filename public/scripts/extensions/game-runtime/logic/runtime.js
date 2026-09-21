import { createCommandRegistry } from './command-registry.js';

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
    for (const method of ['getState', 'commitEvents', 'simulateEvents']) {
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
        throw new Error('Command \\'' + commandId + '\\' must return an event array or { events }');
    }

    return drafts.map((draft, index) => {
        if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
            throw new Error('Command \\'' + commandId + '\\' event ' + index + ' must be an object');
        }
        const type = String(draft.type || '').trim();
        if (!type) {
            throw new Error('Command \\'' + commandId + '\\' event ' + index + ' requires a type');
        }
        return {
            type,
            payload: clone(draft.payload ?? {}),
        };
    });
}

export function createGameLogicRuntime(options = {}) {
    const world = options.world;
    assertWorldContract(world);

    const registry = options.registry || createCommandRegistry(options.commands || []);
    if (!registry || typeof registry.get !== 'function' || typeof registry.list !== 'function' || typeof registry.validate !== 'function') {
        throw new Error('Game Logic Runtime requires a Command Registry');
    }

    let nextTransactionSeq = 1;

    async function execute(commandId, args = {}, options = {}) {
        const validation = registry.validate(commandId, args);
        if (!validation.ok) {
            throw new Error(
                'Command \\'' + String(commandId || '').trim() + '\\' validation failed: '
                + validation.errors.slice(0, 8).join('; '),
            );
        }

        const transactionId = 'tx:' + nextTransactionSeq++;
        const beforeState = clone(world.getState());
        const mode = options.simulate === true ? 'simulation' : 'commit';
        const commandView = Object.freeze({
            id: validation.command.id,
            ...(validation.command.description ? { description: validation.command.description } : {}),
        });
        const executionContext = Object.freeze({
            transactionId,
            mode,
            command: commandView,
            args: deepFreeze(clone(validation.args)),
            world: deepFreeze(clone(beforeState)),
        });

        const output = await validation.command.execute(executionContext);
        const eventDrafts = normalizeEventDrafts(output, validation.command.id);

        if (eventDrafts.length === 0) {
            return {
                ok: true,
                status: 'no_change',
                transactionId,
                commandId: validation.command.id,
                args: clone(validation.args),
                beforeState,
                afterState: clone(beforeState),
                events: [],
                committed: false,
            };
        }

        const projected = options.simulate === true
            ? await world.simulateEvents(eventDrafts)
            : await world.commitEvents(eventDrafts);

        return {
            ok: true,
            status: options.simulate === true ? 'simulated' : 'committed',
            transactionId,
            commandId: validation.command.id,
            args: clone(validation.args),
            beforeState,
            afterState: clone(projected.state),
            events: clone(projected.committed || projected.events || []),
            branchPath: clone(projected.branchPath || []),
            committed: options.simulate !== true,
        };
    }

    return Object.freeze({
        listCommands: () => registry.list(),
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
        dispatch: (commandId, args) => execute(commandId, args, { simulate: false }),
        simulate: (commandId, args) => execute(commandId, args, { simulate: true }),
    });
}
