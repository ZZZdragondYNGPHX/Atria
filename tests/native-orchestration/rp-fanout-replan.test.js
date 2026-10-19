import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpComposableFanoutFixture } from './helpers/rp-composable-fanout-fixture.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

jest.setTimeout(180000);

test.each(CONTRACT_HARNESSES)('$name RP branch-local replan preserves reserved terminal, sibling and cold output', async ({ make }) => {
    const f = await rpComposableFanoutFixture(make, { withPlanner: false, quality: false, scopePlanner: true, scopeReplan: true });
    let reserved, cold;
    f.onResponse(async body => {
        if (body.model !== 'fanout-branch-a' || reserved) return;
        const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        reserved = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const rows = await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)));
            return rows.find(row => row.doc.nodeId === f.nodes.a2.nodeId).doc;
        });
    });
    try {
        const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
        expect(root.progress.loopIterations).toBe(1); expect(root.progress.replans).toBe(1); expect(root.graphRevision).toBe(2);
        expect(f.requests).toHaveLength(6);
        expect(f.requests.filter(body => body.model === 'fanout-branch-a')).toHaveLength(2);
        expect(f.requests.filter(body => body.model === 'fanout-branch-a-next')).toHaveLength(1);
        expect(f.requests.filter(body => body.model === 'fanout-branch-b')).toHaveLength(1);
        expect(reserved.status).toBe('reserved');
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
        const attempts = await f.h.engine.withTransaction(f.h.handle, tx => Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id))));
        const terminal = attempts.filter(row => row.doc.nodeId === f.nodes.a2.nodeId);
        expect(terminal).toHaveLength(1); expect(terminal[0].doc.attemptId).toBe(reserved.attemptId);
        expect(terminal[0].doc.reservationRef).toEqual(reserved.reservationRef);
        expect(proof.published.plannerCompletions).toHaveLength(2);
        expect(proof.published.fanoutCompletions).toHaveLength(1);
        const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
        expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        await f.h.engine.close();
        cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
        attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
        expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(proof.claim);
        expect(f.requests).toHaveLength(6);
    } finally { await cold?.close(); await f.cleanup(); }
});
