import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services, projectSource } from '../agent-intelligence/project-fixture.js';
import { prepareControllerOwnerRoot, planFixture } from './fixtures.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { StudioService } from '../../src/native/authoring/studio-service.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { readProjectCommitDescriptor } from '../../src/native/orchestration/project-commit-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const command = () => createNativeId('orchestrationCommand');

async function fixture(make, variant = 'rename') {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const svc = services(h), source = projectSource(), projectId = source.project.projectId;
        const configuration = () => ({ resourceType: 'core.generation-profile', resource: {
            schemaVersion: 1, generationProfileId: createNativeId('generationProfile'), revision: 'r1', displayName: 'Original generation configuration', output: { maxTokens: 128 } } });
        if (['existing_resource', 'resource_change'].includes(variant)) source.resources = [configuration()];
        const project = await svc.studio.createProject(h.handle, source);
        const task = await svc.agent.createTask(h.handle, projectId, { intent: 'Review this original Project rename', baseRevision: project.revision.revision });
        await svc.agent.setPlan(h.handle, projectId, task.taskId, { summary: 'Review original Project metadata',
            steps: [{ id: 'rename', title: 'Rename Project', impact: variant === 'high_impact' ? 'high' : 'low' }] });
        const proposed = structuredClone(project.source); proposed.project.displayName = 'Reviewed published Project name';
        if (variant === 'resource_addition') proposed.resources.push(configuration());
        if (variant === 'resource_change') { proposed.resources[0].resource.revision = 'r2'; proposed.resources[0].resource.output.maxTokens = 256; }
        if (variant === 'package_change') proposed.package.name = 'Changed package identity';
        await svc.agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: proposed, stepId: 'rename' } });
        if (variant === 'extra_operation') await svc.agent.executeTool(h.handle, projectId, task.taskId,
            { name: 'atri_agent_source_write', args: { path: 'notes.txt', content: 'Additional original file operation', stepId: 'rename' } });
        const reviewed = await svc.agent.prepareReview(h.handle, projectId, task.taskId);
        expect(reviewed).toMatchObject({ status: 'review', validation: { status: 'passed' } });
        const ref = { kind: 'native_project_commit', projectId, taskId: task.taskId };
        const authoring = createOrchestrationAuthoringService(h.engine, { projectAgent: svc.agent, studio: svc.studio });
        return { h, ...svc, ...authoring, projectId, task: reviewed, ref, original: project.source,
            cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}

function planFor(f, integrity) {
    const plan = planFixture(), output = plan.definition.nodes[0], nodeId = createNativeId('orchestrationNode');
    plan.definition.nodes.unshift({ nodeId, kind: 'effect', label: 'Commit this reviewed rename', inputs: [],
        outputs: [{ name: 'result', type: 'json', required: true }], dependencyPinIds: ['commit.action'], capabilities: ['project.commit'], policy: { actionPinId: 'commit.action' } });
    output.inputs = [{ name: 'result', type: 'json', required: true }];
    plan.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'result' },
        to: { nodeId: output.nodeId, port: 'result' }, condition: 'always', maxVisits: 1, loopBack: false }];
    plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['project.commit'];
    Object.assign(plan.definition.outputContract, { resultPolicy: { outputType: 'json', maxBytes: 16384 } });
    plan.dependencyPins = [{ pinId: 'commit.action', port: 'project', resourceRef: f.ref, integrity }];
    return plan;
}

async function draft(f, plan) {
    const created = await f.plans.create(f.h.handle, command(), plan);
    return { planId: created.planId, expectedDraftVersion: created.draftVersion, expectedDefinitionHash: created.definitionHash };
}

async function observeDomain(f) {
    const rows = await f.h.engine.withTransaction(f.h.handle, async tx => ({
        runs: await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }),
        records: await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle }),
    }));
    return { ...rows, task: await f.repository.get(f.h.handle, f.projectId, f.task.taskId), history: await f.studio.history(f.h.handle, f.projectId) };
}

async function withoutExecution(f, operation) {
    const before = await observeDomain(f);
    const commit = jest.spyOn(ProjectAgentService.prototype, 'commit').mockImplementation(() => { throw new Error('Authoring must never commit'); });
    const execute = jest.spyOn(StudioService.prototype, 'executeWorkspace').mockImplementation(() => { throw new Error('Authoring must never execute Workspace'); });
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Authoring must never call a Provider'); });
    try {
        const value = await operation();
        expect(await observeDomain(f)).toEqual(before);
        expect(commit).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
        return value;
    } finally { commit.mockRestore(); execute.mockRestore(); fetch.mockRestore(); }
}

describe.each(harnesses)('$name original Project Commit Plan publication', ({ make }) => {
    test.each(['rename', 'existing_resource'])('an owned exact action pin publishes %s through the real effect to output graph without execution', async variant => {
        const f = await fixture(make, variant);
        try {
            await withoutExecution(f, async () => {
                const descriptor = await readProjectCommitDescriptor(f.h.handle, f.ref, f.agent);
                expect(descriptor).toMatchObject({ risk: 'R2', requiresApproval: true, operation: 'commit', title: 'Rename Project' });
                const plan = planFor(f, hash(descriptor)), expected = await draft(f, plan);
                const report = await f.plans.validate(f.h.handle, expected);
                expect(report.status).toBe('valid');
                const published = await f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
                expect((await f.plans.getRevision(f.h.handle, published.planRef)).definition).toEqual(plan.definition);
                expect(await f.dependencies.inspect(f.h.handle, { pinId: 'commit.action', port: 'project', resourceRef: f.ref }))
                    .toEqual({ pinId: 'commit.action', port: 'project', resourceRef: f.ref, integrity: hash(descriptor) });
            });
        } finally { await f.cleanup(); }
    });

    test('agent nodes and missing or unowned action pins cannot publish Commit capability', async () => {
        const f = await fixture(make);
        try {
            await withoutExecution(f, async () => {
                const integrity = hash(await readProjectCommitDescriptor(f.h.handle, f.ref, f.agent));
                for (const variant of ['agent', 'missing', 'unowned']) {
                    const plan = planFor(f, integrity), node = plan.definition.nodes[0];
                    if (variant === 'agent') { node.kind = 'agent'; node.policy = { agentPinId: 'commit.action' }; }
                    if (variant === 'missing') node.policy.actionPinId = 'missing.action';
                    if (variant === 'unowned') node.dependencyPinIds = [];
                    const expected = await draft(f, plan), report = await f.plans.validate(f.h.handle, expected);
                    expect(report.status).toBe('invalid');
                    await expect(f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) }))
                        .rejects.toMatchObject({ code: 'native_orchestration_validation_stale' });
                }
            });
        } finally { await f.cleanup(); }
    });

    test('foreign Task identities, unsupported references and stale hashes remain unpublished', async () => {
        const f = await fixture(make);
        try {
            const other = await f.agent.createTask(f.h.handle, f.projectId,
                { intent: 'A different original Task has no reviewed action', baseRevision: f.task.baseRevision });
            await withoutExecution(f, async () => {
                const integrity = hash(await readProjectCommitDescriptor(f.h.handle, f.ref, f.agent));
                for (const variant of ['task', 'reference', 'hash']) {
                    const plan = planFor(f, integrity), pin = plan.dependencyPins[0]; pin.resourceRef = { ...pin.resourceRef };
                    if (variant === 'task') pin.resourceRef.taskId = other.taskId;
                    if (variant === 'reference') pin.resourceRef.kind = 'unclassified_project_action';
                    if (variant === 'hash') pin.integrity = hash('different reviewed action');
                    const expected = await draft(f, plan), report = await f.plans.validate(f.h.handle, expected);
                    expect(report.status).not.toBe('valid');
                    await expect(f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) }))
                        .rejects.toMatchObject({ code: 'native_orchestration_validation_stale' });
                }
            });
        } finally { await f.cleanup(); }
    });

    test.each(['review', 'Project'])('a subsequent human %s change invalidates a previously valid publication proof', async change => {
        const f = await fixture(make);
        try {
            const integrity = hash(await readProjectCommitDescriptor(f.h.handle, f.ref, f.agent));
            const expected = await draft(f, planFor(f, integrity)), report = await f.plans.validate(f.h.handle, expected);
            expect(report.status).toBe('valid');
            if (change === 'review') await f.agent.prepareReview(f.h.handle, f.projectId, f.task.taskId);
            else {
                const next = structuredClone(f.original); next.project.displayName = 'Later human Project';
                await f.studio.saveProjectSource(f.h.handle, f.projectId, { source: next, baseRevision: f.task.baseRevision, origin: { kind: 'human' } });
            }
            await withoutExecution(f, async () => {
                expect((await f.plans.validate(f.h.handle, expected)).status).toBe('invalid');
                await expect(f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) }))
                    .rejects.toMatchObject({ code: 'native_orchestration_validation_stale' });
            });
        } finally { await f.cleanup(); }
    });

    test.each(['resource_addition', 'resource_change', 'package_change', 'extra_operation', 'high_impact'])('%s cannot be classified as a finite metadata rename', async variant => {
        const f = await fixture(make, variant);
        try {
            await withoutExecution(f, async () => {
                await expect(readProjectCommitDescriptor(f.h.handle, f.ref, f.agent))
                    .rejects.toMatchObject({ code: 'native_orchestration_project_commit_stale' });
                const expected = await draft(f, planFor(f, hash('unavailable classification'))), report = await f.plans.validate(f.h.handle, expected);
                expect(report.status).toBe('invalid');
                await expect(f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) }))
                    .rejects.toMatchObject({ code: 'native_orchestration_validation_stale' });
            });
        } finally { await f.cleanup(); }
    });
});
