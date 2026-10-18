import { fields } from '../../../public/shared/native-values.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertNativeTurnPermit, captureNativeTurnChildPermit, assertNativeTurnControlPermit, captureNativeTurnFanoutChildPermit, assertNativeTurnFinalizationPermit, captureNativeTurnFinalizationPermit } from './native-turn-permit.js';
import { inspectNativeBackgroundGenerationIdentity } from './native-background-generation.js';

const proofs = new WeakMap();
const denied = () => { throw Object.assign(new Error('Trusted original Turn producer is required'), { code: 'native_generation_budget_lane_denied' }); };

// Internal Host bridge only. The Host validates its private original Turn lane
// before calling this mint; JSON and the generic execute path never mint it.
function mintNativeTurnQuota(role, { host, handle, request, snapshot, anchor, invocationId, requestHash, selection, permit }) {
    assertNativeTurnPermit(permit, { host, handle, sessionId: snapshot.session.sessionId, anchor, invocationId, requestHash, selection });
    if (!host?.sessionCore || typeof handle !== 'string' || !handle || request.role !== role
        || typeof request.requestId !== 'string' || request.requestId !== (role === 'narrator' ? invocationId : invocationId + ':intent') || !invocationId
        || typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash) || !selection
        || request.sessionId !== snapshot.session.sessionId
        || request.revisionId !== snapshot.revision.revisionId
        || hashNativeDocument(anchor) !== hashNativeDocument({ branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId })) denied();
    const policy = snapshot.manifest.runtime?.experienceContract?.generationBudget ?? null;
    const metadata = immutable({ handle, sessionId: snapshot.session.sessionId, requestId: request.requestId, invocationId, requestHash, role, anchor, policy,
        quota: policy === null ? null : { request: { role, background: false, anchor }, policy } });
    const proof = Object.freeze({});
    proofs.set(proof, Object.freeze({ ...metadata, host, sessionCore: host.sessionCore, selection, permit }));
    return proof;
}

export function mintNativeNarratorQuota(args) { return mintNativeTurnQuota('narrator', args); }
export function mintNativeResolverQuota(args) { return mintNativeTurnQuota('intent_resolver', args); }

/** Same original quota metadata and bank; the child gets only a Scheduler witness. */
export function captureNativeTurnChildQuota(proof, boundary, expected) {
    const original = proofs.get(proof);
    if (!original || original.backgroundCapture) denied();
    const permit = captureNativeTurnChildPermit(original.permit, boundary, expected), capture = Object.freeze({});
    proofs.set(capture, Object.freeze({ ...original, permit }));
    return capture;
}

/** Existing original Turn metadata plus the actual nested scope leaf only. */
export function captureNativeTurnFanoutChildQuota(proof, boundary, expected) {
    const original = proofs.get(proof); if (!original || original.backgroundCapture) denied();
    const permit = captureNativeTurnFanoutChildPermit(original.permit, boundary, expected), capture = Object.freeze({});
    proofs.set(capture, Object.freeze({ ...original, permit })); return capture;
}

/** Read-only passive ancestry; Model/local admission still uses active quota. */
export function assertNativeTurnControlQuota(proof, expected) {
    const value = proofs.get(proof); if (value?.backgroundCapture) denied();
    assertTurnQuotaMetadata(value, expected); assertNativeTurnControlPermit(value.permit); return value;
}

export function mintNativeBackgroundQuota(capture, expected) {
    const value = inspectNativeBackgroundGenerationIdentity(capture, expected);
    const proof = Object.freeze({});
    proofs.set(proof, { backgroundCapture: capture, host: value.host, sessionCore: value.host.sessionCore, handle: value.handle,
        sessionId: value.input.sessionId, requestId: value.request.requestId, role: value.request.role,
        anchor: { branchId: value.expected.anchor.branchId, revisionId: value.expected.anchor.revisionId } });
    return proof;
}

function assertTurnQuotaMetadata(value, expected) {
    if (!value || !expected || !['narrator', 'intent_resolver'].includes(value.role)
        || Object.hasOwn(expected, 'sourceRequest')
        || (expected.host !== undefined && value.host !== expected.host)
        || (expected.sessionCore !== undefined && value.sessionCore !== expected.sessionCore)
        || value.handle !== expected.handle || value.sessionId !== expected.sessionId || value.requestId !== expected.requestId
        || (expected.role !== undefined && value.role !== expected.role)
        || (expected.invocationId !== undefined && value.invocationId !== expected.invocationId)
        || (expected.requestHash !== undefined && value.requestHash !== expected.requestHash)
        || (expected.selection !== undefined && value.selection !== expected.selection)
        || (expected.anchor !== undefined && hashNativeDocument(value.anchor) !== hashNativeDocument(expected.anchor))
        || (Object.hasOwn(expected, 'policy') && hashNativeDocument(value.policy) !== hashNativeDocument(expected.policy))) denied();
}

export function assertNativeTurnQuota(proof, expected) {
    const value = proofs.get(proof);
    if (value?.backgroundCapture) {
        const captured = inspectNativeBackgroundGenerationIdentity(value.backgroundCapture, { host: value.host, handle: value.handle });
        if (Object.entries(expected ?? {}).some(([key, item]) => ['host', 'sessionCore'].includes(key) ? value[key] !== item
            : key === 'policy' ? hashNativeDocument(item) !== captured.policyDigest
                : key === 'sourceRequest' ? hashNativeDocument(item) !== hashNativeDocument(captured.sourceRequest)
                    : hashNativeDocument(value[key] ?? null) !== hashNativeDocument(item))) denied();
        return { ...value, quota: { request: { role: value.role, background: true, anchor: { invocationId: captured.input.invocationId } },
            policy: captured.policy } };
    }
    assertTurnQuotaMetadata(value, expected);
    assertNativeTurnPermit(value.permit, { host: value.host, handle: value.handle, sessionId: value.sessionId, anchor: value.anchor,
        invocationId: value.invocationId, requestHash: value.requestHash, selection: value.selection });
    return value;
}

/** Exchange the original private quota's permit in the actual same finalizer. */
export function captureNativeTurnOutputFinalization(proof, request) {
    fields(request, ['host', 'handle', 'finalizationBoundary'], 'Narrator output finalizer');
    const value = proofs.get(proof);
    if (!value || value.role !== 'narrator' || value.backgroundCapture || value.host !== request.host || value.handle !== request.handle) denied();
    return captureNativeTurnFinalizationPermit({ permit: value.permit, finalizationBoundary: request.finalizationBoundary });
}

/** Revalidate an existing Narrator's output disclosure at its exact original finalizer.
 * No model/local admission uses this read-only phase witness.
 */
export function assertNativeTurnOutputQuota(proof, finalizationPermit, expected) {
    const value = proofs.get(proof);
    if (expected?.role !== 'narrator' || value?.role !== 'narrator' || value?.backgroundCapture
        || Object.keys(expected).some(key => !['host', 'sessionCore', 'handle', 'sessionId', 'requestId', 'role', 'invocationId', 'requestHash', 'selection', 'anchor', 'policy'].includes(key))) denied();
    assertTurnQuotaMetadata(value, expected);
    assertNativeTurnFinalizationPermit(finalizationPermit, { host: value.host, handle: value.handle, sessionId: value.sessionId,
        anchor: value.anchor, invocationId: value.invocationId, requestHash: value.requestHash, selection: value.selection }, value.permit);
    return value;
}

export function assertNativeNarratorQuota(proof, expected) {
    if (expected?.role !== 'narrator') denied();
    return assertNativeTurnQuota(proof, expected);
}

export function assertNativeResolverQuota(proof, expected) {
    if (expected?.role !== 'intent_resolver') denied();
    return assertNativeTurnQuota(proof, expected);
}
