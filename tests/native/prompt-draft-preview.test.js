import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { prepareDraftOverrides, previewPromptDraft } from '../../src/native/model-prompt-runtime/draft-preview.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture() {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://preview.invalid/v1/chat/completions' });
    const projectId = createNativeId('project');
    const project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const fetchImpl = jest.fn(async () => { throw new Error('Preview must never send'); });
    const secretPort = { resolveSecret: jest.fn(async () => { throw new Error('Preview must never resolve Secrets'); }) };
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project,
        listProjects: async () => [{ project: { projectId } }], listLibraryResources: async () => [] },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort });
    const request = { role: 'narrator', projectId, revision: 'r1', requestId: 'draft-1', messages: [{ role: 'user', content: 'Selected task' }] };
    const resource = (await seeded.library.getExact(h.handle, seeded.routes[0].promptProgramRef)).snapshot;
    const moduleRef = resource.stages[0].moduleRefs[0];
    const module = (await seeded.library.getExact(h.handle, moduleRef)).snapshot;
    const draft = { ref: moduleRef, expectedFingerprint: hashNativeDocument(module), resource: { ...module, body: 'Unpublished exact text\n原稿  ' } };
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use(createNativeGenerationRouter(() => host));
    return { h, host, ...seeded, project, request, draft, fetchImpl, secretPort, app };
}

test('authenticated Host uses one compiler for committed/draft three-layer diff without saving, Secret resolution or send', async () => {
    const f = await fixture(), before = await f.library.listWithRevisions(f.h.handle);
    const result = await f.host.previewDraft(f.h.handle, { request: f.request, drafts: [f.draft] });
    expect(result).toMatchObject({ preview: true, sent: false, publication: 'unpublished', diff: { sameSource: true } });
    expect(result.candidate.effective.promptIr.directives).toContain(f.draft.resource.body);
    expect(JSON.stringify(result.baseline.wire)).not.toContain('Unpublished exact text');
    expect(JSON.stringify(result.candidate.wire)).toContain('Unpublished exact text');
    expect(result.diff.wire.length).toBeGreaterThan(0);
    expect(result.candidate.authored.drafts[0].baseFingerprint).toBe(f.draft.expectedFingerprint);
    const edited = result.candidate.authored.resources.find(item => item.ref.resourceType === 'core.prompt-module');
    const base = result.baseline.authored.resources.find(item => item.ref.resourceType === 'core.prompt-module');
    expect(edited.baseFingerprint).toBe(base.resourceFingerprint);
    expect(edited.baseFingerprint).toBe(base.baseFingerprint);
    expect(edited.resourceFingerprint).not.toBe(edited.baseFingerprint);
    expect(result.candidate.effective.binding.versions.compiler).toBeDefined();
    expect(await f.library.listWithRevisions(f.h.handle)).toEqual(before);
    expect((await f.library.getExact(f.h.handle, f.draft.ref)).snapshot.body).not.toBe(f.draft.resource.body);
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('preview.invalid');
});

test('HTTP draft route requires authenticated owner, has no-store and dispatches no production execution', async () => {
    const f = await fixture();
    await supertest(f.app).post('/preview/draft').send({ request: f.request, drafts: [f.draft] }).expect(401);
    const result = await supertest(f.app).post('/preview/draft').set('x-user', f.h.handle).send({ request: f.request, drafts: [f.draft] }).expect(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    await supertest(f.app).post('/preview/draft').set('x-user', 'foreign').send({ request: f.request, drafts: [f.draft] }).expect(400);
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
});

test('resource catalogue supplies the normalized base fingerprint for Library and Project drafts', async () => {
    const f = await fixture();
    f.project.source.resources = [{ resourceType: 'core.prompt-module', resource: f.module }];
    const result = await supertest(f.app).get('/resources').set('x-user', f.h.handle).expect(200);
    const rows = result.body.filter(item => item.ref.resourceId === f.module.promptModuleId);
    expect(rows.map(item => item.ref.scope).sort()).toEqual(['library', 'project']);
    const canonical = (await f.library.getExact(f.h.handle, f.draft.ref)).snapshot;
    for (const row of rows) expect(row.fingerprint).toBe(hashNativeDocument(canonical));
});

test.each(['/execute', '/preview', '/task', '/turn', '/task/start', '/turn/start'])('%s rejects browser draft/Program executable ports before dispatch', async path => {
    const execute = jest.fn(async () => ({})), host = { execute, executeTask: execute, executeTurn: execute };
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: 'alice' } }; next(); });
    app.use(createNativeGenerationRouter(() => host));
    for (const key of ['drafts', 'baselineDrafts', 'draftOverrides', 'resourceOverrides', 'programSelection']) {
        expect((await supertest(app).post(path).send({ [key]: [] }).expect(400)).body.error).toBe('native_generation_preview_only');
    }
    expect(execute).not.toHaveBeenCalled();
});

test('drafts reject stale bases, identity changes, duplicates, missing closure, package edits and reference cycles', async () => {
    const f = await fixture(), preview = drafts => f.host.previewDraft(f.h.handle, { request: f.request, drafts });
    await expect(preview([{ ...f.draft, expectedFingerprint: '0'.repeat(64) }])).rejects.toMatchObject({ code: 'native_generation_draft_conflict' });
    expect(() => prepareDraftOverrides([{ ...f.draft, resource: { ...f.draft.resource, revision: 'new' } }])).toThrow('draft_identity');
    expect(() => prepareDraftOverrides([f.draft, f.draft])).toThrow('draft_duplicate');
    expect(() => prepareDraftOverrides([{ ...f.draft, ref: { ...f.draft.ref, scope: 'package', packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion') } }])).toThrow('draft_owner');
    const other = { ...f.module, promptModuleId: createNativeId('promptModule'), body: 'Unused' };
    await f.library.commit(f.h.handle, 'core.prompt-module', other);
    const ref = { ...f.draft.ref, resourceId: other.promptModuleId };
    const stored = (await f.library.getExact(f.h.handle, ref)).snapshot;
    await expect(preview([{ ref, resource: stored, expectedFingerprint: hashNativeDocument(stored) }])).rejects.toMatchObject({ code: 'native_generation_draft_unreferenced' });
    const program = (await f.library.getExact(f.h.handle, f.routes[0].promptProgramRef)).snapshot;
    await expect(preview([{ ref: f.routes[0].promptProgramRef, resource: { ...program, parentRef: f.routes[0].promptProgramRef }, expectedFingerprint: hashNativeDocument(program) }])).rejects.toMatchObject({ code: 'generation_resource_cycle' });
});

test('request mutations and cancellation never become a trusted baseline', async () => {
    const f = await fixture(), original = f.host.execute.bind(f.host);
    f.host.execute = async (...args) => {
        const result = await original(...args);
        f.project.revision.revision = 'changed';
        return result;
    };
    await expect(f.host.previewDraft(f.h.handle, { request: f.request, drafts: [f.draft] })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    const controller = new AbortController(); controller.abort();
    await expect(previewPromptDraft(f.host, f.h.handle, { request: f.request, drafts: [] }, controller.signal)).rejects.toMatchObject({ code: 'generation_cancelled' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
});

test('provider publicBody wins over private body and nested opaque/credential state is excluded', async () => {
    const f = await fixture(), original = f.host.execute.bind(f.host);
    f.host.execute = async (...args) => {
        const result = await original(...args);
        return { ...result, snapshot: { ...result.snapshot, promptIr: { ...result.snapshot.promptIr,
            compilation: { ...result.snapshot.promptIr.compilation, parameters: { binding: 'AUTHOR_BINDING', secretNote: 'AUTHOR_SECRET_NOTE', credentialHint: 'AUTHOR_CREDENTIAL_HINT' } } } },
        rendered: { ...result.rendered, body: { opaquePrivate: 'PRIVATE_BODY' }, providerState: 'PRIVATE_FRAME',
            publicBody: { messages: [{ role: 'user', content: 'Visible', providerState: 'PRIVATE_STATE', encrypted_content: 'PRIVATE_ENCRYPTED' }], secretRef: 'PRIVATE_SECRET',
                tools: [{ type: 'function', function: { name: 'valid', parameters: { type: 'object', properties: { binding: { type: 'string' }, secretNote: { type: 'string' } } } } }] } } };
    };
    const result = await f.host.previewDraft(f.h.handle, { request: f.request, drafts: [f.draft] });
    expect(result.candidate.wire.messages).toEqual([{ role: 'user', content: 'Visible' }]);
    expect(Object.keys(result.candidate.wire.tools[0].function.parameters.properties)).toEqual(['binding', 'secretNote']);
    expect(result.candidate.effective.promptIr.compilation.parameters).toEqual({ binding: 'AUTHOR_BINDING', secretNote: 'AUTHOR_SECRET_NOTE', credentialHint: 'AUTHOR_CREDENTIAL_HINT' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

test('project drafts remain scoped to the observed Project; new foreign dependencies cannot grant access', async () => {
    const f = await fixture();
    const programRef = { ...f.routes[0].promptProgramRef, scope: 'project', projectId: f.request.projectId };
    const moduleRef = { ...f.draft.ref, scope: 'project', projectId: f.request.projectId };
    const program = { ...f.prompt, stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] };
    f.project.source.resources = [{ resourceType: 'core.prompt-program', resource: program }, { resourceType: 'core.prompt-module', resource: f.module }];
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], promptProgramRef: programRef });
    const module = (await f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true })).snapshot.diagnostics.effectiveConfig.resources.find(item => item.ref.resourceType === 'core.prompt-module').resource;
    const result = await f.host.previewDraft(f.h.handle, { request: f.request, drafts: [{ ...f.draft, ref: moduleRef, expectedFingerprint: hashNativeDocument(module), resource: { ...module, body: 'Project draft' } }] });
    expect(result.candidate.effective.promptIr.directives).toContain('Project draft');
    const canonicalProgram = result.baseline.authored.resources.find(item => item.ref.resourceType === 'core.prompt-program').resource;
    const foreign = { ...moduleRef, projectId: createNativeId('project') };
    await expect(f.host.previewDraft(f.h.handle, { request: f.request, drafts: [{ ref: programRef,
        expectedFingerprint: hashNativeDocument(canonicalProgram), resource: { ...canonicalProgram, stages: [{ stageId: 'stage.main', moduleRefs: [foreign] }] } }] })).rejects.toMatchObject({ code: 'native_generation_resource_owner' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
});

test('baseline is Host-compiled and bounded JSON cannot carry saved results or executable data', async () => {
    const f = await fixture();
    const baseline = { ...f.draft, resource: { ...f.draft.resource, body: 'Baseline draft' } };
    const result = await f.host.previewDraft(f.h.handle, { request: f.request, drafts: [f.draft], baselineDrafts: [baseline] });
    expect(result.baseline.effective.promptIr.directives).toContain('Baseline draft');
    await expect(f.host.previewDraft(f.h.handle, { request: f.request, drafts: [], baseline: result.baseline })).rejects.toThrow('unknown field baseline');
    expect(() => prepareDraftOverrides(Array.from({ length: 33 }, () => f.draft))).toThrow('draft_invalid');
    expect(() => prepareDraftOverrides([{ ...f.draft, expectedFingerprint: undefined }])).toThrow();
    expect(() => prepareDraftOverrides([{ ...f.draft, resource: { ...f.draft.resource, body: 'x'.repeat(65537) } }])).toThrow();
    expect(() => prepareDraftOverrides([{ ...f.draft, apply: true }])).toThrow('unknown field apply');
});
