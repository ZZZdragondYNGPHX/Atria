import { ConflictError } from '../storage/errors.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { hashNativeDocument as hash, putMutable, equalNativeDocuments as equal } from './repositories/common.js';
import { assertCounter, assertDigest } from '../../public/shared/native-orchestration-contracts.js';
import { fields } from '../../public/shared/native-values.js';
import { inspectNativeRpOutputIdentity, inspectNativeRpOutput } from './orchestration/native-rp-generation.js';
import { immutable } from './model-prompt-runtime/execution-utils.js';

const permits = new WeakMap();
const fail = code => { throw new ConflictError(code); };
const key = (handle, controlId) => ({ kind: K.rpRunControl, handle, controlId });
export const RP_OUTPUT_DENIAL_CODES = Object.freeze(['native_rp_output_stale', 'native_orchestration_source_stale', 'native_orchestration_return_stale', 'native_generation_revision_conflict',
    'native_rp_source_missing', 'native_rp_control_relocated', 'native_orchestration_model_result_completion_stale',
    'native_orchestration_memory_source_stale', 'native_orchestration_context_retrieval_denied', 'native_orchestration_context_retrieval_unresolved']);
const DENIALS = new Set(RP_OUTPUT_DENIAL_CODES);
export const rpNativeOutputKey = (controlId, source) => hash({ controlId, input: source.input, purpose: source.purpose, slot: source.outputSlot });
export const rpNativeOutputOperationId = outputKey => hash({ protocol: 'rp_native_output_v1', outputKey });

export const rpNarrationPayload = ({ controlId, source, text }) => ({ name: 'Narrator', is_user: false, is_system: false, mes: text,
    memory_os_source_id: 'rpout_' + hash({ controlId, source }).slice(0, 32) });

export function nativeOutputPayload(message) {
    const payload = structuredClone(message);
    if (payload?.extra) {
        delete payload.extra.gen_id; delete payload.extra.atri_output;
        if (!Object.keys(payload.extra).length) delete payload.extra;
    }
    return payload;
}

export function assertRpOutputReceipt(receipt, outputKey) {
    fields(receipt, ['schemaVersion', 'outputKey', 'operationId', 'inputAnchor', 'source', 'payloadHash', 'sourceDigest',
        'expectedIntegrity', 'hostFence', 'status', 'domainReceipt'], 'RP output receipt');
    if (receipt.schemaVersion !== 1 || receipt.outputKey !== outputKey || !/^[a-f0-9]{64}$/.test(outputKey)
        || receipt.operationId !== rpNativeOutputOperationId(outputKey)
        || !['prepared', 'writing', 'committed'].includes(receipt.status)
        || !equal(receipt.source.input, receipt.inputAnchor) || !/^[a-f0-9]{64}$/.test(receipt.payloadHash)
        || !/^[a-f0-9]{64}$/.test(receipt.sourceDigest) || typeof receipt.expectedIntegrity !== 'string') fail('native_rp_output_integrity');
    fields(receipt.source, ['input', 'purpose', 'outputSlot'], 'RP output source');
    fields(receipt.inputAnchor, ['messageId', 'floor', 'variantId', 'contentHash'], 'RP output input');
    assertCounter(receipt.inputAnchor.floor, 'input floor'); assertCounter(receipt.inputAnchor.variantId, 'input variant');
    assertDigest(receipt.inputAnchor.contentHash, 'input content');
    if (typeof receipt.inputAnchor.messageId !== 'string' || !receipt.inputAnchor.messageId || receipt.source.purpose !== 'narration'
        || receipt.source.outputSlot !== 'assistant') fail('native_rp_output_integrity');
    fields(receipt.hostFence, ['hostBootId', 'generation'], 'RP output fence');
    assertCounter(receipt.hostFence.generation, 'host generation', 1);
    if (typeof receipt.hostFence.hostBootId !== 'string' || !receipt.hostFence.hostBootId) fail('native_rp_output_integrity');
    if (receipt.status === 'committed') {
        const domain = receipt.domainReceipt;
        fields(domain, ['schemaVersion', 'controlId', 'operationId', 'outputKey', 'payloadHash', 'sourceDigest', 'inputAnchor',
            'locator', 'outputFloor', 'messageId', 'integrity'], 'RP chat domain receipt');
        if (domain.schemaVersion !== 1 || domain.operationId !== receipt.operationId || domain.outputKey !== outputKey
            || domain.payloadHash !== receipt.payloadHash || domain.sourceDigest !== receipt.sourceDigest
            || !equal(domain.inputAnchor, receipt.inputAnchor) || !Number.isSafeInteger(domain.outputFloor)
            || domain.outputFloor !== receipt.inputAnchor.floor + 1 || typeof domain.messageId !== 'string' || !domain.messageId
            || typeof domain.integrity !== 'string' || rpNativeOutputKey(domain.controlId, receipt.source) !== outputKey) fail('native_rp_output_integrity');
    } else if (receipt.domainReceipt !== null) fail('native_rp_output_integrity');
    return receipt;
}

export function assertRpOutputReceipts(control) {
    const receipts = control.outputReceipts;
    if (!receipts || typeof receipts !== 'object' || Array.isArray(receipts)) fail('native_rp_output_integrity');
    for (const [id, receipt] of Object.entries(receipts)) {
        assertRpOutputReceipt(receipt, id);
        if (rpNativeOutputKey(control.controlId, receipt.source) !== id) fail('native_rp_output_integrity');
    }
}

function entry(control, current) {
    const outputKey = rpNativeOutputKey(control.controlId, current.sourceRequest.source);
    return { schemaVersion: 1, outputKey, operationId: rpNativeOutputOperationId(outputKey),
        inputAnchor: current.sourceRequest.source.input, source: current.sourceRequest.source,
        payloadHash: hash(current.payload), sourceDigest: current.prefixDigest, expectedIntegrity: current.chatIntegrity,
        hostFence: current.hostFence, status: 'prepared', domainReceipt: null };
}

async function lockedScope(control, handle, capture, operation) {
    assertWritable();
    if (control._engine.hasActiveTransaction(handle)) fail('native_rp_output_ambient_transaction');
    const identity = inspectNativeRpOutputIdentity(capture, { handle, rpControl: control });
    const { runs, sourcePort } = identity.execution;
    const withAuthority = sourcePort.consumptionBoundary(handle, identity.sourceBinding, { engine: control._engine });
    const envelope = await runs.withSourceControl(handle, identity.runId, () => control._locked(handle, 'control:' + identity.controlId,
        () => control._engine.withTransaction(handle, async tx => {
            let current;
            try { current = await inspectNativeRpOutput(capture, { handle, rpControl: control, tx }); } catch (error) { if (DENIALS.has(error.code)) return { denied: true }; throw error; }
            return { denied: false, value: await operation(tx, current) };
        })), { withAuthority });
    if (envelope.denied) fail('native_rp_output_stale');
    return envelope.value;
}

/** Original control WAL; only a live original Model/recipient scope can prepare it. */
export async function prepareRpNativeOutput(control, handle, request) {
    fields(request, ['capture'], 'RP output preparation');
    return lockedScope(control, handle, request.capture, async (tx, current) => {
        const record = await tx.getResource(key(handle, current.controlId)), doc = await control.status(handle, current.controlId, { tx });
        const candidate = entry(doc, current), saved = doc.outputReceipts[candidate.outputKey];
        if (saved) {
            if (saved.payloadHash !== candidate.payloadHash || saved.sourceDigest !== candidate.sourceDigest
                || !equal(saved.source, candidate.source)) fail('native_rp_output_conflict');
            return immutable(saved);
        }
        doc.outputReceipts[candidate.outputKey] = assertRpOutputReceipt(candidate, candidate.outputKey); doc.sequence++;
        await putMutable(tx, key(handle, doc.controlId), doc, { expectedIntegrity: record.integrity });
        return immutable(candidate);
    });
}

/** A lost prepared->writing ACK never issues a replacement permit. */
export async function beginRpNativeOutput(control, handle, request) {
    fields(request, ['capture'], 'RP output writing');
    const saved = await lockedScope(control, handle, request.capture, async (tx, current) => {
        const record = await tx.getResource(key(handle, current.controlId)), doc = await control.status(handle, current.controlId, { tx });
        const candidate = entry(doc, current), original = doc.outputReceipts[candidate.outputKey];
        if (!original || original.payloadHash !== candidate.payloadHash || original.sourceDigest !== candidate.sourceDigest) fail('native_rp_output_conflict');
        if (!current.outputDispatch) fail('native_rp_output_effect_required');
        if (original.status !== 'prepared') return { receipt: original, issued: false };
        const receipt = { ...original, status: 'writing' }; doc.outputReceipts[receipt.outputKey] = receipt; doc.sequence++;
        await putMutable(tx, key(handle, doc.controlId), doc, { expectedIntegrity: record.integrity });
        return { receipt, issued: true, current };
    });
    if (!saved.issued) return immutable({ receipt: saved.receipt, permit: null });
    const permit = Object.freeze({});
    permits.set(permit, { control, handle, capture: request.capture, receipt: immutable(saved.receipt),
        payload: immutable(saved.current.payload), locator: immutable(saved.current.locator), used: false });
    return Object.freeze({ receipt: immutable(saved.receipt), permit });
}

/** Preserve Run lineage -> Source -> Chat -> Engine ordering for the physical writer. */
export function withRpNativeOutputWrite(permit, { engine, handle }, operation) {
    const state = permits.get(permit);
    if (!state || state.used || state.control._engine !== engine || state.handle !== handle) fail('native_rp_output_permit_required');
    const identity = inspectNativeRpOutputIdentity(state.capture, { handle, rpControl: state.control });
    const { runs, sourcePort } = identity.execution;
    const withAuthority = sourcePort.consumptionBoundary(handle, identity.sourceBinding, { engine });
    return runs.withSourceControl(handle, identity.runId, operation, { withAuthority });
}

/** Called inside the original chat queue, before its sole physical write. */
export async function consumeRpNativeOutputPermit(permit, { engine, handle, tx }) {
    const state = permits.get(permit);
    if (!state || state.used || state.control._engine !== engine || state.handle !== handle) fail('native_rp_output_permit_required');
    state.used = true;
    const authorized = await inspectNativeRpOutput(state.capture, { handle, rpControl: state.control, tx });
    if (!authorized.outputDispatch) fail('native_rp_output_effect_required');
    const current = await state.control.status(handle, inspectNativeRpOutputIdentity(state.capture, { handle }).controlId, { tx });
    if (!equal(current.outputReceipts[state.receipt.outputKey], state.receipt) || !equal(current.locator, state.locator)) fail('native_rp_output_stale');
    return { ...state, authorization: authorized, controlId: current.controlId };
}

/** Reconciliation observes one marker; missing marker never authorizes an append. */
export async function reconcileRpNativeOutput(control, handle, request) {
    fields(request, ['controlId', 'outputKey', 'operationId'], 'RP output reconciliation');
    if (control._engine.hasActiveTransaction(handle)) fail('native_rp_output_ambient_transaction');
    const { controlId } = request;
    return control._locked(handle, 'control:' + controlId, () => control._engine.withTransaction(handle, async tx => {
        const record = await tx.getResource(key(handle, controlId)), doc = await control.status(handle, controlId, { tx });
        const receipt = doc.outputReceipts[request.outputKey];
        if (!receipt || receipt.operationId !== request.operationId) fail('native_rp_output_missing');
        if (receipt.status === 'committed') return immutable({ status: 'committed', receipt, current: (await control._chatRepo.observeNativeOutput(handle, { controlId, ...request }, { tx })).status === 'committed' });
        const observed = await control._chatRepo.observeNativeOutput(handle, { controlId, ...request }, { tx });
        if (receipt.status !== 'writing' || observed.status !== 'committed') return immutable({ status: receipt.status === 'prepared' ? 'prepared' : 'unknown', receipt, current: false });
        const committed = assertRpOutputReceipt({ ...receipt, status: 'committed', domainReceipt: observed.receipt }, request.outputKey);
        await control._engine.nativeHostLifecycle.assertWriter(handle, tx);
        doc.outputReceipts[request.outputKey] = committed; doc.sequence++;
        await putMutable(tx, key(handle, controlId), doc, { expectedIntegrity: record.integrity });
        return immutable({ status: 'committed', receipt: committed, current: true });
    }));
}
