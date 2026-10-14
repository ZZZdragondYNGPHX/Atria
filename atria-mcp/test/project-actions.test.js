import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerProjectActions } from '../src/project-actions.js';

const boot = '12345678-1234-4123-8123-123456789012';
const projectId = 'project_fixture', taskId = 'agenttask_fixture';
function fixture({ review = false, changeAfterApproval = false, missingPreview = false } = {}) {
    let approvals = 0;
    const writes = [], reviews = [];
    const task = { schemaVersion: 1, projectId, taskId, baseRevision: 'r1', sequence: 1, status: review ? 'review' : 'planned',
        executionFingerprint: 'a'.repeat(64), storedIntegrity: 'b'.repeat(64), plan: { summary: 'Edit', steps: [{ id: 'step1', title: 'Edit', description: '', impact: 'low', status: 'pending' }] },
        operations: [], workspace: null, inspection: null, validation: null, review: null, preview: null, simulation: null,
        changeSets: [], timeline: [], attempts: [], repairRound: 0, maxRepairRounds: 3, conversation: null, recovery: null, createdAt: 0, updatedAt: 0 };
    const prepare = () => {
        task.status = 'review'; task.workspace = { projectId, baseRevision: 'r1', workspaceId: 'workspace_fixture', origin: { kind: 'agent', id: taskId }, operations: [
            { operationId: 'operation1', operationType: 'source.write', target: { path: 'frontend/main.aui' }, input: { content: 'Reviewed' }, origin: { kind: 'agent', id: taskId } }] };
        task.review = { required: true, highImpact: false, preparedAt: 1 }; task.validation = { status: 'passed', diagnostics: [] };
    };
    if (review) prepare();
    const response = (data, status = 200) => ({ ok: () => status < 400, status: () => status, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }),
        body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ mutationGuards: 1, serverBootId: boot }),
        context: { request: { get: async () => response({ token: 'csrf' }), fetch: async (url, options) => {
            if (url.endsWith('/revision')) return response({ revision: 'r1' });
            if (url.endsWith('/observation')) return response(task);
            if (url.endsWith('/previews/preview_fixture/ui')) return missingPreview ? response({ error: 'Preview closed' }, 400) : response({ previewId: 'preview_fixture', packageVersionId: 'pkgv_fixture' });
            writes.push({ url, body: options.data, method: options.method });
            assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
            if (url.endsWith('/agent/tasks') && options.method === 'POST') return response(task, 201);
            if (options.method === 'DELETE') {
                assert.equal(options.data.expectedIntegrity, task.storedIntegrity);
                return response({ deleted: true });
            }
            assert.equal(options.data.expectedSequence, task.sequence);
            assert.equal(options.data.effectPolicy, 'no-background-model');
            if (url.endsWith('/tool')) {
                if (options.data.name === 'atri_agent_prepare_review') prepare();
                task.sequence++;
            } else if (url.endsWith('/commit')) {
                assert.equal(options.data.expectedReviewHash, fingerprint({ workspace: task.workspace, review: task.review, validation: task.validation }));
                task.status = 'completed'; task.sequence++;
                task.changeSets = [{ changeSetId: 'changeset1', resultingRevision: 'r2' }];
            }
            return response(task);
        } } } };
    const registry = registerProjectActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async detail => {
        approvals++; reviews.push(detail);
        if (changeAfterApproval) task.sequence++;
        return { action: 'accept', content: { authorize: true, uses: 1 } };
    } });
    return { registry, task, writes, reviews, get approvals() { return approvals; },
        run: (suffix, input = {}, risk = 'MUTATE') => executor.execute(risk, { action: 'agent.project.' + suffix, input: { projectId, baseRevision: 'r1', taskId, expectedSequence: task.sequence, ...input } }),
        create: () => executor.execute('MUTATE', { action: 'agent.project.task.create', input: { projectId, baseRevision: 'r1', intent: 'Edit frontend', maxRepairRounds: 3 } }),
    };
}
test('Task create uses Native server identity and exact Project base without inventing task state', async () => {
    const f = fixture(), result = await f.create();
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.receipt.created[0].id, taskId);
    assert.deepEqual(f.writes[0].body, { baseRevision: 'r1', intent: 'Edit frontend', maxRepairRounds: 3 });
});
test('Plan action maps only its fixed Native tool and preserves the task sequence and no-model effect policy', async () => {
    const f = fixture();
    await f.run('plan.set', { summary: 'Edit', steps: [{ id: 'step1', title: 'Edit' }] });
    assert.deepEqual(f.writes[0].body, { name: 'atri_agent_set_plan', args: { summary: 'Edit', steps: [{ id: 'step1', title: 'Edit' }] }, expectedSequence: 1, effectPolicy: 'no-background-model' });
    await assert.rejects(f.run('plan.set', { summary: 'Edit', steps: [{ id: 'step1', title: 'Edit' }], name: 'arbitrary_js' }));
    assert.equal(f.writes.length, 1);
});
test('Review and formal Commit require separate exact approvals and Native Review hash', async () => {
    const f = fixture();
    const review = await f.run('review.prepare', {}, 'INTERACT');
    assert.equal(review.receipt.status, 'succeeded'); assert.equal(f.task.status, 'review'); assert.equal(f.approvals, 1);
    const expectedReviewHash = fingerprint({ workspace: f.task.workspace, review: f.task.review, validation: f.task.validation });
    const committed = await f.run('commit', { expectedReviewHash });
    assert.equal(committed.receipt.status, 'succeeded'); assert.equal(f.approvals, 2); assert.equal(f.task.status, 'completed');
    assert.equal(f.reviews[1].before.review.expectedReviewHash, expectedReviewHash);
    assert.deepEqual(f.reviews[1].before.review.operationSummary[0].target, { path: 'frontend/main.aui' });
    assert.ok(f.registry.get('agent.project.commit').detail.guards.includes('independent-formal-commit-approval'));
});
test('Plan permission cannot imply formal Commit and an altered Review cannot be approved', async () => {
    const f = fixture();
    await assert.rejects(f.run('commit', { expectedReviewHash: 'c'.repeat(64) }), /Review required/);
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
    const ready = fixture({ review: true });
    await assert.rejects(ready.run('commit', { expectedReviewHash: 'c'.repeat(64) }), /Review fingerprint conflict/);
    assert.equal(ready.approvals, 0); assert.equal(ready.writes.length, 0);
});
test('Task sequence drift during approval prevents every subsequent Native write', async () => {
    const f = fixture({ changeAfterApproval: true });
    await assert.rejects(f.run('plan.set', { summary: 'Edit', steps: [{ id: 's', title: 'Edit' }] }), /sequence conflict/);
    assert.equal(f.approvals, 1); assert.equal(f.writes.length, 0);
});
test('destructive source proposal and Task deletion cannot run through the mutation executor', async () => {
    const f = fixture();
    await assert.rejects(f.run('proposal.source.delete', { path: 'frontend/main.aui' }), /risk mismatch/);
    await f.run('proposal.source.delete', { path: 'frontend/main.aui' }, 'DESTRUCTIVE');
    assert.equal(f.writes[0].body.name, 'atri_agent_source_delete');
    await assert.rejects(f.run('delete', { expectedIntegrity: 'c'.repeat(64) }, 'DESTRUCTIVE'), /integrity conflict/);
    await f.run('delete', { expectedIntegrity: f.task.storedIntegrity }, 'DESTRUCTIVE');
    assert.equal(f.writes[1].method, 'DELETE');
});
test('Project proposal input rejects authority spoofing and unsafe source paths', async () => {
    const f = fixture();
    for (const path of ['../secret', '/absolute', 'C:/absolute', '.git/config', 'a\\b']) await assert.rejects(f.run('proposal.source.write', { path, content: 'code' }));
    await assert.rejects(f.run('proposal.source.write', { path: 'frontend/main.aui', content: 'code', origin: { kind: 'host' } }));
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
});
test('a source deletion stays destructive when the reviewed Workspace is formally committed', async () => {
    const f = fixture({ review: true });
    f.task.workspace.operations[0].operationType = 'source.delete';
    const expectedReviewHash = fingerprint({ workspace: f.task.workspace, review: f.task.review, validation: f.task.validation });
    await assert.rejects(f.run('commit', { expectedReviewHash }), /commit.destructive/);
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
    const result = await f.run('commit.destructive', { expectedReviewHash }, 'DESTRUCTIVE');
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.approvals, 1); assert.equal(result.lease.remaining, 0);
});
test('formal Commit rejects a closed Preview before approval', async () => {
    const f = fixture({ review: true, missingPreview: true });
    f.task.preview = { previewId: 'preview_fixture', packageVersionId: 'pkgv_fixture' };
    const expectedReviewHash = fingerprint({ workspace: f.task.workspace, review: f.task.review, validation: f.task.validation });
    await assert.rejects(f.run('commit', { expectedReviewHash }), /authority unavailable/);
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
});
test('no generic tool dispatcher or attempt-only fake generation action is advertised', () => {
    const f = fixture();
    for (const suffix of ['tool', 'execute', 'generation.begin']) assert.throws(() => f.registry.get('agent.project.' + suffix), /Unknown semantic action/);
    assert.ok(f.registry.get('agent.project.generation.start').detail.guards.includes('explicit-paid-model-approval'));
    assert.equal(f.registry.get('agent.project.generation.status').detail.risk, 'READ');
    const actions = f.registry.ids();
    for (const suffix of ['proposal.frontend.patch', 'proposal.project.save', 'proposal.resource.attach', 'proposal.resource.fork', 'proposal.resource.update', 'proposal.source.move', 'plan.reuse', 'operation.reset', 'takeover', 'resume']) assert.ok(actions.includes('agent.project.' + suffix));
});
