import { isGameBranchPathCompatible } from '../world/branch.js';
import { createEventInterpreter } from './event-interpreter.js';
import { createIntentResolver } from './intent-resolver.js';
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

    async function interpretEvent(turnContext, request, input = {}) {
        if (!turnContext || typeof turnContext !== 'object') {
            throw new Error('Game LLM Runtime interpretEvent requires Turn Context');
        }

        const interpreter = input.eventInterpreter
            || options.eventInterpreter
            || createEventInterpreter({
                generateTask: input.generateTask || options.generateTask,
            });
        if (!interpreter || typeof interpreter.interpret !== 'function') {
            throw new Error('Game LLM Runtime requires an Event Interpreter');
        }

        const beforeState = clone(worldSession.getState());
        const beforeJournal = clone(worldSession.getJournal());
        const result = await interpreter.interpret(
            turnContext,
            request,
            input.requestOptions || {},
        );

        const afterState = worldSession.getState();
        const afterJournal = worldSession.getJournal();
        if (JSON.stringify(afterState) !== JSON.stringify(beforeState)) {
            throw new Error('Event Interpreter mutated World State directly');
        }
        if (JSON.stringify(afterJournal) !== JSON.stringify(beforeJournal)) {
            throw new Error('Event Interpreter mutated Event Journal directly');
        }

        const resolutionStatus = result.status === 'accepted'
            ? 'accepted'
            : (result.status === 'low_confidence_no_change'
                ? 'low_confidence_no_change'
                : 'no_change');

        const turn = advanceTurnContext(turnContext, {
            resolution: {
                ...turnContext.resolution,
                eventInterpreter: resolutionStatus,
                eventInterpreterRequestId: result.requestId,
            },
            interpretations: [
                ...turnContext.interpretations,
                clone(result),
            ],
        });

        return Object.freeze({
            status: result.status,
            accepted: result.accepted === true,
            turn,
            interpretation: clone(result),
        });
    }

    async function runUiAction(input = {}) {
        const commandId = String(input.commandId || '').trim();
        if (!commandId) throw new Error('UI action turn requires commandId');
        if (typeof worldSession.dispatchCommandInternal !== 'function') {
            throw new Error('Game LLM Runtime UI action requires worldSession.dispatchCommandInternal()');
        }

        let turn = beginTurn({
            origin: 'ui_action',
            recentChat: input.recentChat || [],
            constraints: input.constraints || [],
            serial: input.serial,
        });

        const result = await worldSession.dispatchCommandInternal(commandId, input.args || {});
        turn = applyCommandResult(turn, result, {
            resolution: {
                intentResolver: 'skipped',
                eventInterpreter: 'not_requested',
                reason: 'typed_ui_command',
            },
        });

        return Object.freeze({
            status: result.status,
            turn,
            commandResult: clone(result),
        });
    }

    async function runFreeText(input = {}) {
        const userInput = String(input.userInput || '').trim();
        if (!userInput) throw new Error('Free-text game turn requires userInput');
        if (typeof worldSession.dispatchCommandInternal !== 'function') {
            throw new Error('Game LLM Runtime free-text turn requires worldSession.dispatchCommandInternal()');
        }
        if (typeof worldSession.validateCommand !== 'function') {
            throw new Error('Game LLM Runtime free-text turn requires worldSession.validateCommand()');
        }

        let turn = beginTurn({
            origin: 'free_text',
            userInput,
            recentChat: input.recentChat || [],
            constraints: input.constraints || [],
            serial: input.serial,
        });
        const catalog = await getCommandTools({
            role: 'intent_resolver',
            observation: turn.observation,
            turn,
        });

        const resolver = input.intentResolver || options.intentResolver || createIntentResolver({
            generateTask: input.generateTask || options.generateTask,
            validateCommand: (commandId, args) => worldSession.validateCommand(commandId, args),
        });
        if (!resolver || typeof resolver.resolve !== 'function') {
            throw new Error('Game LLM Runtime requires an Intent Resolver');
        }

        const resolutionResult = await resolver.resolve(turn, catalog, input.requestOptions || {});
        if (resolutionResult.decision === 'no_change') {
            turn = advanceTurnContext(turn, {
                resolution: {
                    intentResolver: 'resolved_no_change',
                    eventInterpreter: 'not_requested',
                    reason: resolutionResult.reason || 'no_matching_command',
                },
            });
            return Object.freeze({
                status: 'no_change',
                turn,
                resolution: clone(resolutionResult),
                commandResults: Object.freeze([]),
            });
        }
        if (resolutionResult.decision !== 'commands' || !Array.isArray(resolutionResult.commands)) {
            throw new Error('Intent Resolver returned an unsupported decision');
        }

        turn = advanceTurnContext(turn, {
            resolution: {
                intentResolver: 'resolved_commands',
                eventInterpreter: 'not_requested',
                reason: 'typed_commands',
            },
        });

        const commandResults = [];
        for (const proposal of resolutionResult.commands) {
            const result = await worldSession.dispatchCommandInternal(proposal.id, proposal.args || {});
            commandResults.push(clone(result));
            turn = applyCommandResult(turn, result);
        }

        return Object.freeze({
            status: commandResults.some(result => result.committed === true)
                ? 'committed'
                : 'no_change',
            turn,
            resolution: clone(resolutionResult),
            commandResults: Object.freeze(commandResults),
        });
    }

    return Object.freeze({
        buildObservation,
        getCommandTools,
        beginTurn,
        applyCommandResult,
        interpretEvent,
        runUiAction,
        runFreeText,
        listObservationProjectors: () => observationProjector.list(),
    });
}
