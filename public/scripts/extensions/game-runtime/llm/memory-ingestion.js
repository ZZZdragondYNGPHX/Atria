import { advanceTurnContext } from './turn-context.js';
import { buildGameEventMemorySource } from '../world/memory-source.js';

const MAX_FACT_TEXT = 1900;
const MAX_EVENTS_PER_TURN = 64;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function truncate(value, limit) {
    const text = String(value ?? '');
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(0, limit - 1)) + '…';
}

function defaultEventFactText(event) {
    const payload = (() => {
        try {
            return JSON.stringify(event?.payload ?? {});
        } catch {
            return '{}';
        }
    })();
    return truncate(
        'Committed game event ' + String(event?.type || 'Unknown') + ': ' + payload,
        MAX_FACT_TEXT,
    );
}

export function buildAuthoritativeEventFactOperations(turnContext, options = {}) {
    if (!turnContext || typeof turnContext !== 'object') {
        throw new Error('Authoritative Memory ingestion requires Turn Context');
    }

    const events = Array.isArray(turnContext.committedEvents)
        ? turnContext.committedEvents
        : [];
    if (events.length > MAX_EVENTS_PER_TURN) {
        throw new Error('Authoritative Memory ingestion exceeds 64 committed events');
    }

    const projectFactText = typeof options.projectFactText === 'function'
        ? options.projectFactText
        : defaultEventFactText;

    const sources = [];
    const facts = [];
    for (const event of events) {
        const source = buildGameEventMemorySource(event);
        const text = truncate(projectFactText(clone(event), clone(turnContext)), MAX_FACT_TEXT).trim();
        if (!text) {
            throw new Error(
                `Authoritative Memory projector returned empty text for '${String(event?.id || '')}'`,
            );
        }

        sources.push(source);
        facts.push({
            action: 'create',
            type: 'authoritative',
            text,
            confidence: 1,
            importance: 1,
            ...(Number.isFinite(Number(event?.seq)) ? { validFrom: Number(event.seq) } : {}),
            evidence: [{
                externalSourceId: source.id,
                excerpt: source.content,
            }],
        });
    }

    return Object.freeze({
        sourceIds: Object.freeze(sources.map(source => source.id)),
        sources: Object.freeze(sources),
        facts: Object.freeze(facts.map(fact => Object.freeze(clone(fact)))),
    });
}

export function createPostTurnMemoryIngestion(options = {}) {
    const context = options.context
        || globalThis.Atria?.getContext?.()
        || null;
    const resolveMemoryApi = () => (
        options.memoryApi
        || context?.getExtensionApi?.('memory-graph')
        || null
    );

    return Object.freeze({
        async ingest(turnContext, input = {}) {
            if (!turnContext || typeof turnContext !== 'object') {
                throw new Error('Post-turn Memory ingestion requires Turn Context');
            }

            const producer = String(input.producer || '').trim();
            if (!['narrator', 'director'].includes(producer)) {
                throw new Error("Post-turn Memory ingestion producer must be 'narrator' or 'director'");
            }
            const finalProse = String(input.finalProse ?? '').trim();
            if (!finalProse) {
                throw new Error('Post-turn Memory ingestion requires finalized prose');
            }

            const prepared = buildAuthoritativeEventFactOperations(turnContext, {
                projectFactText: input.projectFactText || options.projectFactText,
            });

            const narrative = Object.freeze({
                status: 'final',
                producer,
                text: finalProse,
            });

            const memoryApi = resolveMemoryApi();
            if (
                prepared.facts.length === 0
                || !memoryApi
                || typeof memoryApi.openSession !== 'function'
            ) {
                const update = Object.freeze({
                    status: prepared.facts.length === 0 ? 'no_authoritative_facts' : 'unavailable',
                    source: 'committed_events',
                    eventIds: prepared.sources.map(source => source.eventId),
                    factIds: [],
                });
                return Object.freeze({
                    status: update.status,
                    turn: advanceTurnContext(turnContext, {
                        narrative,
                        memoryUpdates: [...(turnContext.memoryUpdates || []), update],
                    }),
                    update,
                });
            }

            let applyAuthoritativeFacts = null;
            if (typeof memoryApi.applyAuthoritativeFacts === 'function') {
                applyAuthoritativeFacts = inputPayload => memoryApi.applyAuthoritativeFacts(
                    context,
                    inputPayload,
                );
            } else if (typeof memoryApi.openSession === 'function') {
                const session = await memoryApi.openSession(context);
                if (typeof session?.applyAuthoritativeFacts === 'function') {
                    applyAuthoritativeFacts = inputPayload => session.applyAuthoritativeFacts(inputPayload);
                }
            }

            if (!applyAuthoritativeFacts) {
                const update = Object.freeze({
                    status: 'unavailable',
                    source: 'committed_events',
                    eventIds: prepared.sources.map(source => source.eventId),
                    factIds: [],
                });
                return Object.freeze({
                    status: 'unavailable',
                    turn: advanceTurnContext(turnContext, {
                        narrative,
                        memoryUpdates: [...(turnContext.memoryUpdates || []), update],
                    }),
                    update,
                });
            }

            const results = await applyAuthoritativeFacts({
                sourceIds: [...prepared.sourceIds],
                facts: prepared.facts.map(fact => clone(fact)),
            });
            const factIds = (Array.isArray(results) ? results : [])
                .map(result => String(result?.id || '').trim())
                .filter(Boolean);

            const update = Object.freeze({
                status: 'ingested',
                source: 'committed_events',
                eventIds: prepared.sources.map(source => source.eventId),
                sourceIds: [...prepared.sourceIds],
                factIds,
                producer,
            });

            return Object.freeze({
                status: 'ingested',
                turn: advanceTurnContext(turnContext, {
                    narrative,
                    memoryUpdates: [...(turnContext.memoryUpdates || []), update],
                }),
                update,
            });
        },
    });
}
