import { fields as assertFields } from '../../../public/shared/native-values.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';

const permits = new WeakMap();
const finalizationPermits = new WeakMap();
const claimedFinalizations = new WeakSet();
const denied = () => { throw Object.assign(new Error('native_orchestration_turn_permit_denied'), { code: 'native_orchestration_turn_permit_denied' }); };
const fields = ['host', 'handle', 'sessionId', 'anchor', 'invocationId', 'requestHash', 'selection', 'requiredResources'];

// Transient capability only: every use reads the original Scheduler operation.
// Nothing here admits work, owns permits, retries, or persists another ledger.
export function captureNativeTurnPermit({ host, handle, sessionId, anchor, invocationId, requestHash, selection, boundary, resources }) {
    if (!host?.sessionCore || typeof handle !== 'string' || !handle || typeof sessionId !== 'string' || !sessionId
        || typeof invocationId !== 'string' || !invocationId || typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash)
        || !selection || typeof selection !== 'object' || !anchor || Object.keys(anchor).some(key => !['branchId', 'revisionId'].includes(key))
        || typeof anchor.branchId !== 'string' || typeof anchor.revisionId !== 'string' || !Array.isArray(resources)) denied();
    const expected = immutable({ owner: handle, anchor: { sessionId, ...anchor }, kind: 'turn', executionClass: 'turn_blocking',
        key: sessionId + ':' + invocationId + ':turn', fingerprint: requestHash, resources });
    nativeTaskScheduler.assertActiveBoundary(boundary, expected);
    const metadata = immutable({ handle, sessionId, anchor, invocationId, requestHash });
    const permit = Object.freeze({});
    permits.set(permit, Object.freeze({ ...metadata, host, selection, boundary, expected }));
    return permit;
}

export function assertNativeTurnPermit(permit, expected = {}) {
    const value = permits.get(permit);
    if (!value || !expected || Object.keys(expected).some(key => !fields.includes(key))) denied();
    for (const field of ['host', 'selection']) if (Object.hasOwn(expected, field) && value[field] !== expected[field]) denied();
    for (const field of ['handle', 'sessionId', 'anchor', 'invocationId', 'requestHash'])
        if (Object.hasOwn(expected, field) && hashNativeDocument(value[field]) !== hashNativeDocument(expected[field])) denied();
    if (Object.hasOwn(expected, 'requiredResources') && (!Array.isArray(expected.requiredResources)
        || expected.requiredResources.some(resource => typeof resource !== 'string' || !value.expected.resources.includes(resource)))) denied();
    const active = assertFrame(value, false);
    return Object.freeze({ ...value, operationId: active.operationId, signal: active.signal, resources: active.resources, attempt: active.attempt });
}

function assertFrame(value, controlOnly) {
    if (value.parent) {
        assertFrame(value.parent, true);
        return nativeTaskScheduler[controlOnly ? 'assertFanoutChildControlBoundary' : 'assertFanoutChildBoundary'](
            value.parent.boundary, value.parent.expected, value.boundary, value.expected);
    }
    return nativeTaskScheduler[controlOnly ? 'assertFanoutControlBoundary' : 'assertActiveBoundary'](value.boundary, value.expected);
}

/** Passive proof only. It never satisfies assertNativeTurnPermit for a send. */
export function assertNativeTurnControlPermit(permit) {
    const value = permits.get(permit); if (!value) denied();
    const active = assertFrame(value, true);
    return Object.freeze({ ...value, operationId: active.operationId, signal: active.signal, resources: active.resources, attempt: active.attempt });
}

/** Same held child, actual nested Scheduler group; no new delegated Run. The
 * domain owner verifies the frozen Frame and exact target before this mint. */
export function captureNativeTurnFanoutChildPermit(permit, boundary, expected) {
    const original = permits.get(permit); if (!original?.parent) denied();
    assertFrame(original, true);
    nativeTaskScheduler.assertFanoutChildBoundary(original.boundary, original.expected, boundary, expected);
    const capture = Object.freeze({});
    permits.set(capture, Object.freeze({ ...original, parent: original, boundary, expected: immutable(expected) }));
    return capture;
}

/** Derive a witness only from this Turn's actual original Scheduler group. */
export function captureNativeTurnChildPermit(permit, boundary, expected) {
    const original = permits.get(permit);
    if (!original || original.parent) denied();
    nativeTaskScheduler.assertFanoutChildBoundary(original.boundary, original.expected, boundary, expected);
    const capture = Object.freeze({});
    permits.set(capture, Object.freeze({ ...original, parent: original, boundary, expected: immutable(expected) }));
    return capture;
}

/** Only the original Scheduler's actual finalizer can exchange this Turn permit. */
export function captureNativeTurnFinalizationPermit(request) {
    assertFields(request, ['permit', 'finalizationBoundary'], 'Native Turn finalization');
    const { permit, finalizationBoundary } = request, original = permits.get(permit);
    if (!original || original.parent || claimedFinalizations.has(permit)) denied();
    const active = nativeTaskScheduler.assertFinalizationBoundary(finalizationBoundary, original.boundary, original.expected);
    if (active.attempt !== 0 || nativeTaskScheduler.operations.get(active.operationId)?.retry !== false) denied();
    const capture = Object.freeze({}); claimedFinalizations.add(permit);
    finalizationPermits.set(capture, { original, finalizationBoundary });
    return capture;
}

/** An output-bound phase witness. Original generation permits remain rejected here. */
export function assertNativeTurnFinalizationPermit(capture, expected = {}, originalPermit) {
    const saved = finalizationPermits.get(capture), value = saved?.original;
    if (originalPermit !== undefined && (!permits.has(originalPermit) || permits.get(originalPermit) !== value)) denied();
    if (!value || !expected || Object.keys(expected).some(key => !fields.includes(key))) denied();
    for (const field of ['host', 'selection']) if (Object.hasOwn(expected, field) && value[field] !== expected[field]) denied();
    for (const field of ['handle', 'sessionId', 'anchor', 'invocationId', 'requestHash'])
        if (Object.hasOwn(expected, field) && hashNativeDocument(value[field]) !== hashNativeDocument(expected[field])) denied();
    if (Object.hasOwn(expected, 'requiredResources') && (!Array.isArray(expected.requiredResources)
        || expected.requiredResources.some(resource => typeof resource !== 'string' || !value.expected.resources.includes(resource)))) denied();
    const active = nativeTaskScheduler.assertFinalizationBoundary(saved.finalizationBoundary, value.boundary, value.expected);
    if (active.attempt !== 0 || nativeTaskScheduler.operations.get(active.operationId)?.retry !== false) denied();
    return Object.freeze({ ...value, operationId: active.operationId, signal: active.signal, resources: active.resources, attempt: active.attempt });
}
