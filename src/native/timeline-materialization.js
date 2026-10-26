import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { NotFoundError } from '../storage/errors.js';

// Both complete snapshots and exact windows consume the same pinned selections.
// Fetch entries and variants together, without per-message storage round trips.
export async function materializeTimeline(tx, handle, sessionId, selections, { activeOnly = false, sequenceOffset, ancestors } = {}) {
    const entries = [], variants = [], messages = new Set();
    for (let offset = 0; offset < selections.length; offset += 128) {
        const batch = selections.slice(offset, offset + 128), keys = [];
        for (const selection of batch) {
            if (messages.has(selection.messageId)) throw new TypeError('Duplicate Timeline message identity');
            messages.add(selection.messageId);
            if (ancestors && !ancestors.has(selection.branchId)) throw new TypeError('Timeline entry is not on this Branch ancestry');
            if (!Array.isArray(selection.variantIds) || !selection.variantIds.length || !selection.variantIds.includes(selection.activeVariantId)) throw new TypeError('Missing active Timeline Variant');
            keys.push({ kind: K.timelineEntry, handle, sessionId, branchId: selection.branchId, messageId: selection.messageId });
            for (const variantId of activeOnly ? [selection.activeVariantId] : selection.variantIds) {
                keys.push({ kind: K.timelineVariant, handle, sessionId, messageId: selection.messageId, variantId });
            }
        }
        const records = await tx.getNativeResources(keys);
        let cursor = 0;
        const next = () => {
            const record = records[cursor++];
            if (!record) throw new NotFoundError('native session dependency', { key: keys[cursor - 1] });
            return record.doc;
        };
        for (let index = 0; index < batch.length; index++) {
            const selection = batch[index], entry = next();
            if (entry.sessionId !== sessionId || entry.branchId !== selection.branchId || entry.messageId !== selection.messageId) throw new TypeError('Timeline identity mismatch');
            let active;
            for (const variantId of activeOnly ? [selection.activeVariantId] : selection.variantIds) {
                // SessionRepo/Save admission already validated these immutable
                // documents. Recheck the selection join, not every metadata leaf.
                const variant = next();
                if (variant.sessionId !== sessionId || variant.messageId !== entry.messageId || variant.variantId !== variantId) throw new TypeError('Variant identity mismatch');
                if (variantId === selection.activeVariantId) active = variant;
                variants.push(Object.freeze(variant));
            }
            entries.push(Object.freeze({ ...entry,
                sequence: sequenceOffset === undefined ? Number(selection.sequence ?? entry.sequence) : sequenceOffset + offset + index,
                content: active.content, variantIds: selection.variantIds, activeVariantId: active.variantId }));
        }
        if (offset + batch.length < selections.length) await new Promise(resolve => setImmediate(resolve));
    }
    return { entries, variants };
}
