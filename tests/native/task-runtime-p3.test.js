import { jest } from '@jest/globals';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { assertTaskRuntime, assertTaskValue } from '../../public/shared/native-task-contract.js';
import { assertTurnEnvelope } from '../../public/shared/native-message-contract.js';
import { createNativeId, buildAtriaPackageContainer } from '../../src/native/index.js';
import { makeTempFsEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import http from 'node:http';
import { lowerDeclarativeMutations } from '../../public/scripts/native/experience/logic/mutations.js';

const schema = { type: 'object', additionalProperties: false, properties: {}, required: [] };
function contract() {
    return { schemaVersion: 1, slots: [{ id: 'structured', requiredCapabilities: [] }], tasks: [{ id: 'quest.evaluate', bindingSlotId: 'structured',
        executionClass: 'interactive', inputSchema: schema, context: ['input'], resultPolicy: { resultClass: 'advisory', sink: 'proposal' },
        variants: [{ id: 'default', prompt: { resourceId: createNativeId('promptProgram'), revision: 'r1' },
            generation: { resourceId: createNativeId('generationProfile'), revision: 'r1' }, outputSchema: schema, requiredCapabilities: [] }] }] };
}
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function job(overrides = {}) {
    return { owner: 'alice', key: 'job', fingerprint: 'same', anchor: { revisionId: 'one' }, executionClass: 'interactive', resources: ['model'],
        fresh: async () => true, run: async () => 'result', finalize: async value => value, ...overrides };
}

describe('P3 strict Task and Turn contracts', () => {
    test('Variants share semantic authority and binding; remain immutable', () => {
        const raw = contract(); raw.tasks[0].variants.push({ ...raw.tasks[0].variants[0], id: 'compact' });
        const value = assertTaskRuntime(raw);
        expect(Object.isFrozen(value.tasks[0].variants)).toBe(true);
        raw.tasks[0].resultPolicy.sink = 'world';
        expect(value.tasks[0].resultPolicy.sink).toBe('proposal');
    });
    test.each(['endpoint', 'secret', 'role', 'patch', 'priority'])('rejects package execution/authority field %s', key => {
        const raw = contract(); raw.tasks[0][key] = 'unsafe';
        expect(() => assertTaskRuntime(raw)).toThrow();
    });
    test('rejects unknown slot, resource, schema and sink elevation', () => {
        const raw = contract(); raw.tasks[0].bindingSlotId = 'absent';
        expect(() => assertTaskRuntime(raw)).toThrow();
        raw.tasks[0].bindingSlotId = 'structured'; raw.tasks[0].variants[0].prompt.revision = '';
        expect(() => assertTaskRuntime(raw)).toThrow();
        expect(() => assertTaskValue({ patch: [] }, schema)).toThrow();
    });
    test('outcomes are semantic proposals only and preserve canonical narrative equality', () => {
        const envelope = { schemaVersion: 1, narrative: 'Draft', outcomes: [{ requestId: 'outcome', interpretation: { decision: 'no_change', confidence: 1 } }], diagnostics: [] };
        expect(assertTurnEnvelope(envelope).outcomes[0].interpretation.decision).toBe('no_change');
        expect(() => assertTurnEnvelope({ ...envelope, outcomes: [{ patch: {} }] })).toThrow();
        envelope.outcomes[0].interpretation.hp = 10;
        expect(() => assertTurnEnvelope(envelope)).toThrow();
    });
});

describe('P3 Host scheduler', () => {
    test('coalesces exact requests, enforces queue cap and shared resource cap', async () => {
        const scheduler = new NativeTaskScheduler({ concurrency: 2, perResource: 1, queueLimit: 1 });
        const gate = deferred(); let active = 0; let maximum = 0;
        const run = async () => { maximum = Math.max(maximum, ++active); await gate.promise; active--; return 'ok'; };
        const first = scheduler.submit(job({ run }));
        expect(scheduler.submit(job({ run }))).toBe(first);
        const second = scheduler.submit(job({ key: 'second', run }));
        expect(() => scheduler.submit(job({ key: 'third', run }))).toThrow('backpressure');
        gate.resolve(); await Promise.all([first.result, second.result]); expect(maximum).toBe(1);
    });
    test('cancel suppresses late chunks/finalize and retains permit for ignoring worker', async () => {
        const scheduler = new NativeTaskScheduler({ concurrency: 1 }); const gate = deferred();
        const finalize = jest.fn(); const onChunk = jest.fn();
        const first = scheduler.submit(job({ run: async ({ onChunk }) => { await gate.promise; onChunk({ text: 'late' }); return 1; }, finalize, onChunk }));
        await tick(); expect(scheduler.cancel('alice', first.operationId)).toBe(true);
        await expect(first.result).rejects.toThrow('cancelled');
        const second = scheduler.submit(job({ key: 'second' }));
        expect(scheduler.project('alice', second.operationId).status).toBe('queued');
        expect(() => scheduler.project('bob', first.operationId)).toThrow('not_found');
        gate.resolve(); await second.result; expect(finalize).not.toHaveBeenCalled(); expect(onChunk).not.toHaveBeenCalled();
    });
    test('stale completion cannot enter authority; retry resets provisional stream', async () => {
        const scheduler = new NativeTaskScheduler({ backoffMs: 1 }); let calls = 0; const onChunk = jest.fn();
        const work = scheduler.submit(job({ onChunk, run: async ({ onChunk }) => {
            onChunk({ text: 'draft' }); if (!calls++) throw Object.assign(new Error(), { code: 'generation_provider_failed' }); return 'ok';
        } }));
        expect(await work.result).toBe('ok'); expect(calls).toBe(2);
        expect(onChunk.mock.calls.some(([item]) => item.reset)).toBe(true);
        expect(scheduler.project('alice', work.operationId).deliveryReceipt.kind).toBe('model_delivery');
        const finalize = jest.fn(); let fresh = true;
        const stale = scheduler.submit(job({ key: 'stale', fresh: async () => fresh, run: async () => { fresh = false; }, finalize }));
        await expect(stale.result).rejects.toThrow('stale'); expect(finalize).not.toHaveBeenCalled();
    });
    test('finalizing refuses cancel and only reports committed completion', async () => {
        const scheduler = new NativeTaskScheduler(); const gate = deferred();
        const work = scheduler.submit(job({ finalize: () => gate.promise })); await tick();
        expect(scheduler.project('alice', work.operationId).status).toBe('finalizing');
        expect(scheduler.cancel('alice', work.operationId)).toBe(false);
        gate.resolve('committed'); expect(await work.result).toBe('committed');
    });
    test('interactive work bypasses queued background work and latest supersedes safely', async () => {
        const scheduler = new NativeTaskScheduler({ concurrency: 1 }); const gate = deferred(); const order = [];
        const first = scheduler.submit(job({ key: 'first', run: () => gate.promise }));
        const background = scheduler.submit(job({ key: 'background', executionClass: 'background', run: async () => order.push('background') }));
        const interactive = scheduler.submit(job({ key: 'interactive', run: async () => order.push('interactive') }));
        const obsolete = scheduler.submit(job({ key: 'latest', fingerprint: 'old' }));
        const latest = scheduler.submit(job({ key: 'latest', fingerprint: 'new', supersede: true }));
        await expect(obsolete.result).rejects.toThrow('stale');
        gate.resolve(); await Promise.all([first.result, background.result, interactive.result, latest.result]);
        expect(order).toEqual(['interactive', 'background']);
    });
    test('timeout cancels an ignored provider without freeing its execution permit early', async () => {
        const scheduler = new NativeTaskScheduler({ concurrency: 1, timeoutMs: 10 }); const gate = deferred();
        const work = scheduler.submit(job({ run: () => gate.promise }));
        await expect(work.result).rejects.toThrow('cancelled');
        expect(scheduler.running.size).toBe(1); gate.resolve(); await tick(); expect(scheduler.running.size).toBe(0);
    });
});

describe.each(CONTRACT_HARNESSES)('P3 Session authority - $name', ({ make }) => {
    let h, f, base;
    beforeEach(async () => {
        h = await make(); f = { ...sessionFixture(), ...services(h) };
        const taskRuntime = contract();
        taskRuntime.tasks[0].resultPolicy = { resultClass: 'world_outcome_proposal', sink: 'proposal' };
        taskRuntime.tasks[0].interpretation = { id: 'outcome', instruction: 'Semantic classification only', allowedEventTypes: ['healed'], confidenceThreshold: 0.7 };
        taskRuntime.turn = { policy: 'narrative-outcome', stages: [], interpreterTaskId: 'quest.evaluate' };
        const variant = taskRuntime.tasks[0].variants[0];
        taskRuntime.tasks[0].inputSchema = { type: 'object', additionalProperties: false, properties: {
            narrative: { type: 'string', maxLength: 65536 }, stages: { type: 'array', maxItems: 4, items: schema },
        }, required: ['narrative', 'stages'] };
        variant.outputSchema = { type: 'object', additionalProperties: false, properties: {
            decision: { type: 'string', maxLength: 16, enum: ['event', 'no_change'] }, eventType: { type: 'string', maxLength: 128 }, confidence: { type: 'number', minimum: 0, maximum: 1 },
        }, required: ['decision', 'confidence'] };
        taskRuntime.tasks.push({ id: 'prepare', bindingSlotId: 'structured', executionClass: 'turn_blocking', inputSchema: schema,
            context: ['input'], resultPolicy: { resultClass: 'turn_context', sink: 'turn' }, variants: [{ ...variant, outputSchema: schema }] });
        taskRuntime.turn.stages = ['prepare'];
        f.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Task', output: { maxTokens: 128 } } },
        ];
        f.manifest.resources = f.manifest.resources.map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
        f.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], taskRuntime } };
        const logic = { schemaVersion: 2, mutations: [{ id: 'heal', event: 'healed', argsSchema: schema, assign: { hp: { formula: 'world.hp + 1' } } }],
            interpretations: [{ eventType: 'healed', command: 'heal', args: {} }] };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map([['logic.json', Buffer.from(JSON.stringify(logic))]]), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    });
    afterEach(async () => { await h?.cleanup(); });
    const envelope = () => ({ schemaVersion: 1, narrative: 'You recover.', outcomes: [{ requestId: 'outcome', interpretation: { decision: 'event', eventType: 'healed', confidence: 1 } }], diagnostics: [] });
    test('finalizes narrative, deterministic outcome and receipt atomically; replay is immutable', async () => {
        const request = { envelope: envelope(), invocationId: 'turn-one' };
        const next = await f.core.finalizeTurn(h.handle, base.session.sessionId, request, { expectedRevisionId: base.revision.revisionId });
        expect(next.timeline.at(-1).content).toBe('You recover.');
        expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(9);
        expect(next.states.atri_task_results.records[0].storedRevisionId).toBe(next.revision.revisionId);
        expect((await f.core.finalizeTurn(h.handle, base.session.sessionId, request, { expectedRevisionId: base.revision.revisionId })).revision).toEqual(next.revision);
        const fork = await f.core.forkBranch(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(fork.states.atri_task_results).toBeUndefined(); expect(fork.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
    });
    test('invalid outcomes and generic append cannot publish provisional prose', async () => {
        const raw = envelope(); raw.outcomes[0].interpretation.eventType = 'Unknown';
        await expect(f.core.finalizeTurn(h.handle, base.session.sessionId, { envelope: raw, invocationId: 'bad' }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow();
        await expect(f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'assistant', envelope: envelope() })).rejects.toThrow('finalize');
        expect((await f.core.load(h.handle, base.session.sessionId)).revision).toEqual(base.revision);
        await expect(f.core.updateState(h.handle, base.session.sessionId, { atri_task_results: {} })).rejects.toThrow('Reserved');
    });
    test('Proposal is inert until explicit Apply; replay is once-only, stale proposals fail', async () => {
        const payload = envelope().outcomes[0].interpretation;
        const proposal = await f.core.recordTaskResult(h.handle, base.session.sessionId, { taskId: 'quest.evaluate', variantId: 'default', invocationId: 'proposal', payload }, { expectedRevisionId: base.revision.revisionId });
        expect(proposal.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
        const applied = await f.core.resolveTaskProposal(h.handle, base.session.sessionId, { invocationId: 'proposal', decision: 'apply' }, { expectedRevisionId: proposal.revision.revisionId });
        expect(applied.states.atri_world_state.worlds[f.worldId].state.hp).toBe(9);
        const again = await f.core.resolveTaskProposal(h.handle, base.session.sessionId, { invocationId: 'proposal', decision: 'apply' }, { expectedRevisionId: applied.revision.revisionId });
        expect(again.revision).toEqual(applied.revision);
        expect((await f.core.resolveTaskProposal(h.handle, base.session.sessionId, { invocationId: 'proposal', decision: 'apply' }, { expectedRevisionId: proposal.revision.revisionId })).revision).toEqual(applied.revision);
        await expect(f.core.resolveTaskProposal(h.handle, base.session.sessionId, { invocationId: 'proposal', decision: 'apply', payload: { decision: 'no_change', confidence: 1 } }, { expectedRevisionId: applied.revision.revisionId })).rejects.toThrow('conflict');
        const next = await f.core.recordTaskResult(h.handle, base.session.sessionId, { taskId: 'quest.evaluate', variantId: 'default', invocationId: 'stale-proposal', payload }, { expectedRevisionId: applied.revision.revisionId });
        const advanced = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Changed context' });
        await expect(f.core.resolveTaskProposal(h.handle, base.session.sessionId, { invocationId: 'stale-proposal', decision: 'apply' }, { expectedRevisionId: advanced.revision.revisionId })).rejects.toThrow('stale');
        expect(next.states.atri_task_results.records.at(-1).status).toBe('draft');
        const rejected = await f.core.resolveTaskProposal(h.handle, base.session.sessionId, { invocationId: 'stale-proposal', decision: 'reject' }, { expectedRevisionId: advanced.revision.revisionId });
        expect(rejected.states.atri_task_results.records.at(-1).status).toBe('rejected');
    });
    test('actual Turn Host with local HTTP keeps Narrator provisional until semantic finalize', async () => {
        let server; const seen = [];
        try {
            server = http.createServer(async (req, res) => {
                const chunks = []; for await (const chunk of req) chunks.push(chunk);
                const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
                const atSend = await f.core.load(h.handle, base.session.sessionId);
                expect(atSend.revision).toEqual(base.revision);
                const text = body.response_format ? (body.response_format.json_schema.schema.properties.decision ? JSON.stringify(envelope().outcomes[0].interpretation) : '{}') : 'You recover.';
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
            const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
            const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'host-turn',
                slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } };
            const next = await host.executeTurn(h.handle, input);
            expect(seen).toHaveLength(3);
            expect(JSON.stringify(seen[2])).toContain('You recover.');
            expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(9);
            expect(next.states.atri_task_results.records).toHaveLength(1);
            expect((await host.executeTurn(h.handle, input)).revision).toEqual(next.revision);
            expect(seen).toHaveLength(3);
        } finally { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
    });
    test.each(['cancel', 'stale', 'interpreter-failure'])('Turn %s never publishes its provisional narrative', async mode => {
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/v1/chat/completions' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller });
        const controller = new AbortController(); let expected = base;
        host.execute = async () => ({ response: { text: 'Provisional text' }, snapshot: { synthetic: true } });
        host.executeTask = jest.fn(async (_handle, request) => {
            if (request.taskId === 'prepare') return { record: { payload: {} } };
            if (mode === 'cancel') controller.abort();
            if (mode === 'stale') expected = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Concurrent input' });
            if (mode === 'interpreter-failure') throw new Error('invalid interpreter output');
            return { record: { payload: envelope().outcomes[0].interpretation } };
        });
        const pending = host.executeTurn(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'failed-turn',
            slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } }, controller.signal);
        await expect(pending).rejects.toThrow({ cancel: /cancelled/, stale: /stale/, 'interpreter-failure': /invalid interpreter/ }[mode]);
        expect(host.executeTask).toHaveBeenCalledTimes(2);
        const actual = await f.core.load(h.handle, base.session.sessionId);
        expect(actual.revision).toEqual(expected.revision);
        expect(actual.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
        expect(actual.timeline.some(item => item.content === 'Provisional text')).toBe(false);
    });
    test('authority-first resolves typed commands before narration using existing World engine', async () => {
        let server;
        try {
            const manifest = structuredClone(f.manifest);
            manifest.packageVersionId = createNativeId('packageVersion');
            manifest.resources.forEach(item => { item.origin.packageVersionId = manifest.packageVersionId; });
            manifest.runtime.experienceContract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
            const installed = await f.packageInstaller.open(h.handle, f.manifest.packageId, f.manifest.packageVersionId);
            const logic = lowerDeclarativeMutations(JSON.parse(installed.sourceFiles.get('logic.json')));
            logic.commands[0].llm = { expose: true };
            const { archive } = buildAtriaPackageContainer({ manifest, sourceFiles: new Map([['logic.json', Buffer.from(JSON.stringify(logic))]]), assetPayloads: new Map() });
            await f.packageInstaller.install(h.handle, archive);
            const initial = await f.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: f.entryPointId });
            const observations = [];
            server = http.createServer(async (req, res) => {
                const chunks = []; for await (const chunk of req) chunks.push(chunk);
                const body = JSON.parse(Buffer.concat(chunks));
                const snapshot = await f.core.load(h.handle, initial.session.sessionId);
                observations.push(snapshot.states.atri_world_state.worlds[f.worldId].state.hp);
                const message = body.tools?.length ? { content: '', tool_calls: [{ id: 'call_one', type: 'function', function: { name: 'game_command_heal', arguments: '{}' } }] } : { content: 'Committed recovery.' };
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] }));
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, roles: ['narrator', 'intent_resolver'] });
            const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
            const result = await host.executeTurn(h.handle, { sessionId: initial.session.sessionId, revisionId: initial.revision.revisionId, userInput: 'Heal me', invocationId: 'authority-first', slotBindings: {} });
            expect(observations).toEqual([8, 9]);
            expect(result.timeline.at(-1).content).toBe('Committed recovery.');
            expect(result.states.atri_task_results.records.at(-1).outcomes).toEqual([]);
        } finally { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
    });
});

describe('P3 Model Execution Lane', () => {
    test('borrows model/connection, replaces Narrator program and preserves input exposure policy', async () => {
        const h = await makeTempFsEngineHarness(); let server;
        try {
            let body;
            server = http.createServer(async (req, res) => {
                const chunks = []; for await (const chunk of req) chunks.push(chunk); body = JSON.parse(Buffer.concat(chunks));
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
            const raw = contract(); const variant = raw.tasks[0].variants[0];
            const packageId = createNativeId('package'), packageVersionId = createNativeId('packageVersion');
            const origin = { scope: 'package', packageId, packageVersionId };
            const resources = [
                { resourceType: 'core.prompt-program', origin, resource: { ...seeded.prompt, promptProgramId: variant.prompt.resourceId, stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
                { resourceType: 'core.generation-profile', origin, resource: { ...seeded.generation, generationProfileId: variant.generation.resourceId } },
            ];
            const snapshot = { session: { sessionId: createNativeId('session'), packageId, packageVersionId }, revision: { revisionId: createNativeId('revision'), branchId: createNativeId('branch') },
                timeline: [], variants: [], states: {}, knowledge: { bindings: [], snapshots: [] }, manifest: { actors: [], runtime: { experienceContract: { taskRuntime: assertTaskRuntime(raw) } } } };
            const sessionCore = { load: async () => snapshot, recordTaskResult: async (_h, _s, record) => ({ ...snapshot, states: { atri_task_results: { records: [record] } } }) };
            const host = new NativeGenerationHost({ ...seeded, sessionCore, packageInstaller: { open: async () => ({ manifest: { resources } }) },
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
            const result = await host.executeTask(h.handle, { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
                taskId: raw.tasks[0].id, variantId: 'default', invocationId: 'task-one', input: {}, slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
            expect(result.record.promptProgramRef.resourceId).toBe(variant.prompt.resourceId);
            expect(JSON.stringify(body)).not.toContain('Produce a concise response');
            expect(JSON.stringify(result)).not.toContain('synthetic-secret');
            expect(result.record.deliveryReceipt.kind).toBe('model_delivery');
        } finally { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); await h.cleanup(); }
    });
});
