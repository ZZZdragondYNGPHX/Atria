import { ContextPort } from '../orchestration/context-port.js';
import { VisualStore } from '../visual-store.js';
import { VisualDirector } from '../visual-director.js';
import { registerVisualWake } from '../visual-events.js';
import { prepareIndependent } from '../../../public/shared/native-independent-preparation.js';
import { optionalComputeOptions, COMPUTE_ADMISSION_CODES } from '../../../public/shared/native-compute-budget.js';
import { observeEvolutionProject, prepareEvolutionProject } from '../agent-intelligence/evolution-observer.js';
import { createPreviewSkillRepository } from '../model-prompt-runtime/preview-skills.js';
import { tryAuthoringSample } from '../model-prompt-runtime/draft-preview.js';
import { captureAuthoringSample, authoringSamplePlan } from '../model-prompt-runtime/authoring-sample.js';
import { chargeComputeAttempt, settleComputeAttempt, chargeLocalWork, settleLocalWork } from '../../../public/shared/native-compute-budget.js';
import { previewPromptDraft } from '../model-prompt-runtime/draft-preview.js';
import { assertPreviewDisclosure } from '../model-prompt-runtime/preview-disclosure.js';
import { assertExactResourceRef } from '../model-prompt-runtime/contracts.js';
import { randomUUID } from 'node:crypto';
import { processPackageText } from '../processing-runtime.js';
import { prepareKnowledgeAdoption } from '../knowledge-authority.js';
import { captureTaskProduction } from '../task-artifact-authority.js';
import { hasAuthorityTransactions, authorityCatalog, authoritySelection, resolverRequest, authorityValue, authorityFailure, authoritySelectionCache, authorityTurnProof, authorityPlayerEntry } from '../authority-turn.js';
import { buildAuthorityObservation } from '../authority-transaction.js';
import { isNativeId } from '../identity.js';
import { prepareNarrativeSkills, runNarrativeSkillLoop, completeNarrativeSkillTools, isNarrativeSkillInvocation } from '../skill-invocation.js';
import { publicSessionTaskMessages, sessionTaskRoundCount, completeSessionTaskHistory } from '../../../public/shared/native-session-task-history.js';
import { GenerationService } from '../model-prompt-runtime/generation-service.js';
import { compiledRequestBinding, compiledSendIdentity } from '../model-prompt-runtime/compiled-binding.js';
import { mintNativeNarratorQuota, mintNativeResolverQuota, assertNativeTurnQuota } from '../orchestration/native-turn-quota.js';
import { captureNativeAuthorityResolver } from '../orchestration/authority-resolver-context.js';
import { captureNativeTurnPermit } from '../orchestration/native-turn-permit.js';
import { runGenerationLocalWork, assertContextCompilation } from '../orchestration/generation-local-work.js';
import { authorityContextItems, appendAuthorityContext, narrowNativeContextSelection, emptyNativeContextPlan } from './native-authority-context.js';
import { assertExecutionEvidenceCurrent } from '../model-prompt-runtime/execution-evidence.js';
import { RuntimeCheckpointStore } from '../model-prompt-runtime/runtime-checkpoint-store.js';
import { nativeExecutionScope } from '../model-prompt-runtime/native-execution-envelope.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../model-prompt-runtime/prompt-compiler.js';
import { createNativeSessionContextAdapter, nativeSessionContextOptions } from './native-session-context.js';
import { assertInformationActorAvailable, informationDefinition, informationContext, informationSourceMessageIds, memoryEvidenceApplicability } from '../../../public/shared/native-information-runtime.js';
import { immutable, ProviderFailure, GenerationError, checkCancellation, containsSecret, inspectProviderHttpFailure, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { assertTaskValue, normalizeTaskGenerationResult } from '../../../public/shared/native-task-contract.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { equalNativeDocuments, hashNativeDocument } from '../repositories/common.js';
import { assertTurnEnvelope } from '../../../public/shared/native-message-contract.js';
import { AgentEvidenceRepository } from '../agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../agent-intelligence/evidence-service.js';
import { beginHostCapture } from '../agent-intelligence/host-capture.js';
import { appraisalEventCurrent, prepareAppraisalDelivery } from '../appraisal-authority.js';
import { assertPredictionCapture, assertPredictionCaptureCurrent } from '../prediction-service.js';
import { projectRuntimeRoute } from './project-runtime-route.js';
import { taskRuntimeRoute } from './task-runtime-route.js';
import { selectNativeTaskContext } from './task-context-items.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const predictionLanes = new WeakSet();
const turnProducerLanes = new WeakMap();
const modelTerminalFacts = new WeakMap();

function ordinaryBackgroundIntent(snapshot, intent, task, variant, payload) {
    const lifecycle = snapshot.states.atri_lifecycle;
    return Boolean(lifecycle?.ready && intent && !intent.simulation && !intent.appraisalEvent
        && task.executionClass === 'background' && intent.kind === 'task' && intent.status === 'pending'
        && intent.taskId === task.id && intent.variantId === variant.id
        && lifecycle.scopes[intent.scopeId]?.status === 'active' && lifecycle.scopes[intent.scopeId].epoch === intent.scopeEpoch
        && equalNativeDocuments(intent.input, payload));
}

function executionTimeout(capture, requestLimit) {
    const routes = Object.values(capture.routes ?? {});
    const requestMs = Math.max(0, ...routes.map(route => route.policy.timeoutMs));
    const attempts = requestLimit ?? (1 + Math.max(0, ...routes.map(route => route.policy.maxFallbackAttempts))) * (1 + nativeTaskScheduler.retries);
    // Route deadlines cover send and response consumption. A parent Turn must
    // leave time for every bounded request, plus queue/preparation overhead.
    return Math.min(2147483647, Math.max(nativeTaskScheduler.timeoutMs, requestMs * attempts + 30000));
}

function normalizeHostMemoryEvidence(value, snapshot) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 32) fail('native_turn_memory_evidence_invalid');
    const turn = snapshot.manifest.runtime?.experienceContract?.taskRuntime?.turn;
    const information = informationContext(snapshot, { kind: 'narrator' }, turn?.narratorTaskId);
    if (value.length && !information?.memory) fail('native_turn_memory_evidence_denied');
    const messageIds = new Set(informationSourceMessageIds(snapshot, information));
    return value.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)
            || Object.keys(raw).some(key => !['memoryId', 'content', 'sourceRefs', 'tokenCount', 'source', 'atomicGroup'].includes(key))) {
            fail('native_turn_memory_evidence_invalid');
        }
        const memoryId = String(raw.memoryId || ('memory-' + index)).trim();
        const content = String(raw.content || '').trim();
        if (!memoryId || memoryId.length > 160 || !content || content.length > 48000
            || !Array.isArray(raw.sourceRefs) || !raw.sourceRefs.length || raw.sourceRefs.length > 64) {
            fail('native_turn_memory_evidence_invalid');
        }
        const sourceRefs = raw.sourceRefs.map(ref => {
            if (!ref || typeof ref !== 'object' || Array.isArray(ref)
                || Object.keys(ref).some(key => !['kind', 'messageId', 'branchId', 'revisionId'].includes(key))
                || ref.kind !== 'timeline'
                || typeof ref.messageId !== 'string' || !messageIds.has(ref.messageId)
                || ref.branchId !== snapshot.revision.branchId
                || ref.revisionId !== snapshot.revision.revisionId) {
                fail('native_turn_memory_evidence_stale');
            }
            return { kind: 'timeline', messageId: ref.messageId,
                branchId: ref.branchId, revisionId: ref.revisionId };
        });
        const tokenCount = Number(raw.tokenCount);
        if (!['legacy', 'applicable'].includes(memoryEvidenceApplicability(snapshot, information, { sourceRefs }).status)) fail('native_turn_memory_evidence_inapplicable');
        if (raw.atomicGroup !== undefined && (typeof raw.atomicGroup !== 'string' || !raw.atomicGroup || raw.atomicGroup.length > 160)) fail('native_turn_memory_evidence_invalid');
        return { memoryId, content, sourceRefs, ...(raw.atomicGroup ? { atomicGroup: raw.atomicGroup } : {}),
            ...(Number.isFinite(tokenCount) && tokenCount >= 0 && tokenCount <= 32768 ? { tokenCount: Math.floor(tokenCount) } : {}) };
    });
}
const ROLES = new Set(['narrator', 'intent_resolver', 'event_interpreter', 'orchestrator', 'studio', 'memory', 'search', 'illustration_prompt']);

export function selectNativeRuntimeRoute(routeList, role, routeRef) {
    if (routeRef) {
        const route = routeList.find(item => item.runtimeRouteId === routeRef.runtimeRouteId && item.role === role);
        if (!route) fail('native_generation_route_missing');
        return route;
    }
    const fallbacks = new Set(routeList.flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
    const matches = routeList.filter(item => item.role === role && !fallbacks.has(item.runtimeRouteId));
    if (matches.length !== 1) fail(matches.length ? 'native_generation_route_ambiguous' : 'native_generation_route_missing');
    return matches[0];
}


function requiredTurnRoles(manifest, entryPoint, sourceFiles) {
    const turn = manifest.runtime?.experienceContract?.taskRuntime?.turn;
    if (!turn) return [];
    const roles = turn.narratorTaskId ? [] : ['narrator'];
    const hasLogic = entryPoint ? (entryPoint.runtime?.game?.logic ?? manifest.runtime?.game?.logic)
        : manifest.runtime?.game?.logic || manifest.entryPoints?.some(entry => entry.runtime?.game?.logic);
    const logicPath = entryPoint?.runtime?.game?.logic ?? manifest.runtime?.game?.logic;
    const bytes = sourceFiles?.get(logicPath);
    // Exact Frontend actions do not invoke the generic tool resolver. A Package
    // with only closed Authority intents must not require a fourth, unused route.
    const exposed = manifest.runtime?.experienceContract?.authorityRuntime && bytes
        ? JSON.parse(Buffer.from(bytes).toString('utf8')).transactions?.some(transaction => transaction.intent?.expose !== false) !== false : true;
    if (turn.policy === 'authority-first' && hasLogic && exposed) roles.push('intent_resolver');
    return roles;
}

function startupTaskVariants(contract) {
    const tasks = contract?.taskRuntime?.tasks ?? [];
    const selected = new Map(tasks.map(task => [task.id, new Set([task.variants[0].id])]));
    for (const action of [...(contract?.lifecycleRuntime?.automations ?? []).map(item => item.action),
        ...(contract?.lifecycleRuntime?.workflows ?? []).flatMap(flow => flow.nodes.map(node => node.action))]) {
        if (action?.kind === 'task') selected.get(action.taskId).add(action.variantId);
    }
    for (const activity of contract?.presentationRuntime?.activities ?? []) {
        if (activity.narrator) selected.get(activity.narrator.taskId).add(activity.narrator.variantId);
    }
    return selected;
}

// A host composition over existing P1 storage and Native Session/Studio authorities.
export class NativeGenerationHost {
    /** Original execution facts only. This never grants response consumption. */
    inspectModelTerminalFacts(error, handle) {
        const original = modelTerminalFacts.get(error);
        return original?.host === this && original.engine === this.persistence._engine
            && original.hostBootId === this.persistence._engine.nativeHostLifecycle?.hostBootId
            && original.facts.handle === handle ? original.facts : null;
    }

    constructor({ persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort, skillRepository, extensions, turnOrchestration, projectCommitAuthority = null }) {
        Object.assign(this, { persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort, skillRepository, extensions, turnOrchestration, projectCommitAuthority });
        if (extensions && persistence?._engine && sessionCore) registerVisualWake(persistence._engine, async (handle, sessionId) => {
            const settings = await extensions.illustrationSettings(handle);
            if (settings.value.director?.mode !== 'manual') await new VisualDirector({ host: this }).scan(handle, sessionId);
        });
    }

    get authoritySelections() { return authoritySelectionCache(this.sessionCore); }

    startRp(handle, input, options) {
        if (!this.turnOrchestration) fail('native_orchestration_rp_authority_unavailable');
        return this.turnOrchestration.startRp(this, handle, input, options);
    }

    preflightRp(handle, input) {
        if (!this.turnOrchestration) fail('native_orchestration_rp_authority_unavailable');
        return this.turnOrchestration.preflightRp(this, handle, input);
    }

    prepareProjectCommit(handle, input) {
        if (!this.projectCommitAuthority) fail('native_orchestration_project_commit_unavailable');
        return this.projectCommitAuthority.prepare(handle, input);
    }

    preflightProjectCommit(handle, input) {
        if (!this.projectCommitAuthority) fail('native_orchestration_project_commit_unavailable');
        return this.projectCommitAuthority.preflight(handle, input);
    }

    dispatchProjectCommit(handle, input, target) {
        if (!this.projectCommitAuthority) fail('native_orchestration_project_commit_unavailable');
        return this.projectCommitAuthority.dispatch(handle, input, target);
    }

    resumeProjectCommit(handle, input, target) {
        if (!this.projectCommitAuthority) fail('native_orchestration_project_commit_unavailable');
        return this.projectCommitAuthority.resume(handle, input, target);
    }

    observeProjectCommit(handle, input, target) {
        if (!this.projectCommitAuthority) fail('native_orchestration_project_commit_unavailable');
        return this.projectCommitAuthority.observe(handle, input, target);
    }

    // The capture is minted by the server's prediction authority. Request JSON
    // cannot grant a context, and this path has no Session publication callback.
    async executePrediction(handle, input, capture, signal) {
        return this._executePrediction(handle, input, capture, signal);
    }

    async previewPrediction(handle, input, capture, signal) {
        return this._executePrediction(handle, input, capture, signal, { preview: true });
    }

    async _executePrediction(handle, input, capture, signal, { preview = false } = {}) {
        if (!input || Object.keys(input).some(key => !['sessionId', 'revisionId', 'requestId', 'routeRef'].includes(key))) fail('native_prediction_request_invalid');
        const captured = assertPredictionCapture(capture, { host: this, handle });
        await assertPredictionCaptureCurrent(capture);
        const snapshot = captured.snapshot;
        if (snapshot.session.sessionId !== input.sessionId || snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(input.requestId)) fail('native_task_invocation_required');
        await this.sessionCore.runs.assert(handle, input.sessionId, 'generate');
        const routes = await this.persistence.listRuntimeRoutes(handle);
        const route = routes.find(value => value.runtimeRouteId === input.routeRef?.runtimeRouteId && value.scope === 'player');
        if (!route || input.routeRef?.scope !== 'player') fail('native_task_binding_missing');
        if (!['role.narrator', 'role.intent_resolver'].includes(route.role)) fail('native_prediction_route_unsupported');
        const { task, variant, slot } = captured;
        const payload = captured.payload;
        const fingerprint = hashNativeDocument({ task, variant, payload, anchor: captured.baseAnchor, routeRef: input.routeRef });
        const taskPlan = { task, variant, slot, payload, executionFingerprint: fingerprint };
        const lanePlan = { prediction: { capture, payload }, budgetContext: { snapshot,
            anchor: { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId } } };
        predictionLanes.add(lanePlan);
        const resources = await this.executionResources(handle, route, input.sessionId, lanePlan);
        const result = await nativeTaskScheduler.submit({ owner: handle, kind: 'model_task', executionClass: 'interactive', resources,
            anchor: { sessionId: input.sessionId, branchId: snapshot.revision.branchId, revisionId: input.revisionId },
            key: input.sessionId + ':' + input.requestId + ':prediction', fingerprint, signal, retry: false,
            timeoutMs: executionTimeout(lanePlan),
            fresh: async () => { await assertPredictionCaptureCurrent(capture); return true; },
            run: boundary => this.execute(handle, { sessionId: input.sessionId, revisionId: input.revisionId, requestId: input.requestId,
                role: route.role.replace(/^role\./, ''), routeRef: input.routeRef,
                outputContract: { name: 'atria_prediction', schema: variant.outputSchema } }, boundary.signal, undefined,
            { taskPlan, scheduled: true, lanePlan, preview }),
            finalize: async generated => {
                await assertPredictionCaptureCurrent(capture);
                if (preview) return generated;
                const payload = normalizeTaskGenerationResult(generated.response, variant.outputSchema);
                if (generated.response.toolCalls?.length || generated.response.tool_calls?.length) fail('native_prediction_tools_denied');
                return immutable({ record: { invocationId: input.requestId, taskId: task.id, variantId: variant.id, fingerprint, payload,
                    definitionHash: hashNativeDocument(task), contextHash: hashNativeDocument(generated.snapshot.contextPlan),
                    requestSnapshotHash: hashNativeDocument(generated.snapshot), rawResultHash: hashNativeDocument(generated.response),
                    normalizedResultHash: hashNativeDocument(payload), execution: generated.snapshot.diagnostics?.effectiveConfig ?? null,
                    promptProgramRef: generated.snapshot.promptProgramRef, generationProfileRef: generated.snapshot.generationProfileRef,
                    runtimeRouteId: generated.snapshot.runtimeRouteId }, routing: generated.routing });
            } }).result;
        await assertPredictionCaptureCurrent(capture);
        return result;
    }

    async executionResources(handle, route, sessionId, capture = {}) {
        capture.routes ??= {}; capture.connections ??= {}; capture.models ??= {};
        const routes = await this.persistence.listRuntimeRoutes(handle);
        const lanes = new Map();
        const collect = lane => {
            if (!lane || lanes.has(lane.runtimeRouteId)) return;
            if (lanes.size >= 64) fail('native_generation_lane_limit');
            lanes.set(lane.runtimeRouteId, lane);
            for (const ref of lane.fallbackRouteRefs) collect(routes.find(item => item.runtimeRouteId === ref.runtimeRouteId));
        };
        collect(route);
        const resources = sessionId ? ['session:' + handle + ':' + sessionId] : [];
        for (const lane of lanes.values()) {
            const connection = await this.persistence.getConnectionProfile(handle, lane.connectionProfileRef.connectionProfileId);
            const model = await this.persistence.getModelProfile(handle, lane.modelProfileRef.modelProfileId);
            capture.routes[lane.runtimeRouteId] = immutable(lane);
            capture.connections[connection.connectionProfileId] = immutable(connection);
            capture.models[model.modelProfileId] = immutable(model);
            resources.push('route:' + handle + ':' + lane.runtimeRouteId, 'connection:' + handle + ':' + lane.connectionProfileRef.connectionProfileId,
                'model:' + handle + ':' + lane.modelProfileRef.modelProfileId, 'provider:' + connection.providerAdapter);
        }
        return resources;
    }

    async _turnLanes(handle, base, input, transaction = null) {
        const runtime = base.manifest.runtime?.experienceContract?.taskRuntime;
        if (!runtime?.turn) fail('native_turn_contract_required');
        const routes = await this.persistence.listRuntimeRoutes(handle), lanes = [], authority = hasAuthorityTransactions(base);
        if (!runtime.turn.narratorTaskId) lanes.push(selectNativeRuntimeRoute(routes, 'role.narrator', input.routeRef));
        if (!transaction && !(authority && base.timeline.at(-1)?.metadata?.atri_authority_retry) && runtime.turn.policy === 'authority-first'
            && (authority || input.userInput?.trim()) && (base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic)) lanes.push(selectNativeRuntimeRoute(routes, 'role.intent_resolver'));
        for (const id of [...runtime.turn.stages, runtime.turn.narratorTaskId, runtime.turn.interpreterTaskId].filter(Boolean)) {
            const task = runtime.tasks.find(item => item.id === id), ref = input.slotBindings?.[task.bindingSlotId];
            const lane = ref?.scope === 'player' && routes.find(item => item.runtimeRouteId === ref.runtimeRouteId);
            if (!lane) fail('native_task_binding_missing');
            lanes.push(lane);
        }
        return lanes;
    }

    async _controlledTurnConfiguration(handle, base, input) {
        const lanes = await this._turnLanes(handle, { ...base, timeline: [{ role: 'user', content: input.userInput }] }, input), capture = {};
        for (const lane of lanes) await this.executionResources(handle, lane, input.sessionId, capture);
        return { selectedRouteIds: lanes.map(route => route.runtimeRouteId), ...capture,
            orchestrationBinding: this.turnOrchestration ? await this.turnOrchestration.inspectBinding({ handle, base }) : null,
            taskRuntime: base.manifest.runtime.experienceContract.taskRuntime, generationBudget: base.manifest.runtime.experienceContract.generationBudget ?? null,
            packageContentHash: base.session.packageContentHash, packageVersionId: base.session.packageVersionId, entryPointId: base.session.entryPointId,
            runtimeFingerprint: hashNativeDocument({ runtime: base.manifest.runtime, entryPointRuntime: base.entryPoint.runtime ?? null }) };
    }

    _controlledTurnInput(input) {
        if (!input || Object.keys(input).some(key => !['sessionId', 'expectedRevisionId', 'commitId', 'invocationId', 'userInput', 'routeRef', 'slotBindings'].includes(key))
            || typeof input.userInput !== 'string' || !input.userInput.trim() || input.userInput.length > 32000
            || typeof input.commitId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.commitId)
            || typeof input.invocationId !== 'string' || !/^[A-Za-z0-9._:-]{1,96}$/.test(input.invocationId)) fail('native_turn_request_invalid');
        if (input.routeRef && (Object.keys(input.routeRef).some(key => !['scope', 'runtimeRouteId'].includes(key)) || input.routeRef.scope !== 'player')) fail('native_turn_request_invalid');
        if (input.slotBindings !== undefined && (!input.slotBindings || typeof input.slotBindings !== 'object' || Array.isArray(input.slotBindings))) fail('native_turn_request_invalid');
        for (const ref of Object.values(input.slotBindings ?? {})) if (!ref || Object.keys(ref).some(key => !['scope', 'runtimeRouteId'].includes(key)) || ref.scope !== 'player') fail('native_turn_request_invalid');
        return input;
    }

    async preflightControlledTurn(handle, value) {
        const input = this._controlledTurnInput(value), base = await this.sessionCore.observe(handle, input.sessionId);
        if (base.revision.revisionId !== input.expectedRevisionId) fail('native_generation_revision_conflict');
        const configuration = await this._controlledTurnConfiguration(handle, base, input);
        return { source: { sessionId: input.sessionId, revisionId: input.expectedRevisionId, branchId: base.revision.branchId,
            packageVersionId: base.session.packageVersionId, packageContentHash: base.session.packageContentHash },
        requestFingerprint: hashNativeDocument({ draft: { role: 'user', content: input.userInput }, expectedRevisionId: input.expectedRevisionId }),
        turnInputFingerprint: hashNativeDocument(input), configurationFingerprint: hashNativeDocument(configuration), configuration,
        automaticResend: 'disabled', backgroundModel: 'suppressed', backgroundSimulation: 'not_started', observation: 'pure_committed_snapshot' };
    }

    async executeControlledTurn(handle, value, signal, onChunk) {
        if (!value || Object.keys(value).some(key => !['input', 'committedRevisionId', 'approvedReview'].includes(key))) fail('native_turn_request_invalid');
        const input = this._controlledTurnInput(value.input), review = value.approvedReview;
        if (!review || Object.keys(review).some(key => !['turnInputFingerprint', 'configurationFingerprint', 'requestFingerprint'].includes(key))
            || !['turnInputFingerprint', 'configurationFingerprint', 'requestFingerprint'].every(key => /^[a-f0-9]{64}$/.test(review[key] ?? ''))
            || hashNativeDocument(input) !== review.turnInputFingerprint) fail('native_generation_review_stale');
        const parent = await this.sessionCore.observe(handle, input.sessionId, { revisionId: input.expectedRevisionId });
        const base = await this.sessionCore.observe(handle, input.sessionId);
        const receipt = await this.sessionCore._sessions.getCommitReceipt(handle, input.sessionId, input.commitId);
        const requestFingerprint = hashNativeDocument({ draft: { role: 'user', content: input.userInput }, expectedRevisionId: input.expectedRevisionId });
        if (!receipt || receipt.status !== 'committed' || receipt.sessionId !== input.sessionId || receipt.expectedRevisionId !== input.expectedRevisionId
            || receipt.commitId !== input.commitId || receipt.revisionId !== value.committedRevisionId || receipt.branchId !== parent.revision.branchId
            || receipt.fingerprint !== requestFingerprint || requestFingerprint !== review.requestFingerprint
            || base.revision.revisionId !== value.committedRevisionId || base.core.parentRevisionId !== input.expectedRevisionId
            || base.timeline.at(-1)?.role !== 'user' || base.timeline.at(-1)?.content !== input.userInput) fail('native_turn_commit_receipt_conflict');
        const checked = { ...review, input, branchId: parent.revision.branchId };
        await this._assertControlledTurn(handle, base, checked);
        return this.executeTurn(handle, { sessionId: input.sessionId, revisionId: value.committedRevisionId, invocationId: input.invocationId,
            userInput: input.userInput, ...(input.routeRef ? { routeRef: input.routeRef } : {}), ...(input.slotBindings ? { slotBindings: input.slotBindings } : {}) }, signal, onChunk,
        { controlledReview: checked });
    }

    async _assertControlledTurn(handle, base, review) {
        const configuration = await this._controlledTurnConfiguration(handle, base, review.input);
        if (base.revision.branchId !== review.branchId || hashNativeDocument(configuration) !== review.configurationFingerprint)
            throw new GenerationError('native_generation_review_stale');
    }

    async executionPreflight(handle, input) {
        if (!input || Object.keys(input).some(key => !['sessionId', 'revisionId', 'role', 'routeRef'].includes(key)) || input.role !== 'orchestrator') fail('native_generation_role_invalid');
        const base = await this.sessionCore.observe(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const configuration = { routes: await this.persistence.listRuntimeRoutes(handle), models: await this.persistence.listModelProfiles(handle), connections: await this.persistence.listConnectionProfiles(handle) };
        const route = selectNativeRuntimeRoute(configuration.routes, 'role.orchestrator', input.routeRef);
        if (!route.executionPolicy?.computeBudget) fail('native_generation_budget_unavailable');
        const model = configuration.models.find(value => value.modelProfileId === route.modelProfileRef.modelProfileId);
        const connection = configuration.connections.find(value => value.connectionProfileId === route.connectionProfileRef.connectionProfileId);
        return { source: { sessionId: input.sessionId, revisionId: input.revisionId, branchId: base.revision.branchId, packageVersionId: base.session.packageVersionId },
            route, model, connection, configurationFingerprint: hashNativeDocument(configuration), budget: route.executionPolicy.computeBudget,
            economics: 'unknown', backgroundModel: 'suppressed', automaticResend: 'disabled' };
    }

    async executeTurn(handle, input, signal, onChunk, { transaction = null, controlledReview = null } = {}) {
        if (!this.persistence._engine) return this._executeTurn(handle, input, signal, onChunk, { transaction, controlledReview });
        const identity = hashNativeDocument({ handle, kind: 'turn', input, transaction: transaction ? authorityValue(transaction) : null, controlledReview });
        this.evidenceOperations ??= new Map();
        // Share the observer for an exact concurrent scheduler request. Scheduling,
        // cancellation and finalization remain owned by NativeTaskScheduler.
        if (this.evidenceOperations.has(identity)) return this.evidenceOperations.get(identity);
        const pending = Promise.resolve().then(() => this._captureTurn(handle, input, signal, onChunk, { transaction, controlledReview }));
        this.evidenceOperations.set(identity, pending);
        try { return await pending; } finally { this.evidenceOperations.delete(identity); }
    }

    async _captureTurn(handle, input, signal, onChunk, { transaction = null, controlledReview = null } = {}) {
        const engine = this.persistence._engine;
        // Authenticate and validate the original Session authority before saving a marker.
        const base = await this.sessionCore[controlledReview ? 'observe' : 'load'](handle, input.sessionId);
        const previous = base.states.atri_task_results?.records.find(item => item.invocationId === input.invocationId);
        if (previous) return this._executeTurn(handle, input, signal, onChunk, { transaction, controlledReview });
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.invocationId)) fail('native_turn_request_invalid');
        const capture = await beginHostCapture(new AgentEvidenceRepository({ engine }), handle,
            { domain: 'rp_session', sessionId: input.sessionId }, controlledReview
                ? 'controlled-turn:' + hashNativeDocument({ owner: handle, sessionId: input.sessionId, commitId: controlledReview.input.commitId, invocationId: input.invocationId })
                : 'turn:' + input.invocationId + ':' + randomUUID(), input.invocationId, 'foreground', null, { requireNew: Boolean(controlledReview) });
        let result;
        try { result = await this._executeTurn(handle, input, signal, onChunk, { transaction, evidenceCapture: capture, controlledReview }); } catch (error) { await capture?.fail(signal?.aborted || error.code === 'operation_cancelled'); throw error; }
        // Formal result already exists. Capture failure must never cause its replay.
        let evidenceCapture;
        const evidenceCore = controlledReview ? Object.create(this.sessionCore) : this.sessionCore;
        if (controlledReview) evidenceCore.load = (...args) => this.sessionCore.observe(...args);
        try { evidenceCapture = await capture?.finish(result, new AgentEvidenceService({ sessionCore: evidenceCore })); } catch { evidenceCapture = { status: 'failed', missing: 1 }; }
        return { ...result, evidenceCapture: evidenceCapture ?? { status: 'failed', missing: 1 } };
    }

    async _executeTurn(handle, input, signal, onChunk, { transaction = null, evidenceCapture = null, controlledReview = null } = {}) {
        input = immutable(input);
        transaction = transaction ? immutable(authorityValue(transaction)) : null;
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.invocationId)
            || Object.keys(input).some(key => !['sessionId', 'revisionId', 'invocationId', 'requestId', 'userInput', 'stageInputs', 'variants', 'slotBindings', 'routeRef', 'hostMemoryEvidence'].includes(key))) fail('native_turn_request_invalid');
        const { requestId: _requestId, ...turnRequest } = input;
        const requestHash = hashNativeDocument(transaction ? { ...turnRequest, transaction } : turnRequest);
        const base = await this.sessionCore[controlledReview ? 'observe' : 'load'](handle, input.sessionId);
        const previous = base.states.atri_task_results?.records.find(item => item.invocationId === input.invocationId)
            ?? base.states.atri_lifecycle?.taskTombstones.find(item => item.invocationId === input.invocationId);
        if (previous) {
            if (previous.requestHash !== requestHash || previous.kind !== 'turn'
                || (hasAuthorityTransactions(base) && (previous.branchId !== base.revision.branchId || previous.anchorRevisionId !== input.revisionId))) fail('native_turn_invocation_conflict');
            return base;
        }
        await this.sessionCore.runs.assert(handle, input.sessionId, 'generate');
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const runtime = base.manifest.runtime?.experienceContract?.taskRuntime;
        if (!runtime?.turn) fail('native_turn_contract_required');
        const authority = hasAuthorityTransactions(base);
        if (transaction && !authority) fail('native_authority_capability_required');
        if (authority && runtime.turn.policy !== 'authority-first') fail('native_authority_turn_policy_required');
        if (controlledReview) await this._assertControlledTurn(handle, base, controlledReview);
        const orchestrationSelection = this.turnOrchestration ? await this.turnOrchestration.preflightBinding({ host: this, handle, base, input, transaction }) : null;
        const lanes = orchestrationSelection ? await this.turnOrchestration.selectedTurnLanes({ host: this, handle, base, input, transaction, selection: orchestrationSelection })
            : await this._turnLanes(handle, base, input, transaction);
        const lanePlan = { budgetContext: { snapshot: base, anchor: { branchId: base.revision.branchId, revisionId: base.revision.revisionId } }, memoryEvidence: normalizeHostMemoryEvidence(input.hostMemoryEvidence, base), transaction, evidenceCapture,
            ...(controlledReview ? { effectPolicy: 'no-background-model', controlledTurn: { check: async () => this._assertControlledTurn(handle, await this.sessionCore.observe(handle, input.sessionId), controlledReview) } } : {}) };
        turnProducerLanes.set(lanePlan, { host: this, handle, sessionId: base.session.sessionId, invocationId: input.invocationId, requestHash,
            anchor: { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, selection: orchestrationSelection });
        const resources = (await Promise.all(lanes.map(lane => this.executionResources(handle, lane, input.sessionId, lanePlan)))).flat();
        let expectedRevisionId = input.revisionId;
        const operation = nativeTaskScheduler.submit({ owner: handle, kind: 'turn',
            timeoutMs: executionTimeout(lanePlan, base.manifest.runtime.experienceContract.generationBudget?.turnAttempts
                ?? Math.max(1, lanes.length) * (1 + Math.max(0, ...Object.values(lanePlan.routes).map(route => route.policy.maxFallbackAttempts)))),
            anchor: { sessionId: input.sessionId, branchId: base.revision.branchId, revisionId: input.revisionId },
            executionClass: 'turn_blocking', resources, key: input.sessionId + ':' + input.invocationId + ':turn', fingerprint: controlledReview ? hashNativeDocument({ requestHash, controlledReview }) : requestHash, retry: false, signal, onChunk,
            fresh: async () => {
                if (controlledReview) await lanePlan.controlledTurn.check();
                return (await this.sessionCore[controlledReview ? 'observe' : 'load'](handle, input.sessionId)).revision.revisionId === expectedRevisionId;
            },
            run: boundary => {
                const producer = turnProducerLanes.get(lanePlan);
                if (producer.selection) producer.permit = captureNativeTurnPermit({ ...producer, boundary, resources });
                return this.prepareTurn(handle, input, boundary.signal, boundary.onChunk, revisionId => { expectedRevisionId = revisionId; }, lanePlan);
            },
            finalize: (prepared, _receipt, finalizationBoundary) => orchestrationSelection
                ? this.turnOrchestration.finalizeNarrator({ host: this, handle, prepared, requestHash, expectedRevisionId, finalizationBoundary })
                : this.sessionCore.finalizeTurn(handle, input.sessionId, { ...prepared, requestHash }, { expectedRevisionId,
                    ...(controlledReview ? { effectPolicy: 'no-background-model' } : {}) }),
        });
        evidenceCapture?.append({ type: 'operation.queued', eventId: operation.operationId + '/queued', effectId: operation.operationId, status: 'queued' });
        try { onChunk?.({ operationId: operation.operationId, status: 'queued', provisional: true }); } catch { /* Observer only. */ }
        const result = await operation.result;
        if (authority) this.authoritySelections.delete(handle + ':' + base.session.sessionId + ':' + base.revision.branchId + ':' + base.revision.revisionId);
        if (!controlledReview) this.queueSimulation(handle, result, input.slotBindings);
        return result;
    }

    // Only after foreground finalization. The durable outbox survives a Host
    // exit; this callback is not a saved Promise or a second scheduling authority.
    queueSimulation(handle, snapshot, slotBindings) {
        if (!snapshot.manifest.runtime?.experienceContract?.simulationRuntime
            || !snapshot.states.atri_lifecycle?.outbox.some(item => item.simulation && item.status === 'pending')) return;
        setImmediate(() => {
            void this.executeLifecycle(handle, { sessionId: snapshot.session.sessionId,
                revisionId: snapshot.revision.revisionId, slotBindings }).catch(() => {
                // Existing Task operation diagnostics retain provider failures.
                // Pending intent stays authoritative; no speculative fallback or retry loop.
            });
        }).unref();
    }

    async prepareAuthoritySelection(handle, base, input, lanePlan, signal) {
        if (base.manifest.runtime.experienceContract.lifecycleRuntime && !base.states.atri_lifecycle?.ready) fail('native_authority_ready_required');
        const installed = await this.sessionCore._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        // For the bound resolver the original catalog and Observation belong
        // inside the admitted ContextPort compile, not in this preflight.
        let catalog;
        const originalCatalog = async () => catalog ??= await authorityCatalog(base, installed);
        const typed = lanePlan.transaction;
        let player = null;
        if (typed) {
            await originalCatalog();
            const selection = authoritySelection(catalog, typed);
            player = authorityPlayerEntry(this.sessionCore, base, selection, catalog);
        } else if (base.timeline.at(-1)?.role !== 'user'
            || (input.userInput !== undefined && input.userInput !== base.timeline.at(-1).content)) fail('native_authority_player_anchor_required');
        const key = handle + ':' + base.session.sessionId + ':' + base.revision.branchId + ':' + base.revision.revisionId;
        const fingerprint = hashNativeDocument({ player: player?.entry.messageId ?? base.timeline.at(-1).messageId,
            typed: typed ?? null, userInput: typed ? null : base.timeline.at(-1).content });
        const persistent = base.manifest.runtime.experienceContract.generationBudget;
        const anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId };
        const retained = persistent ? await this.sessionCore.runs.selection(handle, base.session.sessionId, anchor, fingerprint) : null;
        let pinned = this.authoritySelections.get(key);
        if (pinned && pinned.fingerprint !== fingerprint) fail('native_authority_input_conflict');
        if (!pinned) {
            // Never evict an unresolved pin to allow a silent re-resolution.
            if (this.authoritySelections.size >= 128) fail('native_authority_retry_retention_limit');
            const selecting = async () => {
                if (retained) return authoritySelection(await originalCatalog(), retained);
                if (typed) return authoritySelection(await originalCatalog(), typed);
                // Branch Retry of a typed action retains its fixed authored input.
                const replay = base.timeline.at(-1).metadata?.atri_authority_retry;
                if (replay) {
                    const origin = await this.sessionCore.load(handle, base.session.sessionId, { revisionId: replay.revisionId });
                    const receipt = origin.states.atri_action_receipts?.receipts.find(item => item.source === 'frontend' && item.playerMessageId === replay.playerMessageId);
                    const player = origin.timeline.find(item => item.messageId === replay.playerMessageId);
                    if (!receipt || !player?.metadata?.atri_authority_input) fail('native_authority_retry_invalid');
                    return authoritySelection(await originalCatalog(), player.metadata.atri_authority_input);
                }
                const producer = turnProducerLanes.get(lanePlan);
                if (producer?.selection) {
                    if (producer.host !== this || producer.handle !== handle || producer.sessionId !== input.sessionId
                        || producer.invocationId !== input.invocationId || lanePlan.controlledTurn) fail('native_orchestration_turn_producer_unavailable');
                    const request = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
                        role: 'intent_resolver', requestId: input.invocationId + ':intent' };
                    const resolverCapture = captureNativeAuthorityResolver({ host: this, handle, base, producer });
                    const quotaProof = mintNativeResolverQuota({ host: this, handle, request, snapshot: base, ...producer });
                    return this.turnOrchestration.executeResolver({ host: this, handle, base, input, lanePlan, request, quotaProof,
                        selection: producer.selection, signal, resolverCapture });
                }
                await originalCatalog();
                const request = resolverRequest(catalog, buildAuthorityObservation(base), base.timeline.at(-1).content);
                const result = await this.execute(handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
                    role: 'intent_resolver', requestId: input.invocationId + ':intent', tools: request.tools }, signal, undefined,
                { scheduled: true, lanePlan: { ...lanePlan, authorityContext: { mode: 'resolver', snapshot: base, payload: request.payload } } });
                try { return request.select(result.response); } catch { throw authorityFailure('native_authority_selection_invalid'); }
            };
            pinned = { fingerprint, selection: selecting() };
            this.authoritySelections.set(key, pinned);
            pinned.selection.catch(() => { if (this.authoritySelections.get(key) === pinned) this.authoritySelections.delete(key); });
        }
        const selection = await pinned.selection;
        if (persistent) {
            await this.sessionCore.runs.selection(handle, base.session.sessionId, anchor, fingerprint, selection);
            if (this.authoritySelections.get(key) === pinned) this.authoritySelections.delete(key);
        }
        checkCancellation(signal);
        try {
            return await this.sessionCore.prepareAuthorityTurn(handle, base, selection, player, { signal });
        } catch (error) {
            // A rejected candidate has never reached narration or publication.
            // Release only this preparation pin; uncertain provider/finalization
            // failures still retain their original selection for exact retry.
            if (error?.code === 'AUTHORITY_PREPARATION_FAILED' && this.authoritySelections.get(key) === pinned) this.authoritySelections.delete(key);
            throw error;
        }
    }

    async prepareTurn(handle, input, signal, onChunk, onAnchor, lanePlan) {
        let base = await this.sessionCore[lanePlan?.controlledTurn ? 'observe' : 'load'](handle, input.sessionId);
        const committedBase = base;
        await lanePlan?.controlledTurn?.check();
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const runtime = base.manifest.runtime.experienceContract.taskRuntime;
        let authorityTurn = null;
        if (hasAuthorityTransactions(base)) {
            authorityTurn = await this.prepareAuthoritySelection(handle, base, input, lanePlan, signal);
            authorityTurnProof(this.sessionCore, handle, committedBase, authorityTurn.proof);
            base = authorityTurn.prepared.candidate;
            const producer = turnProducerLanes.get(lanePlan);
            lanePlan = { ...lanePlan, authorityContext: { snapshot: base, receipt: authorityTurn.prepared.receipt, mode: 'narrator' } };
            if (producer) turnProducerLanes.set(lanePlan, producer);
        }
        const stages = [];
        const provenance = [];
        const invoke = async (id, payload, suffix, preparationSignal = signal) => {
            const task = runtime.tasks.find(item => item.id === id);
            const result = await this.executeTask(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
                taskId: id, variantId: input.variants?.[id] ?? task.variants[0].id, input: payload,
                slotBindings: input.slotBindings, invocationId: input.invocationId + ':' + suffix }, preparationSignal, undefined, { transient: true, scheduled: true, lanePlan });
            const { payload: _payload, execution: _execution, ...evidence } = result.record;
            return { ...result, turnProvenance: evidence };
        };
        // Each transient turn_context stage has explicit stageInputs, reads the
        // same pinned state, and cannot consume or publish another stage output.
        const preparedStages = await prepareIndependent(runtime.turn.stages,
            (id, index, preparationSignal) => invoke(id, input.stageInputs?.[id] ?? {}, 'stage' + index, preparationSignal), { signal });
        for (const stage of preparedStages) { stages.push(stage.record.payload); provenance.push(stage.turnProvenance); }
        checkCancellation(signal);
        let draft, knowledgeProof, nativeNarration;
        if (runtime.turn.narratorTaskId) {
            const result = await invoke(runtime.turn.narratorTaskId, { stages }, 'narrator');
            provenance.push(result.turnProvenance);
            knowledgeProof = result.knowledgeProof;
            draft = typeof result.record.payload === 'string'
                ? { schemaVersion: 1, narrative: result.record.payload, outcomes: [], diagnostics: [] } : result.record.payload;
            draft = assertTurnEnvelope(draft);
            if (draft.outcomes.length) fail('native_narrator_outcome_denied');
            try { onChunk?.({ text: draft.narrative, delta: draft.narrative, provisional: true }); } catch { /* Observer only. */ }
        } else {
            const request = { sessionId: input.sessionId, revisionId: input.revisionId,
                requestId: input.invocationId, role: 'narrator', ...(input.routeRef === undefined ? {} : { routeRef: input.routeRef }),
                messages: stages.length ? [{ role: 'user', content: JSON.stringify({ provisionalTurnContext: authorityTurn ? authorityValue(stages) : stages }) }] : [] };
            const producer = turnProducerLanes.get(lanePlan);
            let narration;
            if (producer?.selection) {
                if (producer.host !== this || producer.handle !== handle || producer.sessionId !== input.sessionId
                    || producer.invocationId !== input.invocationId || runtime.turn.stages.length
                    || runtime.turn.interpreterTaskId || runtime.turn.narratorTaskId || lanePlan.controlledTurn
                    || (!authorityTurn && (base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic))) fail('native_orchestration_turn_producer_unavailable');
                const quotaProof = mintNativeNarratorQuota({ host: this, handle, request, snapshot: committedBase, ...producer });
                narration = await this.turnOrchestration.executeNarrator({ host: this, handle, base: committedBase, input, lanePlan, request, quotaProof,
                    authorityTurn: authorityTurn ? { base: committedBase, proof: authorityTurn.proof } : null,
                    selection: producer.selection, signal, onChunk });
                if (!narration) fail('native_orchestration_turn_producer_unavailable');
                nativeNarration = narration;
            } else narration = await this.execute(handle, request, signal, onChunk, { scheduled: true, lanePlan });
            provenance.push({ taskId: 'narrator', requestSnapshotHash: hashNativeDocument(narration.snapshot),
                deliveryReceipt: { kind: 'model_delivery', invocationId: input.invocationId, delivered: true } });
            knowledgeProof = prepareKnowledgeAdoption(this.sessionCore, handle, base, narration.snapshot.contextPlan?.nativeSelection);
            draft = { schemaVersion: 1, narrative: narration.response.text, outcomes: [], diagnostics: [] };
        }
        const processing = base.manifest.runtime.experienceContract.processingRuntime;
        if (processing?.processors.some(item => item.stage === 'output')) {
            const installed = await this.sessionCore._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
            const processed = await processPackageText(installed, processing, 'output', draft.narrative, input.invocationId, { signal });
            // Existing authored projection is tied to the original canonical body.
            // Reject incompatible output instead of silently discarding its Blocks.
            draft = assertTurnEnvelope({ ...draft, narrative: processed.text });
            provenance.push({ processing: processed.evidence });
        }
        const narrative = draft.narrative;
        if (typeof narrative !== 'string' || !narrative.trim()) fail('native_turn_empty_narrative');
        const outcomes = [];
        if (runtime.turn.policy === 'narrative-outcome') {
            const task = runtime.tasks.find(item => item.id === runtime.turn.interpreterTaskId);
            const interpreted = await invoke(task.id, { narrative, stages }, 'interpreter');
            provenance.push(interpreted.turnProvenance);
            outcomes.push({ requestId: task.interpretation.id, interpretation: interpreted.record.payload });
        }
        checkCancellation(signal);
        const prepared = { invocationId: input.invocationId, provenance, knowledgeProof, envelope: { ...draft, outcomes }, ...(authorityTurn ? { authorityProof: authorityTurn.proof } : {}) };
        if (nativeNarration) this.turnOrchestration.bindNarratorOutput({ host: this, handle, narration: nativeNarration, prepared });
        return prepared;
    }

    async preflightTurnRoutes(handle, opened, snapshot) {
        const checks = [];
        const exact = opened.sourceFiles ? opened : snapshot ? await this.packageInstaller.open(handle, snapshot.session.packageId, snapshot.session.packageVersionId) : opened;
        for (const role of requiredTurnRoles(opened.manifest, snapshot?.entryPoint, exact?.sourceFiles)) {
            let error = null;
            try {
                await this.execute(handle, { role, requestId: 'preflight:turn:' + role,
                    ...(snapshot ? { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId } : {}),
                    ...(role === 'intent_resolver' ? { tools: [{ type: 'function', function: {
                        name: 'atri_route_preflight', parameters: { type: 'object', properties: {} },
                    } }] } : {}) }, undefined, undefined,
                { scheduled: true, preflight: true, preflightPackage: opened, preflightSnapshot: snapshot });
            } catch (cause) { error = cause.code || 'native_task_binding_route_invalid'; }
            checks.push({ role, requiredCapabilities: role === 'intent_resolver' ? ['generation.tools'] : [], error });
        }
        return checks;
    }

    // Read-only, exact installed Package preflight. Never stores player bindings or
    // creates a Session; capability resolution is the same path as lifecycle prepare.
    async preflightTaskBindings(handle, input) {
        if (!input || !isNativeId(input.packageId, 'package') || !isNativeId(input.packageVersionId, 'packageVersion')
            || Object.keys(input).some(key => !['packageId', 'packageVersionId', 'slotBindings'].includes(key))
            || (input.slotBindings !== undefined && (!input.slotBindings || typeof input.slotBindings !== 'object' || Array.isArray(input.slotBindings)))) fail('native_task_binding_request_invalid');
        const opened = await this.packageInstaller.open(handle, input.packageId, input.packageVersionId);
        if (!opened) fail('native_task_binding_package_missing');
        const contract = opened.manifest.runtime?.experienceContract;
        const tasks = contract?.taskRuntime?.tasks ?? [];
        const turnRoutes = await this.preflightTurnRoutes(handle, opened);
        const selected = startupTaskVariants(contract);
        const routes = tasks.length ? (await this.persistence.listRuntimeRoutes(handle)).filter(route => route.scope === 'player') : [];
        const slots = [];
        for (const id of new Set(tasks.map(task => task.bindingSlotId))) {
            const slot = contract.taskRuntime.slots.find(item => item.id === id);
            const uses = tasks.filter(task => task.bindingSlotId === id);
            const choices = [];
            for (const route of routes) {
                let error = null;
                let effective;
                try {
                    for (const task of uses) for (const variantId of selected.get(task.id)) {
                        const variant = task.variants.find(item => item.id === variantId);
                        effective = await this.execute(handle, { requestId: 'preflight:' + task.id, role: route.role.replace(/^role\./, ''),
                            routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId },
                            outputContract: { name: 'atria_task', schema: variant.outputSchema } }, undefined, undefined,
                        { taskPlan: { task, variant, slot, payload: null }, scheduled: true, preflight: true, preflightPackage: opened });
                    }
                } catch (cause) { error = cause.code || 'native_task_binding_route_invalid'; }
                choices.push({ runtimeRouteId: route.runtimeRouteId, displayName: route.displayName, compatible: !error, error,
                    ...(effective ? { modelName: effective.model.remoteModelId, outputTokens: effective.generation.output?.maxTokens ?? effective.model.limits.outputTokens,
                        reasoning: effective.generation.reasoning ?? null } : {}) });
            }
            const binding = input.slotBindings?.[id];
            const validRef = binding?.scope === 'player' && isNativeId(binding.runtimeRouteId, 'runtimeRoute')
                && Object.keys(binding).every(key => ['scope', 'runtimeRouteId'].includes(key));
            const choice = validRef && choices.find(route => route.runtimeRouteId === binding.runtimeRouteId);
            slots.push({ id, tasks: uses.map(task => task.id), requiredCapabilities: slot.requiredCapabilities,
                routes: choices, binding: choice?.compatible ? binding : null,
                error: choice?.compatible ? null : choice?.error || 'native_task_binding_missing' });
        }
        return { packageId: opened.manifest.packageId, packageVersionId: opened.manifest.packageVersionId,
            ready: slots.every(slot => !slot.error) && turnRoutes.every(route => !route.error), slots, turnRoutes };
    }

    async preparePlay(handle, input) {
        if (Object.keys(input).some(key => !['sessionId', 'revisionId', 'slotBindings'].includes(key))) fail('native_play_prepare_invalid');
        const base = await this.sessionCore.load(handle, input.sessionId);
        await this.sessionCore.runs.assert(handle, input.sessionId, 'generate');
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        await this.prepareLifecycle(handle, input);
        const turn = base.manifest.runtime?.experienceContract?.taskRuntime?.turn;
        const prepared = [];
        const installed = turn ? await this.packageInstaller.open(handle, base.session.packageId, base.session.packageVersionId) : null;
        for (const role of turn ? requiredTurnRoles(base.manifest, base.entryPoint, installed?.sourceFiles) : ['narrator']) prepared.push(await this.execute(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
            requestId: 'preflight:play:' + role, role }, undefined, undefined,
        { scheduled: true, preflight: true, preflightPackage: { manifest: base.manifest }, preflightSnapshot: base }));
        const routes = await this.persistence.listRuntimeRoutes(handle);
        const taskIds = turn ? [...turn.stages, turn.narratorTaskId, turn.interpreterTaskId].filter(Boolean) : [];
        for (const taskId of taskIds) {
            const task = base.manifest.runtime.experienceContract.taskRuntime.tasks.find(item => item.id === taskId);
            const route = routes.find(item => item.runtimeRouteId === input.slotBindings?.[task.bindingSlotId]?.runtimeRouteId);
            if (!route) fail('native_task_binding_missing');
            prepared.push({ connection: await this.persistence.getConnectionProfile(handle, route.connectionProfileRef.connectionProfileId) });
        }
        // Read local configuration/Secrets only; no provider network request.
        for (const resolved of prepared) {
            if (resolved.model) this.providers[resolved.connection.providerAdapter]?.contextTokenizer?.(resolved);
            if (!await this.secretPort.resolveSecret(resolved.connection.secretRef, { handle, connection: resolved.connection })) fail('generation_secret_unavailable');
        }
        if ((await this.sessionCore.load(handle, input.sessionId)).revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        return { sessionId: input.sessionId, revisionId: input.revisionId, branchId: base.revision.branchId, prepared: true };
    }

    async prepareLifecycle(handle, input) {
        if (Object.keys(input).some(key => !['sessionId', 'revisionId', 'slotBindings'].includes(key))) fail('native_lifecycle_request_invalid');
        const base = await this.sessionCore.load(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const turnRoutes = await this.preflightTurnRoutes(handle, { manifest: base.manifest }, base);
        const blocked = turnRoutes.find(route => route.error);
        if (blocked) fail(blocked.error);
        const contract = base.manifest.runtime?.experienceContract;
        const tasks = contract?.taskRuntime?.tasks ?? [];
        const selected = startupTaskVariants(contract);
        const bindings = [];
        for (const task of tasks) {
            const routeRef = input.slotBindings?.[task.bindingSlotId];
            if (routeRef?.scope !== 'player') fail('native_task_binding_missing');
            const route = await this.persistence.getRuntimeRoute(handle, routeRef.runtimeRouteId);
            if (!route) fail('native_task_binding_missing');
            const slot = contract.taskRuntime.slots.find(item => item.id === task.bindingSlotId);
            for (const id of selected.get(task.id)) {
                const variant = task.variants.find(item => item.id === id);
                await this.execute(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
                    requestId: 'preflight:' + task.id, role: route.role.replace(/^role\./, ''), routeRef,
                    outputContract: { name: 'atria_task', schema: variant.outputSchema } }, undefined, undefined,
                { taskPlan: { task, variant, slot, payload: null }, scheduled: true, preflight: true,
                    preflightPackage: { manifest: base.manifest }, preflightSnapshot: base });
                bindings.push({ taskId: task.id, variantId: variant.id, bindingSlotId: slot.id });
            }
        }
        // All checks used one exact authority snapshot. A concurrent Session edit
        // must still fail the barrier, never make stale readiness look current.
        if ((tasks.length || turnRoutes.length) && (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        return { revisionId: input.revisionId, bindings };
    }

    // Durable intent is revision-backed; the existing Task scheduler owns actual
    // execution. A Host restart resumes pending intents, never a saved Promise.
    async executeLifecycle(handle, input, signal) {
        if (Object.keys(input).some(key => !['sessionId', 'revisionId', 'slotBindings'].includes(key))) fail('native_lifecycle_request_invalid');
        let snapshot = await this.sessionCore.load(handle, input.sessionId);
        if (snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        if (!snapshot.states.atri_lifecycle?.ready) fail('native_lifecycle_not_ready');
        const results = [];
        for (let count = 0; count < 4; count++) {
            checkCancellation(signal);
            const item = snapshot.states.atri_lifecycle.outbox.find(item => item.status === 'pending'
                && snapshot.states.atri_lifecycle.scopes[item.scopeId]?.status === 'active'
                && snapshot.states.atri_lifecycle.scopes[item.scopeId].epoch === item.scopeEpoch);
            if (!item) break;
            if (item.simulation) {
                const { simulationTaskCurrent } = await import('../simulation-authority.js');
                const { createAuthorityPublicationBudget } = await import('../authority-transaction.js');
                const installed = await this.sessionCore._openPackage(handle, snapshot.session.packageId, snapshot.session.packageVersionId, snapshot.session.entryPointId);
                const budget = await createAuthorityPublicationBudget(snapshot, installed);
                if (!simulationTaskCurrent(snapshot, item, budget)) {
                    snapshot = await this.sessionCore.applyLifecycleCommand(handle, input.sessionId,
                        { type: 'lifecycle', invocationId: 'stale-' + item.invocationId, action: { kind: 'scheduled.cancel', invocationId: item.invocationId } },
                        { expectedRevisionId: snapshot.revision.revisionId, hostProof: this.sessionCore._lifecycleProof });
                    continue;
                }
            }
            let result;
            try {
                result = await this.executeTask(handle, { sessionId: input.sessionId, revisionId: snapshot.revision.revisionId,
                    invocationId: item.invocationId, taskId: item.taskId, variantId: item.variantId, input: item.input, slotBindings: input.slotBindings }, signal, undefined, { lifecycleInvocation: true });
            } catch (error) {
                const task = snapshot.manifest.runtime.experienceContract.taskRuntime.tasks.find(task => task.id === item.taskId);
                const variant = task?.variants.find(variant => variant.id === item.variantId);
                const ordinary = task && variant && ordinaryBackgroundIntent(snapshot, item, task, variant, item.input);
                if ((!ordinary && !variant?.resultBinding) || !['native_generation_budget_exhausted', 'native_generation_background_not_due'].includes(error.code)) throw error;
                return { snapshot, results, pending: { invocationId: item.invocationId, reason: error.code } };
            }
            snapshot = result.snapshot;
            if (result.pending) return { snapshot, results, pending: result.pending };
            results.push(result.record);
        }
        return { snapshot, results };
    }

    async executeTask(handle, input, signal, onChunk, { transient = false, scheduled = false, lanePlan = null, lifecycleInvocation = false } = {}) {
        const options = { transient, scheduled, lanePlan, lifecycleInvocation };
        const engine = this.persistence._engine;
        if (!engine || transient || scheduled || lanePlan?.evidenceCapture) return this._executeTask(handle, input, signal, onChunk, options);
        const identity = hashNativeDocument({ handle, kind: 'task', input, lifecycleInvocation });
        this.evidenceOperations ??= new Map();
        if (this.evidenceOperations.has(identity)) return this.evidenceOperations.get(identity);
        const pending = Promise.resolve().then(() => this._captureTask(handle, input, signal, onChunk, options));
        this.evidenceOperations.set(identity, pending);
        try { return await pending; } finally { this.evidenceOperations.delete(identity); }
    }

    async _captureTask(handle, input, signal, onChunk, options) {
        const engine = this.persistence._engine;
        const base = await this.sessionCore.load(handle, input.sessionId);
        if (base.states.atri_task_results?.records.some(item => item.invocationId === input.invocationId)) return this._executeTask(handle, input, signal, onChunk, options);
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(input.invocationId)) fail('native_task_invocation_required');
        const executionClass = base.manifest.runtime?.experienceContract?.taskRuntime?.tasks.find(task => task.id === input.taskId)?.executionClass;
        const parentInvocationId = base.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId)?.cause?.invocationId ?? null;
        const capture = await beginHostCapture(new AgentEvidenceRepository({ engine }), handle,
            { domain: 'rp_session', sessionId: input.sessionId }, 'task:' + input.invocationId + ':' + randomUUID(), input.invocationId,
            ['background', 'maintenance'].includes(executionClass) ? executionClass : 'foreground', parentInvocationId);
        let result;
        try { result = await this._executeTask(handle, input, signal, onChunk, { ...options, evidenceCapture: capture }); } catch (error) {
            await capture?.fail(signal?.aborted || error.code === 'operation_cancelled'); throw error;
        }
        let evidenceCapture;
        try { evidenceCapture = await capture?.finishTask(result); } catch { evidenceCapture = { status: 'failed', missing: 1 }; }
        return { ...result, evidenceCapture: evidenceCapture ?? { status: 'failed', missing: 1 } };
    }

    async _executeTask(handle, input, signal, onChunk, { transient = false, scheduled = false, lanePlan = null, lifecycleInvocation = false, evidenceCapture = null } = {}) {
        input = immutable(input);
        if (input.invocationId?.startsWith('lc:') && !lifecycleInvocation) fail('native_task_reserved_invocation');
        if (Object.keys(input).some(key => !['sessionId', 'revisionId', 'taskId', 'variantId', 'input', 'slotBindings', 'invocationId', 'requestId', 'fallbackMode'].includes(key))) fail('native_task_request_invalid');
        const snapshot = lanePlan?.authorityContext?.snapshot ?? await this.sessionCore[lanePlan?.effectPolicy === 'no-background-model' ? 'observe' : 'load'](handle, input.sessionId);
        const task = snapshot.manifest.runtime?.experienceContract?.taskRuntime?.tasks.find(item => item.id === input.taskId);
        const variant = task?.variants.find(item => item.id === input.variantId);
        if (!variant) fail('native_task_variant_missing');
        if (task.resultPolicy.sink === 'app_command' && (!lifecycleInvocation || transient || scheduled)) fail('native_task_lifecycle_intent_required');
        const payload = assertTaskValue(input.input, task.inputSchema);
        const routeRef = input.slotBindings?.[task.bindingSlotId];
        if (!routeRef || routeRef.scope !== 'player') fail('native_task_binding_missing');
        const route = lanePlan ? lanePlan.routes[routeRef.runtimeRouteId] : await this.persistence.getRuntimeRoute(handle, routeRef.runtimeRouteId);
        if (!route) fail('native_task_binding_missing');
        const slot = snapshot.manifest.runtime.experienceContract.taskRuntime.slots.find(item => item.id === task.bindingSlotId);
        const taskPlan = { task, variant, slot, payload };
        const appraisal = variant.resultBinding?.kind === 'cognition.appraise';
        const declared = Boolean(variant.resultBinding);
        const production = captureTaskProduction(snapshot, task, payload);
        const anchor = { sessionId: input.sessionId, branchId: snapshot.revision.branchId, revisionId: input.revisionId };
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(input.invocationId)) fail('native_task_invocation_required');
        const fingerprint = hashNativeDocument({ task, variant, payload, anchor, routeRef, fallbackMode: input.fallbackMode ?? 'disabled' });
        taskPlan.executionFingerprint = fingerprint;
        const existing = snapshot.states.atri_task_results?.records.find(item => item.invocationId === input.invocationId)
            ?? snapshot.states.atri_lifecycle?.taskTombstones.find(item => item.invocationId === input.invocationId);
        if (existing) {
            if (existing.fingerprint !== fingerprint) fail('native_task_invocation_conflict');
            return { record: existing, snapshot };
        }
        if (snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        if (task.resultPolicy.sink === 'app_command') {
            const lifecycle = snapshot.states.atri_lifecycle;
            const intent = lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
            if (!lifecycle?.ready || !intent || intent.status !== 'pending' || intent.taskId !== task.id || intent.variantId !== variant.id
                || lifecycle.scopes[intent.scopeId]?.status !== 'active' || lifecycle.scopes[intent.scopeId].epoch !== intent.scopeEpoch
                || !equalNativeDocuments(intent.input, payload)) fail('native_task_lifecycle_intent_required');
            if (variant.resultBinding?.subjectPerspective) {
                if (!intent.simulation?.subject || !this.turnOrchestration || !snapshot.manifest.runtime.experienceContract.generationBudget) fail('native_task_subject_context_unavailable');
                taskPlan.intent = intent;
            }
        }
        const captured = lanePlan ?? {};
        let ordinaryLifecycle = false;
        if (evidenceCapture) captured.evidenceCapture = evidenceCapture;
        if (lifecycleInvocation && snapshot.manifest.runtime.experienceContract.generationBudget) {
            const intent = snapshot.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
            const ordinary = ordinaryBackgroundIntent(snapshot, intent, task, variant, payload);
            ordinaryLifecycle = ordinary;
            if ((!intent?.simulation && !(appraisal && intent?.appraisalEvent) && !ordinary) || intent.status !== 'pending' || intent.taskId !== task.id || intent.variantId !== variant.id
                || !equalNativeDocuments(intent.input, payload)) fail('native_generation_budget_lane_denied');
            captured.budgetContext = { snapshot, background: true, anchor: { invocationId: intent.invocationId } };
            if (ordinary || declared && this.turnOrchestration) {
                const control = await this.sessionCore.runs.status(handle, input.sessionId);
                const operation = control?.operations[hashNativeDocument({ lane: 'background', anchor: { invocationId: intent.invocationId } })];
                // Pending outbox alone is not permission to replay a send after
                // interruption or failed adoption. Keep the original bank and
                // require explicit Task control/rescheduling for uncertain work.
                if (operation?.total > 0 || operation?.compute?.attempts.length) return { snapshot,
                    pending: { invocationId: intent.invocationId, reason: 'native_task_outcome_unknown' } };
            }
        }
        const appraisalWork = async (kind, value, operation) => {
            const scoped = await this.turnOrchestration?.runBackgroundTaskWork?.({ host: this, handle, lanePlan: captured, kind, value, operation });
            if (scoped?.handled) return scoped.value;
            const context = captured.budgetContext;
            const attempt = { attemptId: randomUUID(), requestId: input.invocationId, kind, estimatedItems: 1,
                estimatedInputBytes: Buffer.byteLength(JSON.stringify(value)), targetFingerprint: hashNativeDocument({ task, variant, anchor, kind }) };
            const receipt = await this.sessionCore.runs.chargeLocalWork(handle, context?.snapshot ?? snapshot,
                context?.anchor ?? { branchId: snapshot.revision.branchId, revisionId: input.revisionId }, route.executionPolicy?.computeBudget, attempt,
                { background: context?.background === true });
            const start = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
            try {
                checkCancellation(signal);
                if ((await this.sessionCore[lanePlan?.effectPolicy === 'no-background-model' ? 'observe' : 'load'](handle, input.sessionId)).revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
                const result = await operation(); outcome = 'completed'; return result;
            } finally {
                if (receipt) {
                    const used = process.cpuUsage(cpu);
                    await this.sessionCore.runs.settleLocalWork(handle, input.sessionId, receipt.operation, attempt.attemptId,
                        { wallMs: performance.now() - start, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome });
                }
            }
        };
        if (appraisal) {
            if (!snapshot.manifest.runtime.experienceContract.generationBudget || !route.executionPolicy?.computeBudget?.localWork) {
                return { snapshot, pending: { invocationId: input.invocationId, reason: 'appraisal_budget_unavailable' } };
            }
            const queued = snapshot.states.atri_lifecycle.outbox.find(item => item.invocationId === input.invocationId);
            const check = await appraisalWork('appraisal_gate', { snapshot, task, variant, queued }, () => appraisalEventCurrent(snapshot, queued, task, variant));
            if (check.status === 'pending') return { snapshot, pending: { invocationId: input.invocationId, reason: check.reason } };
            if (check.status === 'skip') {
                const skipped = await this.sessionCore.applyLifecycleCommand(handle, input.sessionId,
                    { type: 'lifecycle', invocationId: 'skip-' + input.invocationId, action: { kind: 'scheduled.cancel', invocationId: input.invocationId } },
                    { expectedRevisionId: snapshot.revision.revisionId, hostProof: this.sessionCore._lifecycleProof });
                return { snapshot: skipped, record: { invocationId: input.invocationId, taskId: task.id, variantId: variant.id, status: 'skipped', reason: check.reason } };
            }
        }
        const resources = lanePlan ? [] : await this.executionResources(handle, route, input.sessionId, captured);
        let taskWorker;
        const work = { owner: handle, anchor, kind: ['background', 'maintenance'].includes(task.executionClass) ? 'auxiliary_task' : 'model_task', executionClass: task.executionClass,
            retry: !(ordinaryLifecycle || declared && this.turnOrchestration),
            timeoutMs: executionTimeout(captured, captured.budgetContext?.background ? snapshot.manifest.runtime.experienceContract.generationBudget.backgroundAttempts : undefined),
            resources,
            key: input.sessionId + ':' + (task.queuePolicy === 'latest' ? anchor.branchId + ':' + task.id + ':' + variant.id : input.invocationId),
            supersede: task.queuePolicy === 'latest', fingerprint, signal, onChunk,
            fresh: async () => (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId === input.revisionId,
            run: boundary => {
                taskWorker = this.execute(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
                    requestId: input.invocationId, role: route.role.replace(/^role\./, ''), routeRef,
                    fallbackMode: input.fallbackMode ?? 'disabled',
                    outputContract: { name: 'atria_task', schema: variant.outputSchema } }, boundary.signal, boundary.onChunk, { taskPlan, scheduled: true, lanePlan: captured });
                return taskWorker;
            },
            finalize: async (result, deliveryReceipt) => {
                const parse = () => normalizeTaskGenerationResult(result.response, variant.outputSchema);
                const taskWork = async (phase, value, operation) => {
                    if (appraisal) return appraisalWork('appraisal_' + phase, value, operation);
                    const scoped = await this.turnOrchestration?.runBackgroundTaskWork?.({ host: this, handle, lanePlan: captured,
                        kind: 'task_result_' + phase, value, operation });
                    return scoped?.handled ? scoped.value : operation();
                };
                const payload = await taskWork('parse', result.response, parse);
                const record = { ...(production ? { production } : {}), invocationId: input.invocationId, taskId: task.id, variantId: variant.id, fingerprint, payload,
                    definitionHash: hashNativeDocument(task), contextHash: hashNativeDocument(result.snapshot.contextPlan),
                    requestSnapshotHash: hashNativeDocument(result.snapshot), rawResultHash: hashNativeDocument(result.response),
                    execution: result.snapshot.diagnostics?.effectiveConfig ?? null,
                    normalizedResultHash: hashNativeDocument(payload), promptProgramRef: result.snapshot.promptProgramRef,
                    generationProfileRef: result.snapshot.generationProfileRef, runtimeRouteId: result.snapshot.runtimeRouteId, deliveryReceipt };
                const knowledgeProof = prepareKnowledgeAdoption(this.sessionCore, handle, snapshot, result.snapshot.contextPlan?.nativeSelection);
                if (task.resultPolicy.sink === 'turn' || transient) return { record: immutable(record), knowledgeProof };
                const adopt = () => this.sessionCore.recordTaskResult(handle, input.sessionId, record, { expectedRevisionId: input.revisionId, knowledgeProof, requestSnapshot: result.snapshot,
                    appraisalProof: appraisal ? prepareAppraisalDelivery(this.sessionCore, handle, snapshot, task, variant, record, result.snapshot) : null });
                const committed = await taskWork('adopt', { record, snapshot }, adopt);
                return immutable({ record: committed.states.atri_task_results.records.at(-1), snapshot: committed });
            } };
        if (scheduled) {
            if (!transient) throw new TypeError('Only parent Turn may execute an inline Task');
            const result = await work.run({ signal, onChunk });
            checkCancellation(signal);
            return work.finalize(result, { kind: 'model_delivery', invocationId: input.invocationId, delivered: true });
        }
        const original = (ordinaryLifecycle || declared) && this.turnOrchestration
            ? await this.turnOrchestration.startBackgroundTask(this, handle, { input, snapshot, taskPlan, captured, work }) : null;
        const operation = original ?? nativeTaskScheduler.submit(work);
        evidenceCapture?.append({ type: 'operation.queued', eventId: operation.operationId + '/queued', effectId: operation.operationId, status: 'queued' });
        try { onChunk?.({ operationId: operation.operationId, status: 'queued', provisional: true }); } catch { /* Observer only. */ }
        return operation.result.catch(async error => {
            if (['task', 'adaptive'].includes(route.executionPolicy?.continuity) && taskWorker) await taskWorker.catch(() => {});
            throw error;
        });
    }

    async tryAuthoring(handle, input, signal, onQueued) {
        return tryAuthoringSample(this, handle, input, signal, onQueued);
    }

    async previewDraft(handle, input, signal) {
        return previewPromptDraft(this, handle, input, signal);
    }

    async execute(handle, value, signal, onChunk, { preview = false, draftOverrides = null, programSelection = null, previewContext = null, authoringRun = null, taskPlan = null, scheduled = false, lanePlan = null, illustrationPlan = null, preflight = false, preflightPackage = null, preflightSnapshot = null, effectPolicy = null, retainResult = false, approvedReview = null, orchestrationSend = null } = {}) {
        const sendBank = orchestrationSend?.bank;
        const scopedContext = orchestrationSend?.context;
        const quotaProof = orchestrationSend?.quotaProof;
        if (value.orchestrationSend !== undefined) fail('native_generation_host_readonly');
        if (orchestrationSend && (!sendBank || preview || preflight || taskPlan && scopedContext?.compiled.request.audience.kind !== 'task'
            || illustrationPlan || (lanePlan?.budgetContext && !quotaProof))) fail('native_generation_budget_lane_denied');
        if (quotaProof !== undefined) assertNativeTurnQuota(quotaProof, { host: this, sessionCore: this.sessionCore, handle,
            sessionId: value.sessionId, requestId: value.requestId, role: value.role });
        if (scopedContext && (value.messages?.length || value.prompt)) fail('native_generation_context_denied');
        if (scopedContext && value.tools?.length) {
            if (scopedContext.compiled.request.audience.kind === 'project_task'
                || ContextPort.prototype.isProjectDelegation.call(scopedContext.port, handle, { context: scopedContext.compiled })) scopedContext.port.assertProjectRequest(handle, { context: scopedContext.compiled, request: value });
            else scopedContext.port.assertResolverRequest(handle, { context: scopedContext.compiled, request: value });
        }
        if (sendBank) {
            effectPolicy = 'no-background-model';
            await sendBank.assertCurrent();
        }
        effectPolicy ??= lanePlan?.effectPolicy ?? null;
        const input = immutable(value);
        if (draftOverrides && !preview && !authoringRun) fail('native_generation_preview_only');
        if (['drafts', 'draftOverrides', 'baselineDrafts', 'programSelection', 'promptProgramRef', 'semanticBlocks', 'sourceBinding', 'audience', 'grant', 'authoringRun', 'previewContext'].some(key => Object.hasOwn(input, key))) fail('native_generation_request_authority_denied');
        if (input.previewRefs && !preview && !authoringRun) fail('native_generation_preview_only');
        if (programSelection) {
            if (typeof programSelection.assertCurrent !== 'function' || illustrationPlan || lanePlan?.prediction || draftOverrides || input.previewRefs)
                throw new GenerationError('generation_program_authority_required');
            const ref = assertExactResourceRef(programSelection.promptProgramRef, 'core.prompt-program');
            if (hashNativeDocument(ref) !== hashNativeDocument(programSelection.promptProgramRef)) throw new GenerationError('generation_program_authority_required');
            programSelection = Object.freeze({ promptProgramRef: immutable(ref), assertCurrent: programSelection.assertCurrent });
        }
        const sample = input.sample === undefined ? null : captureAuthoringSample(input.sample);
        if (sample && (input.sessionId || input.projectId || input.taskId || input.messages?.length || input.tools?.length || taskPlan || illustrationPlan || orchestrationSend || !preview && !authoringRun)) fail('native_generation_context_ambiguous');
        if (authoringRun && !sample || previewContext && !preview) fail('native_generation_preview_only');
        if (input.resourceProjectId && !sample) fail('native_generation_context_ambiguous');
        const sampleProject = input.resourceProjectId ? immutable(await this.studio.getProject(handle, input.resourceProjectId)) : null;
        const prediction = predictionLanes.has(lanePlan) ? lanePlan.prediction : null;
        if (lanePlan?.prediction && !prediction) fail('native_prediction_capture_required');
        if (prediction) {
            await assertPredictionCaptureCurrent(prediction.capture);
            if (input.tools?.length || input.messages?.length || input.prompt || illustrationPlan || preflight) fail('native_prediction_context_denied');
        }
        // Compilation is observation: reconciliation can publish/rollback and
        // must remain confined to an explicitly executing invocation.
        if (!preview && !preflight && effectPolicy !== 'no-background-model' && input.projectId) await prepareEvolutionProject(this, handle, input.projectId);
        if (!ROLES.has(input.role)) fail('native_generation_role_invalid');
        if (input.role === 'illustration_prompt' && !illustrationPlan) fail('native_generation_context_required');
        // The HTTP host currently owns player routes only. Never reinterpret an
        // explicit session/foreign scope or silently choose one of two contexts.
        if (input.sessionId && input.projectId) fail('native_generation_context_ambiguous');
        if (input.routeRef !== undefined && (!input.routeRef || typeof input.routeRef !== 'object' || Array.isArray(input.routeRef)
            || input.routeRef.scope !== 'player' || typeof input.routeRef.runtimeRouteId !== 'string'
            || Object.keys(input.routeRef).some(key => !['scope', 'runtimeRouteId'].includes(key)))) fail('native_generation_route_ref_invalid');
        const role = 'role.' + input.role;
        let snapshot; let sourceAuthoritySnapshot; let project; let source; let runtime; let projectTaskEvidence; let projectConversation; let rpMessages; let projectWorker = null;
        if (sample) {
            source = { kind: 'authoring', sampleId: hashNativeDocument(sample) };
        } else if (input.sessionId) {
            snapshot = immutable(illustrationPlan?.snapshot ?? (preflight ? preflightSnapshot : null) ?? lanePlan?.authorityContext?.snapshot
                ?? (preview ? await this.sessionCore.observe(handle, input.sessionId, { revisionId: input.revisionId })
                    : await this.sessionCore[effectPolicy === 'no-background-model' ? 'observe' : 'load'](handle, input.sessionId)));
            if (snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
            if (!preflight && snapshot.externalEffects?.some(effect => effect.status === 'prepared')) fail('native_transfer_pending');
            source = illustrationPlan?.source ?? { kind: 'session', sessionId: input.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
            // A prepared Authority Turn may contain provisional World values.
            // Freshness compares the original committed source, not that projection.
            sourceAuthoritySnapshot = lanePlan?.authorityContext || illustrationPlan
                ? immutable(await this.sessionCore.observe(handle, input.sessionId)) : snapshot;
            runtime = snapshot.manifest.runtime;
        } else if (input.projectId) {
            project = immutable(await this.studio.getProject(handle, input.projectId));
            if (input.revision !== project.revision.revision) fail('native_generation_revision_conflict');
            source = { kind: input.taskId ? 'task' : 'studio', projectId: input.projectId, revision: input.revision, ...(input.taskId ? { taskId: input.taskId } : {}) };
            runtime = project.source.package.runtime;
            if (input.taskId) {
                const context = preview || sendBank ? await this.agent.observeContext(handle, input.projectId, input.taskId)
                    : await this.agent.getContext(handle, input.projectId, input.taskId);
                projectTaskEvidence = { source: 'native.project-task', ref: input.taskId + ':' + context.task.executionFingerprint };
                projectConversation = context.task.conversation;
                if (context.task.baseRevision !== input.revision || ['review', 'blocked', 'conflict', 'taken_over', 'completed'].includes(context.task.status)) fail('native_generation_task_stopped');
                if (scopedContext && (scopedContext.compiled.request.audience.kind === 'project_task'
                    || ContextPort.prototype.isProjectDelegation.call(scopedContext.port, handle, { context: scopedContext.compiled }))) projectWorker = scopedContext.port.inspectProjectWorker(handle, { context: scopedContext.compiled, request: input });
                if (projectWorker && !context.task.attempts.some(attempt => attempt.attemptId === input.projectAttemptId && attempt.status === 'started'
                    && attempt.requestId === projectWorker.originalRequestId)) fail('native_generation_task_stopped');
                if (!preview && input.projectAttemptId && !projectWorker) await this.agent.recordGenerationRequest(handle, input.projectId, input.taskId, input.projectAttemptId, input.requestId);
                const allowed = new Set(context.tools.map(tool => tool.function.name).concat(['atri_agent_list_skills', 'atri_agent_read_skill', 'atri_agent_skill_files']));
                if ((input.tools || []).some(tool => !allowed.has(tool.function?.name))) fail('native_generation_tool_denied');
            }
        } else if (sendBank?.authorityRef.domain === 'rp_chat') {
            if (input.messages?.length || input.prompt || input.tools?.length) fail('native_generation_context_denied');
            source = { kind: 'rp_chat', controlId: sendBank.authorityRef.controlId };
            rpMessages = (await sendBank.rpContext()).messages;
        } else if (preflight && preflightPackage) {
            runtime = preflightPackage.manifest.runtime;
        } else fail('native_generation_context_required');
        const budget = illustrationPlan ? null : runtime?.experienceContract?.generationBudget;
        if (quotaProof !== undefined) assertNativeTurnQuota(quotaProof, { host: this, sessionCore: this.sessionCore, handle,
            sessionId: input.sessionId, requestId: input.requestId, role: input.role,
            anchor: { branchId: snapshot?.revision.branchId, revisionId: snapshot?.revision.revisionId }, policy: budget ?? null });
        if (scopedContext) scopedContext.port.assertSource(handle, { context: scopedContext.compiled, source });
        if (sendBank) {
            const authority = sendBank.authorityRef;
            if ((budget && quotaProof === undefined) || (input.sessionId ? authority.domain !== 'session' || authority.sessionId !== input.sessionId
                : input.projectId ? authority.authority !== 'project_task' || authority.projectId !== input.projectId || authority.taskId !== input.taskId
                    : authority.domain !== 'rp_chat')) fail('native_generation_budget_lane_denied');
        }
        if (snapshot && !preview && !preflight) {
            await this.sessionCore.runs.assert(handle, input.sessionId, 'generate');
            if (budget && !lanePlan?.budgetContext) fail('native_generation_budget_lane_denied');
        }
        const packageIdentity = snapshot?.session ?? preflightPackage?.manifest;
        const routeList = previewContext?.routes ?? (lanePlan ? Object.values(lanePlan.routes) : await this.persistence.listRuntimeRoutes(handle));
        if (previewContext) previewContext.routes ??= immutable(routeList);
        let route = selectNativeRuntimeRoute(routeList, role, input.routeRef);
        if (programSelection) {
            const validate = programSelection.assertCurrent;
            programSelection = Object.freeze({ promptProgramRef: programSelection.promptProgramRef,
                assertCurrent: details => validate({ ...details, source }) });
            await programSelection.assertCurrent({ handle, route, promptProgramRef: programSelection.promptProgramRef, phase: 'host' });
        }
        if (!preview && !scheduled) {
            const captured = {};
            const resources = await this.executionResources(handle, route, input.sessionId, captured);
            if (authoringRun && nativeTaskScheduler.findAuthoring(handle, source.sampleId + ':' + role + ':' + input.requestId))
                fail('native_generation_authoring_request_exists');
            let worker;
            const operation = nativeTaskScheduler.submit({ owner: handle, anchor: source, executionClass: 'interactive', resources, retry: false, retainResult,
                timeoutMs: executionTimeout(captured),
                key: (input.sessionId ?? input.projectId ?? source.controlId ?? source.sampleId) + ':' + role + ':' + input.requestId, fingerprint: hashNativeDocument(authoringRun ? { input, drafts: draftOverrides.identities, limits: authoringRun.compute.limits } : programSelection ? { input, promptProgramRef: programSelection.promptProgramRef } : input), signal, onChunk,
                fresh: async () => sample ? true : sendBank ? (await sendBank.assertCurrent(), true) : input.sessionId ? (await this.sessionCore[effectPolicy === 'no-background-model' ? 'observe' : 'load'](handle, input.sessionId)).revision.revisionId === input.revisionId
                    : (await this.studio.getProject(handle, input.projectId)).revision.revision === input.revision,
                run: boundary => {
                    worker = this.execute(handle, input, boundary.signal, boundary.onChunk, { taskPlan, scheduled: true, lanePlan: captured, effectPolicy, approvedReview, orchestrationSend, programSelection, authoringRun, draftOverrides });
                    return worker;
                },
                projectResult: result => ({ usage: result.response?.usage ?? null, compute: result.routing?.compute ?? null,
                    currencyCost: null, currencyStatus: 'unavailable', usageStatus: result.response?.usage ? 'observed' : 'missing' }),
                finalize: async result => result });
            try { onChunk?.({ operationId: operation.operationId, status: 'queued', provisional: true }); } catch { /* Observer only. */ }
            return operation.result.catch(async error => {
                // The scheduler exposes cancellation promptly but keeps worker
                // permits until settlement. Durable Task continuation must also
                // finish usage settlement/private cleanup before this Host exits.
                if (input.taskId && ['task', 'adaptive'].includes(route.executionPolicy?.continuity) && worker) await worker.catch(() => {});
                if (error.code === 'operation_cancelled') fail('generation_cancelled');
                throw error;
            });
        }
        if (input.previewRefs && !preview && !authoringRun) fail('native_generation_preview_only');
        if (input.previewRefs && (typeof input.previewRefs !== 'object' || Array.isArray(input.previewRefs)
            || Object.keys(input.previewRefs).some(key => !['promptProgramRef', 'generationProfileRef'].includes(key)))) fail('native_generation_preview_refs_invalid');
        if ((preview || authoringRun) && input.previewRefs) route = { ...route,
            ...(input.previewRefs.promptProgramRef ? { promptProgramRef: input.previewRefs.promptProgramRef } : {}),
            ...(input.previewRefs.generationProfileRef ? { generationProfileRef: input.previewRefs.generationProfileRef } : {}),
        };
        const requirements = [...new Set([
            ...(taskPlan ? [...taskPlan.slot.requiredCapabilities, ...taskPlan.variant.requiredCapabilities] : []),
            ...(taskPlan ? [] : (runtime?.modelPrompt?.roles.find(item => item.role === role)?.requiredCapabilities || [])),
            ...(input.tools?.length ? ['generation.tools'] : []), ...(input.outputContract ? ['generation.structured-output'] : []),
        ])];
        const getScopedResource = async (owner, ref) => {
            let entries;
            if (ref.scope === 'package') {
                if (!packageIdentity || ref.packageId !== packageIdentity.packageId || ref.packageVersionId !== packageIdentity.packageVersionId) fail('native_generation_resource_owner');
                const opened = preflightPackage ?? await this.packageInstaller.open(owner, ref.packageId, ref.packageVersionId);
                entries = opened.manifest.resources;
            } else {
                const resourceProject = sampleProject ?? project;
                if (!resourceProject || ref.projectId !== resourceProject.source.project.projectId) fail('native_generation_resource_owner');
                entries = resourceProject.source.resources;
            }
            const entry = (entries || []).find(item => {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                return identity.resourceId === ref.resourceId && identity.resourceType === ref.resourceType && identity.revision === ref.revision;
            });
            if (!entry && ref.scope === 'project') return draftOverrides?.resourceOverrides.newResource({ ref });
            return entry && { snapshot: entry.resource, origin: ref.scope === 'project' ? { scope: 'project', projectId: ref.projectId } : entry.origin };
        };
        const persistence = Object.create(this.persistence);
        if (previewContext) {
            persistence.getRuntimeRoute = async (_owner, id) => previewContext.routes.find(route => route.runtimeRouteId === id);
            const profiles = previewContext.profiles ??= new Map();
            for (const method of ['getConnectionProfile', 'getModelProfile']) persistence[method] = async (owner, id) => {
                const key = method + ':' + id;
                if (!profiles.has(key)) profiles.set(key, immutable(await this.persistence[method](owner, id)));
                return profiles.get(key);
            };
        }
        if (lanePlan) {
            persistence.getRuntimeRoute = async (_owner, id) => lanePlan.routes[id] ?? null;
            persistence.getConnectionProfile = async (_owner, id) => lanePlan.connections[id] ?? null;
            persistence.getModelProfile = async (_owner, id) => lanePlan.models[id] ?? null;
        }
        const readCapturedRoute = persistence.getRuntimeRoute.bind(persistence);
        if (project && !taskPlan) {
            route = projectRuntimeRoute(route, input.projectId);
            persistence.getRuntimeRoute = async (owner, id) => projectRuntimeRoute(await readCapturedRoute(owner, id), input.projectId);
        }
        if (taskPlan) {
            const compose = lane => taskRuntimeRoute(lane, role, taskPlan, packageIdentity);
            route = compose(route);
            persistence.getRuntimeRoute = async (owner, id) => compose(await readCapturedRoute(owner, id));
        }
        if ((preview || authoringRun) && input.previewRefs) {
            const readEffectiveRoute = persistence.getRuntimeRoute.bind(persistence);
            persistence.getRuntimeRoute = async (owner, id) => ({ ...await readEffectiveRoute(owner, id), ...input.previewRefs });
        }
        const resolver = new RouteResolver({ persistence, library: this.library, providers: this.providers, getScopedResource,
            resourceOverrides: draftOverrides?.resourceOverrides });
        if (preflight) return resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, role, requirements, programSelection });
        if (snapshot && !illustrationPlan && !prediction) assertInformationActorAvailable(snapshot, lanePlan?.authorityContext ? undefined : taskPlan?.task.id);
        const authorityContext = lanePlan?.authorityContext;
        if (!authorityContext && informationDefinition(snapshot) && input.messages?.length) fail('native_information_unscoped_messages');
        const contextPackage = !prediction && snapshot && (snapshot.manifest.runtime?.experienceContract?.contextRuntime || snapshot.manifest.runtime?.experienceContract?.processingRuntime)
            ? (preflightPackage ?? await this.packageInstaller.open(handle, snapshot.session.packageId, snapshot.session.packageVersionId)) : null;
        const nativeContext = !prediction && snapshot && authorityContext?.mode !== 'resolver' ? createNativeSessionContextAdapter({ readSnapshot: async () => ({ source, snapshot }),
            options: nativeSessionContextOptions({ handle, snapshot, resolver, contextPackage, role, taskPlan, lanePlan, authorityContext, signal }) }) : null;
        const localWorkAttempts = [];
        const localWork = async (kind, request, operation, publicInput, discardResult) => {
            if (preview) return operation();
            const limits = request.resolved.effectiveExecutionPolicy?.computeBudget;
            const attempt = { attemptId: sendBank ? sendBank.nextLocalWorkAttemptId() : randomUUID(), requestId: input.requestId, kind, estimatedItems: 1,
                estimatedInputBytes: Buffer.byteLength(JSON.stringify(publicInput ?? { contextPlan: request.contextPlan ?? request.snapshot.contextPlan,
                    promptIr: request.promptIr ?? request.snapshot.promptIr }), 'utf8'),
                targetFingerprint: hashNativeDocument({ path: request.resolved.pathFingerprint, kind }) };
            return runGenerationLocalWork({ signal, attempt, discardResult,
                onAdmitted: entry => localWorkAttempts.push(entry), admit: async () => {
                    let receipt;
                    if (authoringRun) receipt = chargeLocalWork(authoringRun, limits, attempt);
                    else if (sendBank) receipt = await sendBank.chargeLocalWork(limits, attempt);
                    else if (input.sessionId) {
                        const context = lanePlan?.budgetContext;
                        receipt = await this.sessionCore.runs.chargeLocalWork(handle, context?.snapshot ?? snapshot,
                            context?.anchor ?? { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId }, limits, attempt,
                            { background: context?.background === true });
                    } else if (projectTaskEvidence) receipt = await this.agent.chargeLocalWork(handle, input.projectId, input.taskId, input.revision, limits, attempt, projectTaskEvidence.ref.slice(-64));
                    else if (limits?.localWork) throw new GenerationError('native_generation_budget_lane_denied');
                    return receipt;
                }, settle: ({ receipt, usage }) => authoringRun ? settleLocalWork(authoringRun, attempt.attemptId, usage) : sendBank ? sendBank.settleLocalWork(attempt.attemptId, usage)
                    : input.sessionId ? this.sessionCore.runs.settleLocalWork(handle, input.sessionId, receipt.operation, attempt.attemptId, usage)
                        : this.agent.settleLocalWork(handle, input.projectId, input.taskId, attempt.attemptId, usage) }, operation);
        };
        const skills = !sample && !sendBank && !prediction && !authorityContext && this.skillRepository && isNarrativeSkillInvocation(input.role, taskPlan, runtime)
            ? await prepareNarrativeSkills({ repository: preview ? createPreviewSkillRepository(this.skillRepository(handle)) : this.skillRepository(handle), settings: (await this.extensions.settings(handle)).value,
                work: (kind, descriptor, operation) => localWork(kind, { resolved: { effectiveExecutionPolicy: route.executionPolicy,
                    pathFingerprint: hashNativeDocument(route) } }, operation, descriptor),
                context: snapshot ? { packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId,
                    skillIds: snapshot.manifest.skills?.map(item => typeof item === 'string' ? item : item.skillId ?? item.id) }
                    : { projectId: input.projectId } }) : null;
        if (skills?.tools.length && input.tools?.length) fail('native_skill_tool_conflict');
        if (skills?.tools.length && !requirements.includes('generation.tools')) requirements.push('generation.tools');
        const skillTranscript = [];
        let taskHistoryLoaded = false, taskHistory = null, taskHistoryWork, resumeSkillRead, persistTaskHistory, discardTaskHistory, compactTaskHistory;
        let contextBuildWork, promptCompileWork;
        const sessionTaskEvidence = source.kind === 'session' && taskPlan?.executionFingerprint
            ? { source: 'native.session-task', ref: input.requestId + ':' + taskPlan.executionFingerprint } : null;
        const taskProvenance = () => [sessionTaskEvidence, ...(taskHistory?.compaction
            ? [{ source: 'native.session-task-compaction', ref: '1:' + hashNativeDocument(taskHistory.compaction) }] : [])];
        const scopedProvider = scopedContext?.port.provider(handle, { context: scopedContext.compiled, source });
        const buildContext = async (request, resolved) => {
            if (sample) return authoringSamplePlan(request, resolved, sample);
            if (scopedProvider) return scopedProvider.buildRequestContextPlan(request, resolved);
            if (prediction) {
                await assertPredictionCaptureCurrent(prediction.capture);
                return { schemaVersion: 1, requestId: request.requestId, source,
                    items: [{ kind: 'context.input', id: 'prediction-policy', content: 'Produce only a hypothetical prediction from the supplied observation and proposed action. The action has not occurred; do not report its consequences as observed facts or claim any write authority. State assumptions and limitations. Confidence is an uncalibrated model estimate, not a measured probability. Use supportRefs only from observation item identifiers. No tools, Memory, Knowledge or Skills are available.', provenance: [{ source: 'host.prediction.policy' }] },
                        { kind: 'context.input', id: 'prediction-input', content: JSON.stringify(prediction.payload), provenance: [{ source: 'host.prediction' }] }],
                    provenance: [{ source: 'host.prediction', ref: taskPlan.executionFingerprint }],
                    budget: { maxTokens: resolved.model.limits.contextTokens - resolved.model.limits.outputTokens, reservedOutputTokens: resolved.model.limits.outputTokens } };
            }
            if (!preview && sessionTaskEvidence && skills?.tools.length && ['task', 'adaptive'].includes(resolved.effectiveExecutionPolicy?.continuity) && !taskHistoryLoaded) {
                const context = lanePlan?.budgetContext;
                const anchor = context?.anchor ?? { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
                if (context?.background) throw new GenerationError('generation_continuation_unavailable');
                const identity = { invocationId: input.requestId, fingerprint: taskPlan.executionFingerprint,
                    inventoryFingerprint: hashNativeDocument(skills.items) };
                discardSessionTaskExecution = () => discardTaskHistory(resolved);
                taskHistory = await taskHistoryWork({ resolved }, () => this.sessionCore.runs.sessionTaskHistory(handle, snapshot, anchor, identity), identity);
                taskHistoryLoaded = true;
                if (taskHistory) skillTranscript.push(...taskHistory.messages);
                persistTaskHistory = async () => {
                    const messages = publicSessionTaskMessages(skillTranscript);
                    taskHistory = await taskHistoryWork({ resolved }, () => this.sessionCore.runs.sessionTaskHistory(handle, snapshot, anchor, identity,
                        { messages, expectedPrefix: hashNativeDocument(taskHistory?.messages ?? []) }), { ...identity, messages });
                };
                // Only missing read-only results are reconstructed. Saved results
                // stay exact and are never re-read or rewritten on cold recovery.
                const assistant = skillTranscript.findLastIndex(message => message.role === 'assistant');
                if (assistant >= 0) {
                    const message = skillTranscript[assistant], completed = skillTranscript.length - assistant - 1;
                    const calls = message.tool_calls.slice(completed).map(call => ({ id: call.id, name: call.function.name,
                        args: JSON.parse(call.function.arguments), raw: call }));
                    await completeNarrativeSkillTools({ calls, skills: { ...skills, read: call => resumeSkillRead({ resolved }, call) },
                        transcript: skillTranscript, signal, persist: persistTaskHistory });
                }
                if (sessionTaskRoundCount(taskHistory, skillTranscript) >= 6) throw new GenerationError('generation_continuation_unavailable');
            }
            if (illustrationPlan) return illustrationPlan.buildContext(request, resolved, resolver.provider(resolved.connection.providerAdapter), compiler);
            const selected = nativeContext ? await nativeContext.buildRequestContextPlan(request, resolved) : emptyNativeContextPlan(request, resolved, source);
            // A task/tool transcript follows the selected turn input. Do not
            // append the original user turn again after a tool result.
            const safeItems = authorityContextItems(selected, snapshot, authorityContext);
            const exposed = taskPlan ? selectNativeTaskContext(safeItems, taskPlan.task) : safeItems;
            const items = exposed.map(item => (input.messages?.length || skillTranscript.length) && item.kind === 'context.input'
                ? { ...item, kind: 'context.history', content: { role: 'user', content: item.content } } : item);
            // Host-owned task dialogue is supplemental context, never a second fact scan.
            for (const [index, message] of (rpMessages ?? input.messages ?? []).entries()) {
                // Some native callers label a mixed task/source envelope system.
                // A submitted role is not Host authority; retain its raw text as
                // evidence. Actual policies and author modules have separate paths.
                if (['system', 'developer'].includes(message?.role)) {
                    items.push({ kind: 'context.fact', id: 'task-message-' + index, content: message.content,
                        provenance: [{ source: 'request.task-data' }], evidence: { declaredRole: message.role, authority: 'none' } });
                } else items.push({ kind: 'context.history', id: 'task-message-' + index, content: message, provenance: [{ source: rpMessages ? 'native.rp-chat' : 'host.task' }] });
            }
            if (taskHistory?.compaction) items.push({ kind: 'context.history', id: 'task-public-summary',
                content: { role: 'user', content: taskHistory.compaction.summary }, provenance: [{ source: 'host.task.public-summary', ref: taskHistory.compaction.sourcePrefixFingerprint }] });
            if (taskPlan?.task.context.includes('input')) items.push({ kind: skillTranscript.length ? 'context.history' : 'context.input', id: 'task-input',
                content: skillTranscript.length ? { role: 'user', content: JSON.stringify(taskPlan.payload) } : JSON.stringify(taskPlan.payload), provenance: [{ source: 'host.task' }] });
            appendAuthorityContext(items, authorityContext);
            items.push(...(skills?.items ?? []));
            for (const [index, message] of skillTranscript.entries()) items.push({ kind: 'context.history', id: 'skill-message-' + index,
                content: message, provenance: [{ source: 'host.skills' }] });
            const nativeSelection = narrowNativeContextSelection(selected, snapshot, items);
            const taskEvidence = projectTaskEvidence ?? sessionTaskEvidence;
            return { ...selected, items, ...(taskEvidence ? { provenance: [...selected.provenance,
                ...(sessionTaskEvidence ? taskProvenance() : [taskEvidence])] } : {}), ...(nativeSelection ? { nativeSelection } : {}) };
        };
        const assertSourceCurrent = async ({ phase, contextPlan } = {}) => {
            checkCancellation(signal);
            if (sampleProject && (await this.studio.getProject(handle, input.resourceProjectId)).revision.revision !== sampleProject.revision.revision)
                throw new GenerationError('native_generation_revision_conflict');
            if (sendBank) await sendBank.assertCurrent();
            if (prediction) await assertPredictionCaptureCurrent(prediction.capture);
            if (source.kind === 'session') {
                // Observe the original authority, never a cached ContextPlan.
                const current = await this.sessionCore.observe(handle, input.sessionId);
                if (current.revision.revisionId !== source.revisionId || current.revision.branchId !== source.branchId)
                    throw new GenerationError('native_generation_revision_conflict');
                if (hashNativeDocument(current.states ?? {}) !== hashNativeDocument(sourceAuthoritySnapshot.states ?? {})
                    || hashNativeDocument(current.manifest.runtime ?? null) !== hashNativeDocument(sourceAuthoritySnapshot.manifest.runtime ?? null))
                    throw new GenerationError('native_generation_source_stale');
                if (!illustrationPlan && !prediction) assertInformationActorAvailable(current, lanePlan?.authorityContext ? undefined : taskPlan?.task.id);
                if (lanePlan?.memoryEvidence?.length) normalizeHostMemoryEvidence(lanePlan.memoryEvidence, current);
                if (preview && phase === 'preview') {
                    await assertPreviewDisclosure(current, { taskId: taskPlan?.task.id ?? input.taskId, contextPlan });
                    // The projection checker itself awaits original readers.
                    // Recheck once more after those reads before returning data.
                    await assertSourceCurrent({ phase: 'preview_verified' });
                }
            } else if (input.projectId) {
                if ((await this.studio.getProject(handle, input.projectId)).revision.revision !== source.revision)
                    throw new GenerationError('native_generation_revision_conflict');
                if (projectTaskEvidence) {
                    const observed = await this.agent.observeContext(handle, input.projectId, input.taskId);
                    if (observed.task.executionFingerprint !== projectTaskEvidence.ref.slice(-64)
                        || ['review', 'blocked', 'conflict', 'taken_over', 'completed'].includes(observed.task.status))
                        throw new GenerationError('native_generation_task_stopped');
                }
            }
            checkCancellation(signal);
        };
        let meteredContextIncluded = false;
        const contextProvider = { buildRequestContextPlan: async (request, resolved) => {
            if (previewContext?.plan) {
                const reservedOutputTokens = effectiveOutputReserve(resolved);
                return { ...previewContext.plan, requestId: request.requestId, budget: { maxTokens: resolved.model.limits.contextTokens - reservedOutputTokens, reservedOutputTokens } };
            }
            if (scopedContext?.compileProof) {
                const verified = await assertContextCompilation({ proof: scopedContext.compileProof, handle, port: scopedContext.port,
                    compiled: scopedContext.compiled, bank: sendBank, source });
                if (!meteredContextIncluded) { localWorkAttempts.unshift(verified.localWork); meteredContextIncluded = true; }
                return buildContext(request, resolved);
            }
            const plan = await contextBuildWork(request, resolved, () => buildContext(request, resolved));
            if (previewContext) previewContext.plan = immutable(plan);
            return plan;
        }, assertCurrent: assertSourceCurrent };
        if (previewContext) (previewContext.checks ??= []).push(assertSourceCurrent);
        if (input.prompt?.host !== undefined) fail('native_generation_host_readonly');
        const hostView = { role, sourceKind: source.kind, sessionId: source.sessionId || '', branchId: source.branchId || '',
            revisionId: source.revisionId || '', projectId: source.projectId || '', projectRevision: source.revision || '' };
        const compiler = new PromptCompiler({ hostDefinitions: Object.fromEntries(Object.keys(hostView).map(key => [key, { type: 'string', required: true }])) });
        const attempts = [];
        const computeAttempts = [];
        const modelSendFacts = [];
        const saveModelTerminalFacts = (error, kind, generated = null) => {
            if (!sendBank || !modelSendFacts.length || modelSendFacts.length !== attempts.length || computeAttempts.length !== modelSendFacts.length) return;
            if (kind === 'rejected' && (signal?.aborted || modelSendFacts.some(fact => fact.outcome !== 'http_rejected')
                || !modelSendFacts.at(-1).errorCodes.includes(error.code))) return;
            if (kind === 'late_response' && (!generated?.response || typeof generated.response.text !== 'string'
                || modelSendFacts.at(-1).outcome !== 'response'
                || modelSendFacts.slice(0, -1).some(fact => fact.outcome !== 'http_rejected'))) return;
            modelTerminalFacts.set(error, { host: this, engine: this.persistence._engine,
                hostBootId: this.persistence._engine.nativeHostLifecycle?.hostBootId, facts: immutable({ handle, requestId: input.requestId, kind,
                    responseHash: generated ? hashNativeDocument(generated.response) : null,
                    finalRequestHash: modelSendFacts.at(-1).requestSnapshotHash,
                    attempts: modelSendFacts.map(({ errorCodes: _codes, ...fact }, index) => ({ ...fact,
                        outcome: kind === 'late_response' && index === modelSendFacts.length - 1 ? 'response_validated' : fact.outcome,
                        status: computeAttempts[index].status, usageHash: hashNativeDocument(computeAttempts[index].usage) })) }) });
        };
        let computeLimits = null;
        let readSkill;
        let discardSessionTaskExecution;
        let capturedSend;
        let completedSendSnapshot;
        const budgetedResolver = { resolve: request => localWork('route_resolve', { resolved: { effectiveExecutionPolicy: route.executionPolicy,
            pathFingerprint: hashNativeDocument(route) } }, () => resolver.resolve(request), { route, request }), provider: id => resolver.provider(id) };
        const service = new GenerationService({ resolver: budgetedResolver, contextProvider, preparePrompt: args => promptCompileWork(args), secretPort: this.secretPort,
            beforeSend: authoringRun || sendBank || approvedReview || lanePlan?.controlledTurn ? async ({ snapshot, resolved }) => {
                if (authoringRun) draftOverrides?.assertConsumed();
                if (sendBank) capturedSend = { snapshot, resolved };
                await lanePlan?.controlledTurn?.check();
                if (!approvedReview) return;
                const { createdAt: _time, ...stableSnapshot } = snapshot;
                const configuration = { routes: await this.persistence.listRuntimeRoutes(handle), models: await this.persistence.listModelProfiles(handle),
                    connections: await this.persistence.listConnectionProfiles(handle) };
                if (hashNativeDocument(stableSnapshot) !== approvedReview.snapshotFingerprint || hashNativeDocument(configuration) !== approvedReview.configurationFingerprint)
                    throw new GenerationError('native_generation_review_stale');
            } : null,
            providerFor: (id, resolved) => {
                const baseProvider = resolver.provider(id);
                const provider = !preview && (projectTaskEvidence || sessionTaskEvidence) && this.persistence._engine && baseProvider.withRuntimeCheckpointStore
                    ? baseProvider.withRuntimeCheckpointStore(new RuntimeCheckpointStore({ engine: this.persistence._engine, handle,
                        publicConversation: projectConversation, sessionTask: Boolean(sessionTaskEvidence),
                        sessionTaskHistory: () => publicSessionTaskMessages(skillTranscript), sessionTaskCompaction: () => taskHistory?.compaction })) : baseProvider;
                let prepared;
                let counted;
                let pendingCharge;
                let sendAdmitted = false;
                let retainOnBudgetRejection = false;
                const settleAttempt = async usage => {
                    if (!pendingCharge) return;
                    const { receipt, attemptId, entry } = pendingCharge;
                    const settled = authoringRun ? settleComputeAttempt(authoringRun, attemptId, usage) : sendBank ? await sendBank.settle(attemptId, usage) : input.sessionId
                        ? await this.sessionCore.runs.settleCompute(handle, input.sessionId, receipt.operation, attemptId, usage)
                        : await this.agent.settleGeneration(handle, input.projectId, input.taskId, attemptId, usage);
                    Object.assign(entry, settled);
                    pendingCharge = null;
                };
                taskHistoryWork = (request, operation, descriptor) => localWork('task_history', request, operation, descriptor);
                // GenerationService creates this provider before preparing Context
                // and passes the accepted effective policy to both work ports.
                contextBuildWork = (request, effective, operation) => localWork('context_build', { resolved: effective }, operation,
                    { source, snapshot: nativeContext ? snapshot : null, contextPackage, illustrationPlan,
                        task: taskPlan ? { context: taskPlan.task.context, payload: taskPlan.payload } : null,
                        messages: input.messages ?? [], skillItems: skills?.items ?? [], skillTranscript,
                        memoryEvidence: lanePlan?.memoryEvidence ?? [], authorityContext });
                promptCompileWork = args => localWork('prompt_compile', args, () => compiler.preparePrompt(args),
                    { contextPlan: args.contextPlan, resources: args.resolved.resources, prompt: args.request.prompt,
                        tools: args.request.tools, outputContract: args.request.outputContract });
                resumeSkillRead = (request, call) => localWork('skill_read', request, () => skills.read(call),
                    { name: call.name, args: call.args, inventoryFingerprint: hashNativeDocument(skills.items) });
                discardTaskHistory = effective => provider.discardExecution?.({ binding: {
                    ownerFingerprint: effective.ownerFingerprint, pathFingerprint: effective.pathFingerprint,
                    continuity: effective.effectiveExecutionPolicy.continuity,
                    executionScope: nativeExecutionScope({ source, provenance: taskProvenance() }, input.requestId, effective.route.role),
                } });
                compactTaskHistory = async () => {
                    if (!counted || !provider.resetExecution || counted.resolved.effectiveExecutionPolicy?.continuity !== 'adaptive'
                        || !taskHistory || taskHistory.compaction || !completeSessionTaskHistory(taskHistory.messages)
                        || this.sessionCore.runs.repo._engine !== this.persistence._engine) throw new GenerationError('generation_context_budget_exceeded');
                    const { messages, compaction: _compact, ...identity } = taskHistory;
                    const anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
                    taskHistory = await localWork('task_history', counted, () => provider.resetExecution(counted,
                        discard => this.sessionCore.runs.compactSessionTaskHistory(handle, snapshot, anchor, identity, hashNativeDocument(messages), discard)),
                    { action: 'public_summary_reset', ...identity, messages });
                    skillTranscript.splice(0);
                };
                return { ...provider, settleAttempt,
                    discardExecution: rendered => retainOnBudgetRejection ? undefined : provider.discardExecution?.(rendered),
                    countTokens: async request => {
                        const tokens = await localWork('generation_count', request, () => provider.countTokens(request));
                        // This round's exact path, public prefix and private authority
                        // have been checked, even when the service refuses before render.
                        counted = request;
                        return tokens;
                    },
                    renderRequest: async request => {
                        prepared = request;
                        readSkill = call => localWork('skill_read', request, () => skills.read(call),
                            { name: call.name, args: call.args, inventoryFingerprint: hashNativeDocument(skills.items) });
                        const rendered = await localWork('generation_render', request, () => provider.renderRequest(request), undefined, result => provider.discardExecution?.(result));
                        if (sessionTaskEvidence && ['task', 'adaptive'].includes(rendered.binding?.continuity)) {
                            discardSessionTaskExecution = () => provider.discardExecution(rendered);
                        }
                        return rendered;
                    }, send: async (rendered, boundary) => {
                        const acceptedSend = capturedSend;
                        if (sendBank && (!acceptedSend || acceptedSend.resolved !== prepared.resolved
                            || acceptedSend.snapshot.requestId !== input.requestId
                            || !equalNativeDocuments({ contextPlan: acceptedSend.snapshot.contextPlan, promptIr: acceptedSend.snapshot.promptIr }, { contextPlan: prepared.snapshot.contextPlan, promptIr: prepared.snapshot.promptIr }))) throw new GenerationError('generation_request_identity_mismatch');
                        // Role-host retries stay inside this route's send/timeout boundary.
                        // Only after they are exhausted may Core resolve a complete fallback.
                        for (let retry = 0; ; retry++) {
                            checkCancellation(boundary.signal);
                            assertExecutionEvidenceCurrent(resolved, Date.now(), prepared.snapshot.diagnostics.executionPlan.policy);
                            // Private native request leases are single-send. A retry lowers
                            // the same frozen snapshot again and rechecks its current envelope.
                            if (retry) rendered = await localWork('generation_render', prepared, () => provider.renderRequest(prepared), undefined, result => provider.discardExecution?.(result));
                            let actualSnapshot, expectedSend, modelSendFact;
                            if (sendBank) {
                                // The first snapshot comes from GenerationService after
                                // lowering. Retries lower again and bind that exact wire.
                                const compiledBinding = compiledRequestBinding({ resolved: prepared.resolved,
                                    contextPlan: prepared.snapshot.contextPlan, promptIr: prepared.snapshot.promptIr, rendered });
                                if (!retry && !equalNativeDocuments(compiledBinding, acceptedSend.snapshot.diagnostics.compiledBinding ?? null)) {
                                    throw new GenerationError('generation_request_identity_mismatch');
                                }
                                actualSnapshot = immutable({ ...acceptedSend.snapshot, diagnostics: { ...acceptedSend.snapshot.diagnostics, compiledBinding } });
                                if (containsSecret(actualSnapshot, boundary.secret) || containsSecret(rendered, boundary.secret)) throw new GenerationError('generation_config_contains_secret');
                                expectedSend = compiledSendIdentity({ snapshot: actualSnapshot, resolved: prepared.resolved });
                            }
                            const attempt = { runtimeRouteId: resolved.route.runtimeRouteId, retry, status: 'pending' };
                            attempts.push(attempt);
                            const capture = lanePlan?.evidenceCapture;
                            const observedAttempt = capture?.nextAttempt(input.requestId) ?? attempts.length;
                            const attemptId = input.requestId + ':' + observedAttempt;
                            try {
                                if (prediction) await assertPredictionCaptureCurrent(prediction.capture);
                                if (projectTaskEvidence && (await this.agent.getContext(handle, input.projectId, input.taskId)).task.executionFingerprint !== projectTaskEvidence.ref.slice(-64)) {
                                    throw new GenerationError('native_generation_task_stopped');
                                }
                                await provider.assertRequestCurrent?.(rendered);
                                checkCancellation(boundary.signal);
                                const limits = prepared.snapshot.diagnostics.executionPlan.policy.computeBudget;
                                if (sendBank) await sendBank.assertCurrent();
                                const computeOptions = optionalComputeOptions(resolved.route.executionPolicy, lanePlan?.budgetContext?.background === true ? 'background' : taskPlan || projectTaskEvidence ? 'model_task' : input.role);
                                if ('reserve' in computeOptions && !limits) throw new GenerationError('native_generation_budget_unavailable');
                                const compute = !sendBank && (authoringRun || limits || input.sessionId || input.taskId) ? { limits: limits ?? authoringRun?.compute.limits, options: computeOptions, attempt: { attemptId: randomUUID(), requestId: input.requestId,
                                    targetFingerprint: resolved.pathFingerprint, estimatedTokens: prepared.snapshot.diagnostics.inputTokens + prepared.snapshot.contextPlan.budget.reservedOutputTokens } } : null;
                                let receipt;
                                if (sendBank) {
                                    try {
                                        receipt = await sendBank.admit({ ...expectedSend,
                                            upperBound: actualSnapshot.diagnostics.inputTokens + actualSnapshot.contextPlan.budget.reservedOutputTokens, limits,
                                            ...computeOptions });
                                    } catch (error) { throw new GenerationError(error.code ?? 'generation_execution_failed'); }
                                } else if (authoringRun) {
                                    receipt = { compute: chargeComputeAttempt(authoringRun, compute.limits, compute.attempt, compute.options), limits: authoringRun.compute.limits };
                                } else if (budget) {
                                    const context = lanePlan.budgetContext;
                                    try { receipt = await this.sessionCore.runs.charge(handle, context.snapshot, { anchor: context.anchor, role: input.role, background: context.background === true, ...(compute ? { compute } : {}) }, budget); } catch (error) {
                                        if (['native_generation_budget_exhausted', 'native_generation_background_not_due', 'native_generation_budget_lane_denied'].includes(error.code)) throw new GenerationError(error.code);
                                        throw error;
                                    }
                                } else if (compute && input.sessionId) {
                                    receipt = await this.sessionCore.runs.chargeCompute(handle, snapshot,
                                        { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId }, limits, compute.attempt, computeOptions);
                                } else if (compute) {
                                    if (!input.taskId || !this.agent) throw new GenerationError('native_generation_budget_lane_denied');
                                    receipt = await this.agent.chargeGeneration(handle, input.projectId, input.taskId, input.revision, limits, compute.attempt, projectTaskEvidence.ref.slice(-64), computeOptions);
                                }
                                sendAdmitted = true;
                                if (receipt?.compute) {
                                    computeLimits = receipt.limits ?? limits;
                                    const entry = { ...receipt.compute };
                                    computeAttempts.push(entry);
                                    pendingCharge = { receipt, attemptId: sendBank ? receipt.budgetAttemptRef.attemptId : compute.attempt.attemptId, entry };
                                }
                                await capture?.attempt({ type: 'request.attempt.started', eventId: attemptId + '/started',
                                    requestId: input.requestId, attemptId, attempt: observedAttempt, runtimeRouteId: resolved.route.runtimeRouteId,
                                    agentId: role, lane: capture.lane, attemptScope: 'provider_send' });
                                if (prediction) await assertPredictionCaptureCurrent(prediction.capture);
                                if (input.role === 'illustration_prompt' && this.persistence._engine) await new VisualStore({ engine: this.persistence._engine }).reservePlanner(handle,
                                    { reservationId: attemptId + ':' + retry, tokens: prepared.snapshot.diagnostics.inputTokens + prepared.snapshot.contextPlan.budget.reservedOutputTokens });
                                await orchestrationSend?.beforeSend?.({ receipt, prepared, resolved: prepared.resolved,
                                    snapshot: actualSnapshot, compiledBinding: actualSnapshot?.diagnostics.compiledBinding, budgetAttemptRef: receipt?.budgetAttemptRef });
                                if (sendBank) await sendBank.assertCurrent();
                                if (scopedContext) await scopedContext.port.revalidate(handle, { context: scopedContext.compiled, phase: 'send' });
                                if (sendBank) {
                                    modelSendFact = { budgetAttemptRef: receipt.budgetAttemptRef, ...expectedSend,
                                        compiledBindingFingerprint: actualSnapshot.diagnostics.compiledBinding.fingerprint,
                                        requestSnapshotHash: hashNativeDocument(actualSnapshot), outcome: 'unknown', httpStatus: null, errorCodes: [] };
                                    modelSendFacts.push(modelSendFact);
                                }
                                await assertSourceCurrent();
                                const response = await provider.send(rendered, boundary);
                                if (modelSendFact) modelSendFact.outcome = 'response';
                                if (sendBank) completedSendSnapshot = actualSnapshot;
                                attempt.status = 'success';
                                capture?.append({ type: 'request.attempt.sent', eventId: attemptId + '/sent', requestId: input.requestId, attemptId });
                                return response;
                            } catch (error) {
                                const http = inspectProviderHttpFailure(error);
                                if (modelSendFact && http) Object.assign(modelSendFact, { outcome: 'http_rejected', httpStatus: http.status,
                                    errorCodes: error instanceof GenerationError ? [error.code]
                                        : error.kind === 'provider' ? ['generation_provider_failed', 'generation_fallback_exhausted'] : ['generation_execution_failed'] });
                                // A refused original budget admission has performed
                                // no send/reset. Preserve an existing valid checkpoint;
                                // retries after any attempted send still discard on failure.
                                retainOnBudgetRejection = COMPUTE_ADMISSION_CODES.includes(error.code) && !sendAdmitted;
                                await settleAttempt(http?.usage ?? null);
                                attempt.status = 'failed';
                                capture?.append({ type: 'request.attempt.failed', eventId: attemptId + '/failed', requestId: input.requestId, attemptId });
                                if (['native_generation_budget_exhausted', 'native_generation_task_stopped', 'native_generation_revision_conflict'].includes(error.code)) throw new GenerationError(error.code);
                                // A scoped model may follow its declared policy after an
                                // explicit provider rejection. A lost transport/timeout
                                // has no such response: retain that attempt as unknown.
                                if (sendBank && error instanceof ProviderFailure && ['transport', 'timeout'].includes(error.kind))
                                    throw new GenerationError('generation_provider_submission_unknown');
                                if (approvedReview || lanePlan?.controlledTurn || !(error instanceof ProviderFailure) || error.kind === 'application' || retry >= resolved.route.policy.maxRetries || boundary.signal.aborted) throw error;
                            }
                        }
                    } };
            } });
        const request = { requestId: input.requestId, role, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId },
            handle, signal, onChunk: skills?.tools.length ? undefined : onChunk, requirements, tools: skills?.tools.length ? skills.tools : input.tools || [], outputContract: input.outputContract ?? null,
            prompt: { ...input.prompt, host: hostView }, fallbackMode: input.fallbackMode ?? 'disabled', unknownCapabilityOverrides: input.unknownCapabilityOverrides || [] };
        let result;
        try {
            result = skills?.tools.length && !preview ? await runNarrativeSkillLoop({
                execute: async () => {
                    try { return await service.execute(request, { programSelection }); } catch (error) {
                        if (sessionTaskEvidence && error.code === 'generation_context_budget_exceeded' && taskHistory && !taskHistory.compaction) {
                            await compactTaskHistory();
                            return service.execute(request, { programSelection });
                        }
                        throw error;
                    }
                }, skills: { ...skills, read: call => readSkill(call) }, transcript: skillTranscript, signal, onChunk,
                persist: () => persistTaskHistory?.(),
                roundCount: () => sessionTaskRoundCount(taskHistory, skillTranscript),
                fresh: async () => {
                    const current = snapshot ? (await this.sessionCore[effectPolicy === 'no-background-model' ? 'observe' : 'load'](handle, input.sessionId)).revision.revisionId
                        : (await this.studio.getProject(handle, input.projectId)).revision.revision;
                    if (current !== (snapshot ? input.revisionId : input.revision)) fail('native_generation_revision_conflict');
                },
            }) : await service.execute(request, { preview, programSelection });
        } catch (error) {
            // Errors between model rounds (for example a cancelled Skill read)
            // must await the same private cleanup as provider failures.
            if (!['native_generation_budget_exhausted', 'generation_context_budget_exceeded'].includes(error.code)) await discardSessionTaskExecution?.();
            saveModelTerminalFacts(error, 'rejected');
            throw error;
        }
        if (sendBank) result = immutable({ ...result, snapshot: completedSendSnapshot });
        if (authorityContext?.mode === 'narrator' && (result.response.toolCalls?.length || result.response.tool_calls?.length)) fail('native_narrator_outcome_denied');
        if (scopedContext) {
            try { await scopedContext.port.revalidate(handle, { context: scopedContext.compiled, phase: 'consume' }); } catch (error) {
                saveModelTerminalFacts(error, 'late_response', result); throw error;
            }
        }
        if (prediction) {
            await assertPredictionCaptureCurrent(prediction.capture);
            if (result.response?.toolCalls?.length || result.response?.tool_calls?.length) fail('native_prediction_tools_denied');
        }
        lanePlan?.evidenceCapture?.append({ type: 'request.completed', eventId: input.requestId + '/parsed/' + attempts.length,
            requestId: input.requestId, usageStatus: result.response.usage ? 'observed' : 'missing',
            inputTokens: result.response.usage?.inputTokens ?? result.response.usage?.prompt_tokens,
            outputTokens: result.response.usage?.outputTokens ?? result.response.usage?.completion_tokens,
            totalTokens: result.response.usage?.totalTokens ?? result.response.usage?.total_tokens });
        let projectTaskCapture;
        if (!preview && input.projectId && input.taskId && input.projectAttemptId && !projectWorker) {
            try {
                await this.agent.recordGenerationObservation(handle, input.projectId, input.taskId, input.projectAttemptId, input.requestId,
                    { snapshot: result.snapshot, attempts, usage: result.response.usage });
                projectTaskCapture = { status: 'captured' };
            } catch { projectTaskCapture = { status: 'failed' }; }
        }
        if (!preview && input.projectId && effectPolicy !== 'no-background-model') { try { await observeEvolutionProject(this, handle, input, result); } catch { /* Observation failure does not change an accepted generation. */ } }
        if (draftOverrides) draftOverrides.assertConsumed();
        return immutable({ ...result, routing: { fallbackUsed: result.snapshot.runtimeRouteId !== route.runtimeRouteId, attempts,
            compute: { configured: Boolean(computeAttempts.length || localWorkAttempts.length || result.snapshot.diagnostics.executionPlan?.policy?.computeBudget),
                scope: sample ? 'authoring_request' : input.sessionId || source.kind === 'rp_chat' ? 'run_operation' : input.taskId ? 'project_task' : 'unavailable',
                limits: computeLimits ?? result.snapshot.diagnostics.executionPlan?.policy?.computeBudget ?? null, attempts: computeAttempts, localWork: localWorkAttempts,
                observationScope: 'current_request', currencyStatus: 'unavailable' },
            ...(projectTaskCapture ? { projectTaskCapture } : {}) } });
    }
}
