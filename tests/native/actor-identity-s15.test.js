import { expect, test } from '@jest/globals';
import { projectActorDefinition, legacyActorText } from '../../public/shared/native-actor-profile.js';
import { projectNativeSession } from '../../public/scripts/native/session-projection.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { createNativeId } from '../../src/native/index.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { informationSnapshot, informationActor, informationOtherActor } from './helpers/information-fixture.js';

const budget = { modelContextLimit: 16000, responseReserve: 512 };
const identities = plan => plan.included.filter(item => item.contextItemId.startsWith('identity:actor:'));

test('S15 installed Host consumes public identity across model changes and restored branches without profile leakage', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const fixture = sessionFixture();
        fixture.manifest.actors[0].role = 'companion';
        fixture.manifest.actors[0].profile = { description: 'AUTHOR DESCRIPTION', systemPrompt: 'ACTOR VOICE SECRET', unknown: { private: 'SCOPED RAW SECRET' } };
        const f = await installFixture(h, fixture), base = await f.core.create(h.handle, f.start);
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-sent' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, secretPort: { resolveSecret: async () => 'fixture' },
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: () => { throw new Error('Preview must not send'); } }) } });
        const preview = async snapshot => (await host.execute(h.handle, { role: 'narrator', sessionId: base.session.sessionId,
            revisionId: snapshot.revision.revisionId, requestId: 's15-preview' }, undefined, undefined, { preview: true })).snapshot.promptIr;
        const first = await preview(base);
        const slot = ir => ir.contextSlots.find(item => item.content.includes('Selected public Actor identity'));
        expect(slot(first).content).toContain(fixture.manifest.actors[0].actorId);
        expect(slot(first).content).toContain(fixture.manifest.packageVersionId);
        for (const secret of ['AUTHOR DESCRIPTION', 'ACTOR VOICE SECRET', 'SCOPED RAW SECRET']) expect(JSON.stringify(first)).not.toContain(secret);
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, remoteModelId: 'different-model' });
        expect(slot(await preview(base)).content).toBe(slot(first).content);
        const save = await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId });
        const fork = await f.core.restoreSavePoint(h.handle, base.session.sessionId, (await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId })).saveId, { expectedRevisionId: base.revision.revisionId });
        expect(projectNativeSession(fork).character.atri_native.source).toEqual(projectNativeSession(base).character.atri_native.source);
        const forkPlan = await compileNativeContextPlan(fork, budget);
        expect(identities(forkPlan)[0].sourceRefs[0]).toMatchObject({ revisionId: fork.revision.revisionId, branchId: fork.revision.branchId });
        const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: fork.revision.revisionId });
        expect(slot(await preview(restored)).content).toBe(slot(first).content);
        expect(restored.manifest.actors).toEqual(base.manifest.actors);
        expect(restored.states).toEqual(base.states);
    } finally { await h.cleanup(); }
});

test('S15 legacy arbitrary profile, null fallbacks and empty examples remain compatible and immutable', () => {
    const f = sessionFixture(), snapshot = { manifest: f.manifest, entryPoint: f.manifest.entryPoints[0] };
    const profile = { description: { custom: true }, examples: '', mes_example: 'fallback', systemPrompt: null, unknown: { large: 'x'.repeat(70000) } };
    snapshot.manifest.actors[0].profile = profile;
    const before = structuredClone(snapshot), definition = projectActorDefinition(snapshot);
    expect(definition.scopedRaw).toEqual({ unknown: profile.unknown });
    expect(Object.isFrozen(definition.scopedRaw.unknown)).toBe(true);
    expect(() => { definition.scopedRaw.unknown.large = 'changed'; }).toThrow();
    expect(legacyActorText(definition, 'Package')).toMatchObject({ description: { custom: true }, mes_example: '', system_prompt: '' });
    const legacy = legacyActorText(definition, 'Package'); legacy.description.custom = false;
    expect(snapshot).toEqual(before);
    expect(definition.authored.description.custom).toBe(true);
    profile.examples = null;
    expect(legacyActorText(projectActorDefinition(snapshot), 'Package').mes_example).toBe('fallback');
    snapshot.entryPoint.actorIds = [];
    expect(projectActorDefinition(snapshot)).toBeNull();
    expect(legacyActorText(null, 'Package')).toMatchObject({ name: 'Package', description: '', mes_example: '' });
});

test('S15 Actor target isolates selected identities and immutable package sources change with definitions', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const fixture = sessionFixture(), other = { actorId: createNativeId('actor'), displayName: 'Other Actor', profile: { systemPrompt: 'OTHER EXPRESSION' } };
        fixture.manifest.actors.push(other); fixture.manifest.entryPoints[0].actorIds.push(other.actorId);
        const f = await installFixture(h, fixture), base = await f.core.create(h.handle, f.start);
        const plan = await compileNativeContextPlan(base, { ...budget, target: { kind: 'actor', id: other.actorId } });
        expect(identities(plan)).toHaveLength(1);
        expect(identities(plan)[0].content).toContain('Other Actor');
        expect(identities(plan)[0].content).not.toContain(fixture.manifest.actors[0].actorId);
        expect(identities(await compileNativeContextPlan(base, { ...budget, target: { kind: 'actor', id: createNativeId('actor') } }))).toEqual([]);
        const next = structuredClone(fixture);
        next.manifest.packageVersionId = createNativeId('packageVersion'); next.manifest.version = '1.0.1';
        next.manifest.actors[0].displayName = 'Revised';
        const installedNext = await installFixture(h, next, f);
        const revised = await f.core.create(h.handle, installedNext.start);
        expect(projectActorDefinition(revised).source).not.toEqual(projectActorDefinition(base).source);
        expect(projectActorDefinition(base).identity.displayName).toBe('Actor');
        const tiny = structuredClone(base); tiny.states = {};
        await expect(compileNativeContextPlan(tiny, { ...budget, laneCaps: { current_state_event: 1 } })).rejects.toMatchObject({ code: 'native_context_hard_reserve_overflow' });
    } finally { await h.cleanup(); }
});

test.each(['bound', 'inactive', 'missing-context', 'unbound', 'unselected'])('S15 Information %s retains exact view and availability permissions', async variant => {
    const snapshot = informationSnapshot();
    snapshot.manifest.actors = [{ actorId: informationActor, displayName: 'Authorized Actor' }, { actorId: informationOtherActor, displayName: 'Hidden Actor' }];
    snapshot.entryPoint = { entryPointId: createNativeId('entryPoint'), actorIds: [informationActor], primaryActorId: informationActor };
    const def = snapshot.manifest.runtime.experienceContract.informationRuntime;
    snapshot.manifest = structuredClone(snapshot.manifest);
    const views = snapshot.manifest.runtime.experienceContract.informationRuntime.views;
    if (variant === 'inactive') snapshot.states.atri_lifecycle.scopes.session.status = 'inactive';
    if (variant === 'missing-context') views[0].exposure = ['display'];
    if (variant === 'unbound') delete views[0].actorId;
    if (variant === 'unselected') snapshot.entryPoint.actorIds = [];
    const before = structuredClone(snapshot);
    const plan = await compileNativeContextPlan(snapshot, budget);
    expect(identities(plan)).toHaveLength(variant === 'bound' ? 1 : 0);
    expect(JSON.stringify(identities(plan))).not.toContain('Hidden Actor');
    expect(snapshot).toEqual(before);
    expect(def.views[0].actorId).toBe(informationActor);
});
