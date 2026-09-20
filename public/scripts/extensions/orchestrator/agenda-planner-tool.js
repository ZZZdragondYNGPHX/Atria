import { validateParsedToolCalls } from '../function-call-runtime.js';
import { waitForRpmSlot } from '../../lib/iter-tool-calling.js';
import { isAbortError, throwIfAborted } from './abort-utils.js';
import { runWithOrchestrationApiFallback } from './api-fallback.js';

const EXPECTED = 'atri_orch_planner_step';

export function validatePlannerToolResult(result, tools) {
    const calls = result?.toolCalls;
    if (tools.length !== 1 || tools[0]?.function?.name !== EXPECTED || !Array.isArray(calls) || calls.length !== 1) {
        throw new Error('Planner requires exactly one registered tool and one returned call.');
    }
    const call = calls[0];
    if (call.raw?.type && call.raw.type !== 'function') throw new Error('Planner requires a function call.');
    // Parse the original arguments whenever available, rather than accepting a
    // lossy/default value supplied by a compatibility parser.
    const args = call.raw?.function
        ? JSON.parse(call.raw.function.arguments)
        : call.args;
    const normalized = { ...call, name: EXPECTED, args };
    const error = validateParsedToolCalls([normalized], tools);
    if (error) throw new Error(error);
    if (args.finalize !== undefined && args.dispatches !== undefined) {
        throw new Error('Planner cannot dispatch and finalize in the same step.');
    }
    return { args, actual: call.name, normalized: call.name !== EXPECTED };
}

function isNamedChoiceUnsupported(error) {
    // Only explicit capability errors justify changing tool_choice. No model
    // brand guessing, and no fallback for network/auth/rate-limit failures.
    const message = String(error?.message || '');
    return /tool[_ ]choice/i.test(message) && /not supported|unsupported|does not support/i.test(message);
}

export async function requestAgendaPlannerStep(context, settings, request) {
    const tools = [{ type: 'function', function: {
        name: EXPECTED, description: request.functionDescription, parameters: request.parameters,
    } }];
    let toolChoice = { type: 'function', function: { name: EXPECTED } };
    for (let attempt = 0; attempt < 2; attempt++) {
        const repaired = attempt === 1;
        let result;
        let diagnostic;
        try {
            throwIfAborted(request.abortSignal);
            await waitForRpmSlot(settings, request.abortSignal);
            throwIfAborted(request.abortSignal);
            result = await runWithOrchestrationApiFallback({
                primaryApiPresetName: request.apiPresetName,
                fallbackApiPresetName: request.fallbackApiPresetName,
                abortSignal: request.abortSignal,
                execute: routeApiPresetName => context.generateTask({
                    taskMessages: repaired ? request.repairMessages : request.taskMessages,
                    includeCharacterCard: !repaired,
                    ...(repaired ? { promptMode: 'task' } : {}),
                    worldInfoSource: 'none',
                    runtimeWorldInfo: repaired ? {} : request.runtimeWorldInfo,
                    apiPresetName: routeApiPresetName,
                    llmPresetName: request.llmPresetName,
                    tools, toolChoice, stream: false,
                    ...(repaired ? { temperature: 0 } : {}),
                    functionCallMode: 'auto',
                    functionCallOptions: { requiredFunctionName: EXPECTED, protocolStyle: 'json_schema' },
                    abortSignal: request.abortSignal,
                }),
            });
            throwIfAborted(request.abortSignal);
            diagnostic = {
                expected: EXPECTED, actual: (result?.toolCalls || []).map(call => call.name),
                ...result?.requestInfo, stream: false, streaming_merge: false,
                repair: repaired, planner_round: request.plannerRound,
                apiPresetName: request.apiPresetName,
                tool_call_ids: (result?.toolCalls || []).map(call => call.raw?.id || call.id || null),
            };
            console.debug('[Agenda Planner Tool Response]', diagnostic, {
                calls: result?.toolCalls, rawToolCalls: result?.raw?.choices?.[0]?.message?.tool_calls,
            });
            let validated;
            try { validated = validatePlannerToolResult(result, tools); } catch (error) {
                error.code = 'agenda_planner_validation';
                throw error;
            }
            if (validated.normalized) console.warn('[Agenda Planner Tool Mismatch] Safely normalized', diagnostic);
            console.debug('[Agenda Planner Tool Validated]', { ...diagnostic, name: EXPECTED, args: validated.args });
            return validated.args;
        } catch (error) {
            if (isAbortError(error, request.abortSignal) || error?.code === 'context_budget') throw error;
            const unsupported = isNamedChoiceUnsupported(error);
            console.warn('[Agenda Planner Tool Failure]', diagnostic || {
                expected: EXPECTED, repair: repaired, planner_round: request.plannerRound,
                ...error?.details?.requestInfo,
            });
            // Argument bodies are debug-only; never include them in an error toast.
            console.debug('[Agenda Planner Tool Failure Details]', error?.details || {}, error);
            if (attempt === 0 && (unsupported || ['agenda_planner_validation', 'tool_call_parse', 'no_response'].includes(error?.code))) {
                if (unsupported) toolChoice = 'required';
                continue;
            }
            const failure = new Error('Agenda Planner failed to return a valid step.');
            failure.cause = error;
            throw failure;
        }
    }
}
