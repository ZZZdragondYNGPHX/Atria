import { sourceContent, sourceMessageId } from '../../../public/scripts/agents/memory/source-provenance.js';
import { hashNativeDocument, cloneNativeDocument } from '../repositories/common.js';
import { readTaskArtifact } from '../task-artifact-authority.js';
import { EvidenceSourceError } from './contracts.js';

const fail = (status, code) => { throw new EvidenceSourceError(status, code); };

function observed(selector, anchor, value) {
    return { reference: { selector, anchor, contentHash: hashNativeDocument(value) }, value: cloneNativeDocument(value) };
}

function selectSources(selectors, read) {
    return selectors.map(selector => {
        try { return { source: read(selector) }; } catch (error) { return { error }; }
    });
}

function sourceIndex(values, idOf) {
    const index = new Map();
    values.forEach((value, position) => {
        const id = idOf(value);
        index.set(id, index.has(id) ? null : { value, position });
    });
    return index;
}

// Dependencies are Host-owned repositories/services, never caller-provided
// snapshots. All lookups use the separately authenticated handle.
export class RpEvidenceSourceAdapter {
    constructor({ chatRepo, sessionCore } = {}) {
        this.chatRepo = chatRepo;
        this.sessionCore = sessionCore;
    }

    async readMany(handle, scope, selectors, budget) {
        if (scope.domain === 'rp_chat') {
            if (!this.chatRepo) fail('unavailable', 'chat_authority_unavailable');
            const record = await this.chatRepo.get(handle, scope.charDir, scope.name, { isGroup: scope.isGroup, groupId: scope.groupId });
            if (!record) fail('missing', 'chat_deleted');
            const messages = record.body;
            if (!Array.isArray(messages)) fail('unavailable', 'chat_body_missing');
            budget.scan(messages.length);
            const index = sourceIndex(messages, sourceMessageId);
            return selectSources(selectors, selector => this._chatMessage(index, selector));
        }
        if (!this.sessionCore) fail('unavailable', 'session_authority_unavailable');
        // Current HEAD only: an old historical snapshot cannot prove currentness.
        const base = await this.sessionCore.load(handle, scope.sessionId);
        budget.scan(base.timeline.length);
        const index = sourceIndex(base.timeline, item => item.messageId);
        return selectSources(selectors, selector => this._sessionSource(base, index, selector));
    }

    _chatMessage(index, selector) {
        if (!index.has(selector.messageId)) fail('missing', 'message_deleted');
        const found = index.get(selector.messageId);
        if (!found) fail('denied', 'ambiguous_message_identity');
        const { value: message, position: floor } = found;
        if (floor !== selector.floor) fail('stale', 'message_position_changed');
        // Native messages must be read through their Session authority.
        if (message.atri_native?.messageId) fail('denied', 'native_message_requires_session');
        const variantId = message.swipe_id ?? 0;
        if (!Number.isSafeInteger(variantId) || variantId < 0) fail('denied', 'invalid_message_variant');
        return observed(selector, { variantId }, { sourceContent: sourceContent(message) });
    }

    _sessionSource(base, index, selector) {
        const anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId,
            packageVersionId: base.session.packageVersionId };
        if (selector.kind === 'artifact') {
            let artifact;
            try {
                // Read-only reusable context grant; never consume an operation
                // artifact or adopt a result into World/Project state.
                artifact = readTaskArtifact(base, selector.grant, selector.invocationId, 'context');
            } catch { fail('denied', 'task_artifact_denied'); }
            return observed(selector, { ...anchor, productionRevisionId: artifact.evidence.productionRevisionId }, artifact.value);
        }
        if (!index.has(selector.messageId)) fail('missing', 'session_message_deleted');
        const found = index.get(selector.messageId);
        if (!found) fail('denied', 'ambiguous_session_message');
        const message = found.value;
        return observed(selector, { ...anchor, variantId: message.activeVariantId }, {
            role: message.role, actorId: message.actorId ?? null, content: message.content,
        });
    }
}

export class ProjectEvidenceSourceAdapter {
    constructor({ studio, agent } = {}) {
        this.studio = studio;
        this.agent = agent;
    }

    async readMany(handle, scope, selectors) {
        if (!this.studio || !this.agent) fail('unavailable', 'project_authority_unavailable');
        const before = await this.studio.getRevision(handle, scope.projectId);
        const tasks = selectSources(selectors, selector => this.agent.getTask(handle, scope.projectId, selector.taskId));
        const after = await this.studio.getRevision(handle, scope.projectId);
        if (after.revision !== before.revision) fail('stale', 'project_source_changed_during_read');
        return tasks.map((item, index) => {
            if (item.error) return item;
            try {
                const selector = selectors[index];
                if (hashNativeDocument(item.source) !== hashNativeDocument(this.agent.getTask(handle, scope.projectId, selector.taskId))) fail('stale', 'project_source_changed_during_read');
                return { source: this._taskSource(before, item.source, selector) };
            } catch (error) { return { error }; }
        });
    }

    _taskSource(revision, task, selector) {
        if (['conflict', 'committing', 'taken_over', 'cancelled'].includes(task.status)) fail('stale', 'project_task_inactive');
        const receipts = task.changeSets.map(item => ({ changeSetId: item.changeSetId, baseRevision: item.baseRevision,
            resultingRevision: item.resultingRevision, validation: item.validation }));
        const expectedRevision = task.status === 'completed' ? receipts.at(-1)?.resultingRevision : task.baseRevision;
        if (!expectedRevision || revision.revision !== expectedRevision) fail('stale', 'project_revision_changed');
        const value = { taskId: task.taskId, projectId: task.projectId, status: task.status,
            validation: task.validation, review: task.review, repairRound: task.repairRound,
            maxRepairRounds: task.maxRepairRounds, receipts };
        return observed(selector, { baseRevision: task.baseRevision, revision: revision.revision, taskHash: hashNativeDocument(task) }, value);
    }
}
