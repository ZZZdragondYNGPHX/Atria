import { hashNativeDocument as hash } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertBudgetAuthorityRef, localWorkAttemptId } from './budget-port.js';

/** Historical proof in the original RP bank, not a second charge or admission. */
export async function assertRpControlWork(tx, handle, root, effectId, jobs) {
    const authority = assertBudgetAuthorityRef(root.budgetAuthorityRef);
    if (authority.domain !== 'rp_chat' || !Array.isArray(jobs) || jobs.length !== 2) throw new TypeError('Invalid RP control work facts');
    const control = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: authority.controlId }))?.doc;
    const local = control?.operations[authority.operationId]?.compute?.localWork;
    for (const [index, job] of jobs.entries()) {
        const row = local?.find(item => item.attemptId === job.attemptId);
        if (job.kind !== ['graph_control_parse', 'graph_control_adopt'][index] || !row || hash(row) !== job.rowHash || row.kind !== job.kind
            || row.targetFingerprint !== job.targetFingerprint || row.attemptId !== localWorkAttemptId(effectId, job.ordinal)
            || hash(row.orchestration) !== hash({ kind: 'local_work', effectId, ordinal: job.ordinal }) || row.status !== 'settled' || row.usage?.outcome !== 'completed')
            throw new TypeError('Invalid RP control work facts');
    }
}
