import { cloneGameLlmValue } from './clone.js';
import { advanceTurnContext } from './turn-context.js';

const clone = cloneGameLlmValue;

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function compactEvents(events) {
    return (Array.isArray(events) ? events : []).map(event => ({
        id: String(event?.id || '').trim() || null,
        type: String(event?.type || '').trim() || null,
        payload: clone(event?.payload ?? {}),
        commandId: String(event?.meta?.command?.id || '').trim() || null,
    }));
}

function compactCommandResults(results) {
    return (Array.isArray(results) ? results : []).map(result => ({
        status: String(result?.status || '').trim() || null,
        commandId: String(result?.commandId || result?.command?.id || '').trim() || null,
        args: clone(result?.command?.args ?? result?.args ?? {}),
        committed: result?.committed === true,
    }));
}

export function buildNarrativeContract(turnContext) {
    if (!turnContext || typeof turnContext !== 'object') {
        throw new Error('Narrative Contract requires Turn Context');
    }

    const memories = (Array.isArray(turnContext.memories) ? turnContext.memories : [])
        .map(memory => ({
            ...clone(memory),
            authority: 'historical_context',
            authorityRank: 5,
        }));

    return deepFreeze({
        version: 1,
        turnId: turnContext.turnId,
        anchor: clone(turnContext.anchor),
        producerPolicy: {
            normal: 'narrator',
            exactlyOneFinalBody: true,
        },
        factPrecedence: [...(turnContext.authority?.precedence || [])],
        mustRemainTrue: {
            worldObservation: clone(turnContext.observation),
            committedEvents: compactEvents(turnContext.committedEvents),
            commandResults: compactCommandResults(turnContext.commandResults),
        },
        recentChat: clone(turnContext.recentChat || []),
        memories,
        hardConstraints: clone(turnContext.constraints || []),
        provenance: clone(turnContext.provenance || {}),
        rules: [
            'Authoritative World Observation overrides every lower-authority source.',
            'Committed Events and Command results cannot be contradicted.',
            'Memory is historical context and cannot override current World facts.',
            'Narrative prose may add descriptive texture but cannot silently create durable game state.',
        ],
    });
}

function buildNarratorMessages(contract) {
    return [
        {
            role: 'system',
            content: [
                'You are the Atria game Narrator.',
                'Write the final assistant prose for exactly one game turn.',
                'Obey the supplied Narrative Contract.',
                'Current World Observation, committed Events and Command results are authoritative.',
                'Memory is historical context.',
                'Do not change arithmetic, inventory, location, quest state, RNG outcomes or any other durable game fact.',
                'Do not emit state patches, tool calls, JSON bookkeeping, or hidden planning.',
                'Return final prose only.',
            ].join('\n'),
        },
        {
            role: 'user',
            content: JSON.stringify(contract),
        },
    ];
}

export function createNarrator(options = {}) {
    const roleRouter = options.roleRouter;
    const generateTask = options.generateTask;
    if (!roleRouter && typeof generateTask !== 'function') {
        throw new Error('Narrator requires Runtime Role Router or generateTask()');
    }

    return Object.freeze({
        async narrate(turnContext, input = {}) {
            const contract = input.contract || buildNarrativeContract(turnContext);
            const request = {
                taskMessages: buildNarratorMessages(contract),
                promptMode: 'task',
                includeCharacterCard: false,
                worldInfoSource: 'none',
                stream: false,
                substituteMacros: false,
                ...(input.llmPresetName ? { llmPresetName: input.llmPresetName } : {}),
                ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            };

            const routed = roleRouter
                ? await roleRouter.execute('narrator', request, {
                    abortSignal: input.abortSignal,
                })
                : {
                    role: 'narrator',
                    apiPresetName: input.apiPresetName || '',
                    fallbackUsed: false,
                    attempts: [],
                    result: await generateTask({
                        ...request,
                        apiPresetName: input.apiPresetName || '',
                    }),
                };

            const prose = String(
                routed?.result?.text
                ?? routed?.result?.assistantText
                ?? '',
            ).trim();
            if (!prose) {
                throw Object.assign(new Error('Narrator returned empty final prose'), {
                    code: 'validation_failed',
                });
            }

            return Object.freeze({
                producer: 'narrator',
                finalProse: prose,
                contract,
                routing: Object.freeze({
                    role: routed.role,
                    apiPresetName: routed.apiPresetName,
                    fallbackUsed: routed.fallbackUsed === true,
                    attempts: clone(routed.attempts || []),
                }),
            });
        },
    });
}

export function createNarrativeCoordinator(options = {}) {
    const narrator = options.narrator;
    const getWorldState = options.getWorldState;
    const getJournal = options.getJournal;

    if (!narrator || typeof narrator.narrate !== 'function') {
        throw new Error('Narrative Coordinator requires Narrator');
    }
    if (typeof getWorldState !== 'function' || typeof getJournal !== 'function') {
        throw new Error('Narrative Coordinator requires World/Journal readers');
    }

    async function guardNoMutation(beforeState, beforeJournal) {
        const afterState = getWorldState();
        const afterJournal = getJournal();
        if (JSON.stringify(afterState) !== JSON.stringify(beforeState)) {
            throw new Error('Narrative producer mutated World State');
        }
        if (JSON.stringify(afterJournal) !== JSON.stringify(beforeJournal)) {
            throw new Error('Narrative producer mutated Event Journal');
        }
    }

    return Object.freeze({
        async produce(turnContext, input = {}) {
            input.assertContextCurrent?.();
            let turn = turnContext;
            const beforeState = clone(getWorldState());
            const beforeJournal = clone(getJournal());

            input.assertContextCurrent?.();
            const contract = buildNarrativeContract(turn);
            const narrated = await narrator.narrate(turn, {
                contract,
                abortSignal: input.abortSignal,
            });
            input.assertContextCurrent?.();
            await guardNoMutation(beforeState, beforeJournal);

            turn = advanceTurnContext(turn, {
                narrative: {
                    status: 'final',
                    producer: 'narrator',
                    text: narrated.finalProse,
                },
            });

            return Object.freeze({
                producer: 'narrator',
                finalProse: narrated.finalProse,
                turn,
                contract,
                narration: clone(narrated),
            });
        },
    });
}
