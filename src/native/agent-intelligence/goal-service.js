import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertEvidenceScope, fields } from './contracts.js';
import { assertGoal } from './goal-contracts.js';
import { AgentGoalRepository } from './goal-repository.js';

export class AgentGoalService {
    constructor({ engine, repository = new AgentGoalRepository({ engine }), sessionCore, studio, chatRepo, now = Date.now } = {}) {
        Object.assign(this, { repository, sessionCore, studio, chatRepo, now });
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
    async list(handle) { return this.repository.list(handle); }
    async get(handle, input) {
        fields(input, ['goalId'], 'Goal read');
        const doc = await this.repository.get(handle, input.goalId);
        if (!doc) throw new NotFoundError('Goal');
        return doc;
    }
    async control(handle, input) {
        assertWritable();
        fields(input, ['goalId', 'expectedSequence', 'action'], 'Goal control');
        if (!['pause', 'resume', 'cancel'].includes(input.action)) throw new TypeError('Unsupported Goal control');
        const doc = await this.get(handle, { goalId: input.goalId });
        if (doc.sequence !== input.expectedSequence) throw new ConflictError('goal_sequence_conflict');
        if (['completed', 'cancelled'].includes(doc.status)) throw new ConflictError('goal_terminal');
        if (input.action === 'resume') {
            const current = await this._anchor(handle, doc.scope, doc.subject);
            if (hashNativeDocument(current) !== hashNativeDocument(doc.anchor)) throw new ConflictError('goal_scope_stale');
        }
        const status = { pause: 'paused', resume: 'active', cancel: 'cancelled' }[input.action];
        if (doc.status === status) return doc;
        return this.repository.save(handle, { ...doc, status, sequence: doc.sequence + 1, updatedAt: this.now() }, hashNativeDocument(doc));
    }
}
