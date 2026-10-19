import path from 'node:path';
import storage from 'node-persist';
import request from 'supertest';
import { getPasswordHash, getPasswordSalt, toKey } from '../../../src/users.js';
import { services, projectSource } from '../../agent-intelligence/project-fixture.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../../src/native/identity.js';
import { NativeProjectCommitAuthority } from '../../../src/native/orchestration/native-project-commit-authority.js';
import { readProjectCommitDescriptor, projectCommitReviewHash } from '../../../src/native/orchestration/project-commit-contracts.js';
import { getNativeReviewOrigin } from '../../../src/native/orchestration/review-origin.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';

const command = () => createNativeId('orchestrationCommand');
export async function projectCommitAccount(h) {
    // Synthetic accounts have no TTL. Their temporary directory is removed
    // after each fixture, so no maintenance timer may outlive that fixture.
    await storage.init({ dir: path.join(h.dataRoot, 'commit-review-test-accounts'), expiredInterval: 0, writeQueue: false });
    storage.stopWriteQueueInterval();
    const salt = getPasswordSalt(), account = { handle: h.handle, enabled: true, admin: false, salt, password: getPasswordHash('project-commit-test-password', salt) };
    await storage.setItem(toKey(h.handle), account); return account;
}

export async function publishProjectCommitPlan(h, { agent, studio, task, maxBytes = 16384 }) {
    const plans = createOrchestrationAuthoringService(h.engine, { projectAgent: agent, studio: studio }).plans;
    const plan = planFixture(), output = plan.definition.nodes[0], nodeId = createNativeId('orchestrationNode'), pinId = 'project.commit';
    const ref = { kind: 'native_project_commit', projectId: task.projectId, taskId: task.taskId }, descriptor = await readProjectCommitDescriptor(h.handle, ref, agent);
    plan.definition.nodes = [{ nodeId, kind: 'effect', label: 'Original user Project Commit', inputs: [], outputs: [{ name: 'result', type: 'json', required: true }],
        dependencyPinIds: [pinId], capabilities: ['project.commit'], policy: { actionPinId: pinId } }, { ...output, inputs: [{ name: 'result', type: 'json', required: true }] }];
    plan.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'result' }, to: { nodeId: output.nodeId, port: 'result' }, condition: 'always', maxVisits: 1, loopBack: false }];
    plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['project.commit']; plan.definition.limits.maxSteps = 100;
    Object.assign(plan.definition.outputContract, { kind: 'result', resultPolicy: { outputType: 'json', maxBytes } });
    plan.dependencyPins = [{ pinId, port: 'project', resourceRef: ref, integrity: hash(descriptor) }];
    const draft = await plans.create(h.handle, command(), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
    const report = await plans.validate(h.handle, expected);
    if (report.status !== 'valid') throw new Error('Commit Plan validation failed: ' + JSON.stringify(report.issues));
    const { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
    return { plans, planRef };
}

export async function approveProjectCommit(h, authority, prepared) {
    const review = getNativeReviewOrigin(authority.engine), launch = await review.launch(h.handle, { runId: prepared.runId, approvalId: prepared.approvalId }), client = request.agent(review.origin);
    const bootstrap = await client.get(new URL(launch.url).pathname + new URL(launch.url).search).expect(200);
    const post = (name, body = {}) => client.post('/review/' + name).set('Origin', review.origin).set('X-Atria-Review-CSRF', bootstrap.body.csrfToken).send(body);
    await post('reauthenticate', { password: 'project-commit-test-password' }).expect(200);
    const details = (await post('details').expect(200)).body.outcome;
    await post('decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' }).expect(200);
    return details;
}

export async function projectCommitFixture(make, { maxBytes = 16384, configureSource = () => {}, propose = null, onReviewed = async () => {} } = {}) {
    const h = await make(); let svc, authority, coldEngine;
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: h.directoriesByHandle ?? (() => h.dirs) });
        const account = await projectCommitAccount(h);
        svc = services(h); const source = projectSource(); await configureSource(source); const projectId = source.project.projectId;
        const created = await svc.studio.createProject(h.handle, source);
        const initial = await svc.agent.createTask(h.handle, projectId, { intent: 'Rename this test Project after trusted approval', baseRevision: created.revision.revision });
        await svc.agent.setPlan(h.handle, projectId, initial.taskId, { summary: 'Rename Project metadata', steps: [{ id: 'rename', title: 'Rename Project', impact: 'low' }] });
        const proposed = structuredClone((await svc.studio.getProject(h.handle, projectId)).source);
        if (propose) await propose(proposed);
        else { proposed.project.displayName = 'Approved synthetic Project name'; proposed.project.updatedAt = 20; }
        await svc.agent.executeTool(h.handle, projectId, initial.taskId, { name: 'atri_agent_project_save', args: { source: proposed, stepId: 'rename' } });
        const task = await svc.agent.prepareReview(h.handle, projectId, initial.taskId, {});
        await onReviewed({ h, ...svc, projectId, task });
        const { plans, planRef } = await publishProjectCommitPlan(h, { ...svc, task, maxBytes });
        authority = new NativeProjectCommitAuthority({ engine: h.engine, projectAgent: svc.agent, plans });
        const input = { commandId: command(), planRef, projectId, taskId: task.taskId, expectedSequence: task.sequence,
            expectedReviewHash: projectCommitReviewHash(task), computeBudget: { maxRequests: 1, maxTokens: 1, localWork: { maxJobs: 4, maxItems: 16, maxInputBytes: 16777216 } } };
        const fixture = { h, source, proposed, task, projectId, taskId: task.taskId, input, account, planRef,
            get agent() { return svc.agent; }, get studio() { return svc.studio; }, get authority() { return authority; },
            prepare: () => authority.prepare(h.handle, input), dispatch: prepared => authority.dispatch(h.handle, { runId: prepared.runId, effectId: prepared.effectId }),
            observe: prepared => authority.observe(h.handle, { runId: prepared.runId, effectId: prepared.effectId }),
            approve: prepared => approveProjectCommit(h, authority, prepared),
            cold: async () => {
                await getNativeReviewOrigin(authority.engine).close(); await authority.engine.close();
                coldEngine = new h.engine.constructor({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: h.directoriesByHandle ?? (() => h.dirs) });
                attachNativeHostLifecycle(coldEngine, { directoriesByHandle: h.directoriesByHandle ?? (() => h.dirs) }); svc = services({ ...h, engine: coldEngine });
                authority = new NativeProjectCommitAuthority({ engine: coldEngine, projectAgent: svc.agent });
            },
            cleanup: async () => { await getNativeReviewOrigin(authority.engine).close(); await coldEngine?.close(); await h.engine.close(); await h.cleanup(); } };
        return fixture;
    } catch (error) { await coldEngine?.close(); await h.engine.close(); await h.cleanup(); throw error; }
}
