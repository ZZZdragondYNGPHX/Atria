import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable, isReadOnly } from '../../storage/read-only-mode.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertEvidenceScope, fields, readEvidencePath, EvidenceSourceError, text } from './contracts.js';
import { assertGoal } from './goal-contracts.js';
import { AgentGoalRepository } from './goal-repository.js';
import { AgentEvidenceService } from './evidence-service.js';
import { informationDefinition, projectInformation } from '../../../public/shared/native-information-runtime.js';

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
    async associations(handle, input) {
        fields(input, ['goalId', 'viewId'], 'Actor Goal associations');
        text(input.viewId, 'Actor Goal display view');
        const doc = await this._stored(handle, { goalId: input.goalId });
        if (doc.subject.kind !== 'actor' || doc.scope.domain !== 'rp_session') throw new ConflictError('actor_goal_association_denied');
        const base = await this.sessionCore.load(handle, doc.scope.sessionId);
        if (!equal(doc.anchor, { branchId: base.revision.branchId, packageVersionId: base.session.packageVersionId })) return { goalId: doc.goalId, status: 'stale', links: [], readOnly: isReadOnly() };
        const view = informationDefinition(base)?.views.find(view => view.id === input.viewId);
        if (view?.audience !== 'player' || view.actorId !== doc.subject.actorId || !view.exposure.includes('display')) throw new ConflictError('actor_goal_association_denied');
        const projection = projectInformation(base, view.id, { purpose: 'display', includeRollups: false });
        const links = projection.items.filter(item => ['desire', 'intention'].includes(item.semantic) && item.actorId === doc.subject.actorId && item.data.goalId === doc.goalId)
            .map(item => ({ itemId: item.id, semantic: item.semantic, cognition: item.cognition,
                commitmentIds: item.data.commitmentIds, fingerprint: hashNativeDocument(item) }));
        const current = await this.sessionCore.load(handle, doc.scope.sessionId), stored = await this._stored(handle, { goalId: doc.goalId });
        if (current.revision.revisionId !== base.revision.revisionId || !equal(doc, stored)) throw new ConflictError('actor_goal_association_stale');
        return { goalId: doc.goalId, status: doc.status, anchor: projection.anchor, links, readOnly: isReadOnly() };
    }
    async context(handle, input) {
        fields(input, ['scope'], 'Goal context');
        const scope = assertEvidenceScope(input.scope);
        const anchor = await this._anchor(handle, scope, { kind: 'user', actorId: null });
        const selected = (await this.repository.list(handle)).filter(doc => doc.subject.kind === 'user' && equal(doc.scope, scope));
        if (selected.length > 32) throw new TypeError('Goal context capacity');
        const goals = await Promise.all(selected.map(async doc => {
            const current = scope.domain === 'rp_session' && !equal(doc.anchor, anchor) ? this._failure(doc, 'stale', 'goal_scope_stale') : await this._present(handle, doc);
            return { goalId: current.goalId, sequence: current.sequence, intent: current.intent, status: current.status,
                criteria: current.criteria, invariants: current.invariants, progress: current.progress, blockers: current.blockers,
                budget: current.budget, taskId: current.execution?.taskId ?? null };
        }));
        if (!equal(anchor, await this._anchor(handle, scope, { kind: 'user', actorId: null }))) throw new ConflictError('goal_scope_stale');
        if (Buffer.byteLength(JSON.stringify(goals)) > 65536) throw new TypeError('Goal context capacity');
        return { scope, goals, readOnly: isReadOnly() };
    }
    async observe(handle, input) {
        fields(input, ['goalId', 'eventId'], 'Goal user event');
        text(input.eventId, 'Goal event');
        if (input.eventId.length > 160) throw new TypeError('Goal event bounds');
        const doc = await this._stored(handle, { goalId: input.goalId });
        if (doc.subject.kind !== 'user' || doc.scope.domain === 'project') throw new ConflictError('goal_execution_unavailable');
        if (doc.lastEvent?.eventId === input.eventId || ['paused', 'cancelled'].includes(doc.status)) return this._present(handle, doc);
        // An explicit RP user/author event updates evidence only. It cannot create
        // a Run, a model send or a lifecycle/World command from Goal text.
        return this.evaluate(handle, { goalId: doc.goalId, expectedSequence: doc.sequence }, { eventId: input.eventId });
    }
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
    async evaluate(handle, input, { eventId } = {}) {
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
        const saved = await this.repository.save(handle, { ...next, ...(eventId ? { lastEvent: { eventId, observedAt: this.now() } } : {}),
            sequence: doc.sequence + 1, updatedAt: this.now() }, hashNativeDocument(doc));
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
