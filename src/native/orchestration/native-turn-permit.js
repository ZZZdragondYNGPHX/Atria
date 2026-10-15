import { nativeTaskScheduler } from '../task-scheduler.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';

const permits = new WeakMap();
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
    const active = nativeTaskScheduler.assertActiveBoundary(value.boundary, value.expected);
    return Object.freeze({ ...value, operationId: active.operationId, signal: active.signal, resources: active.resources, attempt: active.attempt });
}
