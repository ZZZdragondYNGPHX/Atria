import { jest } from '@jest/globals';
import { installFixture } from './helpers/session-fixture.js';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { EMPTY_PERSONA_FINGERPRINT as empty } from '../../src/native/persona-contract.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createServer } from 'node:http';

const description = 'PLAYER PRIVATE TESTIMONY';
test('accepted Persona lane is separate, opt-in and reports empty/none/legacy/budget omission', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installFixture(h), personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore }); f.core.personas = personas;
        const a = await personas.create(h.handle, { expectedFingerprint: empty, content: { name: 'A', avatar: null, description, managementNotes: 'NEVER SEND NOTE' } });
        const base = await f.core.create(h.handle, { ...f.start, personaSelection: a.ref });
        const off = await compileNativeContextPlan(base, { modelContextLimit: 16000 });
        expect(off.personaEvidence.reason).toBe('not_consumed');
        const on = await compileNativeContextPlan(base, { modelContextLimit: 16000, playerPersona: { enabled: true } });
        expect(on.included.find(item => item.lane === 'player_persona')).toMatchObject({ content: description, authority: 'player_provided' });
        expect(on.personaEvidence).toMatchObject({ reason: 'selected', ref: a.ref });
        expect(JSON.stringify(on)).not.toContain('NEVER SEND NOTE');
        const omitted = await compileNativeContextPlan(base, { modelContextLimit: 16000, playerPersona: { enabled: true }, countTokens: async text => text === description ? 100000 : 1 });
        expect(omitted.personaEvidence).toMatchObject({ reason: 'lane_cap', tokenCount: 100000 });
        const legacy = { ...base, states: { ...base.states } }; delete legacy.states.atri_player_persona;
        expect((await compileNativeContextPlan(legacy, { modelContextLimit: 16000 })).personaEvidence.reason).toBe('legacy_unbound');
        const none = await f.core.create(h.handle, { ...f.start, personaSelection: null });
        expect((await compileNativeContextPlan(none, { modelContextLimit: 16000, playerPersona: { enabled: true } })).personaEvidence.reason).toBe('none');
        const emptyResource = await personas.create(h.handle, { expectedFingerprint: empty, content: { name: 'Empty', avatar: null, description: '', managementNotes: '' } });
        const emptySession = await f.core.create(h.handle, { ...f.start, personaSelection: emptyResource.ref });
        expect((await compileNativeContextPlan(emptySession, { modelContextLimit: 16000, playerPersona: { enabled: true } })).personaEvidence.reason).toBe('empty');
    } finally { await h.cleanup(); }
});

test('real generation host preview and controlled HTTP capture use the accepted exact snapshot, no notes or maintenance injection', async () => {
    const requests = [], h = await makeTempFsEngineHarness();
    const server = createServer(async (req, res) => {
        let body = ''; for await (const part of req) body += part;
        requests.push(JSON.parse(body)); res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'Reply' } }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const f = await installFixture(h), personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore }); f.core.personas = personas;
        const a = await personas.create(h.handle, { expectedFingerprint: empty, content: { name: 'Player', avatar: null, description, managementNotes: 'NEVER SEND NOTE' } });
        const base = await f.core.create(h.handle, { ...f.start, personaSelection: a.ref });
        const input = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Continue' });
        const seeded = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, roles: ['narrator', 'memory'] });
        const secretPort = { resolveSecret: jest.fn(async () => 'fixture-secret') };
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ format: 'openai-compatible' }) }, secretPort });
        const request = { role: 'narrator', sessionId: base.session.sessionId, revisionId: input.revision.revisionId, requestId: 'persona-request' };
        const off = await host.execute(h.handle, request, undefined, undefined, { preview: true });
        expect(off.snapshot.contextPlan.personaEvidence.reason).toBe('not_consumed');
        const prompt = { ...seeded.prompt, revision: 'persona', stages: seeded.prompt.stages.map(stage => ({ ...stage, contextConsumers: ['player_persona'] })) };
        await seeded.library.commit(h.handle, 'core.prompt-program', prompt);
        for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, promptProgramRef: { ...route.promptProgramRef, revision: 'persona' } });
        const preview = await host.execute(h.handle, request, undefined, undefined, { preview: true });
        expect(preview.snapshot.promptIr.compilation.personaEvidence).toMatchObject({ reason: 'selected', ref: a.ref, consumerStages: ['stage.main'] });
        expect(requests).toHaveLength(0); expect(secretPort.resolveSecret).not.toHaveBeenCalled();
        expect((await f.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(input.revision.revisionId);
        await personas.revise(h.handle, { personaId: a.ref.personaId, content: { name: 'New', avatar: null, description: 'NEW IDENTITY', managementNotes: '' }, expectedFingerprint: a.expectedFingerprint });
        const executed = await host.execute(h.handle, request);
        expect(JSON.stringify(requests[0])).toContain(description); expect(JSON.stringify(requests[0])).not.toContain('NEVER SEND NOTE'); expect(JSON.stringify(requests[0])).not.toContain('NEW IDENTITY');
        expect(executed.snapshot.contextPlan.personaEvidence.ref).toEqual(a.ref);
        const memory = await host.execute(h.handle, { ...request, role: 'memory', requestId: 'maintenance' }, undefined, undefined, { preview: true });
        expect(memory.snapshot.contextPlan.personaEvidence.reason).toBe('not_consumed');
        expect(JSON.stringify(memory.snapshot.promptIr)).not.toContain(description);
        await expect(host.execute(h.handle, { ...request, prompt: { host: { persona: description } } })).rejects.toMatchObject({ code: 'native_generation_host_readonly' });
    } finally { await new Promise(resolve => server.close(resolve)); await h.cleanup(); }
});
