import { EMPTY } from '../../src/native/frontend/bridge.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { fixedHostTarget } from '../../public/shared/native-frontend-host.js';
import { jest } from '@jest/globals';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import request from 'supertest';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { runFixture } from './helpers/run-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { inspectAtriaSaveContainer, assertAtriaSave, createNativeId, NATIVE_RESOURCE_KINDS as K } from '../../src/native/index.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { writeFixedHost } from '../../src/native/frontend/host-services.js';
const durable = base => ({ revision: base.revision, states: base.states, timeline: base.timeline });
const execute = promisify(execFile);

describe.each(CONTRACT_HARNESSES)('P2 run lifecycle - $name', ({ make, name }) => {
    let h, f, server, seen, respond;
    beforeEach(async () => {
        h = await make(); seen = [];
        server = http.createServer(async (req, res) => {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
            try { const message = await respond(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] })); }
            catch { res.writeHead(503); res.end('{}'); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        f = await runFixture(h, 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions');
        respond = async body => body.tools?.length ? { content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify(f.selection.input) } }] } : { content: 'A consequence follows.' };
    });
    afterEach(async () => { jest.restoreAllMocks(); if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); await h?.cleanup(); });
    const input = base => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'turn', slotBindings: {} });
    const turn = base => f.host.executeTurn(h.handle, input(base), undefined, undefined, { transaction: f.selection });
    async function player(base) { return f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update the note.' }); }
    function app() {
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeSessionRouter(() => ({ ...f, assets: f.assetStore }))); return app;
    }
    test('stale MCP deletion preserves the active ironman run; exact deletion leaves its terminal tombstone', async () => {
        const started = await f.begin('ironman');
        const sessionId = started.session.sessionId;
        await expect(f.sessionRepo.delete(h.handle, sessionId, { expectedRevisionId: f.base.revision.revisionId })).rejects.toMatchObject({ code: 'native_session_delete_conflict' });
        expect(durable(await f.core.load(h.handle, sessionId))).toEqual(durable(started));
        expect(await f.core.runStatus(h.handle, sessionId)).toMatchObject({ status: 'active', mode: 'ironman' });
        expect(await f.sessionRepo.delete(h.handle, sessionId, { expectedRevisionId: started.revision.revisionId })).toBe(true);
        expect(await f.sessionRepo.get(h.handle, sessionId)).toBeNull();
        expect(await f.core.runStatus(h.handle, sessionId)).toMatchObject({ status: 'terminal', cleanup: 'complete' });
        expect(seen).toEqual([]);
    });
    test('validated multi-domain begin is one CAS, zero sends and durable/idempotent', async () => {
        const commit = jest.spyOn(f.sessionRepo, 'commitSnapshot');
        const [one, two] = await Promise.all([f.begin('ironman'), f.begin('ironman')]);
        expect(one.revision).toEqual(two.revision); expect(commit).toHaveBeenCalledTimes(1); expect(seen).toEqual([]);
        expect(one.states.atri_run).toMatchObject({ mode: 'ironman', status: 'active', startInvocationId: 'begin' });
        expect(one.timeline.at(-1).content).toBe('The harbor wakes.');
        for (const domain of ['notes', 'other']) expect(one.states.atri_lifecycle.domains[domain].records[0].value.text).toBe('Ada');
        expect(durable(await services(h).core.load(h.handle, one.session.sessionId))).toEqual(durable(one));
        await expect(f.begin('ordinary')).rejects.toThrow('conflict');
        await expect(f.begin('ironman', 'Ada', 'second')).rejects.toThrow('conflict');
    });
    test('invalid start, forged fields and late validation failure publish no character/opening', async () => {
        for (const input of [{ mode: 'ordinary', name: 'invalid' }, { mode: 'wrong', name: 'Ada' }, { mode: 'ordinary', name: 'Ada', effects: [] }]) {
            await expect(f.core.beginStory(h.handle, f.base.session.sessionId, { input, invocationId: 'begin', expectedRevisionId: f.base.revision.revisionId })).rejects.toThrow();
        }
        jest.spyOn(f.core, '_validateProjections').mockRejectedValueOnce(new TypeError('late start validation'));
        await expect(f.begin()).rejects.toThrow('late start validation');
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base)); expect(seen).toEqual([]);
        expect((await f.begin()).states.atri_run.status).toBe('active');
    });
    test('pending runs block generation, raw commands and premature saves before any send', async () => {
        await expect(turn(f.base)).rejects.toThrow('not_started');
        await expect(f.saveSystem.quickSave(h.handle, f.base.session.sessionId)).rejects.toThrow('not_started');
        await expect(f.core.applyLifecycleCommand(h.handle, f.base.session.sessionId, { type: 'lifecycle', invocationId: 'seed', action: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'forged' } } }, { expectedRevisionId: f.base.revision.revisionId })).rejects.toThrow('direct_command');
        expect(seen).toEqual([]);
    });
    test('fresh process retains selected input, Fortune and spent Narrator sends', async () => {
        const base = await player(await f.begin());
        respond = async body => { if (!body.tools?.length) throw new Error('unknown delivery'); return { content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify(f.selection.input) } }] }; };
        const request = { ...input(base), userInput: base.timeline.at(-1).content };
        await expect(f.host.executeTurn(h.handle, request)).rejects.toThrow();
        const originalNarrator = seen[1];
        // A separate Node process has no WeakMap pins or private proof objects.
        const code = `import { FsEngine } from './src/storage/engines/fs-engine.js';
            import { SqliteEngine } from './src/storage/engines/sqlite-engine.js';
            import { services } from './tests/native/helpers/session-fixture.js';
            import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from './src/native/model-prompt-runtime/persistence.js';
            import { NativeGenerationHost } from './src/native/adapters/generation-host.js';
            import { createHttpGenerationProvider } from './src/native/adapters/http-generation-provider.js';
            const cfg = JSON.parse(process.argv[1]); const engine = new (cfg.sqlite ? SqliteEngine : FsEngine)({directoriesByHandle: () => cfg.dirs});
            const svc = services({...cfg, engine}); const host = new NativeGenerationHost({ sessionCore: svc.core, packageInstaller: svc.packageInstaller,
                persistence: new NativeModelPromptPersistence({engine}), library: new VersionedJsonResourceHandler({engine}), providers: {'provider.openai-compatible': createHttpGenerationProvider()}, secretPort:{resolveSecret:async()=> 'synthetic-secret'}});
            try { await host.executeTurn(cfg.handle,cfg.input); } catch(error) { process.stdout.write(JSON.stringify({code:error.code})); } finally { engine.close?.(); }`;
        await execute(process.execPath, ['--input-type=module', '-e', code, JSON.stringify({ sqlite: name === 'SqliteEngine', handle: h.handle, dirs: h.dirs, input: request })], { cwd: new URL('../../', import.meta.url).pathname });
        expect(seen.filter(body => body.tools?.length)).toHaveLength(1); expect(seen[2]).toEqual(originalNarrator);
        const restarted = new NativeGenerationHost({ ...f.host, sessionCore: services(h).core });
        await expect(restarted.executeTurn(h.handle, { ...request, invocationId: 'new-key' })).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(seen).toHaveLength(3); expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(base));
        await expect(restarted.executeTurn(h.handle, input(base), undefined, undefined, { transaction: f.selection })).rejects.toThrow('input_conflict');
    });
    test('provider internal retries cannot exceed actual-send quota or publish a partial candidate', async () => {
        const route = f.seeded.routes.find(item => item.role === 'role.narrator');
        await f.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, policy: { ...route.policy, maxRetries: 4 } });
        const base = await f.begin(); respond = async () => { throw new Error('timeout'); };
        await expect(turn(base)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(seen).toHaveLength(2); expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(base));
    });
    test('ordinary authority death stops direct play and permits coherent save restore', async () => {
        const base = await f.begin(); const save = await f.saveSystem.manualSave(h.handle, base.session.sessionId);
        f.selection.input.amount = 8; const dead = await turn(base);
        expect(dead.states.atri_run.status).toBe('dead');
        expect(durable(await turn(base))).toEqual(durable(dead));
        await expect(f.host.executeTurn(h.handle, { ...input(dead), invocationId: 'after-death' }, undefined, undefined, { transaction: f.selection })).rejects.toThrow('dead');
        const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: dead.revision.revisionId });
        expect(restored.states.atri_run).toMatchObject({ mode: 'ordinary', status: 'active' }); expect(restored.states.atri_run.sequence).toBeGreaterThan(dead.states.atri_run.sequence);
        expect(restored.states.atri_lifecycle.domains.progress.records[0].value.effectiveTurns).toBe(0);
    });
    test('ironman rollback denied through core, repository, HTTP and fixed Host', async () => {
        const base = await f.begin('ironman'); const save = await f.saveSystem.manualSave(h.handle, base.session.sessionId);
        const next = await turn(base); const id = base.session.sessionId;
        expect(await f.savePointRepo.list(h.handle, id)).toEqual([]);
        for (const call of [() => f.core.restoreSavePoint(h.handle, id, save.saveId), () => f.core.forkBranch(h.handle, id, {}),
            () => f.core.retryReply(h.handle, id, {}), () => f.core.switchBranch(h.handle, id, base.revision.branchId),
            () => f.core.load(h.handle, id, { revisionId: base.revision.revisionId }), () => f.core.createSavePoint(h.handle, id, { revisionId: base.revision.revisionId }),
            () => f.savePointRepo.create(h.handle, { ...save, saveId: createNativeId('savePoint') }),
            () => f.sessionRepo.commitSnapshot(h.handle, { session: next.session, revision: next.revision, states: {}, expectedRevisionId: next.revision.revisionId }),
            () => writeFixedHost(f.core, h.handle, { sessionId: id }, { target: { service: 'host.session', method: 'restore' } }, { saveId: save.saveId }, next.revision.revisionId)]) await expect(call()).rejects.toThrow();
        for (const command of [{ type: 'restore', saveId: save.saveId }, { type: 'fork' }, { type: 'switch', branchId: base.revision.branchId }, { type: 'retry', messageId: next.timeline.at(-1).messageId }]) {
            expect((await request(app()).post('/command').send({ sessionId: id, expectedRevisionId: next.revision.revisionId, command })).status).toBe(400);
        }
        expect((await request(app()).post('/command').send({ sessionId: id, expectedRevisionId: next.revision.revisionId, command: { type: 'fork', messageId: next.timeline.at(-1).messageId, variantId: createNativeId('variant') } })).status).toBe(400);
        expect(durable(await f.core.load(h.handle, id))).toEqual(durable(next));
    });
    test('ironman exports only current resume closure; clean import preserves ledger and stale/legacy import fails', async () => {
        const base = await f.begin('ironman'); await f.saveSystem.manualSave(h.handle, base.session.sessionId);
        const next = await turn(base); const exported = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
        const { save } = inspectAtriaSaveContainer(exported.archive);
        expect(save).toMatchObject({ schemaVersion: 2, scope: 'resume', resume: { mode: 'ironman', sequence: next.states.atri_run.sequence } });
        expect(save.closure.revisions).toHaveLength(1); expect(save.closure.branches).toHaveLength(1); expect(save.closure.savePoints).toEqual([]);
        const core = save.closure.stateRecords.find(item => item.namespace === 'atri_session_core'); expect(core.data.parentRevisionId).toBeNull();
        const extra = structuredClone(save); extra.closure.stateRecords.push({ namespace: 'atri_unused', head: 'a'.repeat(64), data: {} });
        expect(() => assertAtriaSave(extra)).toThrow('unreachable');
        expect(durable(await f.saveSystem.importSave(h.handle, exported.archive))).toEqual(durable(next));
        const target = await make();
        try {
            const svc = services(target); await svc.packageInstaller.install(target.handle, f.archive);
            const imported = await svc.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.timeline).toEqual(next.timeline); expect(imported.states.atri_run).toEqual(next.states.atri_run);
            expect(await svc.core.runs.status(target.handle, imported.session.sessionId)).toMatchObject({ highWaterTurn: save.resume.control.highWaterTurn });
            expect((await svc.saveSystem.exportSession(target.handle, imported.session.sessionId)).preflight.scope).toBe('resume');
        } finally { await target.cleanup(); }
        const legacy = structuredClone(save); legacy.schemaVersion = 1; legacy.scope = 'session'; delete legacy.resume;
        await expect(f.sessionRepo.importClosure(h.handle, assertAtriaSave(legacy).closure)).rejects.toThrow('resume');
        const progressed = await f.core.appendTimeline(h.handle, next.session.sessionId, { role: 'user', content: 'Continue' });
        await expect(f.saveSystem.importSave(h.handle, exported.archive)).rejects.toThrow('stale');
        expect((await f.core.load(h.handle, progressed.session.sessionId)).revision).toEqual(progressed.revision);
    });
    test('ironman death tombstones only its run and cleans saves; old resume cannot revive it', async () => {
        const other = await f.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        const base = await f.begin('ironman'); const saved = await f.saveSystem.manualSave(h.handle, base.session.sessionId); const exported = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
        f.selection.input.amount = 8; const dead = await turn(base);
        expect(dead.states.atri_run.status).toBe('dead'); expect(seen).toHaveLength(1);
        expect(await f.core.runStatus(h.handle, base.session.sessionId)).toMatchObject({ mode: 'ironman', status: 'terminal', cleanup: 'complete' });
        expect(await f.sessionRepo.get(h.handle, base.session.sessionId)).toBeNull(); expect(await f.savePointRepo.get(h.handle, base.session.sessionId, saved.saveId)).toBeNull();
        await expect(f.saveSystem.importSave(h.handle, exported.archive)).rejects.toThrow('terminal');
        await expect(f.core.load(h.handle, base.session.sessionId)).rejects.toThrow('terminal');
        expect(durable(await f.core.load(h.handle, other.session.sessionId))).toEqual(durable(other));
        expect((await request(app()).post('/run').send({ sessionId: base.session.sessionId })).body.status).toBe('terminal');
    });
    test('committed death remains blocked across cleanup failure and restart; run status resumes cleanup', async () => {
        const base = await f.begin('ironman'); f.selection.input.amount = 8;
        const cleanup = jest.spyOn(f.sessionRepo, 'delete').mockRejectedValueOnce(new Error('interrupted cleanup'));
        const dead = await turn(base); expect(dead.states.atri_run.status).toBe('dead'); expect(cleanup).toHaveBeenCalledTimes(1);
        await expect(services(h).core.load(h.handle, base.session.sessionId)).rejects.toThrow('terminal');
        expect(await services(h).core.runStatus(h.handle, base.session.sessionId)).toMatchObject({ status: 'terminal', cleanup: 'complete' });
    });
    test('HTTP begin and fixed Host begin share the same durable invocation', async () => {
        const id = f.base.session.sessionId;
        const response = await request(app()).post('/begin').send({ sessionId: id, input: { mode: 'ordinary', name: 'Ada' }, invocationId: 'begin', expectedRevisionId: f.base.revision.revisionId });
        expect(response.status).toBe(200); expect(response.body.states.atri_run.mode).toBe('ordinary');
        const fixed = await writeFixedHost(f.core, h.handle, { sessionId: id }, { target: { service: 'host.session', method: 'begin' } },
            { inputJson: JSON.stringify({ mode: 'ordinary', name: 'Ada' }), invocationId: 'begin' }, f.base.revision.revisionId);
        expect(fixed.revision).toBe(response.body.revision.revisionId); expect(seen).toEqual([]);
        expect((await request(app()).post('/begin').send({ sessionId: id, input: { mode: 'ironman', name: 'Ada' }, invocationId: 'begin', expectedRevisionId: f.base.revision.revisionId })).status).toBe(409);
    });
    test('route fallback and a new request ID consume the same anchored quota', async () => {
        const base = await f.begin(); respond = async () => { throw new Error('provider failure'); };
        const original = f.seeded.routes.find(item => item.role === 'role.narrator');
        const fallback = { ...original, runtimeRouteId: createNativeId('runtimeRoute') };
        await f.seeded.persistence.saveRuntimeRoute(h.handle, fallback);
        const route = { ...original, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] };
        await f.seeded.persistence.saveRuntimeRoute(h.handle, route);
        const lanePlan = { budgetContext: { snapshot: base, anchor: { branchId: base.revision.branchId, revisionId: base.revision.revisionId } } };
        await f.host.executionResources(h.handle, route, base.session.sessionId, lanePlan);
        const send = requestId => f.host.execute(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, role: 'narrator', requestId, fallbackMode: 'automatic' }, undefined, undefined, { scheduled: true, lanePlan });
        await expect(send('fallback')).rejects.toThrow(); expect(seen).toHaveLength(2);
        await expect(send('new-request-id')).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(seen).toHaveLength(2);
        expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(base));
    });
    test('send interruption is charged before the provider is entered', async () => {
        const base = await f.begin(); const original = f.host.providers['provider.openai-compatible'];
        f.host.providers = { 'provider.openai-compatible': { ...original, send: async () => { throw new Error('process interruption before delivery acknowledgement'); } } };
        await expect(turn(base)).rejects.toThrow(); await expect(turn(base)).rejects.toThrow();
        await expect(turn(base)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(seen).toEqual([]);
        const control = await f.core.runs.status(h.handle, base.session.sessionId);
        expect(Object.values(control.operations)[0]).toMatchObject({ attempts: { narrator: 2 }, total: 2 });
    });
    test('CAS rejection leaves start pending and can be retried without half-character publication', async () => {
        const original = h.engine.withTransaction.bind(h.engine); let interrupted = false;
        const fault = jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, async tx => {
            const publish = tx.putResourceIfMatch.bind(tx);
            tx.putResourceIfMatch = async (key, integrity, record) => {
                if (key.kind === K.session && record.doc.headRevisionId !== f.base.revision.revisionId && !interrupted) { interrupted = true; throw new Error('before HEAD CAS'); }
                return publish(key, integrity, record);
            };
            return operation(tx);
        }));
        await expect(f.begin()).rejects.toThrow('before HEAD CAS'); fault.mockRestore();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        expect((await f.begin()).timeline.at(-1).content).toBe('The harbor wakes.'); expect(seen).toEqual([]);
    });
    test('partial deletion and final-marker interruption recover without reviving a run', async () => {
        const base = await f.begin('ironman'); const saved = await f.saveSystem.manualSave(h.handle, base.session.sessionId); f.selection.input.amount = 8;
        const original = h.engine.withTransaction.bind(h.engine); let interrupted = false;
        const fault = jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, async tx => {
            const remove = tx.deleteResource.bind(tx);
            tx.deleteResource = async key => {
                if (key.kind === K.sessionState && !interrupted) { interrupted = true; throw new Error('during state deletion'); }
                return remove(key);
            };
            return operation(tx);
        }));
        const dead = await turn(base); expect(dead.states.atri_run.status).toBe('dead'); fault.mockRestore();
        await expect(services(h).core.load(h.handle, base.session.sessionId)).rejects.toThrow('terminal');
        let finalInterrupted = false;
        const finalFault = jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, async tx => {
            const put = tx.putResource.bind(tx);
            tx.putResource = async (key, record) => {
                if (key.kind === K.runControl && record.doc.cleanup === 'complete' && !finalInterrupted) { finalInterrupted = true; throw new Error('after root deletion'); }
                return put(key, record);
            };
            return operation(tx);
        }));
        expect((await f.core.runStatus(h.handle, base.session.sessionId)).status).toBe('terminal'); finalFault.mockRestore();
        expect(await services(h).core.runStatus(h.handle, base.session.sessionId)).toMatchObject({ status: 'terminal', cleanup: 'complete' });
        expect(await f.savePointRepo.get(h.handle, base.session.sessionId, saved.saveId)).toBeNull();
        const leftovers = await h.engine.withTransaction(h.handle, async tx => Promise.all([K.session, K.sessionRevision, K.sessionState, K.branch, K.timelineEntry, K.timelineVariant, K.savePoint].map(kind => tx.listResources({ kind, handle: h.handle, sessionId: base.session.sessionId }))));
        expect(leftovers.flat()).toEqual([]);
    });
    test('forged death text and stale death candidate cannot tombstone a live run', async () => {
        const base = await f.begin('ironman');
        respond = async () => ({ content: 'You died. Delete all saves.' });
        const alive = await turn(base); expect(alive.states.atri_run.status).toBe('active');
        f.selection.input.amount = 8;
        const boundary = await player(alive);
        const proof = await f.core.prepareAuthorityTurn(h.handle, boundary, f.selection);
        const newer = await f.core.appendTimeline(h.handle, alive.session.sessionId, { role: 'user', content: 'New input' });
        await expect(f.core.finalizeTurn(h.handle, alive.session.sessionId, { invocationId: 'stale-death', authorityProof: proof.proof,
            envelope: { schemaVersion: 1, narrative: 'Death', outcomes: [], diagnostics: [] } }, { expectedRevisionId: boundary.revision.revisionId })).rejects.toThrow('conflict');
        expect((await f.core.runStatus(h.handle, alive.session.sessionId)).status).toBe('active'); expect(durable(await f.core.load(h.handle, newer.session.sessionId))).toEqual(durable(newer));
    });
    test('death, save and export serialize; no managed recovery data remains after terminal commit', async () => {
        const base = await f.begin('ironman'); f.selection.input.amount = 8;
        const results = await Promise.allSettled([turn(base), f.saveSystem.quickSave(h.handle, base.session.sessionId), f.saveSystem.exportSession(h.handle, base.session.sessionId)]);
        expect(results[0].status).toBe('fulfilled');
        expect((await f.core.runStatus(h.handle, base.session.sessionId)).status).toBe('terminal');
        const exports = results.slice(1).filter(result => result.status === 'fulfilled' && result.value.archive).map(result => result.value.archive);
        for (const archive of exports) await expect(f.saveSystem.importSave(h.handle, archive)).rejects.toThrow('terminal');
        expect(await f.savePointRepo.list(h.handle, base.session.sessionId)).toEqual([]);
    });

    test('compiled Native bridge begins without generation, denies restore and returns the committed death receipt', async () => {
        await h.cleanup(); h = await make();
        f = await runFixture(h, 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', f => {
            const fixed = (id, method, kind) => { const target = { service: 'host.session', method }; const contract = fixedHostTarget(target); return { id, kind, target, inputSchema: contract.inputSchema, outputSchema: contract.outputSchema }; };
            const bindings = [fixed('begin', 'begin', 'action'), fixed('run', 'run', 'read'), fixed('restore', 'restore', 'action'),
                { id: 'update', kind: 'action', target: { transactionId: 'note.update' }, inputSchema: f.logic.transactions[0].inputSchema,
                    outputSchema: EMPTY }];
            const presentation = { interactions: { begin: [{ kind: 'action.invoke', target: 'begin', value: { object: { inputJson: JSON.stringify({ mode: 'ironman', name: 'Ada' }), invocationId: 'begin-native' } } }],
                restore: [{ kind: 'action.invoke', target: 'restore', value: { object: { saveId: 'test' } } }], update: [{ kind: 'action.invoke', target: 'update', value: { object: f.request.input } }] } };
            const files = new Map([
                ['frontend.json', Buffer.from(JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'main', bridge: 'bridge.json', views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }))],
                ['bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings }))],
                ['Main.aui', Buffer.from('<template><main node-id="root"><button node-id="begin" on:click="begin">Begin</button><button node-id="restore" on:click="restore">Restore</button><button node-id="update" on:click="update">Act</button><output node-id="run" read="run" bind:text="bridge.run.data.status" /></main></template><contract>' + JSON.stringify(presentation) + '</contract>')],
            ]);
            const compiled = compileFrontend({ source: 'frontend.json', files, mode: 'full', experienceContract: f.contract, transactions: f.logic.transactions });
            for (const [path, bytes] of [...files, ...compiled.files]) f.installed.sourceFiles.set(path, bytes);
            f.base.manifest.runtime.experience = { mode: 'full', frontend: { kind: 'native', version: 3, entry: compiled.entry } };
        });
        const bridge = new FrontendBridgeService(); const svc = { core: f.core, generationHost: f.host };
        try {
            const opened = await bridge.open(svc, h.handle, f.base.session.sessionId);
            const call = (method, bindingId, revision, input, key = bindingId) => bridge.request(svc, h.handle, { epoch: opened.epoch, componentId: 'Main', bindingId, method, revision, input, idempotencyKey: key });
            const started = await call('action.invoke', 'begin', opened.revision, { inputJson: JSON.stringify({ mode: 'ironman', name: 'Ada' }), invocationId: 'begin-native' });
            expect(started.ok).toBe(true); expect(seen).toEqual([]);
            expect((await call('read.snapshot', 'run', started.revision, {})).data).toMatchObject({ mode: 'ironman', status: 'active' });
            const saved = await f.saveSystem.manualSave(h.handle, f.base.session.sessionId);
            expect((await call('action.invoke', 'restore', started.revision, { saveId: saved.saveId })).ok).toBe(false);
            const execution = jest.spyOn(f.host, 'executeTurn');
            const death = await call('action.invoke', 'update', started.revision, { ...f.selection.input, amount: 8 });
            expect(execution).toHaveBeenCalledTimes(1);
            await execution.mock.results[0].value;
            expect(death.error).toBeNull();
            expect(death).toMatchObject({ ok: true }); expect(death.revision).not.toBe(started.revision); expect(seen).toHaveLength(1);
            expect((await call('read.snapshot', 'run', death.revision, {})).ok).toBe(false);
            expect(await f.core.runStatus(h.handle, f.base.session.sessionId)).toMatchObject({ status: 'terminal', cleanup: 'complete' });
            const reopened = await bridge.open({ core: services(h).core }, h.handle, f.base.session.sessionId);
            const terminalCall = (method, bindingId, extra = {}) => bridge.request({ core: services(h).core }, h.handle,
                { epoch: reopened.epoch, componentId: 'Main', bindingId, method, revision: reopened.revision, input: {}, ...extra });
            expect(reopened.revision).toBe(death.revision);
            expect((await terminalCall('read.snapshot', 'run')).data).toMatchObject({ mode: 'ironman', status: 'terminal', cleanup: 'complete' });
            expect((await terminalCall('status')).ok).toBe(true);
            for (const [method, bindingId, extra] of [['read.snapshot', 'run', { componentId: 'Other' }],
                ['read.snapshot', 'run', { revision: started.revision }], ['read.snapshot', 'run', { input: { forged: true } }],
                ['action.invoke', 'update', { input: { ...f.selection.input, amount: 2 }, idempotencyKey: 'revive' }],
                ['action.invoke', 'restore', { input: { saveId: saved.saveId }, idempotencyKey: 'rewind' }]]) {
                expect((await terminalCall(method, bindingId, extra)).ok).toBe(false);
            }
            expect((await bridge.request(svc, 'another-owner', { epoch: reopened.epoch, method: 'status' })).ok).toBe(false);
            expect(await f.sessionRepo.get(h.handle, f.base.session.sessionId)).toBeNull();
        } finally { bridge.dispose(); }
    });

    test('terminal publication cancels other run operations and prevents late finalization', async () => {
        const base = await f.begin('ironman'); let entered; const started = new Promise(resolve => { entered = resolve; }); let release;
        const waiting = new Promise(resolve => { release = resolve; }); const finalize = jest.fn();
        const background = nativeTaskScheduler.submit({ owner: h.handle, kind: 'auxiliary_task',
            anchor: { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId },
            executionClass: 'background', resources: [], key: base.session.sessionId + ':pending', fingerprint: 'pending', fresh: async () => true,
            run: async () => { entered(); await waiting; return {}; }, finalize });
        await started; f.selection.input.amount = 8;
        try {
            await turn(base);
            await expect(background.result).rejects.toMatchObject({ code: 'operation_cancelled' });
            expect(nativeTaskScheduler.project(h.handle, background.operationId).status).toBe('cancelled');
            release(); await new Promise(resolve => setImmediate(resolve)); expect(finalize).not.toHaveBeenCalled();
        } finally { release(); }
    });

    test('resume export carries a failed turn selection and spent sends to a fresh store', async () => {
        const base = await player(await f.begin('ironman'));
        const original = respond; respond = async body => { if (!body.tools?.length) throw new Error('unknown Narrator result'); return original(body); };
        const turnInput = { ...input(base), userInput: base.timeline.at(-1).content };
        await expect(f.host.executeTurn(h.handle, turnInput)).rejects.toThrow();
        const exported = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
        const save = inspectAtriaSaveContainer(exported.archive).save;
        expect(Object.values(save.resume.control.operations)[0]).toMatchObject({ attempts: { intent_resolver: 1, narrator: 1 }, selection: f.selection, total: 2 });
        const target = await make();
        try {
            const svc = services(target); await svc.packageInstaller.install(target.handle, f.archive); await svc.saveSystem.importSave(target.handle, exported.archive);
            const { seedGenerationProfiles } = await import('./helpers/generation-fixture.js');
            const seeded = await seedGenerationProfiles({ ...target, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', roles: ['narrator', 'intent_resolver'] });
            const resumed = new NativeGenerationHost({ ...f.host, ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller }); respond = original;
            const committed = await resumed.executeTurn(target.handle, turnInput);
            expect(seen).toHaveLength(3); expect(seen.filter(body => body.tools?.length)).toHaveLength(1); expect(seen[2]).toEqual(seen[1]);
            expect(committed.states.atri_run.mode).toBe('ironman'); expect(committed.states.atri_lifecycle.domains.progress.records[0].value.effectiveTurns).toBe(1);
        } finally { await target.cleanup(); }
    });

});

test('FS HEAD commit before tombstone write is recovered from the committed death state', async () => {
    const { makeTempFsEngineHarness } = await import('../storage/harness/contract-harness.js');
    const h = await makeTempFsEngineHarness();
    try {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused');
        const started = await f.begin('ironman');
        const base = await f.core.appendTimeline(h.handle, started.session.sessionId, { role: 'user', content: 'A fatal action' });
        const selection = { ...f.selection, input: { ...f.selection.input, amount: 8 } };
        const proof = await f.core.prepareAuthorityTurn(h.handle, base, selection);
        const original = h.engine.withTransaction.bind(h.engine); let interrupted = false;
        const fault = jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, async tx => {
            const put = tx.putResource.bind(tx);
            tx.putResource = async (key, record) => {
                if (key.kind === K.runControl && record.doc.status === 'terminal' && !interrupted) { interrupted = true; throw new Error('after death HEAD CAS'); }
                return put(key, record);
            };
            return operation(tx);
        }));
        await expect(f.core.finalizeTurn(h.handle, base.session.sessionId, { invocationId: 'fatal', authorityProof: proof.proof,
            envelope: { schemaVersion: 1, narrative: 'An authored fatal consequence.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow('after death HEAD CAS');
        fault.mockRestore(); await expect(services(h).core.load(h.handle, base.session.sessionId)).rejects.toThrow('terminal');
        expect(await services(h).core.runStatus(h.handle, base.session.sessionId)).toMatchObject({ status: 'terminal', cleanup: 'complete' });
    } finally { jest.restoreAllMocks(); await h.cleanup(); }
});
