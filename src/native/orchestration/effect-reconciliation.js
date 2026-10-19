import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';
import { controlRecordKey, runGuard } from './controller-common.js';


/** Observe one domain-verified historical fact through the original controller.
 * This helper has no sender, writer, receipt authority or source-grant factory. */
export async function observeReconciledEffect({ runs, effects }, handle, { root, effectId, observation }) {
    if (effects.runs !== runs || observation && observation.outcome !== 'confirmed') throw new TypeError('Original confirmed Effect observation required');
    if (!observation) return { status: 'unknown', effectId, receiptRef: null, resumed: false };
    let receiptId;
    try {
        const saved = await effects.observe(handle, { ...runGuard(root), effectId, observation });
        receiptId = saved.outcome.receiptId;
    } catch (error) {
        if (error.code !== 'storage_commit_unknown') throw error;
        const id = 'oreceipt_' + hash({ effectId, observationId: observation.observationId }).slice(0, 32);
        const saved = await runs.engine.withTransaction(handle, tx => tx.getResource(controlRecordKey(handle, root.runId, 'receipt', id)));
        const { observedAt, ...record } = saved?.doc ?? {};
        if (!Number.isSafeInteger(observedAt) || observedAt < 0 || !equalNativeDocuments(record, { schemaVersion: 1,
            receiptId: id, effectId, runId: root.runId, ...observation })) throw error;
        receiptId = id;
    }
    return { status: 'confirmed', effectId, receiptRef: { runId: root.runId, receiptId },
        budgetSettled: observation.budgetObservationRef !== null, resumed: false };
}
