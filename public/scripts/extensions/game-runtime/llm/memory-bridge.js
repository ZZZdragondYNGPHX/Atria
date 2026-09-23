import { cloneGameLlmValue } from './clone.js';

const MAX_QUERY_CHARS = 12000;
const MAX_MEMORY_CONTENT_CHARS = 48000;
const MAX_REFERENCES = 64;
const MAX_DIAGNOSTICS = 32;

const clone = cloneGameLlmValue;

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function truncate(value, limit) {
    const text = String(value ?? '');
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(0, limit - 1)) + '…';
}

function stringifyCompact(value, limit) {
    try {
        return truncate(JSON.stringify(value), limit);
    } catch {
        return '';
    }
}

function normalizeReference(raw) {
    const id = String(raw?.id ?? raw ?? '').trim();
    if (!id) return null;

    const separator = id.indexOf(':');
    const kind = separator > 0 ? id.slice(0, separator) : 'memory';
    return Object.freeze({
        id,
        kind,
        source: 'memory_graph',
        authority: 'historical_context',
    });
}

function assertTurnBranchCurrent(turnContext, currentIdentity) {
    const expectedSessionId = String(turnContext?.anchor?.sessionId || '').trim();
    const expectedBranchId = String(turnContext?.anchor?.branchId || '').trim();
    const actualSessionId = String(currentIdentity?.sessionId || '').trim();
    const actualBranchId = String(currentIdentity?.branchId || '').trim();
    if (
        !expectedSessionId
        || !expectedBranchId
        || expectedSessionId !== actualSessionId
        || expectedBranchId !== actualBranchId
    ) {
        throw new Error(
            "Memory recall Native branch changed from '" + expectedBranchId + "' to '" + actualBranchId + "'",
        );
    }
}

export function buildMemoryRecallQuery(turnContext) {
    if (!turnContext || typeof turnContext !== 'object') {
        throw new Error('Memory recall query requires Turn Context');
    }

    const fragments = [];
    const userInput = String(turnContext.userInput || '').trim();
    if (userInput) {
        fragments.push('User input: ' + truncate(userInput, 3000));
    }

    if (Array.isArray(turnContext.resolvedCommands) && turnContext.resolvedCommands.length > 0) {
        fragments.push(
            'Resolved commands: '
            + stringifyCompact(turnContext.resolvedCommands.slice(-4), 2500),
        );
    }

    if (Array.isArray(turnContext.committedEvents) && turnContext.committedEvents.length > 0) {
        const events = turnContext.committedEvents.slice(-8).map(event => ({
            id: event?.id,
            type: event?.type,
            payload: event?.payload,
        }));
        fragments.push('Committed events: ' + stringifyCompact(events, 3000));
    }

    const views = turnContext.observation?.views;
    if (views && typeof views === 'object' && !Array.isArray(views)) {
        fragments.push('Current observation: ' + stringifyCompact(views, 4000));
    }

    const query = fragments.join('\n');
    return truncate(query || 'Current game turn', MAX_QUERY_CHARS);
}

export function normalizeMemoryRecallPacket(result, turnContext, query) {
    const rawReferences = Array.isArray(result?.references)
        ? result.references
        : (Array.isArray(result?.selected)
            ? result.selected.map(id => ({ id }))
            : []);
    const references = rawReferences
        .slice(0, MAX_REFERENCES)
        .map(normalizeReference)
        .filter(Boolean);

    const diagnostics = Array.isArray(result?.diagnostics)
        ? result.diagnostics.slice(0, MAX_DIAGNOSTICS).map(value => String(value))
        : [];
    const providers = Array.isArray(result?.providers)
        ? result.providers.slice(0, 32).map(provider => clone(provider))
        : [];

    return deepFreeze({
        id: 'memory-recall:' + String(turnContext.turnId),
        source: 'memory_graph',
        authority: 'historical_context',
        branch: {
            sessionId: turnContext.anchor.sessionId,
            branchId: turnContext.anchor.branchId,
            revisionId: turnContext.anchor.revisionId,
        },
        query: truncate(query, MAX_QUERY_CHARS),
        content: truncate(result?.content ?? result?.text ?? '', MAX_MEMORY_CONTENT_CHARS),
        references,
        tokens: Number.isFinite(Number(result?.tokens ?? result?.tokenCount))
            ? Number(result?.tokens ?? result?.tokenCount)
            : null,
        budget: Number.isFinite(Number(result?.budget))
            ? Number(result.budget)
            : null,
        providers,
        diagnostics,
        provenance: {
            source: 'memory_graph',
            sourceCurrent: true,
            authorityRank: 5,
            referenceIds: references.map(reference => reference.id),
        },
    });
}

export function createMemoryRecallBridge(options = {}) {
    const context = options.context
        || globalThis.Atria?.getContext?.()
        || null;
    const getCurrentBranchIdentity = options.getCurrentBranchIdentity;
    if (typeof getCurrentBranchIdentity !== 'function') {
        throw new Error('Memory Recall Bridge requires getCurrentBranchIdentity()');
    }

    const resolveMemoryApi = () => (
        options.memoryApi
        || context?.getExtensionApi?.('memory-graph')
        || null
    );

    return Object.freeze({
        async recall(turnContext, input = {}) {
            if (!turnContext || typeof turnContext !== 'object') {
                throw new Error('Memory Recall Bridge requires Turn Context');
            }

            assertTurnBranchCurrent(turnContext, getCurrentBranchIdentity());

            const memoryApi = resolveMemoryApi();
            if (!memoryApi || typeof memoryApi.openSession !== 'function') {
                return Object.freeze({
                    status: 'unavailable',
                    packet: null,
                    query: buildMemoryRecallQuery(turnContext),
                });
            }

            const session = await memoryApi.openSession(context);
            if (!session || typeof session.recallMemory !== 'function') {
                return Object.freeze({
                    status: 'unavailable',
                    packet: null,
                    query: buildMemoryRecallQuery(turnContext),
                });
            }

            const query = input.query === undefined
                ? buildMemoryRecallQuery(turnContext)
                : truncate(String(input.query || '').trim(), MAX_QUERY_CHARS);
            if (!query) {
                throw new Error('Memory recall query must not be empty');
            }

            const result = await session.recallMemory(query, {
                signal: input.signal,
                ...(input.at === undefined ? {} : { at: input.at }),
                ...(input.accountExistingState === undefined
                    ? {}
                    : { accountExistingState: input.accountExistingState === true }),
                ...(input.corePacket === undefined
                    ? {}
                    : { corePacket: String(input.corePacket || '') }),
            });

            if (typeof result?.assertCurrent === 'function') {
                result.assertCurrent();
            }
            assertTurnBranchCurrent(turnContext, getCurrentBranchIdentity());

            const packet = normalizeMemoryRecallPacket(result, turnContext, query);

            if (typeof result?.assertCurrent === 'function') {
                result.assertCurrent();
            }
            assertTurnBranchCurrent(turnContext, getCurrentBranchIdentity());

            return Object.freeze({
                status: packet.content || packet.references.length > 0
                    ? 'recalled'
                    : 'empty',
                packet,
                query,
            });
        },
    });
}
