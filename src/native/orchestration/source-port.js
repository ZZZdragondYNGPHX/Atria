import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument } from '../repositories/common.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertRunAccess } from '../run-control.js';
import { SessionRepo } from '../repositories/session-repo.js';
import { withRuntimeWrite } from '../model-prompt-runtime/runtime-write.js';
import { ProjectAgentService } from '../project-agent.js';
import { ProjectTaskRepository } from '../agent-intelligence/project-task-repository.js';
import { StudioService } from '../authoring/studio-service.js';
import { BudgetPort } from './budget-port.js';
import { ATRIA_PROJECT_CONFLICT_CODE } from '../authoring-contracts.js';

const conflict = () => { throw new ConflictError('native_orchestration_source_stale'); };

/** Read-only source binding over the original three domains; never advances source revisions. */
export class SourcePort {
    constructor({ budgetPort, sessionCore, projectAgent, rpControl }) {
        Object.assign(this, { budgetPort, sessionCore, projectAgent, rpControl });
    }

    // An internal original-domain write boundary, not a permission decision.
    // Constructing it is pure; RunRepository acquires its ancestry locks before
    // invoking this original-domain boundary and only then opens its transaction.
    consumptionBoundary(handle, binding, { engine } = {}) {
        if (binding?.sourceAuthority === 'project') {
            const agent = this.projectAgent, studio = agent?._studio, request = binding.sourceRequest, ref = binding.sourceRef, bank = binding.budgetAuthorityRef;
            const { bindingDigest, ...source } = binding;
            if (typeof handle !== 'string' || !handle || !engine || typeof engine.withTransaction !== 'function'
                || !(agent instanceof ProjectAgentService) || !(studio instanceof StudioService) || !(this.budgetPort instanceof BudgetPort)
                || !(agent._repository instanceof ProjectTaskRepository) || agent._repository.engine !== engine || studio.storageEngine !== engine
                || this.budgetPort.projectAgent !== agent || this.budgetPort.projectRepository !== agent._repository
                || request?.domain !== 'project' || typeof request.projectId !== 'string' || !request.projectId || typeof request.taskId !== 'string' || !request.taskId
                || typeof request.revision !== 'string' || !request.revision || typeof request.executionFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.executionFingerprint)
                || ref?.projectId !== request.projectId || ref.taskId !== request.taskId || ref.revision !== request.revision || ref.executionFingerprint !== request.executionFingerprint
                || bank?.authority !== 'project_task' || bank.projectId !== request.projectId || bank.taskId !== request.taskId
                || bank.operationId !== hashNativeDocument({ projectId: request.projectId, taskId: request.taskId, revision: request.revision, executionFingerprint: request.executionFingerprint })
                || typeof bindingDigest !== 'string' || hashNativeDocument(source) !== bindingDigest)
                throw new ConflictError('native_orchestration_consumption_authority_unavailable');
            const { projectId, taskId } = request;
            return operation => {
                if (typeof operation !== 'function') throw new TypeError('Original domain consumption requires an operation');
                return withRuntimeWrite(handle, () => ProjectAgentService.prototype.withTaskLock.call(agent, handle, projectId, taskId,
                    () => StudioService.prototype.withProjectWrite.call(studio, handle, projectId, operation)));
            };
        }
        const repo = this.sessionCore?.runs?.repo, sessionId = binding?.sourceRef?.sessionId;
        const { bindingDigest, ...source } = binding ?? {};
        if (typeof handle !== 'string' || !handle || !engine || typeof engine.withTransaction !== 'function'
            || !(repo instanceof SessionRepo) || repo._engine !== engine || this.budgetPort?.sessionCore !== this.sessionCore
            || binding?.sourceAuthority !== 'native_session' || binding.sourceRequest?.domain !== 'native_session'
            || typeof sessionId !== 'string' || !sessionId || binding.sourceRequest.sessionId !== sessionId
            || binding.budgetAuthorityRef?.domain !== 'session' || binding.budgetAuthorityRef.sessionId !== sessionId
            || typeof bindingDigest !== 'string' || hashNativeDocument(source) !== bindingDigest)
            throw new ConflictError('native_orchestration_consumption_authority_unavailable');
        return operation => {
            if (typeof operation !== 'function') throw new TypeError('Original domain consumption requires an operation');
            return withRuntimeWrite(handle, () => SessionRepo.prototype.withRunLock.call(repo, handle, sessionId, operation));
        };
    }

    async capture(handle, sourceRequest, { tx } = {}) {
        let budgetSource, sourceRef;
        if (sourceRequest?.domain === 'native_session') {
            fields(sourceRequest, ['domain', 'sessionId', 'branchId', 'revisionId'], 'Session SourceRequest');
            const snapshot = await this.sessionCore.observe(handle, sourceRequest.sessionId);
            if (snapshot.revision.branchId !== sourceRequest.branchId || snapshot.revision.revisionId !== sourceRequest.revisionId) conflict();
            if (tx) await assertRunAccess(tx, handle, sourceRequest.sessionId, 'generate');
            else await this.sessionCore.runs.assert(handle, sourceRequest.sessionId, 'generate');
            budgetSource = { domain: 'native_session', sessionId: sourceRequest.sessionId };
            sourceRef = { sessionId: sourceRequest.sessionId, branchId: sourceRequest.branchId, revisionId: sourceRequest.revisionId };
        } else if (sourceRequest?.domain === 'project') {
            fields(sourceRequest, ['domain', 'projectId', 'taskId', 'revision', 'executionFingerprint'], 'Project SourceRequest');
            const { task, project } = await this.projectAgent[tx ? 'observeComputeSource' : 'observeContext'](handle, sourceRequest.projectId, sourceRequest.taskId);
            if (project.revision.revision !== task.baseRevision || task.baseRevision !== sourceRequest.revision || task.executionFingerprint !== sourceRequest.executionFingerprint) conflict();
            try { ProjectAgentService.prototype._ensureDraftMutable.call(this.projectAgent, task); } catch (error) {
                if (error instanceof ConflictError && ['project_agent_task_closed', 'project_agent_repair_limit', 'project_agent_review_locked', ATRIA_PROJECT_CONFLICT_CODE].includes(error.code)) conflict();
                throw error;
            }
            budgetSource = { domain: 'project', projectId: sourceRequest.projectId, taskId: sourceRequest.taskId };
            sourceRef = { projectId: sourceRequest.projectId, taskId: sourceRequest.taskId, revision: sourceRequest.revision, executionFingerprint: sourceRequest.executionFingerprint };
        } else if (sourceRequest?.domain === 'rp_chat') {
            fields(sourceRequest, ['domain', 'controlId', 'source'], 'RP SourceRequest');
            const context = await this.rpControl.context(handle, sourceRequest.controlId, sourceRequest.source);
            sourceRef = { controlId: sourceRequest.controlId, prefixDigest: context.prefixDigest };
            budgetSource = sourceRequest;
        } else throw Object.assign(new TypeError('Unsupported original source'), { code: 'native_orchestration_source_unavailable' });
        const budgetAuthorityRef = await this.budgetPort.authorityFor(handle, budgetSource, { tx });
        const binding = { sourceAuthority: sourceRequest.domain, sourceRef, sourceRequest: structuredClone(sourceRequest), budgetAuthorityRef };
        return { sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) }, budgetAuthorityRef };
    }

    async revalidate(handle, binding, options) {
        const current = await this.capture(handle, binding.sourceRequest, options);
        if (hashNativeDocument(current.sourceBinding) !== hashNativeDocument(binding)) conflict();
        return current;
    }
}
