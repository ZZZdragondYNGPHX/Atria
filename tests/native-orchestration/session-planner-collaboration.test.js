import { expect, test } from '@jest/globals';
import { sessionFanoutFixture } from './helpers/session-fanout-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readSessionPlannerCompletion } from '../../src/native/orchestration/session-planner-contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';

// Original Host/Source/Controllers/HTTP permits/Turn bank/Output writer are real;
// synthetic localhost model bodies prove mechanism, not remote model quality.
test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness], ...CONTRACT_HARNESSES.filter(item => ['MysqlEngine', 'PgEngine'].includes(item.name)).map(item => [item.name, item.make])])('%s Game Planner adds a source-bound Agent DAG branch and composes original Fanout/Join/Review', async (_name, make) => {
    const f = await sessionFanoutFixture(make, { planner: true, review: true });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(root.progress.patches).toBe(1);
        expect(root.graph.nodes).toContainEqual(f.topology.added); expect(root.nodeControl[f.topology.added.nodeId].priority).toBe(7);
        expect(f.requests).toHaveLength(8); expect(f.requests[0].model).toBe('session-planner-distinct-model');
        expect(f.requests.slice(1).every(body => body.model !== f.requests[0].model)).toBe(true);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.plannerCompletions).toHaveLength(1); expect(proof.published.fanoutCompletions).toHaveLength(1);
        expect(proof.published.reviewCompletions).toHaveLength(1); expect(proof.closure.effectIds).toHaveLength(9); expect(root.outputClaims).toHaveLength(1);
        expect(proof.published.plannerCompletions[0].receipt.localWork.map(row => row.kind)).toEqual(['graph_control_parse', 'graph_control_adopt']);
        const dynamic = f.requests.find(body => JSON.stringify(body.input).includes('Game dynamic advisory after accepted'));
        expect(dynamic).toBeTruthy(); expect(JSON.stringify(dynamic.input)).toContain('阿岚听说'); expect(JSON.stringify(dynamic.input)).not.toContain('沈墨怀疑');
        expect(f.requests.some(body => JSON.stringify(body.input).includes('GAME_DYNAMIC_ADVICE'))).toBe(true);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(bank.compute.attempts).toHaveLength(8); expect(bank.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        const saved = await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold));
        expect(saved.receipt).toEqual(proof.receipt); expect(f.requests).toHaveLength(8);
    } finally { await f.cleanup(); }
}, 240000);

test.each(['invalid_patch', 'same_bank_exhausted', 'source_withdrawn'])('Game Planner %s preserves paid facts and never reaches Narrator or domain output', async kind => {
    const f = await sessionFanoutFixture(makeTempFsEngineHarness, { planner: true, review: true,
        ...(kind === 'same_bank_exhausted' ? { maxRequests: 2 } : {}),
        ...(kind === 'invalid_patch' ? { plannerPatch: operations => [{ ...operations[0], node: { ...operations[0].node, capabilities: ['generation.send', 'graph.patch'] } }, ...operations.slice(1)] } : {}) });
    if (kind === 'source_withdrawn') f.onResponse(async () => { await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw original Source during Planner send.' }); });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.outputClaims).toEqual([]); expect(root.graphRevision).toBe(0);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(bank.compute.attempts).toHaveLength(1); expect(bank.compute.attempts[0].status).toBe('settled');
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId); expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(current.timeline.filter(item => item.role === 'assistant')).toEqual(f.base.timeline.filter(item => item.role === 'assistant'));
        const count = f.requests.length; await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 120000);

test('Game composed Review redoes only its pure draft after accepted Planner and settled Fanout', async () => {
    const f = await sessionFanoutFixture(makeTempFsEngineHarness, { planner: true, review: true, reviewRerunOnce: true });
    try {
        await f.start(); const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(root.progress.patches).toBe(1);
        expect(root.progress.reviews).toBe(2); expect(f.requests).toHaveLength(10); expect(root.outputClaims).toHaveLength(1);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.plannerCompletions).toHaveLength(1); expect(proof.published.fanoutCompletions).toHaveLength(1);
        expect(proof.published.reviewCompletions.map(item => item.review.decision)).toEqual(['rerun', 'approve']);
        expect(proof.closure.effectIds).toHaveLength(11);
        expect(f.requests.filter(body => body.model === 'session-planner-distinct-model')).toHaveLength(1);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(bank.compute.attempts).toHaveLength(10); expect(bank.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(10);
    } finally { await f.cleanup(); }
}, 300000);

test('Game Planner accepted GraphPatch with lost acknowledgement retains the patch and paid Model without resending', async () => {
    const f = await sessionFanoutFixture(makeTempFsEngineHarness, { planner: true, review: true });
    const runs = f.authority.execution.runs, control = runs.control.bind(runs); let lost = false;
    runs.control = async (...args) => {
        const result = await control(...args);
        if (!lost && args[2].operation === 'graph.patch' && result.outcome.patchReceipt.accepted) {
            lost = true; throw Object.assign(new Error('Synthetic acknowledgement loss after original Graph writer committed'), { code: 'storage_commit_unknown' });
        }
        return result;
    };
    try {
        await expect(f.start()).rejects.toThrow(); expect(lost).toBe(true); expect(f.requests).toHaveLength(1);
        const root = await runs.get(f.h.handle, f.effectRef.runId); expect(root.graphRevision).toBe(1); expect(root.outputClaims).toEqual([]);
        expect(root.status).toBe('blocked'); expect(root.graph.nodes).toContainEqual(f.topology.added);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(bank.compute.attempts).toHaveLength(1); expect(bank.compute.attempts[0].status).toBe('settled');
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect(cold.graph).toEqual(root.graph); expect(cold.status).toBe('blocked'); expect(cold.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
    } finally { await f.cleanup(); }
}, 120000);

test('Game dynamic model loses its original Source after accepted Planner patch and retains both paid sends', async () => {
    const f = await sessionFanoutFixture(makeTempFsEngineHarness, { planner: true, review: true }); let withdrawn = false;
    f.onResponse(async () => {
        if (f.requests.length !== 2) return;
        expect(JSON.stringify(f.requests[1].input)).toContain('Game dynamic advisory after accepted'); withdrawn = true;
        await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw Source during the newly added Agent.' });
    });
    try {
        await expect(f.start()).rejects.toThrow(); expect(withdrawn).toBe(true); expect(f.requests).toHaveLength(2);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.graphRevision).toBe(1); expect(root.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(bank.compute.attempts).toHaveLength(2); expect(bank.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline.at(-1).content).toBe('Withdraw Source during the newly added Agent.');
        expect(current.timeline.filter(item => item.role === 'assistant')).toEqual(f.base.timeline.filter(item => item.role === 'assistant'));
        expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
    } finally { await f.cleanup(); }
}, 120000);

test('Session Planner reader rejects replacing the original bank verifier', () => {
    expect(() => readSessionPlannerCompletion(null, null, null, null, { verifyControlWork: async () => {} })).toThrow('Session Planner read');
});
