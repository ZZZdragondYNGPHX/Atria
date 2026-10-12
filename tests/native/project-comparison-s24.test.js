import { jest, beforeEach, afterEach, test, expect } from '@jest/globals';
import { createGitClient } from '../../src/git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo, createNativeId } from '../../src/native/index.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { ProjectComparisonService } from '../../src/native/project-comparison.js';
import { createAuthoringOperation } from '../../public/scripts/native/studio-authoring.js';
import { assertOriginalProjectSourceIdentity, assertProjectTask } from '../../src/native/agent-intelligence/project-task-repository.js';
import fs from 'node:fs';
import path from 'node:path';

let h, projectStore, studio, agent, service, task, source, previewHost, validator, projectId;
const write = (path, content) => createAuthoringOperation({ operationType: 'source.write', target: { path }, input: { content, encoding: 'utf8' } });
const request = candidates => ({ projectId, taskId: task.taskId, expectedSequence: task.sequence, candidates });
async function setup(make = makeTempFsEngineHarness) {
    h = await make(); projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs }); previewHost = new StudioPreviewHost();
    validator = jest.fn(async ({ projectStore, handle, projectId }) => {
        const bad = await projectStore.readFile(handle, projectId, 'bad.txt');
        return bad ? [{ severity: 'error', code: 'candidate.bad', message: 'Rejected candidate' }] : [];
    });
    studio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost,
        validators: [validator], simulationRunner: jest.fn(async () => ({ status: 'completed' })) });
    agent = new ProjectAgentService({ studio, maxRepairRounds: 2, collectExperience: false });
    projectId = createNativeId('project');
    source = { format: 'atria-project-source', schemaVersion: 1, project: { projectId, packageId: createNativeId('package'), displayName: 'Comparison source', createdAt: 10, updatedAt: 10 },
        package: { name: 'Comparison', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [] };
    const created = await studio.createProject(h.handle, source, { files: new Map([['note.txt', Buffer.from('Original source')]]) });
    task = await agent.createTask(h.handle, projectId, { intent: 'Compare an explicit source change.', baseRevision: created.revision.revision });
    const initial = { attemptId: 's24-existing-budget', requestId: task.taskId, kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 1, targetFingerprint: 'a'.repeat(64) };
    await agent.chargeLocalWork(h.handle, projectId, task.taskId, task.baseRevision, { maxRequests: 2, maxTokens: 32000,
        localWork: { maxJobs: 20, maxItems: 20, maxInputBytes: 16777216 } }, initial, task.executionFingerprint);
    await agent.settleLocalWork(h.handle, projectId, task.taskId, initial.attemptId, { wallMs: 0, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' });
    task = await agent.getTask(h.handle, projectId, task.taskId);
    service = new ProjectComparisonService({ host: { studio, agent } });
}
beforeEach(() => setup());
afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });

test('bounded candidates evaluate serially without Preview, restore source and return only the least-change valid proposal', async () => {
    const preview = jest.spyOn(previewHost, 'create'), commit = jest.spyOn(studio, 'executeWorkspace'), before = await studio.getProject(h.handle, projectId);
    const artifact = await service.prepare(h.handle, request([{ id: 'big', operations: [write('note.txt', 'Bigger change'), write('extra.txt', 'extra')] },
        { id: 'rejected', operations: [write('bad.txt', 'invalid')] }, { id: 'small', operations: [write('note.txt', 'Selected proposal')] }]));
    expect(artifact.selected.candidateId).toBe('small'); expect(artifact.candidates[1].validation.status).toBe('failed');
    expect(artifact.uncertainty).toEqual({ quality: 'not_measurable', modelPrediction: 'not_measurable', realOutcome: 'pending' });
    expect(preview).not.toHaveBeenCalled(); expect(studio._simulationRunner).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
    expect(await studio.getProject(h.handle, projectId)).toEqual(before);
    expect((await projectStore.readFile(h.handle, projectId, 'note.txt')).toString()).toBe('Original source');
    expect(await projectStore.readFile(h.handle, projectId, 'extra.txt')).toBeNull();
    const currentTask = await agent.getTask(h.handle, projectId, task.taskId);
    expect(currentTask.status).toBe('planning'); expect(currentTask.operations).toEqual([]); expect(currentTask.changeSets).toEqual([]);
    expect(currentTask.compute.localWork.map(work => work.kind)).toEqual(['context_build', 'context_build', 'goal_validate', 'goal_validate', 'goal_validate']);
    expect(await service.current(h.handle, { comparisonId: artifact.comparisonId })).toMatchObject({ current: true });
    expect(await service.outcome(h.handle, { comparisonId: artifact.comparisonId })).toMatchObject({ status: 'pending', predictionError: 'not_measurable' });
    await expect(service.outcome('another-owner', { comparisonId: artifact.comparisonId })).rejects.toMatchObject({ code: 'native_project_comparison_missing' });
});

test('candidate count, injected receipt and Task sequence are rejected before evaluation', async () => {
    const evaluate = jest.spyOn(studio, 'evaluateWorkspace');
    await expect(service.prepare(h.handle, request(Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, operations: [write('note.txt', 'x')] }))))).rejects.toThrow();
    await expect(service.prepare(h.handle, { ...request([{ id: 'one', operations: [write('note.txt', 'x')] }]), expectedSequence: -1 })).rejects.toMatchObject({ code: 'native_project_comparison_task_conflict' });
    await expect(service.outcome(h.handle, { comparisonId: 'forged', receipt: {} })).rejects.toThrow(); expect(evaluate).not.toHaveBeenCalled();
});

test('comparison capabilities cross service instances only within the same storage authority and owner', async () => {
    const artifact = await service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Scoped proposal')] }]));
    const same = new ProjectComparisonService({ host: { persistence: { _engine: h.engine }, studio, agent } });
    expect(await same.current(h.handle, { comparisonId: artifact.comparisonId })).toMatchObject({ current: true });
    const foreign = await makeTempFsEngineHarness();
    try {
        const other = new ProjectComparisonService({ host: { persistence: { _engine: foreign.engine }, studio, agent } });
        await expect(other.current(h.handle, { comparisonId: artifact.comparisonId })).rejects.toMatchObject({ code: 'native_project_comparison_missing' });
        await expect(other.outcome(h.handle, { comparisonId: artifact.comparisonId })).rejects.toMatchObject({ code: 'native_project_comparison_missing' });
        await expect(same.current('another-owner', { comparisonId: artifact.comparisonId })).rejects.toMatchObject({ code: 'native_project_comparison_missing' });
    } finally { await foreign.cleanup(); }
});

test('cancellation stops between candidates and restores the evaluated temporary source', async () => {
    const controller = new AbortController(); validator.mockImplementation(async () => { controller.abort(); return []; });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'temp')] }, { id: 'two', operations: [write('extra.txt', 'unused')] }]), controller.signal)).rejects.toThrow();
    expect((await projectStore.readFile(h.handle, projectId, 'note.txt')).toString()).toBe('Original source'); expect(validator).toHaveBeenCalledTimes(1);
    expect((await agent.getTask(h.handle, projectId, task.taskId)).compute.localWork.at(-1).usage.outcome).toBe('cancelled');
});

test('Task takeover invalidates comparison before a second candidate or advice delivery', async () => {
    const evaluate = studio.evaluateWorkspace.bind(studio); let evaluated = 0;
    jest.spyOn(studio, 'evaluateWorkspace').mockImplementation(async (...args) => {
        const result = await evaluate(...args); evaluated++;
        await agent.takeOver(h.handle, projectId, task.taskId); return result;
    });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'temp')] }, { id: 'two', operations: [write('extra.txt', 'unused')] }]))).rejects.toThrow();
    expect(evaluated).toBe(1); expect((await projectStore.readFile(h.handle, projectId, 'note.txt')).toString()).toBe('Original source');
    expect((await agent.getTask(h.handle, projectId, task.taskId)).status).toBe('taken_over');
});

test('changed original source invalidates the server-stored proposal across service instances', async () => {
    const artifact = await service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'proposal')] }]));
    await projectStore.writeFile(h.handle, projectId, 'note.txt', Buffer.from('New authoritative source'));
    const freshService = new ProjectComparisonService({ host: { studio, agent } });
    expect(await freshService.current(h.handle, { comparisonId: artifact.comparisonId })).toMatchObject({ current: false });
    expect((await projectStore.readFile(h.handle, projectId, 'note.txt')).toString()).toBe('New authoritative source');
});

test('permanent restore failure durably blocks Git synchronization and the original Task without accepting temporary source', async () => {
    const revision = await studio.getRevision(h.handle, projectId), directory = projectStore.getProjectDirectory(h.handle, projectId);
    const originalRestore = studio._restore.bind(studio);
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Temporary rejected candidate')] }]))).rejects.toMatchObject({ code: 'native_studio_restore_failed', stateRestored: false });
    const storedTask = await agent._repository.get(h.handle, projectId, task.taskId);
    expect(storedTask.status).toBe('blocked'); expect(storedTask.recovery.code).toBe('comparison_source_restore_failed');
    expect(storedTask.compute.localWork.at(-1).usage.outcome).toBe('failed');
    const marker = path.join(directory, '.git', 'atria-evaluation-recovery.json');
    expect(fs.existsSync(marker)).toBe(true); expect(fs.readFileSync(marker, 'utf8')).not.toContain('Original source');
    const newStudio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
    await expect(newStudio.getRevision(h.handle, projectId)).rejects.toMatchObject({ code: 'native_studio_restore_failed' });
    const history = await createGitClient({ backend: 'builtin' }).log(directory, 2); expect(history[0].fullHash).toBe(revision.revision);
    await expect(service.prepare(h.handle, request([{ id: 'two', operations: [write('note.txt', 'Another proposal')] }]))).rejects.toThrow();
    await projectStore.writeFile(h.handle, projectId, 'note.txt', Buffer.from('Original source'));
    expect((await newStudio.getRevision(h.handle, projectId)).revision).toBe(revision.revision); expect(fs.existsSync(marker)).toBe(false);
    studio._restore = originalRestore;
});

test('a failed restore closes an already created Preview instead of leaking its lifecycle', async () => {
    const close = jest.spyOn(previewHost, 'close'); jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    const workspace = studio.createWorkspace({ projectId, baseRevision: task.baseRevision, origin: { kind: 'agent', id: task.taskId },
        operations: [write('note.txt', 'Temporary preview')].map(operation => ({ ...operation, origin: { kind: 'agent', id: task.taskId } })) });
    await expect(studio.evaluateWorkspace(h.handle, workspace, { preview: true, simulation: false })).rejects.toMatchObject({ code: 'native_studio_restore_failed' });
    expect(close).toHaveBeenCalledTimes(1);
});

test('Preview cleanup failure cannot bypass source restoration or replace a restore failure', async () => {
    const workspace = studio.createWorkspace({ projectId, baseRevision: task.baseRevision, origin: { kind: 'agent', id: task.taskId },
        operations: [write('note.txt', 'Temporary preview')].map(operation => ({ ...operation, origin: { kind: 'agent', id: task.taskId } })) });
    studio._simulationRunner.mockRejectedValue(new Error('Simulation fault after Preview creation'));
    jest.spyOn(previewHost, 'close').mockImplementation(() => { throw new Error('Injected cleanup failure'); });
    await expect(studio.evaluateWorkspace(h.handle, workspace, { preview: true, simulation: true })).rejects.toMatchObject({ code: 'native_studio_preview_cleanup_failed', stateRestored: true });
    expect((await projectStore.readFile(h.handle, projectId, 'note.txt')).toString()).toBe('Original source');
    expect((await studio.getRevision(h.handle, projectId)).revision).toBe(task.baseRevision);
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    await expect(studio.evaluateWorkspace(h.handle, workspace, { preview: true, simulation: false })).rejects.toMatchObject({ code: 'native_studio_restore_failed', stateRestored: false, cleanupFailed: true });
});

test('interrupted marker rename stays typed and its residual temp file blocks a fresh Studio', async () => {
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    const rename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (String(to).endsWith('atria-evaluation-recovery.json')) throw new Error('Marker rename fault');
        return rename(from, to);
    });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Temporary candidate')] }]))).rejects.toMatchObject({ code: 'native_studio_restore_failed', stateRestored: false });
    const marker = path.join(projectStore.getProjectDirectory(h.handle, projectId), '.git', 'atria-evaluation-recovery.json');
    expect(fs.existsSync(marker + '.tmp')).toBe(true); fs.unlinkSync(marker);
    const freshStudio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
    await expect(freshStudio.getRevision(h.handle, projectId)).rejects.toMatchObject({ code: 'native_studio_restore_failed' });
    expect((await agent._repository.get(h.handle, projectId, task.taskId)).status).toBe('blocked');
});

test('failed temp-marker write falls back to a durable marker and retains the typed restore failure', async () => {
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    const writeFile = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
        if (String(file).endsWith('atria-evaluation-recovery.json.tmp')) throw new Error('Temp marker write fault');
        return writeFile(file, ...args);
    });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Temporary candidate')] }]))).rejects.toMatchObject({ code: 'native_studio_restore_failed', recoveryMarkerPersisted: true });
    expect((await agent._repository.get(h.handle, projectId, task.taskId)).compute.localWork.at(-1).usage.outcome).toBe('failed');
    expect(fs.existsSync(path.join(projectStore.getProjectDirectory(h.handle, projectId), '.git', 'atria-evaluation-recovery.json'))).toBe(true);
});

test('both metadata writes failing still preserve original source identity in Task CAS and block a fresh Studio until exact recovery', async () => {
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    const writeFile = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
        if (String(file).includes('atria-evaluation-recovery.json')) throw new Error('Both metadata paths denied');
        return writeFile(file, ...args);
    });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Unrestored temporary candidate')] }]))).rejects.toMatchObject({ code: 'native_studio_restore_failed', recoveryMarkerPersisted: false });
    const stored = await agent._repository.get(h.handle, projectId, task.taskId);
    expect(stored.status).toBe('blocked'); expect(stored.compute.localWork.at(-1).usage.outcome).toBe('failed');
    expect(stored.recovery.originalSourceIdentity.files).toEqual([['note.txt', expect.stringMatching(/^[a-f0-9]{64}$/)]]);
    expect(stored.timeline.findLast(event => event.type === 'recovery').originalSourceIdentity).toBeUndefined();
    expect(JSON.stringify(stored.recovery)).not.toContain('Original source');
    const freshStudio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
    await expect(freshStudio.getRevision(h.handle, projectId)).rejects.toMatchObject({ code: 'native_studio_restore_failed' });
    expect((await createGitClient({ backend: 'builtin' }).log(projectStore.getProjectDirectory(h.handle, projectId), 1))[0].fullHash).toBe(task.baseRevision);
    await projectStore.writeFile(h.handle, projectId, 'note.txt', Buffer.from('Original source'));
    expect((await freshStudio.getRevision(h.handle, projectId)).revision).toBe(task.baseRevision);
    const recovered = await agent._repository.get(h.handle, projectId, task.taskId);
    expect(recovered.status).toBe('blocked'); expect(recovered.recovery.originalSourceIdentity).toBeUndefined();
    expect(recovered.compute).toEqual(stored.compute);
    expect((await agent.takeOver(h.handle, projectId, task.taskId)).status).toBe('taken_over');
});

test('recovery identity schema stays bounded and compatible; memory blocking keys include owner', async () => {
    const original = await agent._repository.get(h.handle, projectId, task.taskId);
    expect(assertProjectTask({ ...original, recovery: { status: 'interrupted', code: 'legacy_recovery' } })).toBeDefined();
    for (const file of ['../outside', '.git/config', 'C:/absolute', 'a\\b']) {
        expect(() => assertOriginalProjectSourceIdentity({ sourceHash: 'a'.repeat(64), files: [[file, 'b'.repeat(64)]] })).toThrow();
    }
    studio._evaluationRecovery.set(JSON.stringify(['another-owner', projectId]), { handle: 'another-owner', projectId, baseRevision: task.baseRevision, source: { sourceHash: 'a'.repeat(64), files: [] } });
    expect((await studio.getRevision(h.handle, projectId)).revision).toBe(task.baseRevision);
});

test('unavailable Task recovery persistence reports failure and retains the original charged cost', async () => {
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    const save = agent._repository.save.bind(agent._repository);
    jest.spyOn(agent._repository, 'save').mockImplementation(async (owner, value, integrity) => {
        if (value.recovery?.originalSourceIdentity) throw new Error('Task persistence unavailable');
        return save(owner, value, integrity);
    });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Unrestored temporary candidate')] }]))).rejects.toMatchObject({ code: 'native_project_comparison_recovery_persistence_failed', taskRecoveryPersisted: false, settlementPersisted: false });
    const stored = await agent._repository.get(h.handle, projectId, task.taskId);
    expect(stored.compute.localWork.at(-1)).toMatchObject({ status: 'charged', usage: null });
    expect(stored.recovery).toBeNull(); expect(stored.changeSets).toEqual([]);
});

test('SQLite original Task CAS settles failed comparison cost and durable marker prevents Git synchronization', async () => {
    await h.cleanup(); await setup(makeTempSqliteEngineHarness);
    jest.spyOn(studio, '_restore').mockRejectedValue(new Error('Permanent restore fault'));
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'SQL temporary candidate')] }]))).rejects.toMatchObject({ code: 'native_studio_restore_failed' });
    const stored = await agent._repository.get(h.handle, projectId, task.taskId);
    expect(stored.status).toBe('blocked'); expect(stored.compute.localWork.at(-1).usage.outcome).toBe('failed');
    const freshStudio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
    await expect(freshStudio.getRevision(h.handle, projectId)).rejects.toMatchObject({ code: 'native_studio_restore_failed' });
    expect((await createGitClient({ backend: 'builtin' }).log(projectStore.getProjectDirectory(h.handle, projectId), 1))[0].fullHash).toBe(task.baseRevision);
});

test('Library-changing resource operations are outside the source restore boundary', async () => {
    await expect(service.prepare(h.handle, request([{ id: 'library', operations: [{ ...write('note.txt', 'x'), operationType: 'resource.attach' }] }]))).rejects.toMatchObject({ code: 'native_project_comparison_operation_denied' });
});

test('first restore failure repairs original bytes under the queue but reports failure and retains admitted cost', async () => {
    const restore = studio._restore.bind(studio); let failed = false;
    jest.spyOn(studio, '_restore').mockImplementation(async (...args) => { if (!failed) { failed = true; throw new Error('Injected restore interruption'); } return restore(...args); });
    await expect(service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'temporary candidate')] }]))).rejects.toMatchObject({ code: 'native_studio_restore_interrupted', stateRestored: true });
    expect((await projectStore.readFile(h.handle, projectId, 'note.txt')).toString()).toBe('Original source');
    expect((await agent.getTask(h.handle, projectId, task.taskId)).compute.localWork.at(-1).usage.outcome).toBe('failed');
});

test('selected proposal requires original Task plan, Review and formal commit; feedback reads its real Git receipt', async () => {
    const artifact = await service.prepare(h.handle, request([{ id: 'one', operations: [write('note.txt', 'Selected proposal')] }]));
    await agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_set_plan', args: { summary: 'Apply the proposal after review', steps: [{ id: 'edit', title: 'Edit source', impact: 'low' }] } });
    await agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_source_write', args: { path: 'note.txt', content: 'Selected proposal', stepId: 'edit' } });
    expect(await service.current(h.handle, { comparisonId: artifact.comparisonId })).toMatchObject({ current: false });
    await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toThrow();
    await agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_prepare_review', args: {} });
    expect(await service.outcome(h.handle, { comparisonId: artifact.comparisonId })).toMatchObject({ status: 'pending' });
    const committed = await agent.commit(h.handle, projectId, task.taskId);
    const outcome = await service.outcome(h.handle, { comparisonId: artifact.comparisonId });
    expect(outcome).toMatchObject({ status: 'observed', candidateId: 'one', predictionError: 'not_measurable', receipt: { resultingRevision: committed.changeSets[0].resultingRevision } });
});
