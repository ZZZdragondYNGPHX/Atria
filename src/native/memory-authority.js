import { randomUUID } from 'node:crypto';
import { createSourceLifecycle, NATIVE_PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { projectFacts } from '../../public/scripts/agents/memory/atomic-facts.js';
import { projectTemporalGraph } from '../../public/scripts/agents/memory/temporal-graph.js';
import { normalizeHybridMemorySettings } from '../../public/scripts/agents/memory/settings.js';
import { isHybridMemoryEnabled, isMemorySourceWriteEnabled } from '../../public/scripts/agents/memory/source-policy.js';
import { projectNativeSession } from '../../public/scripts/native/session-projection.js';
import { createMemoryGraphObservationCore } from '../../public/scripts/agents/memory/graph-observation-core.js';
import { getMemoryGraphWriteApi } from '../../public/scripts/agents/memory/write-api.js';
import { buildRuntimeStoreFromGraphPayloadAndMeta, graphPayloadFromStore, metaFieldsFromStore, constants as graphNamespaces } from '../../public/scripts/agents/memory/persistence.js';
import { createFloorStateWithDeps } from '../../public/scripts/floor-state.js';
import { fields, json } from '../../public/shared/native-values.js';
import { hashNativeDocument, withNativeResourceWrite } from './repositories/common.js';
import { assertNativeId } from './identity.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { ConflictError } from '../storage/errors.js';

const factActions = new Set(['create', 'reinforce', 'merge', 'supersede']);
const graphActions = new Set(['entity', 'alias', 'rename', 'merge_entity', 'split_entity', 'resolve_pending', 'relation', 'resolve_conflict']);
const identity = base => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, branchId: base.revision.branchId, packageVersionId: base.session.packageVersionId });
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Native facade over the existing Memory source lifecycle and Session store. */
export class NativeMemoryAuthority {
    constructor({ core, settingsRepo }) { Object.assign(this, { core, settingsRepo }); }
    async _settings(handle) {
        const stored = await this.settingsRepo.get(handle);
        const value = normalizeHybridMemorySettings(structuredClone(stored?.atri_capabilities?.memory_graph ?? {}));
        return { value, fingerprint: hashNativeDocument(value) };
    }
    _context(base, settings) {
        const states = structuredClone(base.states), chat = projectNativeSession(base).chat;
        const key = 'native:' + base.session.sessionId;
        const context = { chat, nativeSnapshot: base, capabilitySettings: { memory_graph: settings },
            getChatState: async namespace => {
                if (![NATIVE_PROVENANCE_NAMESPACE, graphNamespaces.STATE_NAMESPACE, graphNamespaces.META_NAMESPACE].includes(namespace)) throw new TypeError('Unsupported Native Memory namespace');
                return { ok: true, state: structuredClone(states[namespace] ?? null) };
            },
            updateChatState: async (namespace, reduce) => {
                if (![NATIVE_PROVENANCE_NAMESPACE, graphNamespaces.STATE_NAMESPACE, graphNamespaces.META_NAMESPACE].includes(namespace)) throw new TypeError('Unsupported Native Memory namespace');
                states[namespace] = await reduce(structuredClone(states[namespace] ?? null));
                return { ok: true, state: structuredClone(states[namespace]), updated: true };
            },
            saveChat: async () => { throw new TypeError('Native Memory may not rewrite committed Timeline sources'); },
        };
        const lifecycle = createSourceLifecycle({ getContext: () => context, resolveScope: () => ({ key, target: { key } }),
            enabled: () => isHybridMemoryEnabled(settings), writeEnabled: () => isMemorySourceWriteEnabled(settings), newId: randomUUID });
        return { context, lifecycle, states };
    }
    async _read(handle, input, use) {
        assertNativeId(input.sessionId, 'session');
        const base = await this.core.observe(handle, input.sessionId, { revisionId: input.revisionId });
        const settings = await this._settings(handle);
        if (!isHybridMemoryEnabled(settings.value)) throw new TypeError('Native Memory is disabled');
        const runtime = this._context(base, settings.value);
        try {
            const snapshot = await runtime.lifecycle.retrievalSnapshot(runtime.context, { readOnly: true });
            return await use({ base, settings, ...runtime, snapshot });
        } finally { runtime.lifecycle.dispose(); }
    }
    async observe(handle, input) {
        fields(input, ['sessionId', 'revisionId', 'includeInactive', 'offset', 'limit']);
        const offset = input.offset ?? 0, limit = input.limit ?? 50;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || input.includeInactive !== undefined && typeof input.includeInactive !== 'boolean') throw new TypeError('Native Memory observation bounds');
        return this._read(handle, input, ({ base, settings, snapshot, context }) => {
            const options = { includeInactive: input.includeInactive === true };
            const facts = projectFacts(snapshot.state, context.chat, options), graph = projectTemporalGraph(snapshot.state, context.chat, options);
            const page = values => ({ values: values.slice(offset, offset + limit), total: values.length, nextOffset: offset + limit < values.length ? offset + limit : null });
            return { identity: identity(base), readOnly: true, ledgerFingerprint: hashNativeDocument(base.states[NATIVE_PROVENANCE_NAMESPACE] ?? null), settingsFingerprint: settings.fingerprint,
                sourceWritesEnabled: isMemorySourceWriteEnabled(settings.value), facts: page(facts), entities: page(graph.entities), relations: page(graph.relations), pending: page(graph.pending) };
        });
    }
    async sources(handle, input) {
        fields(input, ['sessionId', 'revisionId', 'messageIds']);
        return this._read(handle, input, ({ base, snapshot, context }) => {
            const floors = this._floors(context, input.messageIds);
            const state = structuredClone(snapshot.state), ids = captureEpisodes(state, context.chat, floors, state.scopeId);
            return { identity: identity(base), readOnly: true, sources: ids.map(id => {
                const source = state.episodes[id]; return { episodeId: id, messageIds: source.messageIds,
                    content: source.content.slice(0, 16000), contentHash: hashNativeDocument(source.content), totalChars: source.content.length, role: source.role };
            }) };
        });
    }
    _floors(context, messageIds) {
        if (!Array.isArray(messageIds) || messageIds.length < 1 || messageIds.length > 16 || new Set(messageIds).size !== messageIds.length) throw new TypeError('Select 1..16 exact Native source messages');
        return messageIds.map(messageId => {
            assertNativeId(messageId, 'message');
            const floor = context.chat.findIndex(message => message.atri_native?.messageId === messageId);
            if (floor < 0) throw new TypeError('Memory source message is not in the exact Session Revision');
            return floor;
        });
    }
    _batch(input) {
        json(input);
        for (const [operations, allowed] of [[input.facts ?? [], factActions], [input.graph ?? [], graphActions]]) {
            if (!Array.isArray(operations) || operations.length > 64) throw new TypeError('Native Memory batch bounds');
            for (const operation of operations) {
                if (!operation || !allowed.has(operation.action) || ['actor', 'origin', 'manualId', 'host', 'externalSourceIds'].some(key => Object.hasOwn(operation, key))
                    || operation.type === 'authoritative' || operation.evidence?.some(ref => ref?.externalSourceId)) throw new TypeError('Untrusted Memory origin or operation');
            }
        }
        if (!(input.facts?.length || input.graph?.length) || JSON.stringify(input).length > 128000) throw new TypeError('Empty or oversized Native Memory batch');
    }
    _graph(runtime, settings) {
        const store = buildRuntimeStoreFromGraphPayloadAndMeta(runtime.states[graphNamespaces.STATE_NAMESPACE], runtime.states[graphNamespaces.META_NAMESPACE]);
        const read = createMemoryGraphObservationCore({ resolveStore: () => { runtime.lifecycle.project(store, runtime.context); return store; }, resolveSchema: () => settings.nodeTypeSchema ?? [] });
        const graph = { schema: read.getSchema(), nodes: read.listNodes({ activeOnly: false }), edges: read.listEdges({ excludeInternal: false }) };
        return { store, read, graphFingerprint: hashNativeDocument(graph) };
    }
    async observeGraph(handle, input) {
        fields(input, ['sessionId', 'revisionId', 'offset', 'limit', 'activeOnly']);
        const offset = input.offset ?? 0, limit = input.limit ?? 50;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || input.activeOnly !== undefined && typeof input.activeOnly !== 'boolean') throw new TypeError('Native Graph observation bounds');
        return this._read(handle, input, runtime => {
            const { read, graphFingerprint } = this._graph(runtime, runtime.settings.value);
            const nodes = read.listNodes({ activeOnly: input.activeOnly !== false }), edges = read.listEdges({ excludeInternal: false });
            const page = rows => ({ values: rows.slice(offset, offset + limit), total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null });
            return { identity: identity(runtime.base), readOnly: true, initialized: runtime.base.states[graphNamespaces.STATE_NAMESPACE] !== undefined,
                graphFingerprint, ledgerFingerprint: hashNativeDocument(runtime.base.states[NATIVE_PROVENANCE_NAMESPACE] ?? null), settingsFingerprint: runtime.settings.fingerprint,
                sourceWritesEnabled: isMemorySourceWriteEnabled(runtime.settings.value), schema: read.getSchema(), nodes: page(nodes), edges: page(edges) };
        });
    }
    async applyGraph(handle, input, kind) {
        const methods = { 'node.create': 'createNode', 'node.edit': 'editNode', 'node.delete': 'deleteNode', 'relation.upsert': 'upsertLinks', 'relation.delete': 'deleteLinks', compact: 'compactNodes' };
        if (!Object.hasOwn(methods, kind)) throw new TypeError('Unsupported Native Graph command');
        fields(input, ['sessionId', 'expectedRevisionId', 'expectedBranchId', 'expectedGraphFingerprint', 'expectedSettingsFingerprint', 'commitId', 'messageIds', 'operation']);
        json(input); assertWritable();
        if (JSON.stringify(input).length > 128000 || !validHash(input.expectedGraphFingerprint) || !validHash(input.expectedSettingsFingerprint)
            || typeof input.commitId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.commitId)) throw new TypeError('Exact Graph guards and bounded input required');
        return withNativeResourceWrite(handle, 'settings', async () => {
            const requestFingerprint = hashNativeDocument({ kind, input });
            const prior = await this.core._sessions.getCommitReceipt(handle, input.sessionId, input.commitId);
            if (prior) {
                if (prior.fingerprint !== requestFingerprint) throw new ConflictError('native_commit_id_conflict');
                return { identity: identity(await this.core.observe(handle, input.sessionId, { revisionId: prior.revisionId })), commitReceipt: prior, reconciled: true };
            }
            const base = await this.core.observe(handle, input.sessionId), settings = await this._settings(handle), runtime = this._context(base, settings.value);
            let floor;
            try {
                if (!isHybridMemoryEnabled(settings.value) || !isMemorySourceWriteEnabled(settings.value)) throw new TypeError('Native Graph writes require existing owner source-write opt-in');
                await runtime.lifecycle.retrievalSnapshot(runtime.context, { readOnly: true });
                const { store, graphFingerprint } = this._graph(runtime, settings.value);
                if (base.revision.revisionId !== input.expectedRevisionId || base.revision.branchId !== input.expectedBranchId
                    || graphFingerprint !== input.expectedGraphFingerprint || settings.fingerprint !== input.expectedSettingsFingerprint) throw new ConflictError('native_memory_graph_conflict');
                const before = structuredClone(store);
                const ticket = await runtime.lifecycle.capture(runtime.context, this._floors(runtime.context, input.messageIds));
                let changed = false;
                floor = createFloorStateWithDeps({ namespace: graphNamespaces.STATE_NAMESPACE }, { getChatState: runtime.context.getChatState,
                    updateChatState: runtime.context.updateChatState, getChat: () => runtime.context.chat, isNativeSession: () => true });
                const write = getMemoryGraphWriteApi(store, runtime.context, { onCommit: async after => {
                    runtime.lifecycle.assertTicket(ticket, runtime.context);
                    await runtime.lifecycle.bind(runtime.context, before, after, ticket);
                    const saved = await floor.update(() => graphPayloadFromStore(after));
                    if (!saved.ok) throw new Error('Native Floor-State Graph update rejected');
                    await runtime.context.updateChatState(graphNamespaces.META_NAMESPACE, () => metaFieldsFromStore(after));
                    changed = true;
                } });
                const result = await write[methods[kind]](input.operation);
                if (!changed) return { identity: identity(base), changed: false, result };
                runtime.lifecycle.commitGuard(runtime.context, store)?.();
                const committed = await this.core._publish(handle, base, { states: runtime.states, commitId: input.commitId, requestFingerprint, effectPolicy: 'no-background-model' });
                return { identity: identity(committed), commitReceipt: await this.core._sessions.getCommitReceipt(handle, input.sessionId, input.commitId), changed: true, result, reconciled: false };
            } finally { await floor?.destroy(); runtime.lifecycle.dispose(); }
        });
    }
    async apply(handle, input) {
        // Settings writes use this original authority lock too. Keep source-write
        // consent and schema fixed through the final Native Session publication.
        return withNativeResourceWrite(handle, 'settings', () => this._apply(handle, input));
    }
    async _apply(handle, input) {
        fields(input, ['sessionId', 'expectedRevisionId', 'expectedBranchId', 'expectedLedgerFingerprint', 'expectedSettingsFingerprint', 'commitId', 'messageIds', 'facts', 'graph']);
        this._batch(input); assertWritable();
        assertNativeId(input.sessionId, 'session'); assertNativeId(input.expectedRevisionId, 'revision'); assertNativeId(input.expectedBranchId, 'branch');
        if (!validHash(input.expectedLedgerFingerprint) || !validHash(input.expectedSettingsFingerprint) || typeof input.commitId !== 'string'
            || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.commitId)) throw new TypeError('Exact Memory guards and stable commit identity required');
        const requestFingerprint = hashNativeDocument(input);
        const prior = await this.core._sessions.getCommitReceipt(handle, input.sessionId, input.commitId);
        if (prior) {
            if (prior.fingerprint !== requestFingerprint) throw new ConflictError('native_commit_id_conflict');
            const base = await this.core.observe(handle, input.sessionId, { revisionId: prior.revisionId });
            return { identity: identity(base), commitReceipt: prior, reconciled: true };
        }
        const base = await this.core.observe(handle, input.sessionId), settings = await this._settings(handle);
        if (base.revision.revisionId !== input.expectedRevisionId || base.revision.branchId !== input.expectedBranchId
            || hashNativeDocument(base.states[NATIVE_PROVENANCE_NAMESPACE] ?? null) !== input.expectedLedgerFingerprint || settings.fingerprint !== input.expectedSettingsFingerprint) throw new ConflictError('native_memory_source_conflict');
        if (!isHybridMemoryEnabled(settings.value) || !isMemorySourceWriteEnabled(settings.value)) throw new TypeError('Native Memory source writes require existing owner opt-in');
        const runtime = this._context(base, settings.value);
        try {
            const floors = this._floors(runtime.context, input.messageIds);
            const ticket = await runtime.lifecycle.capture(runtime.context, floors);
            const result = await runtime.lifecycle.writeBatch(runtime.context, input.facts ?? [], input.graph ?? [], ticket);
            runtime.lifecycle.assertTicket(ticket, runtime.context);
            if ((await this._settings(handle)).fingerprint !== settings.fingerprint) throw new ConflictError('native_memory_settings_conflict');
            const committed = await this.core._publish(handle, base, { states: runtime.states, commitId: input.commitId, requestFingerprint, effectPolicy: 'no-background-model' });
            return { identity: identity(committed), commitReceipt: await this.core._sessions.getCommitReceipt(handle, input.sessionId, input.commitId), result, reconciled: false };
        } finally { runtime.lifecycle.dispose(); }
    }
}
