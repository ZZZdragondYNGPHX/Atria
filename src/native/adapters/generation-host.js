import { GenerationService } from '../model-prompt-runtime/generation-service.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../model-prompt-runtime/prompt-compiler.js';
import { createNativeSessionContextAdapter } from './native-session-context.js';
import { immutable, ProviderFailure, checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { assertTaskValue } from '../../../public/shared/native-task-contract.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument } from '../repositories/common.js';
import { createTaskWorld } from '../task-authority.js';
import { createGameLlmRuntime } from '../../../public/scripts/native/experience/llm/runtime.js';
import { assertTurnEnvelope } from '../../../public/shared/native-message-contract.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
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

// A host composition over existing P1 storage and Native Session/Studio authorities.
export class NativeGenerationHost {
    constructor({ persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort }) {
        Object.assign(this, { persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort });
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

    async executeTurn(handle, input, signal, onChunk) {
        input = immutable(input);
        if (typeof input.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.invocationId)
            || Object.keys(input).some(key => !['sessionId', 'revisionId', 'invocationId', 'requestId', 'userInput', 'stageInputs', 'variants', 'slotBindings', 'routeRef'].includes(key))) fail('native_turn_request_invalid');
        const { requestId: _requestId, ...turnRequest } = input;
        const requestHash = hashNativeDocument(turnRequest);
        const base = await this.sessionCore.load(handle, input.sessionId);
        const previous = base.states.atri_task_results?.records.find(item => item.invocationId === input.invocationId);
        if (previous) {
            if (previous.requestHash !== requestHash || previous.kind !== 'turn') fail('native_turn_invocation_conflict');
            return base;
        }
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const runtime = base.manifest.runtime?.experienceContract?.taskRuntime;
        if (!runtime?.turn) fail('native_turn_contract_required');
        const routes = await this.persistence.listRuntimeRoutes(handle);
        const lanes = [];
        if (!runtime.turn.narratorTaskId) lanes.push(selectNativeRuntimeRoute(routes, 'role.narrator', input.routeRef));
        if (runtime.turn.policy === 'authority-first' && input.userInput?.trim() && (base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic)) lanes.push(selectNativeRuntimeRoute(routes, 'role.intent_resolver'));
        for (const id of [...runtime.turn.stages, runtime.turn.narratorTaskId, runtime.turn.interpreterTaskId].filter(Boolean)) {
            const task = runtime.tasks.find(item => item.id === id);
            const ref = input.slotBindings?.[task.bindingSlotId];
            const lane = ref?.scope === 'player' && routes.find(item => item.runtimeRouteId === ref.runtimeRouteId);
            if (!lane) fail('native_task_binding_missing');
            lanes.push(lane);
        }
        const lanePlan = {};
        const resources = (await Promise.all(lanes.map(lane => this.executionResources(handle, lane, input.sessionId, lanePlan)))).flat();
        let expectedRevisionId = input.revisionId;
        const operation = nativeTaskScheduler.submit({ owner: handle, kind: 'turn',
            anchor: { sessionId: input.sessionId, branchId: base.revision.branchId, revisionId: input.revisionId },
            executionClass: 'turn_blocking', resources, key: input.sessionId + ':' + input.invocationId + ':turn', fingerprint: requestHash, retry: false, signal, onChunk,
            fresh: async () => (await this.sessionCore.load(handle, input.sessionId)).revision.revisionId === expectedRevisionId,
            run: boundary => this.prepareTurn(handle, input, boundary.signal, boundary.onChunk, revisionId => { expectedRevisionId = revisionId; }, lanePlan),
            finalize: prepared => this.sessionCore.finalizeTurn(handle, input.sessionId, { ...prepared, requestHash }, { expectedRevisionId }),
        });
        try { onChunk?.({ operationId: operation.operationId, status: 'queued', provisional: true }); } catch { /* Observer only. */ }
        return operation.result;
    }

    async prepareTurn(handle, input, signal, onChunk, onAnchor, lanePlan) {
        let base = await this.sessionCore.load(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const runtime = base.manifest.runtime.experienceContract.taskRuntime;
        if (runtime.turn.policy === 'authority-first' && input.userInput?.trim() && (base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic)) {
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
                messages: stages.length ? [{ role: 'user', content: JSON.stringify({ provisionalTurnContext: stages }) }] : [] }, signal, onChunk, { scheduled: true, lanePlan });
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
        return { invocationId: input.invocationId, provenance, envelope: { ...draft, outcomes } };
    }

    async executeTask(handle, input, signal, onChunk, { transient = false, scheduled = false, lanePlan = null } = {}) {
        input = immutable(input);
        if (Object.keys(input).some(key => !['sessionId', 'revisionId', 'taskId', 'variantId', 'input', 'slotBindings', 'invocationId', 'requestId', 'fallbackMode'].includes(key))) fail('native_task_request_invalid');
        const snapshot = await this.sessionCore.load(handle, input.sessionId);
        const task = snapshot.manifest.runtime?.experienceContract?.taskRuntime?.tasks.find(item => item.id === input.taskId);
        const variant = task?.variants.find(item => item.id === input.variantId);
        if (!variant) fail('native_task_variant_missing');
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
        const existing = snapshot.states.atri_task_results?.records.find(item => item.invocationId === input.invocationId);
        if (existing) {
            if (existing.fingerprint !== fingerprint) fail('native_task_invocation_conflict');
            return { record: existing, snapshot };
        }
        if (snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
        const captured = lanePlan ?? {};
        const resources = lanePlan ? [] : await this.executionResources(handle, route, input.sessionId, captured);
        const work = { owner: handle, anchor, kind: ['background', 'maintenance'].includes(task.executionClass) ? 'auxiliary_task' : 'model_task', executionClass: task.executionClass,
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

    async execute(handle, value, signal, onChunk, { preview = false, taskPlan = null, scheduled = false, lanePlan = null } = {}) {
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
            snapshot = immutable(await this.sessionCore.load(handle, input.sessionId));
            if (snapshot.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
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
                const allowed = new Set(context.tools.map(tool => tool.function.name).concat(['atri_agent_list_skills', 'atri_agent_read_skill']));
                if ((input.tools || []).some(tool => !allowed.has(tool.function?.name))) fail('native_generation_tool_denied');
            }
        } else fail('native_generation_context_required');
        const routeList = lanePlan ? Object.values(lanePlan.routes) : await this.persistence.listRuntimeRoutes(handle);
        let route = selectNativeRuntimeRoute(routeList, role, input.routeRef);
        if (!preview && !scheduled) {
            const captured = {};
            const resources = await this.executionResources(handle, route, input.sessionId, captured);
            return nativeTaskScheduler.submit({ owner: handle, anchor: source, executionClass: 'interactive', resources,
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
                if (!snapshot || ref.packageId !== snapshot.session.packageId || ref.packageVersionId !== snapshot.session.packageVersionId) fail('native_generation_resource_owner');
                const opened = await this.packageInstaller.open(owner, ref.packageId, ref.packageVersionId);
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
                promptProgramRef: { ...taskPlan.variant.prompt, resourceType: 'core.prompt-program', scope: 'package', packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId },
                generationProfileRef: { ...taskPlan.variant.generation, resourceType: 'core.generation-profile', scope: 'package', packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId } });
            route = compose(route);
            persistence.getRuntimeRoute = async (owner, id) => compose(lanePlan ? lanePlan.routes[id] : await this.persistence.getRuntimeRoute(owner, id));
        }
        if (preview && input.previewRefs) persistence.getRuntimeRoute = async (owner, id) => id === route.runtimeRouteId ? route : this.persistence.getRuntimeRoute(owner, id);
        const resolver = new RouteResolver({ persistence, library: this.library, providers: this.providers, getScopedResource });
        const nativeContext = snapshot ? createNativeSessionContextAdapter({ readSnapshot: async () => ({ source, snapshot }) }) : null;
        const contextProvider = { buildRequestContextPlan: async (request, resolved) => {
            const selected = nativeContext ? await nativeContext.buildRequestContextPlan(request, resolved) : {
                schemaVersion: 1, requestId: request.requestId, source, items: [], provenance: [],
                budget: { maxTokens: resolved.model.limits.contextTokens - resolved.model.limits.outputTokens, reservedOutputTokens: resolved.model.limits.outputTokens },
            };
            // A task/tool transcript follows the selected turn input. Do not
            // append the original user turn again after a tool result.
            const exposed = taskPlan ? selected.items.filter(item => {
                const context = taskPlan.task.context;
                return item.kind === 'context.history' ? context.includes('history')
                    : item.id.startsWith('knowledge:') ? context.includes('knowledge')
                        : item.id === 'state:atri_world_state' && context.includes('world');
            }) : selected.items;
            const items = exposed.map(item => input.messages?.length && item.kind === 'context.input'
                ? { ...item, kind: 'context.history', content: { role: 'user', content: item.content } } : item);
            // Host-owned task dialogue is supplemental context, never a second fact scan.
            for (const [index, message] of (input.messages || []).entries()) {
                items.push({ kind: 'context.history', id: 'task-message-' + index, content: message, provenance: [{ source: 'host.task' }] });
            }
            if (taskPlan?.task.context.includes('input')) items.push({ kind: 'context.input', id: 'task-input', content: JSON.stringify(taskPlan.payload), provenance: [{ source: 'host.task' }] });
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
            handle, signal, onChunk, requirements, tools: input.tools || [], outputContract: input.outputContract ?? null,
            prompt: { ...input.prompt, host: hostView }, fallbackMode: input.fallbackMode ?? 'disabled', unknownCapabilityOverrides: input.unknownCapabilityOverrides || [] };
        const result = await service.execute(request, { preview });
        return immutable({ ...result, routing: { fallbackUsed: result.snapshot.runtimeRouteId !== route.runtimeRouteId, attempts } });
    }
}
