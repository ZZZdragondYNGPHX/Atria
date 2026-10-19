import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFanoutPlannerFixture, sessionScopeTask } from './helpers/session-fanout-planner-fixture.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';

test.each(CONTRACT_HARNESSES)('$name Game branch-local replan preserves reserved DAG, sibling and cold output', async ({ make }) => {
    const f = await sessionFanoutPlannerFixture(make, { replan: true });
    let reserved;
    f.onResponse(async () => {
        if (sessionScopeTask(f.requests.at(-1))?.nodeId !== f.topology.planner.nodeId || reserved) return;
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        reserved = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const rows = await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)));
            return rows.map(row => row.doc).filter(row => [f.topology.first.nodeId, f.topology.preferred.nodeId, f.topology.merge.nodeId].includes(row.nodeId));
        });
    });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
        expect(root.progress.loopIterations).toBe(1); expect(root.progress.replans).toBe(1); expect(root.graphRevision).toBe(2);
        expect(f.requests).toHaveLength(7);
        const counts = node => f.requests.filter(body => sessionScopeTask(body)?.nodeId === node.nodeId).length;
        expect(counts(f.topology.planner)).toBe(2); expect(counts(f.topology.sibling)).toBe(1);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        const attempts = await f.h.engine.withTransaction(f.h.handle, tx => Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id))));
        expect(reserved).toHaveLength(3);
        for (const prior of reserved) {
            expect(prior.status).toBe('reserved');
            const current = attempts.filter(row => row.doc.nodeId === prior.nodeId);
            expect(current).toHaveLength(1); expect(current[0].doc.attemptId).toBe(prior.attemptId);
            expect(current[0].doc.reservationRef).toEqual(prior.reservationRef);
        }
        expect(proof.published.plannerCompletions).toHaveLength(2); expect(proof.published.fanoutCompletions).toHaveLength(1);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(7); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        await f.cold();
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(7);
    } finally { await f.cleanup(); }
}, 180000);
