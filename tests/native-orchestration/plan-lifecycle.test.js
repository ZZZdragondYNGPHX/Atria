import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { createNativeId } from '../../src/native/identity.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
const id = () => createNativeId('orchestrationCommand');
const expected = root => ({ planId: root.planId, expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash });

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original Plan lifecycle', (_name, make) => {
    let h, plans;
    beforeEach(async () => { h = await make(); await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs }); ({ plans } = createOrchestrationAuthoringService(h.engine)); });
    afterEach(async () => { await h.engine.close(); await h.cleanup(); });
    test('Fork copies the saved draft while Derive pins an immutable published source; both remain independent drafts', async () => {
        const input = planFixture(), source = await plans.create(h.handle, id(), input), report = await plans.validate(h.handle, expected(source));
        const { planRef } = await plans.publish(h.handle, id(), { ...expected(source), validationDigest: validationDigest(report) });
        const publishedRoot = await plans.get(h.handle, source.planId);
        input.definition.nodes[0].label = 'Private new draft';
        const changed = await plans.save(h.handle, id(), { ...expected(publishedRoot), ...input });
        const commandId = id(), body = { sourcePlanId: source.planId, expectedDraftVersion: changed.draftVersion, expectedDefinitionHash: changed.definitionHash, mode: 'fork', title: 'Copy' };
        const copied = await plans.fork(h.handle, commandId, body);
        expect(await plans.fork(h.handle, commandId, body)).toEqual(copied);
        const derived = await plans.fork(h.handle, id(), { sourcePlanId: source.planId, planRef, mode: 'derive', title: 'Derivative' });
        expect(copied.definition.nodes[0].label).toBe('Private new draft'); expect(derived.definition.nodes[0].label).toBe('Result');
        expect(derived.origin).toEqual({ kind: 'derive', source: planRef }); expect(copied.planId).not.toBe(source.planId);
        expect(copied.currentPlanRevisionId).toBeNull(); expect(derived.currentPlanRevisionId).toBeNull();
        const validated = await plans.validate(h.handle, expected(derived)), own = await plans.publish(h.handle, id(), { ...expected(derived), validationDigest: validationDigest(validated) });
        expect((await plans.getRevision(h.handle, own.planRef)).origin).toEqual(derived.origin);
        expect((await plans.getRevision(h.handle, planRef)).definition.nodes[0].label).toBe('Result');
        await expect(plans.fork(h.handle, id(), { ...body, expectedDraftVersion: 0 })).rejects.toMatchObject({ code: 'native_orchestration_draft_conflict' });
    });
    test('archive filtering, cursor scope and restore preserve exact definitions and reject stale edits', async () => {
        const sources = [];
        for (let index = 0; index < 3; index++) sources.push(await plans.create(h.handle, id(), planFixture()));
        const root = sources[1], archived = await plans.archive(h.handle, id(), { ...expected(root), archived: true });
        expect(archived.definitionHash).toBe(root.definitionHash);
        const active = await plans.list(h.handle, { limit: 1 }), rest = await plans.list(h.handle, { cursor: active.cursor, limit: 1 });
        expect([...active.items, ...rest.items].map(item => item.planId)).not.toContain(root.planId);
        expect((await plans.list(h.handle, { archived: true })).items.map(item => item.planId)).toEqual([root.planId]);
        await expect(plans.list(h.handle, { archived: true, cursor: active.cursor })).rejects.toThrow('cursor');
        await expect(plans.save(h.handle, id(), { ...expected(archived), ...planFixture() })).rejects.toThrow('plan_archived');
        const restored = await plans.archive(h.handle, id(), { ...expected(archived), archived: false });
        expect(restored.definition).toEqual(root.definition); expect((await plans.list(h.handle)).items).toHaveLength(3);
    });
    test('draft deletion replays its original outcome; published history is archived and remains readable', async () => {
        const draft = await plans.create(h.handle, id(), planFixture()), commandId = id();
        const deleted = await plans.delete(h.handle, commandId, expected(draft));
        expect(await plans.delete(h.handle, commandId, expected(draft))).toEqual(deleted);
        await expect(plans.get(h.handle, draft.planId)).rejects.toThrow();
        const root = await plans.create(h.handle, id(), planFixture()), report = await plans.validate(h.handle, expected(root));
        const { planRef } = await plans.publish(h.handle, id(), { ...expected(root), validationDigest: validationDigest(report) });
        const current = await plans.get(h.handle, root.planId);
        await expect(plans.delete(h.handle, id(), expected(current))).rejects.toMatchObject({ code: 'native_orchestration_plan_published' });
        await plans.archive(h.handle, id(), { ...expected(current), archived: true });
        expect((await plans.getRevision(h.handle, planRef)).definition).toEqual(root.definition);
    });
});
