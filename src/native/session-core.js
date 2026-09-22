import {
    assertNativeResourceKey, assertSession, assertSessionRevision, assertTimelineEntry, assertVariant,
    NATIVE_RESOURCE_KINDS,
} from './contracts.js';
import { createNativeId, assertNativeId } from './identity.js';
import { resolveSessionKnowledge, validateKnowledgeBindingSet } from './session-knowledge.js';
import { cloneNativeDocument, hashNativeDocument } from './repositories/common.js';
import {
    SESSION_CORE_NAMESPACE, TIMELINE_NAMESPACE, KNOWLEDGE_NAMESPACE, RESERVED_SESSION_NAMESPACES,
} from './session-snapshot.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';

function timelineSelection(entry) {
    return { messageId: entry.messageId, branchId: entry.branchId,
        variantIds: entry.variantIds, activeVariantId: entry.activeVariantId };
}

function initialWorldState(manifest, entryPoint) {
    const worlds = manifest.worlds.filter(item => entryPoint.worldIds.includes(item.world.worldId));
    const overlay = cloneNativeDocument(entryPoint.initialStateOverlay ?? {});
    const primaryWorldId = entryPoint.primaryWorldId ?? (worlds.length === 1 ? worlds[0].world.worldId : null);
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
    const expected = initialWorldState(manifest, entryPoint);
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
        validateWorldState(snapshot.states, installed.manifest, installed.entryPoint);
        const knowledge = validateKnowledgeBindingSet(snapshot.knowledge, installed.manifest, installed.entryPoint);
        const worlds = installed.manifest.worlds.filter(item => installed.entryPoint.worldIds.includes(item.world.worldId));
        return { ...snapshot, knowledge, manifest: installed.manifest, entryPoint: installed.entryPoint, worlds };
    }

    async create(handle, { packageId, packageVersionId, entryPointId, displayTitle,
        libraryBindingIds = [], sessionBindings = [], sessionKnowledge = [] }) {
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
            states: { atri_world_state: initialWorldState(installed.manifest, installed.entryPoint) },
            manifest: installed.manifest, entryPoint: installed.entryPoint,
            knowledge: await resolveSessionKnowledge({ handle, manifest: installed.manifest,
                entryPoint: installed.entryPoint, knowledgeRepo: this._knowledge,
                libraryBindingIds, sessionBindings, sessionKnowledge }),
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
        const messageId = createNativeId('message');
        const variantId = createNativeId('variant');
        if (draft.actorId && !base.manifest.actors.some(actor => actor.actorId === draft.actorId)) {
            throw new TypeError('Timeline actor must belong to exact PackageVersion');
        }
        const entry = assertTimelineEntry({ ...draft, sessionId: base.session.sessionId,
            branchId: base.revision?.branchId ?? base.session.activeBranchId, messageId, sequence,
            variantIds: [variantId], activeVariantId: variantId });
        const variant = assertVariant({ sessionId: entry.sessionId, messageId, variantId,
            content: entry.content, metadata: entry.metadata, createdAt: Date.now() });
        return { entry, variant };
    }

    async _publish(handle, base, { timeline = base.timeline, states = base.states, knowledge = base.knowledge,
        graph = base.graph, branchId = base.revision?.branchId ?? base.session.activeBranchId,
        entries = [], variants = [], branches = [] } = {}) {
        validateWorldState(states, base.manifest, base.entryPoint);
        const revisionId = createNativeId('revision');
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
            worlds: base.manifest.worlds.filter(item => base.entryPoint.worldIds.includes(item.world.worldId)) };
    }

    async _current(handle, sessionId, expectedRevisionId) {
        const base = await this.load(handle, sessionId);
        if (expectedRevisionId !== undefined && base.session.headRevisionId !== expectedRevisionId) {
            throw new ConflictError('native_session_head_conflict', { sessionId });
        }
        return base;
    }

    async appendTimeline(handle, sessionId, draft, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const { entry, variant } = this._newEntry(base, draft);
        return this._publish(handle, base, { timeline: [...base.timeline, entry], entries: [entry], variants: [variant] });
    }

    async addVariant(handle, sessionId, messageId, draft, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const entry = base.timeline.find(item => item.messageId === messageId);
        if (!entry) throw new NotFoundError('native timeline entry', { messageId });
        const variant = assertVariant({ ...draft, sessionId, messageId, variantId: createNativeId('variant'), createdAt: Date.now() });
        const timeline = base.timeline.map(item => item === entry ? { ...item, content: variant.content,
            variantIds: [...item.variantIds, variant.variantId], activeVariantId: variant.variantId } : item);
        return this._publish(handle, base, { timeline, variants: [variant] });
    }

    async selectVariant(handle, sessionId, messageId, variantId, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const entry = base.timeline.find(item => item.messageId === messageId);
        const variant = base.variants.find(item => item.messageId === messageId && item.variantId === variantId);
        if (!entry || !variant) throw new NotFoundError('native timeline variant', { messageId, variantId });
        return this._publish(handle, base, { timeline: base.timeline.map(item => item === entry
            ? { ...item, activeVariantId: variantId, content: variant.content } : item) });
    }

    // Base namespace replacement only; N5 supplies runtime-specific state writers.
    async updateState(handle, sessionId, patch, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const values = cloneNativeDocument(patch, 'SessionState patch');
        if (!values || Array.isArray(values) || typeof values !== 'object') throw new TypeError('SessionState patch must be an object');
        for (const namespace of Object.keys(values)) {
            if (RESERVED_SESSION_NAMESPACES.includes(namespace)) throw new TypeError('Reserved Session Core namespace');
            assertNativeResourceKey({ kind: NATIVE_RESOURCE_KINDS.sessionState, handle, sessionId, namespace, head: 'validate' });
        }
        return this._publish(handle, base, { states: { ...base.states, ...values } });
    }

    // Explicit replacement of external bindings, not a follow-latest policy.
    async updateKnowledge(handle, sessionId, options, { expectedRevisionId } = {}) {
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const knowledge = await resolveSessionKnowledge({ ...options, handle, manifest: base.manifest,
            entryPoint: base.entryPoint, knowledgeRepo: this._knowledge });
        return this._publish(handle, base, { knowledge });
    }

    async forkBranch(handle, sessionId, { revisionId, displayName, expectedRevisionId } = {}) {
        const current = await this._current(handle, sessionId, expectedRevisionId);
        const source = revisionId ? await this.load(handle, sessionId, { revisionId }) : current;
        const branchId = createNativeId('branch');
        const branch = { branchId, sessionId, parentBranchId: source.revision.branchId,
            forkPoint: source.revision.timelineHead, createdAt: Date.now(),
            ...(displayName === undefined ? {} : { displayName }) };
        return this._publish(handle, { ...source, session: current.session }, {
            branchId, branches: [branch], graph: [...current.graph,
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
        const source = await this.load(handle, sessionId, { revisionId: save.revisionId });
        return this._publish(handle, { ...source, session: current.session }, { graph: current.graph });
    }
}
