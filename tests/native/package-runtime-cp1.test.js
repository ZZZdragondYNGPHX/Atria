import { describe, test, expect, jest } from '@jest/globals';
import http from 'node:http';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { artifactFixture } from './helpers/task-artifact-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';

describe.each(CONTRACT_HARNESSES)('CP1 native Package runtime - $name', ({ make }) => {
    test('real Task provenance, cross-revision rules, dynamic preview and adopted Knowledge publish through one CAS', async () => {
        const h = await make(); let server;
        try {
            const seen = [];
            server = http.createServer(async (req, res) => {
                const chunks = []; for await (const chunk of req) chunks.push(chunk);
                const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ choices: [{ message: { content: body.response_format ? '{"quantity":2}' : 'The purchase is complete.' } }] }));
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions' });
            const f = artifactFixture();
            f.contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
            f.contract.informationRuntime.views.push({ id: 'narrator.notes', audience: 'narrator', sources: ['public.notes'], exposure: ['context'], knowledge: true, memory: false, maxItems: 64, maxCharacters: 16384 });
            f.contract.capabilities.push({ id: 'context-derivation', version: 1, required: true });
            const entry = f.base.manifest.knowledge[0].entries[0]; entry.lifecycle = { sticky: 2, cooldown: 1 };
            f.contract.contextRuntime = { schemaVersion: 1, derivations: [{ id: 'npc.context', source: 'context/npc.ts', viewId: 'narrator.notes',
                target: { kind: 'knowledge', knowledgeEntryId: entry.knowledgeEntryId },
                artifacts: [{ id: 'npc', taskId: f.task.id, variantId: 'default', usageId: 'summary', selector: 'latest' }] }] };
            f.installed.sourceFiles.set('context/npc.ts', Buffer.from('export default {derive({artifacts}) {return {text:"D".repeat(20000),compact:"NPC wants "+artifacts.npc.quantity};}}'));
            const variant = f.task.variants[0], origin = { scope: 'package', packageId: f.base.manifest.packageId, packageVersionId: f.base.manifest.packageVersionId };
            f.base.manifest.resources = [
                { resourceType: 'core.prompt-program', origin, resource: { ...seeded.prompt, promptProgramId: variant.prompt.resourceId, stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
                { resourceType: 'core.generation-profile', origin, resource: { ...seeded.generation, generationProfileId: variant.generation.resourceId } },
            ];
            f.sync(); const svc = services(h);
            const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
            await svc.packageInstaller.install(h.handle, archive);
            let base = await svc.core.create(h.handle, { ...f.base.session });
            const command = async (invocationId, action) => { base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
                { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId }); };
            await command('ready', { kind: 'experience.ready' });
            await command('seed-notes', { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'public note' } });
            for (const [domainId, value] of [['wallet',20], ['shop',5], ['bag',0]])
                await command('seed-' + domainId, { kind: 'app.command', domainId, commandId: 'set', recordId: 'main', args: { value } });
            const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
            const productionRevisionId = base.revision.revisionId;
            await expect(svc.core.recordTaskResult(h.handle, base.session.sessionId, {
                invocationId: 'spoof', taskId: f.task.id, variantId: 'default', payload: { quantity: 2 },
            }, { expectedRevisionId: productionRevisionId })).rejects.toThrow('production provenance');
            const result = await host.executeTask(h.handle, { sessionId: base.session.sessionId, revisionId: productionRevisionId,
                taskId: f.task.id, variantId: 'default', invocationId: 'npc-1', input: {},
                slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
            base = result.snapshot;
            expect(result.record.production.anchor.revisionId).toBe(productionRevisionId);
            expect(result.record.requestSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
            expect(base.states.atri_lifecycle.domains.wallet.records[0].value.value).toBe(20);
            base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Unrelated new turn' });
            const before = await svc.core.load(h.handle, base.session.sessionId);
            const preview = await host.execute(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'preview', role: 'narrator' }, undefined, undefined, { preview: true });
            expect(seen).toHaveLength(1);
            expect(preview.snapshot.contextPlan.items.some(item => item.content === 'NPC wants 2')).toBe(true);
            expect((await svc.core.load(h.handle, base.session.sessionId)).states).toEqual(before.states);
            await expect(svc.core.applyRuntimeCommit(h.handle, base.session.sessionId, { statePatch: { atri_knowledge_runtime: {} } }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow('result adoption');
            const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'buy-1', slotBindings: {} };
            const transaction = { transactionId: 'trade.buy', input: { quantity: 2, invocationId: 'npc-1' } };
            const commit = jest.spyOn(svc.core._sessions, 'commitSnapshot');
            const next = await host.executeTurn(h.handle, input, undefined, undefined, { transaction });
            expect(commit).toHaveBeenCalledTimes(1);
            expect(['wallet','shop','bag'].map(id => next.states.atri_lifecycle.domains[id].records[0].value.value)).toEqual([14,3,2]);
            const adopted = next.states.atri_task_results.records.find(record => record.invocationId === 'npc-1');
            expect(adopted.consumptions[0].applicationRevisionId).toBe(next.revision.revisionId);
            expect(Object.keys(next.states.atri_knowledge_runtime.targets['["narrator",""]'].effects)).toHaveLength(1);
            expect(next.states.atri_action_receipts.receipts[0].artifacts[0].productionRevisionId).toBe(productionRevisionId);
            expect(JSON.stringify(seen[1])).toContain('NPC wants 2');
            expect(JSON.stringify(seen)).not.toContain('PRIVATE SENTINEL');
            expect((await host.executeTurn(h.handle, input, undefined, undefined, { transaction })).revision).toEqual(next.revision);
            expect(commit).toHaveBeenCalledTimes(1);
            await expect(host.executeTurn(h.handle, { ...input, revisionId: next.revision.revisionId, invocationId: 'buy-again' }, undefined, undefined, { transaction })).rejects.toThrow();
            expect((await svc.core.load(h.handle, base.session.sessionId)).states).toEqual(next.states);
        } finally {
            if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
            await h.cleanup();
        }
    });
});
