import { assertNativeTurnPermit } from './native-turn-permit.js';
import { assertNativeExperienceContract } from '../../../public/shared/native-experience-contract.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';

const captures = new WeakMap();
const denied = () => { throw Object.assign(new TypeError('native_orchestration_resolver_context_denied'), { code: 'native_orchestration_resolver_context_denied' }); };

// Short-lived original Turn identity only. No projection, selection or World
// preparation is performed until the original local-work bank admits compile.
export function captureNativeAuthorityResolver({ host, handle, base, producer }) {
    if (!host?.sessionCore || !producer || !base?.session || !base?.revision) denied();
    const { selection, permit, invocationId, requestHash, anchor } = producer;
    assertNativeTurnPermit(permit, { host, handle, sessionId: base.session.sessionId, anchor, invocationId, requestHash, selection });
    const contract = assertNativeExperienceContract(base.manifest.runtime?.experienceContract), user = base.timeline.at(-1);
    if (!contract.authorityRuntime || !contract.capabilities.some(item => item.id === 'authority-transaction' && item.version === 1)
        || user?.role !== 'user' || typeof user.content !== 'string' || !user.messageId
        || hash(anchor) !== hash({ branchId: base.revision.branchId, revisionId: base.revision.revisionId })) denied();
    const snapshot = immutable(base), capture = Object.freeze({});
    const logicalDescriptor = immutable({ sourceRef: { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId },
        packageRef: { packageId: base.session.packageId, packageVersionId: base.session.packageVersionId, entryPointId: base.session.entryPointId },
        logicRefs: { path: ({ ...base.manifest.runtime, ...base.manifest.entryPoints.find(item => item.entryPointId === base.session.entryPointId)?.runtime }).game?.logic ?? null,
            dataResources: contract.dataResources ?? [] }, intentObservation: contract.authorityRuntime.intentObservation,
        user: { messageId: user.messageId, contentHash: hash(user.content) }, invocationId, requestHash });
    captures.set(capture, Object.freeze({ host, sessionCore: host.sessionCore, handle, base: snapshot, baseDigest: hash(snapshot),
        producer: Object.freeze({ selection, permit, invocationId, requestHash, anchor: immutable(anchor) }),
        request: immutable({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: invocationId + ':intent', role: 'intent_resolver' }), logicalDescriptor }));
    return capture;
}

export function inspectNativeAuthorityResolver(capture, { host, sessionCore, handle, sourceBinding } = {}) {
    const value = captures.get(capture);
    if (!value || value.handle !== handle || value.sessionCore !== sessionCore || (host !== undefined && host !== value.host)) denied();
    const { producer, base } = value;
    assertNativeTurnPermit(producer.permit, { host: value.host, handle, sessionId: base.session.sessionId, anchor: producer.anchor,
        invocationId: producer.invocationId, requestHash: producer.requestHash, selection: producer.selection });
    if (sourceBinding && (sourceBinding.sourceAuthority !== 'native_session' || sourceBinding.sourceRef.sessionId !== base.session.sessionId
        || sourceBinding.sourceRef.branchId !== base.revision.branchId || sourceBinding.sourceRef.revisionId !== base.revision.revisionId
        || (sourceBinding.sourceRef.packageVersionId !== undefined && sourceBinding.sourceRef.packageVersionId !== base.session.packageVersionId))) denied();
    return value;
}
