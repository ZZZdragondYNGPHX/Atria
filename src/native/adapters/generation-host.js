import { GenerationService } from '../model-prompt-runtime/generation-service.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../model-prompt-runtime/prompt-compiler.js';
import { createNativeSessionContextAdapter } from './native-session-context.js';
import { immutable, ProviderFailure, checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const ROLES = new Set(['narrator', 'intent_resolver', 'event_interpreter', 'orchestrator', 'studio', 'memory', 'search']);

// A host composition over existing P1 storage and Native Session/Studio authorities.
export class NativeGenerationHost {
    constructor({ persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort }) {
        Object.assign(this, { persistence, library, sessionCore, packageInstaller, studio, agent, providers, secretPort });
    }

    async execute(handle, value, signal, onChunk, { preview = false } = {}) {
        const input = immutable(value);
        if (!ROLES.has(input.role)) fail('native_generation_role_invalid');
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
        const routeList = await this.persistence.listRuntimeRoutes(handle);
        let route = input.routeRef ? routeList.find(item => item.runtimeRouteId === input.routeRef.runtimeRouteId && item.role === role) : null;
        if (!input.routeRef) {
            const fallbacks = new Set(routeList.flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
            const matches = routeList.filter(item => item.role === role && !fallbacks.has(item.runtimeRouteId));
            if (matches.length !== 1) fail(matches.length ? 'native_generation_route_ambiguous' : 'native_generation_route_missing');
            route = matches[0];
        }
        if (!route) fail('native_generation_route_missing');
        if (input.previewRefs && !preview) fail('native_generation_preview_only');
        if (input.previewRefs && (typeof input.previewRefs !== 'object' || Array.isArray(input.previewRefs)
            || Object.keys(input.previewRefs).some(key => !['promptProgramRef', 'generationProfileRef'].includes(key)))) fail('native_generation_preview_refs_invalid');
        if (preview && input.previewRefs) route = { ...route,
            ...(input.previewRefs.promptProgramRef ? { promptProgramRef: input.previewRefs.promptProgramRef } : {}),
            ...(input.previewRefs.generationProfileRef ? { generationProfileRef: input.previewRefs.generationProfileRef } : {}),
        };
        const requirements = [...new Set([
            ...(runtime?.modelPrompt?.roles.find(item => item.role === role)?.requiredCapabilities || []),
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
            const items = selected.items.map(item => input.messages?.length && item.kind === 'context.input'
                ? { ...item, kind: 'context.history', content: { role: 'user', content: item.content } } : item);
            // Host-owned task dialogue is supplemental context, never a second fact scan.
            for (const [index, message] of (input.messages || []).entries()) {
                items.push({ kind: 'context.history', id: 'task-message-' + index, content: message, provenance: [{ source: 'host.task' }] });
            }
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
