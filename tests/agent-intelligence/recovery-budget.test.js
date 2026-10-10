import { expect, test } from '@jest/globals';
import { EvaluationBudget } from './budget.js';

const carried = () => ({ requests: 252, tokens: 1000000, breached: false, entries: {}, historicalCarry: {
    origin: 'lost_s06_upper_bound', requests: 252, tokens: 1000000, evidenceHash: 'a'.repeat(64),
} });
const limits = { maxRequests: 254, maxTotalTokens: 1000100 };
const send = id => ({ requestId: id, trialId: id, inputTokens: 30, reservedOutput: 20 });

test('loss recovery charges the full old ceiling without inventing historical attempts', () => {
    const snapshots = [], budget = new EvaluationBudget(limits, { snapshot: carried(), onChange: s => snapshots.push(s) });
    expect(budget.reserve(send('one')).status).toBe('passed');
    expect(snapshots[0]).toMatchObject({ requests: 253, tokens: 1000050 });
    expect(Object.keys(snapshots[0].entries)).toEqual(['one']);
    budget.settle('one', 10);
    expect(budget.snapshot()).toMatchObject({ requests: 253, tokens: 1000010, historicalCarry: carried().historicalCarry });
    expect(budget.reserve(send('two')).status).toBe('passed');
    expect(budget.reserve(send('three')).status).toBe('budget_blocked');
});

test('restart preserves unknown and pending reservations and detects a reduced carry', () => {
    const budget = new EvaluationBudget(limits, { snapshot: carried() });
    budget.reserve(send('pending'));
    const restored = new EvaluationBudget(limits, { snapshot: budget.snapshot() });
    expect(restored.snapshot()).toEqual(budget.snapshot());
    restored.settle('pending');
    expect(restored.snapshot().tokens).toBe(1000050);
    const corrupt = carried(); corrupt.historicalCarry.requests = 110;
    expect(() => new EvaluationBudget(limits, { snapshot: corrupt })).toThrow('historical carry');
});

test('token ceilings include the carry and over-reported usage remains a sticky breach', () => {
    const budget = new EvaluationBudget({ maxRequests: 254, maxTotalTokens: 1000049 }, { snapshot: carried() });
    expect(budget.reserve(send('too-large')).status).toBe('budget_blocked');
    const allowed = new EvaluationBudget(limits, { snapshot: carried() });
    allowed.reserve(send('overage')); allowed.settle('overage', 80);
    const restored = new EvaluationBudget(limits, { snapshot: allowed.snapshot() });
    expect(restored.snapshot().breached).toBe(true);
    expect(restored.reserve(send('later')).status).toBe('budget_blocked');
});

test('legacy snapshots stay byte-compatible and larger guards require an explicit historical carry', () => {
    const budget = new EvaluationBudget({ maxRequests: 1, maxTotalTokens: 100 });
    expect(budget.snapshot()).toEqual({ requests: 0, tokens: 0, breached: false, entries: {} });
    expect(() => new EvaluationBudget(limits)).toThrow('Finite evaluation budget');
    const corrupt = carried(); corrupt.requests = 0;
    expect(() => new EvaluationBudget(limits, { snapshot: corrupt })).toThrow('restore mismatch');
    const extra = carried(); extra.historicalCarry.invented = true;
    expect(() => new EvaluationBudget(limits, { snapshot: extra })).toThrow('historical carry');
});
