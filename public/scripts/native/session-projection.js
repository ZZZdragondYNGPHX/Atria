// Runtime ABI only. No storage, filename lookup, latest-pointer resolution or host DOM.
const copy = value => JSON.parse(JSON.stringify(value));
const EXTRA_FIELDS = ['bias', 'reasoning', 'reasoning_duration', 'reasoning_type', 'token_count', 'api', 'model',
    'isSmallSys', 'isLargeSys', 'display_text', 'title', 'type', 'tool_invocations'];
const MESSAGE_FIELDS = ['send_date', 'gen_started', 'gen_finished', 'gen_id', 'is_name', 'force_avatar'];
export const nativeAssetUrl = assetId => `/api/native/session/asset/${encodeURIComponent(assetId)}`;

export function runtimeMetadata(message) {
    const runtime = { extra: {} };
    for (const key of MESSAGE_FIELDS) if (message[key] !== undefined) runtime[key] = message[key];
    for (const key of EXTRA_FIELDS) if (message.extra?.[key] !== undefined) runtime.extra[key] = message.extra[key];
    const attachments = [];
    for (const [field, kind] of [['files', 'file'], ['media', 'media']]) {
        for (const item of message.extra?.[field] ?? []) {
            // URLs are presentation only; never infer identity from one (even our own URL).
            if (!item.assetId) throw new Error('Native attachments require an AssetStore assetId');
            attachments.push({ assetId: item.assetId, kind, title: item.name ?? item.title ?? '',
                size: item.size ?? 0, mediaType: item.type ?? null, created: item.created ?? 0 });
        }
    }
    return copy({ displayName: message.name ?? '', runtime, attachments });
}

function variantMessage(entry, variant, actors) {
    const metadata = variant.metadata ?? {};
    const runtime = metadata.runtime ?? {};
    const extra = copy(runtime.extra ?? {});
    for (const asset of metadata.attachments ?? []) {
        const field = asset.kind === 'file' ? 'files' : 'media';
        (extra[field] ??= []).push({ assetId: asset.assetId, url: nativeAssetUrl(asset.assetId),
            name: asset.title, title: asset.title, size: asset.size, type: asset.mediaType, created: asset.created });
    }
    if (extra.media?.length) { extra.media_index = 0; extra.inline_image = true; }
    return { ...runtime, name: metadata.displayName || actors.find(actor => actor.actorId === entry.actorId)?.displayName
        || (entry.role === 'user' ? 'User' : 'Narrator'),
    is_user: entry.role === 'user', is_system: entry.role === 'system', mes: variant.content,
    send_date: runtime.send_date ?? variant.createdAt, extra };
}

export function projectNativeSession(snapshot) {
    const { manifest, entryPoint, revision } = snapshot;
    const actors = entryPoint.actorIds.map(id => manifest.actors.find(actor => actor.actorId === id));
    const actor = actors.find(item => item.actorId === entryPoint.primaryActorId) ?? actors[0];
    const profile = actor?.profile ?? {};
    const data = { name: actor?.displayName ?? manifest.name, description: profile.description ?? '',
        personality: profile.personality ?? '', scenario: profile.scenario ?? '', mes_example: profile.examples ?? profile.mes_example ?? '',
        first_mes: '', alternate_greetings: [], system_prompt: profile.systemPrompt ?? '',
        post_history_instructions: profile.postHistoryInstructions ?? '', extensions: {} };
    // avatar/array index are transient host ABI; they never identify or address Native stores.
    const character = { ...data, data, avatar: 'none', chat: snapshot.session.sessionId,
        atri_native: { actorId: actor?.actorId ?? null, packageVersionId: manifest.packageVersionId } };
    const variants = new Map(snapshot.variants.map(variant => [variant.variantId, variant]));
    const chat = snapshot.timeline.map(entry => {
        const messages = entry.variantIds.map(id => variantMessage(entry, variants.get(id), manifest.actors));
        const swipe_id = entry.variantIds.indexOf(entry.activeVariantId);
        return { ...messages[swipe_id], swipes: messages.map(item => item.mes), swipe_id,
            swipe_info: messages.map(item => ({ send_date: item.send_date, gen_started: item.gen_started,
                gen_finished: item.gen_finished, extra: copy(item.extra) })),
            atri_native: { messageId: entry.messageId, variantIds: [...entry.variantIds] } };
    });
    return { character, chat, metadata: { integrity: revision.revisionId, tainted: true },
        sessionId: snapshot.session.sessionId, branchId: revision.branchId, revisionId: revision.revisionId };
}

/** Translate changes to a known projection into commands. This cannot import/reconstruct a Session. */
export function timelineIntents(snapshot, messages) {
    const projected = projectNativeSession(snapshot).chat;
    const known = new Map(snapshot.timeline.map((entry, index) => [entry.messageId, { entry, message: projected[index] }]));
    const seen = new Set();
    const commands = [];
    let previousIndex = -1;
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index];
        const messageId = message.atri_native?.messageId;
        if (!messageId) {
            const next = messages.slice(index + 1).find(item => item.atri_native?.messageId);
            commands.push({ type: 'append', beforeMessageId: next?.atri_native.messageId,
                draft: { role: message.is_system ? 'system' : message.is_user ? 'user' : 'assistant',
                    ...(!message.is_user && !message.is_system && snapshot.entryPoint.actorIds.length
                        ? { actorId: snapshot.entryPoint.primaryActorId ?? snapshot.entryPoint.actorIds[0] } : {}),
                    content: message.mes ?? '', metadata: runtimeMetadata(message) } });
            continue;
        }
        const existing = known.get(messageId);
        if (!existing || seen.has(messageId)) throw new Error('Unknown or duplicated Native message identity');
        seen.add(messageId);
        const nativeIndex = snapshot.timeline.indexOf(existing.entry);
        if (nativeIndex < previousIndex) throw new Error('Native message reorder requires an explicit command');
        previousIndex = nativeIndex;
        if (message.is_user !== existing.message.is_user || message.is_system !== existing.message.is_system) {
            throw new Error('Native message role is immutable');
        }
        const swipes = message.swipes?.length ? message.swipes : [message.mes];
        const selected = message.swipe_id ?? 0;
        if (!Number.isInteger(selected) || selected < 0 || selected >= swipes.length) throw new Error('Invalid Native swipe selection');
        const ids = message.atri_native.variantIds;
        // Removal of a swipe updates this adapter-local ID vector at the explicit delete seam.
        for (const id of existing.entry.variantIds) {
            if (!ids.includes(id)) commands.push({ type: 'removeVariant', messageId, variantId: id });
        }
        for (let position = 0; position < swipes.length; position++) {
            const id = ids[position];
            const originalIndex = existing.entry.variantIds.indexOf(id);
            if (id && originalIndex < 0) throw new Error('Unknown Native Variant identity');
            const original = originalIndex < 0 ? null : existing.message.swipe_info[originalIndex];
            const info = position === selected ? message : { ...message, ...(message.swipe_info?.[position] ?? {}), mes: swipes[position] };
            const content = position === selected ? message.mes : swipes[position];
            const metadata = runtimeMetadata(info);
            const oldMetadata = original ? runtimeMetadata({ ...existing.message, ...original }) : null;
            if (!id || content !== existing.message.swipes[originalIndex] || JSON.stringify(metadata) !== JSON.stringify(oldMetadata)) {
                commands.push({ type: 'revise', messageId, replaceVariantId: id, select: position === selected,
                    draft: { content, metadata } });
            } else if (position === selected && id !== existing.entry.activeVariantId) {
                commands.push({ type: 'select', messageId, variantId: id });
            }
        }
    }
    for (const entry of snapshot.timeline) if (!seen.has(entry.messageId)) commands.unshift({ type: 'remove', messageId: entry.messageId });
    return commands;
}

/** N4 compatibility candidates only, not N6 authority ranking/KnowledgePlan compilation. */
export function projectKnowledgeEntries(snapshot) {
    const sources = [...snapshot.manifest.knowledge.map(value => ({ kind: 'package', snapshot: value })), ...snapshot.knowledge.snapshots];
    const entries = [];
    for (const binding of snapshot.knowledge.bindings.filter(item => item.enabled)) {
        const source = sources.find(item => item.kind === binding.source.kind
            && item.snapshot.revision.knowledgeRevisionId === binding.source.knowledgeRevisionId
            && item.snapshot.knowledgeBase.knowledgeBaseId === binding.source.knowledgeBaseId);
        if (!source) throw new Error('Missing pinned Native Knowledge snapshot');
        // Target/override policy needs N6; fail closed instead of leaking scoped content into a global context.
        if (binding.mode !== 'augment' || binding.target || binding.visibility?.length) continue;
        for (const item of source.snapshot.entries) {
            if (item.delivery?.target || item.delivery?.visibility?.length) continue;
            const key = [...(item.discovery?.keywords ?? []), ...(item.discovery?.aliases ?? []), ...(item.discovery?.regex ?? [])];
            entries.push({ uid: entries.length, world: binding.knowledgeBindingId, key, keysecondary: [],
                content: item.content, comment: '', constant: key.length === 0, selective: false, disable: false,
                order: item.delivery?.priority ?? binding.priority ?? 100, position: item.delivery?.position === 'after' ? 1 : 0,
                excludeRecursion: false, preventRecursion: false, delayUntilRecursion: false,
                probability: item.lifecycle?.probability ?? 100, useProbability: true,
                sticky: item.lifecycle?.sticky ?? 0, cooldown: item.lifecycle?.cooldown ?? 0, delay: item.lifecycle?.delay ?? 0,
                ...(item.applicability ?? {}),
                atri_native: { ...binding.source, knowledgeBindingId: binding.knowledgeBindingId, knowledgeEntryId: item.knowledgeEntryId } });
        }
    }
    return entries;
}
