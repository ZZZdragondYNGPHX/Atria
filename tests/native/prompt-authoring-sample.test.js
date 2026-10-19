import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const sample = { input: 'Continue this sample.', materials: ['Only sample scene facts.'], history: [{ role: 'assistant', content: 'An earlier sample.' }], persona: 'Sample player' };
const limits = { maxRequests: 1, maxTokens: 4000, localWork: { maxJobs: 8, maxItems: 8, maxInputBytes: 1048576 } };
async function fixture() {
    const h = await makeTempFsEngine(); cleanup.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://author-sample.invalid/v1/chat/completions' });
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Sample response' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }), { headers: { 'Content-Type': 'application/json' } }));
    const secretPort = { resolveSecret: jest.fn(async () => 'synthetic-author-sample-key') };
    const forbidden = jest.fn(() => { throw new Error('A sample must not read a game'); });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: { observe: forbidden, load: forbidden }, studio: { getProject: forbidden },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort });
    const request = { requestId: createNativeId('revision'), role: 'narrator', sample, routeRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } };
    return { h, ...seeded, host, request, fetchImpl, secretPort, forbidden };
}

test('independent author preview uses sample Context and exactly two compilations, without games, Secret or send', async () => {
    const f = await fixture(); const execute = jest.spyOn(f.host, 'execute');
    const preview = await f.host.previewDraft(f.h.handle, { request: f.request, drafts: [] });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(preview).toMatchObject({ sent: false, diff: { sameSource: true }, candidate: { identity: { source: { kind: 'authoring' } } } });
    expect(preview.candidate.wire.messages).toContainEqual({ role: 'user', content: sample.input });
    expect(preview.candidate.wire.messages).toContainEqual({ role: 'user', content: sample.materials[0] });
    expect(f.forbidden).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
});

test('new Program and Module draft dependencies preview without saving; different root revisions use one sample', async () => {
    const f = await fixture(); const before = await f.library.listWithRevisions(f.h.handle);
    const module = { ...f.module, promptModuleId: createNativeId('promptModule'), revision: 'draft-only', body: 'New draft instructions', textMode: 'literal' };
    const moduleRef = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
    const program = { ...f.prompt, promptProgramId: createNativeId('promptProgram'), revision: 'draft-only', stages: [{ stageId: 'stage.main', entries: [
        { entryId: 'module.sample', kind: 'module', moduleRef }, { entryId: 'anchor.scene', kind: 'anchor', target: 'context.before_history', accepts: ['context.fact'] },
    ] }] };
    const programRef = { scope: 'library', resourceType: 'core.prompt-program', resourceId: program.promptProgramId, revision: program.revision };
    const result = await f.host.previewDraft(f.h.handle, { request: f.request, candidateRefs: { promptProgramRef: programRef }, drafts: [
        { ref: moduleRef, resource: module, expectedFingerprint: null }, { ref: programRef, resource: program, expectedFingerprint: null },
    ] });
    expect(result.baseline.identity.promptProgramRef).toEqual(f.routes[0].promptProgramRef);
    expect(result.candidate.identity.promptProgramRef).toEqual(programRef);
    expect(result.candidate.effective.promptIr.directives).toContain(module.body);
    expect(result.candidate.identity.sourceFingerprint).toBe(result.baseline.identity.sourceFingerprint);
    expect(await f.library.listWithRevisions(f.h.handle)).toEqual(before);
});

test('manual trial sends through original Provider and reports Compute usage without creating game state', async () => {
    const f = await fixture();
    const result = await f.host.tryAuthoring(f.h.handle, { request: f.request, drafts: [], limits, send: true });
    expect(result).toMatchObject({ sent: true, trial: { status: 'completed' }, response: { text: 'Sample response' },
        routing: { compute: { scope: 'authoring_request', attempts: [{ status: 'settled', usage: { totalTokens: 20 } }] } } });
    expect(result.routing.compute.localWork.map(item => item.kind)).toEqual(['route_resolve', 'context_build', 'prompt_compile', 'generation_count', 'generation_render']);
    expect(result.routing.compute.localWork.every(item => item.status === 'settled')).toBe(true);
    expect(f.fetchImpl).toHaveBeenCalledTimes(1); expect(f.forbidden).not.toHaveBeenCalled();
});

test('unknown trial spending stays unknown and never becomes a successful sample or zero usage', async () => {
    const f = await fixture(); f.fetchImpl.mockRejectedValue(new Error('Synthetic transport failure'));
    const result = await f.host.tryAuthoring(f.h.handle, { request: f.request, limits, send: true });
    expect(result.trial.status).toBe('failed'); expect(result.routing.compute.attempts).toEqual([expect.objectContaining({ status: 'unknown', usage: null })]);
});

test('authoring input requires explicit trial action, rejects mixed game sources and cannot impersonate Host history', async () => {
    const f = await fixture();
    await expect(f.host.tryAuthoring(f.h.handle, { request: f.request, limits })).rejects.toThrow('authoring_input_required');
    await expect(f.host.execute(f.h.handle, f.request)).rejects.toThrow('context_ambiguous');
    await expect(f.host.previewDraft(f.h.handle, { request: { ...f.request, projectId: createNativeId('project') }, drafts: [] })).rejects.toThrow('context_ambiguous');
    await expect(f.host.previewDraft(f.h.handle, { request: { ...f.request, sample: { input: '', history: [{ role: 'system', content: 'Caller instructions' }] } }, drafts: [] })).rejects.toThrow('history');
    expect(f.fetchImpl).not.toHaveBeenCalled();
});


test('author trial HTTP action is authenticated, no-store and requires explicit send', async () => {
    const f = await fixture(); const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use(createNativeGenerationRouter(() => f.host));
    await supertest(app).post('/authoring/try').send({ request: f.request, limits, send: true }).expect(401);
    await supertest(app).post('/authoring/try').set('x-user', f.h.handle).send({ request: f.request, limits }).expect(400);
    const result = await supertest(app).post('/authoring/try').set('x-user', f.h.handle).send({ request: f.request, limits, send: true }).expect(200);
    expect(result.headers['cache-control']).toBe('private, no-store'); expect(result.body.response.text).toBe('Sample response');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});

test('Studio samples read original Project resources and can preview a new revision without committing', async () => {
    const f = await fixture(); const projectId = createNativeId('project');
    const module = { ...f.module, revision: 'new-uncommitted' };
    const moduleRef = { scope: 'project', projectId, resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
    const prompt = { ...f.prompt, revision: 'new-uncommitted', stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] };
    const promptRef = { scope: 'project', projectId, resourceType: 'core.prompt-program', resourceId: prompt.promptProgramId, revision: prompt.revision };
    const project = { source: { project: { projectId }, resources: [] }, revision: { revision: 'original' } };
    f.host.studio.getProject = jest.fn(async () => project);
    const result = await f.host.previewDraft(f.h.handle, { request: { ...f.request, resourceProjectId: projectId }, candidateRefs: { promptProgramRef: promptRef }, drafts: [
        { ref: moduleRef, resource: module, expectedFingerprint: null }, { ref: promptRef, resource: prompt, expectedFingerprint: null },
    ] });
    expect(result.candidate.identity.promptProgramRef).toEqual(promptRef); expect(project.source.resources).toEqual([]);
    expect(f.fetchImpl).not.toHaveBeenCalled();
    await expect(f.host.previewDraft(f.h.handle, { request: f.request, candidateRefs: { promptProgramRef: promptRef }, drafts: [] })).rejects.toThrow('resource_owner');
});

test('existing exact resources cannot be replaced by declaring a new draft', async () => {
    const f = await fixture();
    await expect(f.host.tryAuthoring(f.h.handle, { request: f.request, limits, send: true, drafts: [
        { ref: f.routes[0].promptProgramRef, resource: f.prompt, expectedFingerprint: null },
    ] })).rejects.toThrow('draft_conflict');
    expect(f.fetchImpl).not.toHaveBeenCalled();
});

test('a trial retains its selected draft Program when the original route falls back', async () => {
    const f = await fixture();
    const fallback = { ...f.routes[0], runtimeRouteId: createNativeId('runtimeRoute') };
    await f.persistence.saveRuntimeRoute(f.h.handle, fallback);
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] });
    const module = { ...f.module, promptModuleId: createNativeId('promptModule'), revision: 'trial', body: 'Private trial text across routes' };
    const moduleRef = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
    const program = { ...f.prompt, promptProgramId: createNativeId('promptProgram'), revision: 'trial', stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] };
    const programRef = { scope: 'library', resourceType: 'core.prompt-program', resourceId: program.promptProgramId, revision: program.revision };
    f.fetchImpl.mockRejectedValueOnce(new Error('Synthetic transport failure'));
    const result = await f.host.tryAuthoring(f.h.handle, { request: { ...f.request, fallbackMode: 'automatic' }, send: true,
        limits: { ...limits, maxRequests: 2, localWork: { ...limits.localWork, maxJobs: 16, maxItems: 16 } }, refs: { promptProgramRef: programRef }, drafts: [
            { ref: moduleRef, resource: module, expectedFingerprint: null }, { ref: programRef, resource: program, expectedFingerprint: null },
        ] });
    expect(result.trial.status).toBe('completed'); expect(f.fetchImpl).toHaveBeenCalledTimes(2);
    expect(f.fetchImpl.mock.calls.map(([, options]) => JSON.parse(options.body).messages[0].content)).toEqual([module.body, module.body]);
    expect(result.routing.compute.attempts.map(item => item.status)).toEqual(['unknown', 'settled']);
});
