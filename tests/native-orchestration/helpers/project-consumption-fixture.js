import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { RunRepository } from '../../../src/native/orchestration/run-repository.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { BudgetPort } from '../../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../../src/native/orchestration/source-port.js';
import { AttemptController } from '../../../src/native/orchestration/attempt-controller.js';
import { runGuard } from '../../../src/native/orchestration/controller-common.js';
import { withNativeResourceWrite, hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../../src/native/identity.js';
import { projectSource, services } from '../../agent-intelligence/project-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';


const command = () => createNativeId('orchestrationCommand');

// Real original Project/Task/Studio and Run authorities. The callback below
// observes original source state only; it is not a Model/Actor runtime grant.
export async function projectConsumptionFixture(make) {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const svc = services(h), original = projectSource(), projectId = original.project.projectId;
        const project = await svc.studio.createProject(h.handle, original);
        const task = await svc.agent.createTask(h.handle, projectId, { intent: 'Synthetic Project boundary intent', baseRevision: project.revision.revision });
        const budget = new BudgetPort({ projectAgent: svc.agent, projectRepository: svc.repository });
        const source = new SourcePort({ budgetPort: budget, projectAgent: svc.agent });
        const plans = createOrchestrationAuthoringService(h.engine, { projectAgent: svc.agent, studio: svc.studio }).plans;
        const plan = planFixture(), draft = await plans.create(h.handle, command(), plan);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        expect(report.status).toBe('valid');
        const { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
        const runs = new RunRepository({ engine: h.engine, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
            authorize: async ({ handle }) => { if (handle !== h.handle) throw new TypeError('Authenticated fixture owner required'); },
            admit: ({ handle, tx, sourceRequest }) => source.capture(handle, sourceRequest, { tx }) });
        const started = await runs.start(h.handle, command(), { planRef, sourceRequest: { domain: 'project', projectId, taskId: task.taskId,
            revision: task.baseRevision, executionFingerprint: task.executionFingerprint }, retentionPolicyRef: { policyId: 'synthetic_project_boundary_retention' } });
        // Activate only the capability-free fixture output node. This supplies
        // a real running Run for consumption-lock tests, never a model grant.
        const { attemptId } = await runs.beginAttempt(h.handle, command(), { ...runGuard(started), nodeId: plan.definition.entryNodeIds[0],
            inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash(started.sourceBinding), budgetRef: started.budgetAuthorityRef });
        await new AttemptController({ runs, authorizeAttempt: ({ handle, tx, root }) => source.revalidate(handle, root.sourceBinding, { tx }) })
            .activate(h.handle, { ...runGuard(await runs.get(h.handle, started.runId)), attemptId });
        const root = await runs.get(h.handle, started.runId);
        const boundary = () => source.consumptionBoundary(h.handle, root.sourceBinding, { engine: h.engine });
        const read = async ({ tx, root: current }) => {
            await source.revalidate(h.handle, current.sourceBinding, { tx });
            await budget.assertCurrent(h.handle, current.budgetAuthorityRef, { tx });
            const observed = await svc.agent.observeComputeSource(h.handle, projectId, task.taskId);
            return observed.task.intent;
        };
        const consume = async work => runs.withConsumption(h.handle, root.runId, work ?? read, { withAuthority: boundary() });
        const lock = (domain, work) => domain === 'Task'
            ? withNativeResourceWrite(h.handle, 'project-agent:' + projectId + ':' + task.taskId, work)
            : svc.studio.withProjectWrite(h.handle, projectId, work);
        const write = async domain => {
            if (domain === 'Task') return svc.agent.takeOver(h.handle, projectId, task.taskId);
            const next = structuredClone(original); next.project.displayName = 'Independent Project writer'; next.project.updatedAt = 20;
            return svc.studio.saveProjectSource(h.handle, projectId, { source: next, baseRevision: task.baseRevision, origin: { kind: 'human' } });
        };
        return { h, ...svc, budget, source, root, task, projectId, original, boundary, read, consume, lock, write,
            cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}
