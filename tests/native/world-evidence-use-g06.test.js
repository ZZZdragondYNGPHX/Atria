import { expect, test } from '@jest/globals';
import { createNativeId, PromptCompiler, renderPromptMessages } from '../../src/native/index.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';

function input() {
    const prompt = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'Fixture', stages: [{ stageId: 'stage.main', moduleRefs: [] }] };
    const ref = { scope: 'library', resourceType: 'core.prompt-program', resourceId: prompt.promptProgramId, revision: prompt.revision };
    return { request: { requestId: 'world-first' }, resolved: { route: { role: 'role.narrator', promptProgramRef: ref }, resources: [{ ref, resource: prompt }] },
        contextPlan: { schemaVersion: 1, requestId: 'world-first', source: { kind: 'session', sessionId: createNativeId('session'), branchId: createNativeId('branch'), revisionId: createNativeId('revision') },
            items: [{ id: 'state:atri_world_state', kind: 'context.fact', content: 'Authoritative current Native world state:\n{"hp":8,"location":"harbor"}', provenance: [{ source: 'native.context', ref: 'state:atri_world_state' }] }],
            budget: { maxTokens: 800, reservedOutputTokens: 100 } } };
}
const compile = value => new PromptCompiler().compile(value).promptIr;

test('G06 actual Native Session Host consumes World interpretation policy without modifying source values', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-sent' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: installed.core,
            secretPort: { resolveSecret: async () => 'local-fixture-secret' },
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: () => { throw new Error('Preview must not send'); } }) } });
        const before = await installed.core.load(h.handle, base.session.sessionId);
        const output = await host.execute(h.handle, { role: 'narrator', sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'world-preview' }, undefined, undefined, { preview: true });
        const ir = output.snapshot.promptIr;
        const policy = ir.directives.find(text => text.startsWith('Native World evidence use:'));
        expect(policy).toContain('without their definitions or explicit applicable evidence');
        expect(policy).toContain('A location does not establish weather');
        expect(renderPromptMessages(ir)).toContainEqual({ role: 'system', content: policy });
        expect(ir.contextSlots.some(item => item.content.includes('"hp":8,"location":"harbor"'))).toBe(true);
        expect(ir.provenance).toContainEqual({ source: 'native.world-use-policy', ref: 'v1' });
        const after = await installed.core.load(h.handle, base.session.sessionId);
        expect(after.states).toEqual(before.states);
        expect(after.timeline).toEqual(before.timeline);
    } finally { await h.cleanup(); }
});

test.each(['unselected', 'other-provider', 'other-provenance', 'quoted-history'])('G06 %s does not gain Native World interpretation authority', variant => {
    const value = input();
    if (variant === 'unselected') value.contextPlan.items = [];
    else if (variant === 'other-provider') value.contextPlan.items[0].id = 'state:custom';
    else if (variant === 'other-provenance') value.contextPlan.items[0].provenance = [{ source: 'library.quote', ref: 'state:atri_world_state' }];
    else { value.contextPlan.items[0].kind = 'context.history'; value.contextPlan.items[0].content = { role: 'assistant', content: value.contextPlan.items[0].content }; }
    expect(compile(value).directives.some(text => text.startsWith('Native World evidence use:'))).toBe(false);
});

test('G06 World interpretation segment is stable across requests and leaves changing state independently bound', () => {
    const first = input(), second = structuredClone(first);
    second.request.requestId = second.contextPlan.requestId = 'world-next';
    second.contextPlan.items[0].content = 'Authoritative current Native world state:\n{"hp":7,"location":"harbor"}';
    const a = compile(first), b = compile(second);
    const segment = ir => ir.compilation.segments.find(item => item.identity === 'native.world-use-policy.v1');
    expect(segment(a)).toEqual(segment(b));
    expect(segment(a)).toMatchObject({ volatility: 'stable', consumed: true });
    expect(a.contextSlots).not.toEqual(b.contextSlots);
    const stateSegment = ir => ir.compilation.segments.find(item => item.kind === 'context.fact'
        && item.provenance.some(ref => ref.source === 'native.context' && ref.ref === 'state:atri_world_state'));
    expect(stateSegment(a).contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(stateSegment(a).contentFingerprint).not.toEqual(stateSegment(b).contentFingerprint);
});
