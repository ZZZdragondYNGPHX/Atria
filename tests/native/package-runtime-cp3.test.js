import { describe, test, expect, jest } from '@jest/globals';
import http from 'node:http';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services, sessionFixture } from './helpers/session-fixture.js';
import { artifactFixture } from './helpers/task-artifact-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { buildAtriaPackageContainer, createNativeId } from '../../src/native/index.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { projectPresentation } from '../../public/shared/native-frontend-host.js';

async function modelFixture() {
    const seen = [];
    let text = '  Purchased two items.  ', intercept = null;
    const server = http.createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
        if (intercept && !body.response_format) await intercept();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: body.response_format ? '{"quantity":2}' : text } }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { seen, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions',
        setText: value => { text = value; }, intercept: value => { intercept = value; },
        close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
function host(svc, seeded) {
    return new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
}
function tradingPackage(seeded) {
    const f = artifactFixture();
    f.base.manifest.name = 'CP3 Native Trading';
    f.task.executionClass = 'background';
    f.logic.derivedPublications = [];
    f.contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
    f.contract.lifecycleRuntime.automations = [{ id: 'npc-on-ready', scopeId: 'session', trigger: { kind: 'experience.ready' },
        action: { kind: 'task', taskId: f.task.id, variantId: 'default', input: {} }, maxCatchUp: 1 }];
    f.contract.informationRuntime.views.push({ id: 'narrator.notes', audience: 'narrator', sources: ['public.notes'], exposure: ['context'],
        knowledge: true, memory: false, maxItems: 64, maxCharacters: 16384 });
    f.contract.capabilities.push({ id: 'context-derivation', version: 1, required: true }, { id: 'processing', version: 1, required: true });
    const entry = f.base.manifest.knowledge[0].entries[0];
    entry.lifecycle = { sticky: 2, cooldown: 1 };
    f.contract.contextRuntime = { schemaVersion: 1, derivations: [{ id: 'npc.knowledge', source: 'context/npc.ts', viewId: 'narrator.notes',
        target: { kind: 'knowledge', knowledgeEntryId: entry.knowledgeEntryId },
        artifacts: [{ id: 'npc', taskId: f.task.id, variantId: 'default', usageId: 'summary', selector: 'latest' }] }] };
    f.contract.processingRuntime = { schemaVersion: 1, processors: [
        { id: 'history', stage: 'context', kind: 'script', source: 'processing/history.ts' },
        { id: 'trim', stage: 'output', kind: 'trim' },
        { id: 'accept', stage: 'output', kind: 'script', source: 'processing/accept.ts' },
        { id: 'display', stage: 'presentation', kind: 'replace', find: 'Purchased', replacement: 'Receipt:' },
    ] };
    f.installed.sourceFiles.set('context/npc.ts', Buffer.from('export default {derive({artifacts}) {return {text:"D".repeat(20000),compact:"NPC wants "+artifacts.npc.quantity};}}'));
    f.installed.sourceFiles.set('processing/history.ts', Buffer.from('export default {transform({text}) {return "Historical: "+text;}}'));
    f.installed.sourceFiles.set('processing/accept.ts', Buffer.from('export default {transform({text}) {if(text==="bad") throw Error("private"); return text+" [accepted]";}}'));
    const variant = f.task.variants[0], origin = { scope: 'package', packageId: f.base.manifest.packageId, packageVersionId: f.base.manifest.packageVersionId };
    f.base.manifest.resources = [
        { resourceType: 'core.prompt-program', origin, resource: { ...seeded.prompt, promptProgramId: variant.prompt.resourceId, stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', origin, resource: { ...seeded.generation, generationProfileId: variant.generation.resourceId } },
    ];
    f.sync();
    return f;
}
const balances = snapshot => ['wallet', 'shop', 'bag'].map(id => snapshot.states.atri_lifecycle.domains[id].records[0].value.value);

describe.each(CONTRACT_HARNESSES)('CP3 native Package integration - $name', ({ make }) => {
    test('portable pending Lifecycle resumes into Task, budgeted Knowledge, atomic trade and durable diagnostics', async () => {
        const source = await make(), target = await make(), recovery = await make(), model = await modelFixture();
        try {
            const seeded = await seedGenerationProfiles({ ...target, endpoint: model.endpoint });
            const f = tradingPackage(seeded), original = services(source);
            const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles });
            await original.packageInstaller.install(source.handle, archive);
            let base = await original.core.create(source.handle, f.base.session);
            const command = async (action, invocationId) => {
                base = await original.core.applyLifecycleCommand(source.handle, base.session.sessionId,
                    { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId });
            };
            await command({ kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'PRIVATE SENTINEL' } }, 'private-note');
            await command({ kind: 'app.command', domainId: 'public_notes', commandId: 'save', recordId: 'main', args: { text: 'public' } }, 'public-note');
            for (const [domainId, value] of [['wallet', 20], ['shop', 5], ['bag', 0]])
                await command({ kind: 'app.command', domainId, commandId: 'set', recordId: 'main', args: { value } }, 'seed-' + domainId);
            await command({ kind: 'experience.ready' }, 'ready');
            const queued = base.states.atri_lifecycle.outbox[0];
            expect(queued.status).toBe('pending');
            expect(queued.cause).toMatchObject({ revisionId: base.revision.revisionId, invocationId: 'ready' });
            const exported = await original.saveSystem.exportSession(source.handle, base.session.sessionId);
            let svc = services(target);
            await svc.packageInstaller.install(target.handle, archive);
            base = await svc.saveSystem.importSave(target.handle, exported.archive);
            expect(base.states.atri_lifecycle.outbox[0]).toEqual(queued);
            expect(model.seen).toHaveLength(0);
            // Recreate both service and Host; only the imported durable intent remains.
            svc = services(target);
            const runtime = host(svc, seeded);
            const bindings = { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } };
            const resumed = await runtime.executeLifecycle(target.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings: bindings });
            base = resumed.snapshot;
            const record = resumed.results[0];
            expect(record.payload).toEqual({ quantity: 2 });
            expect(record.lifecycleCause).toMatchObject({ revisionId: queued.cause.revisionId, invocationId: 'ready', scopeEpoch: 0 });
            expect(record.production.anchor.revisionId).toBe(queued.cause.revisionId);
            expect(record.promptProgramRef).toMatchObject({ scope: 'package', packageVersionId: base.session.packageVersionId });
            expect(base.states.atri_lifecycle.outbox[0].status).toBe('completed');
            expect(balances(base)).toEqual([20, 5, 0]);
            expect((await runtime.executeLifecycle(target.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings: bindings })).results).toEqual([]);
            expect(model.seen).toHaveLength(1);
            base = await svc.core.appendTimeline(target.handle, base.session.sessionId, { role: 'user', content: 'Buy two items' });
            const before = structuredClone(base);
            const preview = await runtime.execute(target.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'preview', role: 'narrator' }, undefined, undefined, { preview: true });
            const knowledge = preview.snapshot.contextPlan.items.find(item => item.content === 'NPC wants 2');
            expect(knowledge).toBeDefined();
            expect(JSON.stringify(preview.snapshot.contextPlan)).toContain('npc.knowledge');
            expect(JSON.stringify(preview.snapshot.contextPlan.items)).not.toContain('Historical:');
            expect((await svc.core.load(target.handle, base.session.sessionId)).states).toEqual(before.states);
            expect(model.seen).toHaveLength(1);
            const transaction = { transactionId: 'trade.buy', input: { quantity: 2, invocationId: record.invocationId } };
            const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'trade', slotBindings: {} };
            const commit = jest.spyOn(svc.core._sessions, 'commitSnapshot');
            model.setText('bad');
            await expect(runtime.executeTurn(target.handle, input, undefined, undefined, { transaction })).rejects.toMatchObject({ code: 'native_processing_failed', processorId: 'accept', stage: 'output' });
            const rejected = await svc.core.load(target.handle, base.session.sessionId);
            expect(rejected.states).toEqual(before.states); expect(rejected.timeline).toEqual(before.timeline);
            expect(commit).not.toHaveBeenCalled();
            model.setText('  Purchased two items.  ');
            let enter, release;
            const entered = new Promise(resolve => { enter = resolve; });
            const released = new Promise(resolve => { release = resolve; });
            model.intercept(async () => { enter(); await released; });
            const stale = runtime.executeTurn(target.handle, { ...input, invocationId: 'stale-trade' }, undefined, undefined, { transaction })
                .then(() => null, error => error);
            await entered;
            base = await svc.core.applyLifecycleCommand(target.handle, base.session.sessionId,
                { type: 'lifecycle', invocationId: 'concurrent-clock', action: { kind: 'clock.advance', commandId: 'advance', ticks: 1 } }, { expectedRevisionId: base.revision.revisionId });
            release(); expect((await stale)?.message).toMatch(/stale|conflict/); model.intercept(null);
            expect((await svc.core.load(target.handle, base.session.sessionId)).states).toEqual(base.states);
            expect(balances(base)).toEqual([20, 5, 0]);
            expect(commit).toHaveBeenCalledTimes(1); commit.mockClear();
            const fresh = { ...input, revisionId: base.revision.revisionId };
            const next = await runtime.executeTurn(target.handle, fresh, undefined, undefined, { transaction });
            expect(commit).toHaveBeenCalledTimes(1);
            expect(balances(next)).toEqual([14, 3, 2]);
            expect(next.timeline.at(-1).content).toBe('Purchased two items. [accepted]');
            expect(projectPresentation(next).at(-1).displayContent).toBe('Receipt: two items. [accepted]');
            const consumed = next.states.atri_task_results.records.find(item => item.invocationId === record.invocationId);
            expect(consumed.consumptions[0]).toMatchObject({ baseRevisionId: base.revision.revisionId, applicationRevisionId: next.revision.revisionId });
            expect(Object.keys(next.states.atri_knowledge_runtime.targets['["narrator",""]'].effects)).toHaveLength(1);
            const receipt = next.states.atri_action_receipts.receipts[0];
            expect(receipt.artifacts[0]).toMatchObject({ invocationId: record.invocationId, productionRevisionId: record.production.anchor.revisionId });
            expect(receipt.execution.every(item => /^[a-f0-9]{64}$/.test(item.resourceHash))).toBe(true);
            expect(next.states.atri_task_results.records.at(-1).provenance.find(item => item.processing).processing.map(item => item.processorId)).toEqual(['trim', 'accept']);
            const requestCount = model.seen.length;
            expect((await runtime.executeTurn(target.handle, fresh, undefined, undefined, { transaction })).revision).toEqual(next.revision);
            await expect(runtime.executeTurn(target.handle, { ...fresh, revisionId: next.revision.revisionId, invocationId: 'duplicate-consumption' }, undefined, undefined, { transaction })).rejects.toMatchObject({ code: 'AUTHORITY_PREPARATION_FAILED' });
            expect(commit).toHaveBeenCalledTimes(1); expect(model.seen).toHaveLength(requestCount);
            expect(JSON.stringify(model.seen)).toContain('NPC wants 2');
            expect(JSON.stringify(model.seen)).not.toContain('PRIVATE SENTINEL');
            // Installing a newer rule version cannot advance an existing Session or Save.
            const newer = structuredClone(f.base.manifest);
            newer.packageVersionId = createNativeId('packageVersion'); newer.version = '2.0.0';
            for (const item of newer.resources) item.origin.packageVersionId = newer.packageVersionId;
            const changedFiles = new Map(f.installed.sourceFiles);
            changedFiles.set('rules/price.ts', Buffer.from('export const total = () => 999;'));
            const newerArchive = buildAtriaPackageContainer({ manifest: newer, sourceFiles: changedFiles }).archive;
            await svc.packageInstaller.install(target.handle, newerArchive);
            const save = await svc.saveSystem.exportSession(target.handle, next.session.sessionId);
            const recovered = services(recovery);
            await recovered.packageInstaller.install(recovery.handle, newerArchive);
            await expect(recovered.saveSystem.importSave(recovery.handle, save.archive)).rejects.toMatchObject({ code: 'native_save_package_missing' });
            await recovered.packageInstaller.install(recovery.handle, archive);
            const durable = await services(recovery).saveSystem.importSave(recovery.handle, save.archive);
            expect(durable.session.packageVersionId).toBe(next.session.packageVersionId);
            expect(durable.states).toEqual(next.states); expect(durable.timeline).toEqual(next.timeline);
            expect(projectPresentation(durable)).toEqual(projectPresentation(next));
            expect((await services(source).core.load(source.handle, before.session.sessionId)).states.atri_lifecycle.outbox[0].status).toBe('pending');
        } finally { await model.close(); await source.cleanup(); await target.cleanup(); await recovery.cleanup(); }
    }, 30000);

    test('installed text Processor transforms real saved raw history before HTTP budget and preserves canonical data', async () => {
        const h = await make(), model = await modelFixture();
        try {
            const f = sessionFixture(), svc = services(h), seeded = await seedGenerationProfiles({ ...h, endpoint: model.endpoint });
            f.manifest.runtime = { experienceContract: { schemaVersion: 1, capabilities: [{ id: 'processing', version: 1, required: true }], dataResources: [],
                processingRuntime: { schemaVersion: 1, processors: [{ id: 'history', stage: 'context', kind: 'script', source: 'history.ts' }] } } };
            const sourceFiles = new Map([['history.ts', Buffer.from('export default {transform({text}) {return "Historical: "+text;}}')]]);
            await svc.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles }).archive);
            let base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
            base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Current input' });
            const runtime = host(services(h), seeded);
            const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'raw-history', role: 'narrator' };
            const preview = await runtime.execute(h.handle, input, undefined, undefined, { preview: true });
            expect(model.seen).toHaveLength(0);
            const actual = await runtime.execute(h.handle, input);
            expect(actual.snapshot.contextPlan).toEqual(preview.snapshot.contextPlan);
            expect(JSON.stringify(model.seen[0])).toContain('Historical:');
            const history = actual.snapshot.contextPlan.items.find(item => item.kind === 'context.history');
            const evidence = JSON.parse(history.provenance.find(item => item.source === 'native.processing').ref);
            expect(evidence).toMatchObject({ processorId: 'history', stage: 'context', resourceHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
            expect(evidence.inputHash).not.toBe(evidence.outputHash);
            expect((await svc.core.load(h.handle, base.session.sessionId)).timeline).toEqual(base.timeline);
            expect((await svc.core.load(h.handle, base.session.sessionId)).revision).toEqual(base.revision);
        } finally { await model.close(); await h.cleanup(); }
    });
});
