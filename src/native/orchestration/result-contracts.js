import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash, serializeNativeDocument } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest, assertToken, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';

const fields = ['schemaVersion', 'resultId', 'runId', 'producerAttemptId', 'outputType', 'outputSchemaRef', 'payloadRef', 'sourceRefs',
    'dependencyDigest', 'audienceConstraint', 'disclosureConstraint', 'qualityRefs', 'status', 'createdAt'];
const fail = message => { throw new TypeError('Invalid Result: ' + message); };
const builtinPrototype = (prototype, name) => {
    const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
    return typeof constructor === 'function' && constructor.prototype === prototype
        && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;
};
const plainObjectPrototype = prototype => prototype !== null && Object.getPrototypeOf(prototype) === null && builtinPrototype(prototype, 'Object');

/** Payload data only: no accessors, sparse arrays, class instances or JSON omissions. */
export function assertResultJson(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || seen.has(value)) fail('payload must be finite, acyclic plain JSON');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array && (!Array.isArray(prototype) || !builtinPrototype(prototype, 'Array') || !plainObjectPrototype(Object.getPrototypeOf(prototype))))
        fail('payload array has a custom prototype');
    if (!array && prototype !== null && !plainObjectPrototype(prototype))
        fail('payload has a custom prototype');
    const keys = Reflect.ownKeys(value);
    if (array && (Object.keys(value).length !== value.length || keys.length !== value.length + 1)) fail('payload array is sparse or has extra fields');
    seen.add(value);
    for (const key of keys) {
        if (array && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('payload contains non-JSON properties');
        if (array && !/^(0|[1-9][0-9]*)$/.test(key)) fail('payload array has extra fields');
        assertResultJson(descriptor.value, seen);
    }
    seen.delete(value);
    return value;
}

export function resultDependencyDigest(envelope) {
    return hash(Object.fromEntries(Object.entries(envelope).filter(([field]) => field !== 'dependencyDigest')));
}

export function assertResultAudience(value) {
    if (value?.kind === 'rp_output') {
        assertObject(value, ['kind', 'runId', 'nodeId', 'epoch', 'controlId', 'outputKey', 'sourceBindingDigest', 'grantDigest', 'taskPurpose'], 'RP Result audience');
        assertNativeId(value.runId, 'orchestrationRun'); assertNativeId(value.nodeId, 'orchestrationNode'); assertNativeId(value.controlId, 'rpControl');
        assertCounter(value.epoch, 'recipient epoch'); assertDigest(value.outputKey, 'outputKey');
        assertDigest(value.sourceBindingDigest, 'sourceBindingDigest'); assertDigest(value.grantDigest, 'grantDigest');
        if (value.taskPurpose !== 'original_rp_narration') fail('RP output task purpose');
        return value;
    }
    assertObject(value, ['kind', 'parentRunId', 'parentAttemptId', 'parentEpoch', 'sourceBindingDigest', 'grantDigest', 'taskPurpose'], 'Result audience');
    if (value.kind !== 'parent_attempt') fail('only an exact parent Attempt recipient is supported');
    assertNativeId(value.parentRunId, 'orchestrationRun'); assertNativeId(value.parentAttemptId, 'orchestrationAttempt');
    assertCounter(value.parentEpoch, 'parentEpoch'); assertDigest(value.sourceBindingDigest, 'sourceBindingDigest');
    assertDigest(value.grantDigest, 'grantDigest'); assertToken(value.taskPurpose, 'taskPurpose');
    return value;
}

// This first producer profile has exactly one original RP source and one
// original model EffectReceipt. The references do not grant domain access.
function assertSources(refs, envelope) {
    if (!Array.isArray(refs) || refs.length !== 2) fail('exact source and EffectReceipt references are required');
    const [source, effect] = refs;
    assertObject(source, ['kind', 'runId', 'epoch', 'sourceBindingDigest', 'sourceAuthority', 'sourceRef'], 'Result source');
    assertObject(source.sourceRef, ['controlId', 'prefixDigest'], 'Result RP source');
    if (source.kind !== 'run_source' || source.sourceAuthority !== 'rp_chat' || source.runId !== envelope.runId) fail('producer source identity');
    assertCounter(source.epoch, 'producerEpoch'); assertDigest(source.sourceBindingDigest, 'sourceBindingDigest');
    assertNativeId(source.sourceRef.controlId, 'rpControl'); assertDigest(source.sourceRef.prefixDigest, 'prefixDigest');
    assertObject(effect, ['kind', 'runId', 'effectId', 'receiptId', 'observedEpoch'], 'Result EffectReceipt');
    if (effect.kind !== 'effect_receipt' || effect.runId !== envelope.runId || effect.observedEpoch !== source.epoch) fail('EffectReceipt producer identity');
    assertNativeId(effect.effectId, 'orchestrationEffect'); assertNativeId(effect.receiptId, 'orchestrationReceipt');
    assertCounter(effect.observedEpoch, 'observedEpoch');
}

/** Integrity/shape checking only; an original producer/recipient must authorize every use. */
export function assertResultEnvelope(envelope, { policy, expected = {} }) {
    assertResultPolicy({ kind: 'result', resultPolicy: policy });
    assertResultJson(envelope);
    assertObject(envelope, fields, 'ResultEnvelope');
    if (envelope.schemaVersion !== 1) fail('schemaVersion');
    assertNativeId(envelope.runId, 'orchestrationRun'); assertNativeId(envelope.resultId, 'orchestrationResult');
    assertNativeId(envelope.producerAttemptId, 'orchestrationAttempt');
    if (!['complete', 'partial', 'unknown', 'unavailable'].includes(envelope.status)) fail('status');
    if (envelope.outputType !== policy.outputType) fail('output type differs from explicit policy');
    assertObject(envelope.outputSchemaRef, ['kind', 'schema'], 'Result schema');
    if (envelope.outputSchemaRef.kind !== 'native_builtin' || envelope.outputSchemaRef.schema !== envelope.outputType) fail('unsupported output schema');
    assertObject(envelope.payloadRef, ['kind', 'runId', 'resultId', 'integrity'], 'Result payload reference');
    if (envelope.payloadRef.kind !== 'orchestration_result_payload' || envelope.payloadRef.runId !== envelope.runId
        || envelope.payloadRef.resultId !== envelope.resultId) fail('payload reference identity');
    assertDigest(envelope.payloadRef.integrity, 'payload integrity');
    assertSources(envelope.sourceRefs, envelope);
    const source = envelope.sourceRefs[0];
    assertResultAudience(envelope.audienceConstraint);
    const audience = envelope.audienceConstraint;
    if (audience.sourceBindingDigest !== source.sourceBindingDigest) fail('recipient source mismatch');
    assertObject(envelope.disclosureConstraint, ['kind'], 'Result disclosure');
    if (audience.kind === 'parent_attempt') {
        if (audience.parentRunId === envelope.runId || envelope.disclosureConstraint.kind !== 'same_source_parent_only') fail('parent disclosure scope');
    } else if (audience.runId !== envelope.runId || audience.epoch !== source.epoch || audience.controlId !== source.sourceRef.controlId
        || envelope.disclosureConstraint.kind !== 'same_source_rp_output_only') fail('RP output disclosure scope');
    if (!Array.isArray(envelope.qualityRefs) || envelope.qualityRefs.length) fail('quality evidence is not supported by this profile');
    assertCounter(envelope.createdAt, 'createdAt'); assertDigest(envelope.dependencyDigest, 'dependencyDigest');
    if (resultDependencyDigest(envelope) !== envelope.dependencyDigest) fail('dependency digest');
    const actual = { runId: envelope.runId, resultId: envelope.resultId, producerAttemptId: envelope.producerAttemptId,
        producerEpoch: source.epoch, sourceBindingDigest: source.sourceBindingDigest, sourceRef: source.sourceRef,
        effectReceiptRef: envelope.sourceRefs[1], audienceConstraint: envelope.audienceConstraint };
    for (const [key, value] of Object.entries(expected)) {
        if (!Object.hasOwn(actual, key)) fail('unknown expected binding');
        if (hash(actual[key]) !== hash(value)) fail('expected ' + key + ' mismatch');
    }
    return envelope;
}

/** One already-registered result record contains its protected task-local payload. */
export function assertResultRecord(record, { outputContract, expected = {} }) {
    const policy = assertResultPolicy(outputContract);
    assertResultJson(record);
    assertObject(record, ['schemaVersion', 'runId', 'resultId', 'envelope', 'payload'], 'Result record');
    if (record.schemaVersion !== 1) fail('record schemaVersion');
    assertResultEnvelope(record.envelope, { policy, expected });
    if (outputContract.kind === 'rp_narration'
        ? record.envelope.audienceConstraint.kind !== 'rp_output' || record.envelope.audienceConstraint.nodeId !== outputContract.ownerNodeId
        : record.envelope.audienceConstraint.kind !== 'parent_attempt') fail('audience differs from OutputContract');
    if (record.runId !== record.envelope.runId || record.resultId !== record.envelope.resultId) fail('record identity');
    const hasBody = ['complete', 'partial'].includes(record.envelope.status);
    if (!hasBody && record.payload !== null) fail('unknown/unavailable must have no body');
    if (record.envelope.status === 'partial' && outputContract.allowPartial !== true) fail('partial output is not allowed');
    if (hasBody && policy.outputType === 'text' && typeof record.payload !== 'string') fail('text payload');
    assertResultJson(record.payload);
    const bytes = hasBody ? Buffer.byteLength(policy.outputType === 'text' ? record.payload : serializeNativeDocument(record.payload), 'utf8') : 0;
    if (bytes > policy.maxBytes) fail('payload exceeds explicit byte bound');
    if (hash(record.payload) !== record.envelope.payloadRef.integrity) fail('payload integrity');
    return record;
}
