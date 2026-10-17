import { NativeRetrievalPersistence } from '../retrieval-persistence.js';
import { assertRetrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';
import { supportsOpenAIEmbeddingSource } from '../../vectors/openai-vectors.js';
import { hashNativeDocument as hash } from '../repositories/common.js';

/** Exact owner Profile mechanism evidence only; no Secret, send or runtime grant. */
export async function validateRetrievalCapability({ handle, definition, dependencyPins, retrieval }) {
    const capability = 'memory.retrieve', fieldPath = 'capabilityCeiling.' + capability;
    const evidence = [], issues = [];
    const unknown = () => issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath });
    const nodes = definition.nodes.filter(node => node.capabilities.includes(capability));
    if (!(retrieval instanceof NativeRetrievalPersistence) || !nodes.length) { unknown(); return { evidence, issues }; }
    for (const node of nodes) {
        if (!['agent', 'planner', 'judge', 'review'].includes(node.kind) || !node.capabilities.includes('generation.send')) { unknown(); continue; }
        const pins = dependencyPins.filter(pin => node.dependencyPinIds.includes(pin.pinId) && pin.port === 'context'
            && pin.resourceRef.scope === 'player' && Object.hasOwn(pin.resourceRef, 'retrievalProfileId'));
        if (!pins.length) {
            issues.push({ code: 'native_orchestration_retrieval_pin_required', severity: 'blocking', fieldPath: 'definition.nodes.' + node.nodeId + '.dependencyPinIds' });
            continue;
        }
        const modes = new Set();
        for (const pin of pins) {
            const pinPath = 'dependencyPins.' + pin.pinId;
            try {
                const ref = assertRetrievalRef(pin.resourceRef), profile = await retrieval.getExact(handle, ref);
                if (hash(profile) !== pin.integrity) {
                    issues.push({ code: 'native_orchestration_dependency_stale', severity: 'blocking', fieldPath: pinPath }); continue;
                }
                if (modes.has(profile.mode)) {
                    issues.push({ code: 'native_orchestration_retrieval_mode_ambiguous', severity: 'blocking', fieldPath: pinPath }); continue;
                }
                modes.add(profile.mode);
                if (profile.mode === 'embed' && !supportsOpenAIEmbeddingSource(profile.source)) { unknown(); continue; }
                evidence.push({ capability, nodeId: node.nodeId, pinId: pin.pinId, authority: 'original_native_retrieval_profile',
                    profileIntegrity: pin.integrity, mode: profile.mode, source: profile.source,
                    endpointBindingDigest: hash({ ref, endpoint: profile.endpoint, source: profile.source, model: profile.model, headers: profile.headers ?? {} }),
                    runtimePrincipal: 'original_native_context_retrieval_required' });
            } catch (error) {
                if (!(error instanceof TypeError) && error.code !== 'native_retrieval_unavailable') throw error;
                issues.push({ code: 'native_orchestration_dependency_invalid', severity: 'blocking', fieldPath: pinPath });
            }
        }
    }
    return { evidence, issues };
}
