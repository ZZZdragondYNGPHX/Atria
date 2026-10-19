import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

// Emit only closed labels, counts and equality results. Provider-authored
// messages, diagnostic text, resource names and source values stay private.
export function projectProbeSummary(trial) {
    const statuses = ['planning', 'planned', 'working', 'evaluating', 'repair', 'review', 'blocked', 'conflict', 'taken_over', 'completed', 'committing', 'cancelled'];
    const failed = trial.evidence?.find(item => item.name === 'native_project_execution_failure')?.observed;
    if (failed) {
        const projection = failed.projection, capacity = projection?.capacity;
        const dimensions = value => Object.fromEntries(['requests', 'tokens', 'jobs', 'items', 'inputBytes'].map(key => [key,
            Number.isSafeInteger(value?.[key]) && value[key] >= 0 ? value[key] : null]));
        return { available: failed.status === 'available', failed: true,
            taskStatus: statuses.includes(failed.task?.status) ? failed.task.status : 'other',
            runStatus: ['admitted', 'running', 'waiting_approval', 'reconciling', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale'].includes(projection?.status)
                ? projection.status : 'other',
            validationStatus: ['passed', 'failed'].includes(failed.task?.validationStatus) ? failed.task.validationStatus : 'unavailable',
            capacity: { status: ['available', 'not_started', 'unavailable'].includes(capacity?.status) ? capacity.status : 'unavailable',
                used: dimensions(capacity?.used), remaining: dimensions(capacity?.remaining) } };
    }
    const observed = trial.evidence?.find(item => item.name === 'native_project_pilot');
    const actual = observed?.observed, expected = observed?.expected;
    if (!actual || !expected) return { available: false };
    const validation = actual.validation;
    return {
        available: true,
        taskStatus: statuses.includes(actual.currentTask?.status) ? actual.currentTask.status : 'other',
        validationStatus: ['passed', 'failed'].includes(validation?.status) ? validation.status : 'unavailable',
        diagnosticCount: Array.isArray(validation?.diagnostics) ? validation.diagnostics.length : 0,
        proposalPresent: actual.validatedProposal !== null && actual.validatedProposal !== undefined,
        equalSections: Object.fromEntries(['schemaVersion', 'project', 'package', 'dependencies', 'resources', 'files'].map(key => [key,
            hash(actual.validatedProposal?.[key] ?? null) === hash(expected.proposed?.[key] ?? null)])),
    };
}
