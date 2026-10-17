import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectCommitFixture } from './helpers/project-commit-fixture.js';
import { services } from '../native/helpers/session-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { projectActorDefinition } from '../../public/shared/native-actor-profile.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const configureSource = source => {
    const actorId = createNativeId('actor');
    source.package.actors = [{ actorId, displayName: 'Original Actor', profile: { description: 'Original description', personality: 'Patient', scenario: 'Old harbor' } }];
    Object.assign(source.package.entryPoints[0], { actorIds: [actorId], primaryActorId: actorId,
        initialTimeline: [{ role: 'assistant', actorId, content: 'An original authored opening.' }] });
};
const propose = source => {
    source.package.actors[0].profile.description = 'An approved actor description.';
    source.package.actors[0].profile.scenario = 'The harbor at dawn.';
    source.package.entryPoints[0].initialTimeline[0].content = 'An approved authored opening.';
};

describe.each(CONTRACT_HARNESSES)('$name original narrative Source Commit', ({ make }) => {
    test('exact reviewed native opening and actor data require fresh approval and reach their original Session consumers once', async () => {
        const f = await projectCommitFixture(make, { configureSource, propose });
        try {
            const prepared = await f.prepare();
            await expect(f.dispatch(prepared)).rejects.toThrow();
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source).not.toEqual(f.proposed);
            const details = await f.approve(prepared);
            expect(details.description.title).toBe('Edit Project narrative source');
            const input = JSON.parse(details.description.input);
            expect(input.changes.map(change => [change.before, change.after])).toEqual([
                ['Original description', 'An approved actor description.'], ['Old harbor', 'The harbor at dawn.'],
                ['An original authored opening.', 'An approved authored opening.'],
            ]);
            const committed = await f.dispatch(prepared);
            expect(committed.status).toBe('completed');
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source).toEqual(f.proposed);
            const task = await f.agent._repository.get(f.h.handle, f.projectId, f.taskId);
            expect(task.changeSets).toHaveLength(1); expect(task.compute.localWork).toHaveLength(2);
            expect(task.compute.attempts).toEqual([]); expect(task.compute.localWork.every(row => row.status === 'settled')).toBe(true);
            const { built } = await f.studio.buildProject(f.h.handle, f.projectId), native = services(f.h);
            await native.packageInstaller.install(f.h.handle, built.archive);
            const session = await native.core.create(f.h.handle, { packageId: built.manifest.packageId, packageVersionId: built.manifest.packageVersionId,
                entryPointId: f.proposed.package.entryPoints[0].entryPointId });
            expect(session.timeline[0].content).toBe('An approved authored opening.');
            expect(projectActorDefinition(session).authored).toMatchObject({ description: 'An approved actor description.', scenario: 'The harbor at dawn.' });
            expect(await f.dispatch(prepared)).toEqual(committed);
            await f.cold(); expect(await f.dispatch(prepared)).toEqual(committed);
            expect((await f.agent._repository.get(f.h.handle, f.projectId, f.taskId)).compute).toEqual(task.compute);
        } finally { await f.cleanup(); }
    }, 180000);

    test('a passed native Review cannot disguise expression authority, external permissions or model configuration as narrative data', async () => {
        for (const change of [
            source => { source.package.actors[0].profile.systemPrompt = 'Unapproved system prompt'; },
            source => { source.package.permissions.push({ permission: 'network', required: false, reason: 'Unapproved external access' }); },
            source => { source.resources.push({ resourceType: 'core.generation-profile', resource: { schemaVersion: 1,
                generationProfileId: createNativeId('generationProfile'), revision: 'r1', displayName: 'Unapproved generation configuration', output: { maxTokens: 128 } } }); },
        ]) {
            let reviewed = null;
            await expect(projectCommitFixture(make, { configureSource, propose: source => { propose(source); change(source); },
                onReviewed: async ({ h, task }) => {
                    const resources = await h.engine.withTransaction(h.handle, async tx => ({
                        runs: await tx.listResources({ kind: K.orchestrationRun, handle: h.handle }),
                        records: await tx.listResources({ kind: K.orchestrationRecord, handle: h.handle }),
                    }));
                    reviewed = { status: task.status, validation: task.validation.status, compute: task.compute ?? null, resources };
                } })).rejects.toMatchObject({ code: 'native_orchestration_project_commit_stale' });
            expect(reviewed).toEqual({ status: 'review', validation: 'passed', compute: null, resources: { runs: [], records: [] } });
        }
    }, 180000);
});
