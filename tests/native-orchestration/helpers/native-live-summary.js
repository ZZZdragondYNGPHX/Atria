import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

// Emit only closed labels, counts and equality results. Provider-authored
// messages, diagnostic text, resource names and source values stay private.
export function projectProbeSummary(trial) {
    const observed = trial.evidence?.find(item => item.name === 'native_project_pilot');
    const actual = observed?.observed, expected = observed?.expected;
    if (!actual || !expected) return { available: false };
    const statuses = ['planning', 'planned', 'working', 'evaluating', 'repair', 'review', 'blocked', 'conflict', 'taken_over', 'completed', 'committing', 'cancelled'];
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
