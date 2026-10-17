import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { ResourceCenterService } from '../../src/storage/resource-center.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, nativeRecord } from '../../src/native/repositories/common.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { recoveryKey, RECOVERY_PROTOCOL } from '../../src/native/recovery-roots.js';
import { services as projectServices, projectSource } from '../agent-intelligence/project-fixture.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { AgentExperienceRepository } from '../../src/native/agent-intelligence/experience-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

async function fixture(make, knownUsage) {
    let proposal;
    return projectReadFixture(make, { maxModelRounds: 3, configurePlan: async args => {
        proposal = structuredClone(args.original); proposal.project.displayName = 'Retained original Project proposal';
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
        Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
        await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
        const { definition } = args.plan, node = definition.nodes[0];
        node.inputs.push({ name: 'continuation', type: 'json', required: false });
        definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
            to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 2, loopBack: true });
        definition.limits.maxLoopIterations = 2; definition.limits.maxEdgeVisits = Math.max(definition.limits.maxEdgeVisits, 3);
    }, responseBody: ({ index }) => ({ id: 'retention-response-' + index, status: 'completed', output: [{ id: 'retention-item-' + index,
        type: 'function_call', status: 'completed', call_id: 'retention-call-' + index,
        name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][index],
        arguments: JSON.stringify(index === 0 ? { summary: 'Original retained Review', steps: [{ id: 'rename', title: 'Rename Project', impact: 'low' }] }
            : index === 1 ? { source: proposal, stepId: 'rename' } : {}) }],
    ...knownUsage || index < 2 ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {} }) });
}

describe.each(harnesses)('$name original Project orchestration retention in Storage Center', ({ make }) => {
    test('the original preparing checkpoint refuses a new Host Run during final source-file verification', async () => {
        const f = await projectReadFixture(make);
        try {
            installAccountQuota(f.h.engine, { directoriesByHandle: () => f.h.dirs, limit: async () => -1, makeDefault: true });
            await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                { summary: 'Ready for an original Host round', steps: [{ id: 'read', title: 'Read this Project' }] });
            const center = new ResourceCenterService({ engine: f.h.engine, directoriesByHandle: () => f.h.dirs,
                quotaLimit: async () => -1, projects: f.studio._projects, studio: f.studio, assets: f.studio._assets, graph: null });
            const target = { type: 'project', id: f.projectId }, inspected = await center.recovery.inspect(f.h.handle, target);
            expect(inspected.allowed).toBe(true);
            const finish = center.recovery.finishProjectRemoval;
            center.recovery.finishProjectRemoval = async () => { throw new Error('After original durable preparation'); };
            await expect(center.recovery.trash(f.h.handle, target, inspected.version, 'reentry-while-preparing'))
                .rejects.toThrow('After original durable preparation');
            center.recovery.finishProjectRemoval = finish;
            await expect(f.run()).rejects.toMatchObject({ name: 'NotFoundError', resource: 'native studio project' });
            const prepared = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(recoveryKey(f.h.handle, 'reentry-while-preparing')));
            const verify = center.recovery.verifySourceFiles, getProject = f.studio.getProject;
            let reentry, entered;
            const queued = new Promise(resolve => { entered = resolve; });
            f.studio.getProject = function (...args) {
                const result = getProject.apply(this, args); entered(); return result;
            };
            center.recovery.verifySourceFiles = async function (...args) {
                await verify.apply(this, args);
                reentry = f.run().then(value => ({ value }), error => ({ error }));
                // A new Host must queue its original Project preflight. Wait
                // for that actual admission request, never its blocked result.
                await queued;
            };
            const retained = await center.recovery.lock(f.h.handle, target,
                () => center.recovery.finishProjectRemoval(f.h.handle, prepared.doc));
            expect((await reentry).error).toMatchObject({ name: 'NotFoundError', resource: 'native studio project' });
            expect(retained.state).toBe('retained'); expect(f.requests).toHaveLength(0); expect(f.effects).toHaveLength(0);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))).toEqual([]);
            expect(await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).toBeNull();
            const restore = await center.recovery.preflightRestore(f.h.handle, retained.id);
            await center.recovery.restore(f.h.handle, retained.id, restore.version);
            const original = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(original).toMatchObject({ taskId: f.task.taskId, status: 'blocked', attempts: [] });
            expect(original.compute).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test.each(['run', 'source'])('%s appearing during original delete cleanup is checked again before Task removal', async change => {
        const f = await projectReadFixture(make), purge = AgentExperienceRepository.prototype.purgeSource;
        const before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
        let changed = false;
        AgentExperienceRepository.prototype.purgeSource = async function (...args) {
            if (!changed && args[0] === f.h.handle && args[1] === 'project_task' && args[2] === f.task.taskId) {
                changed = true;
                if (change === 'run') await f.run();
                else await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                    { summary: 'Human edit during original delete cleanup', steps: [{ id: 'human', title: 'Keep this new plan' }] });
            }
            return purge.apply(this, args);
        };
        try {
            await expect(f.agent.deleteTask(f.h.handle, f.projectId, f.task.taskId, change === 'run' ? undefined : hash(before)))
                .rejects.toMatchObject({ code: change === 'run' ? 'project_task_orchestration_referenced' : 'project_task_retention_conflict' });
            expect(changed).toBe(true);
            const kept = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(kept.taskId).toBe(f.task.taskId);
            expect({ requests: f.requests.length, evidence: change === 'run' ? kept.compute.attempts[0].status : kept.plan.summary })
                .toEqual(change === 'run' ? { requests: 1, evidence: 'settled' }
                    : { requests: 0, evidence: 'Human edit during original delete cleanup' });
        } finally { AgentExperienceRepository.prototype.purgeSource = purge; await f.cleanup(); }
    });

    test('an unreferenced original Project and Task still recycle and restore their exact identities', async () => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const { studio, agent, repository } = projectServices(h), source = projectSource(), projectId = source.project.projectId;
            const project = await studio.createProject(h.handle, source);
            const task = await agent.createTask(h.handle, projectId, { intent: 'Recover this exact Task', baseRevision: project.revision.revision });
            await agent.takeOver(h.handle, projectId, task.taskId);
            const original = await repository.get(h.handle, projectId, task.taskId);
            const center = new ResourceCenterService({ engine: h.engine, directoriesByHandle: () => h.dirs,
                quotaLimit: async () => -1, projects: studio._projects, studio, assets: studio._assets, graph: null });
            const preview = await center.preview(h.handle, 'trash', [{ type: 'project', id: projectId }]);
            const trashed = await center.run(h.handle, preview.id);
            expect(trashed.items[0].status).toBe('succeeded');
            expect(await repository.get(h.handle, projectId, task.taskId)).toBeNull();
            expect(await studio._projects.get(h.handle, projectId)).toBeNull();
            const retained = (await center.recovery.list(h.handle))[0];
            const restore = await center.preview(h.handle, 'restore', [{ type: 'recovery', id: retained.id }]);
            expect((await center.run(h.handle, restore.id)).items[0].status).toBe('succeeded');
            expect(await repository.get(h.handle, projectId, task.taskId)).toEqual(original);
            expect((await studio.getProject(h.handle, projectId)).source).toEqual(project.source);
            expect((await studio.getRevision(h.handle, projectId)).revision).toBe(project.revision.revision);
            expect(await center.recovery.list(h.handle)).toEqual([]);
        } finally { await h.engine.close(); await h.cleanup(); }
    });

    test('the direct original Task deletion cannot remove its retained Run bank', async () => {
        const f = await projectReadFixture(make);
        try {
            await f.run();
            const original = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(original.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            await expect(f.agent.deleteTask(f.h.handle, f.projectId, f.task.taskId, hash(original)))
                .rejects.toMatchObject({ code: 'project_task_orchestration_referenced' });
            expect(await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).toEqual(original);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each([true, false])('Review bank with known usage=%s remains live while its original Run history is retained', async knownUsage => {
        const f = await fixture(make, knownUsage);
        try {
            await f.run();
            let root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const original = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(original.status).toBe('review');
            expect(root.status === 'completed').toBe(knownUsage);
            expect(original.compute.attempts.at(-1).status).toBe(knownUsage ? 'settled' : 'unknown');
            root = knownUsage ? root : await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'),
                { ...runGuard(root), reasonCode: 'cancel_unknown_project_history' });
            expect(root.status).toBe(knownUsage ? 'completed' : 'cancelled');
            const sibling = await f.agent.createTask(f.h.handle, f.projectId, { intent: 'Unreferenced sibling may be deleted', baseRevision: f.task.baseRevision });
            const originalSibling = await f.repository.get(f.h.handle, f.projectId, sibling.taskId);
            await expect(f.agent.deleteTask(f.h.handle, f.projectId, sibling.taskId, hash(originalSibling))).resolves.toBe(true);
            const center = new ResourceCenterService({ engine: f.h.engine, directoriesByHandle: () => f.h.dirs,
                quotaLimit: async () => -1, projects: f.studio._projects, studio: f.studio, assets: f.studio._assets, graph: null });
            const target = { type: 'project', id: f.projectId };
            const preview = await center.preview(f.h.handle, 'trash', [target]);
            const result = await center.run(f.h.handle, preview.id);
            // Both the public preview and the concrete original recovery
            // authority must refuse before moving .git or its Task bank.
            expect(result.items[0]).toMatchObject({ status: 'blocked', reason: 'native_project_orchestration_referenced' });
            expect(await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).toEqual(original);
            expect(await f.studio._projects.get(f.h.handle, f.projectId)).not.toBeNull();
            expect(await center.recovery.list(f.h.handle)).toEqual([]);
            await expect(center.recovery.trash(f.h.handle, target, preview.items[0].version, 'retained-project-direct'))
                .rejects.toMatchObject({ code: 'native_project_orchestration_referenced' });
            expect((await f.authority.execution.runs.get(f.h.handle, root.runId)).stateVersion).toBe(root.stateVersion);
            // A durable preparation from before the retention guard existed
            // must be refused by the original resume path before file moves.
            const prepared = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const closure = await center.recovery.capture(tx, f.h.handle, target);
                const doc = { protocol: RECOVERY_PROTOCOL, type: 'recovery', id: 'older-project-preparation', owner: f.h.handle,
                    state: 'preparing', target, name: closure.name, records: closure.records, files: closure.files,
                    dependencies: closure.dependencies, dependencyChecks: closure.dependencyChecks, hashes: closure.hashes,
                    version: closure.version, createdAt: Date.now(), expiresAt: Date.now() + 86400000, effectPolicy: 'no-background-model' };
                await tx.putResource(recoveryKey(f.h.handle, doc.id), nativeRecord(doc));
                return doc;
            });
            await expect(center.recovery.lock(f.h.handle, target, () => center.recovery.finishProjectRemoval(f.h.handle, prepared)))
                .rejects.toMatchObject({ code: 'native_project_orchestration_referenced' });
            expect(await f.studio._projects.get(f.h.handle, f.projectId)).not.toBeNull();
            expect(await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).toEqual(original);
            expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);
});
