import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpDelegatedQualityFixture, rpChildQualityTask } from './helpers/rp-delegated-quality-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readGraphNodeResult } from '../../src/native/orchestration/graph-result-contracts.js';
import { readAttemptInvalidation, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const text = body => JSON.stringify(body.messages);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));

test('SQLite RP child original Review and Judge compose without a Planner before TaskLocalOutput and sole parent narration', async () => {
    const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness, { parentMaxSteps: 57, parentMaxEdgeVisits: 11 });
    try {
        const result = await f.run(); expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(8);
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
        expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(0);
        const parent = (await rootsOf(f)).find(root => !root.parentRef); expect(parent.outputClaims).toHaveLength(1);
        expect(parent.status).toBe('completed'); expect(result.output.runStatus).toBe('completed');
        expect(parent.limits.maxSteps).toBe(57); expect(f.parentPlan.definition.limits.maxSteps).toBe(57);
        expect(parent.treeProgress.steps).toBe(57); expect(parent.progress.steps).toBe(13); expect(child.progress.steps).toBe(44);
        expect(parent.limits.maxEdgeVisits).toBe(11); expect(f.parentPlan.definition.limits.maxEdgeVisits).toBe(11);
        expect(child.limits.maxEdgeVisits).toBe(10); expect(f.childPlan.definition.limits.maxEdgeVisits).toBe(10);
        expect(child.treeProgress.edgeVisits).toBe(10); expect(parent.progress.edgeVisits).toBe(1);
        expect(parent.treeProgress.edgeVisits).toBe(11); expect(parent.treeProgress.edgeVisits).toBe(child.treeProgress.edgeVisits + parent.progress.edgeVisits);
        expect(child.limits.maxSteps).toBe(50); expect(f.childPlan.definition.limits.maxSteps).toBe(50);
        expect(child.graph.outputContract.kind).toBe('result'); expect(parent.graph.outputContract.kind).toBe('rp_narration');
        const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        expect(chat.body).toHaveLength(3); expect(chat.body[2].mes).toBe('RP_PARENT_ACCEPTS_CHILD_QUALITY');
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
            const narration = await readRpOutput(tx, f.h.handle, parent);
            expect(narration.claim).toEqual(expect.objectContaining({ claimId: parent.outputClaims[0].claimId }));
            expect(narration.published.record.payload).toBe('RP_PARENT_ACCEPTS_CHILD_QUALITY');
            expect(narration.output.status).toBe('completed');
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
            await expect(f.run()).rejects.toMatchObject({ code: 'operation_child_failed',
                cause: { code: 'native_orchestration_review_rerun_budget_unavailable' } }); expect(f.requests).toHaveLength(3);
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
        await expect(f.run()).rejects.toMatchObject({ code: 'operation_child_failed',
            cause: { code: 'generation_provider_submission_unknown' } }); expect(f.requests).toHaveLength(3);
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

// This original tree ceiling has the same formal Chat contract as the separate
// owner57 positive. It cannot pass by treating a deadline or other error as cost.
test('RP child Review and Judge retain the original owner tree step ceiling of fifty before formal Chat', async () => {
    const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness, { parentMaxSteps: 50 });
    const runs = f.authority.execution.runs, control = runs.control, refusals = [];
    runs.control = async function (...args) {
        try { return await control.apply(this, args); } catch (error) {
            refusals.push({ runId: args[2]?.runId, code: error.code, at: Date.now() });
            throw error;
        }
    };
    try {
        await expect(f.run()).rejects.toThrow();
        const roots = await rootsOf(f), parent = roots.find(root => !root.parentRef), child = roots.find(root => root.parentRef);
        expect(f.parentPlan.definition.limits.maxSteps).toBe(50); expect(parent.limits.maxSteps).toBe(50);
        expect(f.childPlan.definition.limits.maxSteps).toBe(50); expect(child.limits.maxSteps).toBe(50);
        expect(parent.graph.outputContract.kind).toBe('rp_narration'); expect(child.graph.outputContract.kind).toBe('result');
        expect(parent.treeProgress.steps).toBe(50); expect(parent.progress.steps).toBeLessThan(50);
        const first = refusals.find(refusal => refusal.runId === parent.runId);
        expect(first?.code).toBe('native_orchestration_tree_limit_exhausted');
        expect(first.at).toBeLessThan(parent.treeProgress.deadlineAt);
        expect(child.status).toBe('completed'); expect(child.outputClaims).toHaveLength(1);
        expect(parent.outputClaims).toEqual([]); expect(f.requests).toHaveLength(8);
        const childEffects = f.effects.filter(effect => effect.proposal.inputRef.childRunId === child.runId);
        expect(childEffects).toHaveLength(7);
        for (const effect of childEffects) {
            expect(effect.proposal.inputRef.audience).toEqual({ kind: 'task', id: child.runId });
            expect(effect.proposal.inputRef.sourceRef).toEqual(child.sourceBinding.sourceRef);
        }
        for (const body of f.requests.slice(0, 7)) { expect(text(body)).toContain('Original RP input'); expect(text(body)).toContain('Authorized advisory source [rp0]'); }
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(8);
        expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(7);
        expect(bank.localWork).toHaveLength(46); expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(8); expect(await bankOf(f)).toEqual(bank);
    } finally { runs.control = control; await f.cleanup(); }
}, 180000);

test('RP child Review and Judge retain the original owner ten-edge ceiling before the eleventh formal Chat transfer', async () => {
    const f = await rpDelegatedQualityFixture(makeTempSqliteEngineHarness, { parentMaxSteps: 57, parentMaxEdgeVisits: 10 });
    const runs = f.authority.execution.runs, control = runs.control, refused = [], transfers = [];
    runs.control = async function (...args) {
        const body = args[2];
        if (body.operation === 'loop.advance') {
            const reduce = args[3];
            args[3] = async value => {
                const before = structuredClone(value.root);
                const result = await reduce(value);
                if (!before.parentRef) transfers.push({ runId: before.runId, now: value.now, beforeProgress: before.progress,
                    beforeTree: before.treeProgress, nextProgress: structuredClone(result.root.progress), traversal: result.outcome.traversalReceipt });
                return result;
            };
        }
        try { return await control.apply(this, args); } catch (error) {
            refused.push({ runId: body.runId, operation: body.operation, code: error.code, at: Date.now() }); throw error;
        }
    };
    try {
        await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_tree_limit_exhausted' });
        const roots = await rootsOf(f), parent = roots.find(root => !root.parentRef), child = roots.find(root => root.parentRef);
        expect(parent.limits.maxSteps).toBe(57); expect(f.parentPlan.definition.limits.maxSteps).toBe(57);
        expect(parent.limits.maxEdgeVisits).toBe(10); expect(f.parentPlan.definition.limits.maxEdgeVisits).toBe(10);
        expect(child.limits.maxSteps).toBe(50); expect(child.limits.maxEdgeVisits).toBe(10);
        expect(parent.graph.outputContract.kind).toBe('rp_narration'); expect(child.graph.outputContract.kind).toBe('result');
        expect(child.status).toBe('completed'); expect(child.outputClaims).toHaveLength(1); expect(child.progress.edgeVisits).toBe(10);
        expect(parent.status).toBe('running'); expect(parent.outputClaims).toEqual([]); expect(parent.pendingEffectRefs).toEqual([]);
        expect(parent.progress).toMatchObject({ steps: 7, attempts: 1, edgeVisits: 0 });
        expect(parent.treeProgress).toMatchObject({ steps: 51, attempts: 9, edgeVisits: 10 });
        const failure = refused.find(row => row.runId === parent.runId);
        expect(failure).toMatchObject({ operation: 'loop.advance', code: 'native_orchestration_tree_limit_exhausted' });
        // A late deadline rejection cannot serve as ten-edge budget evidence.
        expect(failure.at).toBeLessThan(parent.treeProgress.deadlineAt);
        expect(transfers).toHaveLength(1); const [transfer] = transfers;
        expect(transfer.now).toBeLessThan(parent.treeProgress.deadlineAt);
        expect(transfer.beforeProgress.edgeVisits).toBe(0); expect(transfer.nextProgress.edgeVisits).toBe(1);
        expect(transfer.beforeTree.edgeVisits + transfer.nextProgress.edgeVisits - transfer.beforeProgress.edgeVisits).toBe(11);
        expect(transfer.beforeTree.steps + transfer.nextProgress.steps - transfer.beforeProgress.steps).toBe(52);
        const formal = parent.graph.edges.find(edge => edge.to.nodeId === parent.graph.outputContract.ownerNodeId);
        expect(transfer.traversal.bindings).toEqual([{ edgeId: formal.edgeId, producerAttemptId: child.parentRef.nodeAttemptId }]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect(await tx.getResource(controlRecordKey(f.h.handle, parent.runId, 'receipt', transfer.traversal.receiptId))).toBeNull();
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
        });
        expect(f.requests).toHaveLength(8);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(8); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(7);
        expect(bank.localWork).toHaveLength(46); expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(8); expect(await bankOf(f)).toEqual(bank);
    } finally { runs.control = control; await f.cleanup(); }
}, 180000);
