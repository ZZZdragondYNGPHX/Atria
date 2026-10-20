import { authorityValue } from '../authority-turn.js';
import { informationDefinition } from '../../../public/shared/native-information-runtime.js';

export function emptyNativeContextPlan(request, resolved, source) {
    return { schemaVersion: 1, requestId: request.requestId, source, items: [], provenance: [],
        budget: { maxTokens: resolved.model.limits.contextTokens - resolved.model.limits.outputTokens, reservedOutputTokens: resolved.model.limits.outputTokens } };
}

// Shared original Authority narration boundary. Candidate projections are
// observations; only the original finalizer can adopt their mechanical result.
export function authorityContextItems(selected, snapshot, authorityContext) {
    return authorityContext ? selected.items.filter(item => item.id.startsWith('projection:') || item.kind === 'context.player-persona'
        || item.id.startsWith('world:')
        || item.kind === 'context.history' || item.kind === 'context.input'
        || (informationDefinition(snapshot) && (item.id.startsWith('knowledge:') || item.id.startsWith('memory:')))) : selected.items;
}

export function appendAuthorityContext(items, authorityContext) {
    if (!authorityContext) return;
    const payload = authorityContext.mode === 'resolver' ? authorityContext.payload
        : { instruction: 'Narrate only the frozen authority result. You have no mechanical write authority. Receipt communications are exact speaker messages published separately with this result; do not repeat them as new speech in the narrator prose.', receipt: authorityContext.receipt };
    items.push({ kind: 'context.input', id: 'authority-turn', content: JSON.stringify(authorityValue(payload)), provenance: [{ source: 'host.authority' }] });
    authorityValue(items);
}

export function narrowNativeContextSelection(selected, snapshot, items) {
    return selected.nativeSelection && { ...selected.nativeSelection,
        pendingState: { schemaVersion: 1, effects: Object.fromEntries(Object.entries(selected.nativeSelection.pendingState.effects)
            .filter(([identity]) => items.some(item => item.id === 'knowledge:' + identity) || Object.hasOwn(snapshot.states.atri_knowledge_runtime?.targets?.[selected.nativeSelection.targetKey]?.effects ?? {}, identity))) },
        selectedKnowledgeIdentities: selected.nativeSelection.selectedKnowledgeIdentities.filter(identity => items.some(item => item.id === 'knowledge:' + identity)),
    };
}

export function authorityContextPlan(selected, snapshot, authorityContext) {
    const items = [...authorityContextItems(selected, snapshot, authorityContext)];
    appendAuthorityContext(items, authorityContext);
    const nativeSelection = narrowNativeContextSelection(selected, snapshot, items);
    return { ...selected, items, ...(nativeSelection ? { nativeSelection } : {}) };
}
