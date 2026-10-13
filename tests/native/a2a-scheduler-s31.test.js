import { test, expect } from '@jest/globals';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { chargeLocalWork, settleLocalWork } from '../../public/shared/native-compute-budget.js';

test('S31 A2A protocol cost remains in the original budget after cancellation', () => {
    const holder = {}, limits = { maxRequests: 1, maxTokens: 128, localWork: { maxJobs: 1, maxItems: 4, maxInputBytes: 1024 } };
    const attempt = { attemptId: 'a2a-one', requestId: 'a2a-public', targetFingerprint: 'a'.repeat(64),
        kind: 'a2a_protocol', estimatedItems: 1, estimatedInputBytes: 32 };
    chargeLocalWork(holder, limits, attempt);
    settleLocalWork(holder, attempt.attemptId, { wallMs: 3, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'cancelled' });
    expect(holder.compute.localWork[0]).toMatchObject({ status: 'settled', kind: 'a2a_protocol', usage: { outcome: 'cancelled' } });
    expect(() => chargeLocalWork(holder, limits, { ...attempt, attemptId: 'a2a-two' })).toThrow('native_generation_budget_exhausted');
});

test.each([
    ['native_a2a_transport_unknown', 'native_a2a_transport_unknown'],
    ['native_a2a_private=https://secret.invalid', undefined],
    ['native_a2a_' + 'a'.repeat(101), undefined],
])('S31 Scheduler safely projects %s without replay', async (code, expectedCode) => {
    const scheduler = new NativeTaskScheduler(); let sends = 0;
    const operation = scheduler.submit({ owner: 'owner', kind: 'auxiliary_task', executionClass: 'interactive', retry: false,
        resources: ['provider:a2a'], key: 'public-a2a', fingerprint: 'a'.repeat(64), fresh: async () => true,
        run: async () => { sends++; throw Object.assign(new Error('private endpoint and transport diagnostic'), { code, outcome: 'unknown' }); },
        finalize: async value => value });
    await expect(operation.result).rejects.toMatchObject({ code, outcome: 'unknown' });
    expect(sends).toBe(1);
    const view = scheduler.project('owner', operation.operationId);
    expect(view).toMatchObject({ status: 'failed', attempt: 0 });
    expect(view.errorCode).toBe(expectedCode);
    expect(JSON.stringify(view)).not.toContain('private');
});
