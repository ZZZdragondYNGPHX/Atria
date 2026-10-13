import { assertLearningExport } from './learning-trajectory.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { ConflictError } from '../../storage/errors.js';

export const LEARNING_OPTIMIZER_BACKEND = 'native-prompt-optimizer-v1';

// A downloaded hash is not authentication. Rejoin only the authenticated
// owner's current Experience; the existing optimizer reads its own sources.
export async function prepareLearningOptimizer(experience, handle, input) {
    const trajectory = assertLearningExport(input.trajectory);
    if (input.backend !== LEARNING_OPTIMIZER_BACKEND || input.purpose !== 'prompt-optimization') throw new TypeError('Explicit optimizer purpose and backend required');
    if (trajectory.ownerHash !== hash(handle) || trajectory.scopeHash !== hash(input.scope) || !trajectory.records.length) throw new TypeError('Learning optimizer source mismatch');
    const current = await experience.exportLearning(handle, { scope: input.scope, subject: input.subject,
        expectedSequence: trajectory.sequence, purpose: 'offline-analysis' });
    const { exportedAt: _oldTime, integrity: _oldHash, ...provided } = trajectory;
    const { exportedAt: _currentTime, integrity: _currentHash, ...actual } = current;
    if (hash(provided) !== hash(actual)) throw new ConflictError('learning_optimizer_source_changed');
    return { schemaVersion: 1, backend: LEARNING_OPTIMIZER_BACKEND, trajectoryHash: trajectory.integrity,
        scopeHash: trajectory.scopeHash, recordsHash: hash(trajectory.records), sourceSequence: trajectory.sequence };
}

export function assertLearningOptimizerPin(value) {
    if (!value || Object.keys(value).some(key => !['schemaVersion', 'backend', 'trajectoryHash', 'scopeHash', 'recordsHash', 'sourceSequence'].includes(key))
        || value.schemaVersion !== 1 || value.backend !== LEARNING_OPTIMIZER_BACKEND
        || !Number.isSafeInteger(value.sourceSequence) || value.sourceSequence < 0
        || ['trajectoryHash', 'scopeHash', 'recordsHash'].some(key => typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key]))) throw new TypeError('Invalid learning optimizer provenance');
    return value;
}
