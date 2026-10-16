import { randomUUID } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { createNativeId, assertNativeId } from './identity.js';
import { hashNativeDocument, putMutable, withNativeResourceWrite } from './repositories/common.js';
import { ConflictError } from '../storage/errors.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { withChatWrite } from '../storage/repositories/chat-write-boundary.js';
import { ChatRepo } from '../storage/repositories/chat-repo.js';
import { admitComputeAttempt, assertComputeLedger, assertRetiredCompute, chargeLocalWork, hasOpenComputeReservations, hasRetainedOrchestrationCompute, releaseComputeChild, reserveComputeChild,
    retireComputeLedger, settleComputeAttempt, settleLocalWork } from '../../public/shared/native-compute-budget.js';
import { fields } from '../../public/shared/native-values.js';
import { sourceContent, sourceMessageId } from '../../public/scripts/agents/memory/source-provenance.js';

// Ordinary RP extension of the original RunControl bank (interface §13).
// The chat header names the control; this record holds the only compute
// ledger for that chat. It never reads or converts old Orchestrator data.
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const MAX_OPERATIONS = 128;
const controlKey = (handle, controlId) => ({ kind: K.rpRunControl, handle, controlId });
const chatKey = (handle, locator) => ({ kind: 'chat', handle, charDir: locator.charDir, name: locator.name, isGroup: locator.isGroup, groupId: locator.groupId });

export function assertRpLocator(value) {
    fields(value, ['charDir', 'name', 'isGroup', 'groupId'], 'RP chat locator');
    if (typeof value.isGroup !== 'boolean' || typeof value.name !== 'string' || !value.name) throw new TypeError('Invalid RP chat locator');
    if (value.isGroup ? typeof value.groupId !== 'string' || !value.groupId || value.charDir !== null
        : typeof value.charDir !== 'string' || !value.charDir || value.groupId !== null) throw new TypeError('Invalid RP chat locator');
    return value;
}

const sameLocator = (a, b) => hashNativeDocument(a) === hashNativeDocument(b);
const headerControlId = record => record?.header?.chat_metadata?.nativeControlId ?? null;

function assertControl(record, handle, controlId) {
    const doc = record?.doc;
    if (!doc) return null;
    if (hashNativeDocument(doc) !== record.integrity || doc.schemaVersion !== 1 || doc.controlId !== controlId) fail('native_rp_control_integrity');
    assertRpLocator(doc.locator);
    if (!['ready', 'review_required'].includes(doc.restoreState) || !Number.isSafeInteger(doc.sequence) || !Number.isSafeInteger(doc.generation)) fail('native_rp_control_integrity');
    if (doc.retiredCompute !== undefined) assertRetiredCompute(doc.retiredCompute);
    if (!doc.operations || Array.isArray(doc.operations) || Object.keys(doc.operations).length > MAX_OPERATIONS) fail('native_rp_control_integrity');
    for (const [id, op] of Object.entries(doc.operations)) {
        if (!/^[a-f0-9]{64}$/.test(id)) fail('native_rp_control_integrity');
        fields(op, ['anchor', 'compute'], 'RP operation');
        fields(op.anchor, ['messageId', 'floor', 'variantId', 'contentHash', 'purpose', 'outputSlot'], 'RP operation anchor');
        if (op.compute !== undefined) assertComputeLedger(op.compute);
    }
    return doc;
}

function newControl(controlId, locator) {
    return { schemaVersion: 1, controlId, sourceIdentity: { domain: 'rp_chat', isGroup: locator.isGroup, groupId: locator.groupId },
        locator: structuredClone(locator), sequence: 0, generation: 0, operations: {}, outputReceipts: {}, restoreState: 'ready' };
}

/** Message identity frozen by an RP operation; currentness is rechecked against the chat body at every admission. */
export function rpOperationInput(message, floor) {
    const messageId = sourceMessageId(message);
    if (!messageId || message?.atri_native?.messageId) fail('native_rp_source_unavailable');
    return { messageId, floor, variantId: Number.isSafeInteger(message.swipe_id) ? message.swipe_id : 0, contentHash: hashNativeDocument(sourceContent(message)) };
}

export class RpRunControl {
    constructor({ engine, chatRepo = new ChatRepo({ engine }) }) {
        if (!(chatRepo instanceof ChatRepo) || chatRepo._engine !== engine) fail('native_rp_chat_authority_unavailable');
        this._engine = engine;
        this._chatRepo = chatRepo;
    }

    // Chat edits and RP bank writes share the original domain boundary before
    // acquiring the control key or opening an Engine transaction.
    _locked(handle, id, operation) { return withChatWrite(handle, () => withNativeResourceWrite(handle, 'rp-run-control:' + id, operation)); }

    /** Bind the current chat to its control, completing a bounded partial init or a rename. Never sends. */
    async bind(handle, locator) {
        assertRpLocator(locator); assertWritable();
        return this._locked(handle, 'chat:' + hashNativeDocument(locator), () => this._engine.withTransaction(handle, async tx => {
            const chat = await tx.getResource(chatKey(handle, locator));
            if (!chat) fail('native_rp_source_missing');
            const named = headerControlId(chat);
            if (named) {
                assertNativeId(named, 'rpControl');
                const record = await tx.getResource(controlKey(handle, named)), control = assertControl(record, handle, named);
                if (!control) fail('native_rp_control_unregistered');
                if (!sameLocator(control.locator, locator)) {
                    const previous = await tx.getResource(chatKey(handle, control.locator));
                    if (headerControlId(previous) === named) fail('native_rp_control_duplicate');
                    // The previous position no longer claims this control: rename keeps its bank.
                    control.locator = structuredClone(locator); control.sequence++;
                    await putMutable(tx, controlKey(handle, named), control, { expectedIntegrity: record.integrity });
                }
                return { controlId: named, restoreState: control.restoreState };
            }
            // A control written before a crash that preceded the header publication.
            for (const record of await tx.listResources({ kind: K.rpRunControl, handle })) {
                const control = assertControl(record, handle, record.key.controlId);
                if (sameLocator(control.locator, locator) && !Object.keys(control.operations).length) {
                    await this._publishHeader(tx, handle, locator, chat, control.controlId);
                    return { controlId: control.controlId, restoreState: control.restoreState };
                }
            }
            const controlId = createNativeId('rpControl');
            await putMutable(tx, controlKey(handle, controlId), newControl(controlId, locator), { expectedIntegrity: null });
            await this._publishHeader(tx, handle, locator, chat, controlId);
            return { controlId, restoreState: 'ready' };
        }));
    }

    /** Explicit user action for an imported or copied chat: a fresh control with no inherited balance or approvals. */
    async assignIndependent(handle, locator) {
        assertRpLocator(locator); assertWritable();
        return this._locked(handle, 'chat:' + hashNativeDocument(locator), () => this._engine.withTransaction(handle, async tx => {
            const chat = await tx.getResource(chatKey(handle, locator));
            if (!chat) fail('native_rp_source_missing');
            const named = headerControlId(chat);
            if (!named) fail('native_rp_control_unbound');
            const record = await tx.getResource(controlKey(handle, named)), control = assertControl(record, handle, named);
            if (control && (sameLocator(control.locator, locator) || headerControlId(await tx.getResource(chatKey(handle, control.locator))) !== named)) fail('native_rp_control_not_duplicate');
            const controlId = createNativeId('rpControl');
            await putMutable(tx, controlKey(handle, controlId), newControl(controlId, locator), { expectedIntegrity: null });
            await this._publishHeader(tx, handle, locator, chat, controlId);
            return { controlId, restoreState: 'ready' };
        }));
    }

    async _publishHeader(tx, handle, locator, chat, controlId) {
        const current = await tx.getResource(chatKey(handle, locator));
        if (current?.integrity !== chat.integrity) throw new ConflictError('integrity_mismatch');
        const header = { ...(chat.header ?? {}), chat_metadata: { ...(chat.header?.chat_metadata ?? {}), nativeControlId: controlId } };
        await tx.putResource(chatKey(handle, locator), { header, body: chat.body, integrity: randomUUID(), updatedAt: Date.now(), createdAt: chat.createdAt });
    }

    async status(handle, controlId, { tx } = {}) {
        assertNativeId(controlId, 'rpControl');
        const read = async transaction => structuredClone(assertControl(await transaction.getResource(controlKey(handle, controlId)), handle, controlId));
        return tx ? read(tx) : this._engine.withTransaction(handle, read);
    }

    /** Read the original chat under the same source proof used by admission. No caller-supplied dialogue. */
    async context(handle, controlId, source, { tx } = {}) {
        assertNativeId(controlId, 'rpControl');
        const read = async transaction => {
            const { control } = await this._source(transaction, handle, controlId, source);
            const chat = await transaction.getResource(chatKey(handle, control.locator));
            const prefix = chat.body.slice(0, source.input.floor + 1);
            return { prefixDigest: hashNativeDocument(prefix.map(message => ({ messageId: sourceMessageId(message), content: sourceContent(message) }))),
                messages: prefix.map(message => ({
                    role: message.is_system ? 'system' : message.is_user ? 'user' : 'assistant', content: String(message.mes ?? ''),
                })) };
        };
        return tx ? read(tx) : this._engine.withTransaction(handle, read);
    }

    // Host-only source proof: the control's own locator, the header claim and the
    // exact input message/variant/content must all be current in one read.
    async _source(tx, handle, controlId, source) {
        fields(source, ['input', 'purpose', 'outputSlot'], 'RP compute source');
        fields(source.input, ['messageId', 'floor', 'variantId', 'contentHash'], 'RP operation input');
        for (const value of [source.purpose, source.outputSlot]) if (typeof value !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) throw new TypeError('Invalid RP operation purpose');
        const record = await tx.getResource(controlKey(handle, controlId)), control = assertControl(record, handle, controlId);
        if (!control) fail('native_orchestration_budget_unavailable');
        if (control.restoreState !== 'ready') fail('native_rp_control_review_required');
        const chat = await tx.getResource(chatKey(handle, control.locator));
        if (!chat) fail('native_rp_source_missing');
        if (headerControlId(chat) !== controlId) fail('native_rp_control_relocated');
        const message = Array.isArray(chat.body) ? chat.body[source.input.floor] : null;
        if (!message || hashNativeDocument(rpOperationInput(message, source.input.floor)) !== hashNativeDocument(source.input)) throw new ConflictError('native_generation_revision_conflict');
        const operationId = hashNativeDocument({ controlId, input: source.input, purpose: source.purpose, outputSlot: source.outputSlot });
        return { record, control, operationId };
    }

    _operation(control, operationId, source) {
        let op = control.operations[operationId];
        if (!op) {
            if (Object.keys(control.operations).length >= MAX_OPERATIONS) this._retireClosed(control);
            if (Object.keys(control.operations).length >= MAX_OPERATIONS) fail('native_run_continuation_limit');
            op = control.operations[operationId] = { anchor: { ...structuredClone(source.input), purpose: source.purpose, outputSlot: source.outputSlot } };
        }
        return op;
    }

    _retireClosed(control) {
        for (const [id, op] of Object.entries(control.operations)) {
            if (hasRetainedOrchestrationCompute(op.compute) || hasOpenComputeReservations(op.compute) || op.compute?.attempts.some(row => row.status === 'charged') || op.compute?.localWork?.some(row => row.status === 'charged')) continue;
            if (op.compute) control.retiredCompute = retireComputeLedger(control.retiredCompute, op.compute);
            delete control.operations[id];
        }
    }

    async _admit(handle, controlId, source, mutate) {
        assertNativeId(controlId, 'rpControl'); assertWritable();
        return this._locked(handle, 'control:' + controlId, () => this._engine.withTransaction(handle, async tx => {
            const { record, control, operationId } = await this._source(tx, handle, controlId, source);
            const result = mutate(this._operation(control, operationId, source), operationId);
            control.sequence++;
            await putMutable(tx, controlKey(handle, controlId), control, { expectedIntegrity: record.integrity });
            return result;
        }));
    }

    // Observation and late settlement follow the frozen operation identity, not current source.
    async _settle(handle, controlId, operationId, mutate) {
        assertNativeId(controlId, 'rpControl'); assertWritable();
        return this._locked(handle, 'control:' + controlId, () => this._engine.withTransaction(handle, async tx => {
            const record = await tx.getResource(controlKey(handle, controlId)), control = assertControl(record, handle, controlId);
            const op = control?.operations[operationId];
            if (!op) fail('native_generation_attempt_conflict');
            const result = mutate(op);
            control.sequence++;
            await putMutable(tx, controlKey(handle, controlId), control, { expectedIntegrity: record.integrity });
            return result;
        }));
    }

    reserveComputeChild(handle, controlId, source, limits, input) {
        return this._admit(handle, controlId, source, (op, operation) => {
            limits ??= op.compute?.limits;
            if (!limits) fail('native_generation_budget_unavailable');
            return { operation, ...reserveComputeChild(op, limits, input), limits: structuredClone(op.compute.limits) };
        });
    }

    admitCompute(handle, controlId, source, limits, attempt, options = {}) {
        return this._admit(handle, controlId, source, (op, operation) => {
            limits ??= op.compute?.limits;
            if (!limits) fail('native_generation_budget_unavailable');
            const admission = admitComputeAttempt(op, limits, attempt, options);
            return { operation, compute: admission.attempt, replayed: admission.replayed, limits: structuredClone(op.compute.limits) };
        });
    }

    chargeLocalWork(handle, controlId, source, limits, attempt, { reservationId } = {}) {
        return this._admit(handle, controlId, source, (op, operation) => {
            if (!limits?.localWork && !op.compute?.limits.localWork) fail('native_generation_budget_unavailable');
            return { operation, localWork: chargeLocalWork(op, limits, attempt, { reservationId }) };
        });
    }

    async observeCompute(handle, controlId, operation, attemptId, { tx } = {}) {
        assertNativeId(controlId, 'rpControl');
        const read = async transaction => {
            const control = assertControl(await transaction.getResource(controlKey(handle, controlId)), handle, controlId);
            const ledger = control?.operations[operation]?.compute, compute = ledger?.attempts.find(row => row.attemptId === attemptId);
            if (!compute) fail('native_generation_attempt_conflict');
            return structuredClone({ operation, compute, limits: ledger.limits });
        };
        return tx ? read(tx) : this._engine.withTransaction(handle, read);
    }

    settleCompute(handle, controlId, operation, attemptId, usage) {
        return this._settle(handle, controlId, operation, op => settleComputeAttempt(op, attemptId, usage));
    }

    settleLocalWork(handle, controlId, operation, attemptId, usage) {
        return this._settle(handle, controlId, operation, op => settleLocalWork(op, attemptId, usage));
    }

    releaseComputeChild(handle, controlId, operation, reservationId) {
        return this._settle(handle, controlId, operation, op => {
            if (!op.compute) fail('native_generation_attempt_conflict');
            return { operation, ...releaseComputeChild(op, reservationId) };
        });
    }
}
