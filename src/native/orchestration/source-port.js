import { AsyncLocalStorage } from 'node:async_hooks';
import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument, withNativeResourceWrite } from '../repositories/common.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertRunAccess } from '../run-control.js';
import { SessionRepo } from '../repositories/session-repo.js';
import { withRuntimeWrite } from '../model-prompt-runtime/runtime-write.js';
import { ProjectAgentService } from '../project-agent.js';
import { ProjectTaskRepository } from '../agent-intelligence/project-task-repository.js';
import { StudioService } from '../authoring/studio-service.js';
import { BudgetPort } from './budget-port.js';
import { ATRIA_PROJECT_CONFLICT_CODE } from '../authoring-contracts.js';
import { assertSessionTaskSource } from './binding-source-authority.js';
import { RpRunControl } from '../rp-run-control.js';
import { ChatRepo } from '../../storage/repositories/chat-repo.js';
import { readProjectOwnedSource } from './project-tool-receipts.js';

const heldProjectBoundaries = new AsyncLocalStorage();

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
        if (binding?.sourceAuthority === 'rp_chat') {
            const control = this.rpControl, chats = control?._chatRepo, request = binding.sourceRequest, ref = binding.sourceRef, bank = binding.budgetAuthorityRef;
            const { bindingDigest, ...source } = binding;
            if (typeof handle !== 'string' || !handle || !engine || typeof engine.withTransaction !== 'function'
                || !(control instanceof RpRunControl) || control._engine !== engine || !(chats instanceof ChatRepo) || chats._engine !== engine
                || !(this.budgetPort instanceof BudgetPort) || this.budgetPort.rpControl !== control
                || request?.domain !== 'rp_chat' || typeof request.controlId !== 'string' || !request.controlId || ref?.controlId !== request.controlId
                || typeof ref.prefixDigest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.prefixDigest)
                || bank?.authority !== 'run_control' || bank.domain !== 'rp_chat' || bank.controlId !== request.controlId
                || hashNativeDocument(bank.source) !== hashNativeDocument(request.source)
                || bank.operationId !== hashNativeDocument({ controlId: request.controlId, input: request.source?.input, purpose: request.source?.purpose, outputSlot: request.source?.outputSlot })
                || typeof bindingDigest !== 'string' || hashNativeDocument(source) !== bindingDigest)
                throw new ConflictError('native_orchestration_consumption_authority_unavailable');
            return operation => {
                if (typeof operation !== 'function') throw new TypeError('Original domain consumption requires an operation');
                return withRuntimeWrite(handle, () => withNativeResourceWrite(handle, 'settings',
                    () => ChatRepo.prototype.withWriteLock.call(chats, handle, operation)));
            };
        }
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
                return withRuntimeWrite(handle, () => {
                    const held = heldProjectBoundaries.getStore() ?? [];
                    if (held.some(scope => scope.open && scope.engine === engine && scope.agent === agent && scope.studio === studio
                        && scope.handle === handle && scope.projectId === projectId && scope.taskId === taskId && scope.bindingDigest === bindingDigest)) return operation();
                    return ProjectAgentService.prototype.withTaskLock.call(agent, handle, projectId, taskId,
                        () => StudioService.prototype.withProjectWrite.call(studio, handle, projectId, async () => {
                            // Queue ownership only. Every nested consumer still
                            // performs its original fresh Source/grant/bank checks.
                            const scope = { engine, agent, studio, handle, projectId, taskId, bindingDigest, open: true };
                            return heldProjectBoundaries.run([...held, scope], async () => {
                                try { return await operation(); } finally { scope.open = false; }
                            });
                        }));
                });
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
            return withRuntimeWrite(handle, () => withNativeResourceWrite(handle, 'settings',
                () => SessionRepo.prototype.withRunLock.call(repo, handle, sessionId, operation)));
        };
    }

    async capture(handle, sourceRequest, { tx } = {}) {
        let budgetSource, sourceRef;
        if (sourceRequest?.domain === 'native_session') {
            fields(sourceRequest, ['domain', 'sessionId', 'branchId', 'revisionId', 'taskRef'], 'Session SourceRequest');
            const snapshot = await this.sessionCore.observe(handle, sourceRequest.sessionId);
            if (snapshot.revision.branchId !== sourceRequest.branchId || snapshot.revision.revisionId !== sourceRequest.revisionId) conflict();
            if (Object.hasOwn(sourceRequest, 'taskRef')) assertSessionTaskSource(snapshot, sourceRequest.taskRef);
            if (tx) await assertRunAccess(tx, handle, sourceRequest.sessionId, 'generate');
            else await this.sessionCore.runs.assert(handle, sourceRequest.sessionId, 'generate');
            budgetSource = { domain: 'native_session', sessionId: sourceRequest.sessionId };
            sourceRef = { sessionId: sourceRequest.sessionId, branchId: sourceRequest.branchId, revisionId: sourceRequest.revisionId };
        } else if (sourceRequest?.domain === 'project') {
            const formalCommit = sourceRequest.purpose === 'formal_commit';
            fields(sourceRequest, ['domain', 'projectId', 'taskId', 'revision', 'executionFingerprint',
                ...formalCommit ? ['purpose', 'reviewHash', 'requestHash'] : []], 'Project SourceRequest');
            if (formalCommit && Object.hasOwn(sourceRequest, 'requestHash')
                && (typeof sourceRequest.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(sourceRequest.requestHash)))
                throw new TypeError('Project commit requestHash must be a SHA-256 digest');
            if (formalCommit && (!(this.projectAgent instanceof ProjectAgentService)
                || !(this.projectAgent._repository instanceof ProjectTaskRepository))) conflict();
            if (formalCommit && !tx) return this.projectAgent._repository.engine.withTransaction(handle,
                active => this.capture(handle, sourceRequest, { tx: active }));
            const { task, project } = formalCommit
                ? await ProjectAgentService.prototype.observeComputeSource.call(this.projectAgent, handle, sourceRequest.projectId, sourceRequest.taskId)
                : await this.projectAgent[tx ? 'observeComputeSource' : 'observeContext'](handle, sourceRequest.projectId, sourceRequest.taskId);
            if (project.revision.revision !== task.baseRevision || task.baseRevision !== sourceRequest.revision || task.executionFingerprint !== sourceRequest.executionFingerprint) conflict();
            if (formalCommit) {
                if (task.status !== 'review' || task.review?.required !== true || task.validation?.status !== 'passed'
                    || task.workspace?.projectId !== sourceRequest.projectId || task.workspace.baseRevision !== sourceRequest.revision
                    || sourceRequest.reviewHash !== hashNativeDocument({ workspace: task.workspace, review: task.review, validation: task.validation })) conflict();
            } else {
                try { ProjectAgentService.prototype._ensureDraftMutable.call(this.projectAgent, task); } catch (error) {
                    if (error instanceof ConflictError && ['project_agent_task_closed', 'project_agent_repair_limit', 'project_agent_review_locked', ATRIA_PROJECT_CONFLICT_CODE].includes(error.code)) conflict();
                    throw error;
                }
            }
            budgetSource = { domain: 'project', projectId: sourceRequest.projectId, taskId: sourceRequest.taskId };
            sourceRef = { projectId: sourceRequest.projectId, taskId: sourceRequest.taskId, revision: sourceRequest.revision, executionFingerprint: sourceRequest.executionFingerprint };
        } else if (sourceRequest?.domain === 'rp_chat') {
            fields(sourceRequest, ['domain', 'controlId', 'source'], 'RP SourceRequest');
            if (!(this.rpControl instanceof RpRunControl)) throw Object.assign(new TypeError('Original RP control required'), { code: 'native_orchestration_source_unavailable' });
            const context = await RpRunControl.prototype.context.call(this.rpControl, handle, sourceRequest.controlId, sourceRequest.source, tx ? { tx } : undefined);
            sourceRef = { controlId: sourceRequest.controlId, prefixDigest: context.prefixDigest };
            budgetSource = sourceRequest;
        } else throw Object.assign(new TypeError('Unsupported original source'), { code: 'native_orchestration_source_unavailable' });
        const budgetAuthorityRef = await this.budgetPort.authorityFor(handle, budgetSource, { tx });
        const binding = { sourceAuthority: sourceRequest.domain, sourceRef, sourceRequest: structuredClone(sourceRequest), budgetAuthorityRef };
        return { sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) }, budgetAuthorityRef };
    }

    async revalidate(handle, binding, options) {
        if (binding.sourceAuthority === 'project' && options?.root) {
            const { root, tx } = options;
            if (root.ownerRef.handle !== handle || hashNativeDocument(root.sourceBinding) !== hashNativeDocument(binding)) conflict();
            // A formal Commit has its own fresh Root and frozen Review source.
            // Prior Review/tool lineage is historical evidence, not permission
            // to continue once the original Task leaves its reviewed state.
            if (binding.sourceRequest.purpose === 'formal_commit') {
                if (root.parentRef !== null) conflict();
                const current = await this.capture(handle, binding.sourceRequest, { tx });
                if (hashNativeDocument(current.sourceBinding) !== hashNativeDocument(binding)) conflict();
                return current;
            }
            const check = async active => {
                let progress;
                try { progress = await readProjectOwnedSource(active, handle, root, { projectAgent: this.projectAgent }); } catch (error) {
                    if (error.code === 'native_orchestration_project_tool_receipt_invalid') conflict();
                    throw error;
                }
                const { task, project } = await ProjectAgentService.prototype.observeComputeSource.call(this.projectAgent, handle, binding.sourceRef.projectId, binding.sourceRef.taskId);
                if (task.executionFingerprint !== progress.currentFingerprint || project.revision.revision !== binding.sourceRef.revision) conflict();
                try { if (!progress.reviewSource) ProjectAgentService.prototype._ensureDraftMutable.call(this.projectAgent, task); } catch (error) {
                    if (error instanceof ConflictError && ['project_agent_task_closed', 'project_agent_repair_limit', 'project_agent_review_locked', ATRIA_PROJECT_CONFLICT_CODE].includes(error.code)) conflict();
                    throw error;
                }
                return { sourceBinding: structuredClone(binding), budgetAuthorityRef: structuredClone(binding.budgetAuthorityRef), sourceProgress: progress };
            };
            return tx ? check(tx) : this.projectAgent._repository.engine.withTransaction(handle, check);
        }
        const current = await this.capture(handle, binding.sourceRequest, options);
        if (hashNativeDocument(current.sourceBinding) !== hashNativeDocument(binding)) conflict();
        return current;
    }
}
