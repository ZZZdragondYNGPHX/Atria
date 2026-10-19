import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { WorldRepo } from '../../src/native/repositories/world-repo.js';
import { createNativeId } from '../../src/native/identity.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name original Project library discovery', ({ make }) => {
    test('an exact read pin discovers an actual library World label and revision instead of guessing opaque Project IDs', async () => {
        const worldId = createNativeId('world'), worldRevisionId = createNativeId('worldRevision');
        const f = await projectModelFixture(make, { configureSource: async ({ h, source }) => {
            const worlds = new WorldRepo({ engine: h.engine });
            await worlds.create(h.handle, { worldId, currentRevisionId: null, displayName: 'Public World discovery sentinel' });
            await worlds.commitRevision(h.handle, { worldId, worldRevisionId, knowledgeBindingIds: [], assetIds: [], baseline: { location: 'archive' } });
            source.dependencies.worlds.push({ worldId, worldRevisionId });
        }, configurePlan: configureProjectToolPlan(['atri_agent_resource_closure']), responseBody: () => ({ id: 'discovery-model', status: 'completed', output: [{ id: 'discovery-item', type: 'function_call', status: 'completed',
            call_id: 'discovery-call', name: 'atri_agent_resource_closure', arguments: '{}' }],
        usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
        try {
            await f.run(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            const call = task.attempts.find(item => item.kind === 'generation').calls[0];
            expect(call.nativeReceipt.name).toBe('atri_agent_resource_closure');
            const body = task.conversation.filter(item => item.role === 'tool').map(item => item.content).join('\n');
            expect(body).toContain('Public World discovery sentinel'); expect(body).toContain(worldId); expect(body).toContain(worldRevisionId);
            expect(f.requests[0].tools.map(tool => (tool.function ?? tool).name)).toEqual(['atri_agent_resource_closure']);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(task.compute.localWork.filter(item => item.kind === 'project_tool')).toHaveLength(1);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision); expect(task.changeSets).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);
});
