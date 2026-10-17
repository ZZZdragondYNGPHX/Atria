import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readAttemptSettlement } from '../../src/native/orchestration/attempt-settlement.js';

describe.each(CONTRACT_HARNESSES)('$name unsent RP failure', ({ make }) => {
    test('adapter budget failure settles without a send or output', async () => {
        const f = await rpModelFixture(make, { configurePlan: async (_plan, { h, seeded }) => {
            await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, outputTokens: 1 } });
        } });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_adapter_output_budget' });
            expect(f.requests).toEqual([]);
            const { runId, effectId } = f.effects[0], root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.status).toBe('failed'); expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs).toEqual([]);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const intent = (await readEffect(tx, f.h.handle, root, effectId)).doc;
                expect(intent.status).toBe('not_dispatched'); expect(intent.budgetAttemptRef).toBeNull();
                const attempt = (await readAttempt(tx, f.h.handle, root, intent.nodeAttemptId)).doc;
                expect(attempt.status).toBe('failed');
                expect(await readAttemptSettlement(tx, f.h.handle, root, attempt)).toMatchObject({ outcome: 'failed', reasonCode: 'generation_adapter_output_budget' });
            });
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0]?.compute;
            expect(bank?.attempts ?? []).toEqual([]); expect((bank?.localWork ?? []).every(row => row.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);
});
