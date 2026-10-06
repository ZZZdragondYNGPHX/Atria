import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness, makeMultiHandleFsEngine } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { PromptPresetStore } from '../../src/native/model-prompt-runtime/presets.js';
import { PromptCandidateStore } from '../../src/native/model-prompt-runtime/prompt-candidates.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../../src/native/model-prompt-runtime/prompt-compiler.js';
import { GenerationService } from '../../src/native/model-prompt-runtime/generation-service.js';
import { createGenerationProviderAdapter } from '../../src/native/adapters/generation-provider.js';
import { hashNativeDocument, getNativeDocument, putMutable } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { Readable } from 'node:stream';
import { rm } from 'node:fs/promises';
import { mapVersionedModelPromptResourceRefs, assertPackageVersionedModelPromptResourceEnvelope } from '../../src/native/model-prompt-runtime/resources.js';

const cleanup = [];
afterEach(async () => { setReadOnly(false); for (const fn of cleanup.splice(0)) await fn(); });
const rootKey = (h, id) => ({ kind: K.versionedJsonResource, handle: h.handle, resourceType: 'core.prompt-program', resourceId: id });
const revisionKey = (h, ref) => ({ kind: K.versionedJsonResourceRevision, handle: h.handle, resourceType: ref.resourceType, resourceId: ref.resourceId, revision: ref.revision });

async function fixture(make = makeTempFsEngineHarness, role = 'role.narrator') {
    const h = await make(); cleanup.push(h.cleanup);
    const presets = new PromptPresetStore({ engine: h.engine }), candidates = new PromptCandidateStore({ engine: h.engine });
    const persistence = new NativeModelPromptPersistence({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
    const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: createNativeId('revision'), displayName: 'Style', target: 'system.style', stages: ['stage.main'], body: 'Original style' };
    const guard = { ...module, promptModuleId: createNativeId('promptModule'), body: 'Required guard', target: 'system.foundation' };
    const ref = r => ({ scope: 'library', resourceType: 'core.prompt-module', resourceId: r.promptModuleId, revision: r.revision });
    const program = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: createNativeId('revision'), displayName: 'Writer', stages: [{ stageId: 'stage.main', moduleRefs: [ref(module), ref(guard)] }] };
    const generation = { schemaVersion: 1, generationProfileId: createNativeId('generationProfile'), revision: createNativeId('revision'), displayName: 'Settings', output: { maxTokens: 10 } };
    const source = { format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId, entries: [{ resourceType: 'core.prompt-program', resource: program }, { resourceType: 'core.prompt-module', resource: module }, { resourceType: 'core.prompt-module', resource: guard }, { resourceType: 'core.generation-profile', resource: generation }] };
    const saved = await presets.save(h.handle, source, { importing: true }), preset = await presets.get(h.handle, saved.presetId);
    const moduleRef = preset.refs.find(r => r.resourceType === 'core.prompt-module' && preset.entries.some(e => e.resource.promptModuleId === r.resourceId && e.resource.body === module.body));
    const connection = { schemaVersion: 1, connectionProfileId: createNativeId('connectionProfile'), scope: 'player', displayName: 'Fixture', providerAdapter: 'provider.fixture', transport: 'transport.https', endpoint: 'https://fixture.invalid/v1', secretRef: { secretId: 'fixture', scope: 'player' } };
    const model = { schemaVersion: 1, modelProfileId: createNativeId('modelProfile'), scope: 'player', displayName: 'Fixture', connectionProfileRef: { connectionProfileId: connection.connectionProfileId, scope: 'player' }, remoteModelId: 'fixture', limits: { contextTokens: 1000, outputTokens: 20 } };
    await persistence.saveConnectionProfile(h.handle, connection); await persistence.saveModelProfile(h.handle, model);
    const rawRoute = { schemaVersion: 1, runtimeRouteId: createNativeId('runtimeRoute'), scope: 'player', displayName: 'One local route', role, connectionProfileRef: model.connectionProfileRef, modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, promptProgramRef: preset.refs.find(r => r.resourceId === saved.presetId), generationProfileRef: preset.refs.find(r => r.resourceType === 'core.generation-profile'), policy: { maxRetries: 0, maxFallbackAttempts: 0, timeoutMs: 1000 } };
    await persistence.saveRuntimeRoute(h.handle, rawRoute);
    const route = await persistence.getRuntimeRoute(h.handle, rawRoute.runtimeRouteId);
    const declare = () => candidates.declare(h.handle, saved.presetId, { expectedRevision: saved.revision, moduleRefs: [moduleRef] });
    const prepare = (body = 'Candidate style') => candidates.prepare(h.handle, saved.presetId, { runtimeRouteId: route.runtimeRouteId, expectedRouteFingerprint: hashNativeDocument(route), moduleRef, body });
    return { h, presets, candidates, persistence, library, saved, preset, moduleRef, route, declare, prepare, source };
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s candidates reopen, deduplicate and retain exact revisions with local binding only', async (_name, make) => {
    const f = await fixture(make);
    await expect(f.prepare()).rejects.toThrow('declared');
    await f.declare(); const c = await f.prepare();
    expect(await f.prepare()).toEqual(c);
    expect(await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId)).toEqual(f.route);
    expect(await f.presets.get(f.h.handle, f.saved.presetId)).toEqual(f.preset);
    const otherRoute = { ...f.route, runtimeRouteId: createNativeId('runtimeRoute') };
    await f.persistence.saveRuntimeRoute(f.h.handle, otherRoute);
    const reopened = new PromptCandidateStore({ engine: f.h.engine });
    expect((await reopened.inspect(f.h.handle, f.saved.presetId)).candidates).toEqual([c]);
    const applied = await reopened.apply(f.h.handle, f.saved.presetId, c.candidateId);
    expect(applied.alreadyApplied).toBe(false);
    expect((await reopened.apply(f.h.handle, f.saved.presetId, c.candidateId)).alreadyApplied).toBe(true);
    expect(await f.persistence.getRuntimeRoute(f.h.handle, otherRoute.runtimeRouteId)).toEqual(otherRoute);
    expect(applied.desiredRoute.generationProfileRef).toEqual(f.route.generationProfileRef);
    expect((await f.library.getExact(f.h.handle, f.moduleRef)).snapshot.body).toBe('Original style');
    expect((await f.library.getExact(f.h.handle, c.changedRefs.find(r => r.resourceId === f.moduleRef.resourceId))).snapshot.body).toBe('Candidate style');
});

test.each(['role.narrator', 'role.studio'])('%s original GenerationService snapshots show next exact candidate, prepared old request remains old', async role => {
    const f = await fixture(makeTempFsEngineHarness, role); await f.declare(); const c = await f.prepare();
    const send = jest.fn(async () => ({ choices: [{ message: { content: 'ok' } }] }));
    const provider = createGenerationProviderAdapter({ format: 'openai-compatible', send, countTokens: async () => 20, parseStream: async v => v });
    const resolver = new RouteResolver({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': provider } });
    const source = { kind: 'task', projectId: createNativeId('project'), taskId: 'fixture', revision: 'r1' };
    const service = new GenerationService({ resolver, contextProvider: { buildRequestContextPlan: async request => ({ schemaVersion: 1, requestId: request.requestId, source, items: [], budget: { maxTokens: 100, reservedOutputTokens: 10 }, provenance: [] }) }, preparePrompt: new PromptCompiler().preparePrompt, secretPort: { resolveSecret: async () => 'synthetic-private-credential' } });
    const request = { handle: f.h.handle, requestId: 'req-old', role, routeRef: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId }, input: 'hello' };
    const old = await service.execute(request, { preview: true });
    await f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId);
    const next = await service.execute({ ...request, requestId: 'req-new' });
    expect(next.snapshot.promptProgramRef).toEqual(c.changedRefs.find(r => r.resourceId === f.saved.presetId));
    expect(next.snapshot.promptIr.directives).toEqual(['Required guard', 'Candidate style']);
    expect(old.snapshot.promptIr.directives).toEqual(['Required guard', 'Original style']);
    expect(JSON.stringify(send.mock.calls[0][0])).toContain('Candidate style');
    expect(send).toHaveBeenCalledTimes(1);
});

test('two repository candidates race on whole Route CAS and preserve user edits', async () => {
    const f = await fixture(); await f.declare(); const a = await f.prepare('A'), b = await f.prepare('B');
    const other = new PromptCandidateStore({ engine: f.h.engine });
    const result = await Promise.allSettled([f.candidates.apply(f.h.handle, f.saved.presetId, a.candidateId), other.apply(f.h.handle, f.saved.presetId, b.candidateId)]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(r => r.status === 'rejected')).toHaveLength(1);
    const current = await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId);
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...current, displayName: 'User edit' });
    await expect(f.candidates.apply(f.h.handle, f.saved.presetId, a.candidateId)).rejects.toMatchObject({ code: 'native_prompt_candidate_conflict' });
});

test('inherited Program candidates retain the exact parent chain and unchanged guard module', async () => {
    const f = await fixture();
    const main = f.preset.entries.find(e => e.resourceType === 'core.prompt-program');
    const parent = { ...structuredClone(main.resource), promptProgramId: createNativeId('promptProgram'), revision: createNativeId('revision') };
    main.resource.parentRef = { scope: 'library', resourceType: 'core.prompt-program', resourceId: parent.promptProgramId, revision: parent.revision };
    main.resource.stages = [{ stageId: 'stage.main', moduleRefs: [] }];
    f.preset.entries.push({ resourceType: 'core.prompt-program', resource: parent });
    const saved = await f.presets.save(f.h.handle, f.preset, { id: f.saved.presetId, expectedRevision: f.saved.revision });
    const preset = await f.presets.get(f.h.handle, saved.presetId);
    const moduleRef = preset.refs.find(r => r.resourceId === f.moduleRef.resourceId);
    const route = { ...f.route, promptProgramRef: preset.refs.find(r => r.resourceId === saved.presetId), generationProfileRef: preset.refs.find(r => r.resourceType === 'core.generation-profile') };
    await f.persistence.saveRuntimeRoute(f.h.handle, route);
    await f.candidates.declare(f.h.handle, saved.presetId, { expectedRevision: saved.revision, moduleRefs: [moduleRef] });
    const c = await f.candidates.prepare(f.h.handle, saved.presetId, { runtimeRouteId: route.runtimeRouteId, expectedRouteFingerprint: hashNativeDocument(route), moduleRef, body: 'Inherited style' });
    expect(c.changedRefs).toHaveLength(3);
    const result = await f.candidates.apply(f.h.handle, saved.presetId, c.candidateId);
    const desired = await f.library.getExact(f.h.handle, result.desiredRoute.promptProgramRef);
    expect(desired.snapshot.parentRef).toEqual(c.changedRefs.find(r => r.resourceId === parent.promptProgramId));
    const changedParent = await f.library.getExact(f.h.handle, desired.snapshot.parentRef);
    expect(changedParent.snapshot.stages[0].moduleRefs.find(r => r.resourceId === moduleRef.resourceId)).toEqual(c.changedRefs.find(r => r.resourceId === moduleRef.resourceId));
    const guardRef = preset.refs.find(r => r.resourceType === 'core.prompt-module' && r.resourceId !== moduleRef.resourceId);
    expect(changedParent.snapshot.stages[0].moduleRefs).toContainEqual(guardRef);
});

test.each(['edit', 'delete', 'redeclare'])('Preset %s prevents pending activation and preserves original exact resources', async action => {
    const f = await fixture(); await f.declare(); const c = await f.prepare();
    if (action === 'edit') { f.preset.regexScripts = [{ id: 'new', scriptName: 'Rule', findRegex: 'a', replaceString: 'b', placement: [1] }]; await f.presets.save(f.h.handle, f.preset, { id: f.saved.presetId, expectedRevision: f.saved.revision }); }
    if (action === 'delete') await f.presets.delete(f.h.handle, f.saved.presetId, f.saved.revision);
    if (action === 'redeclare') await f.candidates.declare(f.h.handle, f.saved.presetId, { expectedRevision: f.saved.revision, moduleRefs: [] });
    await expect(f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId)).rejects.toThrow();
    expect((await f.library.getExact(f.h.handle, f.moduleRef)).snapshot.body).toBe('Original style');
    expect(await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId)).toEqual(f.route);
});

test.each(['missing', 'corrupt', 'schema', 'protected'])('rejects %s candidate revision or metadata without latest fallback', async mode => {
    const f = await fixture(); await f.declare(); const c = await f.prepare();
    const ref = c.changedRefs.find(r => r.resourceId === f.moduleRef.resourceId);
    await f.h.engine.withTransaction(f.h.handle, async tx => {
        if (mode === 'missing') return tx.deleteResource(revisionKey(f.h, ref));
        if (mode === 'corrupt' || mode === 'protected') {
            const resource = await getNativeDocument(tx, revisionKey(f.h, ref));
            await putMutable(tx, revisionKey(f.h, ref), { ...resource, ...(mode === 'corrupt' ? { body: 'wrong' } : { target: 'context.after_input' }) });
        } else {
            const root = await getNativeDocument(tx, rootKey(f.h, f.saved.presetId));
            root.promptEvolution.candidates[0].schemaVersion = 9;
            await putMutable(tx, rootKey(f.h, f.saved.presetId), root);
        }
    });
    await expect(f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId)).rejects.toThrow();
    expect(await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId)).toEqual(f.route);
});

test('failed metadata or Route publication leaves no effective candidate; lost response reconciles', async () => {
    const f = await fixture(); await f.declare();
    const transaction = f.h.engine.withTransaction.bind(f.h.engine);
    let fault = 'metadata';
    const intercept = jest.spyOn(f.h.engine, 'withTransaction').mockImplementation((handle, fn) => transaction(handle, tx => fn(new Proxy(tx, {
        get(target, method) {
            if (method === 'putResource') return async (k, value) => {
                if (fault === 'metadata' && k.kind === K.versionedJsonResource && value.doc?.promptEvolution?.candidates.length) throw new Error('metadata failure');
                return target.putResource(k, value);
            };
            if (method === 'putResourceIfMatch') return async (k, expected, value) => {
                const result = await target.putResourceIfMatch(k, expected, value);
                if (fault === 'response' && k.kind === K.runtimeRoute) throw new Error('response lost');
                return result;
            };
            const value = target[method]; return typeof value === 'function' ? value.bind(target) : value;
        },
    }))));
    await expect(f.prepare()).rejects.toThrow('metadata failure'); fault = null;
    expect((await f.candidates.inspect(f.h.handle, f.saved.presetId)).candidates).toEqual([]);
    const c = await f.prepare();
    fault = 'response';
    await expect(f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId)).rejects.toThrow('response lost'); intercept.mockRestore();
    expect((await f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId)).alreadyApplied).toBe(true);
});

test('capacity, body-only fields, unknown declarations and package refs are rejected', async () => {
    const f = await fixture(); await f.declare();
    await expect(f.prepare('x'.repeat(65537))).rejects.toThrow('64 KiB');
    await expect(f.candidates.prepare(f.h.handle, f.saved.presetId, { tools: [], body: 'x' })).rejects.toThrow('fields');
    await expect(f.prepare('{{secret.value}}')).rejects.toThrow('variable_scope');
    await expect(f.prepare('{{param.undeclared}}')).rejects.toThrow('variable_scope');
    await expect(f.candidates.declare(f.h.handle, f.saved.presetId, { expectedRevision: f.saved.revision, moduleRefs: [{ ...f.moduleRef, scope: 'package', packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion') }] })).rejects.toThrow();
    for (let i = 0; i < 16; i++) await f.prepare('candidate-' + i);
    await expect(f.prepare('candidate-17')).rejects.toThrow('capacity');
});

test('actual Project Generation Host task consumes exact activated Prompt through scheduler and original compiler', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'role.studio'); await f.declare(); const c = await f.prepare();
    const projectId = createNativeId('project');
    const send = jest.fn(async () => ({ choices: [{ message: { content: 'ok' } }] }));
    const provider = createGenerationProviderAdapter({ format: 'openai-compatible', send, countTokens: async () => 20, parseStream: async v => v });
    const host = new NativeGenerationHost({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': provider },
        studio: { getProject: async () => ({ source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } }) },
        agent: { getContext: async () => ({ task: { status: 'planned', baseRevision: 'r1' }, tools: [] }) },
        secretPort: { resolveSecret: async () => 'synthetic-private-credential' } });
    await f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId);
    const result = await host.execute(f.h.handle, { role: 'studio', projectId, revision: 'r1', taskId: 's08-task', requestId: 's08-project', messages: [{ role: 'user', content: 'Author fixture' }] });
    expect(result.snapshot.promptProgramRef).toEqual(c.changedRefs.find(r => r.resourceId === f.saved.presetId));
    expect(result.snapshot.promptIr.directives).toEqual(['Required guard', 'Candidate style']);
    expect(result.snapshot.contextPlan.source.projectId).toBe(projectId);
    expect(JSON.stringify(send.mock.calls[0][0])).toContain('Candidate style');
});

test('SQLite dump/restore retains exact candidates; original close-and-remove user lifecycle clears them', async () => {
    const f = await fixture(makeTempSqliteEngineHarness); await f.declare(); const c = await f.prepare();
    await f.candidates.apply(f.h.handle, f.saved.presetId, c.candidateId);
    const chunks = []; for await (const chunk of await f.h.engine.dumpUser(f.h.handle)) chunks.push(chunk);
    await f.h.engine.deleteUser(f.h.handle);
    await rm(f.h.dirs.root, { recursive: true, force: true });
    await expect(f.candidates.inspect(f.h.handle, f.saved.presetId)).rejects.toThrow();
    await f.h.engine.restoreUser(f.h.handle, Readable.from(Buffer.concat(chunks)));
    expect((await f.candidates.check(f.h.handle, f.saved.presetId, c.candidateId)).alreadyApplied).toBe(true);
});

test('Package envelopes remain exact and unchanged while explicit import creates an isolated author Preset copy', async () => {
    const f = await fixture();
    const owner = { scope: 'package', packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion') };
    const entries = f.source.entries.map(e => assertPackageVersionedModelPromptResourceEnvelope({ resourceType: e.resourceType, resource: mapVersionedModelPromptResourceRefs(e.resourceType, e.resource, r => ({ ...r, ...owner })), origin: owner }, owner));
    const before = JSON.stringify(entries);
    const saved = await f.presets.save(f.h.handle, { ...f.source, entries }, { importing: true });
    const copy = await f.presets.get(f.h.handle, saved.presetId);
    expect(copy.refs.every(r => r.scope === 'library')).toBe(true);
    expect(copy.refs.every(r => !f.preset.refs.some(old => old.resourceId === r.resourceId))).toBe(true);
    expect(JSON.stringify(entries)).toBe(before);
    expect((await f.presets.get(f.h.handle, f.saved.presetId)).entries).toEqual(f.preset.entries);
});

test('HTTP authenticates owner, ignores body owner, uses no-store and respects read-only', async () => {
    const f = await fixture(async () => {
        const h = await makeTempFsEngineHarness();
        return { ...h, engine: makeMultiHandleFsEngine({ root: h.dataRoot }).engine };
    });
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use(createNativeGenerationRouter(() => ({ library: f.library, persistence: f.persistence })));
    const url = '/presets/' + f.saved.presetId + '/prompt-candidates/';
    await supertest(app).post(url + 'inspect').expect(401);
    await supertest(app).post(url + 'inspect').set('x-user', 'other').expect(404);
    await supertest(app).post(url + 'declare').set('x-user', f.h.handle).send({ expectedRevision: f.saved.revision, moduleRefs: [f.moduleRef], owner: 'other' }).expect(400);
    await supertest(app).post(url + 'declare').set('x-user', f.h.handle).send({ expectedRevision: f.saved.revision, moduleRefs: [f.moduleRef] }).expect(200);
    const c = (await supertest(app).post(url + 'prepare').set('x-user', f.h.handle).send({ runtimeRouteId: f.route.runtimeRouteId, expectedRouteFingerprint: hashNativeDocument(f.route), moduleRef: f.moduleRef, body: 'HTTP body' }).expect(200)).body;
    setReadOnly(true);
    const check = await supertest(app).post(url + 'check').set('x-user', f.h.handle).send({ candidateId: c.candidateId, owner: 'other' }).expect(200);
    expect(check.headers['cache-control']).toBe('private, no-store');
    await supertest(app).post(url + 'apply').set('x-user', f.h.handle).send({ candidateId: c.candidateId }).expect(503);
    setReadOnly(false);
    await supertest(app).post(url + 'apply').set('x-user', f.h.handle).send({ candidateId: c.candidateId }).expect(200);
});
