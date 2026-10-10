import { test, expect } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';

// Preloaded long Timeline through original publication, then the original Turn
// scheduler/authority/finalization; not 500 consecutive model generations.
// A local protocol response verifies delivery, never model prose quality.
test('G06 500-round Native Turn consumes bounded granted memory and rejects stale provenance before sending', async () => {
    const h = await makeTempFsEngine(); const requests = [];
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const bytes of req) wire += bytes;
        requests.push(JSON.parse(wire));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'The authored note is updated; the old promise remains historical.' } }],
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
            { role: 'assistant', content: 'OLD PROMISE: I promised to return the book; present possession is unknown.' },
            { expectedRevisionId: f.base.revision.revisionId });
        const oldMessageId = current.timeline.at(-1).messageId;
        const oldRevisionId = current.revision.revisionId;
        const entries = [], variants = [], staged = { ...current, timeline: [...current.timeline] };
        const append = draft => {
            const created = f.core._newEntry(staged, draft);
            entries.push(created.entry); variants.push(created.variant); staged.timeline.push(created.entry);
        };
        for (let round = 0; round < 500; round++) {
            append({ role: 'user', content: `Later user ${round}` });
            append({ role: 'assistant', content: `Later reply ${round}` });
        }
        append({ role: 'user', content: 'Update the note; what did the old promise establish?' });
        current = await f.core._publish(h.handle, current, { timeline: staged.timeline, entries, variants });
        expect(current.timeline.length - f.base.timeline.length).toBe(1002);
        const route = f.seeded.routes.find(item => item.role === 'role.narrator');
        await f.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [f.seeded.model.modelProfileId], computeBudget: { maxRequests: 1, maxTokens: 32000 } } });
        const memory = { memoryId: 'long-old-promise', content: 'Granted historical promise; current recollection/completion/possession unknown.',
            sourceRefs: [{ kind: 'timeline', messageId: oldMessageId, branchId: current.revision.branchId, revisionId: current.revision.revisionId }] };
        const input = { ...f.input, invocationId: 'long-current-turn', revisionId: current.revision.revisionId,
            userInput: current.timeline.at(-1).content, hostMemoryEvidence: [memory] };
        const stale = structuredClone(input); stale.hostMemoryEvidence[0].sourceRefs[0].revisionId = oldRevisionId;
        await expect(f.host.executeTurn(h.handle, stale, undefined, undefined, { transaction: f.selection }))
            .rejects.toMatchObject({ code: 'native_turn_memory_evidence_stale' });
        expect(requests).toHaveLength(0);
        let producingRun;
        const finalize = f.core.finalizeTurn.bind(f.core);
        f.core.finalizeTurn = async (...args) => {
            // Original Run operations are scoped to the producing anchor. Read
            // its settled receipt before finalization advances that anchor.
            producingRun = await f.core.runs.status(h.handle, current.session.sessionId);
            return finalize(...args);
        };
        const result = await f.host.executeTurn(h.handle, input, undefined, undefined, { transaction: f.selection });
        expect(requests).toHaveLength(1);
        const wire = JSON.stringify(requests[0]);
        expect(wire).toContain(memory.content);
        expect(wire).toContain('visible new note');
        expect(wire).not.toContain('PRIVATE READ SENTINEL');
        expect(wire).not.toContain('Later reply 499'); // Outside this exact bounded view.
        expect(Buffer.byteLength(wire)).toBeLessThan(64000);
        expect(result.timeline.at(-1).content).toBe('The authored note is updated; the old promise remains historical.');
        // Authority-first Turn publishes its action trace and fresh narration.
        expect(result.timeline).toHaveLength(current.timeline.length + 2);
        expect(result.timeline.slice(0, current.timeline.length)).toEqual(current.timeline);
        expect(result.states.atri_action_receipts.receipts).toHaveLength(1);
        const attempts = Object.values(producingRun.operations).flatMap(operation => operation.compute?.attempts ?? []);
        expect(attempts).toHaveLength(1);
        expect(attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 120 } });
        const exact = await f.sessionRepo.readTimelineByMessageIds(h.handle, current.session.sessionId, [oldMessageId], { revisionId: result.revision.revisionId });
        expect(exact.entries[0].content).toContain('OLD PROMISE');
        console.info(JSON.stringify({ event: 'g06_long_turn_consumer', preloadedRounds: 500,
            beforeTimelineEntries: current.timeline.length, afterTimelineEntries: result.timeline.length,
            localRequests: requests.length, wireBytes: Buffer.byteLength(wire), reportedTotalTokens: attempts[0].usage.totalTokens,
            scope: 'preloaded_history_one_real_turn_with_constructed_granted_memory', externalApi: 0 }));
    } finally {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup();
    }
}, 120000);
