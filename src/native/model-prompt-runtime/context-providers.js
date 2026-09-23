import { assertRequestContextPlan } from './contracts.js';
import { immutable } from './execution-utils.js';
import { promptError } from './prompt-values.js';

// Host readers return already selected facts. These providers neither discover facts
// nor own a second context store; the final rendered request is counted by the Provider Port.
function createContextProvider(kind, readContext) {
    if (typeof readContext !== 'function') throw new TypeError('A context reader is required');
    return Object.freeze({
        async buildRequestContextPlan(request, resolved) {
            const value = await readContext(immutable(request), resolved);
            if (value.source?.kind !== kind) promptError('context_source');
            const reservedOutputTokens = resolved.generation.output.maxTokens ?? value.budget?.reservedOutputTokens;
            const maxTokens = Math.min(value.budget?.maxTokens ?? Infinity, resolved.model.limits.contextTokens - reservedOutputTokens);
            return immutable(assertRequestContextPlan({
                schemaVersion: 1, requestId: request.requestId, source: value.source,
                items: value.items, provenance: value.provenance || [], budget: { maxTokens, reservedOutputTokens },
            }));
        },
    });
}

export const createTaskContextProvider = readContext => createContextProvider('task', readContext);
export const createStudioContextProvider = readContext => createContextProvider('studio', readContext);

export function createNativeSessionContextProvider(readSelectedContext) {
    return createContextProvider('session', async (request, resolved) => {
        const { source, plan } = await readSelectedContext(request, resolved);
        if (plan.schemaVersion !== 1 || plan.revisionId !== source.revisionId || plan.branchId !== source.branchId) promptError('context_revision');
        if (plan.included.some(item => item.metadata?.deferredReserve)) promptError('context_unresolved_reservation');
        return {
            source,
            // Consume selected items exactly once; renderedWarmContext is a duplicate projection.
            items: plan.included.map(item => ({
                id: item.contextItemId,
                kind: item.lane === 'current_user' ? 'context.input'
                    : item.lane === 'recent_raw' ? 'context.history'
                        : item.lane === 'runtime_system' ? 'context.directive' : 'context.fact',
                // Native selection already renders complete, speaker-labelled TurnGroups.
                // Preserve that text as supplied history instead of rebuilding messages.
                content: item.lane === 'recent_raw' ? { role: 'user', content: item.content } : item.content,
                provenance: [
                    { source: 'native.context', ref: item.contextItemId },
                    ...(item.sourceRefs || []).map(ref => ({ source: 'native.context-source', ref: JSON.stringify(ref) })),
                ],
            })),
            budget: {
                maxTokens: plan.budget.promptCeiling - plan.budget.safetyMargin,
                reservedOutputTokens: plan.budget.responseReserve,
            },
            provenance: [{ source: 'native.context', ref: source.revisionId }],
        };
    });
}
