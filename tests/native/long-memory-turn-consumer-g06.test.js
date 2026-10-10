import { test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import '../memory-graph/_mocks/main-module-stack.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { projectNativeSession } from '../../public/scripts/native/session-projection.js';
import { createSourceLifecycle } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { eligibleMemorySnapshot, resolveMemoryEligibility } from '../../public/scripts/agents/memory/eligibility.js';
import { retrieveMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';

// One real Turn over preloaded history, with actual read-only Memory retrieval.
// The loopback response is protocol evidence, never a prose-quality assessment.
test('G06 long Native Timeline retrieves granted historical source through Memory into the actual Turn', async () => {
    const h = await makeTempFsEngine(), requests = [];
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const bytes of req) wire += bytes;
        requests.push(JSON.parse(wire));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'The historical promise is available; current completion is unknown.' } }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const f = await authorityTurnFixture(h, `http://127.0.0.1:${server.address().port}/v1/chat/completions`, fixture => {
            fixture.contract.informationRuntime.sources.push({ id: 'history', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content'], ['role']] });
            const view = fixture.contract.informationRuntime.views.find(item => item.id === 'narrator.notes');
            view.sources.push('history'); view.memory = true;
        });
        let current = await f.core.appendTimeline(h.handle, f.base.session.sessionId,
            { role: 'assistant', content: 'OLD PROMISE: I promised to return the book; this is a historical promise, not a current completion record.' },
            { expectedRevisionId: f.base.revision.revisionId });
        const oldMessageId = current.timeline.at(-1).messageId;
        const entries = [], variants = [], staged = { ...current, timeline: [...current.timeline] };
        const append = draft => {
            const created = f.core._newEntry(staged, draft);
            entries.push(created.entry); variants.push(created.variant); staged.timeline.push(created.entry);
        };
        for (let round = 0; round < 500; round++) {
            append({ role: 'user', content: `Later user ${round}` });
            append({ role: 'assistant', content: `Later reply ${round}` });
        }
        append({ role: 'user', content: 'Update the note; what did the OLD PROMISE establish?' });
        current = await f.core._publish(h.handle, current, { timeline: staged.timeline, entries, variants });
        const ctx = { key: current.session.sessionId, nativeSnapshot: current, chat: projectNativeSession(current).chat,
            getChatState: async namespace => ({ ok: true, state: ctx.nativeSnapshot.states[namespace] ?? null }),
            updateChatState: jest.fn(() => { throw new Error('Read-only retrieval must not write source state'); }) };
        const lifecycle = createSourceLifecycle({ getContext: () => ctx,
            resolveScope: context => ({ key: context.key, target: { key: context.key } }), enabled: () => true });
        const eligible = () => resolveMemoryEligibility(ctx, { requester: { kind: 'narrator' } });
        const source = await lifecycle.retrievalSnapshot(ctx, { readOnly: true });
        const snapshot = eligibleMemorySnapshot(source, eligible());
        const memory = await retrieveMemory(snapshot, current.timeline.at(-1).content, { budget: 2400,
            countTokens: async text => Buffer.byteLength(text) });
        expect(memory.sourceMessageIds).toContain(oldMessageId);
        expect(memory.sourceMessageIds).not.toContain(current.timeline.at(-2).messageId);
        expect(memory.tokenCount).toBeLessThanOrEqual(2400);
        expect(ctx.updateChatState).not.toHaveBeenCalled();
        const records = memory.evidence.flatMap(item => JSON.parse(item.content).records);
        expect(records.find(record => record.text.includes('OLD PROMISE'))).toMatchObject({
            authority: 'source_assertion', epistemic: 'historical_source',
            temporalApplicability: { at: null, status: 'not_established_at_requested_time' },
        });
        const hostMemoryEvidence = memory.evidence.map(item => ({ memoryId: item.id, content: item.content, atomicGroup: item.atomicGroup,
            sourceRefs: item.sourceMessageIds.map(messageId => ({ kind: 'timeline', messageId,
                branchId: current.revision.branchId, revisionId: current.revision.revisionId })) }));
        const route = f.seeded.routes.find(item => item.role === 'role.narrator');
        await f.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [f.seeded.model.modelProfileId], computeBudget: { maxRequests: 1, maxTokens: 32000 } } });
        const input = { ...f.input, invocationId: 'long-memory-current-turn', revisionId: current.revision.revisionId,
            userInput: current.timeline.at(-1).content, hostMemoryEvidence };
        const stale = structuredClone(input); stale.hostMemoryEvidence[0].sourceRefs[0].revisionId = f.base.revision.revisionId;
        await expect(f.host.executeTurn(h.handle, stale, undefined, undefined, { transaction: f.selection }))
            .rejects.toMatchObject({ code: 'native_turn_memory_evidence_stale' });
        expect(requests).toHaveLength(0);
        let producingRun;
        const finalize = f.core.finalizeTurn.bind(f.core);
        f.core.finalizeTurn = async (...args) => {
            producingRun = await f.core.runs.status(h.handle, current.session.sessionId);
            return finalize(...args);
        };
        const result = await f.host.executeTurn(h.handle, input, undefined, undefined, { transaction: f.selection });
        expect(requests).toHaveLength(1);
        const wire = JSON.stringify(requests[0]);
        for (const item of memory.evidence) expect(wire).toContain(JSON.stringify(item.content).slice(1, -1));
        expect(wire).not.toContain('Later reply 499'); expect(wire).not.toContain('PRIVATE READ SENTINEL');
        expect(Buffer.byteLength(wire)).toBeLessThan(64000);
        expect(result.timeline.slice(0, current.timeline.length)).toEqual(current.timeline);
        expect(result.timeline).toHaveLength(current.timeline.length + 2);
        const attempts = Object.values(producingRun.operations).flatMap(operation => operation.compute?.attempts ?? []);
        expect(attempts).toHaveLength(1); expect(attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 120 } });
        ctx.nativeSnapshot = result;
        expect(snapshot.assertCurrent).toThrow('changed');
        const revoked = structuredClone(result);
        revoked.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'narrator.notes').memory = false;
        ctx.nativeSnapshot = revoked;
        expect(eligible).toThrow('exposure unavailable');
        expect(requests).toHaveLength(1); expect(ctx.updateChatState).not.toHaveBeenCalled();
        const exact = await f.sessionRepo.readTimelineByMessageIds(h.handle, current.session.sessionId, [oldMessageId], { revisionId: result.revision.revisionId });
        expect(exact.entries[0].content).toContain('OLD PROMISE');
        console.info(JSON.stringify({ event: 'g06_long_memory_turn_consumer', preloadedRounds: 500,
            beforeTimelineEntries: current.timeline.length, afterTimelineEntries: result.timeline.length,
            legalCorpusDocuments: memory.metrics.corpusSize, selectedSources: memory.sourceMessageIds.length,
            memoryTokensUtf8Estimate: memory.tokenCount, localRequests: requests.length, wireBytes: Buffer.byteLength(wire),
            reportedTotalTokens: attempts[0].usage.totalTokens, scope: 'actual_memory_retrieval_preloaded_history_one_real_turn', externalApi: 0 }));
    } finally {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup();
    }
}, 120000);
