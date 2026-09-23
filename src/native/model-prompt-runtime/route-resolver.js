import {
    assertCapabilityDecision, assertConnectionProfile, assertExactResourceRef,
    assertModelProfile, assertRuntimeRoute,
} from './contracts.js';
import { assertProviderPort } from './ports.js';
import {
    assertVersionedModelPromptResource, collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceIdentity,
} from './resources.js';
import { GenerationError, immutable } from './execution-utils.js';

// Read-through ports over P1 authorities; this resolver owns no persistence/cache.
export class RouteResolver {
    constructor({ persistence, library, providers, getScopedResource, getSessionRoute }) {
        this.persistence = persistence;
        this.library = library;
        this.providers = new Map(Object.entries(providers).map(([id, port]) => [id, assertProviderPort(port)]));
        this.getScopedResource = getScopedResource;
        this.getSessionRoute = getSessionRoute;
    }

    provider(id) {
        const port = this.providers.get(id);
        if (!port) throw new GenerationError('generation_provider_unavailable');
        return port;
    }

    async resolve({ handle, routeRef, role, requirements = [], unknownCapabilityOverrides = [] }) {
        const input = immutable({ routeRef, role, requirements, unknownCapabilityOverrides });
        const raw = input.routeRef.scope === 'player'
            ? await this.persistence.getRuntimeRoute(handle, input.routeRef.runtimeRouteId)
            : await this.getSessionRoute?.(handle, input.routeRef);
        const route = assertRuntimeRoute(raw);
        if (route.runtimeRouteId !== input.routeRef.runtimeRouteId || route.scope !== input.routeRef.scope
            || route.sessionId !== input.routeRef.sessionId || route.role !== input.role) {
            throw new GenerationError('generation_route_mismatch');
        }
        const model = assertModelProfile(await this.persistence.getModelProfile(handle, route.modelProfileRef.modelProfileId));
        const connection = assertConnectionProfile(await this.persistence.getConnectionProfile(handle, route.connectionProfileRef.connectionProfileId));
        const endpoint = new URL(connection.endpoint);
        if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
            throw new GenerationError('generation_endpoint_credentials_disallowed');
        }
        if (model.modelProfileId !== route.modelProfileRef.modelProfileId
            || connection.connectionProfileId !== route.connectionProfileRef.connectionProfileId
            || model.connectionProfileRef.connectionProfileId !== connection.connectionProfileId) {
            throw new GenerationError('generation_profile_mismatch');
        }
        const resources = [];
        const visited = new Map();
        const active = new Set();
        const read = async value => {
            const ref = assertExactResourceRef(value);
            const key = JSON.stringify(ref);
            if (active.has(key)) throw new GenerationError('generation_resource_cycle');
            if (visited.has(key)) return visited.get(key);
            if (resources.length >= 1024) throw new GenerationError('generation_resource_limit');
            active.add(key);
            const envelope = ref.scope === 'library'
                ? await this.library.getExact(handle, ref)
                : await this.getScopedResource?.(handle, ref);
            if (!envelope || envelope.origin?.scope !== ref.scope
                || ['projectId', 'packageId', 'packageVersionId'].some(k => envelope.origin[k] !== ref[k])) {
                throw new GenerationError('generation_resource_origin_mismatch');
            }
            const resource = assertVersionedModelPromptResource(ref.resourceType, envelope.snapshot);
            const identity = getVersionedModelPromptResourceIdentity(ref.resourceType, resource);
            if (identity.resourceId !== ref.resourceId || identity.revision !== ref.revision) {
                throw new GenerationError('generation_exact_resource_mismatch');
            }
            resources.push({ ref, resource, origin: envelope.origin });
            for (const dependency of collectVersionedModelPromptResourceRefs(ref.resourceType, resource)) await read(dependency);
            active.delete(key);
            visited.set(key, resource);
            return resource;
        };
        const generation = await read(route.generationProfileRef);
        const prompt = await read(route.promptProgramRef);
        const config = immutable({ route, connection, model, generation, prompt, resources });
        const discovered = await this.provider(connection.providerAdapter).resolveCapabilities(config);
        const decisions = new Map();
        for (const item of [...model.capabilities, ...discovered]) {
            const decision = assertCapabilityDecision(item);
            const previous = decisions.get(decision.capability);
            const states = [previous?.state, decision.state];
            decisions.set(decision.capability, {
                ...decision,
                state: states.includes('unsupported') ? 'unsupported'
                    : states.includes('supported') ? 'supported' : 'unknown',
                provenance: [...(previous?.provenance || []), ...decision.provenance],
            });
        }
        const required = [...new Set([
            ...route.requirements, ...input.requirements,
            ...(generation.streaming.enabled === true ? ['generation.streaming'] : []),
            ...(Object.keys(generation.reasoning).length ? ['generation.reasoning'] : []),
            ...(Object.keys(generation.toolChoice).length ? ['generation.tools'] : []),
        ])].sort();
        for (const capability of required) {
            const decision = { ...(decisions.get(capability) || assertCapabilityDecision({
                capability, state: 'unknown',
                provenance: [{ kind: 'adapter-metadata', source: 'No capability evidence' }],
            })) };
            if (decision.state === 'unsupported') throw new GenerationError('generation_capability_unsupported');
            if (decision.state === 'unknown') {
                if (!input.unknownCapabilityOverrides.includes(capability)) throw new GenerationError('generation_capability_unknown');
                decision.provenance = [...decision.provenance, { kind: 'user-override', source: 'Explicit request unknown-capability override' }];
            }
            decisions.set(capability, decision);
        }
        return immutable({ ...config, requirements: required, capabilities: [...decisions.values()].sort((a, b) => a.capability.localeCompare(b.capability)) });
    }
}
