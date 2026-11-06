import { projectActorDefinition } from './native-actor-profile.js';

// Accepted Session definitions only; display fallbacks are not textual subjects.
export function nativePromptIdentity(snapshot, { actorId, seatId, participantIds } = {}) {
    const ids = participantIds ?? snapshot.entryPoint?.actorIds ?? [];
    const subjectId = actorId ?? snapshot.entryPoint?.primaryActorId ?? (ids.length === 1 ? ids[0] : undefined);
    const actor = subjectId ? projectActorDefinition(snapshot, subjectId) : null;
    const personas = snapshot.states?.atri_player_persona;
    const persona = seatId ? personas?.seats?.[seatId] : personas?.solo;
    return { user: persona?.snapshot?.name, char: actor?.identity.displayName,
        group: ids.map(id => projectActorDefinition(snapshot, id)?.identity.displayName).filter(Boolean).join(', '), actorId: subjectId };
}

export function nativePromptSource(item) {
    if (item.metadata?.promptSource) return item.metadata.promptSource;
    if (item.lane === 'player_persona') return { category: 'persona', field: 'description' };
    if (['recent_raw', 'memory', 'narrative_spine'].includes(item.lane)) return { category: 'history' };
    if (['knowledge', 'world_text'].includes(item.lane)) return { category: 'world', field: 'before' };
    return {};
}

export function nativePromptActorItems(snapshot, { categories = [], actorIds } = {}) {
    if (!snapshot.entryPoint) return [];
    const result = [], identity = nativePromptIdentity(snapshot);
    const identityDefinition = identity.actorId ? projectActorDefinition(snapshot, identity.actorId) : null;
    const add = (category, field, text, definition) => {
        if (!categories.includes(category) || typeof text !== 'string' || !text) return;
        // Authored profiles use {{user}}/{{char}} like character cards; textMode 'literal' keeps them verbatim.
        // Without a chosen Persona the {{user}} token stays as written instead of failing the turn.
        const owner = definition ?? identityDefinition;
        if (owner?.scopedRaw.textMode !== 'literal') text = text.replace(/\{\{\s*(user|char)\s*\}\}/gi, (token, key) =>
            (key.toLowerCase() === 'char' ? owner?.identity.displayName : identity.user) ?? token);
        result.push({ contextItemId: 'authored:' + category + ':' + (definition?.identity.actorId ?? 'entry') + ':' + field,
            lane: 'current_state_event', authority: 'actor_definition', authorityRank: 100, priority: 0,
            content: (definition ? definition.identity.displayName + ' — ' + field + ':\n' : 'Authored scenario (not current World state):\n') + text,
            sourceRefs: [{ kind: 'runtime', providerId: 'native.authored-profile', contentIdentity: JSON.stringify(definition?.source ?? { entryPointId: snapshot.entryPoint.entryPointId }) }],
            metadata: { promptSource: { category, field, ...(definition ? { actorId: definition.identity.actorId } : {}) } } });
    };
    for (const id of actorIds ?? snapshot.entryPoint.actorIds) {
        const definition = projectActorDefinition(snapshot, id);
        if (!definition) continue;
        add('actor', 'description', definition.authored.description, definition);
        add('actor', 'personality', definition.authored.personality, definition);
        add('examples', 'examples', definition.expression.examples ?? definition.expression.mes_example, definition);
    }
    const definition = identity.actorId && (!actorIds || actorIds.includes(identity.actorId)) ? projectActorDefinition(snapshot, identity.actorId) : null;
    add('scenario', 'scenario', snapshot.states?.atri_prompt_context?.scenario ?? snapshot.entryPoint.scenario ?? definition?.authored.scenario);
    return result;
}

export function nativePresetHistoryItems(snapshot, recent, supplementalContent = {}) {
    const eligible = new Set(recent.flatMap(item => item.metadata?.messageIds ?? []));
    if (!eligible.size) return [];
    const variants = new Map(snapshot.variants.map(variant => [variant.variantId, variant]));
    const result = [];
    for (const [index, message] of snapshot.timeline.entries()) {
        if (!eligible.has(message.messageId)) continue;
        const variant = variants.get(message.activeVariantId), policies = variant?.metadata?.runtime?.extra?.preset_content?.contextPolicies;
        if (!policies) continue;
        const depth = snapshot.timeline.length - index - 1;
        for (const block of variant.projection?.flow ?? []) {
            if (block.type !== 'preset.content' || !['candidate', 'latest'].includes(policies[block.data.type])
                || policies[block.data.type] === 'latest' && depth !== 0) continue;
            result.push({ contextItemId: 'supplement:' + message.messageId + ':' + block.id, lane: 'recent_raw',
                authority: 'model_generated', authorityRank: 10, priority: 0,
                content: 'Supplemental model-authored reference, not an occurred World fact: ' + JSON.stringify({ type: block.data.type, data: supplementalContent[variant.variantId + ':' + block.id] ?? block.data.value }),
                sourceRefs: [{ kind: 'timeline', messageId: message.messageId, variantId: variant.variantId, revisionId: message.revisionId ?? snapshot.revision.revisionId, sequence: message.sequence, branchId: snapshot.revision.branchId }],
                metadata: { promptSource: { category: 'history', field: 'supplement' }, messageId: message.messageId, variantId: variant.variantId, blockId: block.id, depth } });
        }
    }
    return result;
}
