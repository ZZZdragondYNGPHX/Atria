import { modelPortFixture as fixture } from './helpers/model-port-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const id = kind => createNativeId('orchestration' + kind);

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_MODEL_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original ModelPort', ({ make }) => {
    test.each([true, false])('real native narrator response usage=%s is factual without a second result writer', async usage => {
        const f = await fixture(make, { usage });
        try {
            const originalObserve = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
            f.authority.execution.effects.observe = async (handle, input) => {
                const forged = { ...input.observation, observationId: 'forged-live-reference',
                    dispatchEvidence: { kind: 'original_port_observation', reference: { approved: true } } };
                await expect(originalObserve(handle, { ...input, observation: forged })).rejects.toThrow(/completion_proof_required/);
                return originalObserve(handle, input);
            };
            const result = await f.start(); expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            const saved = await f.observe();
            expect(saved).toMatchObject({ outcome: 'confirmed', observation: { reasonCode: 'generation_response_validated', remoteOperationRef: null, domainReceiptRef: null, resultRefs: [] } });
            expect(saved.observation.budgetObservationRef.attempts).toHaveLength(1);
            expect(saved.observation.budgetObservationRef.attempts[0].status).toBe(usage ? 'settled' : 'unknown');
            expect(JSON.stringify(saved)).not.toMatch(/Synthetic native narrator response|synthetic-model-secret/);
            expect(f.chunks.some(chunk => 'text' in chunk)).toBe(false);
            const replay = structuredClone(saved.observation); replay.observationId = 'copied-model-response';
            await expect(f.authority.execution.effects.observe(f.h.handle, { ...runGuard(await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId)),
                effectId: f.effectRef.effectId, observation: replay })).rejects.toThrow(/completion_proof_required/);
            await f.cold(); expect(await f.observe()).toEqual(saved); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('plain or JSON-copied scope and caller callback results cannot mint a response proof', async () => {
        const f = await fixture(make);
        try {
            await expect(f.port.generate(f.h.handle, {})).rejects.toThrow(); expect(f.requests).toHaveLength(0);
            await f.start();
            await expect(f.port.generate(f.h.handle, JSON.parse(JSON.stringify(f.scope)))).rejects.toThrow();
            await expect(f.port.generate(f.h.handle, f.scope)).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('instance execute override cannot substitute callback data for the original private Provider execution', async () => {
        const f = await fixture(make); let forged = 0;
        try {
            f.host.execute = async () => { forged++; return { response: { text: 'Caller supplied fake response' } }; };
            await f.start(); expect(forged).toBe(0); expect(f.requests).toHaveLength(1);
            expect((await f.observe()).outcome).toBe('confirmed');
        } finally { await f.cleanup(); }
    });

    test('invented native wire lease cannot send or persist a response fact', async () => {
        const f = await fixture(make);
        try {
            f.render(rendered => ({ ...rendered, leaseId: 'f'.repeat(64) }));
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown');
        } finally { await f.cleanup(); }
    });

    test('Provider failure cannot mint a response fact or authorize replay after cold reopen', async () => {
        const f = await fixture(make, { failure: true });
        try {
            await expect(f.start()).rejects.toThrow(); const sendCount = f.requests.length;
            expect(sendCount).toBeGreaterThan(0); expect((await f.observe()).outcome).toBe('unknown');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            const intent = await f.h.engine.withTransaction(f.h.handle, async tx => (await readEffect(tx, f.h.handle, root, f.effectRef.effectId)).doc);
            expect((await f.authority.execution.budgetPort.observeAttempt(f.h.handle, intent.budgetAttemptRef)).status).toBe('unknown');
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown');
            await expect(f.port.generate(f.h.handle, f.scope)).rejects.toThrow(); expect(f.requests).toHaveLength(sendCount);
        } finally { await f.cleanup(); }
    });

    test.each(['saved', 'no-save'])('%s Effect ACK loss never retries the original Provider send', async boundary => {
        const f = await fixture(make); let writes = 0;
        try {
            const original = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
            f.authority.execution.effects.observe = async (...args) => {
                f.captureEffect(args[1]);
                writes++; if (boundary === 'saved') await original(...args);
                throw new StorageCommitUnknownError(new Error('Synthetic Model receipt ACK loss'));
            };
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            const success = { status: 'fulfilled', value: { timeline: expect.any(Array) } };
            expect(result).toMatchObject(boundary === 'saved' ? success
                : { status: 'rejected', error: { code: 'storage_commit_unknown' } });
            expect(writes).toBe(1); expect(f.requests).toHaveLength(1);
            await f.cold(); expect((await f.observe()).outcome).toBe(boundary === 'saved' ? 'confirmed' : 'unknown');
        } finally { await f.cleanup(); }
    });

    test.each(['source', 'cancel', 'binding'])('%s changes while receipt is durable: historical fact survives and original consumer gets no body', async change => {
        const f = await fixture(make);
        try {
            const original = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
            f.authority.execution.effects.observe = async (...args) => {
                const ack = await original(...args);
                if (change === 'source') await f.core.appendTimeline(f.h.handle, f.input.sessionId, { role: 'user', content: 'Move source during Model receipt persistence' });
                else if (change === 'binding') await f.plans.saveBinding(f.h.handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
                else await f.authority.execution.runs.cancel(f.h.handle, id('Command'), {
                    ...runGuard(await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId)), reasonCode: 'cancel_after_model_response' });
                return ack;
            };
            await expect(f.start()).rejects.toThrow();
            expect((await f.core.observe(f.h.handle, f.input.sessionId)).timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(false);
            await f.cold(); expect((await f.observe()).outcome).toBe('confirmed'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('injected current unknown through original Host CAS cannot resurrect the older confirmed response receipt', async () => {
        const f = await fixture(make); let before;
        try {
            const original = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
            f.authority.execution.effects.observe = async (...args) => {
                const ack = await original(...args); before = await f.observe();
                // Explicit fault injection into the original Host/CAS. This is
                // not a fabricated second remote response or valid domain proof.
                const runs = f.authority.execution.runs;
                await runs.control(f.h.handle, id('Command'), { ...runGuard(await runs.get(f.h.handle, f.effectRef.runId)),
                    operation: 'effect.observe', detail: { fault: 'current_intent_unknown', effectId: f.effectRef.effectId } }, async ({ tx, root }) => {
                    const record = await readEffect(tx, f.h.handle, root, f.effectRef.effectId);
                    await putMutable(tx, controlRecordKey(f.h.handle, root.runId, 'effect', f.effectRef.effectId),
                        { ...record.doc, status: 'unknown' }, { expectedIntegrity: record.integrity });
                    root.status = 'reconciling'; root.pendingEffectRefs.push(f.effectRef.effectId);
                    return { root, eventType: 'effect_observed', reasonCode: 'fault_injected_current_unknown', outcome: { effectId: f.effectRef.effectId, status: 'unknown' } };
                });
                return ack;
            };
            await expect(f.start()).rejects.toThrow(/consume_denied/); expect(before.outcome).toBe('confirmed');
            expect((await f.observe()).outcome).toBe('unknown');
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
