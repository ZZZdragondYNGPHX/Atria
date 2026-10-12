import { expect, test } from '@jest/globals';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { informationContext, projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { informationFixture } from './helpers/information-fixture.js';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const budget = { modelContextLimit: 16000, responseReserve: 512 };

test.each(['separate', 'limited', 'custom'])('S16 installed %s narrator, Actor and Task consume distinct grants and independent disclosure', async mode => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installCognitionFixture(h, mode), base = f.snapshot;
        const before = structuredClone(base.states), info = informationContext(base, { kind: 'narrator' });
        expect(JSON.stringify(info.projection)).toContain('林舟');
        expect(JSON.stringify(info.projection).includes('真实身份是沈墨')).toBe(mode !== 'limited');
        expect(info.disclosure.items).toHaveLength(mode === 'custom' ? 3 : 2);
        expect(info.disclosure.items[0].data).toEqual({ hp: 8 });
        expect(JSON.stringify(info.disclosure)).toContain('林舟');
        expect(JSON.stringify(info.disclosure).includes('真实身份是沈墨')).toBe(mode === 'custom');
        expect(JSON.stringify(info.disclosure)).not.toContain('有人跟踪自己');
        const actor = await compileNativeContextPlan(base, { ...budget, target: { kind: 'actor', id: f.actorId } });
        const other = await compileNativeContextPlan(base, { ...budget, target: { kind: 'actor', id: f.otherActorId } });
        expect(JSON.stringify(actor.included)).toContain('林舟');
        for (const hidden of ['真实身份是沈墨', '有人跟踪自己']) expect(JSON.stringify(actor.included)).not.toContain(hidden);
        expect(JSON.stringify(other.included)).toContain('有人跟踪自己');
        expect(JSON.stringify(other.included)).not.toContain('林舟');
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-sent' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller, secretPort: { resolveSecret: async () => 'fixture' },
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: () => { throw new Error('Preview must not send'); } }) } });
        const request = { role: 'narrator', sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 's16-preview' };
        const narrator = await host.execute(h.handle, request, undefined, undefined, { preview: true });
        const policy = narrator.snapshot.contextPlan.items.find(item => item.id === 'projection:policy:cognition');
        expect(policy.content).toContain('independently granted display projection');
        expect(policy.content).toContain('not World Truth');
        expect(policy.content).toContain('current possession, presence, memory or willingness');
        expect(policy.content).toContain('Missing evidence leaves both occurrence and non-occurrence unknown');
        expect(policy.content).toContain('"hp":8');
        const task = base.manifest.runtime.experienceContract.taskRuntime.tasks[0];
        const result = await host.execute(h.handle, { ...request, routeRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } }, undefined, undefined,
            { preview: true, taskPlan: { task, variant: task.variants[0], slot: base.manifest.runtime.experienceContract.taskRuntime.slots[0], payload: {} } });
        const taskText = JSON.stringify(result.snapshot.contextPlan.items);
        expect(taskText).toContain('林舟');
        for (const hidden of ['真实身份是沈墨', '有人跟踪自己', 'disclosureRule']) expect(taskText).not.toContain(hidden);
        expect(result.snapshot.contextPlan.items.some(item => item.id.startsWith('projection:cognition-task:'))).toBe(true);
        expect((await f.core.load(h.handle, base.session.sessionId)).states).toEqual(before);
        const policyOnly = structuredClone(base); policyOnly.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'pov').sources = [];
        await expect(compileNativeContextPlan(policyOnly, { ...budget, laneCaps: { current_state_event: 1 } })).rejects.toMatchObject({ code: 'native_context_hard_reserve_overflow' });
    } finally { await h.cleanup(); }
});

test('S16 false belief edits, source revocation and restore never rewrite World or copy cognition to another Actor', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installCognitionFixture(h, 'limited'), base = f.snapshot;
        const world = structuredClone(base.states.atri_world_state);
        const oldAnchor = projectInformation(base, 'pov').anchor;
        const save = await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId });
        const changed = await f.write('beliefs', 'alan-rumor', { text: '阿岚开始怀疑林舟的传闻。', status: 'disputed', channel: 'rumor' });
        expect(changed.states.atri_world_state).toEqual(world);
        expect(() => assertInformationAnchor(changed, oldAnchor)).toThrow(/stale/);
        const inactive = await f.write('availability', 'main', { available: false });
        expect(informationContext(inactive, { kind: 'narrator' }).projection.items).toEqual([]);
        expect((await compileNativeContextPlan(inactive, budget)).included).toEqual([]);
        const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: inactive.revision.revisionId });
        expect(projectInformation(restored, 'pov').items).toEqual(projectInformation(base, 'pov').items);
        expect(restored.states.atri_world_state).toEqual(world);
        expect(informationContext(restored, { kind: 'actor', id: f.otherActorId }).items.some(item => item.content.includes('林舟'))).toBe(false);
    } finally { await h.cleanup(); }
});

test.each(['mode', 'no-actor', 'display-only-context', 'actor-context', 'context-disclosure', 'unknown-view', 'extra-field'])('S16 strict narration rejects %s without enlarging existing grants', variant => {
    const contract = informationFixture();
    contract.informationRuntime.narration = { mode: 'limited', contextViewId: 'pov', disclosureViewId: 'player' };
    if (variant === 'mode') contract.informationRuntime.narration.mode = 'omniscient-npc';
    if (variant === 'no-actor') delete contract.informationRuntime.views[0].actorId;
    if (variant === 'display-only-context') contract.informationRuntime.views[0].exposure = ['display'];
    if (variant === 'actor-context') contract.informationRuntime.narration.contextViewId = 'actor';
    if (variant === 'context-disclosure') contract.informationRuntime.narration.disclosureViewId = 'actor';
    if (variant === 'unknown-view') contract.informationRuntime.narration.disclosureViewId = 'missing';
    if (variant === 'extra-field') contract.informationRuntime.narration.allowHidden = true;
    expect(() => assertNativeExperienceContract(contract)).toThrow();
});

test('S16 legacy Information preserves optional schema and new narration defaults to B', () => {
    const old = informationFixture();
    expect(assertNativeExperienceContract(old).informationRuntime).not.toHaveProperty('narration');
    old.informationRuntime.narration = { contextViewId: 'pov', disclosureViewId: 'player' };
    expect(assertNativeExperienceContract(old).informationRuntime.narration.mode).toBe('separate');
});
