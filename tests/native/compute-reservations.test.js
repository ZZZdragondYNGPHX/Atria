import {
    assertComputeLedger, bindComputeBudget, chargeComputeAttempt, admitComputeAttempt, chargeLocalWork, settleComputeAttempt, settleLocalWork,
    reserveComputeChild, releaseComputeChild, inspectComputeReservation, hasOpenComputeReservations, retireComputeLedger,
} from '../../public/shared/native-compute-budget.js';

// Original Native bank reducers only. Counts/usage are explicit test data,
// never evidence of actual Provider billing or an authorized external send.
const limits = { maxRequests: 10, maxTokens: 1000, localWork: { maxJobs: 10, maxItems: 100, maxInputBytes: 10000 } };
const child = (reservationId, maxRequests = 3, maxTokens = 300, parentReservationId = null) => ({ reservationId, parentReservationId, consumerId: 'run-' + reservationId, limits: { maxRequests, maxTokens } });
const model = (attemptId = 'send-1', estimatedTokens = 100) => ({ attemptId, requestId: 'request-' + attemptId, targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens });
const local = () => ({ attemptId: 'local-1', requestId: 'local-request', targetFingerprint: 'c'.repeat(64), kind: 'context_build', estimatedItems: 2, estimatedInputBytes: 100 });
const localUsage = { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'cancelled' };

test('nested capacity is transferred inside the original bank without duplicating ancestor charges', () => {
    const holder = {};
    reserveComputeChild(holder, limits, child('A', 6, 600)); reserveComputeChild(holder, limits, child('B', 4, 400));
    reserveComputeChild(holder, limits, child('C', 3, 300, 'A'));
    expect(holder.compute.attempts).toHaveLength(0);
    expect(inspectComputeReservation(holder)).toMatchObject({ used: { requests: 0, tokens: 0 }, delegated: { requests: 10, tokens: 1000 }, remaining: { requests: 0, tokens: 0 } });
    chargeComputeAttempt(holder, limits, model('send-1', 200), { reservationId: 'C' });
    expect(holder.compute.attempts).toHaveLength(1);
    expect(inspectComputeReservation(holder)).toMatchObject({ used: { requests: 1, tokens: 200 }, delegated: { requests: 9, tokens: 800 }, remaining: { requests: 0, tokens: 0 } });
    expect(inspectComputeReservation(holder, 'A')).toMatchObject({ used: { requests: 1, tokens: 200 }, delegated: { requests: 2, tokens: 100 }, remaining: { requests: 3, tokens: 300 } });
});

test('competing allocations and root work cannot steal held child capacity or partially mutate the holder', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A', 8, 800)); const before = structuredClone(holder);
    expect(() => reserveComputeChild(holder, limits, child('B', 3, 300))).toThrow('budget_exhausted'); expect(holder).toEqual(before);
    expect(() => chargeComputeAttempt(holder, limits, model('root', 201))).toThrow('budget_exhausted'); expect(holder).toEqual(before);
    reserveComputeChild(holder, limits, child('B', 2, 200));
    expect(() => chargeComputeAttempt(holder, limits, model('root'))).toThrow('budget_exhausted');
});

test('a child cannot consume its grandchild envelope while the leaf can use exactly its original transfer', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A', 2, 200)); reserveComputeChild(holder, limits, child('C', 2, 200, 'A'));
    const before = structuredClone(holder);
    expect(() => chargeComputeAttempt(holder, limits, model('parent'), { reservationId: 'A' })).toThrow('budget_exhausted'); expect(holder).toEqual(before);
    chargeComputeAttempt(holder, limits, model('leaf', 200), { reservationId: 'C' });
    expect(inspectComputeReservation(holder, 'C').used.tokens).toBe(200);
});

test('stable admission binds the original input/target/reservation and a replay is no new send permission', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A'));
    expect(admitComputeAttempt(holder, limits, model(), { reservationId: 'A' }).replayed).toBe(false);
    const before = structuredClone(holder);
    expect(admitComputeAttempt(holder, limits, model(), { reservationId: 'A' }).replayed).toBe(true); expect(holder).toEqual(before);
    for (const change of [{ inputFingerprint: 'd'.repeat(64) }, { targetFingerprint: 'e'.repeat(64) }, { estimatedTokens: 90 }, { requestId: 'other' }, { rawPayload: 'rejected' }]) {
        expect(() => admitComputeAttempt(holder, limits, { ...model(), ...change }, { reservationId: 'A' })).toThrow(); expect(holder).toEqual(before);
    }
    expect(() => admitComputeAttempt(holder, limits, model())).toThrow('attempt_conflict');
});

test('unknown spend retains its upper bound and cannot be released until an actual observation is known', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A', 10, 1000));
    chargeComputeAttempt(holder, limits, model('send-1', 400), { reservationId: 'A' }); settleComputeAttempt(holder, 'send-1', null);
    expect(inspectComputeReservation(holder).used).toMatchObject({ requests: 1, tokens: 400 });
    expect(() => releaseComputeChild(holder, 'A')).toThrow('reservation_unsettled');
    expect(() => chargeComputeAttempt(holder, limits, model('root'))).toThrow('budget_exhausted');
    settleComputeAttempt(holder, 'send-1', { totalTokens: 150 });
    expect(inspectComputeReservation(holder, 'A').remaining).toMatchObject({ requests: 9, tokens: 850 });
    releaseComputeChild(holder, 'A');
    expect(inspectComputeReservation(holder)).toMatchObject({ used: { requests: 1, tokens: 150 }, delegated: { requests: 0, tokens: 0 }, remaining: { requests: 9, tokens: 850 } });
    expect(holder.compute.attempts).toHaveLength(1); expect(holder.compute.attempts[0].usage.totalTokens).toBe(150);
});

test('known overrun is recorded exactly and blocks new admission without clipping the observation', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A', 1, 100));
    chargeComputeAttempt(holder, limits, model(), { reservationId: 'A' }); settleComputeAttempt(holder, 'send-1', { totalTokens: 250 });
    expect(inspectComputeReservation(holder, 'A').overrun).toBe(true); expect(holder.compute.attempts[0].usage.totalTokens).toBe(250);
    releaseComputeChild(holder, 'A'); expect(() => chargeComputeAttempt(holder, limits, model('root'))).toThrow('budget_exhausted');
    expect(inspectComputeReservation(holder).overrun).toBe(true);
    expect(holder.compute.attempts).toHaveLength(1);
});

test('local-only children reserve no fictitious model requests and share the original local-work lane', () => {
    const holder = {}, allocation = { ...child('local', 0, 0), limits: { maxRequests: 0, maxTokens: 0, localWork: { maxJobs: 1, maxItems: 2, maxInputBytes: 100 } } };
    reserveComputeChild(holder, limits, allocation);
    expect(inspectComputeReservation(holder).delegated.requests).toBe(0);
    chargeLocalWork(holder, limits, local(), { reservationId: 'local' });
    expect(holder.compute.attempts).toHaveLength(0); expect(holder.compute.localWork).toHaveLength(1);
    expect(() => releaseComputeChild(holder, 'local')).toThrow('reservation_unsettled');
    settleLocalWork(holder, 'local-1', localUsage); releaseComputeChild(holder, 'local');
    expect(inspectComputeReservation(holder).used).toMatchObject({ requests: 0, tokens: 0, jobs: 1, items: 2, inputBytes: 100 });
});

test('a parent cannot release held descendants; release order preserves old identities and no-charge history', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A')); reserveComputeChild(holder, limits, child('C', 1, 100, 'A'));
    expect(() => releaseComputeChild(holder, 'A')).toThrow('reservation_unsettled');
    releaseComputeChild(holder, 'C'); releaseComputeChild(holder, 'A');
    expect(releaseComputeChild(holder, 'A').replayed).toBe(true);
    expect(reserveComputeChild(holder, limits, child('A'))).toMatchObject({ replayed: true, reservation: { status: 'released' } });
    expect(() => chargeComputeAttempt(holder, limits, model(), { reservationId: 'A' })).toThrow('attempt_conflict');
    expect(holder.compute.reservations).toHaveLength(2); expect(inspectComputeReservation(holder).remaining.tokens).toBe(1000);
});

test('tightened root limits invalidate further allocation, while old capacity records remain readable', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A', 5, 500));
    bindComputeBudget(holder, { maxRequests: 2, maxTokens: 200 }); expect(assertComputeLedger(holder.compute)).toBe(holder.compute);
    expect(inspectComputeReservation(holder).overrun).toBe(true); const before = structuredClone(holder);
    expect(() => chargeComputeAttempt(holder, limits, model(), { reservationId: 'A' })).toThrow('budget_exhausted'); expect(holder).toEqual(before);
});

test('required narration headroom is checked alongside delegated capacity in the same original bank', () => {
    const holder = {}, cap = { maxRequests: 4, maxTokens: 400 }; reserveComputeChild(holder, cap, child('A', 2, 200));
    const before = structuredClone(holder);
    expect(() => chargeComputeAttempt(holder, cap, model(), { reserve: { maxRequests: 2, maxTokens: 200 } })).toThrow('required_budget_reserved'); expect(holder).toEqual(before);
    chargeComputeAttempt(holder, cap, model(), { reserve: { maxRequests: 1, maxTokens: 100 } });
    expect(inspectComputeReservation(holder).remaining).toMatchObject({ requests: 1, tokens: 100 });
});

test('malformed/cyclic/missing reservation references fail closed, with no partial allocation on refusal', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A')); const before = structuredClone(holder);
    for (const change of [{ consumerId: 'other' }, { parentReservationId: 'missing' }, { limits: { maxRequests: 2, maxTokens: 200 } }]) {
        expect(() => reserveComputeChild(holder, limits, { ...child('A'), ...change })).toThrow('attempt_conflict'); expect(holder).toEqual(before);
    }
    expect(() => reserveComputeChild(holder, limits, child('C', 4, 400, 'A'))).toThrow(); expect(holder).toEqual(before);
    const invalid = structuredClone(holder.compute); invalid.reservations[0].parentReservationId = 'A'; expect(() => assertComputeLedger(invalid)).toThrow();
    expect(() => assertComputeLedger({ ...holder.compute, reservations: null })).toThrow();
    expect(() => chargeComputeAttempt(holder, limits, model(), { reservationId: 'missing' })).toThrow(); expect(holder).toEqual(before);
});

test('an open reservation cannot be compacted out of the original compute authority', () => {
    const holder = {}; reserveComputeChild(holder, limits, child('A'));
    expect(hasOpenComputeReservations(holder.compute)).toBe(true); expect(() => retireComputeLedger(null, holder.compute)).toThrow('attempt_conflict');
    releaseComputeChild(holder, 'A'); expect(hasOpenComputeReservations(holder.compute)).toBe(false);
    expect(retireComputeLedger(null, holder.compute).modelAttempts).toBe(0);
});

test('missing local budget is never an unmetered fallback for a child reservation', () => {
    const holder = {}; expect(chargeLocalWork(holder, undefined, null)).toBeNull();
    expect(() => chargeLocalWork(holder, undefined, local(), { reservationId: 'A' })).toThrow('budget_unavailable');
    reserveComputeChild(holder, { maxRequests: 2, maxTokens: 200 }, child('A', 1, 100));
    const before = structuredClone(holder);
    expect(() => chargeLocalWork(holder, undefined, local(), { reservationId: 'A' })).toThrow('budget_unavailable'); expect(holder).toEqual(before);
});
