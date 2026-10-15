import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument } from '../repositories/common.js';
import { fields } from '../../../public/shared/native-values.js';

const conflict = () => { throw new ConflictError('native_orchestration_source_stale'); };

/** Read-only source binding over the original three domains; never advances source revisions. */
export class SourcePort {
    constructor({ budgetPort, sessionCore, projectAgent, rpControl }) {
        Object.assign(this, { budgetPort, sessionCore, projectAgent, rpControl });
    }

    async capture(handle, sourceRequest) {
        let budgetSource, sourceRef;
        if (sourceRequest?.domain === 'native_session') {
            fields(sourceRequest, ['domain', 'sessionId', 'branchId', 'revisionId'], 'Session SourceRequest');
            const snapshot = await this.sessionCore.observe(handle, sourceRequest.sessionId);
            if (snapshot.revision.branchId !== sourceRequest.branchId || snapshot.revision.revisionId !== sourceRequest.revisionId) conflict();
            await this.sessionCore.runs.assert(handle, sourceRequest.sessionId, 'generate');
            budgetSource = { domain: 'native_session', sessionId: sourceRequest.sessionId };
            sourceRef = { sessionId: sourceRequest.sessionId, branchId: sourceRequest.branchId, revisionId: sourceRequest.revisionId };
        } else if (sourceRequest?.domain === 'project') {
            fields(sourceRequest, ['domain', 'projectId', 'taskId', 'revision', 'executionFingerprint'], 'Project SourceRequest');
            const { task } = await this.projectAgent.observeContext(handle, sourceRequest.projectId, sourceRequest.taskId);
            if (task.baseRevision !== sourceRequest.revision || task.executionFingerprint !== sourceRequest.executionFingerprint
                || ['review', 'blocked', 'conflict', 'taken_over', 'completed', 'cancelled'].includes(task.status)) conflict();
            budgetSource = { domain: 'project', projectId: sourceRequest.projectId, taskId: sourceRequest.taskId };
            sourceRef = { projectId: sourceRequest.projectId, taskId: sourceRequest.taskId, revision: sourceRequest.revision, executionFingerprint: sourceRequest.executionFingerprint };
        } else if (sourceRequest?.domain === 'rp_chat') {
            fields(sourceRequest, ['domain', 'controlId', 'source'], 'RP SourceRequest');
            const context = await this.rpControl.context(handle, sourceRequest.controlId, sourceRequest.source);
            sourceRef = { controlId: sourceRequest.controlId, prefixDigest: context.prefixDigest };
            budgetSource = sourceRequest;
        } else throw Object.assign(new TypeError('Unsupported original source'), { code: 'native_orchestration_source_unavailable' });
        const budgetAuthorityRef = await this.budgetPort.authorityFor(handle, budgetSource);
        const binding = { sourceAuthority: sourceRequest.domain, sourceRef, sourceRequest: structuredClone(sourceRequest), budgetAuthorityRef };
        return { sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) }, budgetAuthorityRef };
    }

    async revalidate(handle, binding) {
        const current = await this.capture(handle, binding.sourceRequest);
        if (hashNativeDocument(current.sourceBinding) !== hashNativeDocument(binding)) conflict();
        return current;
    }
}
