import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertEvidenceScope, fields, readEvidencePath, EvidenceSourceError } from './contracts.js';
import { assertGoal } from './goal-contracts.js';
import { AgentGoalRepository } from './goal-repository.js';
import { AgentEvidenceService } from './evidence-service.js';

const proofBudget = () => ({ maxSources: 32, maxBytes: 131072, maxScanMessages: 8192 });
const equal = (left, right) => hashNativeDocument(left) === hashNativeDocument(right);

export class AgentGoalService {
    constructor({ engine, repository = new AgentGoalRepository({ engine }), sessionCore, studio, agent, chatRepo, now = Date.now } = {}) {
        Object.assign(this, { repository, sessionCore, studio, chatRepo, now });
        this.sources = new AgentEvidenceService({ sessionCore, studio, agent, chatRepo });
    }
    async _anchor(handle, scope, subject) {
        if (scope.domain === 'rp_session') {
            if (!this.sessionCore) throw new TypeError('Goal Session authority unavailable');
            const snapshot = await this.sessionCore.load(handle, scope.sessionId);
            if (subject.kind === 'actor' && !snapshot.manifest.actors.some(actor => actor.actorId === subject.actorId)) throw new TypeError('Goal Actor unavailable');
            return { branchId: snapshot.revision.branchId, packageVersionId: snapshot.session.packageVersionId };
        }
        if (scope.domain === 'project') {
            if (!this.studio) throw new TypeError('Goal Project authority unavailable');
            const revision = await this.studio.getRevision(handle, scope.projectId);
            return { baseRevision: revision.revision };
        }
        if (!this.chatRepo) throw new TypeError('Goal chat authority unavailable');
        const chat = await this.chatRepo.get(handle, scope.charDir, scope.name, { isGroup: scope.isGroup, groupId: scope.groupId });
        if (!chat) throw new NotFoundError('Goal chat');
        return {};
    }
    async create(handle, input) {
        assertWritable();
        fields(input, ['subject', 'scope', 'intent', 'criteria', 'invariants', 'budget'], 'Goal creation');
        const scope = assertEvidenceScope(input.scope);
        const anchor = await this._anchor(handle, scope, input.subject), at = this.now();
        const doc = assertGoal({ ...input, scope, anchor, schemaVersion: 1, sequence: 0,
            goalId: 'goal_' + randomUUID().replaceAll('-', ''), status: 'active', evidence: [], progress: [], blockers: [], createdAt: at, updatedAt: at });
        return this.repository.save(handle, doc, null);
    }
    async list(handle) { return Promise.all((await this.repository.list(handle)).map(doc => this._present(handle, doc))); }
    async _stored(handle, input) {
        fields(input, ['goalId'], 'Goal read');
        const doc = await this.repository.get(handle, input.goalId);
        if (!doc) throw new NotFoundError('Goal');
        return doc;
    }
    async get(handle, input) { return this._present(handle, await this._stored(handle, input)); }
    _failure(doc, status, code) {
        return { ...doc, status, progress: doc.criteria.map(item => ({ criterionId: item.criterionId, status: 'unknown', code })),
            blockers: [{ code, ids: [] }] };
    }
    _incomplete(doc, checked) {
        const failures = checked.checks.filter(check => check.status !== 'current');
        const failure = failures.find(check => !['missing', 'stale'].includes(check.status)) ?? failures[0];
        return this._failure(doc, ['missing', 'stale'].includes(failure?.status) ? 'stale' : 'blocked', failure?.code ?? 'goal_evidence_unavailable');
    }
    async _scopeCurrent(handle, doc) {
        const current = await this._anchor(handle, doc.scope, doc.subject);
        // Project outcomes may legitimately advance the revision via formal authoring.
        return doc.scope.domain !== 'rp_session' || equal(current, doc.anchor);
    }
    _match(doc, set, content) {
        if (doc.scope.domain === 'rp_session' && set.references.some(ref => ref.anchor.branchId !== doc.anchor.branchId
            || ref.anchor.packageVersionId !== doc.anchor.packageVersionId)) return this._failure(doc, 'stale', 'goal_scope_stale');
        const desired = new Set([...doc.criteria, ...doc.invariants].map(item => hashNativeDocument(item.selector)));
        if (set.references.length !== desired.size || set.references.some(ref => !desired.has(hashNativeDocument(ref.selector)))) return this._failure(doc, 'blocked', 'goal_source_selection_mismatch');
        const values = new Map(set.references.map((ref, index) => [hashNativeDocument(ref.selector), content[index]]));
        const check = item => {
            try {
                return equal(readEvidencePath(values.get(hashNativeDocument(item.selector)), item.path), item.equals)
                    ? { criterionId: item.criterionId, status: 'satisfied', code: null } : { criterionId: item.criterionId, status: 'unmet', code: 'goal_criterion_unmet' };
            } catch { return { criterionId: item.criterionId, status: 'unknown', code: 'goal_criterion_field_missing' }; }
        };
        const progress = doc.criteria.map(check), invariants = doc.invariants.map(check), blockers = [];
        const unmet = progress.filter(row => row.status !== 'satisfied').map(row => row.criterionId);
        const violated = invariants.filter(row => row.status !== 'satisfied').map(row => row.criterionId);
        if (unmet.length) blockers.push({ code: 'goal_criteria_unmet', ids: unmet });
        if (violated.length) blockers.push({ code: 'goal_invariants_unmet', ids: violated });
        return { ...doc, status: violated.length ? 'blocked' : unmet.length ? 'waiting' : 'completed', progress, blockers, evidence: [set] };
    }
    async _present(handle, doc) {
        if (doc.status !== 'completed') return doc;
        if (doc.subject.kind === 'actor') return this._failure(doc, 'blocked', 'actor_goal_completion_unavailable');
        try {
            if (!await this._scopeCurrent(handle, doc)) return this._failure(doc, 'stale', 'goal_scope_stale');
            const checked = await this.sources.evaluate(handle, doc.scope, doc.evidence[0], proofBudget(), { expand: true });
            if (checked.status !== 'current') return this._incomplete(doc, checked);
            return this._match(doc, doc.evidence[0], checked.content);
        } catch (error) {
            return this._failure(doc, error?.name === 'NotFoundError' || ['missing', 'stale'].includes(error?.status) ? 'stale' : 'blocked',
                error instanceof EvidenceSourceError ? error.code : 'goal_evidence_unavailable');
        }
    }
    async evaluate(handle, input) {
        assertWritable(); fields(input, ['goalId', 'expectedSequence'], 'Goal evaluation');
        const doc = await this._stored(handle, { goalId: input.goalId });
        if (doc.sequence !== input.expectedSequence) throw new ConflictError('goal_sequence_conflict');
        if (['paused', 'cancelled'].includes(doc.status)) return doc;
        let next;
        try {
            if (doc.subject.kind === 'actor') next = this._failure(doc, 'blocked', 'actor_goal_completion_unavailable');
            else if (!await this._scopeCurrent(handle, doc)) next = this._failure(doc, 'stale', 'goal_scope_stale');
            else {
                const selectors = [...new Map([...doc.criteria, ...doc.invariants].map(item => [hashNativeDocument(item.selector), item.selector])).values()];
                const set = await this.sources.capture(handle, doc.scope, selectors, proofBudget());
                const checked = await this.sources.evaluate(handle, doc.scope, set, proofBudget(), { expand: true });
                next = checked.status === 'current' ? this._match(doc, set, checked.content) : this._incomplete(doc, checked);
            }
        } catch (error) {
            next = this._failure(doc, error?.status === 'stale' ? 'stale' : error?.status === 'missing' ? doc.evidence.length ? 'stale' : 'waiting' : 'blocked',
                error?.status && error?.code ? error.code : 'goal_evidence_unavailable');
        }
        if (next.status === 'completed') next = await this._present(handle, next);
        const saved = await this.repository.save(handle, { ...next, sequence: doc.sequence + 1, updatedAt: this.now() }, hashNativeDocument(doc));
        return this._present(handle, saved);
    }
    async control(handle, input) {
        assertWritable();
        fields(input, ['goalId', 'expectedSequence', 'action'], 'Goal control');
        if (!['pause', 'resume', 'cancel'].includes(input.action)) throw new TypeError('Unsupported Goal control');
        const stored = await this._stored(handle, { goalId: input.goalId }), doc = await this._present(handle, stored);
        if (stored.sequence !== input.expectedSequence) throw new ConflictError('goal_sequence_conflict');
        if (['completed', 'cancelled'].includes(doc.status)) throw new ConflictError('goal_terminal');
        if (input.action === 'resume') {
            const current = await this._anchor(handle, doc.scope, doc.subject);
            if (hashNativeDocument(current) !== hashNativeDocument(doc.anchor)) throw new ConflictError('goal_scope_stale');
        }
        const status = { pause: 'paused', resume: 'active', cancel: 'cancelled' }[input.action];
        if (doc.status === status) return doc;
        return this.repository.save(handle, { ...doc, status, sequence: doc.sequence + 1, updatedAt: this.now() }, hashNativeDocument(stored));
    }
}
