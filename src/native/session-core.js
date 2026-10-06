import { captureTaskProduction } from './task-artifact-authority.js';
import { adoptKnowledge } from './knowledge-authority.js';
import { PERSONA_NAMESPACE, assertPersonaState, personaIdentity, personaFailure } from './persona-contract.js';
import { RunControl, runFailure, runPublicationProof } from './run-control.js';
import { RUN_NAMESPACE, assertRunState } from '../../public/shared/native-run-contract.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { prepareLifetimes, validateLifetimes } from './lifetime-authority.js';
import { hasAuthorityTransactions, prepareAuthorityTurn, authorityTurnProof, authorityActionRequest, authorityFailure, authorityCatalog, authoritySelection } from './authority-turn.js';
import { prepareAuthorityPublications, createAuthorityPublicationBudget } from './authority-transaction.js';
import { resolveNativeRuntimePackage } from './runtime-descriptor.js';
import { bridgeValue } from '../../public/shared/native-frontend-bridge.js';
import { invalidateFrontendEpoch } from './frontend/epoch.js';
import { applyRealm, realmDefinition, reconcileRealm, loadRealm } from './realm-authority.js';
import { activityNarrative, publishActivities } from './activity-authority.js';
import { assertInformationClosure } from '../../public/shared/native-information-contract.js';
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
import { TASK_STATE_NAMESPACE, assertTaskValue, assertSemanticOutcome } from '../../public/shared/native-task-contract.js';
import { prepareTaskAuthority, validateTaskRecords } from './task-authority.js';
import { checkpointHistory, retiredInvocation, validateHistory, prepareHistory } from './history-authority.js';
import { queryHistory, historyMetrics } from '../../public/shared/native-history-runtime.js';
import { initialLifecycle, lifecycleDefinition, validateLifecycle, prepareLifecycle, compactLifecycle, prepareDeclaredTaskResult } from './lifecycle-authority.js';
import { fields } from '../../public/shared/native-values.js';
import { applyContinuity, continuityDefinition, continuityDisplay, continuityEffects, projectContinuity, reconcileOwnership } from './continuity-authority.js';

// Projection is a first-class immutable Variant field, never Timeline metadata.
// User and assistant messages may project; only assistant turns accept envelopes.
function normalizeMessageDraft(draft, allowOutcomes = false) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new TypeError('Timeline draft must be a record');
    const { envelope: rawEnvelope, projection: rawProjection, ...entryDraft } = draft;
    let projection;
    let diagnostics = [];
    if (Object.hasOwn(draft, 'envelope')) {
        if (draft.role !== 'assistant') throw new TypeError('TurnEnvelope requires an assistant message');
        const envelope = assertTurnEnvelope(rawEnvelope);
        if (envelope.outcomes.length && !allowOutcomes) throw new TypeError('Outcomes require atomic Turn finalize');
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
    constructor({ sessionRepo, savePointRepo, packageInstaller, knowledgeRepo = null, personaRepo = null }) {
        if (!sessionRepo || !savePointRepo || !packageInstaller) {
            throw new TypeError('SessionCore requires SessionRepo, SavePointRepo and PackageInstaller');
        }
        this._sessions = sessionRepo;
        this._saves = savePointRepo;
        this._packages = packageInstaller;
        this._knowledge = knowledgeRepo;
        this.personas = personaRepo;
        this._continuity = sessionRepo.continuity;
        this.runs = new RunControl(sessionRepo);
        this._lifecycleProof = {};
    }

    async _openPackage(handle, packageId, packageVersionId, entryPointId) {
        assertNativeId(packageId, 'package');
        assertNativeId(packageVersionId, 'packageVersion');
        assertNativeId(entryPointId, 'entryPoint');
        const installed = await this._packages.open(handle, packageId, packageVersionId);
        if (!installed) throw new NotFoundError('native package version', { packageId, packageVersionId });
        const entryPoint = installed.manifest.entryPoints.find(item => item.entryPointId === entryPointId);
        assertInformationClosure(installed.manifest.runtime?.experienceContract?.informationRuntime, installed.manifest);
        if (!entryPoint) throw new NotFoundError('native entry point', { entryPointId });
        return { ...installed, entryPoint };
    }

    async load(handle, sessionId, options = {}) {
        assertNativeId(sessionId, 'session');
        if (options.revisionId) assertNativeId(options.revisionId, 'revision');
        const snapshot = await this._sessions.loadSnapshot(handle, sessionId, options);
        const { session } = snapshot;
        const installed = await this._openPackage(handle, session.packageId, session.packageVersionId, session.entryPointId);
        validateTaskRecords({ ...snapshot, manifest: installed.manifest });
        validateLifecycle({ ...snapshot, manifest: installed.manifest });
        validateLifetimes({ ...snapshot, manifest: installed.manifest }, { complete: true });
        validateHistory({ ...snapshot, manifest: installed.manifest });
        if (installed.packageVersion.packageContentHash !== session.packageContentHash
            || installed.packageVersion.version !== session.packageVersion) throw new Error('Session PackageVersion dependency mismatch');
        await this._validateProjections(handle, snapshot, snapshot.variants, installed);
        validateWorldState(snapshot.states, installed.manifest, installed.entryPoint);
        if (snapshot.states[PERSONA_NAMESPACE]) assertPersonaState(snapshot.states[PERSONA_NAMESPACE]);
        const knowledge = validateKnowledgeBindingSet(snapshot.knowledge, installed.manifest, installed.entryPoint);
        const worlds = selectedWorlds(snapshot.states, installed.manifest, installed.entryPoint);
        const base = { ...snapshot, knowledge, manifest: packageKnowledgeManifest(installed.manifest, knowledge), entryPoint: installed.entryPoint, worlds };
        if (snapshot.states.atri_game_regex) base.manifest = { ...base.manifest, processors: { ...base.manifest.processors, regex: normalizeNativeRegexScripts(snapshot.states.atri_game_regex.regexScripts) } };
        if (!options.revisionId && !options.skipPackageEdits) {
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
        if (continuityDefinition(base)) {
            if (!this._continuity) throw new TypeError('Continuity repository required');
            const revision = await this._continuity.load(handle, session.packageId);
            if (!options.revisionId) base.states = reconcileOwnership(base, base.states, revision);
            base.externalEffects = continuityEffects(revision, sessionId);
            base.continuityRevisionId = revision?.revisionId ?? null;
            base.continuityViews = continuityDisplay(base, revision);
        }
        return loadRealm(this, handle, base, Boolean(options.revisionId));
    }

    async create(handle, input) {
        if (!this.personas) {
            if (Object.hasOwn(input, 'personaSelection')) throw personaFailure('native_persona_unavailable');
            return this._create(handle, input);
        }
        return this.personas.lock(handle, async () => {
            const selection = await this.personas.capture(handle, input.personaSelection);
            return this._create(handle, input, { schemaVersion: 1, solo: selection, seats: {} });
        });
    }

    async readPersona(handle, sessionId) {
        const base = await this.load(handle, sessionId, { skipPackageEdits: true });
        return { revisionId: base.revision.revisionId, state: base.states[PERSONA_NAMESPACE] ?? null, legacyUnbound: !base.states[PERSONA_NAMESPACE] };
    }

    async selectPersona(handle, { sessionId, expectedRevisionId, selection }) {
        if (!this.personas) throw personaFailure('native_persona_unavailable');
        return this.personas.lock(handle, () => this.withPersonaSession(handle, sessionId, async () => {
            const base = await this._current(handle, sessionId, expectedRevisionId);
            if (!expectedRevisionId) throw personaFailure();
            if (base.manifest.runtime?.experienceContract?.sharedRuntime) throw personaFailure('native_persona_scope_denied');
            this.assertPersonaWritable(handle, base);
            const captured = await this.personas.capture(handle, selection);
            const state = base.states[PERSONA_NAMESPACE] ?? { schemaVersion: 1, solo: null, seats: {} };
            return this._publishLocked(handle, base, { states: { ...base.states, [PERSONA_NAMESPACE]: { ...state, solo: captured } }, runAction: 'persona' });
        }));
    }

    async withPersonaSession(handle, sessionId, operation) {
        const base = await this.load(handle, sessionId, { skipPackageEdits: true });
        const enter = () => this._sessions.withRunLock(handle, sessionId, operation);
        // Match existing Continuity -> Session order. Persona updates do not
        // enter _publish again while already holding these authority locks.
        return continuityDefinition(base) || realmDefinition(base) ? this._continuity.lock(handle, base.session.packageId, enter) : enter();
    }

    assertPersonaWritable(handle, base) {
        if (nativeTaskScheduler.hasSessionWork(handle, base.session.sessionId)
            || base.externalEffects?.some(effect => effect.status === 'prepared')
            || base.states.atri_lifecycle?.ready === false
            || Object.values(base.states.atri_shared?.turns ?? {}).some(turn => turn.status === 'collecting')) throw personaFailure('native_persona_conflict', { reason: 'busy' });
    }

    async _create(handle, { packageId, packageVersionId, entryPointId, displayTitle,
        libraryBindingIds = [], sessionBindings = [], sessionKnowledge = [], packageBindingIds, worldSelection, resolvedKnowledge }, personaState) {
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
        if (personaState) base.states[PERSONA_NAMESPACE] = personaState;
        if (installed.manifest.runtime?.experienceContract?.storyStart) {
            base.states[RUN_NAMESPACE] = { schemaVersion: 1, mode: 'pending', status: 'pending', sequence: 0 };
        }
        const lifecycle = initialLifecycle(lifecycleDefinition(base));
        if (lifecycle) base.states.atri_lifecycle = lifecycle;
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

    async beginStory(handle, sessionId, { input, invocationId, expectedRevisionId }) {
        if (typeof invocationId !== 'string' || !/^[A-Za-z0-9._:-]{1,96}$/.test(invocationId)) throw runFailure('native_story_invocation_invalid');
        return this._sessions.withRunLock(handle, sessionId, async () => {
            const base = await this.load(handle, sessionId);
            const start = base.manifest.runtime?.experienceContract?.storyStart;
            if (!start) throw runFailure('native_story_start_undeclared');
            const fingerprint = hashNativeDocument(input);
            const run = base.states[RUN_NAMESPACE];
            if (run?.startInvocationId === invocationId) {
                if (run.startFingerprint !== fingerprint) throw runFailure('native_story_start_conflict');
                return base;
            }
            await this.runs.assert(handle, sessionId, 'start');
            if (run?.status !== 'pending' || base.revision.revisionId !== expectedRevisionId
                || !base.states.atri_lifecycle?.ready) throw runFailure('native_story_start_conflict');
            if (input?.mode === 'ironman' && !base.manifest.runtime.experienceContract.runPolicy) throw runFailure('native_run_policy_required');
            const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
            const selection = authoritySelection(await authorityCatalog(base, installed), { transactionId: start.transactionId, input });
            const player = this._newEntry(base, { role: 'user', content: 'Begin story', metadata: { atri_authority_input: selection } });
            const prepared = await prepareAuthorityTurn(this, handle, base, installed, selection, player);
            const narrative = prepared.prepared.receipt.result[start.narrativeField];
            if (typeof narrative !== 'string' || !narrative.trim()) throw runFailure('native_story_opening_invalid');
            const candidate = prepared.prepared.candidate;
            const { entry, variant } = this._newEntry(candidate, { role: 'assistant', content: narrative });
            const states = { ...candidate.states, [RUN_NAMESPACE]: { schemaVersion: 1, mode: selection.input.mode, status: 'active',
                sequence: run.sequence, startInvocationId: invocationId, startFingerprint: fingerprint } };
            return this._publish(handle, base, { states, timeline: [...candidate.timeline, entry],
                entries: [player.entry, entry], variants: [player.variant, variant], authorityPrepared: true,
                runAction: 'start', actionRequest: authorityActionRequest(prepared.prepared, selection, invocationId, expectedRevisionId, player) });
        });
    }

    async runStatus(handle, sessionId) {
        assertNativeId(sessionId, 'session');
        const control = await this.runs.status(handle, sessionId);
        if (!control && !await this._sessions.get(handle, sessionId)) throw new NotFoundError('native session', { sessionId });
        if (control?.status === 'terminal' && control.cleanup === 'pending') {
            try { await this._sessions.delete(handle, sessionId); } catch { /* The tombstone remains authoritative. */ }
        }
        const current = await this.runs.status(handle, sessionId);
        return { runId: sessionId, mode: current?.mode ?? 'ordinary', status: current?.status ?? 'active',
            sequence: current?.sequence ?? 0, cleanup: current?.cleanup ?? 'none' };
    }

    _newEntry(base, draft, sequence = base.timeline.length, allowOutcomes = false) {
        if (Object.hasOwn(draft.metadata ?? {}, 'atri_player_identity')) throw personaFailure();
        const { entryDraft, projection, diagnostics } = normalizeMessageDraft(draft, allowOutcomes);
        if (draft.role === 'user') {
            const identity = personaIdentity(base.states[PERSONA_NAMESPACE]?.solo);
            if (identity) entryDraft.metadata = { ...entryDraft.metadata, atri_player_identity: identity };
        }
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
        if (experience?.frontend?.version === 3) {
            const graph = resolveNativeRuntimePackage(installed, session.entryPointId).frontendGraph;
            const bindings = graph.bridge.bindings.filter(binding => binding.target.service === 'host.conversation' && binding.target.method === 'blocks');
            for (const variant of projected) for (const block of assertMessageProjection(variant.projection, variant.content).flow) {
                if (block.kind !== 'block') continue;
                const targets = bindings.filter(binding => binding.target.blockType === block.type);
                if (!targets.length) throw new TypeError('Undeclared v3 Message Block type');
                for (const binding of targets) bridgeValue(block.data, binding.outputSchema.properties.data);
            }
            return;
        }
        throw new TypeError('Message blocks require a pinned Native Frontend graph');
    }

    async _publish(handle, base, options = {}) {
        const publish = () => this._sessions.withRunLock(handle, base.session.sessionId, () => this._publishLocked(handle, base, options));
        if (!continuityDefinition(base) && !realmDefinition(base)) return publish();
        if (!this._continuity) throw new TypeError('Continuity repository required');
        return this._continuity.lock(handle, base.session.packageId, publish);
    }

    async _publishLocked(handle, base, { timeline = base.timeline, states = base.states, knowledge = base.knowledge,
        graph = base.graph, branchId = base.revision?.branchId ?? base.session.activeBranchId,
        entries = [], variants = [], branches = [], actionRequest = null, taskRecord = null, taskResolution = null, lifecycleReceipt = null, pendingIntentId = null, pendingRealmIntentId = null, sharedPublication = false, authorityPrepared = false, authorityBudget = null, runAction = 'write', illustrationHead = undefined } = {}) {
        const control = await this.runs.assert(handle, base.session.sessionId, runAction);
        if (states[RUN_NAMESPACE]) {
            const run = assertRunState(states[RUN_NAMESPACE]);
            states = { ...states, [RUN_NAMESPACE]: { ...run, sequence: Math.max(run.sequence, control?.sequence ?? 0) + 1 } };
        }
        if (continuityDefinition(base)) states = reconcileOwnership(base, states,
            await this._continuity.load(handle, base.session.packageId), { publication: true, pendingIntentId });
        if (realmDefinition(base)) states = reconcileRealm(base, states,
            await this._sessions.realm.load(handle, base.session.packageId), { publication: true, pendingIntentId: pendingRealmIntentId });
        if (hasAuthorityTransactions(base) && !authorityPrepared && base.revision && states !== base.states
            && (hashNativeDocument(states.atri_lifecycle?.domains ?? null) !== hashNativeDocument(base.states.atri_lifecycle?.domains ?? null)
                || hashNativeDocument(states.atri_lifecycle?.clocks ?? null) !== hashNativeDocument(base.states.atri_lifecycle?.clocks ?? null)
                || hashNativeDocument(states.atri_world_state ?? null) !== hashNativeDocument(base.states.atri_world_state ?? null))) {
            const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
            states = (await prepareAuthorityPublications({ ...base, states }, installed, authorityBudget)).candidate.states;
            if (base.states.atri_lifecycle?.ready && states.atri_lifecycle?.ready && states.atri_lifecycle.history) {
                states = cloneNativeDocument(states);
                prepareLifetimes(base, { ...base, states });
                prepareHistory(base, { ...base, states }, { id: 'host.lifecycle', verb: 'host_lifecycle' }, { outcome: 'automatic' }, null, { countTurn: false });
            }
        }
        variants = variants.map(assertVariant);
        await this._validateProjections(handle, { ...base, timeline }, variants);
        validateLifetimes({ ...base, states }, { complete: true });
        validateWorldState(states, base.manifest, base.entryPoint);
        const revisionId = createNativeId('revision');
        if (sharedPublication) for (const turn of Object.values(states.atri_shared?.turns ?? {})) {
            if (turn.expectedRevisionId === null || turn.expectedRevisionId === base.revision?.revisionId) turn.expectedRevisionId = revisionId;
        }
        if (states[TASK_STATE_NAMESPACE]) states = { ...states, [TASK_STATE_NAMESPACE]: {
            ...states[TASK_STATE_NAMESPACE], records: states[TASK_STATE_NAMESPACE].records.map(record => ({ ...record,
                ...(record.consumptions ? { consumptions: record.consumptions.map(item => item.applicationRevisionId !== null ? item : { ...item, applicationRevisionId: revisionId }) } : {}),
            })),
        } };
        if (taskRecord) {
            if (lifecycleDefinition(base)) {
                states = cloneNativeDocument(states);
                compactLifecycle({ ...base, states }, states.atri_lifecycle, { reserveTask: true });
            }
            const records = states[TASK_STATE_NAMESPACE]?.records ?? [];
            if (records.length >= 256) throw new TypeError('Task result retention limit reached');
            states = { ...states, [TASK_STATE_NAMESPACE]: { schemaVersion: 1, records: [...records, {
                ...taskRecord, storedRevisionId: revisionId,
            }] } };
        }
        if (taskResolution) states = { ...states, [TASK_STATE_NAMESPACE]: { schemaVersion: 1,
            records: states[TASK_STATE_NAMESPACE].records.map(record => record.invocationId !== taskResolution ? record : {
                ...record, authorityReceipt: { ...record.authorityReceipt, committedRevisionId: revisionId },
            }) } };
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
        if (states.atri_lifecycle) {
            states = cloneNativeDocument(states);
            for (const item of states.atri_lifecycle.outbox) {
                if (!base.states.atri_lifecycle?.outbox.some(previous => previous.invocationId === item.invocationId)) {
                    item.cause = { revisionId, branchId, invocationId: lifecycleReceipt?.invocationId ?? actionRequest?.idempotencyKey ?? taskRecord?.invocationId ?? null };
                }
            }
            states.atri_lifecycle.logicalTime++;
            if (lifecycleReceipt) states.atri_lifecycle.receipts.push({ ...lifecycleReceipt, kind: 'authority',
                committedRevisionId: revisionId, branchId });
            if (taskRecord) {
                const queued = states.atri_lifecycle.outbox.find(item => item.invocationId === taskRecord.invocationId);
                if (queued) queued.status = 'completed';
            }
            publishActivities({ ...base, states }, revisionId, branchId, taskRecord);
            validateLifecycle({ ...base, states });
        }
        const checkpoint = checkpointHistory(base, states, timeline, taskRecord);
        if (checkpoint) timeline = checkpoint.timeline;
        validateHistory({ ...base, states });
        const core = { schemaVersion: 1, parentRevisionId: checkpoint ? null : base.session.headRevisionId,
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
            entries, variants, branches, expectedRevisionId: base.session.headRevisionId, historyCheckpoint: Boolean(checkpoint), runProof: runPublicationProof(), runAction, illustrationHead });
        if (branchId !== base.session.activeBranchId) invalidateFrontendEpoch(handle, session.sessionId);
        if (snapshot.states[RUN_NAMESPACE]?.status === 'dead' && snapshot.states[RUN_NAMESPACE].mode === 'ironman') {
            invalidateFrontendEpoch(handle, session.sessionId);
            for (const operation of nativeTaskScheduler.operations.values()) if (operation.owner === handle && operation.view.anchor?.sessionId === session.sessionId && operation.view.status !== 'finalizing') {
                nativeTaskScheduler.cancel(handle, operation.view.operationId, 'cancelled');
            }
            try { await this._sessions.delete(handle, session.sessionId); } catch { /* Durable terminal marker blocks access while cleanup remains pending. */ }
        }
        const continuity = continuityDefinition(base) ? await this._continuity.load(handle, base.session.packageId) : null;
        return loadRealm(this, handle, { ...snapshot, manifest: base.manifest, entryPoint: base.entryPoint,
            ...(continuityDefinition(base) ? { externalEffects: continuityEffects(continuity, base.session.sessionId), continuityRevisionId: continuity?.revisionId ?? null, continuityViews: continuityDisplay(base, continuity) } : {}),
            worlds: selectedWorlds(states, base.manifest, base.entryPoint) });
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

    async applyLifecycleCommand(handle, sessionId, command, { expectedRevisionId, hostProof = null } = {}) {
        const control = await this.runs.status(handle, sessionId);
        if (control?.mode) {
            const ready = command?.action?.kind === 'experience.ready' && control.status === 'pending';
            const cancel = hostProof === this._lifecycleProof && command?.action?.kind === 'scheduled.cancel';
            if (!ready && !cancel) throw runFailure('native_run_direct_command_denied');
        }
        try { fields(command, ['type', 'invocationId', 'action'], 'Lifecycle command'); } catch (error) { throw new TypeError(error.message); }
        if (command.type !== 'lifecycle' || !expectedRevisionId || typeof command.invocationId !== 'string'
            || !/^[a-zA-Z0-9._:-]{1,128}$/.test(command.invocationId)) throw new TypeError('Lifecycle invocation and anchor required');
        const base = await this.load(handle, sessionId);
        if (!lifecycleDefinition(base)) throw new TypeError('Package lifecycle contract required');
        const fingerprint = hashNativeDocument(command.action);
        const receipt = base.states.atri_lifecycle.receipts.find(item => item.invocationId === command.invocationId);
        if (receipt) {
            if (receipt.fingerprint !== fingerprint) throw new TypeError('Lifecycle invocation conflict');
            return base;
        }
        if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict', { sessionId });
        const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        let prepared;
        const authorityBudget = hasAuthorityTransactions(base) ? await createAuthorityPublicationBudget(base, installed) : null;
        try { prepared = await prepareLifecycle(base, installed, command.action, authorityBudget); } catch (error) { throw new TypeError(error.message); }
        if (hashNativeDocument(prepared.states) === hashNativeDocument(base.states)) return base;
        const timeline = [...base.timeline]; const entries = []; const variants = [];
        for (const draft of prepared.drafts) { const created = this._newEntry(base, draft, timeline.length); timeline.push(created.entry); entries.push(created.entry); variants.push(created.variant); }
        return this._publish(handle, base, { states: prepared.states, timeline, entries, variants, authorityBudget, taskResolution: prepared.taskResolution, lifecycleReceipt: { invocationId: command.invocationId,
            fingerprint, baseRevisionId: expectedRevisionId, action: command.action.kind, events: prepared.events }, runAction: control?.status === 'pending' ? 'ready' : 'write' });
    }

    async applyContinuityCommand(handle, sessionId, command, { expectedRevisionId } = {}) {
        assertNativeId(expectedRevisionId, 'revision');
        return applyContinuity(this, handle, sessionId, command, expectedRevisionId);
    }

    async applyRealmCommand(handle, sessionId, command, { expectedRevisionId } = {}) {
        assertNativeId(expectedRevisionId, 'revision');
        return applyRealm(this, handle, sessionId, command, expectedRevisionId);
    }

    async getContinuityProjection(handle, sessionId, viewId, { revisionId = null } = {}) {
        const base = await this.load(handle, sessionId);
        return projectContinuity(this._continuity, handle, base, viewId, revisionId);
    }

    async getContinuityGraph(handle, sessionId, limit) {
        const base = await this.load(handle, sessionId);
        if (!continuityDefinition(base)) throw new TypeError('Continuity contract required');
        return this._continuity.graph(handle, base.session.packageId, limit);
    }

    async getHistory(handle, sessionId, query = {}) {
        return queryHistory(await this.load(handle, sessionId), query);
    }

    async getHistoryMetrics(handle, sessionId) {
        return historyMetrics(await this.load(handle, sessionId));
    }

    async prepareAuthorityTurn(handle, base, selection, player = null) {
        await this.runs.assert(handle, base.session.sessionId, 'generation');
        if (selection.transactionId === base.manifest.runtime?.experienceContract?.storyStart?.transactionId) throw runFailure('native_story_start_only');
        const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        return prepareAuthorityTurn(this, handle, base, installed, selection, player);
    }

    async finalizeTurn(handle, sessionId, { envelope: raw, invocationId, requestHash = null, provenance = [], authorityProof = null, knowledgeProof = null }, { expectedRevisionId } = {}) {
        if (!expectedRevisionId || typeof invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(invocationId)) throw new TypeError('Turn anchor and invocation required');
        const base = await this.load(handle, sessionId);
        let envelope = assertTurnEnvelope(raw);
        const fingerprint = hashNativeDocument(envelope);
        const existing = base.states[TASK_STATE_NAMESPACE]?.records.find(record => record.invocationId === invocationId)
            ?? base.states.atri_lifecycle?.taskTombstones.find(record => record.invocationId === invocationId);
        if (existing) {
            if (existing.fingerprint !== fingerprint || existing.kind !== 'turn'
                || (hasAuthorityTransactions(base) && existing.requestHash !== requestHash)) throw new TypeError('Turn invocation conflict');
            return base;
        }
        if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict', { sessionId });
        if (retiredInvocation(base.states.atri_lifecycle?.history, invocationId)) throw new TypeError('Archived turn invocation expired');
        const policy = base.manifest.runtime?.experienceContract?.taskRuntime?.turn;
        if (!policy) throw new TypeError('Package Turn contract required');
        if (policy.policy === 'authority-first' && envelope.outcomes.length) throw new TypeError('Authority-first narrative cannot write outcomes');
        if (policy.policy === 'narrative-outcome') {
            const interpreter = base.manifest.runtime.experienceContract.taskRuntime.tasks.find(task => task.id === policy.interpreterTaskId);
            if (envelope.outcomes.length !== 1 || envelope.outcomes[0].requestId !== interpreter.interpretation.id) throw new TypeError('Turn requires its declared Interpreter outcome');
            envelope = assertTurnEnvelope({ ...envelope, outcomes: [assertSemanticOutcome(envelope.outcomes[0], interpreter.interpretation)] });
        }
        const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        if (hasAuthorityTransactions(base)) {
            if (policy.policy !== 'authority-first' || envelope.outcomes.length || !envelope.narrative.trim()) throw authorityFailure('native_authority_narrative_invalid');
            const { prepared, player, selection } = authorityTurnProof(this, handle, base, authorityProof);
            const request = authorityActionRequest(prepared, selection, invocationId, expectedRevisionId, player);
            if (actionReceipts(base).some(item => item.authorityId === prepared.identity || item.idempotencyKey === request.idempotencyKey)) throw authorityFailure('native_authority_invocation_conflict');
            let candidate = { ...prepared.candidate, states: adoptKnowledge(this, handle, base, prepared.candidate.states, knowledgeProof) };
            const runPolicy = base.manifest.runtime.experienceContract.runPolicy;
            if (candidate.states[RUN_NAMESPACE] && runPolicy?.deathTransactions.includes(selection.transactionId)
                && prepared.outcome === runPolicy.deathOutcome) {
                candidate = { ...candidate, states: { ...candidate.states, [RUN_NAMESPACE]: { ...candidate.states[RUN_NAMESPACE], status: 'dead' } } };
            }
            const { entry, variant } = this._newEntry(candidate, { role: 'assistant', envelope }, candidate.timeline.length, true);
            return this._publish(handle, base, { states: candidate.states, timeline: [...candidate.timeline, entry],
                entries: [...(player ? [player.entry] : []), entry], variants: [...(player ? [player.variant] : []), variant],
                authorityPrepared: true, actionRequest: { ...request, assistantMessageId: entry.messageId },
                taskRecord: { kind: 'turn', invocationId, fingerprint, requestHash, provenance, anchorRevisionId: expectedRevisionId, branchId: base.revision.branchId,
                    outcomes: [], status: 'applied', authorityReceipt: { kind: 'authority', messageId: entry.messageId, authorityId: prepared.identity, inputHash: prepared.inputHash } } });
        }
        if (authorityProof) throw authorityFailure('native_authority_capability_required');
        const patch = envelope.outcomes.some(item => item.interpretation.decision !== 'no_change')
            ? await prepareTaskAuthority(base, installed, { outcomes: envelope.outcomes }) : {};
        const { entry, variant } = this._newEntry(base, { role: 'assistant', envelope }, base.timeline.length, true);
        return this._publish(handle, base, { states: adoptKnowledge(this, handle, base, { ...base.states, ...patch }, knowledgeProof), timeline: [...base.timeline, entry], entries: [entry], variants: [variant],
            taskRecord: { kind: 'turn', invocationId, fingerprint, requestHash, provenance, anchorRevisionId: expectedRevisionId, branchId: base.revision.branchId,
                outcomes: envelope.outcomes, status: 'applied', authorityReceipt: { kind: 'authority', messageId: entry.messageId } } });
    }

    async recordTaskResult(handle, sessionId, record, { expectedRevisionId, knowledgeProof = null } = {}) {
        if (!expectedRevisionId || typeof record.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(record.invocationId)) throw new TypeError('Task requires an invocation and revision anchor');
        const base = await this._current(handle, sessionId, expectedRevisionId);
        const queued = base.states.atri_lifecycle?.outbox.find(item => item.invocationId === record.invocationId);
        // Derive causality from durable authority data, never supplied model JSON.
        const { lifecycleCause: _untrustedCause, ...taskData } = record;
        record = { ...taskData, ...(queued ? { lifecycleCause: { ...queued.cause, scopeId: queued.scopeId, scopeEpoch: queued.scopeEpoch, workflowId: queued.workflowId } } : {}) };
        if (record.invocationId.startsWith('lc:') && !queued) throw new TypeError('Scheduled interaction no longer exists');
        if (queued && (queued.status !== 'pending' || base.states.atri_lifecycle.scopes[queued.scopeId].status !== 'active'
            || base.states.atri_lifecycle.scopes[queued.scopeId].epoch !== queued.scopeEpoch || queued.taskId !== record.taskId || queued.variantId !== record.variantId)) throw new TypeError('Scheduled interaction is stale or cancelled');
        if (base.states.atri_lifecycle?.taskTombstones.some(item => item.invocationId === record.invocationId)) throw new TypeError('Task invocation was compacted');
        const task = base.manifest.runtime?.experienceContract?.taskRuntime?.tasks.find(item => item.id === record.taskId);
        const variant = task?.variants.find(item => item.id === record.variantId);
        if (!variant || task.resultPolicy.resultClass === 'turn_context') throw new TypeError('Task result is not durable');
        const payload = assertTaskValue(record.payload, variant.outputSchema);
        if (task.resultPolicy.uses?.length && (!record.production
            || record.definitionHash !== hashNativeDocument(task) || record.normalizedResultHash !== hashNativeDocument(payload)
            || hashNativeDocument(record.production) !== hashNativeDocument(captureTaskProduction(base, task, assertTaskValue(record.production.input, task.inputSchema)))
            || record.promptProgramRef?.resourceId !== variant.prompt.resourceId || record.promptProgramRef?.revision !== variant.prompt.revision
            || record.generationProfileRef?.resourceId !== variant.generation.resourceId || record.generationProfileRef?.revision !== variant.generation.revision
            || record.deliveryReceipt?.kind !== 'model_delivery')) throw new TypeError('Task production provenance required');
        if (task.interpretation) assertSemanticOutcome({ requestId: task.interpretation.id, interpretation: payload }, task.interpretation);
        if (base.states[TASK_STATE_NAMESPACE]?.records.some(item => item.invocationId === record.invocationId)) throw new TypeError('Duplicate Task invocation');
        if (task.resultPolicy.sink === 'app_command') {
            const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
            const authorityBudget = hasAuthorityTransactions(base) ? await createAuthorityPublicationBudget(base, installed) : null;
            if (queued?.simulation) {
                const { simulationTaskCurrent } = await import('./simulation-authority.js');
                if (!authorityBudget || !simulationTaskCurrent(base, queued, authorityBudget)) throw new TypeError('Simulation proposal is stale');
            }
            const prepared = await prepareDeclaredTaskResult(base, installed, queued, task, variant, { ...record, payload }, authorityBudget);
            if (queued?.simulation) {
                const { prepareWorldSimulation } = await import('./simulation-authority.js');
                const candidate = { ...base, states: prepared.states };
                const clockId = base.manifest.runtime.experienceContract.simulationRuntime.clockId;
                prepared.states = (await prepareWorldSimulation(candidate, installed, candidate.states.atri_lifecycle.clocks[clockId], authorityBudget, { admit: false })).states;
            }
            return this._publish(handle, base, { states: adoptKnowledge(this, handle, base, prepared.states, knowledgeProof), authorityBudget, taskResolution: record.invocationId,
                taskRecord: { ...record, payload, kind: 'task', status: 'applied', resultClass: task.resultPolicy.resultClass,
                    anchorRevisionId: expectedRevisionId, branchId: base.revision.branchId, authorityReceipt: prepared.authorityReceipt } });
        }
        const draft = activityNarrative(base, queued, record, payload);
        const narrative = draft ? this._newEntry(base, draft, base.timeline.length) : null;
        return this._publish(handle, base, { states: adoptKnowledge(this, handle, base, base.states, knowledgeProof), ...(narrative ? { timeline: [...base.timeline, narrative.entry], entries: [narrative.entry], variants: [narrative.variant] } : {}),
            taskRecord: { ...record, payload, kind: 'task', ...(narrative ? { authorityReceipt: { kind: 'authority', messageId: narrative.entry.messageId, activityInstanceId: queued.activityInstanceId } } : {}), status: task.resultPolicy.sink === 'proposal' ? 'draft' : 'completed',
                resultClass: task.resultPolicy.resultClass, anchorRevisionId: expectedRevisionId, branchId: base.revision.branchId } });
    }

    async resolveTaskProposal(handle, sessionId, { invocationId, decision, payload }, { expectedRevisionId } = {}) {
        const base = await this.load(handle, sessionId);
        if (!expectedRevisionId || !['apply', 'reject'].includes(decision)) throw new TypeError('Proposal resolution requires explicit decision and anchor');
        const records = base.states[TASK_STATE_NAMESPACE]?.records ?? [];
        const record = records.find(item => item.invocationId === invocationId && item.kind === 'task');
        if (!record) throw new TypeError('Unknown proposal');
        if (record.status === 'applied' && decision === 'apply') {
            if (payload !== undefined && hashNativeDocument(payload) !== hashNativeDocument(record.payload)) throw new TypeError('Applied Proposal payload conflict');
            if (![base.revision.revisionId, record.authorityReceipt?.baseRevisionId].includes(expectedRevisionId)) throw new ConflictError('native_session_head_conflict', { sessionId });
            return base;
        }
        if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict', { sessionId });
        if (record.status !== 'draft') throw new TypeError('Proposal is closed');
        const task = base.manifest.runtime.experienceContract.taskRuntime.tasks.find(item => item.id === record.taskId);
        if (task.resultPolicy.sink !== 'proposal') throw new TypeError('Task is not a proposal');
        if (decision === 'apply' && (record.storedRevisionId !== expectedRevisionId || record.branchId !== base.revision.branchId)) throw new TypeError('Proposal is stale; generate a new proposal or explicitly fork');
        let patch = {};
        const nextPayload = payload === undefined ? record.payload : assertTaskValue(payload, task.variants.find(item => item.id === record.variantId).outputSchema);
        if (decision === 'apply') {
            const installed = await this._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
            if (task.interpretation) patch = await prepareTaskAuthority(base, installed, { outcomes: [{ requestId: task.interpretation.id, interpretation: nextPayload }] });
            else if (task.resultPolicy.applyCommand) patch = await prepareTaskAuthority(base, installed, { command: { id: task.resultPolicy.applyCommand, args: nextPayload } });
            else throw new TypeError('Proposal has no typed Apply action');
        }
        const states = { ...base.states, ...patch, [TASK_STATE_NAMESPACE]: { schemaVersion: 1, records: records.map(item => item !== record ? item : {
            ...record, payload: nextPayload,
            ...(hashNativeDocument(nextPayload) !== hashNativeDocument(record.payload) ? { derivedResult: { sourceHash: record.normalizedResultHash ?? hashNativeDocument(record.payload), resultHash: hashNativeDocument(nextPayload) } } : {}), status: decision === 'apply' ? 'applied' : 'rejected',
            authorityReceipt: decision === 'apply' ? { kind: 'authority', baseRevisionId: expectedRevisionId } : null,
        }) } };
        return this._publish(handle, base, { states, taskResolution: decision === 'apply' ? invocationId : null });
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
        if (base.manifest.runtime?.experienceContract?.informationRuntime && (Object.hasOwn(values, 'atri_context_derived') || deletes.includes('atri_context_derived'))) {
            throw new TypeError('Information derived state requires typed lifecycle publication');
        }
        if (base.manifest.runtime?.experienceContract?.taskRuntime && (Object.hasOwn(values, 'atri_knowledge_runtime') || deletes.includes('atri_knowledge_runtime'))) {
            throw new TypeError('Knowledge selection requires result adoption');
        }
        if (hasAuthorityTransactions(base) && (request || ['atri_world_state', 'atri_game_runtime'].some(namespace => Object.hasOwn(values, namespace) || deletes.includes(namespace)))) {
            throw authorityFailure('native_authority_typed_publication_required');
        }
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
    async _replyRetryBoundary(handle, current, messageId) {
        assertNativeId(messageId, 'message');
        const assistantIndex = current.timeline.findIndex(item => item.messageId === messageId);
        if (assistantIndex < 0) throw new NotFoundError('native retry assistant message', { messageId });
        const assistant = current.timeline[assistantIndex];
        if (assistant.role !== 'assistant' || assistantIndex !== current.timeline.length - 1) {
            throw new TypeError('Native Retry Reply requires the current committed assistant reply');
        }
        let userIndex = assistantIndex - 1;
        while (userIndex >= 0 && current.timeline[userIndex].role !== 'user') userIndex--;
        if (userIndex < 0) throw new TypeError(current.states.atri_lifecycle?.history?.checkpoint ? 'Reply archived at History checkpoint; continue or restore an explicit SavePoint' : 'Native Retry Reply requires a preceding committed user turn');
        const userMessageId = current.timeline[userIndex].messageId;

        const turn = current.states[TASK_STATE_NAMESPACE]?.records.find(item => item.kind === 'turn' && item.authorityReceipt?.messageId === messageId);
        const transaction = actionReceipts(current).find(item => item.source === 'frontend' && item.playerMessageId === userMessageId
            && (item.assistantMessageId === messageId || item.authorityId === turn?.authorityReceipt?.authorityId));
        const source = transaction ? await this.load(handle, current.session.sessionId, { revisionId: transaction.baseRevisionId }) : await this._findTimelineBoundary(handle, current.session.sessionId, current, userMessageId);
        return { transaction, source, userIndex, userMessageId };
    }

    async inspectReplyRetry(handle, sessionId, { messageId } = {}) {
        const current = await this._current(handle, sessionId), id = messageId || current.timeline.at(-1)?.messageId || '';
        if ((await this.runs.status(handle, sessionId))?.mode === 'ironman') return { messageId: id, eligible: false, reason: 'This story permits continuing from its current state only.' };
        try { await this._replyRetryBoundary(handle, current, id); return { messageId: id, eligible: true, reason: 'Retry returns to the committed input boundary; review and resolve the new branch.' }; } catch (error) {
            if (!(error instanceof TypeError) && !(error instanceof NotFoundError)) throw error;
            const archived = current.states.atri_lifecycle?.history?.checkpoint && (error instanceof NotFoundError || error.message.includes('archived'));
            return { messageId: id, eligible: false, reason: archived ? 'Reply archived at History checkpoint. Continue with a new input or restore an explicit SavePoint.' : 'Retry requires the current committed assistant reply and its available user input boundary.' };
        }
    }

    async retryReply(handle, sessionId, { messageId, expectedRevisionId } = {}) {
        await this.runs.assert(handle, sessionId, 'rewind');
        const current = await this._current(handle, sessionId, expectedRevisionId);
        const { transaction, source, userIndex, userMessageId } = await this._replyRetryBoundary(handle, current, messageId);
        if (transaction) {
            // A typed turn publishes its user input and reply in one CAS. Its
            // coherent retry boundary is the pre-effect revision plus that input,
            // not a Timeline slice inheriting the already committed mechanics.
            const branchId = createNativeId('branch');
            const last = source.timeline.at(-1);
            const branch = { branchId, sessionId, parentBranchId: source.revision.branchId,
                forkPoint: last ? { messageId: last.messageId, variantId: last.activeVariantId } : null, createdAt: Date.now() };
            const originalIdentity = current.timeline[userIndex].metadata?.atri_player_identity;
            // The transaction's base captured the input; no later selection is read.
            const retryState = source.states[PERSONA_NAMESPACE];
            if (originalIdentity && hashNativeDocument(personaIdentity(retryState?.solo) ?? null) !== hashNativeDocument(originalIdentity)) throw personaFailure('native_persona_conflict');
            const { entry, variant } = this._newEntry({ ...source, revision: { ...source.revision, branchId } }, { role: 'user', content: current.timeline[userIndex].content,
                metadata: { atri_authority_retry: { revisionId: current.revision.revisionId, playerMessageId: userMessageId } } });
            return this._publish(handle, { ...source, session: current.session }, { branchId,
                timeline: [...source.timeline, entry], entries: [entry], variants: [variant], branches: [branch],
                graph: [...current.graph, { branchId, forkRevisionId: source.revision.revisionId, branch }], runAction: 'rewind' });
        }
        return this.forkBranch(handle, sessionId, {
            revisionId: source.revision.revisionId,
            expectedRevisionId: current.session.headRevisionId,
        });
    }

    async forkBranch(handle, sessionId, { revisionId, messageId, displayName, expectedRevisionId } = {}) {
        await this.runs.assert(handle, sessionId, 'rewind');
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
                { branchId, forkRevisionId: source.revision.revisionId, branch }], runAction: 'rewind',
        });
    }

    async switchBranch(handle, sessionId, branchId, { expectedRevisionId } = {}) {
        await this.runs.assert(handle, sessionId, 'rewind');
        const current = await this._current(handle, sessionId, expectedRevisionId);
        const node = current.graph.find(item => item.branchId === branchId);
        if (!node) throw new NotFoundError('native branch', { branchId });
        const source = await this.load(handle, sessionId, { revisionId: node.headRevisionId });
        return this._publish(handle, { ...source, session: current.session }, { graph: current.graph, runAction: 'rewind' });
    }

    async listSavePoints(handle, sessionId) {
        await this.load(handle, sessionId);
        return this._saves.list(handle, sessionId);
    }

    async createSavePoint(handle, sessionId, { revisionId, expectedRevisionId, kind = 'manual', displayName } = {}) {
        return this._sessions.withRunLock(handle, sessionId, () => this._createSavePointLocked(handle, sessionId, { revisionId, expectedRevisionId, kind, displayName }));
    }

    async _createSavePointLocked(handle, sessionId, { revisionId, expectedRevisionId, kind, displayName }) {
        await this.runs.assert(handle, sessionId, 'save', revisionId);
        // Exact revision is immutable; guarded frontend saves never capture a
        // newer HEAD accidentally even if publication races the SavePoint write.
        if (expectedRevisionId !== undefined) {
            await this._current(handle, sessionId, expectedRevisionId);
            if (revisionId !== undefined && revisionId !== expectedRevisionId) throw new TypeError('Save revision must match guard');
            revisionId = expectedRevisionId;
        }
        const source = await this.load(handle, sessionId, { revisionId });
        const illustrationHead = source.revision.branchId === source.session.activeBranchId
            ? source.session.illustrationHead : source.session.illustrationHeads?.[source.revision.branchId];
        return this._saves.create(handle, { saveId: createNativeId('savePoint'), sessionId,
            branchId: source.revision.branchId, revisionId: source.revision.revisionId, kind, createdAt: Date.now(),
            ...(illustrationHead ? { illustrationHead } : {}),
            ...(displayName === undefined ? {} : { displayName }) });
    }

    async restoreSavePoint(handle, sessionId, saveId, { expectedRevisionId } = {}) {
        await this.runs.assert(handle, sessionId, 'rewind');
        const save = await this._saves.get(handle, sessionId, saveId);
        if (!save) throw new NotFoundError('native save point', { saveId });
        const current = await this._current(handle, sessionId, expectedRevisionId);
        if (
            current.session.headRevisionId === save.revisionId
            && current.session.activeBranchId === save.branchId
            && (current.session.illustrationHead ?? null) === (save.illustrationHead ?? null)
        ) {
            invalidateFrontendEpoch(handle, sessionId);
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
            ], runAction: 'rewind', illustrationHead: save.illustrationHead ?? null,
        });
    }
}
