import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { GenerationError } from '../model-prompt-runtime/execution-utils.js';
import { equalNativeDocuments, hashNativeDocument } from '../repositories/common.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { prepareExecutionPlan } from '../model-prompt-runtime/execution-evidence.js';
import { isProjectDelegatedControlPlan } from './project-delegated-graph-profile.js';

const configuration = resolved => hashNativeDocument({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

/** Resolve the original Runtime's failure graph inside this node's frozen pins. */
export async function resolveModelFailurePlan({ handle, node, dependencyPins, resolver, routeRef, role, requirements = [] }) {
    return readModelFailurePlan({ handle, node, dependencyPins, resolver, routeRef, role, requirements });
}

// A primary resolved immediately before this call belongs to this validation
// only. Fallbacks still resolve independently, and each later authority check
// starts with a fresh resolver read.
async function readModelFailurePlan({ handle, node, dependencyPins, resolver, routeRef, role, requirements = [] }, freshPrimary = null) {
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
        const resolved = !routes.length && freshPrimary ? freshPrimary
            : await resolver.resolve({ handle, routeRef: ref, role, requirements: required });
        required = [...new Set([...required, ...resolved.requirements])];
        if (hashNativeDocument(resolved.route) !== pin.integrity) throw new GenerationError('generation_fallback_route_stale');
        primary ??= resolved;
        if (!equalNativeDocuments(resolved.route.promptProgramRef, primary.route.promptProgramRef))
            throw new GenerationError('generation_semantic_authority_changed');
        if (!equalNativeDocuments(resolved.connection.networkPolicy, primary.connection.networkPolicy))
            throw new GenerationError('generation_target_policy_denied');
        prepareExecutionPlan(resolved, primary.route.executionPolicy, resolver.provider(resolved.connection.providerAdapter));
        assertComputeBudget(resolved.route.executionPolicy.computeBudget);
        routes.push({ routeRef: ref, configDigest: configuration(resolved) });
        pending.push(...resolved.route.fallbackRouteRefs);
    }
    return { routes, configDigest: routes.length === 1 ? routes[0].configDigest : hashNativeDocument(routes) };
}

const RUNTIME_PRINCIPALS = Object.freeze({
    'role.narrator': 'original_native_narrator_required',
    'role.intent_resolver': 'original_native_intent_resolver_required',
    'role.studio': 'original_native_project_executor_required',
});

/** Pure mechanism evidence. Publication is never a Session/Actor send grant. */
export async function validateModelCapability({ handle, definition, dependencyPins, resolver }) {
    const { evidence, issues } = await inspectModelCapabilities({ handle, definition, dependencyPins, resolver });
    return { evidence, issues };
}

/** Internal same-invocation resolver facts, never a send/Source/bank grant.
 * Publication continues to expose only the original mechanism evidence. */
export async function inspectModelCapabilities({ handle, definition, dependencyPins, resolver }) {
    const evidence = [], issues = [], fieldPath = 'capabilityCeiling.generation.send';
    const models = new Map();
    const unavailable = () => issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath });
    if (!(resolver instanceof RouteResolver)) { unavailable(); return { evidence, issues, models }; }
    const nodes = definition.nodes.filter(node => node.capabilities.includes('generation.send'));
    if (!nodes.length) { unavailable(); return { evidence, issues, models }; }
    const inspectNode = async node => {
        const evidence = [], issues = [], models = new Map();
        const unavailable = () => issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath });
        // The original pinned route supplies this finite mechanism's role.
        // Publication never supplies the corresponding fixed runtime producer.
        const pin = dependencyPins.find(pin => pin.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
        const control = ['planner', 'judge', 'review'].includes(node.kind);
        if (!['agent', 'planner', 'judge', 'review'].includes(node.kind) || pin?.port !== 'model' || pin.resourceRef.scope !== 'player') { unavailable(); return { evidence, issues, models }; }
        if (control && (node.outputs.length !== 1 || node.outputs[0].type !== 'json')) {
            issues.push({ code: 'native_orchestration_control_output_required', severity: 'blocking', fieldPath: 'definition.nodes.' + node.nodeId + '.outputs' });
            return { evidence, issues, models };
        }
        try {
            const route = await resolver.persistence.getRuntimeRoute(handle, pin.resourceRef.runtimeRouteId);
            if (!Object.hasOwn(RUNTIME_PRINCIPALS, route?.role)) { unavailable(); return { evidence, issues, models }; }
            // The private pure Project stages cannot call the original Task
            // tools. Only that graph's real tool owner needs their mechanism;
            // direct Studio execution and Resolver keep their original guard.
            const advisoryResult = definition.outputContract.kind === 'result' && !definition.outputContract.allowPartial
                && definition.outputContract.resultPolicy?.outputType === 'text'
                && definition.capabilityCeiling.length === 1 && definition.capabilityCeiling[0] === 'generation.send'
                && !definition.graphChangePolicy.allowedOperations.length && !definition.graphChangePolicy.allowedNodeKinds.length
                && definition.edges.every(edge => !edge.loopBack)
                && definition.nodes.every(item => item.kind === 'output' && !item.capabilities.length && !item.dependencyPinIds.length
                    || item.kind === 'agent' && item.capabilities.length === 1 && item.capabilities[0] === 'generation.send'
                        && item.outputs.length === 1 && item.outputs[0].type === 'text')
                && dependencyPins.every(pin => pin.port === 'model');
            const pureProject = route.role === 'role.studio' && (definition.outputContract.kind === 'project_review' || advisoryResult
                || isProjectDelegatedControlPlan({ definition, dependencyPins }))
                && !node.capabilities.some(capability => ['project.read', 'project.propose'].includes(capability))
                && !dependencyPins.some(pin => pin.port === 'tool' && node.dependencyPinIds.includes(pin.pinId));
            const requirements = [...route.role === 'role.intent_resolver' || route.role === 'role.studio' && !pureProject ? ['generation.tools'] : [],
                ...control ? ['generation.structured-output'] : []];
            const resolved = await resolver.resolve({ handle, routeRef: pin.resourceRef, role: route.role, requirements });
            if (hashNativeDocument(resolved.route) !== pin.integrity) {
                issues.push({ code: 'native_orchestration_dependency_stale', severity: 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
                return { evidence, issues, models };
            }
            if (!resolved.route.executionPolicy?.computeBudget) { unavailable(); return { evidence, issues, models }; }
            assertComputeBudget(resolved.route.executionPolicy.computeBudget);
            const failure = await readModelFailurePlan({ handle, node, dependencyPins, resolver, routeRef: pin.resourceRef, role: route.role,
                requirements }, resolved);
            models.set(node.nodeId, { node, resolved, failurePlan: failure });
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
                severity: unknown ? 'unknown' : 'blocking', fieldPath: 'dependencyPins.' + pin.pinId,
                ...(error instanceof GenerationError ? { reasonCode: error.code } : {}) });
        }
        return { evidence, issues, models };
    };
    // Independent pinned nodes share no resolver state or spending authority.
    // Read a bounded group afresh, then collect in the original graph order.
    // Await every reader even when one reports an unexpected error.
    for (let offset = 0; offset < nodes.length; offset += 4) {
        const results = await Promise.allSettled(nodes.slice(offset, offset + 4).map(inspectNode));
        for (const result of results) {
            if (result.status === 'rejected') throw result.reason;
            evidence.push(...result.value.evidence); issues.push(...result.value.issues);
            for (const [nodeId, model] of result.value.models) models.set(nodeId, model);
        }
    }
    return { evidence, issues, models };
}
