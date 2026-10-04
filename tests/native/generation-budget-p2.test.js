import { jest } from '@jest/globals';
import http from 'node:http';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { simulationTaskFixture } from './helpers/simulation-task-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';

describe.each(CONTRACT_HARNESSES)('P2 actual background send budget - $name', ({ make }) => {
    let h, svc, f, base, seeded, host, server, seen, respond, serial;
    beforeEach(async () => {
        h = await make(); svc = services(h); f = simulationTaskFixture(); serial = 0; seen = [];
        server = http.createServer(async (req, res) => {
            const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
            try { const message = await respond(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] })); }
            catch { res.writeHead(503); res.end('{}'); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        respond = async () => { throw new Error('unknown result'); };
        f.contract.capabilities.push({ id: 'generation-budget', version: 1, required: true });
        f.contract.simulationRuntime.jobs.find(job => job.id === 'archive.choose').due = { formula: 'clock.tick' };
        const counter = closed({ effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } });
        f.contract.lifecycleRuntime.domains.push({ ...structuredClone(f.contract.lifecycleRuntime.domains[1]), id: 'progress', recordSchema: counter, initial: { effectiveTurns: 0 },
            commands: [{ id: 'advance', argsSchema: counter, event: 'progress.changed', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }] });
        f.contract.generationBudget = { schemaVersion: 1, resolverAttempts: 2, narratorAttempts: 2, turnAttempts: 4, backgroundAttempts: 2,
            backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 3, turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } };
        const variant = f.contract.taskRuntime.tasks[0].variants[0];
        f.base.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Agenda', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Agenda', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
        const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, archive);
        base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        await command({ kind: 'experience.ready' });
        for (const domainId of ['notes', 'other']) await command({ kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text: 'seed' } });
        await progress(4);
        seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions' });
        host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 4320 });
    });
    afterEach(async () => { jest.restoreAllMocks(); if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); await h?.cleanup(); });
    async function command(action) { base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'cmd-' + ++serial, action }, { expectedRevisionId: base.revision.revisionId }); }
    const progress = effectiveTurns => command({ kind: 'app.command', domainId: 'progress', commandId: 'advance', recordId: 'main', args: { effectiveTurns } });
    const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
    test('queued batch retries spend two sends; reopen and ordinary restore do not refund', async () => {
        const saved = await svc.saveSystem.manualSave(h.handle, base.session.sessionId);
        const before = base;
        await expect(host.executeLifecycle(h.handle, input())).rejects.toThrow(); expect(seen).toHaveLength(2);
        expect((await svc.core.load(h.handle, base.session.sessionId)).revision).toEqual(before.revision);
        const reopened = new NativeGenerationHost({ ...host, sessionCore: services(h).core });
        await expect(reopened.executeLifecycle(h.handle, input())).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(seen).toHaveLength(2);
        base = await svc.core.restoreSavePoint(h.handle, base.session.sessionId, saved.saveId, { expectedRevisionId: base.revision.revisionId });
        await expect(reopened.executeLifecycle(h.handle, input())).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(seen).toHaveLength(2);
        expect((await svc.core.runs.status(h.handle, base.session.sessionId)).highWaterTurn).toBe(4);
    });
    test('pending attempts survive unrelated HEAD publication; forged Task invocations cannot create another batch', async () => {
        const route = seeded.routes[0]; await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, policy: { ...route.policy, maxRetries: 0 } });
        const intent = base.states.atri_lifecycle.outbox[0];
        // Scheduled Task has one scheduler retry, independently charged by the provider boundary.
        await expect(host.executeLifecycle(h.handle, input())).rejects.toThrow(); expect(seen).toHaveLength(2);
        await command({ kind: 'app.command', domainId: 'other', commandId: 'save', recordId: 'main', args: { text: 'unrelated change' } });
        const taskInput = { ...input(), taskId: intent.taskId, variantId: intent.variantId, input: intent.input, invocationId: intent.invocationId };
        await expect(host.executeTask(h.handle, taskInput, undefined, undefined, { lifecycleInvocation: true })).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        await expect(host.executeTask(h.handle, { ...taskInput, invocationId: 'new-key' })).rejects.toThrow('lifecycle_intent');
        expect(seen).toHaveLength(2);
    });
    test('not-due window and stale inputs stop before send; previews/preflight spend no quota', async () => {
        await progress(0);
        await expect(host.executeLifecycle(h.handle, input())).rejects.toMatchObject({ code: 'native_generation_background_not_due' }); expect(seen).toEqual([]);
        await command({ kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'changed' } });
        const cancelled = await host.executeLifecycle(h.handle, input()); base = cancelled.snapshot;
        expect(cancelled.results).toEqual([]); expect(seen).toEqual([]);
        await host.execute(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, role: 'narrator', requestId: 'preview' }, undefined, undefined, { preview: true });
        await expect(host.execute(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, role: 'narrator', requestId: 'unbound-send' })).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        await host.prepareLifecycle(h.handle, input()); expect(seen).toEqual([]);
        expect(Object.values((await svc.core.runs.status(h.handle, base.session.sessionId))?.operations ?? {}).reduce((sum, op) => sum + op.total, 0)).toBe(0);
    });
    test('two attempts may produce one bounded proposal; no extra foreground turn or repeated Task publication', async () => {
        let failed = false; respond = async () => { if (!failed) { failed = true; throw new Error('retry once'); } return { content: JSON.stringify({ text: 'filed' }) }; };
        const timeline = base.timeline; const result = await host.executeLifecycle(h.handle, input()); base = result.snapshot;
        expect(seen).toHaveLength(2); expect(base.timeline).toEqual(timeline); expect(base.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('resolved');
        expect((await host.executeLifecycle(h.handle, input())).results).toEqual([]); expect(seen).toHaveLength(2);
        expect((await svc.core.runs.status(h.handle, base.session.sessionId)).background['1'].count).toBe(2);
    });
    test('separate four-turn windows share the period cap; restoring a save cannot recreate the old allowance', async () => {
        const saved = await svc.saveSystem.manualSave(h.handle, base.session.sessionId);
        let fail = true; respond = async () => { if (fail) { fail = false; throw new Error('retry'); } return { content: JSON.stringify({ text: 'filed' }) }; };
        base = (await host.executeLifecycle(h.handle, input())).snapshot; expect(seen).toHaveLength(2);
        await progress(8);
        await command({ kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'advanced' } });
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 });
        respond = async () => { throw new Error('second window unknown send'); };
        await expect(host.executeLifecycle(h.handle, input())).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(seen).toHaveLength(3);
        const control = await svc.core.runs.status(h.handle, base.session.sessionId); expect(control.highWaterTurn).toBe(8);
        expect(Object.values(control.background).reduce((total, entry) => total + entry.count, 0)).toBe(3);
        base = await svc.core.restoreSavePoint(h.handle, base.session.sessionId, saved.saveId, { expectedRevisionId: base.revision.revisionId });
        await expect(host.executeLifecycle(h.handle, input())).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(seen).toHaveLength(3);
    });

});
