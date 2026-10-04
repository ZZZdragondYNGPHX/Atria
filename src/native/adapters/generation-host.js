import { hasAuthorityTransactions, authorityCatalog, authoritySelection, resolverRequest, authorityValue, authorityFailure, authoritySelectionCache } from '../authority-turn.js';
import { buildAuthorityObservation } from '../authority-transaction.js';
import { createNativeId, isNativeId } from '../identity.js';
import { prepareNarrativeSkills, runNarrativeSkillLoop, isNarrativeSkillInvocation } from '../skill-invocation.js';
import { GenerationService } from '../model-prompt-runtime/generation-service.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../model-prompt-runtime/prompt-compiler.js';
import { createNativeSessionContextAdapter } from './native-session-context.js';
import { assertInformationActorAvailable, informationDefinition, informationContext } from '../../../public/shared/native-information-runtime.js';
import { immutable, ProviderFailure, GenerationError, checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { assertTaskValue } from '../../../public/shared/native-task-contract.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument } from '../repositories/common.js';
import { createTaskWorld } from '../task-authority.js';
import { createGameLlmRuntime } from '../../../public/scripts/native/experience/llm/runtime.js';
import { assertTurnEnvelope } from '../../../public/shared/native-message-contract.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };

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
    const messageIds = new Set((snapshot.timeline || []).map(item => String(item.messageId || '')));
    return value.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)
            || Object.keys(raw).some(key => !['memoryId', 'content', 'sourceRefs', 'tokenCount', 'source'].includes(key))) {
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
        return { memoryId, content, sourceRefs,
            ...(Number.isFinite(tokenCount) && tokenCount >= 0 && tokenCount <= 32768 ? { tokenCount: Math.floor(tokenCount) } : {}) };
    });
}
const ROLES = new Set(['narrator', 'intent_resolver', 'event_interpreter', 'orchestrator', 'studio', 'memory', 'search']);

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


function requiredTurnRoles(manifest, entryPoint) {
    const turn = manifest.runtime?.experienceContract?.taskRuntime?.turn;
    if (!turn) return [];
    const roles = turn.narratorTaskId ? [] : ['narrator'];
    const hasLogic = entryPoint ? (entryPoint.runtime?.game?.logic ?? manifest.runtime?.game?.logic)
        : manifest.runtime?.game?.logic || manifest.entryPoints?.some(entry => entry.runtime?.game?.logic);
    if (turn.policy === 'authority-first' && hasLogic) roles.push('intent_resolver');
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
    constructor({ persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort, skillRepository, extensions }) {
        Object.assign(this, { persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort, skillRepository, extensions });
    }

    get authoritySelections() { return authoritySelectionCache(this.sessionCore); }

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

    async executeTurn(handle, input, signal, onChunk, { transaction = null } = {}) {
        input = immutable(input);
        transaction = transaction ? immutable(authorityValue(transaction)) : null;
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.invocationId)
            || Object.keys(input).some(key => !['sessionId', 'revisionId', 'invocationId', 'requestId', 'userInput', 'stageInputs', 'variants', 'slotBindings', 'routeRef', 'hostMemoryEvidence'].includes(key))) fail('native_turn_request_invalid');
        const { requestId: _requestId, ...turnRequest } = input;
        const requestHash = hashNativeDocument(transaction ? { ...turnRequest, transaction } : turnRequest);
        const base = await this.sessionCore.load(handle, input.sessionId);
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
        const routes = await this.persistence.listRuntimeRoutes(handle);
        const lanes = [];
        if (!runtime.turn.narratorTaskId) lanes.push(selectNativeRuntimeRoute(routes, 'role.narrator', input.routeRef));
        if (!transaction && !(authority && base.timeline.at(-1)?.metadata?.atri_authority_retry) && runtime.turn.policy === 'authority-first' && (authority || input.userInput?.trim()) && (base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic)) lanes.push(selectNativeRuntimeRoute(routes, 'role.intent_resolver'));
        for (const id of [...runtime.turn.stages, runtime.turn.narratorTaskId, runtime.turn.interpreterTaskId].filter(Boolean)) {
            const task = runtime.tasks.find(item => item.id === id);
            const ref = input.slotBindings?.[task.bindingSlotId];
            const lane = ref?.scope === 'player' && routes.find(item => item.runtimeRouteId === ref.runtimeRouteId);
            if (!lane) fail('native_task_binding_missing');
            lanes.push(lane);
        }
        const lanePlan = { budgetContext: { snapshot: base, anchor: { branchId: base.revision.branchId, revisionId: base.revision.revisionId } }, memoryEvidence: normalizeHostMemoryEvidence(input.hostMemoryEvidence, base), transaction };
        const resources = (await Promise.all(lanes.map(lane => this.executionResources(handle, lane, input.sessionId, lanePlan)))).flat();
        let expectedRevisionId = input.revisionId;
        const operation = nativeTaskScheduler.submit({ owner: handle, kind: 'turn',
            timeoutMs: executionTimeout(lanePlan, base.manifest.runtime.experienceContract.generationBudget?.turnAttempts
                ?? Math.max(1, lanes.length) * (1 + Math.max(0, ...Object.values(lanePlan.routes).map(route => route.policy.maxFallbackAttempts)))),
            anchor: { sessionId: input.sessionId, branchId: base.revision.branchId, revisionId: input.revisionId },
            executionClass: 'turn_blocking', resources, key: input.sessionId + ':' + input.invocationId + ':turn', fingerprint: requestHash, retry: false, signal, onChunk,
            fresh: async () => (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId === expectedRevisionId,
            run: boundary => this.prepareTurn(handle, input, boundary.signal, boundary.onChunk, revisionId => { expectedRevisionId = revisionId; }, lanePlan),
            finalize: prepared => this.sessionCore.finalizeTurn(handle, input.sessionId, { ...prepared, requestHash }, { expectedRevisionId }),
        });
        try { onChunk?.({ operationId: operation.operationId, status: 'queued', provisional: true }); } catch { /* Observer only. */ }
        const result = await operation.result;
        if (authority) this.authoritySelections.delete(handle + ':' + base.session.sessionId + ':' + base.revision.branchId + ':' + base.revision.revisionId);
        this.queueSimulation(handle, result, input.slotBindings);
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
        const catalog = await authorityCatalog(base, installed);
        const typed = lanePlan.transaction;
        let player = null;
        if (typed) {
            const selection = authoritySelection(catalog, typed);
            const content = JSON.stringify({ verb: catalog.find(item => item.id === selection.transactionId).verb, input: selection.input });
            player = structuredClone(this.sessionCore._newEntry(base, { role: 'user', content,
                metadata: { atri_authority_input: selection } }));
            // Input and invocation key do not influence the mechanical RNG.
            const stable = hashNativeDocument({ sessionId: base.session.sessionId, branchId: base.revision.branchId,
                revisionId: base.revision.revisionId, transactionId: selection.transactionId });
            const messageId = createNativeId('message', () => stable.slice(0, 32));
            const variantId = createNativeId('variant', () => stable.slice(32));
            Object.assign(player.entry, { messageId, variantIds: [variantId], activeVariantId: variantId });
            Object.assign(player.variant, { messageId, variantId });
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
                if (retained) return authoritySelection(catalog, retained);
                if (typed) return authoritySelection(catalog, typed);
                // Branch Retry of a typed action retains its fixed authored input.
                const replay = base.timeline.at(-1).metadata?.atri_authority_retry;
                if (replay) {
                    const origin = await this.sessionCore.load(handle, base.session.sessionId, { revisionId: replay.revisionId });
                    const receipt = origin.states.atri_action_receipts?.receipts.find(item => item.source === 'frontend' && item.playerMessageId === replay.playerMessageId);
                    const player = origin.timeline.find(item => item.messageId === replay.playerMessageId);
                    if (!receipt || !player?.metadata?.atri_authority_input) fail('native_authority_retry_invalid');
                    return authoritySelection(catalog, player.metadata.atri_authority_input);
                }
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
            return await this.sessionCore.prepareAuthorityTurn(handle, base, selection, player);
        } catch (error) {
            // A rejected candidate has never reached narration or publication.
            // Release only this preparation pin; uncertain provider/finalization
            // failures still retain their original selection for exact retry.
            if (error?.code === 'AUTHORITY_PREPARATION_FAILED' && this.authoritySelections.get(key) === pinned) this.authoritySelections.delete(key);
            throw error;
        }
    }

    async prepareTurn(handle, input, signal, onChunk, onAnchor, lanePlan) {
        let base = await this.sessionCore.load(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const runtime = base.manifest.runtime.experienceContract.taskRuntime;
        let authorityTurn = null;
        if (hasAuthorityTransactions(base)) {
            authorityTurn = await this.prepareAuthoritySelection(handle, base, input, lanePlan, signal);
            base = authorityTurn.prepared.candidate;
            lanePlan = { ...lanePlan, authorityContext: { snapshot: base, receipt: authorityTurn.prepared.receipt, mode: 'narrator' } };
        } else if (runtime.turn.policy === 'authority-first' && input.userInput?.trim() && (base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic)) {
            const installed = await this.packageInstaller.open(handle, base.session.packageId, base.session.packageVersionId);
            const { world, candidate } = await createTaskWorld(base, { ...installed, entryPoint: base.entryPoint }, async (patch, revisionId) => {
                checkCancellation(signal);
                const next = await this.sessionCore.applyRuntimeCommit(handle, input.sessionId, { statePatch: patch }, { expectedRevisionId: revisionId });
                onAnchor(next.revision.revisionId);
                return next;
            });
            const llm = createGameLlmRuntime({ worldSession: world, generateTask: async request => {
                const result = await this.execute(handle, { sessionId: input.sessionId, revisionId: candidate.revision.revisionId,
                    role: 'intent_resolver', requestId: input.invocationId + ':intent', messages: request.taskMessages, tools: request.tools }, signal, undefined, { scheduled: true, lanePlan });
                return result.response;
            } });
            await llm.runFreeText({ userInput: input.userInput, requestOptions: { abortSignal: signal } });
            base = candidate;
            input = { ...input, revisionId: base.revision.revisionId };
        }
        const stages = [];
        const provenance = [];
        const invoke = async (id, payload, suffix) => {
            const task = runtime.tasks.find(item => item.id === id);
            const result = await this.executeTask(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
                taskId: id, variantId: input.variants?.[id] ?? task.variants[0].id, input: payload,
                slotBindings: input.slotBindings, invocationId: input.invocationId + ':' + suffix }, signal, undefined, { transient: true, scheduled: true, lanePlan });
            const { payload: _payload, execution: _execution, ...evidence } = result.record;
            provenance.push(evidence);
            return result;
        };
        for (const [index, id] of runtime.turn.stages.entries()) {
            const stage = await invoke(id, input.stageInputs?.[id] ?? {}, 'stage' + index);
            stages.push(stage.record.payload);
        }
        checkCancellation(signal);
        let draft;
        if (runtime.turn.narratorTaskId) {
            const result = await invoke(runtime.turn.narratorTaskId, { stages }, 'narrator');
            draft = typeof result.record.payload === 'string'
                ? { schemaVersion: 1, narrative: result.record.payload, outcomes: [], diagnostics: [] } : result.record.payload;
            draft = assertTurnEnvelope(draft);
            if (draft.outcomes.length) fail('native_narrator_outcome_denied');
            try { onChunk?.({ text: draft.narrative, delta: draft.narrative, provisional: true }); } catch { /* Observer only. */ }
        } else {
            const narration = await this.execute(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
                requestId: input.invocationId, role: 'narrator', routeRef: input.routeRef,
                messages: stages.length ? [{ role: 'user', content: JSON.stringify({ provisionalTurnContext: authorityTurn ? authorityValue(stages) : stages }) }] : [] }, signal, onChunk, { scheduled: true, lanePlan });
            provenance.push({ taskId: 'narrator', requestSnapshotHash: hashNativeDocument(narration.snapshot),
                deliveryReceipt: { kind: 'model_delivery', invocationId: input.invocationId, delivered: true } });
            draft = { schemaVersion: 1, narrative: narration.response.text, outcomes: [], diagnostics: [] };
        }
        const narrative = draft.narrative;
        if (typeof narrative !== 'string' || !narrative.trim()) fail('native_turn_empty_narrative');
        const outcomes = [];
        if (runtime.turn.policy === 'narrative-outcome') {
            const task = runtime.tasks.find(item => item.id === runtime.turn.interpreterTaskId);
            const interpreted = await invoke(task.id, { narrative, stages }, 'interpreter');
            outcomes.push({ requestId: task.interpretation.id, interpretation: interpreted.record.payload });
        }
        checkCancellation(signal);
        return { invocationId: input.invocationId, provenance, envelope: { ...draft, outcomes }, ...(authorityTurn ? { authorityProof: authorityTurn.proof } : {}) };
    }

    async preflightTurnRoutes(handle, opened, snapshot) {
        const checks = [];
        for (const role of requiredTurnRoles(opened.manifest, snapshot?.entryPoint)) {
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
                try {
                    for (const task of uses) for (const variantId of selected.get(task.id)) {
                        const variant = task.variants.find(item => item.id === variantId);
                        await this.execute(handle, { requestId: 'preflight:' + task.id, role: route.role.replace(/^role\./, ''),
                            routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId },
                            outputContract: { name: 'atria_task', schema: variant.outputSchema } }, undefined, undefined,
                        { taskPlan: { task, variant, slot, payload: null }, scheduled: true, preflight: true, preflightPackage: opened });
                    }
                } catch (cause) { error = cause.code || 'native_task_binding_route_invalid'; }
                choices.push({ runtimeRouteId: route.runtimeRouteId, displayName: route.displayName, compatible: !error, error });
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
            const result = await this.executeTask(handle, { sessionId: input.sessionId, revisionId: snapshot.revision.revisionId,
                invocationId: item.invocationId, taskId: item.taskId, variantId: item.variantId, input: item.input, slotBindings: input.slotBindings }, signal, undefined, { lifecycleInvocation: true });
            snapshot = result.snapshot; results.push(result.record);
        }
        return { snapshot, results };
    }

    async executeTask(handle, input, signal, onChunk, { transient = false, scheduled = false, lanePlan = null, lifecycleInvocation = false } = {}) {
        input = immutable(input);
        if (input.invocationId?.startsWith('lc:') && !lifecycleInvocation) fail('native_task_reserved_invocation');
        if (Object.keys(input).some(key => !['sessionId', 'revisionId', 'taskId', 'variantId', 'input', 'slotBindings', 'invocationId', 'requestId', 'fallbackMode'].includes(key))) fail('native_task_request_invalid');
        const snapshot = lanePlan?.authorityContext?.snapshot ?? await this.sessionCore.load(handle, input.sessionId);
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
        const anchor = { sessionId: input.sessionId, branchId: snapshot.revision.branchId, revisionId: input.revisionId };
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(input.invocationId)) fail('native_task_invocation_required');
        const fingerprint = hashNativeDocument({ task, variant, payload, anchor, routeRef, fallbackMode: input.fallbackMode ?? 'disabled' });
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
                || hashNativeDocument(intent.input) !== hashNativeDocument(payload)) fail('native_task_lifecycle_intent_required');
        }
        const captured = lanePlan ?? {};
        if (lifecycleInvocation && snapshot.manifest.runtime.experienceContract.generationBudget) {
            const intent = snapshot.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
            if (!intent?.simulation || intent.status !== 'pending' || intent.taskId !== task.id || intent.variantId !== variant.id
                || hashNativeDocument(intent.input) !== hashNativeDocument(payload)) fail('native_generation_budget_lane_denied');
            captured.budgetContext = { snapshot, background: true, anchor: { invocationId: intent.invocationId } };
        }
        const resources = lanePlan ? [] : await this.executionResources(handle, route, input.sessionId, captured);
        const work = { owner: handle, anchor, kind: ['background', 'maintenance'].includes(task.executionClass) ? 'auxiliary_task' : 'model_task', executionClass: task.executionClass,
            timeoutMs: executionTimeout(captured, captured.budgetContext?.background ? snapshot.manifest.runtime.experienceContract.generationBudget.backgroundAttempts : undefined),
            resources,
            key: input.sessionId + ':' + (task.queuePolicy === 'latest' ? anchor.branchId + ':' + task.id + ':' + variant.id : input.invocationId),
            supersede: task.queuePolicy === 'latest', fingerprint, signal, onChunk,
            fresh: async () => (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId === input.revisionId,
            run: boundary => this.execute(handle, { sessionId: input.sessionId, revisionId: input.revisionId,
                requestId: input.invocationId, role: route.role.replace(/^role\./, ''), routeRef,
                fallbackMode: input.fallbackMode ?? 'disabled',
                outputContract: { name: 'atria_task', schema: variant.outputSchema } }, boundary.signal, boundary.onChunk, { taskPlan, scheduled: true, lanePlan: captured }),
            finalize: async (result, deliveryReceipt) => {
                const payload = assertTaskValue(result.response.jsonData ?? result.response.json ?? JSON.parse(result.response.text), variant.outputSchema);
                const record = { invocationId: input.invocationId, taskId: task.id, variantId: variant.id, fingerprint, payload,
                    definitionHash: hashNativeDocument(task), contextHash: hashNativeDocument(result.snapshot.contextPlan),
                    requestSnapshotHash: hashNativeDocument(result.snapshot), rawResultHash: hashNativeDocument(result.response),
                    execution: result.snapshot.diagnostics?.effectiveConfig ?? null,
                    normalizedResultHash: hashNativeDocument(payload), promptProgramRef: result.snapshot.promptProgramRef,
                    generationProfileRef: result.snapshot.generationProfileRef, runtimeRouteId: result.snapshot.runtimeRouteId, deliveryReceipt };
                if (task.resultPolicy.sink === 'turn' || transient) return immutable({ record });
                const committed = await this.sessionCore.recordTaskResult(handle, input.sessionId, record, { expectedRevisionId: input.revisionId });
                return immutable({ record: committed.states.atri_task_results.records.at(-1), snapshot: committed });
            } };
        if (scheduled) {
            if (!transient) throw new TypeError('Only parent Turn may execute an inline Task');
            const result = await work.run({ signal, onChunk });
            checkCancellation(signal);
            return work.finalize(result, { kind: 'model_delivery', invocationId: input.invocationId, delivered: true });
        }
        const operation = nativeTaskScheduler.submit(work);
        try { onChunk?.({ operationId: operation.operationId, status: 'queued', provisional: true }); } catch { /* Observer only. */ }
        return operation.result;
    }

    async execute(handle, value, signal, onChunk, { preview = false, taskPlan = null, scheduled = false, lanePlan = null, preflight = false, preflightPackage = null, preflightSnapshot = null } = {}) {
        const input = immutable(value);
        if (!ROLES.has(input.role)) fail('native_generation_role_invalid');
        // The HTTP host currently owns player routes only. Never reinterpret an
        // explicit session/foreign scope or silently choose one of two contexts.
        if (input.sessionId && input.projectId) fail('native_generation_context_ambiguous');
        if (input.routeRef !== undefined && (!input.routeRef || typeof input.routeRef !== 'object' || Array.isArray(input.routeRef)
            || input.routeRef.scope !== 'player' || typeof input.routeRef.runtimeRouteId !== 'string'
            || Object.keys(input.routeRef).some(key => !['scope', 'runtimeRouteId'].includes(key)))) fail('native_generation_route_ref_invalid');
        const role = 'role.' + input.role;
        let snapshot; let project; let source; let runtime;
        if (input.sessionId) {
            snapshot = immutable((preflight ? preflightSnapshot : null) ?? lanePlan?.authorityContext?.snapshot ?? await this.sessionCore.load(handle, input.sessionId));
            if (snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
            if (!preflight && snapshot.externalEffects?.some(effect => effect.status === 'prepared')) fail('native_transfer_pending');
            source = { kind: 'session', sessionId: input.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
            runtime = snapshot.manifest.runtime;
        } else if (input.projectId) {
            project = immutable(await this.studio.getProject(handle, input.projectId));
            if (input.revision !== project.revision.revision) fail('native_generation_revision_conflict');
            source = { kind: 'studio', projectId: input.projectId, revision: input.revision };
            runtime = project.source.package.runtime;
            if (input.taskId) {
                const context = await this.agent.getContext(handle, input.projectId, input.taskId);
                if (context.task.baseRevision !== input.revision || ['review', 'blocked', 'conflict', 'taken_over', 'completed'].includes(context.task.status)) fail('native_generation_task_stopped');
                const allowed = new Set(context.tools.map(tool => tool.function.name).concat(['atri_agent_list_skills', 'atri_agent_read_skill', 'atri_agent_skill_files']));
                if ((input.tools || []).some(tool => !allowed.has(tool.function?.name))) fail('native_generation_tool_denied');
            }
        } else if (preflight && preflightPackage) {
            runtime = preflightPackage.manifest.runtime;
        } else fail('native_generation_context_required');
        const budget = runtime?.experienceContract?.generationBudget;
        if (snapshot && !preview && !preflight) {
            await this.sessionCore.runs.assert(handle, input.sessionId, 'generate');
            if (budget && !lanePlan?.budgetContext) fail('native_generation_budget_lane_denied');
        }
        const packageIdentity = snapshot?.session ?? preflightPackage?.manifest;
        const routeList = lanePlan ? Object.values(lanePlan.routes) : await this.persistence.listRuntimeRoutes(handle);
        let route = selectNativeRuntimeRoute(routeList, role, input.routeRef);
        if (!preview && !scheduled) {
            const captured = {};
            const resources = await this.executionResources(handle, route, input.sessionId, captured);
            return nativeTaskScheduler.submit({ owner: handle, anchor: source, executionClass: 'interactive', resources,
                timeoutMs: executionTimeout(captured),
                key: (input.sessionId ?? input.projectId) + ':' + role + ':' + input.requestId, fingerprint: hashNativeDocument(input), signal, onChunk,
                fresh: async () => input.sessionId ? (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId === input.revisionId
                    : (await this.studio.getProject(handle, input.projectId)).revision.revision === input.revision,
                run: boundary => this.execute(handle, input, boundary.signal, boundary.onChunk, { taskPlan, scheduled: true, lanePlan: captured }),
                finalize: async result => result }).result.catch(error => {
                if (error.code === 'operation_cancelled') fail('generation_cancelled');
                throw error;
            });
        }
        if (input.previewRefs && !preview) fail('native_generation_preview_only');
        if (input.previewRefs && (typeof input.previewRefs !== 'object' || Array.isArray(input.previewRefs)
            || Object.keys(input.previewRefs).some(key => !['promptProgramRef', 'generationProfileRef'].includes(key)))) fail('native_generation_preview_refs_invalid');
        if (preview && input.previewRefs) route = { ...route,
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
                if (!project || ref.projectId !== project.source.project.projectId) fail('native_generation_resource_owner');
                entries = project.source.resources;
            }
            const entry = (entries || []).find(item => {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                return identity.resourceId === ref.resourceId && identity.resourceType === ref.resourceType && identity.revision === ref.revision;
            });
            return entry && { snapshot: entry.resource, origin: ref.scope === 'project' ? { scope: 'project', projectId: ref.projectId } : entry.origin };
        };
        const persistence = Object.create(this.persistence);
        if (lanePlan) {
            persistence.getRuntimeRoute = async (_owner, id) => lanePlan.routes[id] ?? null;
            persistence.getConnectionProfile = async (_owner, id) => lanePlan.connections[id] ?? null;
            persistence.getModelProfile = async (_owner, id) => lanePlan.models[id] ?? null;
        }
        if (taskPlan) {
            const compose = lane => ({ ...lane, role, promptParameters: {},
                promptProgramRef: { ...taskPlan.variant.prompt, resourceType: 'core.prompt-program', scope: 'package', packageId: packageIdentity.packageId, packageVersionId: packageIdentity.packageVersionId },
                generationProfileRef: { ...taskPlan.variant.generation, resourceType: 'core.generation-profile', scope: 'package', packageId: packageIdentity.packageId, packageVersionId: packageIdentity.packageVersionId } });
            route = compose(route);
            persistence.getRuntimeRoute = async (owner, id) => compose(lanePlan ? lanePlan.routes[id] : await this.persistence.getRuntimeRoute(owner, id));
        }
        if (preview && input.previewRefs) persistence.getRuntimeRoute = async (owner, id) => id === route.runtimeRouteId ? route : this.persistence.getRuntimeRoute(owner, id);
        const resolver = new RouteResolver({ persistence, library: this.library, providers: this.providers, getScopedResource });
        if (preflight) return resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, role, requirements });
        if (snapshot) assertInformationActorAvailable(snapshot, lanePlan?.authorityContext ? undefined : taskPlan?.task.id);
        const authorityContext = lanePlan?.authorityContext;
        if (!authorityContext && informationDefinition(snapshot) && input.messages?.length) fail('native_information_unscoped_messages');
        const nativeContext = snapshot && authorityContext?.mode !== 'resolver' ? createNativeSessionContextAdapter({ readSnapshot: async () => ({ source, snapshot }),
            options: { informationTaskId: authorityContext ? undefined : taskPlan?.task.id, memoryEvidence: lanePlan?.memoryEvidence ?? [], authorityTurn: Boolean(authorityContext) } }) : null;
        const skills = !authorityContext && this.skillRepository && isNarrativeSkillInvocation(input.role, taskPlan, runtime)
            ? await prepareNarrativeSkills({ repository: this.skillRepository(handle), settings: (await this.extensions.settings(handle)).value,
                context: snapshot ? { packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId,
                    skillIds: snapshot.manifest.skills?.map(item => typeof item === 'string' ? item : item.skillId ?? item.id) }
                    : { projectId: input.projectId } }) : null;
        if (skills?.tools.length && input.tools?.length) fail('native_skill_tool_conflict');
        if (skills?.tools.length && !requirements.includes('generation.tools')) requirements.push('generation.tools');
        const skillTranscript = [];
        const contextProvider = { buildRequestContextPlan: async (request, resolved) => {
            const selected = nativeContext ? await nativeContext.buildRequestContextPlan(request, resolved) : {
                schemaVersion: 1, requestId: request.requestId, source, items: [], provenance: [],
                budget: { maxTokens: resolved.model.limits.contextTokens - resolved.model.limits.outputTokens, reservedOutputTokens: resolved.model.limits.outputTokens },
            };
            // A task/tool transcript follows the selected turn input. Do not
            // append the original user turn again after a tool result.
            const safeItems = authorityContext ? selected.items.filter(item => item.id.startsWith('projection:') || item.kind === 'context.history' || item.kind === 'context.input'
                || (informationDefinition(snapshot) && (item.id.startsWith('knowledge:') || item.id.startsWith('memory:')))) : selected.items;
            const exposed = taskPlan ? safeItems.filter(item => {
                const context = taskPlan.task.context;
                if (item.id.startsWith('projection:')) return context.includes('projection');
                if (item.id.startsWith('memory:')) return true;
                return item.kind === 'context.history' ? context.includes('history')
                    : item.id.startsWith('knowledge:') ? context.includes('knowledge')
                        : item.id === 'state:atri_world_state' && context.includes('world');
            }) : safeItems;
            const items = exposed.map(item => (input.messages?.length || skillTranscript.length) && item.kind === 'context.input'
                ? { ...item, kind: 'context.history', content: { role: 'user', content: item.content } } : item);
            // Host-owned task dialogue is supplemental context, never a second fact scan.
            for (const [index, message] of (input.messages || []).entries()) {
                items.push({ kind: 'context.history', id: 'task-message-' + index, content: message, provenance: [{ source: 'host.task' }] });
            }
            if (taskPlan?.task.context.includes('input')) items.push({ kind: skillTranscript.length ? 'context.history' : 'context.input', id: 'task-input',
                content: skillTranscript.length ? { role: 'user', content: JSON.stringify(taskPlan.payload) } : JSON.stringify(taskPlan.payload), provenance: [{ source: 'host.task' }] });
            if (authorityContext) {
                const payload = authorityContext.mode === 'resolver' ? authorityContext.payload
                    : { instruction: 'Narrate only the frozen authority result. You have no mechanical write authority.', receipt: authorityContext.receipt };
                items.push({ kind: 'context.input', id: 'authority-turn', content: JSON.stringify(authorityValue(payload)), provenance: [{ source: 'host.authority' }] });
                authorityValue(items);
            }
            items.push(...(skills?.items ?? []));
            for (const [index, message] of skillTranscript.entries()) items.push({ kind: 'context.history', id: 'skill-message-' + index,
                content: message, provenance: [{ source: 'host.skills' }] });
            return { ...selected, items };
        } };
        if (input.prompt?.host !== undefined) fail('native_generation_host_readonly');
        const hostView = { role, sourceKind: source.kind, sessionId: source.sessionId || '', branchId: source.branchId || '',
            revisionId: source.revisionId || '', projectId: source.projectId || '', projectRevision: source.revision || '' };
        const compiler = new PromptCompiler({ hostDefinitions: Object.fromEntries(Object.keys(hostView).map(key => [key, { type: 'string', required: true }])) });
        const attempts = [];
        const service = new GenerationService({ resolver, contextProvider, preparePrompt: compiler.preparePrompt, secretPort: this.secretPort,
            providerFor: (id, resolved) => {
                const provider = resolver.provider(id);
                return { ...provider, send: async (rendered, boundary) => {
                    // Role-host retries stay inside this route's send/timeout boundary.
                    // Only after they are exhausted may Core resolve a complete fallback.
                    for (let retry = 0; ; retry++) {
                        checkCancellation(boundary.signal);
                        const attempt = { runtimeRouteId: resolved.route.runtimeRouteId, retry, status: 'pending' };
                        attempts.push(attempt);
                        try {
                            if (budget) {
                                const context = lanePlan.budgetContext;
                                try { await this.sessionCore.runs.charge(handle, context.snapshot, { anchor: context.anchor, role: input.role, background: context.background === true }, budget); } catch (error) {
                                    if (['native_generation_budget_exhausted', 'native_generation_background_not_due', 'native_generation_budget_lane_denied'].includes(error.code)) throw new GenerationError(error.code);
                                    throw error;
                                }
                            }
                            const response = await provider.send(rendered, boundary);
                            attempt.status = 'success';
                            return response;
                        } catch (error) {
                            attempt.status = 'failed';
                            if (!(error instanceof ProviderFailure) || error.kind === 'application' || retry >= resolved.route.policy.maxRetries || boundary.signal.aborted) throw error;
                        }
                    }
                } };
            } });
        const request = { requestId: input.requestId, role, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId },
            handle, signal, onChunk: skills?.tools.length ? undefined : onChunk, requirements, tools: skills?.tools.length ? skills.tools : input.tools || [], outputContract: input.outputContract ?? null,
            prompt: { ...input.prompt, host: hostView }, fallbackMode: input.fallbackMode ?? 'disabled', unknownCapabilityOverrides: input.unknownCapabilityOverrides || [] };
        const result = skills?.tools.length && !preview ? await runNarrativeSkillLoop({
            execute: () => service.execute(request), skills, transcript: skillTranscript, signal, onChunk,
            fresh: async () => {
                const current = snapshot ? (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId
                    : (await this.studio.getProject(handle, input.projectId)).revision.revision;
                if (current !== (snapshot ? input.revisionId : input.revision)) fail('native_generation_revision_conflict');
            },
        }) : await service.execute(request, { preview });
        if (authorityContext?.mode === 'narrator' && (result.response.toolCalls?.length || result.response.tool_calls?.length)) fail('native_narrator_outcome_denied');
        return immutable({ ...result, routing: { fallbackUsed: result.snapshot.runtimeRouteId !== route.runtimeRouteId, attempts } });
    }
}
