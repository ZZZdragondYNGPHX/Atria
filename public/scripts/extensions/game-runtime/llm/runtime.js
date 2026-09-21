import { isGameBranchPathCompatible } from '../world/branch.js';
import { createWorldObservationProjector } from './observation.js';
import { createCommandToolCatalog } from './tools.js';
import {
    advanceTurnContext,
    createTurnContext,
} from './turn-context.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function assertWorldSession(session) {
    for (const method of ['getState', 'getJournal', 'getBranchPath', 'getCommands']) {
        if (typeof session?.[method] !== 'function') {
            throw new Error('Game LLM Runtime requires worldSession.' + method + '()');
        }
    }
}

function getActiveEvents(session) {
    const branchPath = session.getBranchPath();
    const journal = session.getJournal();
    return (journal?.events || []).filter(event => (
        isGameBranchPathCompatible(event?.branchPath || [], branchPath)
    ));
}

export function createGameLlmRuntime(options = {}) {
    const worldSession = options.worldSession;
    assertWorldSession(worldSession);

    const observationProjector = options.observationProjector
        || createWorldObservationProjector({
            projectors: options.observationProjectors || [],
            eventLimit: options.eventLimit,
        });

    let turnSerial = 0;

    function buildObservation(extraContext = {}) {
        return observationProjector.project({
            world: worldSession.getState(),
            events: getActiveEvents(worldSession),
            context: clone(extraContext),
        });
    }

    async function getCommandTools(input = {}) {
        const observation = input.observation || buildObservation({
            purpose: 'command_visibility',
        });
        return createCommandToolCatalog(worldSession.getCommands(), {
            role: input.role || 'intent_resolver',
            observation,
            turn: input.turn || null,
            visibility: options.commandVisibility,
        });
    }

    function beginTurn(input = {}) {
        const journal = worldSession.getJournal();
        const branchPath = worldSession.getBranchPath();
        const serial = Number.isInteger(input.serial) && input.serial >= 0
            ? input.serial
            : turnSerial++;

        const observation = input.observation || buildObservation({
            purpose: 'turn_begin',
            origin: input.origin || 'free_text',
        });

        return createTurnContext({
            origin: input.origin || 'free_text',
            userInput: input.userInput,
            anchor: {
                branchPath,
                journalNextSeq: Number.isInteger(journal?.nextSeq) ? journal.nextSeq : 1,
                serial,
            },
            observation,
            recentChat: input.recentChat || [],
            constraints: input.constraints || [],
        });
    }

    function applyCommandResult(turnContext, commandResult, options = {}) {
        if (!turnContext || typeof turnContext !== 'object') {
            throw new Error('Game LLM Runtime applyCommandResult requires Turn Context');
        }
        if (!commandResult || typeof commandResult !== 'object') {
            throw new Error('Game LLM Runtime applyCommandResult requires command result');
        }

        const resolvedCommand = commandResult.command || (
            commandResult.commandId
                ? {
                    id: commandResult.commandId,
                    args: clone(commandResult.args || {}),
                }
                : null
        );

        const observation = buildObservation({
            purpose: 'post_commit',
            turnId: turnContext.turnId,
        });

        const resolution = options.resolution || (
            turnContext.origin === 'ui_action'
                ? {
                    intentResolver: 'skipped',
                    eventInterpreter: 'not_requested',
                    reason: 'typed_ui_command',
                }
                : turnContext.resolution
        );

        return advanceTurnContext(turnContext, {
            resolution,
            resolvedCommands: resolvedCommand
                ? [...turnContext.resolvedCommands, clone(resolvedCommand)]
                : [...turnContext.resolvedCommands],
            commandResults: [...turnContext.commandResults, clone(commandResult)],
            committedEvents: [
                ...turnContext.committedEvents,
                ...clone(commandResult.events || []),
            ],
            observation,
        });
    }

    return Object.freeze({
        buildObservation,
        getCommandTools,
        beginTurn,
        applyCommandResult,
        listObservationProjectors: () => observationProjector.list(),
    });
}
