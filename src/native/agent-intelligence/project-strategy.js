import { randomUUID } from 'node:crypto';
import { hashNativeDocument } from '../repositories/common.js';
import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';

const same = (a, b) => hashNativeDocument(a) === hashNativeDocument(b);
const conflict = () => { throw new ConflictError('project_strategy_conflict'); };
export const projectStrategyBase = task => {
    const { sequence: _sequence, strategyVersions: _versions, ...base } = structuredClone(task);
    return base;
};
function pristine(task) {
    if (task.status !== 'planning' || task.plan !== null || task.attempts.length || task.proposals.length || task.workspace !== null) conflict();
}
function limit(value, cap) {
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 10 || !Number.isSafeInteger(value) || value < 1 || value > cap) throw new TypeError('Project strategy repair limit outside server cap');
}
export function assertProjectStrategyVersions(task) {
    const v = task.strategyVersions;
    fields(v, ['schemaVersion', 'declaration', 'candidates', 'activeVersionId'], 'Project strategy');
    if (v.schemaVersion !== 1 || !Array.isArray(v.candidates) || v.candidates.length > 16 || Buffer.byteLength(JSON.stringify(v)) > 1024 * 1024) throw new TypeError('Project strategy capacity/schema invalid');
    if (v.declaration !== null) {
        const d = v.declaration;
        fields(d, ['declarationId', 'base', 'serverCap', 'allowedFields'], 'Project strategy declaration');
        if (typeof d.declarationId !== 'string' || !d.declarationId || !Array.isArray(d.allowedFields) || d.allowedFields.length > 1
            || d.allowedFields.some(f => f !== 'maxRepairRounds')) throw new TypeError('Invalid Project strategy declaration');
        limit(d.base.maxRepairRounds, d.serverCap); pristine(d.base);
        if (d.base.projectId !== task.projectId || d.base.taskId !== task.taskId) throw new TypeError('Project strategy declaration identity mismatch');
    }
    const ids = new Set();
    for (const c of v.candidates) {
        fields(c, ['schemaVersion', 'candidateId', 'declarationId', 'serverCap', 'base', 'desired', 'diff'], 'Project strategy candidate');
        fields(c.diff, ['field', 'before', 'after'], 'Project strategy diff');
        if (c.schemaVersion !== 1 || c.base.projectId !== task.projectId || c.base.taskId !== task.taskId || !c.declarationId
            || ids.has(c.candidateId) || c.diff.field !== 'maxRepairRounds' || c.diff.before !== c.base.maxRepairRounds || c.diff.before === c.diff.after) throw new TypeError('Invalid Project strategy candidate');
        limit(c.diff.before, c.serverCap); limit(c.diff.after, c.serverCap); pristine(c.base);
        if (!same(c.desired, { ...c.base, maxRepairRounds: c.diff.after })) throw new TypeError('Project strategy changes protected fields');
        const { candidateId, ...identity } = c;
        if (candidateId !== hashNativeDocument(identity)) throw new TypeError('Project strategy content identity mismatch');
        ids.add(candidateId);
    }
    if (v.activeVersionId !== null) {
        const active = v.candidates.find(c => c.candidateId === v.activeVersionId);
        if (!active || task.maxRepairRounds !== active.diff.after) throw new TypeError('Project exact strategy version missing or inconsistent');
    }
    return v;
}

export function checkProjectStrategyCandidate(task, candidateId, serverCap, rollback = false) {
    const v = assertProjectStrategyVersions(task), c = v.candidates.find(c => c.candidateId === candidateId);
    if (!c) throw new TypeError('Project strategy candidate missing');
    pristine(task);
    if (serverCap !== c.serverCap) conflict();
    if (!rollback && (!v.declaration?.allowedFields.includes(c.diff.field) || v.declaration.declarationId !== c.declarationId
        || !same(v.declaration.base, c.base) || v.declaration.serverCap !== serverCap)) conflict();
    const base = projectStrategyBase(task);
    const alreadyApplied = v.activeVersionId === candidateId && same(base, c.desired);
    const alreadyRolledBack = v.activeVersionId === null && same(base, c.base);
    if (!alreadyApplied && !alreadyRolledBack) conflict();
    return { candidate: structuredClone(c), alreadyApplied, alreadyRolledBack };
}

export function updateProjectStrategy(task, action, serverCap) {
    const next = structuredClone(task);
    next.strategyVersions ||= { schemaVersion: 1, declaration: null, candidates: [], activeVersionId: null };
    const v = assertProjectStrategyVersions(next);
    pristine(next);
    if (action.type === 'declare') {
        fields(action, ['type', 'expectedSequence', 'allowedFields'], 'Project strategy action');
        if (action.expectedSequence !== task.sequence) conflict();
        if (v.activeVersionId !== null && action.allowedFields?.length) conflict();
        v.declaration = action.allowedFields?.length === 0 ? null : { declarationId: randomUUID(), base: projectStrategyBase(next), serverCap, allowedFields: structuredClone(action.allowedFields) };
    } else if (action.type === 'prepare') {
        fields(action, ['type', 'expectedSequence', 'field', 'value'], 'Project strategy action');
        if (action.expectedSequence !== task.sequence || !v.declaration?.allowedFields.includes(action.field)
            || v.activeVersionId !== null || !same(v.declaration.base, projectStrategyBase(next)) || v.declaration.serverCap !== serverCap) conflict();
        limit(action.value, serverCap);
        const base = projectStrategyBase(next), diff = { field: action.field, before: base.maxRepairRounds, after: action.value };
        const seed = { schemaVersion: 1, declarationId: v.declaration.declarationId, serverCap, base, desired: { ...base, maxRepairRounds: action.value }, diff };
        const candidateId = hashNativeDocument(seed);
        if (!v.candidates.some(c => c.candidateId === candidateId)) v.candidates.push({ ...seed, candidateId });
    } else if (['apply', 'rollback'].includes(action.type)) {
        fields(action, ['type', 'candidateId'], 'Project strategy action');
        const result = checkProjectStrategyCandidate(next, action.candidateId, serverCap, action.type === 'rollback');
        next.maxRepairRounds = action.type === 'apply' ? result.candidate.diff.after : result.candidate.diff.before;
        v.activeVersionId = action.type === 'apply' ? action.candidateId : null;
    } else throw new TypeError('Unknown Project strategy action');
    assertProjectStrategyVersions(next);
    return next;
}
