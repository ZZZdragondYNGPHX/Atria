// Runtime ABI only. No storage, filename lookup, latest-pointer resolution or host DOM.
const copy = value => JSON.parse(JSON.stringify(value));
const EXTRA_FIELDS = ['bias', 'reasoning', 'reasoning_duration', 'reasoning_type', 'token_count', 'api', 'model',
    'isSmallSys', 'isLargeSys', 'display_text', 'title', 'type', 'tool_invocations'];
const MESSAGE_FIELDS = ['send_date', 'gen_started', 'gen_finished', 'gen_id', 'is_name', 'force_avatar'];
export const nativeAssetUrl = assetId => `/api/native/session/asset/${encodeURIComponent(assetId)}`;

export class NativeCommittedTimelineMutationError extends Error {
    constructor(message = 'Committed Native Timeline mutation detected') {
        super(message);
        this.name = 'NativeCommittedTimelineMutationError';
        this.code = 'native_committed_timeline_mutation';
    }
}

export function committedTimelineMutation(message) {
    return new NativeCommittedTimelineMutationError(message);
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
    }
    return value;
}

function runtimeRole(message) {
    return message?.is_system ? 'system' : message?.is_user ? 'user' : 'assistant';
}

function runtimeVariantMetadata(message, position) {
    const selected = Number(message?.swipe_id ?? 0);
    if (position === selected) return runtimeMetadata(message);
    const swipeInfo = message?.swipe_info?.[position] ?? {};
    return runtimeMetadata({
        ...message,
        ...swipeInfo,
        mes: message?.swipes?.[position] ?? '',
        extra: swipeInfo.extra ?? message?.extra ?? {},
    });
}

function authorityVariantMetadata(message, position) {
    const metadata = runtimeVariantMetadata(message, position);
    // Presentation overlays are not Timeline authority. In particular,
    // translation extensions use extra.display_text as a cache/view override;
    // changing it must never become a committed-history mutation.
    if (metadata?.runtime?.extra) {
        delete metadata.runtime.extra.display_text;
    }
    return metadata;
}

export function committedMessageFingerprint(message) {
    const ids = Array.isArray(message?.atri_native?.variantIds) ? message.atri_native.variantIds : [];
    const swipes = Array.isArray(message?.swipes) && message.swipes.length ? message.swipes : [message?.mes ?? ''];
    const selected = Number(message?.swipe_id ?? 0);
    const canonical = {
        messageId: message?.atri_native?.messageId ?? null,
        role: runtimeRole(message),
        actorId: message?.atri_native?.actorId ?? null,
        selectedVariantId: Number.isInteger(selected) ? ids[selected] ?? null : null,
        variantIds: [...ids],
        variants: swipes.map((content, position) => ({
            variantId: ids[position] ?? null,
            content: position === selected ? (message?.mes ?? '') : content,
            metadata: authorityVariantMetadata(message, position),
        })),
        provenance: copy(message?.atri_native?.provenance ?? null),
    };
    return JSON.stringify(stableValue(canonical));
}

export function assertCommittedProjection(snapshot, messages, { allowMessageIds = [] } = {}) {
    const projected = projectNativeSession(snapshot).chat;
    const allowed = new Set(allowMessageIds);
    if (!Array.isArray(messages) || messages.length < projected.length) {
        throw committedTimelineMutation('Committed Native Timeline messages cannot be deleted');
    }
    for (let index = 0; index < projected.length; index++) {
        const expected = projected[index];
        const actual = messages[index];
        if (actual?.atri_native?.messageId !== expected.atri_native.messageId) {
            throw committedTimelineMutation('Committed Native Timeline order/identity changed');
        }
        if (allowed.has(expected.atri_native.messageId)) continue;
        const expectedFingerprint = expected.atri_native.committedFingerprint;
        let actualFingerprint;
        try {
            actualFingerprint = committedMessageFingerprint(actual);
        } catch {
            throw committedTimelineMutation(`Committed Native Timeline message ${expected.atri_native.messageId} became non-canonical`);
        }
        if (actualFingerprint !== expectedFingerprint) {
            throw committedTimelineMutation(`Committed Native Timeline message ${expected.atri_native.messageId} changed`);
        }
    }
    return projected.length;
}

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
        const activeVariant = variants.get(entry.activeVariantId);
        const message = { ...messages[swipe_id], swipes: messages.map(item => item.mes), swipe_id,
            swipe_info: messages.map(item => ({ send_date: item.send_date, gen_started: item.gen_started,
                gen_finished: item.gen_finished, extra: copy(item.extra) })),
            atri_native: {
                messageId: entry.messageId,
                variantIds: [...entry.variantIds],
                actorId: entry.actorId ?? null,
                role: entry.role,
                provenance: copy(activeVariant?.metadata?.provenance ?? null),
            } };
        message.atri_native.committedFingerprint = committedMessageFingerprint(message);
        return message;
    });
    const nativeVariables = snapshot.states?.atri_variables?.values;
    const variables = nativeVariables && typeof nativeVariables === 'object' && !Array.isArray(nativeVariables)
        ? copy(nativeVariables)
        : {};
    return { character, chat, metadata: { integrity: revision.revisionId, tainted: true, variables },
        sessionId: snapshot.session.sessionId, branchId: revision.branchId, revisionId: revision.revisionId };
}

/**
 * Validate the immutable committed prefix and convert only trailing Draft
 * messages into append commands. Any change to an already committed message
 * is a write-barrier violation, never a request to revise Native history.
 */
export function timelineIntents(snapshot, messages) {
    const committedLength = assertCommittedProjection(snapshot, messages);
    const commands = [];
    for (const message of messages.slice(committedLength)) {
        if (message?.atri_native?.messageId) {
            throw committedTimelineMutation('Committed Native Timeline messages cannot be reordered or reinserted');
        }
        commands.push({
            type: 'append',
            draft: {
                role: message.is_system ? 'system' : message.is_user ? 'user' : 'assistant',
                ...(!message.is_user && !message.is_system && snapshot.entryPoint.actorIds.length
                    ? { actorId: snapshot.entryPoint.primaryActorId ?? snapshot.entryPoint.actorIds[0] }
                    : {}),
                content: message.mes ?? '',
                metadata: runtimeMetadata(message),
            },
        });
    }
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
