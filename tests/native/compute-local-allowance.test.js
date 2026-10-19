import { assertComputeBudget, assertComputeLedger, bindComputeBudget, chargeLocalWork, settleLocalWork,
    reserveComputeChild, releaseComputeChild, inspectComputeReservation, retireComputeLedger } from '../../public/shared/native-compute-budget.js';

// Reducer facts only. Explicit synthetic usage is not actual CPU/Provider work.
const limits = { maxRequests: 2, maxTokens: 1000, localWork: { maxJobs: 48, maxItems: 100, maxInputBytes: 10000 } };
const work = id => ({ attemptId: 'local-' + id, requestId: 'request-' + id, targetFingerprint: 'c'.repeat(64),
    kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10 });
const usage = { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' };

test('owner-declared work beyond 32 survives serialization, unknown settlement and tightening without losing earlier costs', () => {
    const holder = {};
    for (let index = 0; index < 40; index++) {
        const row = chargeLocalWork(holder, limits, work(index));
        settleLocalWork(holder, row.attemptId, index === 39 ? null : usage);
    }
    const restored = { compute: assertComputeLedger(JSON.parse(JSON.stringify(holder.compute))) };
    expect(restored.compute.localWork).toHaveLength(40); expect(restored.compute.localWork.at(-1).status).toBe('unknown');
    bindComputeBudget(restored, { ...limits, localWork: { ...limits.localWork, maxJobs: 32 } });
    expect(inspectComputeReservation(restored)).toMatchObject({ used: { jobs: 40 }, remaining: { jobs: 0 }, overrun: true });
    const before = structuredClone(restored);
    expect(() => chargeLocalWork(restored, limits, work(40))).toThrow('native_generation_budget_exhausted');
    expect(restored).toEqual(before);
    settleLocalWork(restored, 'local-39', usage);
    expect(restored.compute.localWork).toHaveLength(40);
    expect(retireComputeLedger(null, restored.compute)).toMatchObject({ localJobs: 40, localCompletedJobs: 40 });
});

test('a larger later declaration does not raise an already bound original allowance', () => {
    const holder = {}, original = { ...limits, localWork: { ...limits.localWork, maxJobs: 32 } };
    for (let index = 0; index < 32; index++) {
        const row = chargeLocalWork(holder, original, work(index)); settleLocalWork(holder, row.attemptId, usage);
    }
    const before = structuredClone(holder);
    expect(() => chargeLocalWork(holder, limits, work(32))).toThrow('native_generation_budget_exhausted');
    expect(holder).toEqual(before); expect(holder.compute.limits.localWork.maxJobs).toBe(32);
});

test('large child allocations share the original parent capacity, keep unknown work occupied and release only unused allowance', () => {
    const holder = {}, allocate = (reservationId, jobs) => ({ reservationId, parentReservationId: null, consumerId: 'run-' + reservationId,
        limits: { maxRequests: 0, maxTokens: 0, localWork: { maxJobs: jobs, maxItems: jobs, maxInputBytes: jobs * 10 } } });
    reserveComputeChild(holder, limits, allocate('A', 40)); reserveComputeChild(holder, limits, allocate('B', 8));
    for (let index = 0; index < 40; index++) {
        const row = chargeLocalWork(holder, limits, work(index), { reservationId: 'A' });
        settleLocalWork(holder, row.attemptId, index === 39 ? null : usage);
    }
    expect(() => releaseComputeChild(holder, 'A')).toThrow('native_generation_reservation_unsettled');
    expect(inspectComputeReservation(holder)).toMatchObject({ used: { jobs: 40 }, delegated: { jobs: 8 }, remaining: { jobs: 0 } });
    expect(() => chargeLocalWork(holder, limits, work('root'))).toThrow('native_generation_budget_exhausted');
    settleLocalWork(holder, 'local-39', usage); releaseComputeChild(holder, 'A'); releaseComputeChild(holder, 'B');
    for (let index = 40; index < 48; index++) {
        const row = chargeLocalWork(holder, limits, work(index)); settleLocalWork(holder, row.attemptId, usage);
    }
    expect(inspectComputeReservation(holder)).toMatchObject({ used: { jobs: 48 }, delegated: { jobs: 0 }, remaining: { jobs: 0 } });
    const before = structuredClone(holder);
    expect(() => chargeLocalWork(holder, limits, work(48))).toThrow('native_generation_budget_exhausted'); expect(holder).toEqual(before);
});

test('a large jobs allowance cannot bypass the original item and input-byte admission', () => {
    const declared = { ...limits, localWork: { maxJobs: Number.MAX_SAFE_INTEGER, maxItems: 1, maxInputBytes: 10 } }, holder = {};
    expect(assertComputeBudget(declared)).toEqual(declared);
    const first = chargeLocalWork(holder, declared, work(0)); settleLocalWork(holder, first.attemptId, usage);
    const before = structuredClone(holder);
    expect(() => chargeLocalWork(holder, declared, work(1))).toThrow('native_generation_budget_exhausted'); expect(holder).toEqual(before);
});

test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('invalid owner jobs value %s cannot bind a bank', maxJobs => {
    expect(() => assertComputeBudget({ ...limits, localWork: { ...limits.localWork, maxJobs } })).toThrow('native_generation_budget_invalid');
});
