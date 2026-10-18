import { expect, test } from '@jest/globals';
import { sessionReplanFixture, sessionReplanTask } from './helpers/session-replan-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { controlRecordKey, readAttempt, readAttemptInvalidation } from '../../src/native/orchestration/controller-common.js';
import { readModelCompletionReceipt } from '../../src/native/orchestration/model-port.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { readTaskGraphRevision } from '../../src/native/orchestration/graph-revision-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

function assertOriginalBudgetDenial(rejected) {
    expect(rejected.patches).toHaveLength(1); expect(rejected.patches[0].accepted).toBe(false);
    expect(rejected.patches[0].issues).toEqual([{ code: 'native_orchestration_graph_budget_unavailable' }]);
}
function assertCanonicalNoProgress(f, rejected, bank) {
    expect(f.responseTexts[0]).not.toBe(f.responseTexts[1]); expect(JSON.parse(f.responseTexts[0])).toEqual(JSON.parse(f.responseTexts[1]));
    expect(rejected.modelHashes).toEqual(f.responseTexts.map(hash)); expect(rejected.patches).toHaveLength(1); expect(rejected.patches[0].accepted).toBe(true);
    const secondEffect = rejected.planners[1].effectRefs[0], work = bank.localWork.filter(row => row.orchestration?.effectId === secondEffect);
    expect(work.filter(row => row.kind === 'graph_control_parse').map(row => row.usage.outcome)).toEqual(['failed']);
    expect(work.some(row => row.kind === 'graph_control_adopt')).toBe(false);
}

test.each([true, false])('SQLite Game published bounded replan return to self=%s drives original fresh Attempts and current final evidence', async self => {
    const f = await sessionReplanFixture(makeTempSqliteEngineHarness, { self });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), count = self ? 3 : 5;
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(root.graphRevision).toBe(2);
        expect(root.progress.replans).toBe(1); expect(root.progress.loopIterations).toBe(1); expect(root.progress.edgeVisitCounts[f.topology.back.edgeId]).toBe(1);
        expect(f.requests).toHaveLength(count); expect(new Set(f.requests.map(body => body.model)).size).toBe(2);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.plannerCompletions).toHaveLength(2); expect(proof.closure.effectIds).toHaveLength(count + 1);
        expect(proof.published.plannerCompletions.map(item => item.patch.requests.replan)).toEqual([true, false]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            for (const fact of [...proof.published.graphResults, ...proof.published.plannerCompletions])
                expect(await readAttemptInvalidation(tx, f.h.handle, root, fact.producer)).toBeNull();
        });
        expect(proof.published.graphResults).toHaveLength(self ? 0 : 2);
        expect(JSON.stringify(f.requests.at(-1).input).includes('CURRENT_ACTOR_ADVICE_2')).toBe(!self);
        expect(JSON.stringify(f.requests.at(-1).input)).not.toContain('CURRENT_ACTOR_ADVICE_1');
        for (const body of f.requests.slice(0, -1)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(f.requests.filter(body => sessionReplanTask(body)?.nodeId === f.topology.planner.nodeId)).toHaveLength(2);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(count); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', 'oreceipt_' + proof.published.loopHistory.current.get(self ? f.topology.planner.nodeId : f.topology.advisory.nodeId).producer.attemptId.slice('oattempt_'.length));
            const row = await tx.getResource(key); expect(row.doc.receiptKind).toBe('graph_transition');
            const changed = { ...row.doc, loopIterations: row.doc.loopIterations + 1 };
            try { await tx.putResource(key, { ...row, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, row); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 180000);

test.each([['same original bank headroom', { maxRequests: 4 }, 2, 'native_orchestration_planner_patch_rejected'],
    ['canonical repeated request', { self: true, repeat: true, maxRequests: 4 }, 2, 'generation_execution_failed'],
    ['authored edge visit limit', { self: true, exhaustLoop: true, maxRequests: 4 }, 2, 'native_orchestration_edge_limit_exhausted']])('Game bounded replan %s retains exact paid history without another dispatch or Output', async (_name, options, sends, reason) => {
    const f = await sessionReplanFixture(makeTempSqliteEngineHarness, options);
    try {
        await expect(f.start()).rejects.toThrow(reason); expect(f.requests).toHaveLength(sends);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('blocked'); expect(root.pendingEffectRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
        expect(root.graphRevision).toBe(options.exhaustLoop ? 2 : options.self ? 1 : 0);
        expect(root.progress.loopIterations).toBe(options.self ? 1 : 0);
        expect(root.progress.replans).toBe(options.exhaustLoop ? 2 : options.self ? 1 : 0);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(sends); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        const rejected = await f.h.engine.withTransaction(f.h.handle, async tx => {
            await readTaskGraphRevision(tx, f.h.handle, root);
            const patches = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'patch' });
            const planners = [];
            for (const attemptId of root.attemptRefs) {
                const { doc: attempt } = await readAttempt(tx, f.h.handle, root, attemptId);
                if (attempt.nodeId === f.topology.planner.nodeId) planners.push(attempt);
            }
            const modelHashes = [];
            for (const attempt of planners.sort((a, b) => a.attemptNumber - b.attemptNumber)) {
                const intent = (await readEffect(tx, f.h.handle, root, attempt.effectRefs[0])).doc;
                const model = await readModelCompletionReceipt(f.h.handle, tx, root, intent);
                modelHashes.push(model.observation.dispatchEvidence.reference.resultPayloadHash);
            }
            return { patches: patches.map(row => row.doc), planners, modelHashes };
        });
        if (!options.self) assertOriginalBudgetDenial(rejected);
        if (options.repeat) assertCanonicalNoProgress(f, rejected, bank);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).toBeNull();
    } finally { await f.cleanup(); }
}, 120000);

test('Game Source withdrawn during the returned Actor Attempt retains accepted replan and all real paid facts', async () => {
    const f = await sessionReplanFixture(makeTempSqliteEngineHarness);
    f.onResponse(async () => { if (f.requests.length === 3) await f.core.appendTimeline(f.h.handle, f.base.session.sessionId,
        { role: 'user', content: 'Withdraw the Source during the real returned Actor task.' }); });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('blocked'); expect(root.graphRevision).toBe(1); expect(root.progress.loopIterations).toBe(1); expect(root.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline.at(-1).content).toBe('Withdraw the Source during the real returned Actor task.');
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 120000);

test('Game unknown returned Actor send retains the original unresolved bank and never retries or publishes', async () => {
    const f = await sessionReplanFixture(makeTempSqliteEngineHarness, { unknownAt: 3 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('reconciling'); expect(root.graphRevision).toBe(1); expect(root.progress.loopIterations).toBe(1); expect(root.pendingEffectRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(3); expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(1);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 120000);
