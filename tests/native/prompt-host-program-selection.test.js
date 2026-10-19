import { afterEach, expect, jest, test } from '@jest/globals';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture() {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://example.invalid/v1/chat/completions' });
    const module = { ...seeded.module, promptModuleId: createNativeId('promptModule'), body: 'Exact Node author text {{literal}}', textMode: 'literal' };
    const ref = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
    const prompt = { ...seeded.prompt, promptProgramId: createNativeId('promptProgram'), stages: [{ stageId: 'stage.main', moduleRefs: [ref] }] };
    for (const [type, resource] of [['core.prompt-module', module], ['core.prompt-program', prompt]]) await seeded.library.commit(h.handle, type, resource);
    const promptProgramRef = { scope: 'library', resourceType: 'core.prompt-program', resourceId: prompt.promptProgramId, revision: prompt.revision };
    const projectId = createNativeId('project');
    const project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const seen = [];
    let rejectFirst = false;
    const provider = createHttpGenerationProvider({ fetchImpl: async (_url, options) => {
        seen.push(JSON.parse(options.body));
        if (rejectFirst && seen.length === 1) throw new Error('Synthetic transport failure');
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Native answer' } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }));
    } });
    const secretPort = { resolveSecret: jest.fn(async () => 'synthetic-host-selection-secret') };
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project }, providers: { 'provider.openai-compatible': provider }, secretPort });
    const request = { projectId, revision: 'r1', requestId: 'host-selection', role: 'narrator' };
    const assertCurrent = jest.fn(async details => {
        expect(details.handle).toBe(h.handle);
        expect(details.source).toEqual({ kind: 'studio', projectId, revision: 'r1' });
    });
    return { h, host, ...seeded, request, seen, module, promptProgramRef, secretPort, assertCurrent,
        selection: { promptProgramRef, assertCurrent }, rejectFirst: () => { rejectFirst = true; } };
}

test('Host-only Program selection reaches the original compiler and provider without saving a Route', async () => {
    const f = await fixture();
    const before = await f.persistence.getRuntimeRoute(f.h.handle, f.routes[0].runtimeRouteId);
    const preview = await f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true, programSelection: f.selection });
    expect(preview.snapshot.promptProgramRef).toEqual(f.promptProgramRef);
    expect(preview.rendered.body.messages.some(message => message.content === f.module.body)).toBe(true);
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    expect(f.seen).toHaveLength(0);
    const actual = await f.host.execute(f.h.handle, f.request, undefined, undefined, { programSelection: f.selection });
    expect(actual.snapshot.promptProgramRef).toEqual(f.promptProgramRef);
    expect(f.seen[0].messages.some(message => message.content === f.module.body)).toBe(true);
    expect(f.assertCurrent.mock.calls.map(([details]) => details.phase)).toEqual(expect.arrayContaining(['host', 'resolve', 'compile', 'preview', 'send']));
    expect(f.assertCurrent.mock.calls.find(([details]) => details.phase === 'send')[0].contextPlan).toEqual(actual.snapshot.contextPlan);
    expect(await f.persistence.getRuntimeRoute(f.h.handle, before.runtimeRouteId)).toEqual(before);
});

test('Host scheduler retains the trusted selection through a full Route fallback', async () => {
    const f = await fixture(); f.rejectFirst();
    const fallbackProgram = { ...f.prompt, promptProgramId: createNativeId('promptProgram') };
    await f.library.commit(f.h.handle, 'core.prompt-program', fallbackProgram);
    const fallback = { ...f.routes[0], runtimeRouteId: createNativeId('runtimeRoute'),
        promptProgramRef: { ...f.routes[0].promptProgramRef, resourceId: fallbackProgram.promptProgramId } };
    await f.persistence.saveRuntimeRoute(f.h.handle, fallback);
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] });
    const result = await f.host.execute(f.h.handle, { ...f.request, fallbackMode: 'automatic',
        routeRef: { scope: 'player', runtimeRouteId: f.routes[0].runtimeRouteId } }, undefined, undefined, { programSelection: f.selection });
    expect(result.routing.fallbackUsed).toBe(true);
    expect(result.snapshot.promptProgramRef).toEqual(f.promptProgramRef);
    expect(result.snapshot.diagnostics.effectiveConfig.declaredPromptProgramRef).toEqual(fallback.promptProgramRef);
    expect(f.seen).toHaveLength(2);
    expect(f.seen.every(body => body.messages.some(message => message.content === f.module.body))).toBe(true);
});

test('JSON cannot select a Program and an internal call without executable authority is rejected', async () => {
    const f = await fixture();
    await expect(f.host.execute(f.h.handle, { ...f.request, programSelection: { promptProgramRef: f.promptProgramRef } }))
        .rejects.toMatchObject({ code: 'native_generation_request_authority_denied' });
    await expect(f.host.execute(f.h.handle, f.request, undefined, undefined, { programSelection: { promptProgramRef: f.promptProgramRef } }))
        .rejects.toMatchObject({ code: 'generation_program_authority_required' });
    expect(f.seen).toHaveLength(0);
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
});
