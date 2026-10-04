import express from 'express';
import request from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { runFixture } from './helpers/run-fixture.js';
import { jest } from '@jest/globals';
import { IllustrationPromptService, parseIllustrationPrompt } from '../../src/native/illustration-prompt-service.js';
import { IllustrationService } from '../../src/native/illustration-service.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { defaultIllustrationSettings, createIllustrationDraft } from '../../public/shared/illustration-plugin-contract.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const output = { scene: 'harbor, sunset', characters: [{ id: 'alice', dynamicPrompt: 'smiling', clothing: null }] };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const selection = (view, entry = view.timeline.at(-1)) => ({ revisionId: view.revision.revisionId, messageId: entry.messageId,
    variantId: entry.activeVariantId, start: 0, end: entry.content.length, quote: entry.content });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Illustration prompts — %s', (_name, harness) => {
    let h, f, view, host, prompts, illustrations, settings, gate, sent;
    beforeEach(async () => {
        h = await harness(); f = await installFixture(h); view = await f.core.create(h.handle, f.start);
        const config = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: 'http://127.0.0.1:1/unused', roles: ['illustration_prompt'] });
        settings = defaultIllustrationSettings(); settings.promptRouteId = config.routes[0].runtimeRouteId; settings.preset.style = 'watercolor'; settings.preset.quality = 'high quality';
        settings.characters = [{ id: 'alice', name: 'Alice', aliases: [], fixedPrompt: 'blue eyes', defaultClothing: 'coat', enabled: true, storyActorId: '' }];
        settings.works[view.session.packageId] = { characterIds: ['alice'] };
        const extensions = new ExtensionsStore({ engine: h.engine });
        await extensions.saveIllustrationSettings(h.handle, settings, (await extensions.illustrationSettings(h.handle)).revision);
        gate = deferred(); sent = deferred();
        const provider = { resolveCapabilities: async () => [],
            countTokens: async ({ promptIr }) => Math.ceil(JSON.stringify(promptIr).length / 4),
            renderRequest: async ({ snapshot }) => ({ promptIr: snapshot.promptIr }),
            send: jest.fn(async rendered => { sent.resolve(rendered); await gate.promise; return { text: JSON.stringify(output) }; }),
            parseStream: async value => value, normalizeResponse: async value => value };
        host = new NativeGenerationHost({ ...config, sessionCore: f.core, packageInstaller: f.packageInstaller, providers: { 'provider.openai-compatible': provider }, secretPort: { resolveSecret: async () => 'synthetic-credential' }, extensions });
        prompts = new IllustrationPromptService({ host, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }) });
        illustrations = new IllustrationService({ sessionRepo: f.sessionRepo, sessionCore: f.core });
    });
    afterEach(async () => { gate.resolve(); await tick(); await h.cleanup(); });
    async function mark(entry = view.timeline.at(-1)) {
        const { draft } = createIllustrationDraft('Alice', settings, view.session.packageId);
        const result = await illustrations.createAnnotation(h.handle, view.session.sessionId, { ...selection(view, entry), draft });
        return result.state.annotations.at(-1);
    }
    const start = annotation => prompts.start(h.handle, { sessionId: view.session.sessionId, branchId: view.revision.branchId, annotationId: annotation.annotationId });
    async function finish(operationId) { gate.resolve(); await prompts.scheduler.operations.get(operationId).handle.result; return prompts.status(h.handle, { operationId }); }

    test('independent route uses source revision, full quote, two prior rounds and selected facts; never future/alternate narrative', async () => {
        for (const content of ['u0', 'a0', 'u1', 'a1', 'u2', 'a2', 'u3', 'Alice walks.\n\nAt the harbor.\n\nSunset.']) {
            view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role: content.startsWith('u') ? 'user' : 'assistant', content });
        }
        const source = structuredClone(view), entry = view.timeline.at(-1);
        view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role: 'user', content: 'FUTURE_SECRET_PLOT' });
        const annotation = await mark(entry);
        expect(host.providers['provider.openai-compatible'].send).not.toHaveBeenCalled();
        const started = await start(annotation); const rendered = await sent.promise;
        const full = JSON.stringify(rendered);
        expect(full).toContain(entry.content.replaceAll('\n', '\\n'));
        expect(full).toContain('u1'); expect(full).toContain('a1'); expect(full).toContain('u2'); expect(full).toContain('a2');
        expect(full).not.toContain('u0'); expect(full).not.toContain('u3'); expect(full).not.toContain('FUTURE_SECRET_PLOT');
        expect(host.providers['provider.openai-compatible'].send).toHaveBeenCalledTimes(1);
        const result = await finish(started.operationId), version = result.state.annotations.at(-1).promptVersions[0];
        expect(version.requestSnapshot.contextPlan.source.revisionId).toBe(source.revision.revisionId);
        expect(version.requestSnapshot.diagnostics.effectiveConfig.role).toBe('role.illustration_prompt');
        expect(version.draft.prompt).toBe('watercolor, high quality, harbor, sunset, blue eyes, coat, smiling');
        expect(result.state.images).toHaveLength(0);
        expect((await f.core.load(h.handle, view.session.sessionId)).revision).toEqual(view.revision);
    });

    test('deduplicates a mark, survives chat/branch/config changes, preserves edits, creates versions and exports frozen evidence', async () => {
        const annotation = await mark(), originalBranch = view.revision.branchId;
        const started = await start(annotation); await sent.promise;
        const duplicate = await start(annotation); expect(duplicate.operationId).toBe(started.operationId);
        view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role: 'user', content: 'later plot' });
        view = await f.core.forkBranch(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId, expectedRevisionId: view.revision.revisionId });
        const edited = structuredClone(annotation.draft); edited.prompt = 'user edit';
        await illustrations.updateAnnotation(h.handle, view.session.sessionId, { annotationId: annotation.annotationId, draft: edited, branchId: originalBranch });
        settings.preset.style = 'changed'; settings.characters[0].fixedPrompt = 'changed appearance';
        await host.extensions.saveIllustrationSettings(h.handle, settings, (await host.extensions.illustrationSettings(h.handle)).revision);
        const result = await finish(started.operationId);
        expect(result.operation.anchor.branchId).toBe(originalBranch);
        expect(result.state.annotations[0].draft.prompt).toBe('user edit');
        expect(result.state.annotations[0].promptVersions[0].draft.prompt).toContain('blue eyes');
        expect((await f.core.load(h.handle, view.session.sessionId)).illustrations.annotations[0].promptVersions).toBeUndefined();
        view = await f.core.switchBranch(h.handle, view.session.sessionId, originalBranch, { expectedRevisionId: view.revision.revisionId });
        const second = await start(result.state.annotations[0]); await finish(second.operationId);
        expect((await f.core.load(h.handle, view.session.sessionId)).illustrations.annotations[0].promptVersions).toHaveLength(2);
        const archive = await f.saveSystem.exportSession(h.handle, view.session.sessionId);
        const target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, archive.archive);
            expect(imported.illustrations.annotations[0].promptVersions).toHaveLength(2);
            expect(JSON.stringify(imported.illustrations)).not.toContain('synthetic-credential');
        } finally { await target.cleanup(); }
    });

    test('queued prompt freezes the model route and cannot read a sibling branch source', async () => {
        prompts.scheduler = new NativeTaskScheduler({ concurrency: 1, timeoutMs: 10000 });
        const hold = deferred();
        const blocker = prompts.scheduler.submit({ owner: h.handle, anchor: {}, executionClass: 'interactive', resources: ['fixture'], key: 'fixture', fingerprint: 'fixture', fresh: async () => true, run: () => hold.promise, finalize: async () => ({}) });
        const annotation = await mark(); const started = await start(annotation);
        expect(prompts.scheduler.project(h.handle, started.operationId).status).toBe('queued');
        const model = (await host.persistence.listModelProfiles(h.handle))[0];
        await host.persistence.saveModelProfile(h.handle, { ...model, remoteModelId: 'new-model-after-submit' });
        const original = structuredClone(view);
        view = await f.core.forkBranch(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId, expectedRevisionId: view.revision.revisionId });
        await expect(f.sessionRepo.loadSnapshot(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId, illustrationAnchor: annotation.anchor })).rejects.toThrow('ancestry');
        hold.resolve(); await blocker.result; await sent.promise;
        const result = await finish(started.operationId);
        expect(result.operation.anchor.branchId).toBe(original.revision.branchId);
        expect(result.state.annotations[0].promptVersions[0].requestSnapshot.diagnostics.effectiveConfig.model.remoteModelId).toBe('p4-fixture');
    });

    test('cancel/deletion reject late delivery and expose task failure without cancelling narrative', async () => {
        const annotation = await mark(); const started = await start(annotation); await sent.promise;
        prompts.scheduler.cancel(h.handle, started.operationId); gate.resolve();
        await expect(prompts.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow('cancelled');
        await tick(); expect((await prompts.status(h.handle, { operationId: started.operationId })).state.annotations[0].promptVersions).toBeUndefined();
        gate = deferred(); sent = deferred(); const deletedTask = await start(annotation); await sent.promise;
        await illustrations.deleteAnnotation(h.handle, view.session.sessionId, { annotationId: annotation.annotationId }); gate.resolve();
        await expect(prompts.scheduler.operations.get(deletedTask.operationId).handle.result).rejects.toThrow('stale');
        const result = await prompts.status(h.handle, { operationId: deletedTask.operationId });
        expect(result.state.annotations[0].promptVersions).toBeUndefined(); expect(result.operation.status).toBe('stale');
        await expect(start(annotation)).rejects.toThrow('deleted');
    });

    test('HTTP returns a server-owned task, authenticated reconnect/cancel stay isolated, invalid output retries only this step', async () => {
        prompts.scheduler = nativeTaskScheduler;
        const app = express(); app.use(express.json());
        app.use((req, res, next) => { if (req.headers['x-owner']) req.user = { profile: { handle: req.headers['x-owner'] } }; next(); });
        app.use(createNativeGenerationRouter(() => host));
        const annotation = await mark();
        const input = { sessionId: view.session.sessionId, branchId: view.revision.branchId, annotationId: annotation.annotationId };
        expect((await request(app).post('/illustration-prompts').send(input)).status).toBe(401);
        expect((await request(app).post('/illustration-prompts').set('x-owner', h.handle).send({ ...input, prompt: 'untrusted' })).status).toBe(400);
        const started = await request(app).post('/illustration-prompts').set('x-owner', h.handle).send(input);
        expect(started.status).toBe(202); await sent.promise;
        expect((await request(app).get('/illustration-prompts/' + started.body.operationId).set('x-owner', 'foreign')).status).toBe(404);
        const listed = await request(app).get('/illustration-prompts').query({ sessionId: input.sessionId, branchId: input.branchId }).set('x-owner', h.handle);
        expect(listed.body[0].operationId).toBe(started.body.operationId);
        expect((await request(app).delete('/operations/' + started.body.operationId).set('x-owner', 'foreign')).status).toBe(404);
        await finish(started.body.operationId);
        expect((await request(app).get('/illustration-prompts/' + started.body.operationId).set('x-owner', h.handle)).body.operation.status).toBe('completed');
        host.providers['provider.openai-compatible'].send.mockImplementationOnce(async () => ({ text: 'bad json' }));
        const invalid = await start(annotation);
        await expect(prompts.scheduler.operations.get(invalid.operationId).handle.result).rejects.toThrow('prompt_invalid');
        expect((await prompts.status(h.handle, invalid)).operation.errorCode).toBe('native_illustration_prompt_invalid');
        expect((await f.core.load(h.handle, input.sessionId)).illustrations.annotations[0].promptVersions).toHaveLength(1);
        const retried = await start(annotation); await finish(retried.operationId);
        expect((await f.core.load(h.handle, input.sessionId)).illustrations.annotations[0].promptVersions).toHaveLength(2);
        expect((await f.core.load(h.handle, input.sessionId)).illustrations.images).toHaveLength(0);
    });

    test('actual Provider counting trims background before whole history and preserves the complete subject', async () => {
        for (const [role, content] of [['user', 'earlier ' + 'background '.repeat(1500)], ['assistant', 'long history'], ['user', 'next'], ['assistant', 'Alice']]) {
            view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role, content });
        }
        const model = (await host.persistence.listModelProfiles(h.handle))[0];
        await host.persistence.saveModelProfile(h.handle, { ...model, limits: { contextTokens: 1800, outputTokens: 512 } });
        const annotation = await mark(); const started = await start(annotation); await sent.promise;
        const result = await finish(started.operationId);
        const context = result.state.annotations[0].promptVersions[0].requestSnapshot.contextPlan;
        expect(context.items.find(item => item.id === 'illustration-subject').content).toContain('Alice');
        expect(context.provenance.some(item => item.source === 'atri.illustration.omitted')).toBe(true);
        expect(result.state.annotations[0].promptVersions[0].requestSnapshot.diagnostics.inputTokens).toBeLessThanOrEqual(1288);
    });

    test('ironman captures historical source without rewind, resume import retains context and prompt requests do not charge narrative attempts', async () => {
        f = await runFixture(h, 'http://127.0.0.1:1/unused'); view = await f.begin('ironman');
        settings.works[view.session.packageId] = { characterIds: ['alice'] };
        host.sessionCore = f.core; host.packageInstaller = f.packageInstaller;
        prompts = new IllustrationPromptService({ host, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }) });
        illustrations = new IllustrationService({ sessionRepo: f.sessionRepo, sessionCore: f.core });
        const entry = view.timeline.at(-1), originRevision = view.revision.revisionId;
        const later = structuredClone(view); later.states.atri_lifecycle.logicalTime++;
        view = await f.core._publish(h.handle, later);
        await expect(f.core.load(h.handle, view.session.sessionId, { revisionId: originRevision })).rejects.toThrow('rewind_denied');
        const annotation = await mark(entry);
        const before = await f.core.runs.status(h.handle, view.session.sessionId);
        const started = await start(annotation); await sent.promise; await finish(started.operationId);
        expect((await f.core.runs.status(h.handle, view.session.sessionId)).operations).toEqual(before.operations);
        const archive = await f.saveSystem.exportSession(h.handle, view.session.sessionId);
        const target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, f.archive);
            const imported = await other.saveSystem.importSave(target.handle, archive.archive);
            expect(imported.illustrations.annotations[0].promptContext.source.revisionId).toBe(originRevision);
            expect(imported.illustrations.annotations[0].promptVersions).toHaveLength(1);
            const config = await seedGenerationProfiles({ engine: target.engine, handle: target.handle, endpoint: 'http://127.0.0.1:1/unused', roles: ['illustration_prompt'] });
            const newHost = new NativeGenerationHost({ ...config, sessionCore: other.core, packageInstaller: other.packageInstaller, extensions: new ExtensionsStore({ engine: target.engine }), providers: host.providers, secretPort: host.secretPort });
            const resumed = new IllustrationPromptService({ host: newHost, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }) });
            const operation = await resumed.start(target.handle, { sessionId: imported.session.sessionId, branchId: imported.revision.branchId, annotationId: annotation.annotationId });
            await resumed.scheduler.operations.get(operation.operationId).handle.result;
            const result = await resumed.status(target.handle, operation);
            expect(result.state.annotations[0].promptVersions).toHaveLength(2);
            expect(result.state.annotations[0].promptVersions[1].requestSnapshot.contextPlan.source.revisionId).toBe(originRevision);
            await other.sessionRepo.updateIllustrations(target.handle, imported.session.sessionId, state => ({ ...state, annotations: state.annotations.map(({ promptContext: _context, promptVersions: _versions, ...item }) => item) }));
            await expect(resumed.start(target.handle, { sessionId: imported.session.sessionId, branchId: imported.revision.branchId, annotationId: annotation.annotationId })).rejects.toThrow('source_unavailable');
        } finally { await target.cleanup(); }
        await expect(f.core.load(h.handle, view.session.sessionId, { revisionId: 'rev_' + 'f'.repeat(32) })).rejects.toThrow();
    });

    test('oversize subject fails before Provider send without silently cutting quote', async () => {
        const model = await host.persistence.getModelProfile(h.handle, (await host.persistence.listModelProfiles(h.handle))[0].modelProfileId);
        await host.persistence.saveModelProfile(h.handle, { ...model, limits: { contextTokens: 2200, outputTokens: 512 } });
        view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role: 'assistant', content: 'Alice ' + '主体'.repeat(9000) });
        const annotation = await mark(); const started = await start(annotation);
        await expect(prompts.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow('generation_context_budget_exceeded');
        expect(host.providers['provider.openai-compatible'].send).not.toHaveBeenCalled();
        const status = await prompts.status(h.handle, started); expect(status.operation.errorCode).toBe('generation_context_budget_exceeded');
    });
});

test('fixed appearance/preset and explicit clothing override stay program-owned; malformed character output rejected', () => {
    const draft = createIllustrationDraft('', defaultIllustrationSettings(), 'book').draft;
    expect(parseIllustrationPrompt('{"scene":"sky","characters":[]}', draft).prompt).toBe('sky');
    draft.characters = [{ character: { id: 'alice', name: 'Alice', aliases: [], fixedPrompt: 'blue eyes', defaultClothing: 'coat', enabled: true, storyActorId: '' }, dynamicPrompt: '', clothing: 'coat' }];
    const result = parseIllustrationPrompt(JSON.stringify({ scene: 'sky', characters: [{ id: 'alice', dynamicPrompt: 'running', clothing: 'red dress' }] }), draft);
    expect(result.characters[0].clothing).toBe('red dress'); expect(result.characters[0].character.fixedPrompt).toBe('blue eyes');
    expect(() => parseIllustrationPrompt(JSON.stringify({ scene: 'sky', characters: [{ id: 'alice', dynamicPrompt: 'running', clothing: null, fixedPrompt: 'altered' }] }), draft)).toThrow('invalid');
    expect(() => parseIllustrationPrompt('{"scene":"sky","characters":[{"id":"unknown"}]}', draft)).toThrow('invalid');
});
