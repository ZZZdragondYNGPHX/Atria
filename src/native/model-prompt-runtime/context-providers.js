import { assertRequestContextPlan } from './contracts.js';
import { immutable, effectiveOutputReserve } from './execution-utils.js';
import { promptError } from './prompt-values.js';

const sourceDataLanes = new Set(['recent_raw', 'memory', 'narrative_spine']);

// Host readers return already selected facts. These providers neither discover facts
// nor own a second context store; the final rendered request is counted by the Provider Port.
function createContextProvider(kind, readContext) {
    if (typeof readContext !== 'function') throw new TypeError('A context reader is required');
    return Object.freeze({
        async buildRequestContextPlan(request, resolved) {
            const value = await readContext(immutable(request), resolved);
            if (value.source?.kind !== kind) promptError('context_source');
            const reservedOutputTokens = effectiveOutputReserve(resolved, value.budget?.reservedOutputTokens);
            const maxTokens = Math.min(value.budget?.maxTokens ?? Infinity, resolved.model.limits.contextTokens - reservedOutputTokens);
            return immutable(assertRequestContextPlan({
                schemaVersion: 1, requestId: request.requestId, source: value.source,
                items: value.items, ...(value.nativeSelection ? { nativeSelection: value.nativeSelection } : {}), ...(value.personaEvidence ? { personaEvidence: value.personaEvidence } : {}), provenance: value.provenance || [], budget: { maxTokens, reservedOutputTokens },
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
                kind: item.lane === 'player_persona' ? 'context.player-persona' : item.lane === 'current_user' ? 'context.input'
                    : sourceDataLanes.has(item.lane) ? 'context.history'
                        : item.lane === 'runtime_system' ? 'context.directive' : 'context.fact',
                // Native selection already renders complete, speaker-labelled TurnGroups.
                // Memory and narrative summaries are source data: do not promote quotations to
                // system instructions. Current state continues through its own lane.
                content: sourceDataLanes.has(item.lane) ? { role: 'user', content: item.content } : item.content,
                provenance: [
                    { source: 'native.context', ref: item.contextItemId },
                    ...(item.sourceRefs || []).map(ref => ({ source: 'native.context-source', ref: JSON.stringify(ref) })),
                    ...(item.metadata?.processing ?? []).map(ref => ({ source: 'native.processing', ref: JSON.stringify({
                        processorId: ref.processorId, stage: ref.stage, inputHash: ref.inputHash, outputHash: ref.outputHash,
                        ...(ref.execution ? { resourceHash: ref.execution.resourceHash } : {}),
                    }) })),
                ],
            })),
            personaEvidence: plan.personaEvidence,
            ...(plan.knowledgeSelection ? { nativeSelection: { revisionId: plan.revisionId, branchId: plan.branchId,
                pendingState: plan.knowledgeSelection.pendingState, targetKey: plan.knowledgeSelection.targetKey,
                selectedKnowledgeIdentities: plan.sourceSelection.selectedKnowledgeIdentities,
                rejected: plan.knowledgeSelection.rejected.map(item => ({ identity: item.identity, reason: item.reason })),
                derivations: plan.derivationEvidence ?? [],
            } } : {}),
            budget: {
                maxTokens: plan.budget.promptCeiling - plan.budget.safetyMargin,
                reservedOutputTokens: plan.budget.responseReserve,
            },
            provenance: [{ source: 'native.context', ref: source.revisionId }],
        };
    });
}
