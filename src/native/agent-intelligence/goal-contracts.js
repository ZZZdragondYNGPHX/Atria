import { assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument } from '../repositories/common.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { assertEvidenceScope, assertEvidenceSelector, assertEvidencePath, assertEvidenceSet, fields, text } from './contracts.js';

export const GOAL_STATUSES = Object.freeze(['active', 'paused', 'waiting', 'blocked', 'stale', 'cancelled', 'completed']);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function assertGoalCriteria(values, scope, { required = true } = {}) {
    if (!Array.isArray(values) || values.length > 32 || (required && !values.length)) throw new TypeError('Goal criteria bounds');
    const ids = new Set();
    return values.map(value => {
        fields(value, ['criterionId', 'description', 'selector', 'path', 'equals'], 'Goal criterion');
        text(value.criterionId, 'Criterion identity'); text(value.description, 'Criterion description');
        assertEvidencePath(value.path);
        if (ids.has(value.criterionId) || value.description.length > 1000) throw new TypeError('Goal criterion path');
        ids.add(value.criterionId);
        return { ...value, selector: assertEvidenceSelector(value.selector, scope) };
    });
}

export function assertGoal(value) {
    const doc = cloneNativeDocument(value, 'Goal');
    fields(doc, ['schemaVersion', 'sequence', 'goalId', 'subject', 'scope', 'anchor', 'intent', 'criteria', 'invariants', 'budget',
        'status', 'evidence', 'progress', 'blockers', 'createdAt', 'updatedAt', ...(Object.hasOwn(doc, 'execution') ? ['execution'] : []),
        ...(Object.hasOwn(doc, 'lastEvent') ? ['lastEvent'] : [])], 'Goal');
    if (doc.lastEvent) {
        fields(doc.lastEvent, ['eventId', 'observedAt'], 'Goal event observation');
        text(doc.lastEvent.eventId, 'Goal event');
        if (doc.lastEvent.eventId.length > 160 || !integer(doc.lastEvent.observedAt)) throw new TypeError('Goal event bounds');
    }
    if (doc.execution) {
        fields(doc.execution, ['kind', 'taskId'], 'Goal execution binding');
        if (doc.execution.kind !== 'project_task' || !/^agenttask_[a-z0-9]+$/.test(doc.execution.taskId)
            || doc.scope.domain !== 'project' || doc.subject.kind !== 'user') throw new TypeError('Goal execution permission');
    }
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
    if (new Set([...doc.criteria, ...doc.invariants].map(item => hashNativeDocument(item.selector))).size > 32) throw new TypeError('Goal source selection bound');
    if (!Array.isArray(doc.evidence) || doc.evidence.length > 32 || !Array.isArray(doc.progress) || doc.progress.length > 32
        || !Array.isArray(doc.blockers) || doc.blockers.length > 32) throw new TypeError('Goal evidence bounds');
    if (doc.evidence.length > 1) throw new TypeError('Goal uses one coherent EvidenceSet');
    for (const set of doc.evidence) {
        assertEvidenceSet(set);
        if (hashNativeDocument(set.scope) !== hashNativeDocument(doc.scope)) throw new TypeError('Goal evidence scope');
    }
    for (const row of doc.progress) {
        fields(row, ['criterionId', 'status', 'code'], 'Goal progress');
        if (!doc.criteria.some(item => item.criterionId === row.criterionId) || !['satisfied', 'unmet', 'unknown'].includes(row.status)
            || (row.code !== null && typeof row.code !== 'string')) throw new TypeError('Goal progress status');
    }
    if (new Set(doc.progress.map(row => row.criterionId)).size !== doc.progress.length) throw new TypeError('Duplicate Goal progress');
    if (doc.status === 'completed' && (doc.evidence.length !== 1 || doc.progress.length !== doc.criteria.length
        || doc.progress.some(row => row.status !== 'satisfied') || doc.blockers.length)) throw new TypeError('Goal completion requires criterion evidence');
    if (Buffer.byteLength(JSON.stringify(doc)) > 65536) throw new TypeError('Goal capacity');
    return doc;
}
