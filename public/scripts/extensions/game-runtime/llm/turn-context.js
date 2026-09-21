import {
    getGameBranchId,
    normalizeGameBranchPath,
} from '../world/branch.js';

export const TURN_FACT_PRECEDENCE = Object.freeze([
    'world_observation',
    'committed_events',
    'command_results',
    'active_branch_chat',
    'memory_recall',
    'orchestrator_guidance',
]);

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function normalizeAnchor(input = {}) {
    const branchPath = normalizeGameBranchPath(input.branchPath || []);
    const branchId = getGameBranchId(branchPath);
    const floor = Number.isInteger(input.floor)
        ? input.floor
        : Math.max(-1, branchPath.length - 1);
    const swipe = Number.isInteger(input.swipe)
        ? input.swipe
        : (branchPath.at(-1) ?? 0);
    const journalNextSeq = Number.isInteger(input.journalNextSeq) && input.journalNextSeq >= 1
        ? input.journalNextSeq
        : 1;
    const serial = Number.isInteger(input.serial) && input.serial >= 0
        ? input.serial
        : 0;

    if (floor < -1) throw new Error('Turn Context floor must be >= -1');
    if (swipe < 0) throw new Error('Turn Context swipe must be >= 0');

    return Object.freeze({
        branchPath: Object.freeze([...branchPath]),
        branchId,
        floor,
        swipe,
        journalNextSeq,
        serial,
    });
}

export function createTurnId(anchorInput = {}) {
    const anchor = normalizeAnchor(anchorInput);
    const branchToken = anchor.branchId.replace(/[^A-Za-z0-9._-]/g, '_');
    return [
        'turn',
        branchToken,
        'floor', anchor.floor,
        'swipe', anchor.swipe,
        'seq', anchor.journalNextSeq,
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
        committedEvents: clone(input.committedEvents || []),
        observation: clone(input.observation || { views: {}, recentEvents: [] }),
        recentChat: clone(input.recentChat || []),
        memories: clone(input.memories || []),
        constraints: clone(input.constraints || []),
        orchestration: clone(input.orchestration || null),
        narrative: clone(input.narrative || null),
        authority: {
            precedence: [...TURN_FACT_PRECEDENCE],
        },
    });
}

const MUTABLE_TURN_FIELDS = new Set([
    'resolution',
    'resolvedCommands',
    'commandResults',
    'committedEvents',
    'observation',
    'recentChat',
    'memories',
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
        committedEvents: patch.committedEvents ?? context.committedEvents,
        observation: patch.observation ?? context.observation,
        recentChat: patch.recentChat ?? context.recentChat,
        memories: patch.memories ?? context.memories,
        constraints: patch.constraints ?? context.constraints,
        orchestration: patch.orchestration ?? context.orchestration,
        narrative: patch.narrative ?? context.narrative,
    });
}
