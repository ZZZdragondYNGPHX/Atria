import { ConflictError } from '../../storage/errors.js';
import { putMutable } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';

export class AttemptController {
    constructor({ runs, authorizeAttempt }) {
        if (!runs || typeof authorizeAttempt !== 'function') throw new TypeError('AttemptController requires original admission checks');
        Object.assign(this, { runs, authorizeAttempt });
    }

    async activate(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'attemptId'], 'activate');
        const { attemptId, ...guard } = input;
        return this.runs.control(handle, controlCommandId('attempt.activate', attemptId), { ...guard, operation: 'attempt.activate', detail: { attemptId } }, async ({ tx, root, now }) => {
            const record = await readAttempt(tx, handle, root, attemptId), attempt = record.doc;
            if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || root.nodeControl[attempt.nodeId].disposition !== 'eligible'
                || attempt.status !== 'pending' || attempt.epoch !== root.epoch || now >= root.progress.deadlineAt) throw new ConflictError('native_orchestration_attempt_not_admitted');
            let activeCount = 0;
            for (const id of root.attemptRefs) {
                const { doc } = await readAttempt(tx, handle, root, id);
                if (['running', 'waiting_effect', 'waiting_approval'].includes(doc.status)) activeCount++;
            }
            if (activeCount >= root.limits.maxConcurrency || root.progress.steps >= root.limits.maxSteps) throw new ConflictError('native_orchestration_limit_exhausted');
            await this.authorizeAttempt({ handle, tx, root, attempt });
            await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId), { ...attempt, status: 'running', startedAt: now }, { expectedIntegrity: record.integrity });
            root.status = 'running'; root.progress.steps++;
            return { root, eventType: 'attempt_activated', reasonCode: null, outcome: { attemptId, status: 'running' } };
        });
    }
}
