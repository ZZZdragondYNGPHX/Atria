import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Project producer final currentness', ({ make }) => {
    test('only the original opaque completion permit writes once for its actual derived Agent and transcript', async () => {
        const f = await projectModelFixture(make), finish = ProjectAgentService.prototype.finishGeneration;
        let checked = false;
        ProjectAgentService.prototype.finishGeneration = async function (handle, projectId, taskId, input) {
            if (input.nativeCompletionPermit === undefined) return finish.call(this, handle, projectId, taskId, input);
            const before = await f.repository.get(handle, projectId, taskId);
            await expect(finish.call(this, handle, projectId, taskId, { ...input, nativeCompletionPermit: structuredClone(input.nativeCompletionPermit) }))
                .rejects.toMatchObject({ code: 'native_orchestration_project_round_finish_denied' });
            await expect(finish.call(f.agent, handle, projectId, taskId, input))
                .rejects.toMatchObject({ code: 'native_orchestration_project_round_finish_denied' });
            await expect(finish.call(this, handle, projectId, taskId, { ...input, conversation: [...input.conversation,
                { role: 'assistant', content: 'Changed transcript cannot consume actual permission' }] }))
                .rejects.toMatchObject({ code: 'native_orchestration_project_round_finish_denied' });
            expect(await f.repository.get(handle, projectId, taskId)).toEqual(before);
            const task = await finish.call(this, handle, projectId, taskId, input);
            await expect(finish.call(this, handle, projectId, taskId, input))
                .rejects.toMatchObject({ code: 'native_orchestration_project_round_finish_denied' });
            expect(await f.repository.get(handle, projectId, taskId)).toMatchObject({ conversation: task.conversation });
            checked = true; return task;
        };
        try {
            await f.run();
            expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts[0].status).toBe('completed');
            expect(task.conversation.filter(message => message.role === 'assistant')).toHaveLength(1);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { ProjectAgentService.prototype.finishGeneration = finish; await f.cleanup(); }
    });

    test.each(['project_read', 'task_load', 'recovery'])('a human Task edit during original generation writer %s refuses the stale reply', async phase => {
        const f = await projectModelFixture(make), finish = ProjectAgentService.prototype.finishGeneration;
        const getProject = f.studio.getProject, getTask = f.repository.get, recover = ProjectAgentService.prototype._recover;
        let writing = false, changed = false, changedFingerprint;
        ProjectAgentService.prototype.finishGeneration = async function (...args) {
            writing = true;
            try { return await finish.apply(this, args); }
            finally { writing = false; }
        };
        const withdraw = async () => {
            if (writing && !changed) {
                changed = true;
                const task = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                    { summary: 'Human plan during original writer await', steps: [{ id: 'human', title: 'Preserve this plan' }] });
                changedFingerprint = task.executionFingerprint;
            }
        };
        f.studio.getProject = async function (...args) {
            const project = await getProject.apply(this, args);
            if (phase === 'project_read') await withdraw();
            return project;
        };
        f.repository.get = async function (...args) {
            const ambient = f.h.engine.hasActiveTransaction(f.h.handle), task = await getTask.apply(this, args);
            if (phase === 'task_load' && !ambient) await withdraw();
            return task;
        };
        ProjectAgentService.prototype._recover = async function (...args) {
            const result = await recover.apply(this, args);
            if (phase === 'recovery') await withdraw();
            return result;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(changed).toBe(true);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.conversation).toEqual(f.task.conversation);
            expect(task.attempts[0].status).toBe('started');
            expect(task.executionFingerprint).toBe(changedFingerprint);
            expect(task.plan.summary).toBe('Human plan during original writer await');
            // Refused by the orchestration currency check or the original Project revision.
            expect(['native_orchestration_source_stale', 'native_generation_revision_conflict']).toContain(result.error?.code);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(f.requests).toHaveLength(1);
        } finally {
            ProjectAgentService.prototype.finishGeneration = finish; f.studio.getProject = getProject;
            f.repository.get = getTask;
            ProjectAgentService.prototype._recover = recover;
            await f.cleanup();
        }
    });

    test.each(['source', 'configuration', 'skill_settings', 'skill_version'])('%s withdrawal after final Model authorization refuses original generation write', async change => {
        const scope = { kind: 'global' }, name = 'producer_guide';
        const body = '---\nname: producer_guide\ndescription: Original producer instructions\n---\nOriginal Project producer Skill sentinel';
        let repository, extensions, pinnedVersion;
        const f = await projectModelFixture(make, { configurePlan: async ({ h, host }) => {
                if (!change.startsWith('skill_')) return;
                repository = createSkillRepository(h.dirs.root);
                await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: body }] } });
                pinnedVersion = (await repository.get(name, scope)).installedHash;
                extensions = new ExtensionsStore({ engine: h.engine }); host.extensions = extensions;
                const settings = await extensions.settings(h.handle);
                await extensions.saveSettings(h.handle, { ...settings.value,
                    skills: { [skillEntryKey({ scope, name })]: { paths: { studio: 'always' } } } }, settings.revision);
            } }), effects = f.authority.execution.effects;
        const authorize = effects.authorizeEffect, finish = f.authority.finishProjectRound.bind(f.authority);
        let finishing = false, changed = false, changedFingerprint;
        f.authority.finishProjectRound = async args => {
            finishing = true;
            try { return await finish(args); }
            finally { finishing = false; }
        };
        effects.authorizeEffect = async args => {
            const result = await authorize(args);
            if (finishing && !changed && args.phase === 'consume') {
                changed = true;
                if (change === 'source') {
                    const task = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                        { summary: 'Independent human plan after final authorization', steps: [{ id: 'human', title: 'Keep this human plan' }] });
                    changedFingerprint = task.executionFingerprint;
                } else if (change === 'configuration') await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.route,
                    policy: { ...f.route.policy, timeoutMs: f.route.policy.timeoutMs + 1 } });
                else if (change === 'skill_settings') {
                    const settings = await extensions.settings(f.h.handle);
                    await extensions.saveSettings(f.h.handle, { ...settings.value,
                        skills: { [skillEntryKey({ scope, name })]: { paths: { studio: 'off' } } } }, settings.revision);
                } else await repository.writeReviewed({ scope, name, expectedInstalledHash: pinnedVersion,
                    command: { kind: 'file.write', input: { path: 'SKILL.md', content: body + '\nHuman changed this installed Skill' } } });
            }
            return result;
        };
        try {
            const failure = await f.run().then(() => null, error => error);
            expect(['native_orchestration_source_stale', 'native_generation_revision_conflict']).toContain(failure?.code);
            expect(changed).toBe(true); expect(f.requests).toHaveLength(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.conversation).toEqual(f.task.conversation);
            expect(task.attempts[0].status).toBe('started');
            const retained = change === 'source' ? { fingerprint: task.executionFingerprint, summary: task.plan.summary }
                : change === 'configuration' ? { timeoutMs: (await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId)).policy.timeoutMs }
                    : { promptContainsSkill: JSON.stringify(f.requests[0]).includes('Original Project producer Skill sentinel'),
                        versionPreserved: (await repository.get(name, scope)).installedHash === pinnedVersion,
                        mode: (await extensions.settings(f.h.handle)).value.skills[skillEntryKey({ scope, name })].paths.studio };
            expect(retained).toEqual({
                source: { fingerprint: changedFingerprint, summary: 'Independent human plan after final authorization' },
                configuration: { timeoutMs: f.route.policy.timeoutMs + 1 },
                skill_settings: { promptContainsSkill: true, versionPreserved: true, mode: 'off' },
                skill_version: { promptContainsSkill: true, versionPreserved: false, mode: 'always' },
            }[change]);
            expect(task.compute.attempts).toHaveLength(1);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.outputClaims).toEqual([]);
        } finally { effects.authorizeEffect = authorize; await f.cleanup(); }
    });
});
