import { fields } from './native-values.js';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
export function assertComputeBudget(value) {
    fields(value, ['maxRequests', 'maxTokens', 'localWork'], 'Compute budget');
    if (!integer(value.maxRequests) || value.maxRequests < 1 || value.maxRequests > 32
        || !integer(value.maxTokens) || value.maxTokens < 1) fail('native_generation_budget_invalid');
    return { maxRequests: value.maxRequests, maxTokens: value.maxTokens,
        ...(value.localWork === undefined ? {} : { localWork: assertLocalWorkBudget(value.localWork) }) };
}
function assertLocalWorkBudget(value) {
    fields(value, ['maxJobs', 'maxItems', 'maxInputBytes'], 'Local work budget');
    for (const [key, max] of [['maxJobs', 32], ['maxItems', 10000], ['maxInputBytes', 16777216]]) {
        if (!integer(value[key]) || value[key] < 1 || value[key] > max) fail('native_generation_budget_invalid');
    }
    return { maxJobs: value.maxJobs, maxItems: value.maxItems, maxInputBytes: value.maxInputBytes };
}
function tightenLimits(previous, current) {
    const local = previous.localWork ?? current.localWork;
    return { maxRequests: Math.min(previous.maxRequests, current.maxRequests), maxTokens: Math.min(previous.maxTokens, current.maxTokens),
        ...(local ? { localWork: Object.fromEntries(Object.entries(local).map(([key, value]) => [key, Math.min(value, current.localWork?.[key] ?? value)])) } : {}) };
}
export function assertComputeLedger(value) {
    fields(value, ['schemaVersion', 'limits', 'attempts', 'localWork'], 'Compute ledger');
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
    if (value.localWork !== undefined) {
        if (!value.limits.localWork || !Array.isArray(value.localWork) || value.localWork.length > 32) fail('native_generation_budget_invalid');
        for (const entry of value.localWork) {
            fields(entry, ['attemptId', 'requestId', 'targetFingerprint', 'kind', 'estimatedItems', 'estimatedInputBytes', 'status', 'usage'], 'Local work');
            if (typeof entry.attemptId !== 'string' || !entry.attemptId || entry.attemptId.length > 128 || ids.has(entry.attemptId)
                || typeof entry.requestId !== 'string' || !entry.requestId || entry.requestId.length > 128
                || !/^[a-f0-9]{64}$/.test(entry.targetFingerprint) || !['index_insert', 'index_query'].includes(entry.kind)
                || !integer(entry.estimatedItems) || entry.estimatedItems < 1 || entry.estimatedItems > 10000
                || !integer(entry.estimatedInputBytes) || entry.estimatedInputBytes < 1 || entry.estimatedInputBytes > 16777216
                || !['charged', 'settled', 'unknown'].includes(entry.status)) fail('native_generation_budget_invalid');
            ids.add(entry.attemptId);
            if (entry.usage !== null) {
                fields(entry.usage, ['wallMs', 'cpuUserMicros', 'cpuSystemMicros', 'cpuScope', 'outcome'], 'Local work usage');
                if (!Number.isFinite(entry.usage.wallMs) || entry.usage.wallMs < 0 || !integer(entry.usage.cpuUserMicros) || !integer(entry.usage.cpuSystemMicros)
                    || entry.usage.cpuScope !== 'process' || !['completed', 'failed', 'cancelled'].includes(entry.usage.outcome)) fail('native_generation_budget_invalid');
            }
            if (entry.status === 'settled' && !entry.usage) fail('native_generation_budget_invalid');
        }
    }
    return value;
}
const retiredFields = ['modelAttempts', 'knownTotalTokens', 'unknownAttempts', 'unknownUpperTokens', 'reportedInputTokens', 'reportedOutputTokens',
    'localJobs', 'localEstimatedItems', 'localEstimatedInputBytes', 'localUnknownJobs', 'localCompletedJobs', 'localFailedJobs', 'localCancelledJobs',
    'localWallMs', 'cpuUserMicros', 'cpuSystemMicros'];
// A cost-only projection inside the original Run control. It gives old work
// no executable anchor and is never consulted to authorize a new allowance.
export function assertRetiredCompute(value) {
    fields(value, retiredFields, 'Retired compute');
    for (const key of retiredFields) {
        if (key === 'localWallMs' ? !Number.isFinite(value[key]) || value[key] < 0 : !integer(value[key])) fail('native_generation_budget_invalid');
    }
    if (value.unknownAttempts > value.modelAttempts || value.unknownUpperTokens < value.unknownAttempts || (!value.unknownAttempts && value.unknownUpperTokens)
        || (!value.modelAttempts && (value.knownTotalTokens || value.reportedInputTokens || value.reportedOutputTokens))
        || value.localEstimatedItems < value.localJobs || value.localEstimatedInputBytes < value.localJobs
        || value.localUnknownJobs + value.localCompletedJobs + value.localFailedJobs + value.localCancelledJobs !== value.localJobs) fail('native_generation_budget_invalid');
    return value;
}
export function retireComputeLedger(previous, ledger) {
    assertComputeLedger(ledger);
    if (ledger.attempts.some(row => row.status === 'charged') || ledger.localWork?.some(row => row.status === 'charged')) fail('native_generation_attempt_conflict');
    const total = { ...(previous ? assertRetiredCompute(previous) : Object.fromEntries(retiredFields.map(key => [key, 0]))) };
    for (const row of ledger.attempts) {
        total.modelAttempts++;
        if (row.status === 'settled') total.knownTotalTokens += row.usage.totalTokens;
        else { total.unknownAttempts++; total.unknownUpperTokens += row.estimatedTokens; }
        total.reportedInputTokens += row.usage?.inputTokens ?? 0;
        total.reportedOutputTokens += row.usage?.outputTokens ?? 0;
    }
    for (const row of ledger.localWork ?? []) {
        total.localJobs++; total.localEstimatedItems += row.estimatedItems; total.localEstimatedInputBytes += row.estimatedInputBytes;
        if (row.status === 'unknown') total.localUnknownJobs++;
        else {
            total[{ completed: 'localCompletedJobs', failed: 'localFailedJobs', cancelled: 'localCancelledJobs' }[row.usage.outcome]]++;
            total.localWallMs += row.usage.wallMs; total.cpuUserMicros += row.usage.cpuUserMicros; total.cpuSystemMicros += row.usage.cpuSystemMicros;
        }
    }
    return assertRetiredCompute(total);
}
// A single send identity is charged inside the original authority's durable
// mutation. Unknown sends occupy their prepared upper bound across recovery.
export function chargeComputeAttempt(holder, limits, attempt) {
    limits = assertComputeBudget(limits);
    const ledger = holder.compute ??= { schemaVersion: 1, limits, attempts: [] };
    assertComputeLedger(ledger);
    ledger.limits = tightenLimits(ledger.limits, limits);
    const spent = ledger.attempts.reduce((sum, row) => sum + (row.status === 'settled' ? row.usage.totalTokens : row.estimatedTokens), 0);
    if (ledger.attempts.some(row => row.attemptId === attempt.attemptId)) fail('native_generation_attempt_conflict');
    if (ledger.attempts.length >= ledger.limits.maxRequests || spent + attempt.estimatedTokens > ledger.limits.maxTokens) fail('native_generation_budget_exhausted');
    const entry = { ...attempt, status: 'charged', usage: null };
    ledger.attempts.push(entry); assertComputeLedger(ledger);
    return structuredClone(entry);
}

// Work units are explicit input bounds, never invented provider tokens. Both
// lanes live in the original authority's one durable compute record.
export function chargeLocalWork(holder, limits, attempt) {
    limits ??= holder.compute?.limits;
    if (!limits) return null;
    limits = assertComputeBudget(limits);
    const inherited = holder.compute?.limits;
    if (!limits.localWork && !inherited?.localWork) return null;
    const ledger = holder.compute ??= { schemaVersion: 1, limits, attempts: [] };
    assertComputeLedger(ledger);
    ledger.limits = tightenLimits(ledger.limits, limits);
    const rows = ledger.localWork ??= [], cap = ledger.limits.localWork;
    if (rows.some(row => row.attemptId === attempt.attemptId)) fail('native_generation_attempt_conflict');
    if (rows.length >= cap.maxJobs || rows.reduce((n, row) => n + row.estimatedItems, 0) + attempt.estimatedItems > cap.maxItems
        || rows.reduce((n, row) => n + row.estimatedInputBytes, 0) + attempt.estimatedInputBytes > cap.maxInputBytes) fail('native_generation_budget_exhausted');
    const entry = { ...attempt, status: 'charged', usage: null };
    rows.push(entry); assertComputeLedger(ledger);
    return structuredClone(entry);
}
export function settleLocalWork(holder, attemptId, usage) {
    const ledger = assertComputeLedger(holder.compute), entry = ledger.localWork?.find(row => row.attemptId === attemptId);
    if (!entry) fail('native_generation_attempt_conflict');
    if (entry.status === 'settled' && JSON.stringify(entry.usage) !== JSON.stringify(usage)) fail('native_generation_attempt_conflict');
    entry.status = usage ? 'settled' : 'unknown'; entry.usage = usage;
    assertComputeLedger(ledger);
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
