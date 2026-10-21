import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { immutable, checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { assertOriginalProjectSourceIdentity } from './agent-intelligence/project-task-repository.js';

const comparisonAuthorities = new WeakMap();
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const sourceHash = snapshot => hash({ source: snapshot.source, files: [...snapshot.files].map(([path, bytes]) =>
    [path, createHash('sha256').update(bytes).digest('hex')]).sort(([a], [b]) => a.localeCompare(b)) });
const operationsHash = operations => hash(operations.map(({ operationId: _id, ...value }) => value));
const originalSourceIdentity = snapshot => assertOriginalProjectSourceIdentity({ sourceHash: hash(snapshot.source),
    files: [...snapshot.files].map(([path, bytes]) => [path, createHash('sha256').update(bytes).digest('hex')]).sort(([a], [b]) => a.localeCompare(b)) });

// An ordinary Studio validation consumer. Evaluation temporarily writes the
// original source store under its queue and restores it; no model, Preview,
// simulation, Task adoption, approval or commit is performed here.
export class ProjectComparisonService {
    constructor({ host }) {
        this.host = host;
        const authority = host.persistence?._engine ?? host.studio?.storageEngine ?? host.agent?._repository?.engine ?? host.studio ?? host;
        if (!authority || typeof authority !== 'object') fail('native_project_comparison_storage_unavailable');
        if (!comparisonAuthorities.has(authority)) comparisonAuthorities.set(authority, new Map());
        this.comparisons = comparisonAuthorities.get(authority);
    }

    async _capture(handle, projectId, taskId) {
        const task = await this.host.agent.observeTask(handle, projectId, taskId);
        if (task.status !== 'planning' || task.workspace || task.review || task.operations.length || task.attempts.length) fail('native_project_comparison_task_unavailable');
        const snapshot = await this.host.studio._queue(projectId, async () => {
            await this.host.studio._assertBaseRevision(handle, projectId, task.baseRevision);
            return this.host.studio._snapshot(handle, projectId);
        });
        const identity = originalSourceIdentity(snapshot);
        if (Buffer.byteLength(JSON.stringify(task)) + Buffer.byteLength(JSON.stringify(identity)) > 2 * 1024 * 1024 - 4096) fail('native_project_comparison_recovery_capacity');
        return { task, sourceHash: sourceHash(snapshot), originalSourceIdentity: identity, inputBytes: Buffer.byteLength(JSON.stringify(snapshot.source))
            + [...snapshot.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
    }

    async prepare(handle, raw, signal) {
        const input = assertJsonDeclaration(raw, 'Project comparison', 262144);
        fields(input, ['projectId', 'taskId', 'expectedSequence', 'candidates'], 'Project comparison');
        if (!Array.isArray(input.candidates) || !input.candidates.length || input.candidates.length > 8
            || new Set(input.candidates.map(candidate => candidate.id)).size !== input.candidates.length) fail('native_project_comparison_candidates_invalid');
        const captured = await this._capture(handle, input.projectId, input.taskId), { task } = captured;
        if (task.sequence !== input.expectedSequence) fail('native_project_comparison_task_conflict');
        if (!task.compute?.limits?.localWork) return immutable({ status: 'pending', reason: 'native_project_comparison_budget_unavailable' });
        const origin = { kind: 'agent', id: task.taskId }, workspaces = input.candidates.map(candidate => {
            fields(candidate, ['id', 'operations'], 'Project candidate');
            if (typeof candidate.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(candidate.id)
                || !Array.isArray(candidate.operations) || !candidate.operations.length || candidate.operations.length > 32) fail('native_project_comparison_candidates_invalid');
            if (candidate.operations.some(operation => !['source.write', 'source.move', 'source.delete', 'project.save', 'frontend.patch'].includes(operation.operationType))) fail('native_project_comparison_operation_denied');
            return { id: candidate.id, workspace: this.host.studio.createWorkspace({ projectId: input.projectId, baseRevision: task.baseRevision, origin,
                operations: candidate.operations.map(operation => ({ ...operation, origin })) }) };
        });
        const fresh = async () => {
            checkCancellation(signal);
            const current = await this._capture(handle, input.projectId, input.taskId);
            if (current.task.executionFingerprint !== task.executionFingerprint || current.sourceHash !== captured.sourceHash) fail('native_project_comparison_source_conflict');
        };
        const work = async (kind, descriptor, operation, inputBytes = Buffer.byteLength(JSON.stringify(descriptor))) => {
            await fresh();
            const attempt = { attemptId: randomUUID(), requestId: 'project-comparison:' + task.taskId, kind, estimatedItems: 1,
                estimatedInputBytes: inputBytes, targetFingerprint: hash(descriptor) };
            const receipt = await this.host.agent.chargeLocalWork(handle, input.projectId, input.taskId, task.baseRevision,
                task.compute.limits, attempt, task.executionFingerprint);
            if (!receipt) fail('native_project_comparison_budget_unavailable');
            const started = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed', restoreFailed = false;
            try {
                await fresh();
                const result = await operation();
                await fresh();
                outcome = 'completed';
                return result;
            } catch (error) {
                restoreFailed = error.code === 'native_studio_restore_failed';
                throw error;
            } finally {
                const cpuUsage = process.cpuUsage(cpu), usage = { wallMs: performance.now() - started, cpuUserMicros: cpuUsage.user,
                    cpuSystemMicros: cpuUsage.system, cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome };
                if (restoreFailed) await this.host.agent.failComparisonRecovery(handle, input.projectId, input.taskId, task.executionFingerprint, attempt.attemptId, usage, captured.originalSourceIdentity);
                else await this.host.agent.settleLocalWork(handle, input.projectId, input.taskId, attempt.attemptId, usage);
            }
        };
        await work('context_build', { projectId: input.projectId, sourceHash: captured.sourceHash, workspaces }, () => fresh(),
            captured.inputBytes + Buffer.byteLength(JSON.stringify(workspaces)));
        const evaluated = [];
        for (const candidate of workspaces) {
            const result = await work('goal_validate', candidate, () => this.host.studio.evaluateWorkspace(handle, candidate.workspace, { preview: false, simulation: false }));
            if (result.preview !== null || result.simulation !== null) fail('native_project_comparison_execution_denied');
            evaluated.push({ candidateId: candidate.id, workspace: candidate.workspace, changes: result.changes, validation: result.validation });
        }
        const accepted = evaluated.filter(candidate => candidate.validation.status === 'passed')
            .sort((a, b) => a.changes.length - b.changes.length
                || a.candidateId.localeCompare(b.candidateId));
        await fresh();
        const artifact = immutable({ schemaVersion: 1, kind: 'project_candidate_comparison', mode: 'deterministic_validation', comparisonId: randomUUID(),
            projectId: input.projectId, taskId: input.taskId, baseRevision: task.baseRevision, sourceHash: captured.sourceHash,
            taskFingerprint: task.executionFingerprint, candidates: evaluated,
            selected: accepted[0] ? { candidateId: accepted[0].candidateId, workspace: accepted[0].workspace } : null,
            uncertainty: { quality: 'not_measurable', modelPrediction: 'not_measurable', realOutcome: 'pending' } });
        if (this.comparisons.size >= 256) this.comparisons.delete(this.comparisons.keys().next().value);
        this.comparisons.set(artifact.comparisonId, { handle, artifact }); return artifact;
    }

    _stored(handle, input) {
        fields(input, ['comparisonId'], 'Project comparison inspection');
        const stored = this.comparisons.get(input.comparisonId);
        if (!stored || stored.handle !== handle) fail('native_project_comparison_missing');
        return stored.artifact;
    }

    async current(handle, input) {
        const artifact = this._stored(handle, input);
        try {
            const current = await this._capture(handle, artifact.projectId, artifact.taskId);
            return { comparisonId: artifact.comparisonId, current: current.sourceHash === artifact.sourceHash && current.task.executionFingerprint === artifact.taskFingerprint };
        } catch { return { comparisonId: artifact.comparisonId, current: false }; }
    }

    async outcome(handle, input) {
        const artifact = this._stored(handle, input);
        const task = await this.host.agent.observeTask(handle, artifact.projectId, artifact.taskId);
        if (!artifact.selected || task.status !== 'completed' || !task.workspace
            || operationsHash(task.workspace.operations) !== operationsHash(artifact.selected.workspace.operations)) return { status: 'pending', predictionError: 'not_measurable' };
        const receipt = task.changeSets.find(value => value.baseRevision === artifact.baseRevision && value.validation.status === 'passed' && value.resultingRevision);
        if (!receipt) return { status: 'pending', predictionError: 'not_measurable' };
        const actual = await this.host.studio.inspectWorkspaceReceipt(handle, task.workspace, receipt.changeSetId);
        if (!actual || actual.resultingRevision !== receipt.resultingRevision) fail('native_project_comparison_receipt_conflict');
        return immutable({ status: 'observed', comparisonId: artifact.comparisonId, candidateId: artifact.selected.candidateId,
            receipt: actual, predictionError: 'not_measurable', quality: 'not_measurable' });
    }
}
