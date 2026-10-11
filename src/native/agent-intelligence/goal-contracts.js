import { assertNativeId } from '../identity.js';
import { cloneNativeDocument } from '../repositories/common.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { assertEvidenceScope, assertEvidenceSelector, fields, text } from './contracts.js';

export const GOAL_STATUSES = Object.freeze(['active', 'paused', 'waiting', 'blocked', 'stale', 'cancelled', 'completed']);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function assertGoalCriteria(values, scope, { required = true } = {}) {
    if (!Array.isArray(values) || values.length > 32 || (required && !values.length)) throw new TypeError('Goal criteria bounds');
    const ids = new Set();
    return values.map(value => {
        fields(value, ['criterionId', 'description', 'selector', 'path', 'equals'], 'Goal criterion');
        text(value.criterionId, 'Criterion identity'); text(value.description, 'Criterion description');
        if (ids.has(value.criterionId) || value.description.length > 1000 || !Array.isArray(value.path) || value.path.length > 16
            || value.path.some(part => typeof part !== 'string' || !part || part.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(part))) throw new TypeError('Goal criterion path');
        ids.add(value.criterionId);
        return { ...value, selector: assertEvidenceSelector(value.selector, scope) };
    });
}

export function assertGoal(value) {
    const doc = cloneNativeDocument(value, 'Goal');
    fields(doc, ['schemaVersion', 'sequence', 'goalId', 'subject', 'scope', 'anchor', 'intent', 'criteria', 'invariants', 'budget',
        'status', 'evidence', 'progress', 'blockers', 'createdAt', 'updatedAt'], 'Goal');
    if (doc.schemaVersion !== 1 || !/^goal_[a-f0-9]{32}$/.test(doc.goalId) || !GOAL_STATUSES.includes(doc.status)
        || !['sequence', 'createdAt', 'updatedAt'].every(key => integer(doc[key]))) throw new TypeError('Goal schema');
    doc.scope = assertEvidenceScope(doc.scope);
    fields(doc.subject, ['kind', 'actorId'], 'Goal subject');
    if (doc.subject.kind === 'actor') {
        if (doc.scope.domain !== 'rp_session' || doc.budget !== null) throw new TypeError('Actor desire cannot borrow execution budget');
        assertNativeId(doc.subject.actorId, 'actor');
    } else if (doc.subject.kind !== 'user' || doc.subject.actorId !== null || doc.budget === null) throw new TypeError('Execution Goal subject');
    if (doc.budget !== null) doc.budget = assertComputeBudget(doc.budget);
    if (doc.scope.domain === 'rp_session') {
        fields(doc.anchor, ['branchId', 'packageVersionId'], 'Goal Session anchor');
        assertNativeId(doc.anchor.branchId, 'branch'); assertNativeId(doc.anchor.packageVersionId, 'packageVersion');
    } else if (doc.scope.domain === 'project') {
        fields(doc.anchor, ['baseRevision'], 'Goal Project anchor'); text(doc.anchor.baseRevision, 'Goal base revision');
    } else fields(doc.anchor, [], 'Goal chat anchor');
    text(doc.intent, 'Goal intent');
    if (doc.intent.length > 12000) throw new TypeError('Goal intent bound');
    doc.criteria = assertGoalCriteria(doc.criteria, doc.scope);
    doc.invariants = assertGoalCriteria(doc.invariants, doc.scope, { required: false });
    if (!Array.isArray(doc.evidence) || doc.evidence.length > 32 || !Array.isArray(doc.progress) || doc.progress.length > 32
        || !Array.isArray(doc.blockers) || doc.blockers.length > 32) throw new TypeError('Goal evidence bounds');
    // Evidence evaluation/verified completion belongs to S12, never a client state flag.
    if (doc.status === 'completed' && doc.evidence.length !== doc.criteria.length) throw new TypeError('Goal completion requires criterion evidence');
    if (Buffer.byteLength(JSON.stringify(doc)) > 65536) throw new TypeError('Goal capacity');
    return doc;
}
