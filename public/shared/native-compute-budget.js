import { fields } from './native-values.js';
import { contentSha256 } from './content-sha256.js';

export const COMPUTE_ADMISSION_CODES = Object.freeze(['native_generation_budget_exhausted', 'native_generation_required_budget_reserved', 'native_generation_required_budget_unknown']);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// A provenance marker is an immutable original-bank correlation, never a grant
// or a second ledger. Only the trusted BudgetPort creates these charge inputs.
export function orchestrationComputeAttemptId(value) {
    fields(value, ['kind', 'effectId', 'ordinal'], 'Compute orchestration provenance');
    if (!['provider_send', 'local_work'].includes(value.kind) || !/^oeffect_[a-f0-9]{32}$/.test(value.effectId)
        || !integer(value.ordinal) || value.ordinal > 1023) fail('native_generation_budget_invalid');
    const ordinalField = value.kind === 'provider_send' ? 'providerSendOrdinal' : 'localWorkOrdinal';
    return contentSha256(JSON.stringify({ effectId: value.effectId, [ordinalField]: value.ordinal }));
}
function assertOrchestrationProvenance(row, kind) {
    if (row.orchestration === undefined) return;
    if (!row.orchestration || row.orchestration.kind !== kind || orchestrationComputeAttemptId(row.orchestration) !== row.attemptId) fail('native_generation_budget_invalid');
}
const GENERATION_QUOTA_FIELDS = ['operationId', 'role', 'background', 'policyDigest', 'anchorDigest'];
function assertGenerationQuotaRef(value) {
    if (value === undefined) return;
    fields(value, GENERATION_QUOTA_FIELDS, 'Original generation quota reference');
    if (typeof value.background !== 'boolean' || typeof value.role !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value.role)
        || (!value.background && !['narrator', 'intent_resolver'].includes(value.role))
        || ['operationId', 'policyDigest', 'anchorDigest'].some(field => !/^[a-f0-9]{64}$/.test(value[field]))) fail('native_generation_budget_invalid');
}
export function hasRetainedOrchestrationCompute(ledger) {
    return Boolean(ledger && [...ledger.attempts, ...(ledger.localWork ?? [])].some(row => row.orchestration !== undefined));
}
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
    fields(value, ['schemaVersion', 'limits', 'attempts', 'localWork', 'reservations'], 'Compute ledger');
    assertComputeBudget(value.limits);
    if (value.schemaVersion !== 1 || !Array.isArray(value.attempts) || value.attempts.length > 32) fail('native_generation_budget_invalid');
    const ids = new Set();
    for (const entry of value.attempts) {
        fields(entry, ['attemptId', 'requestId', 'targetFingerprint', 'estimatedTokens', 'status', 'usage', 'reservationId', 'inputFingerprint', 'orchestration', 'generationQuotaRef'], 'Compute attempt');
        assertOrchestrationProvenance(entry, 'provider_send');
        assertGenerationQuotaRef(entry.generationQuotaRef);
        if (entry.inputFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(entry.inputFingerprint)) fail('native_generation_budget_invalid');
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
            fields(entry, ['attemptId', 'requestId', 'targetFingerprint', 'kind', 'estimatedItems', 'estimatedInputBytes', 'status', 'usage', 'reservationId', 'orchestration'], 'Local work');
            assertOrchestrationProvenance(entry, 'local_work');
            if (typeof entry.attemptId !== 'string' || !entry.attemptId || entry.attemptId.length > 128 || ids.has(entry.attemptId)
                || typeof entry.requestId !== 'string' || !entry.requestId || entry.requestId.length > 128
                || !/^[a-f0-9]{64}$/.test(entry.targetFingerprint) || !['index_insert', 'index_query', 'index_list', 'index_delete', 'index_purge', 'embedding_local', 'route_resolve', 'context_build', 'prompt_compile', 'skill_inventory', 'skill_pin', 'skill_load', 'memory_corpus', 'memory_hash', 'memory_rank', 'memory_pack', 'goal_validate', 'generation_count', 'generation_render', 'skill_read', 'task_history', 'appraisal_gate', 'appraisal_parse', 'appraisal_adopt', 'speech_synthesis', 'speech_publish', 'mcp_protocol', 'a2a_protocol'].includes(entry.kind)
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
    assertComputeReservations(value);
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
    if (hasRetainedOrchestrationCompute(ledger) || hasOpenComputeReservations(ledger) || ledger.attempts.some(row => row.status === 'charged') || ledger.localWork?.some(row => row.status === 'charged')) fail('native_generation_attempt_conflict');
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
export function bindComputeBudget(holder, limits) {
    limits = assertComputeBudget(limits);
    const ledger = holder.compute ??= { schemaVersion: 1, limits, attempts: [] };
    assertComputeLedger(ledger);
    ledger.limits = tightenLimits(ledger.limits, limits);
    return ledger;
}
// Optional work leaves the configured required allowance in the same parent
// bank. This is admission headroom, not a new ledger or a tighter parent limit;
// subsequent mandatory work can consume it and still applies its own guards.
export function chargeComputeAttempt(holder, limits, attempt, { reserve, reservationId } = {}) {
    fields(attempt, ['attemptId', 'requestId', 'targetFingerprint', 'estimatedTokens', 'inputFingerprint', 'orchestration', 'generationQuotaRef'], 'Compute admission');
    assertOrchestrationProvenance(attempt, 'provider_send');
    assertGenerationQuotaRef(attempt.generationQuotaRef);
    if (reserve === null) fail('native_generation_required_budget_unknown');
    if (reserve !== undefined) {
        fields(reserve, ['maxRequests', 'maxTokens'], 'Required compute reserve');
        reserve = assertComputeBudget(reserve);
    }
    const candidate = { compute: holder.compute ? structuredClone(holder.compute) : undefined };
    const ledger = bindComputeBudget(candidate, limits);
    assertComputeReservationOpen(ledger, reservationId);
    if (ledger.attempts.some(row => row.attemptId === attempt.attemptId)) fail('native_generation_attempt_conflict');
    if (ledger.attempts.length >= ledger.limits.maxRequests) fail('native_generation_budget_exhausted');
    const entry = { ...attempt, ...(attempt.orchestration ? { orchestration: structuredClone(attempt.orchestration) } : {}),
        ...(attempt.generationQuotaRef ? { generationQuotaRef: structuredClone(attempt.generationQuotaRef) } : {}),
        ...(reservationId === undefined ? {} : { reservationId }), status: 'charged', usage: null };
    ledger.attempts.push(entry); assertComputeLedger(ledger);
    assertComputeCapacity(ledger, reservationId, reserve);
    holder.compute = ledger;
    return structuredClone(entry);
}

// Work units are explicit input bounds, never invented provider tokens. Both
// lanes live in the original authority's one durable compute record.
export function chargeLocalWork(holder, limits, attempt, { reservationId } = {}) {
    limits ??= holder.compute?.limits;
    if (!limits) { if (reservationId != null) fail('native_generation_budget_unavailable'); return null; }
    limits = assertComputeBudget(limits);
    const inherited = holder.compute?.limits;
    if (!limits.localWork && !inherited?.localWork) { if (reservationId != null) fail('native_generation_budget_unavailable'); return null; }
    fields(attempt, ['attemptId', 'requestId', 'targetFingerprint', 'kind', 'estimatedItems', 'estimatedInputBytes', 'orchestration'], 'Local admission');
    assertOrchestrationProvenance(attempt, 'local_work');
    const candidate = { compute: holder.compute ? structuredClone(holder.compute) : undefined };
    const ledger = bindComputeBudget(candidate, limits);
    assertComputeReservationOpen(ledger, reservationId);
    const rows = ledger.localWork ??= [], cap = ledger.limits.localWork;
    if (rows.some(row => row.attemptId === attempt.attemptId)) fail('native_generation_attempt_conflict');
    if (rows.length >= cap.maxJobs || rows.reduce((n, row) => n + row.estimatedItems, 0) + attempt.estimatedItems > cap.maxItems
        || rows.reduce((n, row) => n + row.estimatedInputBytes, 0) + attempt.estimatedInputBytes > cap.maxInputBytes) fail('native_generation_budget_exhausted');
    const entry = { ...attempt, ...(attempt.orchestration ? { orchestration: structuredClone(attempt.orchestration) } : {}), ...(reservationId === undefined ? {} : { reservationId }), status: 'charged', usage: null };
    rows.push(entry); assertComputeLedger(ledger);
    assertComputeCapacity(ledger, reservationId);
    holder.compute = ledger;
    return structuredClone(entry);
}
export function settleLocalWork(holder, attemptId, usage) {
    const ledger = assertComputeLedger(holder.compute), entry = ledger.localWork?.find(row => row.attemptId === attemptId);
    if (!entry) fail('native_generation_attempt_conflict');
    if (entry.status === 'settled' && ['wallMs', 'cpuUserMicros', 'cpuSystemMicros', 'cpuScope', 'outcome']
        .some(field => entry.usage?.[field] !== usage?.[field])) fail('native_generation_attempt_conflict');
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
    if (entry.status === 'settled' && ['inputTokens', 'outputTokens', 'totalTokens']
        .some(field => entry.usage?.[field] !== observed?.[field])) fail('native_generation_attempt_conflict');
    entry.status = status; entry.usage = observed;
    return structuredClone(entry);
}

// Roles come from the stored exact Route; necessary narration is never optional.
export function optionalComputeOptions(executionPolicy, role) {
    const policy = executionPolicy?.optionalWork;
    return policy && (policy.roles ?? ['rerank']).includes(role) ? { reserve: policy.requiredCompute ?? null } : {};
}

const dimensions = ['requests', 'tokens', 'jobs', 'items', 'inputBytes'];
const units = limits => ({ requests: limits.maxRequests, tokens: limits.maxTokens, jobs: limits.localWork?.maxJobs ?? 0,
    items: limits.localWork?.maxItems ?? 0, inputBytes: limits.localWork?.maxInputBytes ?? 0 });
const referenceId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const rowsOf = ledger => [...ledger.attempts, ...(ledger.localWork ?? [])];

function allocationLimits(value) {
    fields(value, ['maxRequests', 'maxTokens', 'localWork'], 'Compute allocation');
    if (!integer(value.maxRequests) || value.maxRequests > 32 || !integer(value.maxTokens)
        || (value.maxRequests === 0) !== (value.maxTokens === 0) || !value.maxRequests && !value.localWork) fail('native_generation_budget_invalid');
    return { maxRequests: value.maxRequests, maxTokens: value.maxTokens,
        ...(value.localWork === undefined ? {} : { localWork: assertLocalWorkBudget(value.localWork) }) };
}

// One validator for both the original bank and Host authorization descriptors.
export const assertComputeAllocation = allocationLimits;

function assertComputeReservations(ledger) {
    const reservations = ledger.reservations === undefined ? [] : ledger.reservations;
    if (!Array.isArray(reservations) || reservations.length > 32) fail('native_generation_budget_invalid');
    const index = new Map();
    for (const row of reservations) {
        fields(row, ['reservationId', 'parentReservationId', 'consumerId', 'limits', 'status'], 'Compute reservation');
        const parent = row.parentReservationId === null ? null : index.get(row.parentReservationId);
        if (!referenceId(row.reservationId) || index.has(row.reservationId) || !referenceId(row.consumerId)
            || row.parentReservationId !== null && !parent || !['held', 'released'].includes(row.status)
            || parent?.status === 'released' && row.status !== 'released') fail('native_generation_budget_invalid');
        allocationLimits(row.limits);
        if (parent && dimensions.some(key => units(row.limits)[key] > units(parent.limits)[key])) fail('native_generation_budget_invalid');
        index.set(row.reservationId, row);
    }
    for (const row of rowsOf(ledger)) {
        if (row.reservationId === undefined || row.reservationId === null) continue;
        const allocation = index.get(row.reservationId);
        if (!allocation || allocation.status === 'released' && row.status !== 'settled') fail('native_generation_budget_invalid');
    }
}

function inSubtree(index, reservationId, selected) {
    if (selected === null) return true;
    for (let id = reservationId; id !== null; id = index.get(id).parentReservationId) if (id === selected) return true;
    return false;
}

function budgetState(ledger, selected = null) {
    const index = new Map((ledger.reservations ?? []).map(row => [row.reservationId, row]));
    const allocation = selected === null ? null : index.get(selected);
    if (selected !== null && !allocation) fail('native_generation_attempt_conflict');
    const ceiling = units(allocation?.limits ?? ledger.limits), used = Object.fromEntries(dimensions.map(key => [key, 0]));
    const add = (key, value) => { used[key] += value; if (!integer(used[key])) fail('native_generation_budget_invalid'); };
    for (const row of ledger.attempts) if (inSubtree(index, row.reservationId ?? null, selected)) {
        add('requests', 1); add('tokens', row.status === 'settled' ? row.usage.totalTokens : row.estimatedTokens);
    }
    for (const row of ledger.localWork ?? []) if (inSubtree(index, row.reservationId ?? null, selected)) {
        add('jobs', 1); add('items', row.estimatedItems); add('inputBytes', row.estimatedInputBytes);
    }
    const delegated = Object.fromEntries(dimensions.map(key => [key, 0]));
    let descendantOverrun = false;
    for (const child of index.values()) if (child.parentReservationId === selected) {
        // Child usage includes descendants; its remaining envelope therefore
        // covers nested allocations without charging ancestors a second time.
        const childState = budgetState(ledger, child.reservationId);
        descendantOverrun ||= childState.overrun;
        if (child.status !== 'held') continue;
        for (const key of dimensions) {
            delegated[key] += Math.max(0, childState.ceiling[key] - childState.used[key]);
            if (!integer(delegated[key])) fail('native_generation_budget_invalid');
        }
    }
    return { ceiling, used, delegated, remaining: Object.fromEntries(dimensions.map(key => [key, Math.max(0, ceiling[key] - used[key] - delegated[key])])),
        overrun: descendantOverrun || dimensions.some(key => used[key] + delegated[key] > ceiling[key]) };
}

function assertComputeReservationOpen(ledger, reservationId = null) {
    const index = new Map((ledger.reservations ?? []).map(row => [row.reservationId, row]));
    for (let id = reservationId; id !== null; id = index.get(id).parentReservationId) {
        if (index.get(id)?.status !== 'held') fail('native_generation_attempt_conflict');
    }
}

function assertComputeCapacity(ledger, reservationId = null, reserve = undefined) {
    assertComputeReservationOpen(ledger, reservationId);
    if (budgetState(ledger).overrun) fail('native_generation_budget_exhausted');
    if (reserve) {
        const available = budgetState(ledger, reservationId).remaining;
        if (available.requests < reserve.maxRequests || available.tokens < reserve.maxTokens) fail('native_generation_required_budget_reserved');
    }
}

export const hasOpenComputeReservations = ledger => Boolean(ledger?.reservations?.some(row => row.status === 'held'));

/** Pure reducers for the original Native bank's one durable compute record.
 * Original Source/RunControl/Project authorities own authorization and CAS. */
export function reserveComputeChild(holder, limits, input) {
    fields(input, ['reservationId', 'parentReservationId', 'consumerId', 'limits'], 'Reserve compute child');
    const normalized = { ...input, limits: allocationLimits(input.limits), status: 'held' };
    const candidate = { compute: holder.compute ? structuredClone(holder.compute) : undefined }, ledger = bindComputeBudget(candidate, limits);
    const previous = ledger.reservations?.find(row => row.reservationId === input.reservationId);
    if (previous) {
        if (previous.parentReservationId !== input.parentReservationId || previous.consumerId !== input.consumerId
            || dimensions.some(key => units(previous.limits)[key] !== units(normalized.limits)[key])) fail('native_generation_attempt_conflict');
        return { reservation: structuredClone(previous), replayed: true };
    }
    if ((ledger.reservations?.length ?? 0) >= 32) fail('native_generation_reservation_limit');
    assertComputeReservationOpen(ledger, input.parentReservationId);
    (ledger.reservations ??= []).push(normalized);
    assertComputeLedger(ledger);
    assertComputeCapacity(ledger, input.parentReservationId);
    holder.compute = ledger;
    return { reservation: structuredClone(normalized), replayed: false };
}

export function releaseComputeChild(holder, reservationId) {
    const ledger = structuredClone(assertComputeLedger(holder.compute)), row = ledger.reservations?.find(row => row.reservationId === reservationId);
    if (!row) fail('native_generation_attempt_conflict');
    if (row.status === 'released') return { reservation: structuredClone(row), replayed: true };
    const index = new Map(ledger.reservations.map(row => [row.reservationId, row]));
    if (ledger.reservations.some(child => child.parentReservationId === reservationId && child.status === 'held')
        || rowsOf(ledger).some(attempt => inSubtree(index, attempt.reservationId ?? null, reservationId) && attempt.status !== 'settled')) fail('native_generation_reservation_unsettled');
    row.status = 'released'; assertComputeLedger(ledger); holder.compute = ledger;
    return { reservation: structuredClone(row), replayed: false };
}

export function inspectComputeReservation(holder, reservationId = null) {
    return budgetState(assertComputeLedger(holder.compute), reservationId);
}

/** Original-bank facts only. No release, admission, or second cost projection. */
export function inspectComputeChildClosure(holder, reservationId) {
    const ledger = assertComputeLedger(holder.compute);
    const index = new Map((ledger.reservations ?? []).map(row => [row.reservationId, row]));
    const reservation = index.get(reservationId);
    if (!reservation) fail('native_generation_attempt_conflict');
    const selected = row => inSubtree(index, row.reservationId ?? null, reservationId);
    return structuredClone({ reservation,
        descendantReservations: [...index.values()].filter(row => row.reservationId !== reservationId && selected(row)),
        modelAttempts: ledger.attempts.filter(selected), localWork: (ledger.localWork ?? []).filter(selected),
        overrun: inspectComputeReservation(holder, reservationId).overrun });
}

export function admitComputeAttempt(holder, limits, attempt, options = {}) {
    fields(attempt, ['attemptId', 'requestId', 'targetFingerprint', 'estimatedTokens', 'inputFingerprint', 'orchestration', 'generationQuotaRef'], 'Compute admission');
    assertOrchestrationProvenance(attempt, 'provider_send');
    assertGenerationQuotaRef(attempt.generationQuotaRef);
    fields(options, ['reserve', 'reservationId'], 'Compute admission options');
    if (!/^[a-f0-9]{64}$/.test(attempt.inputFingerprint)) fail('native_generation_attempt_conflict');
    const ledger = holder.compute && assertComputeLedger(holder.compute), previous = ledger?.attempts.find(row => row.attemptId === attempt.attemptId);
    if (previous) {
        if (['requestId', 'targetFingerprint', 'estimatedTokens', 'inputFingerprint'].some(field => previous[field] !== attempt[field])
            || ['kind', 'effectId', 'ordinal'].some(field => previous.orchestration?.[field] !== attempt.orchestration?.[field])
            || GENERATION_QUOTA_FIELDS.some(field => previous.generationQuotaRef?.[field] !== attempt.generationQuotaRef?.[field])
            || (previous.reservationId ?? null) !== (options.reservationId ?? null)) fail('native_generation_attempt_conflict');
        return { attempt: structuredClone(previous), replayed: true };
    }
    return { attempt: chargeComputeAttempt(holder, limits, attempt, options), replayed: false };
}
