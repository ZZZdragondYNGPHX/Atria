import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpDelegatedQualityFixture, rpChildQualityTask } from './helpers/rp-delegated-quality-fixture.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readGraphNodeResult } from '../../src/native/orchestration/graph-result-contracts.js';
import { readAttemptInvalidation, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const text = body => JSON.stringify(body.messages);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));

test('SQLite RP child original Review and Judge compose without a Planner before TaskLocalOutput and sole parent narration', async () => {
    const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.run(); expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(8);
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
        expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(0);
        const parent = (await rootsOf(f)).find(root => !root.parentRef); expect(parent.outputClaims).toHaveLength(1);
        const childEffects = f.effects.filter(effect => effect.proposal.inputRef.childRunId === child.runId); expect(childEffects).toHaveLength(7);
        for (const effect of childEffects) {
            expect(effect.proposal.inputRef.audience).toEqual({ kind: 'task', id: child.runId });
            expect(effect.proposal.inputRef.sourceRef).toEqual(child.sourceBinding.sourceRef);
        } expect(child.graph.nodes.some(node => node.kind === 'planner')).toBe(false);
        expect(child.progress).toMatchObject({ attempts: 8, reviews: 2, patches: 0, replans: 0, loopIterations: 0, edgeVisits: 10 });
        expect(f.requests.slice(0, 7).map(body => rpChildQualityTask(body).nodeId)).toEqual([...[f.nodes.first.nodeId, f.nodes.second.nodeId].toSorted((a, b) => a.localeCompare(b)), f.nodes.review.nodeId,
            f.nodes.first.nodeId, f.nodes.review.nodeId, f.nodes.judge.nodeId, f.nodes.terminal.nodeId]);
        expect(new Set(f.requests.slice(0, 3).map(body => body.model)).size).toBe(3);
        for (const body of f.requests.slice(0, 7)) { expect(text(body)).toContain('Original RP input'); expect(text(body)).toContain('Authorized advisory source [rp0]'); }
        expect(text(f.requests[3])).toContain('draft_incomplete');
        for (const body of f.requests.slice(4, 7)) { expect(text(body)).toContain('RP_CHILD_QUALITY_A_2'); expect(text(body)).not.toContain('RP_CHILD_QUALITY_A_1'); }
        expect(text(f.requests[6])).not.toContain('RP_CHILD_QUALITY_B_1'); expect(text(f.requests[7])).toContain('RP_CHILD_QUALITY_TERMINAL');
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(8); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(7);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readTaskLocalOutput(tx, f.h.handle, child), history = output.publication.graphHistory;
            expect(history.effects).toHaveLength(7); expect(history.planners).toEqual([]); expect(history.reviews.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
            expect(history.judges).toHaveLength(1); expect(history.results).toHaveLength(3); expect(history.settled).toBe(true);
            const old = history.results.find(fact => fact.record.payload === 'RP_CHILD_QUALITY_A_1');
            const current = history.results.find(fact => fact.record.payload === 'RP_CHILD_QUALITY_A_2');
            expect((await readAttemptInvalidation(tx, f.h.handle, child, old.producer)).reviewReceiptId).toBe(history.reviews[0].review.receiptId);
            expect(history.reviews[0].review.replacements).toEqual([{ targetAttemptId: old.producer.attemptId, attemptId: current.producer.attemptId }]);
            expect(history.judges[0].selectedResultRef).toEqual(current.receipt.resultRef);
            expect(history.finalProducer.inputRefs[0].acceptedGraphResultRefs).toEqual([current.receipt.resultRef]);
            expect(history.finalProducer.inputRefs[0].acceptedControlRefs).toEqual([history.judges[0].controlRef]);
            expect((await readGraphNodeResult(tx, f.h.handle, child, old.record.resultId)).record).toEqual(old.record);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', history.reviews[0].review.receiptId), saved = await tx.getResource(key);
            const changed = { ...saved.doc, replacements: [] };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(output.receipt);
        });
        await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
        expect((await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).publication.graphHistory.settled).toBe(true);
        expect(f.requests).toHaveLength(8);
    } finally { await f.cleanup(); }
}, 180000);

for (const [name, options] of [['published round ceiling', { maxRounds: 1 }], ['original held child ceiling', { childRequests: 6 }]])
    test('RP child Review retains paid history at its ' + name, async () => {
        const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness, options);
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_review_rerun_budget_unavailable'); expect(f.requests).toHaveLength(3);
            const child = (await rootsOf(f)).find(root => root.parentRef);
            expect(child.status).toBe('blocked'); expect(child.outputClaims).toEqual([]); expect(child.pendingEffectRefs).toEqual([]);
            expect(child.resultRefs).toHaveLength(2); expect(child.progress.reviews).toBe(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: options.childRequests ?? 7 }) })]);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    }, 90000);

test('RP child paid unknown Review preserves the original held bank and cannot reach Judge or parent narration', async () => {
    const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness, { unknownReview: true });
    try {
        await expect(f.run()).rejects.toThrow('generation_provider_submission_unknown'); expect(f.requests).toHaveLength(3);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef);
        expect(roots.find(root => !root.parentRef).outputClaims).toEqual([]); expect(child.status).toBe('reconciling'); expect(child.outputClaims).toEqual([]);
        expect(child.resultRefs).toHaveLength(2); expect(child.pendingEffectRefs).toHaveLength(1);
        const bank = await bankOf(f); expect(bank.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'unknown']);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await bankOf(f)).toEqual(bank);
    } finally { await f.cleanup(); }
}, 90000);

test('RP child Source withdrawal before Judge denies its send after the original paid Review rounds', async () => {
    const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness);
    const { ContextPort } = await import('../../src/native/orchestration/context-port.js');
    const original = ContextPort.prototype.compile; let count = 0;
    ContextPort.prototype.compile = async function (handle, request) {
        const context = await original.call(this, handle, request);
        if (this.rpDelegationCapture && ++count === 6) {
            const chat = await f.chats.get(handle, f.locator.charDir, f.locator.name); chat.body[0].mes = 'Original Source withdrawn before Judge';
            await f.chats.save(handle, f.locator.charDir, f.locator.name, chat.header, chat.body, chat.integrity);
        }
        return context;
    };
    try {
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(5);
        const child = (await rootsOf(f)).find(root => root.parentRef); expect(child.outputClaims).toEqual([]); expect(child.status).toBe('reconciling');
        expect(child.pendingEffectRefs).toHaveLength(1); expect(child.progress.reviews).toBe(2);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
    } finally { ContextPort.prototype.compile = original; await f.cleanup(); }
}, 90000);
