import { hashNativeDocument } from '../repositories/common.js';
import { immutable, GenerationError } from './execution-utils.js';

const publications = new WeakMap();

/** Server adapter measurement marker, never issuable by a JSON configuration request. */
export function capabilityObservationProof(config, decisions) {
    const pathFingerprint = executionPathFingerprint(config);
    if (decisions.some(row => row.binding?.pathFingerprint !== pathFingerprint
        || row.binding.assurance !== 'verified'
        || !row.provenance.some(source => ['provider-endpoint', 'provider-discovery'].includes(source.kind)
            && source.observedAt === row.binding.observedAt))) throw new TypeError('Invalid adapter measurement');
    const proof = {};
    publications.set(proof, { pathFingerprint, decisions: new Set(decisions.map(hashNativeDocument)) });
    return proof;
}

export function assertCapabilityPublication(config, previous, proof) {
    const publication = publications.get(proof);
    const prior = new Set((previous?.capabilities || []).map(hashNativeDocument));
    for (const decision of config.model.capabilities) {
        if (decision.binding?.assurance !== 'verified' || prior.has(hashNativeDocument(decision))) continue;
        if (publication?.pathFingerprint !== executionPathFingerprint(config)
            || !publication.decisions.has(hashNativeDocument(decision))) {
            throw new TypeError('Configuration cannot publish unverified path measurements');
        }
    }
}

// Account credential identity is a reference, never a resolved Secret value.
// Capability evidence is excluded from its own binding fingerprint.
export function executionPathFingerprint({ handle, connection, model }) {
    return hashNativeDocument({ schemaVersion: 1, owner: handle, connection: {
        id: connection.connectionProfileId, endpoint: connection.endpoint, adapter: connection.providerAdapter,
        transport: connection.transport, account: connection.secretRef, networkPolicy: connection.networkPolicy,
        options: connection.options,
    }, target: { id: model.modelProfileId, remoteModelId: model.remoteModelId,
        messageFormat: model.messageFormat, providerHints: model.providerHints } });
}

const requiresPath = capability => capability === 'generation.cache' || capability === 'generation.reasoning'
    || capability.startsWith('generation.continuation') || capability.startsWith('generation.cache.');

export function capabilityAtPath(decision, pathFingerprint, now) {
    let reason;
    const binding = decision.binding;
    if (binding && binding.pathFingerprint !== pathFingerprint) reason = 'path_changed';
    else if (binding && (now < binding.observedAt || now >= binding.expiresAt)) reason = 'evidence_expired';
    else if (requiresPath(decision.capability) && !binding && decision.state === 'supported') reason = 'path_unverified';
    return { decision: reason ? { ...decision, state: 'unknown' } : decision,
        evidence: { capability: decision.capability, declaredState: decision.state,
            effectiveState: reason ? 'unknown' : decision.state, reason: reason ?? 'applicable',
            assurance: binding?.assurance ?? 'adapter_or_legacy_declaration', provenance: decision.provenance } };
}

export const activeExecutionCapability = 'generation.continuation.active-execution';
export function continuityRequirements(policy) {
    return policy?.continuity === 'active_execution' ? [activeExecutionCapability] : [];
}

export function prepareExecutionPlan(resolved, acceptedPolicy = resolved.route.executionPolicy, provider = null) {
    const policy = acceptedPolicy || { schemaVersion: 1, allowedModelProfileIds: [resolved.model.modelProfileId],
        verifiedRequirements: [], continuity: 'none', reuse: 'disabled' };
    // Legacy Route fallbacks remain governed by the original accepted fallback graph.
    if (acceptedPolicy && !policy.allowedModelProfileIds.includes(resolved.model.modelProfileId)) {
        throw new GenerationError('generation_target_policy_denied');
    }
    for (const capability of policy.verifiedRequirements) {
        const decision = resolved.capabilities.find(row => row.capability === capability);
        if (decision?.state !== 'supported' || decision.binding?.assurance !== 'verified'
            || decision.binding.pathFingerprint !== resolved.pathFingerprint) throw new GenerationError('generation_path_evidence_unavailable');
    }
    if (['task', 'adaptive'].includes(policy.continuity)) {
        // Cross-turn retention and adaptive lifecycle do not have consumers yet.
        throw new GenerationError('generation_continuation_unavailable');
    }
    if (policy.continuity === 'active_execution') {
        const decision = resolved.capabilities.find(row => row.capability === activeExecutionCapability);
        // Adapter implementation and exact live path evidence are separate. A
        // configured/declared capability alone cannot enable this policy.
        if (!provider?.continuationScopes?.includes('active_execution') || typeof provider.discardExecution !== 'function'
            || decision?.state !== 'supported' || decision.binding?.assurance !== 'verified'
            || decision.binding.pathFingerprint !== resolved.pathFingerprint) throw new GenerationError('generation_continuation_unavailable');
    }
    return immutable({ schemaVersion: 1, pathFingerprint: resolved.pathFingerprint ?? null,
        policyFingerprint: hashNativeDocument(policy), policy, selection: 'fixed_route',
        target: { modelProfileId: resolved.model.modelProfileId, remoteModelId: resolved.model.remoteModelId,
            connectionProfileId: resolved.connection.connectionProfileId, adapter: resolved.connection.providerAdapter,
            transport: resolved.connection.transport },
        evidence: resolved.pathEvidence ?? [], economics: { state: 'unknown', currencyCost: null },
        upstream: { identity: 'unknown', attempts: 'unknown' },
        cache: { applicationResult: 'unknown', provider: resolved.capabilities.find(row => row.capability === 'generation.cache')?.state ?? 'unknown',
            inferenceBackend: 'unknown' } });
}

export function assertExecutionEvidenceCurrent(resolved, now, policy = resolved.route.executionPolicy) {
    for (const capability of [...resolved.requirements, ...(policy?.verifiedRequirements || []), ...continuityRequirements(policy)]) {
        const decision = resolved.capabilities.find(row => row.capability === capability);
        if (decision?.binding && (decision.binding.pathFingerprint !== resolved.pathFingerprint
            || now < decision.binding.observedAt || now >= decision.binding.expiresAt)) {
            throw new GenerationError('generation_path_evidence_unavailable');
        }
    }
}
