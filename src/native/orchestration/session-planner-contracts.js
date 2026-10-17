import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { assertBudgetAuthorityRef, localWorkAttemptId } from './budget-port.js';
import { readRunControl } from '../run-control.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';

/** Read-only evidence in the same original Turn operation bank. */
export async function assertSessionControlWork(tx, handle, root, effectId, jobs) {
    const authority = assertBudgetAuthorityRef(root.budgetAuthorityRef);
    if (authority.domain !== 'session' || !Array.isArray(jobs) || jobs.length !== 2) throw new TypeError('Invalid Session graph control work');
    const control = await readRunControl(tx, handle, authority.sessionId), local = control?.operations[authority.operationId]?.compute?.localWork;
    for (const [index, job] of jobs.entries()) {
        assertObject(job, ['kind', 'attemptId', 'ordinal', 'targetFingerprint', 'rowHash'], 'Session graph work');
        const row = local?.find(item => item.attemptId === job.attemptId);
        if (job.kind !== ['graph_control_parse', 'graph_control_adopt'][index] || !row || hash(row) !== job.rowHash || row.kind !== job.kind
            || row.targetFingerprint !== job.targetFingerprint || row.attemptId !== localWorkAttemptId(effectId, job.ordinal)
            || hash(row.orchestration) !== hash({ kind: 'local_work', effectId, ordinal: job.ordinal }) || row.status !== 'settled' || row.usage?.outcome !== 'completed')
            throw new TypeError('Invalid Session graph control work');
    }
}

export const sessionPlannerReaderOptions = Object.freeze({ verifyControlWork: assertSessionControlWork });
export function readSessionPlannerCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Session Planner read');
    return readGraphPlannerCompletion(tx, handle, root, attemptId, { ...sessionPlannerReaderOptions, ...options });
}

export const sessionPlannerOutputContract = Object.freeze({ name: 'atria_session_graph_patch', schema: { type: 'object', properties: {
    operations: { type: 'array', items: { type: 'object' } },
}, required: ['operations'], additionalProperties: false } });
