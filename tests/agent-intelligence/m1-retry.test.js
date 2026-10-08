import { expect, test } from '@jest/globals';
import { M1RetryPolicy } from './m1-retry.js';
import { EvaluationBudget } from './budget.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';

const failure = code => Object.assign(new Error(code), { code });
test('a transient retry funds every send and retains unknown usage', async () => {
    const policy = new M1RetryPolicy({ wait: async () => {} });
    const budget = new EvaluationBudget({ maxRequests: 3, maxTotalTokens: 300 });
    const operation = async attempt => {
        const requestId = 'send-' + attempt;
        expect(budget.reserve({ requestId, trialId: 'one', inputTokens: 50, reservedOutput: 50, kind: attempt ? 'retry' : 'model' }).status).toBe('passed');
        if (!attempt) { policy.observe('primary', 'm1_http_524'); budget.settle(requestId, null); throw failure('m1_http_524'); }
        policy.observe('primary'); budget.settle(requestId, 20); return 'success';
    };
    expect(await policy.send('primary', operation, new AbortController().signal)).toBe('success');
    expect(budget.snapshot()).toMatchObject({ requests: 2, tokens: 120 });
    expect(budget.entries.get('send-0')).toMatchObject({ settled: true, usageStatus: 'reserved_upper_bound', tokens: 100 });
});
test('three consecutive failures stop that connection without another send', async () => {
    const policy = new M1RetryPolicy({ wait: async () => {} }); let sends = 0;
    const operation = async () => { sends++; policy.observe('primary', 'm1_http_524'); throw failure('m1_http_524'); };
    await expect(policy.send('primary', operation, new AbortController().signal)).rejects.toThrow('m1_http_524');
    await expect(policy.send('primary', operation, new AbortController().signal)).rejects.toThrow('m1_http_524');
    expect(sends).toBe(3); expect(policy.state('secondary').stopped).toBeNull();
});
test('six intermittent failures in the recent window stop; expired failures do not', () => {
    const policy = new M1RetryPolicy();
    for (let i = 0; i < 5; i++) { policy.observe('frequent', 'm1_http_502'); policy.observe('frequent'); }
    expect(policy.state('frequent').stopped).toBeNull();
    policy.observe('frequent', 'm1_http_502'); expect(policy.state('frequent').stopped).toBe('m1_http_502');
    for (let i = 0; i < 5; i++) { policy.observe('old', 'm1_http_502'); policy.observe('old'); }
    for (let i = 0; i < 20; i++) policy.observe('old');
    policy.observe('old', 'm1_http_502'); expect(policy.state('old').stopped).toBeNull();
});
test('authentication, budget and cancellation errors do not retry', async () => {
    const policy = new M1RetryPolicy({ wait: async () => {} }); let sends = 0;
    await expect(policy.send('auth', async () => { sends++; policy.observe('auth', 'm1_http_401'); throw failure('m1_http_401'); }, new AbortController().signal)).rejects.toThrow('m1_http_401');
    await expect(policy.send('budget', async () => { sends++; throw failure('recovered_budget_blocked'); }, new AbortController().signal)).rejects.toThrow('recovered_budget_blocked');
    const cancelled = new AbortController(); cancelled.abort();
    await expect(policy.send('cancelled', async () => { sends++; }, cancelled.signal)).rejects.toThrow();
    expect(sends).toBe(2);
});
test('restart retains a stopped connection and rejects malformed checkpoints', () => {
    let snapshot;
    const policy = new M1RetryPolicy({ onChange: next => { snapshot = structuredClone(next); } });
    for (let i = 0; i < 3; i++) policy.observe('primary', 'm1_http_524');
    expect(() => new M1RetryPolicy({ snapshot }).assertAvailable('primary')).toThrow('m1_http_524');
    expect(() => new M1RetryPolicy({ snapshot: { primary: { ...snapshot.primary, recent: ['false'] } } })).toThrow('invalid_transport_checkpoint');
});
test('the original HTTP adapter wrapping a transient failure still permits a funded retry', async () => {
    const policy = new M1RetryPolicy({ wait: async () => {} });
    const budget = new EvaluationBudget({ maxRequests: 3, maxTotalTokens: 300 }); let sends = 0;
    const response = { ok: true };
    const provider = createHttpGenerationProvider({ fetchImpl: async () => {
        sends++;
        if (sends === 1) { policy.observe('primary', 'm1_http_524'); throw failure('m1_http_524'); }
        policy.observe('primary'); return response;
    } });
    const result = await policy.send('primary', async attempt => {
        const id = 'wrapped-' + attempt;
        expect(budget.reserve({ requestId: id, trialId: 'wrapped', inputTokens: 50, reservedOutput: 50, kind: attempt ? 'retry' : 'model' }).status).toBe('passed');
        let usage = null;
        try { const raw = await provider.send({ endpoint: 'https://fixture.invalid', body: {} }, { secret: 'fixture-only', signal: new AbortController().signal }); usage = 20; return raw; }
        finally { budget.settle(id, usage); }
    }, new AbortController().signal);
    expect(result).toBe(response); expect(sends).toBe(2);
    expect(budget.snapshot()).toMatchObject({ requests: 2, tokens: 120 });
});
test('incomplete response replaces the header success and three such sends stop', async () => {
    const policy = new M1RetryPolicy({ wait: async () => {} }); let calls = 0;
    await expect(policy.send('primary', async () => {
        calls++; policy.observe('primary'); policy.incomplete('primary'); throw failure('m1_response_incomplete');
    }, new AbortController().signal)).rejects.toThrow('m1_response_incomplete');
    expect(calls).toBe(3);
    expect(policy.state('primary')).toMatchObject({ consecutive: 3, recent: [true, true, true], stopped: 'm1_response_incomplete' });
});
