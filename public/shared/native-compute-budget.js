import { fields } from './native-values.js';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
export function assertComputeBudget(value) {
    fields(value, ['maxRequests', 'maxTokens'], 'Compute budget');
    if (!integer(value.maxRequests) || value.maxRequests < 1 || value.maxRequests > 32
        || !integer(value.maxTokens) || value.maxTokens < 1) fail('native_generation_budget_invalid');
    return { maxRequests: value.maxRequests, maxTokens: value.maxTokens };
}
export function assertComputeLedger(value) {
    fields(value, ['schemaVersion', 'limits', 'attempts'], 'Compute ledger');
    assertComputeBudget(value.limits);
    if (value.schemaVersion !== 1 || !Array.isArray(value.attempts) || value.attempts.length > 32) fail('native_generation_budget_invalid');
    const ids = new Set();
    for (const entry of value.attempts) {
        fields(entry, ['attemptId', 'requestId', 'targetFingerprint', 'estimatedTokens', 'status', 'usage'], 'Compute attempt');
        if (typeof entry.attemptId !== 'string' || !entry.attemptId || entry.attemptId.length > 128 || ids.has(entry.attemptId)
            || typeof entry.requestId !== 'string' || !entry.requestId || entry.requestId.length > 128
            || !/^[a-f0-9]{64}$/.test(entry.targetFingerprint) || !integer(entry.estimatedTokens) || entry.estimatedTokens < 1
            || !['charged', 'settled', 'unknown'].includes(entry.status)) fail('native_generation_budget_invalid');
        ids.add(entry.attemptId);
        if (entry.usage !== null) {
            fields(entry.usage, ['inputTokens', 'outputTokens', 'totalTokens'], 'Compute usage');
            for (const count of Object.values(entry.usage)) if (count !== null && !integer(count)) fail('native_generation_budget_invalid');
        }
        if (entry.status === 'settled' && !integer(entry.usage?.totalTokens)) fail('native_generation_budget_invalid');
    }
    return value;
}
// A single send identity is charged inside the original authority's durable
// mutation. Unknown sends occupy their prepared upper bound across recovery.
export function chargeComputeAttempt(holder, limits, attempt) {
    limits = assertComputeBudget(limits);
    const ledger = holder.compute ??= { schemaVersion: 1, limits, attempts: [] };
    assertComputeLedger(ledger);
    ledger.limits = { maxRequests: Math.min(ledger.limits.maxRequests, limits.maxRequests), maxTokens: Math.min(ledger.limits.maxTokens, limits.maxTokens) };
    const spent = ledger.attempts.reduce((sum, row) => sum + (row.status === 'settled' ? row.usage.totalTokens : row.estimatedTokens), 0);
    if (ledger.attempts.some(row => row.attemptId === attempt.attemptId)) fail('native_generation_attempt_conflict');
    if (ledger.attempts.length >= ledger.limits.maxRequests || spent + attempt.estimatedTokens > ledger.limits.maxTokens) fail('native_generation_budget_exhausted');
    const entry = { ...attempt, status: 'charged', usage: null };
    ledger.attempts.push(entry); assertComputeLedger(ledger);
    return structuredClone(entry);
}
export function settleComputeAttempt(holder, attemptId, usage) {
    const ledger = assertComputeLedger(holder.compute);
    const entry = ledger.attempts.find(row => row.attemptId === attemptId);
    if (!entry) fail('native_generation_attempt_conflict');
    const count = value => integer(value) ? value : null;
    const observed = usage ? { inputTokens: count(usage.inputTokens ?? usage.prompt_tokens), outputTokens: count(usage.outputTokens ?? usage.completion_tokens),
        totalTokens: count(usage.totalTokens ?? usage.total_tokens) } : null;
    // Partial counters cannot establish a total bill. Do not infer zero or
    // add reasoning/cache subsets to reported output/input a second time.
    const status = observed?.totalTokens !== null && observed ? 'settled' : 'unknown';
    if (entry.status === 'settled' && JSON.stringify(entry.usage) !== JSON.stringify(observed)) fail('native_generation_attempt_conflict');
    entry.status = status; entry.usage = observed;
    return structuredClone(entry);
}
