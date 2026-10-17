import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { GenerationError } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { prepareExecutionPlan } from '../model-prompt-runtime/execution-evidence.js';

const configuration = resolved => hashNativeDocument({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

/** Resolve the original Runtime's failure graph inside this node's frozen pins. */
export async function resolveModelFailurePlan({ handle, node, dependencyPins, resolver, routeRef, role, requirements = [] }) {
    const pins = dependencyPins.filter(pin => pin.port === 'model' && node.dependencyPinIds.includes(pin.pinId));
    const pending = [routeRef], routes = [], visited = new Set();
    let required = [...requirements];
    let primary;
    while (pending.length) {
        const ref = pending.shift(), key = hashNativeDocument(ref);
        if (visited.has(key)) continue;
        visited.add(key);
        const pin = pins.find(pin => hashNativeDocument(pin.resourceRef) === key);
        if (!pin) throw new GenerationError('generation_fallback_route_unpinned');
        const resolved = await resolver.resolve({ handle, routeRef: ref, role, requirements: required });
        required = [...new Set([...required, ...resolved.requirements])];
        if (hashNativeDocument(resolved.route) !== pin.integrity) throw new GenerationError('generation_fallback_route_stale');
        primary ??= resolved;
        if (hashNativeDocument(resolved.route.promptProgramRef) !== hashNativeDocument(primary.route.promptProgramRef))
            throw new GenerationError('generation_semantic_authority_changed');
        if (hashNativeDocument(resolved.connection.networkPolicy) !== hashNativeDocument(primary.connection.networkPolicy))
            throw new GenerationError('generation_target_policy_denied');
        prepareExecutionPlan(resolved, primary.route.executionPolicy, resolver.provider(resolved.connection.providerAdapter));
        assertComputeBudget(resolved.route.executionPolicy.computeBudget);
        routes.push({ routeRef: ref, configDigest: configuration(resolved) });
        pending.push(...resolved.route.fallbackRouteRefs);
    }
    return { routes, configDigest: routes.length === 1 ? configuration(primary) : hashNativeDocument(routes) };
}

const RUNTIME_PRINCIPALS = Object.freeze({
    'role.narrator': 'original_native_narrator_required',
    'role.intent_resolver': 'original_native_intent_resolver_required',
    'role.studio': 'original_native_project_executor_required',
});

/** Pure mechanism evidence. Publication is never a Session/Actor send grant. */
export async function validateModelCapability({ handle, definition, dependencyPins, resolver }) {
    const evidence = [], issues = [], fieldPath = 'capabilityCeiling.generation.send';
    const unavailable = () => issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath });
    if (!(resolver instanceof RouteResolver)) { unavailable(); return { evidence, issues }; }
    const nodes = definition.nodes.filter(node => node.capabilities.includes('generation.send'));
    if (!nodes.length) { unavailable(); return { evidence, issues }; }
    for (const node of nodes) {
        // The original pinned route supplies this finite mechanism's role.
        // Publication never supplies the corresponding fixed runtime producer.
        const pin = dependencyPins.find(pin => pin.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
        const control = ['planner', 'judge', 'review'].includes(node.kind);
        if (!['agent', 'planner', 'judge', 'review'].includes(node.kind) || pin?.port !== 'model' || pin.resourceRef.scope !== 'player') { unavailable(); continue; }
        if (control && (node.outputs.length !== 1 || node.outputs[0].type !== 'json')) {
            issues.push({ code: 'native_orchestration_control_output_required', severity: 'blocking', fieldPath: 'definition.nodes.' + node.nodeId + '.outputs' });
            continue;
        }
        try {
            const route = await resolver.persistence.getRuntimeRoute(handle, pin.resourceRef.runtimeRouteId);
            if (!Object.hasOwn(RUNTIME_PRINCIPALS, route?.role)) { unavailable(); continue; }
            const resolved = await resolver.resolve({ handle, routeRef: pin.resourceRef, role: route.role,
                requirements: [...['role.intent_resolver', 'role.studio'].includes(route.role) ? ['generation.tools'] : [],
                    ...control ? ['generation.structured-output'] : []] });
            if (hashNativeDocument(resolved.route) !== pin.integrity) {
                issues.push({ code: 'native_orchestration_dependency_stale', severity: 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
                continue;
            }
            if (!resolved.route.executionPolicy?.computeBudget) { unavailable(); continue; }
            assertComputeBudget(resolved.route.executionPolicy.computeBudget);
            const failure = await resolveModelFailurePlan({ handle, node, dependencyPins, resolver, routeRef: pin.resourceRef, role: route.role,
                requirements: [...['role.intent_resolver', 'role.studio'].includes(route.role) ? ['generation.tools'] : [],
                    ...control ? ['generation.structured-output'] : []] });
            // No network, Secret read, render, bank admission or runtime grant.
            evidence.push({ capability: 'generation.send', nodeId: node.nodeId, pinId: pin.pinId,
                authority: 'native_route_resolver', routeIntegrity: pin.integrity, pathFingerprint: resolved.pathFingerprint,
                resourceDigest: hashNativeDocument(resolved.resources), capabilityDigest: hashNativeDocument(resolved.capabilities),
                failurePlanDigest: failure.configDigest,
                runtimePrincipal: RUNTIME_PRINCIPALS[resolved.route.role], ...(control ? { nodeKind: node.kind, controlPrincipal: 'original_native_graph_producer_required' } : {}) });
        } catch (error) {
            if (!(error instanceof GenerationError) && !(error instanceof TypeError) && error.name !== 'NotFoundError') throw error;
            const unknown = ['generation_provider_unavailable', 'generation_capability_unknown'].includes(error.code);
            issues.push({ code: unknown ? 'native_orchestration_capability_authority_unavailable' : 'native_orchestration_dependency_invalid',
                severity: unknown ? 'unknown' : 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
        }
    }
    return { evidence, issues };
}
