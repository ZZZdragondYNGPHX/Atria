import { executeFirstPartyGeneration, firstPartyStreamingEnabled, streamFirstPartyGeneration } from '../../native/generation-compat.js';
function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function normalizeRecentChat(recentChat = []) {
    return (Array.isArray(recentChat) ? recentChat : [])
        .map((message) => {
            if (!message || typeof message !== 'object') return null;
            if (Object.hasOwn(message, 'is_user') || Object.hasOwn(message, 'mes')) {
                return {
                    ...clone(message),
                    mes: String(message.mes ?? message.content ?? ''),
                    is_user: message.is_user === true,
                    is_system: message.is_system === true,
                };
            }
            const role = String(message.role || '').trim().toLowerCase();
            return {
                mes: String(message.content || ''),
                is_user: role === 'user',
                is_system: role === 'system',
                name: String(message.name || ''),
            };
        })
        .filter(Boolean);
}

function buildTurnEnvelope(turnContext) {
    return [
        '<atria_game_turn_context>',
        JSON.stringify(turnContext),
        '</atria_game_turn_context>',
    ].join('\n');
}

function buildGuidanceMessages(turnContext) {
    const messages = normalizeRecentChat(turnContext?.recentChat || []);
    messages.push({
        mes: buildTurnEnvelope(turnContext),
        is_user: true,
        is_system: false,
        name: 'Atria Game Runtime',
    });
    return messages;
}

function buildDirectorMessages(turnContext, narrativeContract) {
    const recent = (Array.isArray(turnContext?.recentChat) ? turnContext.recentChat : [])
        .map((message) => {
            if (!message || typeof message !== 'object') return null;
            if (Object.hasOwn(message, 'role')) {
                return {
                    role: String(message.role || 'user'),
                    content: String(message.content || ''),
                };
            }
            return {
                role: message.is_system ? 'system' : (message.is_user ? 'user' : 'assistant'),
                content: String(message.mes || ''),
            };
        })
        .filter(Boolean);

    return [
        ...recent,
        {
            role: 'system',
            content: [
                '<atria_game_authoritative_contract>',
                JSON.stringify({
                    turnContext,
                    narrativeContract,
                }),
                '</atria_game_authoritative_contract>',
            ].join('\n'),
        },
    ];
}

function createGenerateTaskRouter(context) {
    return async ({ onChunk, ...opts } = {}) => {
        const streamEnabled = typeof context?.isStreamingPresetEnabled === 'function'
            && firstPartyStreamingEnabled(context, opts?.llmPresetName || '')
            && typeof context?.generateTaskStream === 'function';
        if (!streamEnabled) {
            return executeFirstPartyGeneration(context, 'orchestrator', { ...opts, onChunk });
        }

        const { stream, result } = streamFirstPartyGeneration(context, 'orchestrator', opts);
        if (typeof onChunk === 'function') {
            void (async () => {
                try {
                    for await (const chunk of stream) {
                        try {
                            onChunk(chunk);
                        } catch {
                            // Rendering observer only.
                        }
                    }
                } catch {
                    // Terminal error is surfaced by result.
                }
            })();
        }
        return await result;
    };
}

export function createOrchestratorGameRuntimeApi(deps = {}) {
    const getEffectiveProfile = deps.getEffectiveProfile;
    const runOrchestration = deps.runOrchestration;
    const buildCapsule = deps.buildCapsule;
    const runMainAgentLoop = deps.runMainAgentLoop;
    const executeLoopTool = deps.executeLoopTool;
    const getSettings = deps.getSettings;
    const attachNotesFloorState = deps.attachNotesFloorState;

    if (typeof getEffectiveProfile !== 'function') {
        throw new Error('Game Orchestrator API requires getEffectiveProfile()');
    }

    return Object.freeze({
        getMode(context) {
            return String(getEffectiveProfile(context)?.mode || '').trim().toLowerCase();
        },

        async runGuidance(input = {}) {
            const context = input.context;
            if (!context || typeof context !== 'object') {
                throw new Error('Game orchestration guidance requires context');
            }
            if (typeof runOrchestration !== 'function' || typeof buildCapsule !== 'function') {
                throw new Error('Game orchestration guidance runtime is unavailable');
            }

            const profile = structuredClone(getEffectiveProfile(context) || {});
            const requestedMode = String(input.mode || profile.mode || '').trim().toLowerCase();
            const activeMode = String(profile.mode || '').trim().toLowerCase();
            if (!['spec', 'agenda', 'loop'].includes(requestedMode)) {
                return {
                    status: 'disabled',
                    mode: requestedMode,
                    guidance: '',
                };
            }
            if (activeMode !== requestedMode) {
                return {
                    status: 'disabled',
                    mode: requestedMode,
                    guidance: '',
                    reason: 'mode_mismatch',
                };
            }

            const messages = buildGuidanceMessages(input.turnContext);
            const payload = {
                type: 'normal',
                signal: input.abortSignal || null,
                coreChat: clone(messages),
                __atriaGameTurnContext: clone(input.turnContext),
                agentRuntimeV2: true,
            };
            const result = await runOrchestration(
                context,
                payload,
                messages,
                profile,
            );
            const guidance = String(buildCapsule(result?.stageOutputs || []) || '').trim();

            return {
                status: result?.status || 'completed',
                mode: requestedMode,
                guidance,
                stageOutputs: clone(result?.stageOutputs || []),
                trace: clone(result?.runtimeTrace || null),
            };
        },

        async runDirector(input = {}) {
            const context = input.context;
            if (!context || typeof context !== 'object') {
                throw new Error('Game Director requires context');
            }
            if (typeof runMainAgentLoop !== 'function') {
                throw new Error('Game Director runtime is unavailable');
            }
            if (typeof context.createMessageEditorHandle !== 'function') {
                throw new Error('Game Director requires message editor handle factory');
            }

            const profile = structuredClone(getEffectiveProfile(context) || {});
            if (String(profile.mode || '').trim().toLowerCase() !== 'director') {
                return {
                    status: 'disabled',
                    finalProse: '',
                    reason: 'mode_mismatch',
                };
            }

            const signal = input.abortSignal || new AbortController().signal;
            const handle = context.createMessageEditorHandle({
                generationType: 'normal',
                originalText: '',
                originalReasoning: '',
                abortSignal: signal,
                owner: 'orchestrator-game-runtime',
                flushIntervalMs: 0,
            });
            const taskRouter = createGenerateTaskRouter(context);
            const notesContext = Object.create(context);
            if (typeof attachNotesFloorState === 'function') {
                try {
                    await attachNotesFloorState(notesContext);
                } catch {
                    // Notes are advisory and must not block authoritative narration.
                }
            }

            const eventData = {
                type: 'normal',
                abortSignal: signal,
                agentRuntimeV2: true,
                __atriaGameTurnContext: clone(input.turnContext),
            };
            const contentPayload = {
                messages: buildDirectorMessages(
                    input.turnContext,
                    input.narrativeContract,
                ),
            };

            await runMainAgentLoop({
                handle,
                profile,
                eventData,
                deps: {
                    generateTask: taskRouter,
                    generateTaskStreamForMainAgent: taskRouter,
                    generateTaskStream: typeof context.generateTaskStream === 'function'
                        ? options => streamFirstPartyGeneration(context, 'orchestrator', options)
                        : null,
                    isStreamingPresetEnabled: typeof context.isStreamingPresetEnabled === 'function'
                        ? presetName => firstPartyStreamingEnabled(context, presetName)
                        : null,
                    executeLoopTool: typeof executeLoopTool === 'function'
                        ? (name, args, toolContext) => executeLoopTool(name, args, toolContext)
                        : undefined,
                    chat: [],
                    getContentPayload: () => contentPayload,
                    settings: typeof getSettings === 'function' ? getSettings() : {},
                    contextForNotes: notesContext,
                },
            });

            const finalProse = String(handle.getText?.() || '').trim();
            return {
                status: finalProse ? 'completed' : 'empty',
                finalProse,
                trace: null,
                guidance: null,
            };
        },
    });
}
