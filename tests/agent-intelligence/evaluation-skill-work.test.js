import '../util/browser-context.js';
import { expect, test } from '@jest/globals';
import { evolutionFixture, skillMd } from './evolution-fixture.js';
import { createEvaluationStore } from '../../src/native/agent-intelligence/evaluation/store.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { runProject } from '../../src/native/agent-intelligence/evaluation/adapters.js';
import { selectCases, loadFixture, canonical } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { withIsolatedRuntime } from './runner.js';

test('frozen evaluator Skill reads charge its original Task and enforce configured local limits', async () => {
    const f = await evolutionFixture(createEvaluationStore, 'project-prompt', { policyMode: 'review' });
    let bridge;
    try {
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        config.route.executionPolicy = { schemaVersion: 1, allowedModelProfileIds: [config.model.modelProfileId], computeBudget: {
            maxRequests: 4, maxTokens: 64000, localWork: { maxJobs: 3, maxItems: 3, maxInputBytes: 32768 },
        } };
        bridge = await createFrozenEvaluationBridge(config, async () => { throw new Error('No provider work expected'); });
        const repository = f.host.skillRepository(f.h.handle), scope = { kind: 'project', projectId: f.scope.projectId };
        await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', content: skillMd('Scoped fixture guidance') }] } });
        const settings = { skills: { [skillEntryKey({ scope, name: 'guide' })]: { paths: { studio: 'always' } } } };
        const context = { kind: 'project', projectId: f.scope.projectId, taskId: f.nextTask.taskId, revision: f.nextTask.baseRevision };
        const work = (operation, input, computeContext = context) => bridge.projectSkillWork({ studio: f.host.studio, agent: f.host.agent, repository, settings,
            request: { operation, input, computeContext } });
        const entries = await work('list', { context: { projectId: f.scope.projectId } });
        const pinned = await work('pin', { scope, name: 'guide', expectedHash: entries[0].installedHash });
        const read = await work('read', { scope, name: 'guide', version: pinned.version, path: 'SKILL.md', full: true });
        expect(JSON.stringify(read)).toContain('Scoped fixture guidance');
        const before = await f.host.agent.getTask(f.h.handle, f.scope.projectId, f.nextTask.taskId);
        expect(before.compute.localWork).toHaveLength(3);
        expect(before.compute.localWork.every(job => job.usage?.outcome === 'completed')).toBe(true);
        await expect(work('files', { scope, name: 'guide', version: pinned.version })).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        await expect(work('list', { context: { projectId: f.scope.projectId } }, { ...context, revision: 'foreign' })).rejects.toThrow();
        expect((await f.host.agent.getTask(f.h.handle, f.scope.projectId, f.nextTask.taskId)).compute.localWork).toEqual(before.compute.localWork);
    } finally { await bridge?.cleanup(); await f.h.cleanup(); }
});

test('isolated Studio Skill endpoint accepts only the current task and known operation fields', async () => {
    const entry = selectCases({ purpose: 'evaluation', split: 'development' }).find(value => value.caseId === 'project_authoring_d1');
    const capture = { trialId: 'skill-boundary', refs: { taskIds: [], requestIds: [], effectIds: [] }, prompts: [], evidence: [], completeness: [], checks: {}, toolCalls: 0, repairCount: 0,
        observe(name, observed, expected) { this.checks[name] = canonical(observed) === canonical(expected); } };
    await withIsolatedRuntime(() => runProject(entry, loadFixture(entry, { purpose: 'evaluation' }), capture, {
        settings: { projectSkill: 'Preserve original authority.', roundLimit: 6 }, beforeSend: () => {},
        probe: async ({ projectId, taskId }) => {
            const task = await (await globalThis.fetch(`/api/native/studio/projects/${projectId}/agent/tasks/${taskId}`)).json();
            const body = { computeContext: { kind: 'project', projectId, taskId, revision: task.baseRevision }, operation: 'list', input: { context: { projectId } } };
            for (const bad of [{ ...body, computeContext: { ...body.computeContext, taskId: 'foreign' } }, { ...body, operation: 'commit' },
                { ...body, owner: 'foreign' }, { ...body, input: { context: { projectId }, authority: '*' } }]) {
                await expect(globalThis.fetch('/api/native/generation/skill-work', { method: 'POST', body: JSON.stringify(bad) })).rejects.toThrow();
            }
            await expect(globalThis.fetch('/api/native/generation/skill-work', { method: 'GET' })).rejects.toThrow('isolated_route_denied');
        },
    }));
    expect(capture.checks.review_gate).toBe(true);
    expect(capture.checks.isolation).toBe(true);
});
