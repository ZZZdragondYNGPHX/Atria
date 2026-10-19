import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReviewFixture } from './helpers/project-review-fixture.js';
import { projectCommitAccount, publishProjectCommitPlan, approveProjectCommit } from './helpers/project-commit-fixture.js';
import { NativeProjectCommitAuthority } from '../../src/native/orchestration/native-project-commit-authority.js';
import { projectCommitReviewHash } from '../../src/native/orchestration/project-commit-contracts.js';
import { getNativeReviewOrigin } from '../../src/native/orchestration/review-origin.js';
import { createNativeId } from '../../src/native/identity.js';
import { services } from '../native/helpers/session-fixture.js';
import { projectActorDefinition } from '../../public/shared/native-actor-profile.js';

describe.each(CONTRACT_HARNESSES)('$name original Project Model to formal Commit', ({ make }) => {
    test('the same paid three-round Task reaches fresh approval and its original native consumers without replacing its bank', async () => {
        const f = await projectReviewFixture(make, { outputContract: true, configureSource: ({ source }) => {
            const actorId = createNativeId('actor');
            source.package.actors = [{ actorId, displayName: 'Authored Actor', profile: { description: 'Original description' } }];
            Object.assign(source.package.entryPoints[0], { actorIds: [actorId], primaryActorId: actorId,
                initialTimeline: [{ role: 'assistant', actorId, content: 'Original opening.' }] });
        }, proposeSource: source => {
            source.package.actors[0].profile.description = 'Model-proposed reviewed description.';
            source.package.entryPoints[0].initialTimeline[0].content = 'Model-proposed reviewed opening.';
        } });
        try {
            await f.run();
            const before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(before.status).toBe('review'); expect(f.requests).toHaveLength(3);
            expect(before.attempts.flatMap(attempt => attempt.calls).map(call => call.nativeReceipt.name))
                .toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
            expect(before.compute.attempts).toHaveLength(3);
            expect(before.compute.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(before.compute.localWork.length).toBeGreaterThan(0);
            expect(before.changeSets).toEqual([]);
            const proposed = before.workspace.operations[0].input.source;
            await projectCommitAccount(f.h);
            const { plans, planRef } = await publishProjectCommitPlan(f.h, { agent: f.agent, studio: f.studio, task: before });
            expect((await f.repository.get(f.h.handle, f.projectId, before.taskId)).compute).toEqual(before.compute);
            const authority = new NativeProjectCommitAuthority({ engine: f.h.engine, projectAgent: f.agent, plans });
            const prepared = await authority.prepare(f.h.handle, { commandId: createNativeId('orchestrationCommand'), planRef,
                projectId: f.projectId, taskId: before.taskId, expectedSequence: before.sequence, expectedReviewHash: projectCommitReviewHash(before),
                computeBudget: structuredClone(before.compute.limits) });
            const target = { runId: prepared.runId, effectId: prepared.effectId };
            await expect(authority.dispatch(f.h.handle, target)).rejects.toThrow();
            const details = await approveProjectCommit(f.h, authority, prepared);
            expect(JSON.parse(details.description.input).changes.map(change => change.after))
                .toEqual(['Model-proposed reviewed description.', 'Model-proposed reviewed opening.']);
            const committed = await authority.dispatch(f.h.handle, target);
            expect(committed.status).toBe('completed');
            const after = await f.repository.get(f.h.handle, f.projectId, before.taskId);
            expect(after.taskId).toBe(before.taskId); expect(after.status).toBe('completed');
            expect(after.compute.limits).toEqual(before.compute.limits);
            expect(after.compute.attempts).toEqual(before.compute.attempts);
            expect(after.compute.localWork.slice(0, before.compute.localWork.length)).toEqual(before.compute.localWork);
            expect(after.compute.localWork).toHaveLength(before.compute.localWork.length + 2);
            expect(after.compute.localWork.slice(-2).every(row => row.status === 'settled')).toBe(true);
            expect(after.attempts.slice(0, before.attempts.length)).toEqual(before.attempts);
            expect(after.attempts.slice(before.attempts.length)).toMatchObject([{ kind: 'commit', status: 'completed' }]);
            expect(after.changeSets).toHaveLength(1);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source).toEqual(proposed);
            const { built } = await f.studio.buildProject(f.h.handle, f.projectId), native = services(f.h);
            await native.packageInstaller.install(f.h.handle, built.archive);
            const session = await native.core.create(f.h.handle, { packageId: built.manifest.packageId, packageVersionId: built.manifest.packageVersionId,
                entryPointId: proposed.package.entryPoints[0].entryPointId });
            expect(session.timeline[0].content).toBe('Model-proposed reviewed opening.');
            expect(projectActorDefinition(session).authored.description).toBe('Model-proposed reviewed description.');
            expect(await authority.dispatch(f.h.handle, target)).toEqual(committed);
            expect((await f.repository.get(f.h.handle, f.projectId, before.taskId)).compute).toEqual(after.compute);
            expect(f.requests).toHaveLength(3);
        } finally { await getNativeReviewOrigin(f.h.engine).close(); await f.cleanup(); }
    }, 180000);
});
