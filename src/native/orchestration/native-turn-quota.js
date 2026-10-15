import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertNativeTurnPermit } from './native-turn-permit.js';

const proofs = new WeakMap();
const denied = () => { throw Object.assign(new Error('Trusted original Narrator producer is required'), { code: 'native_generation_budget_lane_denied' }); };

// Internal Host bridge only. The Host validates its private original Turn lane
// before calling this mint; JSON and the generic execute path never mint it.
export function mintNativeNarratorQuota({ host, handle, request, snapshot, anchor, invocationId, requestHash, selection, permit }) {
    assertNativeTurnPermit(permit, { host, handle, sessionId: snapshot.session.sessionId, anchor, invocationId, requestHash, selection });
    if (!host?.sessionCore || typeof handle !== 'string' || !handle || request.role !== 'narrator'
        || typeof request.requestId !== 'string' || request.requestId !== invocationId || !invocationId
        || typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash) || !selection
        || request.sessionId !== snapshot.session.sessionId
        || request.revisionId !== snapshot.revision.revisionId
        || hashNativeDocument(anchor) !== hashNativeDocument({ branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId })) denied();
    const policy = snapshot.manifest.runtime?.experienceContract?.generationBudget ?? null;
    const metadata = immutable({ handle, sessionId: snapshot.session.sessionId, requestId: request.requestId, invocationId, requestHash, role: 'narrator', anchor, policy,
        quota: policy === null ? null : { request: { role: 'narrator', background: false, anchor }, policy } });
    const proof = Object.freeze({});
    proofs.set(proof, Object.freeze({ ...metadata, host, sessionCore: host.sessionCore, selection, permit }));
    return proof;
}

export function assertNativeNarratorQuota(proof, expected) {
    const value = proofs.get(proof);
    if (!value || (expected.host !== undefined && value.host !== expected.host)
        || (expected.sessionCore !== undefined && value.sessionCore !== expected.sessionCore)
        || value.handle !== expected.handle || value.sessionId !== expected.sessionId || value.requestId !== expected.requestId
        || expected.role !== 'narrator' || value.role !== expected.role
        || (expected.invocationId !== undefined && value.invocationId !== expected.invocationId)
        || (expected.requestHash !== undefined && value.requestHash !== expected.requestHash)
        || (expected.selection !== undefined && value.selection !== expected.selection)
        || (expected.anchor !== undefined && hashNativeDocument(value.anchor) !== hashNativeDocument(expected.anchor))
        || (Object.hasOwn(expected, 'policy') && hashNativeDocument(value.policy) !== hashNativeDocument(expected.policy))) denied();
    assertNativeTurnPermit(value.permit, { host: value.host, handle: value.handle, sessionId: value.sessionId, anchor: value.anchor,
        invocationId: value.invocationId, requestHash: value.requestHash, selection: value.selection });
    return value;
}
