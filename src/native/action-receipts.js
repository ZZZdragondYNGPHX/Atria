import { assertNativeId } from './identity.js';
import { cloneNativeDocument, hashNativeDocument } from './repositories/common.js';

export const ACTION_RECEIPTS_NAMESPACE = 'atri_action_receipts';
export function assertActionRequest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Action request must be an object');
    const allowed = ['actionId', 'commandId', 'args', 'expectedRevisionId', 'idempotencyKey', 'compensation', 'compensates'];
    for (const key of Object.keys(raw)) if (!allowed.includes(key)) throw new TypeError('Unknown Action request field');
    for (const key of ['actionId', 'commandId']) if (typeof raw[key] !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(raw[key])) throw new TypeError('Invalid Action identity');
    if (typeof raw.idempotencyKey !== 'string' || !/^[A-Za-z0-9:._-]{1,192}$/.test(raw.idempotencyKey)) throw new TypeError('Invalid Action idempotency key');
    assertNativeId(raw.expectedRevisionId, 'revision');
    if (raw.compensation != null && (typeof raw.compensation !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(raw.compensation))) throw new TypeError('Invalid compensation command');
    if (raw.compensates != null && (typeof raw.compensates !== 'string' || raw.compensates.length > 256)) throw new TypeError('Invalid compensation receipt');
    const args = cloneNativeDocument(raw.args);
    if (!args || typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 65536) throw new TypeError('Invalid Action args');
    const request = { actionId: raw.actionId, commandId: raw.commandId, args, expectedRevisionId: raw.expectedRevisionId,
        idempotencyKey: raw.idempotencyKey, compensation: raw.compensation ?? null, compensates: raw.compensates ?? null };
    return { ...request, fingerprint: hashNativeDocument(request) };
}
export function actionReceipts(snapshot) { return snapshot.states[ACTION_RECEIPTS_NAMESPACE]?.receipts ?? []; }
export function assertCompensation(request, receipts) {
    if (!request.compensates) return;
    const original = receipts.find(receipt => receipt.receiptId === request.compensates);
    if (!original || original.compensation !== request.commandId || receipts.some(receipt => receipt.compensates === original.receiptId)) throw new TypeError('Action receipt is not compensatable');
}
