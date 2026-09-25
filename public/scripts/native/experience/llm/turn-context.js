import { cloneGameLlmValue } from './clone.js';

export const TURN_FACT_PRECEDENCE = Object.freeze([
    'world_observation',
    'committed_events',
    'command_results',
    'active_branch_chat',
    'memory_recall',
    'orchestrator_guidance',
]);

const clone = cloneGameLlmValue;

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function normalizeAnchor(input = {}) {
    const sessionId = String(input.sessionId || '').trim();
    const branchId = String(input.branchId || '').trim();
    const revisionId = String(input.revisionId || '').trim();
    const eventSeq = Number.isInteger(input.eventSeq) && input.eventSeq >= 1
        ? input.eventSeq
        : 1;
    const serial = Number.isInteger(input.serial) && input.serial >= 0
        ? input.serial
        : 0;
    if (!sessionId || !branchId || !revisionId) {
        throw new Error('Turn Context requires Native Session/Branch/Revision identity');
    }
    return Object.freeze({
        sessionId,
        branchId,
        revisionId,
        eventSeq,
        serial,
    });
}

export function createTurnId(anchorInput = {}) {
    const anchor = normalizeAnchor(anchorInput);
    const sessionToken = anchor.sessionId.replace(/[^A-Za-z0-9._-]/g, '_');
    const branchToken = anchor.branchId.replace(/[^A-Za-z0-9._-]/g, '_');
    const revisionToken = anchor.revisionId.replace(/[^A-Za-z0-9._-]/g, '_');
    return [
        'turn',
        sessionToken,
        branchToken,
        revisionToken,
        'event', anchor.eventSeq,
        'n', anchor.serial,
    ].join(':');
}

function defaultResolution(origin) {
    if (origin === 'ui_action') {
        return {
            intentResolver: 'skipped',
            eventInterpreter: 'not_requested',
            reason: 'typed_ui_command',
        };
    }
    return {
        intentResolver: 'pending',
        eventInterpreter: 'not_requested',
        reason: 'free_text',
    };
}

function buildTurnProvenance(input, anchor) {
    const committedEvents = Array.isArray(input.committedEvents) ? input.committedEvents : [];
    const commandResults = Array.isArray(input.commandResults) ? input.commandResults : [];
    const memories = Array.isArray(input.memories) ? input.memories : [];
    const recentChat = Array.isArray(input.recentChat) ? input.recentChat : [];

    return {
        worldObservation: {
            authorityRank: 1,
            source: 'native_world_state',
            branchId: anchor.branchId,
        },
        committedEvents: {
            authorityRank: 2,
            source: 'native_session_revision',
            items: committedEvents.map(event => ({
                id: String(event?.id || '').trim() || null,
                type: String(event?.type || '').trim() || null,
                commandId: String(event?.meta?.command?.id || '').trim() || null,
            })),
        },
        commandResults: {
            authorityRank: 3,
            source: 'command_bus',
            items: commandResults.map(result => ({
                commandId: String(result?.commandId || result?.command?.id || '').trim() || null,
                transactionId: String(result?.transactionId || '').trim() || null,
                status: String(result?.status || '').trim() || null,
            })),
        },
        activeBranchChat: {
            authorityRank: 4,
            source: 'native_timeline',
            branchId: anchor.branchId,
            itemCount: recentChat.length,
        },
        memoryRecall: {
            authorityRank: 5,
            source: 'memory_graph',
            items: memories.map(memory => ({
                id: String(memory?.id || '').trim() || null,
                authority: String(memory?.authority || 'historical_context'),
                referenceIds: Array.isArray(memory?.references)
                    ? memory.references.map(reference => String(reference?.id || '').trim()).filter(Boolean)
                    : [],
            })),
        },
        orchestratorGuidance: {
            authorityRank: 6,
            source: 'orchestrator',
            present: Boolean(input.orchestration),
            mode: String(input.orchestration?.mode || '').trim() || null,
        },
    };
}

export function createTurnContext(input = {}) {
    const origin = String(input.origin || 'free_text').trim();
    if (!['free_text', 'ui_action', 'system'].includes(origin)) {
        throw new Error(`Unsupported Turn Context origin '${origin}'`);
    }

    const anchor = normalizeAnchor(input.anchor || {});
    const turnId = String(input.turnId || createTurnId(anchor)).trim();
    if (!turnId) throw new Error('Turn Context requires turnId');

    return deepFreeze({
        version: 1,
        turnId,
        anchor,
        origin,
        userInput: input.userInput === undefined ? null : String(input.userInput),
        resolution: clone(input.resolution || defaultResolution(origin)),
        resolvedCommands: clone(input.resolvedCommands || []),
        commandResults: clone(input.commandResults || []),
        interpretations: clone(input.interpretations || []),
        committedEvents: clone(input.committedEvents || []),
        observation: clone(input.observation || { views: {}, recentEvents: [] }),
        recentChat: clone(input.recentChat || []),
        memories: clone(input.memories || []),
        memoryUpdates: clone(input.memoryUpdates || []),
        constraints: clone(input.constraints || []),
        orchestration: clone(input.orchestration || null),
        narrative: clone(input.narrative || null),
        authority: {
            precedence: [...TURN_FACT_PRECEDENCE],
        },
        provenance: buildTurnProvenance(input, anchor),
    });
}

const MUTABLE_TURN_FIELDS = new Set([
    'resolution',
    'resolvedCommands',
    'commandResults',
    'interpretations',
    'committedEvents',
    'observation',
    'recentChat',
    'memories',
    'memoryUpdates',
    'constraints',
    'orchestration',
    'narrative',
]);

export function advanceTurnContext(context, patch = {}) {
    if (!context || typeof context !== 'object') {
        throw new Error('advanceTurnContext requires an existing Turn Context');
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('Turn Context patch must be an object');
    }

    for (const key of Object.keys(patch)) {
        if (!MUTABLE_TURN_FIELDS.has(key)) {
            throw new Error(`Turn Context patch cannot change '${key}'`);
        }
    }

    return createTurnContext({
        anchor: context.anchor,
        turnId: context.turnId,
        origin: context.origin,
        userInput: context.userInput,
        resolution: patch.resolution ?? context.resolution,
        resolvedCommands: patch.resolvedCommands ?? context.resolvedCommands,
        commandResults: patch.commandResults ?? context.commandResults,
        interpretations: patch.interpretations ?? context.interpretations,
        committedEvents: patch.committedEvents ?? context.committedEvents,
        observation: patch.observation ?? context.observation,
        recentChat: patch.recentChat ?? context.recentChat,
        memories: patch.memories ?? context.memories,
        memoryUpdates: patch.memoryUpdates ?? context.memoryUpdates,
        constraints: patch.constraints ?? context.constraints,
        orchestration: patch.orchestration ?? context.orchestration,
        narrative: patch.narrative ?? context.narrative,
    });
}
