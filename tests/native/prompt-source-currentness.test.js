import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { projectSource, services as projectServices } from '../agent-intelligence/project-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture(make, lane) {
    const h = await make(); cleanups.push(h.cleanup);
    const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
    const { studio, agent } = projectServices(h), source = projectSource(), project = await studio.createProject(h.handle, source);
    const task = await agent.createTask(h.handle, source.project.projectId, { intent: 'Read the project', baseRevision: project.revision.revision });
    const role = lane === 'session' ? 'narrator' : 'studio';
    const seeded = await seedGenerationProfiles({ ...h, roles: [role], endpoint: 'https://synthetic.invalid/v1/chat/completions' });
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic response' } }] }),
        { headers: { 'Content-Type': 'application/json' } }));
    const provider = createHttpGenerationProvider({ fetchImpl });
    const secretPort = { resolveSecret: jest.fn(async () => 'synthetic-currentness-credential') };
    const host = new NativeGenerationHost({ ...seeded, sessionCore: installed.core, studio, agent,
        providers: { 'provider.openai-compatible': provider }, secretPort });
    const request = { role, requestId: 'currentness-test', ...(lane === 'session'
        ? { sessionId: base.session.sessionId, revisionId: base.revision.revisionId }
        : { projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision }) };
    const changeSource = () => lane === 'session'
        ? installed.core.appendTimeline(h.handle, request.sessionId, { role: 'user', content: 'A new source revision' })
        : agent.setPlan(h.handle, request.projectId, task.taskId, { summary: 'Changed task', steps: [{ id: 'changed', title: 'Changed plan', impact: 'low' }] });
    return { h, host, request, provider, secretPort, fetchImpl, changeSource };
}

describe.each([['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]])('Host Source consumption on %s', (_kind, make) => {
    test.each(['session', 'project'])('%s change during Secret resolve blocks the real Host Provider send', async lane => {
        const f = await fixture(make, lane);
        f.secretPort.resolveSecret.mockImplementation(async () => { await f.changeSource(); return 'synthetic-currentness-credential'; });
        await expect(f.host.execute(f.h.handle, f.request)).rejects.toMatchObject({
            code: lane === 'session' ? 'native_generation_revision_conflict' : 'native_generation_task_stopped',
        });
        expect(f.secretPort.resolveSecret).toHaveBeenCalledTimes(1);
        expect(f.fetchImpl).not.toHaveBeenCalled();
    });

    test.each(['session', 'project'])('%s change during render blocks preview return without resolving credentials', async lane => {
        const f = await fixture(make, lane);
        f.host.providers['provider.openai-compatible'] = { ...f.provider, renderRequest: async value => {
            const rendered = await f.provider.renderRequest(value);
            await f.changeSource();
            return rendered;
        } };
        await expect(f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true })).rejects.toMatchObject({
            code: lane === 'session' ? 'native_generation_revision_conflict' : 'native_generation_task_stopped',
        });
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        expect(f.fetchImpl).not.toHaveBeenCalled();
    });

    test.each(['session', 'project'])('%s unchanged Source still previews through the original compiler', async lane => {
        const f = await fixture(make, lane);
        const result = await f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true });
        expect(result.preview).toBe(true);
        expect(result.snapshot.promptIr.compilation.authoredBehaviorFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        expect(f.fetchImpl).not.toHaveBeenCalled();
    });
});
