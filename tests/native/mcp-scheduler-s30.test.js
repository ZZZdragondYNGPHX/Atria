import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { chargeLocalWork, settleLocalWork } from '../../public/shared/native-compute-budget.js';

test('S30 protocol work occupies the original local budget and cancelled cost is never refunded', () => {
    const holder = {}, limits = { maxRequests: 1, maxTokens: 128, localWork: { maxJobs: 1, maxItems: 4, maxInputBytes: 1024 } };
    const attempt = { attemptId: 'mcp-one', requestId: 'mcp-public', targetFingerprint: 'a'.repeat(64),
        kind: 'mcp_protocol', estimatedItems: 1, estimatedInputBytes: 32 };
    chargeLocalWork(holder, limits, attempt);
    settleLocalWork(holder, attempt.attemptId, { wallMs: 3, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'cancelled' });
    expect(holder.compute.localWork[0]).toMatchObject({ status: 'settled', kind: 'mcp_protocol', usage: { outcome: 'cancelled' } });
    expect(() => chargeLocalWork(holder, limits, { ...attempt, attemptId: 'mcp-two' })).toThrow('native_generation_budget_exhausted');
});

test('S30 original Scheduler exposes only the typed MCP failure and never retries an unknown remote result', async () => {
    const scheduler = new NativeTaskScheduler(); let sends = 0;
    const operation = scheduler.submit({ owner: 'owner', kind: 'auxiliary_task', executionClass: 'interactive', retry: false,
        resources: ['provider:mcp'], key: 'public-mcp', fingerprint: 'a'.repeat(64), fresh: async () => true,
        run: async () => { sends++; throw Object.assign(new Error('private endpoint and transport diagnostic'),
            { code: 'native_mcp_remote_unknown', outcome: 'unknown' }); }, finalize: async value => value });
    await expect(operation.result).rejects.toMatchObject({ code: 'native_mcp_remote_unknown', outcome: 'unknown' });
    expect(sends).toBe(1);
    const view = scheduler.project('owner', operation.operationId);
    expect(view).toMatchObject({ status: 'failed', errorCode: 'native_mcp_remote_unknown', attempt: 0 });
    expect(JSON.stringify(view)).not.toContain('private endpoint');
});
