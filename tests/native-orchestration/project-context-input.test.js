import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { buildNativeProjectModelRound } from '../../public/shared/project-agent-prompt.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

async function fixture(make) {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const svc = services(h), source = projectSource(), projectId = source.project.projectId;
        const project = await svc.studio.createProject(h.handle, source);
        const task = await svc.agent.createTask(h.handle, projectId, { intent: 'Original Project intent sentinel', baseRevision: project.revision.revision });
        return { ...svc, h, projectId, task, cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name)))('$name original Project model inputs', ({ make }) => {
    test('reads original prompt inputs inside Engine scope without recovery, history initialization, graph scan or cache publication', async () => {
        const f = await fixture(make), before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
        const context = await f.agent.getContext(f.h.handle, f.projectId, f.task.taskId), expected = buildNativeProjectModelRound({ context });
        const queued = f.studio.getProject, recover = f.agent._recover, persist = f.agent._persist, history = f.studio._ensureHistory, graph = f.studio._resourceGraph.refresh;
        try {
            f.studio.getProject = f.agent._recover = f.agent._persist = f.studio._ensureHistory = f.studio._resourceGraph.refresh = () => { throw new Error('Unexpected writer/scan during pure Context read'); };
            const observed = await f.h.engine.withTransaction(f.h.handle, () => f.agent.observeModelContext(f.h.handle, f.projectId, f.task.taskId));
            const prepared = buildNativeProjectModelRound({ context: observed });
            expect(prepared).toEqual(expected); expect(prepared.system).toContain('Original Project intent sentinel');
            expect(prepared.system).toContain('You cannot commit. Stop at Review');
            expect(prepared.tools.some(tool => tool.function.name.includes('commit'))).toBe(false);
            expect(await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).toEqual(before);
        } finally {
            f.studio.getProject = queued; f.agent._recover = recover; f.agent._persist = persist; f.studio._ensureHistory = history; f.studio._resourceGraph.refresh = graph;
            await f.cleanup();
        }
    });

    test('original local bank sequence changes preserve the actual prompt and domain fingerprint', async () => {
        const f = await fixture(make);
        try {
            const started = await f.agent.beginGeneration(f.h.handle, f.projectId, f.task.taskId, { expectedSequence: f.task.sequence });
            await f.agent.recordGenerationRequest(f.h.handle, f.projectId, f.task.taskId, started.attempts.at(-1).attemptId, 'project-context-request');
            const before = await f.agent.observeModelContext(f.h.handle, f.projectId, f.task.taskId);
            const limits = { maxRequests: 2, maxTokens: 2000, localWork: { maxJobs: 4, maxItems: 10, maxInputBytes: 10000 } };
            const attemptId = 'project-context-local';
            await f.agent.chargeLocalWork(f.h.handle, f.projectId, f.task.taskId, f.task.baseRevision, limits,
                { attemptId, requestId: 'project-context-request', kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 16, targetFingerprint: hash('original-project-context') }, before.task.executionFingerprint);
            await f.agent.settleLocalWork(f.h.handle, f.projectId, f.task.taskId, attemptId, { wallMs: 1, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' });
            const after = await f.agent.observeModelContext(f.h.handle, f.projectId, f.task.taskId);
            expect(after.task.sequence).toBeGreaterThan(before.task.sequence);
            expect(after.task.executionFingerprint).toBe(before.task.executionFingerprint); expect(after.task.conversation).toEqual(before.task.conversation);
            expect(after.task.compute.localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(buildNativeProjectModelRound({ context: after })).toEqual(buildNativeProjectModelRound({ context: before }));
        } finally { await f.cleanup(); }
    });
});

function runnerFixture() {
    const events = [], task = { taskId: 'task', projectId: 'project', intent: 'Original runner intent', status: 'working', baseRevision: 'revision', sequence: 0,
        attempts: [], conversation: [{ role: 'user', content: 'Stored conversation sentinel' }], plan: null, operations: [], validation: null, repairRound: 0, maxRepairRounds: 2 };
    const context = { task, project: { source: { project: { projectId: 'project' }, package: {} }, files: [] }, tools: [], registry: { descriptors: [] } };
    const client = { getAgentContext: async () => context, resumeAgentTask: async () => task, preflight: async () => ({}),
        beginAgentGeneration: async () => { events.push('begin'); task.attempts.push({ attemptId: 'original-attempt' }); return task; },
        finishAgentGeneration: async (_project, _task, input) => { events.push('finish:' + input.status); task.conversation = input.conversation; return task; } };
    return { events, task, context, client, work: async () => [], request: async () => ({ routes: [] }) };
}

test('an explicit Native tool scope suppresses implicit Skill and unrelated tool instructions while preserving original assembly without a scope', () => {
    const { context } = runnerFixture();
    const tool = { type: 'function', function: { name: 'atri_agent_get_project', description: 'Original read', parameters: { type: 'object' } } };
    const round = buildNativeProjectModelRound({ context, tools: [tool] });
    expect(round.tools).toEqual([tool]); expect(round.system).toContain('Only these tools are authorized');
    for (const name of ['atri_agent_api_catalog', 'atri_agent_frontend_patch', 'atri_agent_skill_files', 'atri_agent_read_skill', 'atri_agent_set_plan', 'atri_agent_prepare_review'])
        expect(round.system).not.toContain(name);
    expect(buildNativeProjectModelRound({ context, tools: [] }).tools).toEqual([]);
    expect(buildNativeProjectModelRound({ context }).tools.map(tool => tool.function.name)).toEqual(['atri_agent_skill_files', 'atri_agent_list_skills', 'atri_agent_read_skill']);
});

test('resume reuses the saved semantic Plan and explains the original proposal reference constraint', () => {
    const { context } = runnerFixture();
    const tools = ['atri_agent_set_plan', 'atri_agent_reset_operations'].map(name => ({ type: 'function', function: { name, parameters: { type: 'object' } } }));
    expect(buildNativeProjectModelRound({ context, tools }).system).toContain('Before proposing writes, call atri_agent_set_plan once');
    context.task.plan = { summary: 'Saved Plan', steps: [{ id: 'retained', title: 'Saved step' }] };
    const round = buildNativeProjectModelRound({ context, tools });
    expect(round.system).toContain('Reuse the current authoritative Task Plan and its step IDs');
    expect(round.system).toContain('first call atri_agent_reset_operations and wait for its result');
    expect(round.system).not.toContain('Before proposing writes, call atri_agent_set_plan once');
    const narrowed = buildNativeProjectModelRound({ context, tools: tools.slice(0, 1) });
    expect(narrowed.system).not.toContain('atri_agent_reset_operations');
});

test('original runner invokes admitted prepare hook after begin and uses its exact messages and closed tools', async () => {
    const f = runnerFixture();
    const result = await runNativeStudioAgentTask({ projectId: 'project', taskId: 'task', client: f.client, work: f.work, request: f.request,
        prepareModelRound: async args => {
            expect(args.attemptId).toBe('original-attempt'); expect(f.events).toEqual(['begin']); f.events.push('prepare');
            return buildNativeProjectModelRound({ context: args.context, skillEntries: args.skillEntries, modelTranscript: args.modelTranscript, previousSystem: args.previousSystem });
        }, generate: async request => {
            f.events.push('generate'); expect(request.messages[2]).toEqual(f.task.conversation[0]);
            expect(request.messages[0]).toMatchObject({ role: 'system' });
            expect(request.messages[0].content).not.toContain('Original runner intent');
            expect(request.messages[1]).toMatchObject({ role: 'user', content: expect.stringContaining('Original runner intent') });
            expect(request.tools.map(tool => tool.function.name)).toEqual(['atri_agent_skill_files', 'atri_agent_list_skills', 'atri_agent_read_skill']);
            return { assistantText: 'Original response', toolCalls: [] };
        } });
    expect(f.events).toEqual(['begin', 'prepare', 'generate', 'finish:completed']); expect(result.task.conversation.at(-1).content).toBe('Original response');
});

test('prepare failure runs original finish path and preserves the saved public conversation without generate', async () => {
    const f = runnerFixture(); let sends = 0;
    await expect(runNativeStudioAgentTask({ projectId: 'project', taskId: 'task', client: f.client, work: f.work, request: f.request,
        prepareModelRound: async () => { f.events.push('prepare'); throw new Error('original-admission-refused'); },
        generate: async () => { sends++; return {}; } })).rejects.toThrow('original-admission-refused');
    expect(sends).toBe(0); expect(f.events).toEqual(['begin', 'prepare', 'finish:failed']);
    expect(f.task.conversation).toEqual([{ role: 'user', content: 'Stored conversation sentinel' }]);
});
