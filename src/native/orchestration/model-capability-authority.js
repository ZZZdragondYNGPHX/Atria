import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { GenerationError } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';

/** Pure mechanism evidence. Publication is never a Session/Actor send grant. */
export async function validateModelCapability({ handle, definition, dependencyPins, resolver }) {
    const evidence = [], issues = [], fieldPath = 'capabilityCeiling.generation.send';
    const unavailable = () => issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath });
    if (!(resolver instanceof RouteResolver)) { unavailable(); return { evidence, issues }; }
    const nodes = definition.nodes.filter(node => node.capabilities.includes('generation.send'));
    if (!nodes.length) { unavailable(); return { evidence, issues }; }
    for (const node of nodes) {
        // This finite mechanism is only the original narrator route. Other
        // principals require their own original producer and remain unknown.
        const pin = dependencyPins.find(pin => pin.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
        if (node.kind !== 'agent' || pin?.port !== 'model' || pin.resourceRef.scope !== 'player') { unavailable(); continue; }
        try {
            const resolved = await resolver.resolve({ handle, routeRef: pin.resourceRef, role: 'role.narrator' });
            if (hashNativeDocument(resolved.route) !== pin.integrity) {
                issues.push({ code: 'native_orchestration_dependency_stale', severity: 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
                continue;
            }
            if (resolved.route.fallbackRouteRefs.length) { unavailable(); continue; }
            if (!resolved.route.executionPolicy?.computeBudget) { unavailable(); continue; }
            assertComputeBudget(resolved.route.executionPolicy.computeBudget);
            // No network, Secret read, render, bank admission or runtime grant.
            evidence.push({ capability: 'generation.send', nodeId: node.nodeId, pinId: pin.pinId,
                authority: 'native_route_resolver', routeIntegrity: pin.integrity, pathFingerprint: resolved.pathFingerprint,
                resourceDigest: hashNativeDocument(resolved.resources), capabilityDigest: hashNativeDocument(resolved.capabilities),
                runtimePrincipal: 'original_native_narrator_required' });
        } catch (error) {
            if (!(error instanceof GenerationError) && !(error instanceof TypeError) && error.name !== 'NotFoundError') throw error;
            const unknown = ['generation_provider_unavailable', 'generation_capability_unknown'].includes(error.code);
            issues.push({ code: unknown ? 'native_orchestration_capability_authority_unavailable' : 'native_orchestration_dependency_invalid',
                severity: unknown ? 'unknown' : 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
        }
    }
    return { evidence, issues };
}
