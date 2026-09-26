import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { validateMessageBlocks } from '../../public/scripts/native/experience/ui/message-templates.js';
import { assertMessageProjection, assertTurnEnvelope } from '../../public/shared/native-message-contract.js';
import { normalizeNativeRegexScripts } from '../../public/shared/native-regex.js';
import { assertPackagedWorldSnapshot } from './world-knowledge.js';
import {
    assertNativeResourceKey, assertSession, assertSessionRevision, assertTimelineEntry, assertVariant,
    NATIVE_RESOURCE_KINDS,
} from './contracts.js';
import { createNativeId, assertNativeId } from './identity.js';
import { resolveSessionKnowledge, validateKnowledgeBindingSet, packageKnowledgeManifest } from './session-knowledge.js';
import { cloneNativeDocument, hashNativeDocument } from './repositories/common.js';
import {
    SESSION_CORE_NAMESPACE, TIMELINE_NAMESPACE, KNOWLEDGE_NAMESPACE, RESERVED_SESSION_NAMESPACES,
} from './session-snapshot.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { ACTION_RECEIPTS_NAMESPACE, assertActionRequest, actionReceipts, assertCompensation } from './action-receipts.js';

// Projection is a first-class immutable Variant field, never Timeline metadata.
// User and assistant messages may project; only assistant turns accept envelopes.
function normalizeMessageDraft(draft) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new TypeError('Timeline draft must be a record');
    const { envelope: rawEnvelope, projection: rawProjection, ...entryDraft } = draft;
    let projection;
    let diagnostics = [];
    if (Object.hasOwn(draft, 'envelope')) {
        if (draft.role !== 'assistant') throw new TypeError('TurnEnvelope requires an assistant message');
        const envelope = assertTurnEnvelope(rawEnvelope);
        if (Object.hasOwn(draft, 'content') && draft.content !== envelope.narrative) throw new TypeError('Conflicting draft content and envelope narrative');
        if (Object.hasOwn(draft, 'projection')) {
            const supplied = assertMessageProjection(rawProjection, envelope.narrative);
            if (!envelope.projection || hashNativeDocument(supplied) !== hashNativeDocument(envelope.projection)) {
                throw new TypeError('Conflicting draft projection and envelope projection');
            }
        }
        entryDraft.content = envelope.narrative;
        projection = envelope.projection;
        diagnostics = envelope.diagnostics;
    } else if (Object.hasOwn(draft, 'projection')) {
        projection = assertMessageProjection(rawProjection, draft.content ?? '');
    }
    if (projection && !['user', 'assistant'].includes(draft.role)) throw new TypeError('MessageProjection requires a user or assistant message');
    if (Object.hasOwn(entryDraft.metadata ?? {}, 'atri_turn_diagnostics')) throw new TypeError('Turn diagnostics metadata is reserved');
    return { entryDraft, projection, diagnostics };
}

function timelineSelection(entry) {
    return { messageId: entry.messageId, branchId: entry.branchId,
        variantIds: entry.variantIds, activeVariantId: entry.activeVariantId };
}

function selectedWorlds(states, manifest, entryPoint) {
    const selection = states.atri_world_selection;
    if (!selection) return manifest.worlds.filter(item => entryPoint.worldIds.includes(item.world.worldId));
    if (selection.schemaVersion !== 1 || !Array.isArray(selection.worlds)) throw new TypeError('Invalid Session World selection');
    const worlds = selection.worlds.map(assertPackagedWorldSnapshot);
    if (new Set(worlds.map(item => item.world.worldId)).size !== worlds.length || (selection.primaryWorldId !== null && !worlds.some(item => item.world.worldId === selection.primaryWorldId))) throw new TypeError('Invalid primary World');
    return worlds;
}
function initialWorldState(manifest, entryPoint, selection) {
    const worlds = selectedWorlds({ atri_world_selection: selection }, manifest, entryPoint);
    const originalPrimary = entryPoint.primaryWorldId ?? (entryPoint.worldIds.length === 1 ? entryPoint.worldIds[0] : null);
    const overlay = cloneNativeDocument(selection && selection.primaryWorldId !== originalPrimary ? {} : entryPoint.initialStateOverlay ?? {});
    const primaryWorldId = selection ? selection.primaryWorldId : entryPoint.primaryWorldId ?? (worlds.length === 1 ? worlds[0].world.worldId : null);
    if (Object.prototype.toString.call(overlay) !== '[object Object]') throw new TypeError('EntryPoint initialStateOverlay must be an object');
    if (worlds.length > 1 && !primaryWorldId && Object.keys(overlay).length) {
        throw new TypeError('A multi-World EntryPoint overlay requires primaryWorldId');
    }
    return {
        primaryWorldId,
        worlds: Object.fromEntries(worlds.map(item => {
            const worldId = item.world.worldId;
            const baseline = cloneNativeDocument(item.revision.baseline ?? {});
            return [worldId, { worldRevisionId: item.revision.worldRevisionId,
                state: worldId === primaryWorldId ? { ...baseline, ...overlay } : baseline }];
        })),
        // World-less narrative starts may still carry an initial state overlay.
        ...(worlds.length ? {} : { initialState: overlay }),
    };
}

function validateWorldState(states, manifest, entryPoint) {
    const expected = initialWorldState(manifest, entryPoint, states.atri_world_selection);
    const actual = states.atri_world_state;
    if (!actual || actual.primaryWorldId !== expected.primaryWorldId || !actual.worlds
        || Object.keys(actual.worlds).length !== Object.keys(expected.worlds).length) {
        throw new TypeError('Session World dependency mismatch');
    }
    for (const [worldId, world] of Object.entries(expected.worlds)) {
        if (actual.worlds[worldId]?.worldRevisionId !== world.worldRevisionId
            || !Object.hasOwn(actual.worlds[worldId], 'state')) throw new TypeError('Session World dependency mismatch');
    }
}

function validateRuntimeStateChanges(handle, sessionId, statePatch = {}, deleteNamespaces = []) {
    const values = cloneNativeDocument(statePatch, 'Native runtime state patch');
    if (!values || Array.isArray(values) || typeof values !== 'object') {
        throw new TypeError('Native runtime state patch must be an object');
    }
    if (!Array.isArray(deleteNamespaces)) throw new TypeError('Native runtime deleteNamespaces must be an array');
    const deletes = [...new Set(deleteNamespaces.map(namespace => String(namespace || '').trim()))];
    for (const namespace of [...Object.keys(values), ...deletes]) {
        if (RESERVED_SESSION_NAMESPACES.includes(namespace)) throw new TypeError('Reserved Session Core namespace');
        assertNativeResourceKey({
            kind: NATIVE_RESOURCE_KINDS.sessionState,
            handle,
            sessionId,
            namespace,
            head: 'validate',
        });
    }
    for (const namespace of deletes) {
        if (Object.prototype.hasOwnProperty.call(values, namespace)) {
            throw new TypeError('Native runtime state namespace cannot be updated and deleted in one commit');
        }
    }
    return { values, deletes };
}

function appendRuntimeTimeline(core, base, commands = []) {
    if (!Array.isArray(commands) || commands.length > 1000) {
        throw new TypeError('Expected 0..1000 Native Timeline append commands');
    }
    const timeline = [...base.timeline];
    const entries = [];
    const variants = [];
    for (const command of commands) {
        if (!command || command.type !== 'append' || command.beforeMessageId !== undefined) {
            throw new TypeError('Native runtime Timeline commands are append-only');
        }
        const created = core._newEntry(base, command.draft, timeline.length);
        timeline.push(created.entry);
        entries.push(created.entry);
        variants.push(created.variant);
    }
    return { timeline, entries, variants };
}

/** Native commands only. Runtime projection, generation and state providers are later phases. */
export class SessionCore {
    constructor({ sessionRepo, savePointRepo, packageInstaller, knowledgeRepo = null }) {
        if (!sessionRepo || !savePointRepo || !packageInstaller) {
            throw new TypeError('SessionCore requires SessionRepo, SavePointRepo and PackageInstaller');
        }
        this._sessions = sessionRepo;
        this._saves = savePointRepo;
        this._packages = packageInstaller;
        this._knowledge = knowledgeRepo;
    }

    async _openPackage(handle, packageId, packageVersionId, entryPointId) {
        assertNativeId(packageId, 'package');
        assertNativeId(packageVersionId, 'packageVersion');
        assertNativeId(entryPointId, 'entryPoint');
        const installed = await this._packages.open(handle, packageId, packageVersionId);
        if (!installed) throw new NotFoundError('native package version', { packageId, packageVersionId });
        const entryPoint = installed.manifest.entryPoints.find(item => item.entryPointId === entryPointId);
        if (!entryPoint) throw new NotFoundError('native entry point', { entryPointId });
        return { ...installed, entryPoint };
    }

    async load(handle, sessionId, options = {}) {
        assertNativeId(sessionId, 'session');
        if (options.revisionId) assertNativeId(options.revisionId, 'revision');
        const snapshot = await this._sessions.loadSnapshot(handle, sessionId, options);
        const { session } = snapshot;
        const installed = await this._openPackage(handle, session.packageId, session.packageVersionId, session.entryPointId);
        if (installed.packageVersion.packageContentHash !== session.packageContentHash
            || installed.packageVersion.version !== session.packageVersion) throw new Error('Session PackageVersion dependency mismatch');
        await this._validateProjections(handle, snapshot, snapshot.variants, installed);
        validateWorldState(snapshot.states, installed.manifest, installed.entryPoint);
        const knowledge = validateKnowledgeBindingSet(snapshot.knowledge, installed.manifest, installed.entryPoint);
        const worlds = selectedWorlds(snapshot.states, installed.manifest, installed.entryPoint);
        const base = { ...snapshot, knowledge, manifest: packageKnowledgeManifest(installed.manifest, knowledge), entryPoint: installed.entryPoint, worlds };
        if (snapshot.states.atri_game_regex) base.manifest = { ...base.manifest, processors: { ...base.manifest.processors, regex: normalizeNativeRegexScripts(snapshot.states.atri_game_regex.regexScripts) } };
        if (!options.revisionId) {
            const regexEdit = await this._packages.currentRegexEdit?.(handle, session.packageId, session.packageVersionId);
            if (regexEdit && hashNativeDocument(regexEdit) !== hashNativeDocument(snapshot.states.atri_game_regex || null)) {
                const states = { ...base.states, atri_game_regex: regexEdit };
                const manifest = { ...base.manifest, processors: { ...base.manifest.processors, regex: normalizeNativeRegexScripts(regexEdit.regexScripts) } };
                try { await this._publish(handle, { ...base, manifest }, { states }); } catch (error) {
                    if (error.code !== 'native_session_head_conflict' || options.retriedRegex) throw error;
                }
                return this.load(handle, sessionId, { ...options, retriedRegex: true });
            }
            const edits = await this._packages.currentKnowledgeEdits?.(handle, session.packageId, knowledge.bindings, session.packageVersionId) || [];
            if (edits.length) {
                const revisions = new Map(edits.map(item => [item.knowledgeBase.knowledgeBaseId, item.revision.knowledgeRevisionId]));
                const next = { ...knowledge, bindings: knowledge.bindings.map(binding => binding.source.kind === 'package' && revisions.has(binding.source.knowledgeBaseId)
                    ? { ...binding, source: { ...binding.source, knowledgeRevisionId: revisions.get(binding.source.knowledgeBaseId) } } : binding),
                snapshots: [...knowledge.snapshots.filter(item => item.kind !== 'package' || !revisions.has(item.snapshot.knowledgeBase.knowledgeBaseId)), ...edits.map(snapshot => ({ kind: 'package', snapshot }))] };
                const states = { ...base.states }; delete states.atri_knowledge_runtime;
                try { return await this._publish(handle, { ...base, manifest: packageKnowledgeManifest(base.manifest, next) }, { knowledge: next, states }); } catch (error) {
                    if (error.code === 'native_session_head_conflict' && !options.retriedKnowledge) return this.load(handle, sessionId, { ...options, retriedKnowledge: true });
                    throw error;
                }
            }
        }
        return base;
    }

    async create(handle, { packageId, packageVersionId, entryPointId, displayTitle,
        libraryBindingIds = [], sessionBindings = [], sessionKnowledge = [], packageBindingIds, worldSelection, resolvedKnowledge }) {
        const installed = await this._openPackage(handle, packageId, packageVersionId, entryPointId);
        const now = Date.now();
        const sessionId = createNativeId('session');
        const branchId = createNativeId('branch');
        const session = assertSession({
            sessionId, packageId, packageVersionId, packageVersion: installed.packageVersion.version,
            packageContentHash: installed.packageVersion.packageContentHash, entryPointId,
            activeBranchId: branchId, headRevisionId: null, createdAt: now, updatedAt: now,
            ...(displayTitle === undefined ? {} : { displayTitle }),
        });
        const branch = { sessionId, branchId, parentBranchId: null, forkPoint: null, createdAt: now };
        const base = { session, revision: null, timeline: [], graph: [{ branchId, forkRevisionId: null, branch }],
            states: { atri_world_state: initialWorldState(installed.manifest, installed.entryPoint, worldSelection), ...(worldSelection ? { atri_world_selection: worldSelection } : {}) },
            manifest: installed.manifest, entryPoint: installed.entryPoint,
            knowledge: resolvedKnowledge || await resolveSessionKnowledge({ handle, manifest: installed.manifest,
                entryPoint: installed.entryPoint, knowledgeRepo: this._knowledge,
                libraryBindingIds, sessionBindings, sessionKnowledge, packageBindingIds }),
        };
        const initial = installed.entryPoint.initialTimeline ?? [];
        if (!Array.isArray(initial)) throw new TypeError('EntryPoint initialTimeline must be an array');
        const entries = [];
        const variants = [];
        for (const draft of initial) {
            const created = this._newEntry(base, draft, entries.length);
            entries.push(created.entry);
            variants.push(created.variant);
        }
        return this._publish(handle, base, { timeline: entries, entries, variants, branches: [branch] });
    }

    _newEntry(base, draft, sequence = base.timeline.length) {
        const { entryDraft, projection, diagnostics } = normalizeMessageDraft(draft);
        const messageId = createNativeId('message');
        const variantId = createNativeId('variant');
        if (draft.actorId && !base.manifest.actors.some(actor => actor.actorId === draft.actorId)) {
            throw new TypeError('Timeline actor must belong to exact PackageVersion');
        }
        const entry = assertTimelineEntry({ ...entryDraft, sessionId: base.session.sessionId,
            branchId: base.revision?.branchId ?? base.session.activeBranchId, messageId, sequence,
            variantIds: [variantId], activeVariantId: variantId });
        const variant = assertVariant({ sessionId: entry.sessionId, messageId, variantId,
            content: entry.content, ...(projection ? { projection } : {}),
            metadata: diagnostics.length ? { ...entry.metadata, atri_turn_diagnostics: diagnostics } : entry.metadata,
            createdAt: Date.now() });
        return { entry, variant };
    }

    // Compile exact installed source bytes once for this validation batch. No
    // compiled definitions/functions escape into a Session/HTTP snapshot.
    async _validateProjections(handle, base, variants, installed = null) {
        const projected = variants.filter(variant => variant.projection !== undefined);
        if (!projected.length) return;
        const roles = new Map(base.timeline.map(entry => [entry.messageId, entry.role]));
        for (const variant of projected) {
            if (!['user', 'assistant'].includes(roles.get(variant.messageId))) throw new TypeError('MessageProjection requires a user or assistant message');
        }
        // Prose-only presentation is valid without Component Model v2.
        if (!projected.some(variant => variant.projection.flow.some(node => node.kind === 'block'))) return;
        const { session } = base;
        installed ??= await this._openPackage(handle, session.packageId, session.packageVersionId, session.entryPointId);
        if (installed.packageVersion.packageContentHash !== session.packageContentHash
            || installed.packageVersion.version !== session.packageVersion) throw new Error('Session PackageVersion dependency mismatch');
        const experience = installed.entryPoint.runtime?.experience ?? installed.manifest.runtime?.experience;
        if (experience?.componentModelVersion !== 2) throw new TypeError('Message blocks require pinned UI Document v2');
        const bytes = installed.sourceFiles.get(experience.component);
        if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Missing or oversized pinned UI Document v2');
        const definition = compileUiDocument(JSON.parse(bytes.toString('utf8')), { mode: experience.mode });
        for (const variant of projected) validateMessageBlocks(definition, variant.projection);
    }

    async _publish(handle, base, { timeline = base.timeline, states = base.states, knowledge = base.knowledge,
        graph = base.graph, branchId = base.revision?.branchId ?? base.session.activeBranchId,
        entries = [], variants = [], branches = [], actionRequest = null } = {}) {
        variants = variants.map(assertVariant);
        await this._validateProjections(handle, { ...base, timeline }, variants);
        validateWorldState(states, base.manifest, base.entryPoint);
        const revisionId = createNativeId('revision');
        if (actionRequest) {
            const previous = actionReceipts(base);
            if (previous.length >= 2048) throw new TypeError('Action receipt retention limit reached');
            const previousEvents = new Set((base.states.atri_game_runtime?.events ?? []).map(event => event.id));
            const eventRefs = (states.atri_game_runtime?.events ?? []).filter(event => !previousEvents.has(event.id)).map(event => event.id);
            states = { ...states, [ACTION_RECEIPTS_NAMESPACE]: { schemaVersion: 1, receipts: [...previous, {
                ...actionRequest, receiptId: 'action:' + revisionId, status: 'committed', baseRevisionId: base.revision.revisionId,
                committedRevisionId: revisionId, branchId, eventRefs,
            }] } };
        }
        const core = { schemaVersion: 1, parentRevisionId: base.session.headRevisionId,
            branches: graph.map(node => ({ branchId: node.branchId, forkRevisionId: node.forkRevisionId,
                headRevisionId: node.branchId === branchId ? revisionId : node.headRevisionId })) };
        const documents = { ...states,
            [SESSION_CORE_NAMESPACE]: core,
            [TIMELINE_NAMESPACE]: timeline.map(timelineSelection),
            [KNOWLEDGE_NAMESPACE]: validateKnowledgeBindingSet(knowledge, base.manifest, base.entryPoint),
        };
        const stateHeads = Object.fromEntries(Object.entries(documents)
            .filter(([namespace]) => namespace !== KNOWLEDGE_NAMESPACE)
            .map(([namespace, value]) => [namespace, hashNativeDocument(value)]));
        const last = timeline.at(-1);
        const revision = assertSessionRevision({ revisionId, sessionId: base.session.sessionId, branchId,
            timelineHead: last ? { messageId: last.messageId, variantId: last.activeVariantId } : null,
            stateHeads, knowledgeHead: hashNativeDocument(documents[KNOWLEDGE_NAMESPACE]), createdAt: Date.now() });
        const session = assertSession({ ...base.session, activeBranchId: branchId, headRevisionId: revisionId,
            updatedAt: Math.max(Date.now(), base.session.updatedAt) });
        const snapshot = await this._sessions.commitSnapshot(handle, { session, revision, states: documents,
            entries, variants, branches, expectedRevisionId: base.session.headRevisionId });
        return { ...snapshot, manifest: base.manifest, entryPoint: base.entryPoint,
            worlds: selectedWorlds(states, base.manifest, base.entryPoint) };
    }

    async _current(handle, sessionId, expectedRevisionId) {
        const base = await this.load(handle, sessionId);
        if (expectedRevisionId !== undefined && base.session.headRevisionId !== expectedRevisionId) {
            throw new ConflictError('native_session_head_conflict', { sessionId });
        }
        return base;
    }

    async _findTimelineBoundary(handle, sessionId, source, messageId) {
        assertNativeId(messageId, 'message');

        let cursor = source;
        let boundary = null;
        const visited = new Set();
        while (cursor?.revision) {
            const revisionId = cursor.revision.revisionId;
            if (visited.has(revisionId)) throw new TypeError('Native Session revision ancestry cycle');
            visited.add(revisionId);

            const last = cursor.timeline.at(-1);
            const matchesMessage = cursor.revision.timelineHead?.messageId === messageId
                && last?.messageId === messageId;

            if (matchesMessage) {
                boundary = cursor;
            } else if (boundary) {
                break;
            }

            const parentRevisionId = cursor.core?.parentRevisionId;
            if (!parentRevisionId) break;
            cursor = await this.load(handle, sessionId, { revisionId: parentRevisionId });
        }
        if (!boundary) {
            throw new NotFoundError('native timeline boundary revision', { messageId });
        }
        return boundary;
    }

    async appendTimeline(handle, sessionId, draft, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const { entry, variant } = this._newEntry(base, draft);
        return this._publish(handle, base, { timeline: [...base.timeline, entry], entries: [entry], variants: [variant] });
    }

    /**
     * Publish runtime Drafts as one append-only revision.
     * Committed Timeline entries and their single birth Variant are immutable
     * Native authority. Retry/re-entry create derived Branches/Revisions;
     * there is no post-commit Variant add/select mutation surface.
     */
    async applyRuntimeCommit(handle, sessionId, {
        commands = [],
        statePatch = {},
        deleteNamespaces = [],
        actionRequest = null,
    } = {}, { expectedRevisionId } = {}) {
        const request = actionRequest === null ? null : assertActionRequest(actionRequest);
        const base = await this._current(handle, sessionId, request ? undefined : expectedRevisionId);
        if (request) {
            const receipts = actionReceipts(base);
            const existing = receipts.find(receipt => receipt.idempotencyKey === request.idempotencyKey);
            if (existing) {
                if (existing.fingerprint !== request.fingerprint) throw new TypeError('Action idempotency key conflict');
                return base;
            }
            if (expectedRevisionId !== request.expectedRevisionId || base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict', { sessionId });
            assertCompensation(request, receipts);
        }
        const timelineChanges = appendRuntimeTimeline(this, base, commands);
        const { values, deletes } = validateRuntimeStateChanges(handle, sessionId, statePatch, deleteNamespaces);
        const states = { ...base.states, ...values };
        for (const namespace of deletes) delete states[namespace];

        const changedState = Object.keys(values).some(namespace =>
            hashNativeDocument(base.states[namespace] ?? null) !== hashNativeDocument(values[namespace]))
            || deletes.some(namespace => Object.prototype.hasOwnProperty.call(base.states, namespace));
        if (timelineChanges.entries.length === 0 && !changedState && !request) return base;

        return this._publish(handle, base, {
            timeline: timelineChanges.timeline,
            entries: timelineChanges.entries,
            variants: timelineChanges.variants,
            states,
            actionRequest: request,
        });
    }

    async applyTimelineCommands(handle, sessionId, commands, { expectedRevisionId } = {}) {
        if (!Array.isArray(commands) || !commands.length || commands.length > 1000) {
            throw new TypeError('Expected 1..1000 Native Timeline append commands');
        }
        return this.applyRuntimeCommit(handle, sessionId, { commands }, { expectedRevisionId });
    }

    async updateState(handle, sessionId, patch, { expectedRevisionId } = {}) {
        return this.applyRuntimeCommit(handle, sessionId, { statePatch: patch }, { expectedRevisionId });
    }


    async updateResources(handle, sessionId, { worldSelection, knowledge }, { expectedRevisionId } = {}) {
        if (!expectedRevisionId) throw new TypeError('Expected Session revision is required');
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const worlds = selectedWorlds({ atri_world_selection: worldSelection }, base.manifest, base.entryPoint);
        const nextWorldState = initialWorldState(base.manifest, { ...base.entryPoint, initialStateOverlay: {} }, worldSelection);
        for (const world of worlds) {
            const previous = base.states.atri_world_state.worlds[world.world.worldId];
            if (previous?.worldRevisionId === world.revision.worldRevisionId) nextWorldState.worlds[world.world.worldId] = cloneNativeDocument(previous);
        }
        const states = { ...base.states, atri_world_selection: worldSelection, atri_world_state: nextWorldState };
        delete states.atri_knowledge_runtime;
        return this._publish(handle, base, { states, knowledge });
    }

    // Explicit replacement of external bindings, not a follow-latest policy.
    async updateKnowledge(handle, sessionId, options, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const knowledge = await resolveSessionKnowledge({ ...options, handle, manifest: base.manifest,
            entryPoint: base.entryPoint, knowledgeRepo: this._knowledge });
        return this._publish(handle, base, { knowledge });
    }

    /**
     * Retry the current committed assistant reply without creating a Native
     * Variant. Find the exact ancestor revision whose Timeline HEAD is the
     * preceding user message, then fork from that post-user revision.
     */
    async retryReply(handle, sessionId, { messageId, expectedRevisionId } = {}) {
        assertNativeId(messageId, 'message');
        const current = await this._current(handle, sessionId, expectedRevisionId);
        const assistantIndex = current.timeline.findIndex(item => item.messageId === messageId);
        if (assistantIndex < 0) throw new NotFoundError('native retry assistant message', { messageId });
        const assistant = current.timeline[assistantIndex];
        if (assistant.role !== 'assistant' || assistantIndex !== current.timeline.length - 1) {
            throw new TypeError('Native Retry Reply requires the current committed assistant reply');
        }
        let userIndex = assistantIndex - 1;
        while (userIndex >= 0 && current.timeline[userIndex].role !== 'user') userIndex--;
        if (userIndex < 0) throw new TypeError('Native Retry Reply requires a preceding committed user turn');
        const userMessageId = current.timeline[userIndex].messageId;

        const postUser = await this._findTimelineBoundary(handle, sessionId, current, userMessageId);
        return this.forkBranch(handle, sessionId, {
            revisionId: postUser.revision.revisionId,
            expectedRevisionId: current.session.headRevisionId,
        });
    }

    async forkBranch(handle, sessionId, { revisionId, messageId, displayName, expectedRevisionId } = {}) {
        const current = await this._current(handle, sessionId, expectedRevisionId);
        let source = revisionId ? await this.load(handle, sessionId, { revisionId }) : current;
        let timeline = source.timeline;
        if (messageId !== undefined) {
            const selected = timeline.find(item => item.messageId === messageId);
            if (!selected) throw new NotFoundError('native fork message');
            // A message-scoped fork means "fork from the coherent Revision at
            // that Timeline boundary", not "slice old text while inheriting
            // later state". Walk back across state-only revisions whose
            // Timeline HEAD stayed on the same message and pick the earliest
            // boundary in the nearest ancestry block.
            source = await this._findTimelineBoundary(handle, sessionId, source, messageId);
            timeline = source.timeline;
        }
        const last = timeline.at(-1);
        const forkPoint = last ? { messageId: last.messageId, variantId: last.activeVariantId } : null;
        const branchId = createNativeId('branch');
        const branch = { branchId, sessionId, parentBranchId: source.revision.branchId,
            forkPoint, createdAt: Date.now(),
            ...(displayName === undefined ? {} : { displayName }) };
        return this._publish(handle, { ...source, session: current.session }, {
            branchId, timeline, branches: [branch], graph: [...current.graph,
                { branchId, forkRevisionId: source.revision.revisionId, branch }],
        });
    }

    async switchBranch(handle, sessionId, branchId, { expectedRevisionId } = {}) {
        const current = await this._current(handle, sessionId, expectedRevisionId);
        const node = current.graph.find(item => item.branchId === branchId);
        if (!node) throw new NotFoundError('native branch', { branchId });
        const source = await this.load(handle, sessionId, { revisionId: node.headRevisionId });
        return this._publish(handle, { ...source, session: current.session }, { graph: current.graph });
    }

    async createSavePoint(handle, sessionId, { revisionId, kind = 'manual', displayName } = {}) {
        const source = await this.load(handle, sessionId, { revisionId });
        return this._saves.create(handle, { saveId: createNativeId('savePoint'), sessionId,
            branchId: source.revision.branchId, revisionId: source.revision.revisionId, kind, createdAt: Date.now(),
            ...(displayName === undefined ? {} : { displayName }) });
    }

    async restoreSavePoint(handle, sessionId, saveId, { expectedRevisionId } = {}) {
        const save = await this._saves.get(handle, sessionId, saveId);
        if (!save) throw new NotFoundError('native save point', { saveId });
        const current = await this._current(handle, sessionId, expectedRevisionId);
        if (
            current.session.headRevisionId === save.revisionId
            && current.session.activeBranchId === save.branchId
        ) {
            return current;
        }

        // Loading a historical Save is non-destructive. The saved Revision is
        // an immutable source root; continuing publishes a new derived Branch
        // and leaves every pre-existing Branch HEAD untouched.
        const source = await this.load(handle, sessionId, { revisionId: save.revisionId });
        const last = source.timeline.at(-1);
        const forkPoint = last ? { messageId: last.messageId, variantId: last.activeVariantId } : null;
        const branchId = createNativeId('branch');
        const branch = {
            branchId,
            sessionId,
            parentBranchId: source.revision.branchId,
            forkPoint,
            createdAt: Date.now(),
            ...(save.displayName === undefined ? {} : { displayName: save.displayName }),
        };
        return this._publish(handle, { ...source, session: current.session }, {
            branchId,
            timeline: source.timeline,
            branches: [branch],
            graph: [
                ...current.graph,
                { branchId, forkRevisionId: source.revision.revisionId, branch },
            ],
        });
    }
}
