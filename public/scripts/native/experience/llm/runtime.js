import { cloneGameLlmValue } from './clone.js';
import { createInterpretationMappingRegistry } from '../logic/interpretations.js';
import { createEventInterpreter } from './event-interpreter.js';
import { createIntentResolver } from './intent-resolver.js';
import { createMemoryRecallBridge } from './memory-bridge.js';
import { createPostTurnMemoryIngestion } from './memory-ingestion.js';
import { createWorldObservationProjector } from './observation.js';
import { createCommandToolCatalog } from './tools.js';
import {
    advanceTurnContext,
    createTurnContext,
} from './turn-context.js';

const clone = cloneGameLlmValue;

function assertWorldSession(session) {
    for (const method of ['getState', 'getJournal', 'getSessionId', 'getBranchId', 'getRevisionId', 'getCommands']) {
        if (typeof session?.[method] !== 'function') {
            throw new Error('Game LLM Runtime requires worldSession.' + method + '()');
        }
    }
}

function getActiveEvents(session) {
    return [...(session.getJournal()?.events || [])];
}

export function createGameLlmRuntime(options = {}) {
    const worldSession = options.worldSession;
    assertWorldSession(worldSession);
    const roleRouter = options.roleRouter || null;
    const narrativeCoordinator = options.narrativeCoordinator || null;

    const observationProjector = options.observationProjector
        || createWorldObservationProjector({
            projectors: options.observationProjectors || [],
            eventLimit: options.eventLimit,
        });
    const interpretationMapper = options.interpretationMapper
        || createInterpretationMappingRegistry(
            options.interpretationMappings
            || worldSession.getInterpretationMappings?.()
            || [],
        );
    const memoryBridge = options.memoryBridge
        || createMemoryRecallBridge({
            context: options.context,
            memoryApi: options.memoryApi,
            getCurrentBranchIdentity: () => ({
                sessionId: worldSession.getSessionId(),
                branchId: worldSession.getBranchId(),
                revisionId: worldSession.getRevisionId(),
            }),
        });
    const memoryIngestion = options.memoryIngestion
        || createPostTurnMemoryIngestion({
            context: options.context,
            memoryApi: options.memoryApi,
            projectFactText: options.projectMemoryFactText,
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
                sessionId: worldSession.getSessionId(),
                branchId: worldSession.getBranchId(),
                revisionId: worldSession.getRevisionId(),
                eventSeq: Number.isInteger(journal?.nextSeq) ? journal.nextSeq : 1,
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
                roleRouter,
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

    async function applyInterpretation(turnContext, interpretationResult) {
        if (!turnContext || typeof turnContext !== 'object') {
            throw new Error('Game LLM Runtime applyInterpretation requires Turn Context');
        }
        if (!interpretationResult || typeof interpretationResult !== 'object') {
            throw new Error('Game LLM Runtime applyInterpretation requires validated interpretation result');
        }

        if (
            interpretationResult.status !== 'accepted'
            || interpretationResult.accepted !== true
            || interpretationResult.interpretation?.decision !== 'event'
        ) {
            return Object.freeze({
                status: 'no_change',
                turn: turnContext,
                mapping: null,
                commandResult: null,
            });
        }
        if (typeof worldSession.validateCommand !== 'function') {
            throw new Error('Game LLM Runtime interpretation mapping requires worldSession.validateCommand()');
        }
        if (typeof worldSession.dispatchCommandInternal !== 'function') {
            throw new Error('Game LLM Runtime interpretation mapping requires worldSession.dispatchCommandInternal()');
        }

        const mapped = interpretationMapper.map(
            interpretationResult.interpretation,
            {
                world: worldSession.getState(),
                observation: turnContext.observation,
                turn: turnContext,
            },
        );

        if (mapped.status === 'no_change' || mapped.commands.length === 0) {
            const turn = advanceTurnContext(turnContext, {
                resolution: {
                    ...turnContext.resolution,
                    eventInterpreter: 'mapped_no_change',
                    reason: 'semantic_mapping_no_change',
                },
            });
            return Object.freeze({
                status: 'no_change',
                turn,
                mapping: clone(mapped),
                commandResult: null,
            });
        }

        const proposal = mapped.commands[0];
        const validation = worldSession.validateCommand(proposal.id, proposal.args);
        if (!validation?.ok) {
            const errors = Array.isArray(validation?.errors)
                ? validation.errors.slice(0, 8).join('; ')
                : 'invalid mapped command';
            throw new Error(
                `Interpretation mapping produced invalid command '${proposal.id}': ${errors}`,
            );
        }

        const commandResult = await worldSession.dispatchCommandInternal(
            proposal.id,
            validation.args ?? proposal.args,
        );
        const turn = applyCommandResult(turnContext, commandResult, {
            resolution: {
                ...turnContext.resolution,
                eventInterpreter: 'applied',
                reason: 'semantic_mapping',
            },
        });

        return Object.freeze({
            status: commandResult.status,
            turn,
            mapping: clone(mapped),
            commandResult: clone(commandResult),
        });
    }

    async function interpretAndApply(turnContext, request, input = {}) {
        const interpreted = await interpretEvent(turnContext, request, input);
        if (!interpreted.accepted) {
            return Object.freeze({
                status: interpreted.status,
                accepted: false,
                turn: interpreted.turn,
                interpretation: clone(interpreted.interpretation),
                mapping: null,
                commandResult: null,
            });
        }

        const applied = await applyInterpretation(
            interpreted.turn,
            interpreted.interpretation,
        );
        return Object.freeze({
            status: applied.status,
            accepted: true,
            turn: applied.turn,
            interpretation: clone(interpreted.interpretation),
            mapping: clone(applied.mapping),
            commandResult: clone(applied.commandResult),
        });
    }

    async function recallMemory(turnContext, input = {}) {
        if (!turnContext || typeof turnContext !== 'object') {
            throw new Error('Game LLM Runtime recallMemory requires Turn Context');
        }

        const beforeState = clone(worldSession.getState());
        const beforeJournal = clone(worldSession.getJournal());
        const recalled = await memoryBridge.recall(turnContext, input);

        const afterState = worldSession.getState();
        const afterJournal = worldSession.getJournal();
        if (JSON.stringify(afterState) !== JSON.stringify(beforeState)) {
            throw new Error('Memory recall mutated World State');
        }
        if (JSON.stringify(afterJournal) !== JSON.stringify(beforeJournal)) {
            throw new Error('Memory recall mutated Event Journal');
        }

        if (!recalled.packet) {
            return Object.freeze({
                status: recalled.status,
                turn: turnContext,
                memory: null,
                query: recalled.query,
            });
        }

        const packet = Object.freeze({
            ...clone(recalled.packet),
            recallStatus: recalled.status,
        });
        const turn = advanceTurnContext(turnContext, {
            memories: [
                ...turnContext.memories,
                packet,
            ],
        });

        return Object.freeze({
            status: recalled.status,
            turn,
            memory: clone(packet),
            query: recalled.query,
        });
    }

    async function finalizeMemory(turnContext, input = {}) {
        if (!turnContext || typeof turnContext !== 'object') {
            throw new Error('Game LLM Runtime finalizeMemory requires Turn Context');
        }

        const beforeState = clone(worldSession.getState());
        const beforeJournal = clone(worldSession.getJournal());
        const result = await memoryIngestion.ingest(turnContext, input);
        const afterState = worldSession.getState();
        const afterJournal = worldSession.getJournal();

        if (JSON.stringify(afterState) !== JSON.stringify(beforeState)) {
            throw new Error('Post-turn Memory ingestion mutated World State');
        }
        if (JSON.stringify(afterJournal) !== JSON.stringify(beforeJournal)) {
            throw new Error('Post-turn Memory ingestion mutated Event Journal');
        }

        return result;
    }

    async function runUiAction(input = {}) {
        const commandId = String(input.commandId || '').trim();
        if (!commandId) throw new Error('UI action turn requires commandId');
        if (typeof worldSession.dispatchCommandInternal !== 'function') {
            throw new Error('Game LLM Runtime UI action requires worldSession.dispatchCommandInternal()');
        }

        let turn = input.turnContext || beginTurn({
            origin: 'ui_action',
            recentChat: input.recentChat || [],
            constraints: input.constraints || [],
            serial: input.serial,
        });
        input.transition?.('calculating', {
            origin: 'ui_action',
            commandId,
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

        let turn = input.turnContext || beginTurn({
            origin: 'free_text',
            userInput,
            recentChat: input.recentChat || [],
            constraints: input.constraints || [],
            serial: input.serial,
        });
        input.transition?.('resolving', {
            origin: 'free_text',
        });
        const catalog = await getCommandTools({
            role: 'intent_resolver',
            observation: turn.observation,
            turn,
        });

        const resolver = input.intentResolver || options.intentResolver || createIntentResolver({
            roleRouter,
            generateTask: input.generateTask || options.generateTask,
            validateCommand: (commandId, args) => worldSession.validateCommand(commandId, args),
        });
        if (!resolver || typeof resolver.resolve !== 'function') {
            throw new Error('Game LLM Runtime requires an Intent Resolver');
        }

        const resolutionResult = await resolver.resolve(turn, catalog, input.requestOptions || {});
        input.transition?.('calculating', {
            decision: resolutionResult.decision,
        });
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

    async function completeCommittedTurn(baseResult, input = {}) {
        if (!narrativeCoordinator || typeof narrativeCoordinator.produce !== 'function') {
            throw new Error('Complete Game turn requires Narrative Coordinator');
        }

        let turn = baseResult.turn;
        input.transition?.('recalling');
        const recalled = await recallMemory(turn, {
            ...(input.memory || {}),
            signal: input.abortSignal,
        });
        turn = recalled.turn;

        const orchestrationMode = String(
            input.orchestrationMode
            || options.getOrchestrationMode?.()
            || '',
        ).trim().toLowerCase();
        if (['spec', 'agenda', 'loop', 'director'].includes(orchestrationMode)) {
            input.transition?.('orchestrating', {
                mode: orchestrationMode,
            });
        }
        input.transition?.('narrating', {
            producer: orchestrationMode === 'director' ? 'director' : 'narrator',
        });

        const narrative = await narrativeCoordinator.produce(turn, {
            orchestrationMode,
            abortSignal: input.abortSignal,
        });
        turn = narrative.turn;

        const memoryFinal = await finalizeMemory(turn, {
            producer: narrative.producer,
            finalProse: narrative.finalProse,
        });

        return Object.freeze({
            status: 'finalized',
            turn: memoryFinal.turn,
            finalProse: narrative.finalProse,
            producer: narrative.producer,
            commandResults: clone(baseResult.commandResults || (
                baseResult.commandResult ? [baseResult.commandResult] : []
            )),
            memoryRecall: clone(recalled),
            narration: clone(narrative),
            memoryUpdate: clone(memoryFinal.update || null),
        });
    }

    async function completeFreeTextTurn(input = {}) {
        const base = await runFreeText({
            ...input,
            transition: input.transition,
        });
        return completeCommittedTurn(base, input);
    }

    async function completeUiActionTurn(input = {}) {
        const base = await runUiAction({
            ...input,
            transition: input.transition,
        });
        return completeCommittedTurn(base, input);
    }

    return Object.freeze({
        buildObservation,
        getCommandTools,
        beginTurn,
        applyCommandResult,
        interpretEvent,
        applyInterpretation,
        interpretAndApply,
        recallMemory,
        finalizeMemory,
        runUiAction,
        runFreeText,
        completeUiActionTurn,
        completeFreeTextTurn,
        listObservationProjectors: () => observationProjector.list(),
    });
}
