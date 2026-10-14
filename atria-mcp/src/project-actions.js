import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().min(1).max(2000);
const json = z.record(z.string(), z.json()).refine(value => JSON.stringify(value).length <= 64000, 'JSON exceeds bound');
const path = z.string().min(1).max(512).refine(value => !value.startsWith('/') && !value.includes('\\') && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
    && !value.includes('\0') && value.split('/').every(segment => segment && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git'), 'Safe Project source path required');
const taskInput = { projectId: id, baseRevision: id, taskId: id, expectedSequence: z.number().int().nonnegative() };
const stepId = id.optional();
const resource = { resourceType: z.enum(['core.world', 'core.knowledge', 'core.asset']), resourceId: id, revision: id, stepId };
const root = '/api/native/studio/projects';
const projectPath = input => `${root}/${input.projectId}`;
const taskPath = input => `${projectPath(input)}/agent/tasks/${input.taskId}`;

// Every method and Native tool name is fixed here. External clients cannot
// supply a generic tool name, Authoring origin, attempt identity or Host code.
const tools = [
    ['plan.set', 'atri_agent_set_plan', 'MUTATE', { summary: label, steps: z.array(z.strictObject({ id, title: label, description: z.string().max(4000).optional(), impact: z.enum(['low', 'medium', 'high']).optional() })).min(1).max(50) }],
    ['plan.reuse', 'atri_agent_reuse_plan', 'MUTATE', { sourceTaskId: id }],
    ['proposal.frontend.patch', 'atri_agent_frontend_patch', 'MUTATE', { stepId, ownerId: id.optional(), kind: z.enum(['component', 'node', 'binding', 'view', 'style', 'state', 'interaction', 'message']), id,
        componentId: id.optional(), locale: id.optional(), field: z.string().max(256).optional(), path: z.array(z.string().max(256)).max(32).optional(), value: z.json(), contentHash: hash }],
    ['proposal.project.save', 'atri_agent_project_save', 'MUTATE', { source: json, stepId }],
    ['proposal.resource.attach', 'atri_agent_resource_attach', 'MUTATE', resource],
    ['proposal.resource.fork', 'atri_agent_resource_fork', 'MUTATE', { ...resource, displayName: label.optional(), path: path.optional() }],
    ['proposal.resource.update', 'atri_agent_resource_update', 'MUTATE', { resourceType: z.enum(['core.world', 'core.knowledge']), resourceId: id, fromRevision: id, toRevision: id, stepId }],
    ['proposal.source.write', 'atri_agent_source_write', 'MUTATE', { path, content: z.string().max(64000), encoding: z.enum(['utf8', 'base64']).default('utf8'), stepId }],
    ['proposal.source.move', 'atri_agent_source_move', 'MUTATE', { path, toPath: path, stepId }],
    ['proposal.source.delete', 'atri_agent_source_delete', 'DESTRUCTIVE', { path, stepId }],
    ['operation.reset', 'atri_agent_reset_operations', 'MUTATE', {}],
    ['review.prepare', 'atri_agent_prepare_review', 'INTERACT', { entryPointId: id.optional(), simulationOptions: json.optional() }],
];

export function registerProjectActions(registry, browser) {
    const request = (method, path, body = {}, guards = {}) => requestAuthority(browser, method, path, body, guards);
    const read = async (method, path, body = {}) => {
        const result = await request(method, path, body);
        if (!result.ok || !result.serverBootId) throw new Error('Project authority unavailable: ' + result.status);
        return result;
    };
    const output = (result, evidence = {}) => {
        const data = redact(result.data ?? null);
        return { ok: result.ok, status: result.status, serverBootId: result.serverBootId,
            data: JSON.stringify(data).length <= 24000 ? data : { contentHash: fingerprint(data), omitted: 'Large Native Task response; read exact Task observation' }, receiptEvidence: evidence };
    };
    const projectGuard = async input => {
        const response = await read('GET', projectPath(input) + '/revision');
        if (response.data.revision !== input.baseRevision) throw new Error('Project baseRevision conflict.');
        return { target: { projectId: input.projectId }, serverBootId: response.serverBootId, baseRevision: input.baseRevision };
    };
    const taskGuard = async (input, { formalCommit = false, destructiveCommit = false, deleting = false } = {}) => {
        const observed = await read('GET', taskPath(input) + '/observation');
        const task = observed.data;
        if (task.projectId !== input.projectId || task.taskId !== input.taskId || task.baseRevision !== input.baseRevision || task.sequence !== input.expectedSequence) throw new Error('Project Task identity or sequence conflict.');
        if (deleting && task.storedIntegrity !== input.expectedIntegrity) throw new Error('Project Task stored integrity conflict.');
        const revision = await read('GET', projectPath(input) + '/revision');
        if (revision.serverBootId !== observed.serverBootId) throw new Error('Server changed during Project Task guard.');
        const result = { target: { projectId: input.projectId, taskId: input.taskId }, serverBootId: observed.serverBootId,
            baseRevision: input.baseRevision, currentProjectRevision: revision.data.revision, expectedSequence: input.expectedSequence,
            executionFingerprint: task.executionFingerprint, storedIntegrity: task.storedIntegrity,
            status: task.status, operationsHash: fingerprint(task.operations ?? []),
            effects: { experience: 'Native Task outcome collection may update source-bound feedback', effectPolicy: 'no-background-model' } };
        if (formalCommit) {
            if (revision.data.revision !== input.baseRevision || task.status !== 'review' || task.review?.required !== true || !task.workspace || task.validation?.status !== 'passed') throw new Error('Exact successful Project Task Review required.');
            const reviewHash = fingerprint({ workspace: task.workspace, review: task.review, validation: task.validation });
            if (reviewHash !== input.expectedReviewHash) throw new Error('Project Task Review fingerprint conflict.');
            if (!destructiveCommit && task.workspace.operations.some(operation => operation.operationType === 'source.delete')) throw new Error('Source deletion requires agent.project.commit.destructive and one-use approval.');
            if (task.preview) {
                const preview = await read('GET', '/api/native/studio/previews/' + id.parse(task.preview.previewId) + '/ui');
                if (preview.serverBootId !== observed.serverBootId || preview.data.previewId !== task.preview.previewId || preview.data.packageVersionId !== task.preview.packageVersionId) throw new Error('Project Task Preview changed or closed.');
            }
            result.review = { expectedReviewHash: reviewHash, highImpact: task.review.highImpact === true, workspaceId: task.workspace.workspaceId,
                operationSummary: task.workspace.operations.map(operation => ({ operationId: operation.operationId, operationType: operation.operationType, target: operation.target })),
                validation: { status: task.validation.status, fingerprint: fingerprint(task.validation) }, preview: task.preview ? { previewId: task.preview.previewId, packageVersionId: task.preview.packageVersionId } : null };
        }
        return result;
    };
    const add = (suffix, risk, shape, guard, run, extraGuards = [], effects = []) => registry.register({
        version: 1, id: 'agent.project.' + suffix, domain: 'agent', title: 'Native Project Agent ' + suffix, risk,
        authority: 'Native ProjectAgentService / Studio Workspace and immutable Revision', adapter: 'fixed-http', externalEffects: effects,
        guards: ['current-server-boot', 'exact-project-task-sequence', 'before-and-after-approval-authority', ...extraGuards], approval: 'trusted-approval-required',
        availability: { available: true, reason: 'Requires Native Task observation, exact CAS and separate trusted approval for this Action' },
    }, z.strictObject(shape).refine(value => JSON.stringify(value).length <= 128000, 'Task input exceeds bound'), z.json(), run,
    async input => {
        if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Product mutation guards unavailable.');
        return guard(input);
    });
    const evidence = task => ({ after: task?.taskId ? { projectId: task.projectId, taskId: task.taskId, sequence: task.sequence, status: task.status,
        baseRevision: task.baseRevision, executionFingerprint: task.executionFingerprint, changeSets: task.changeSets?.map(change => ({ changeSetId: change.changeSetId, resultingRevision: change.resultingRevision })) ?? [] } : task,
        recovery: 'Read the exact Native Task observation and Studio formal receipts before any new write; never replay an unknown Task operation.' });
    const send = async (method, path, body, before, extra = {}) => {
        const result = await request(method, path, body, before);
        return output(result, result.ok ? { ...evidence(result.data), ...extra } : {});
    };
    add('task.create', 'MUTATE', { projectId: id, baseRevision: id, intent: z.string().min(1).max(16000), maxRepairRounds: z.number().int().min(1).max(10).optional() }, projectGuard,
        async (input, { before }) => {
            const { projectId: _, ...body } = input;
            const result = await request('POST', projectPath(input) + '/agent/tasks', body, before);
            return output(result, result.ok ? { ...evidence(result.data), created: [{ kind: 'project-agent-task', id: result.data.taskId, projectId: input.projectId }] } : {});
        });
    for (const [suffix, nativeTool, risk, shape] of tools) add(suffix, risk, { ...taskInput, ...shape }, input => taskGuard(input),
        (input, { before }) => {
            const { projectId: _, baseRevision: __, taskId: ___, expectedSequence, ...args } = input;
            return send('POST', taskPath(input) + '/tool', { name: nativeTool, args, expectedSequence, effectPolicy: 'no-background-model' }, before);
        }, [], suffix === 'review.prepare' ? ['temporary-isolated-evaluation', 'native-preview-and-simulation'] : ['native-task-proposal-state']);
    add('commit', 'MUTATE', { ...taskInput, expectedReviewHash: hash }, input => taskGuard(input, { formalCommit: true }),
        (input, { before }) => send('POST', taskPath(input) + '/commit', { expectedSequence: input.expectedSequence, expectedReviewHash: input.expectedReviewHash, effectPolicy: 'no-background-model' }, before),
        ['independent-formal-commit-approval', 'review-hash-and-native-target-cas'], ['formal-project-changeset', 'native-experience-collection']);
    add('commit.destructive', 'DESTRUCTIVE', { ...taskInput, expectedReviewHash: hash }, input => taskGuard(input, { formalCommit: true, destructiveCommit: true }),
        (input, { before }) => send('POST', taskPath(input) + '/commit', { expectedSequence: input.expectedSequence, expectedReviewHash: input.expectedReviewHash, effectPolicy: 'no-background-model' }, before),
        ['independent-formal-commit-approval', 'review-hash-and-native-target-cas', 'one-use-destructive-approval'], ['formal-project-changeset', 'source-deletion', 'native-experience-collection']);
    for (const suffix of ['takeover', 'resume']) add(suffix, 'MUTATE', taskInput, input => taskGuard(input),
        (input, { before }) => send('POST', taskPath(input) + '/' + suffix, { expectedSequence: input.expectedSequence, effectPolicy: 'no-background-model' }, before));
    add('delete', 'DESTRUCTIVE', { ...taskInput, expectedIntegrity: hash }, input => taskGuard(input, { deleting: true }),
        (input, { before }) => send('DELETE', taskPath(input), { expectedIntegrity: input.expectedIntegrity }, before,
            { deleted: [{ kind: 'project-agent-task', id: input.taskId, projectId: input.projectId }] }), ['exact-stored-integrity'], ['native-task-and-dependent-experience-deletion']);
    const generation = { projectId: id, taskId: id, runtimeRouteId: id, maxModelRounds: z.number().int().min(1).max(12) };
    const generationView = input => read('POST', taskPath(input) + '/generation/preflight', { runtimeRouteId: input.runtimeRouteId, maxModelRounds: input.maxModelRounds });
    const addRead = (suffix, shape, run) => registry.register({ version: 1, id: 'agent.project.' + suffix, domain: 'agent', title: 'Native Project Agent ' + suffix,
        risk: 'READ', authority: 'Native managed Project Agent executor', adapter: 'fixed-http', externalEffects: [], guards: [], approval: 'none',
        availability: { available: true, reason: 'Pure owner-bound Native observation' } }, z.strictObject(shape), z.json(), run);
    addRead('generation.preflight', generation, async input => {
        const result = await generationView(input);
        return output({ ...result, data: { ...result.data, preflightFingerprint: fingerprint(result.data) } });
    });
    add('generation.start', 'MUTATE', { ...generation, requestId: id, expectedPreflightFingerprint: hash, acceptModelCharges: z.literal(true) }, async input => {
        const result = await generationView(input);
        if (fingerprint(result.data) !== input.expectedPreflightFingerprint) throw new Error('Exact Project generation preflight changed.');
        return { target: { projectId: input.projectId, taskId: input.taskId }, serverBootId: result.serverBootId,
            explicitModelCharges: true, requestId: input.requestId, preflight: result.data, preflightFingerprint: input.expectedPreflightFingerprint };
    }, (input, { before }) => send('POST', taskPath(input) + '/generation/start', { runtimeRouteId: input.runtimeRouteId, maxModelRounds: input.maxModelRounds,
        requestId: input.requestId, expectedPreflightFingerprint: input.expectedPreflightFingerprint }, before,
    { recovery: 'Observe exact Native operation and durable Task attempts/compute. Never replay an unknown generation. Formal Commit requires separate approval.' }),
    ['explicit-paid-model-approval', 'exact-route-provider-target-and-native-budget', 'stop-at-human-review', 'no-automatic-resend'],
    ['model-provider-charges', 'native-task-proposals', 'temporary-review-preview']);
    const operationInput = { projectId: id, taskId: id, operationId: id };
    const operationPath = input => taskPath(input) + '/generation/' + input.operationId;
    addRead('generation.status', operationInput, async input => output(await read('GET', operationPath(input) + '/status')));
    add('generation.cancel', 'INTERACT', operationInput, async input => {
        const result = await read('GET', operationPath(input) + '/status');
        if (result.data.anchor?.projectId !== input.projectId || result.data.anchor?.taskId !== input.taskId || result.data.operationId !== input.operationId) throw new Error('Native generation operation identity conflict.');
        return { target: { projectId: input.projectId, taskId: input.taskId }, serverBootId: result.serverBootId, operationId: input.operationId, anchor: result.data.anchor };
    }, (input, { before }) => send('POST', operationPath(input) + '/cancel', {}, before), ['exact-managed-operation'], ['cancel-best-effort-does-not-refund-or-undo']);
    return registry;
}
