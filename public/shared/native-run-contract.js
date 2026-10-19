import { fields, assertJsonDeclaration } from './native-values.js';
import { taskId } from './native-task-contract.js';
import { assertComputeLedger, assertRetiredCompute } from './native-compute-budget.js';
import { assertSessionTaskHistory, sessionTaskHistoryLimits } from './native-session-task-history.js';

export const RUN_NAMESPACE = 'atri_run';
export function assertExternalTaskOrchestrationBinding(value) {
    fields(value, ['schemaVersion', 'runId', 'effectId', 'sourceBindingDigest', 'grantDigest'], 'External task orchestration binding');
    if (value.schemaVersion !== 1 || !/^orun_[a-f0-9]{32}$/.test(value.runId) || !/^oeffect_[a-f0-9]{32}$/.test(value.effectId)
        || ![value.sourceBindingDigest, value.grantDigest].every(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)))
        throw new TypeError('Invalid external task orchestration binding');
    return value;
}
export function assertA2aAcceptanceBinding(value) {
    fields(value, ['schemaVersion', 'runId', 'effectId', 'epoch', 'sourceBindingDigest', 'grantDigest', 'inputHash',
        'endpointBindingDigest', 'budgetEnvelopeDigest', 'budgetAttemptRef'], 'A2A acceptance binding');
    assertExternalTaskOrchestrationBinding(Object.fromEntries(['schemaVersion', 'runId', 'effectId', 'sourceBindingDigest', 'grantDigest'].map(key => [key, value[key]])));
    integer(value.epoch, 0, Number.MAX_SAFE_INTEGER);
    if (![value.inputHash, value.endpointBindingDigest, value.budgetEnvelopeDigest].every(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)))
        throw new TypeError('Invalid A2A acceptance digest');
    const ref = value.budgetAttemptRef;
    fields(ref, ['kind', 'authorityRef', 'effectId', 'localWorkOrdinal', 'attemptId', 'reservationId'], 'A2A acceptance budget');
    if (ref.kind !== 'local_work' || ref.effectId !== value.effectId || !/^[a-f0-9]{64}$/.test(ref.attemptId)
        || ref.reservationId !== null && (typeof ref.reservationId !== 'string' || !ref.reservationId)) throw new TypeError('Invalid A2A acceptance budget');
    integer(ref.localWorkOrdinal, 0, 1023);
    fields(ref.authorityRef, ['authority', 'domain', 'sessionId', 'operationId'], 'A2A acceptance authority');
    if (ref.authorityRef.authority !== 'run_control' || ref.authorityRef.domain !== 'session'
        || !/^ses_[a-f0-9]{32}$/.test(ref.authorityRef.sessionId) || !/^[a-f0-9]{64}$/.test(ref.authorityRef.operationId))
        throw new TypeError('Invalid A2A acceptance authority');
    return value;
}
export function assertA2aAcceptedReceipt(value) {
    fields(value, ['schemaVersion', 'kind', 'operationId', 'binding', 'sourceFingerprint', 'requestFingerprint', 'responseFingerprint',
        'responseKind', 'localWorkAttemptIds'], 'A2A accepted receipt');
    if (value.schemaVersion !== 1 || value.kind !== 'a2a_send_accepted' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.operationId)
        || !['task', 'message'].includes(value.responseKind)
        || ![value.sourceFingerprint, value.requestFingerprint, value.responseFingerprint].every(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item))
        || !Array.isArray(value.localWorkAttemptIds) || !value.localWorkAttemptIds.length || value.localWorkAttemptIds.length > 32
        || new Set(value.localWorkAttemptIds).size !== value.localWorkAttemptIds.length
        || value.localWorkAttemptIds.some(item => typeof item !== 'string' || !/^[a-f0-9]{64}$/.test(item))) throw new TypeError('Invalid A2A accepted receipt');
    assertA2aAcceptanceBinding(value.binding);
    return assertJsonDeclaration(value, 'A2A accepted receipt', 4096);
}
const integer = (value, min, max) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Run policy integer outside bounds');
    return value;
};
export function assertStoryStart(value, authority) {
    fields(value, ['schemaVersion', 'transactionId', 'narrativeField'], 'Story start');
    if (value.schemaVersion !== 1 || !authority) throw new TypeError('Story start requires authority runtime');
    taskId(value.transactionId); taskId(value.narrativeField);
    return assertJsonDeclaration(value, 'Story start', 4096);
}
export function assertRunPolicy(value, storyStart) {
    fields(value, ['schemaVersion', 'deathTransactions', 'deathOutcome'], 'Run policy');
    if (value.schemaVersion !== 1 || !storyStart || !Array.isArray(value.deathTransactions)
        || !value.deathTransactions.length || value.deathTransactions.length > 16
        || new Set(value.deathTransactions).size !== value.deathTransactions.length) throw new TypeError('Invalid run policy');
    value.deathTransactions.forEach(taskId); taskId(value.deathOutcome);
    if (value.deathTransactions.includes(storyStart.transactionId)) throw new TypeError('Story start cannot declare death');
    return assertJsonDeclaration(value, 'Run policy', 4096);
}
export function assertGenerationBudget(value, lifecycle) {
    fields(value, ['schemaVersion', 'resolverAttempts', 'narratorAttempts', 'turnAttempts', 'backgroundAttempts',
        'backgroundWindowTurns', 'backgroundPeriodTurns', 'backgroundPeriodAttempts', 'turnCounter'], 'Generation budget');
    if (value.schemaVersion !== 1) throw new TypeError('Generation budget version must be 1');
    for (const key of ['resolverAttempts', 'narratorAttempts', 'turnAttempts', 'backgroundAttempts']) integer(value[key], 1, 8);
    integer(value.backgroundWindowTurns, 1, 100); integer(value.backgroundPeriodTurns, value.backgroundWindowTurns, 1000);
    integer(value.backgroundPeriodAttempts, 1, 100);
    fields(value.turnCounter, ['domainId', 'recordId', 'field'], 'Generation turn counter');
    const { domainId, recordId, field } = value.turnCounter;
    taskId(domainId); taskId(recordId);
    if (typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field)) throw new TypeError('Invalid counter field');
    const domain = lifecycle?.domains.find(item => item.id === domainId);
    const schema = domain?.recordSchema?.properties[field];
    if (schema?.type !== 'integer' || !Number.isSafeInteger(schema.minimum) || schema.minimum < 0 || !Number.isSafeInteger(schema.maximum) || schema.maximum > Number.MAX_SAFE_INTEGER) throw new TypeError('Generation budget requires a bounded integer turn counter');
    return assertJsonDeclaration(value, 'Generation budget', 4096);
}

// Link against the exact installed declaration, rather than accepting a client
// bootstrap command, narrative, or death flag.
export function assertRunTransactions(contract, transactions) {
    const start = contract.storyStart;
    if (start) {
        const tx = transactions.find(item => item.id === start.transactionId);
        const field = tx?.receipt.schema.properties[start.narrativeField];
        const mode = tx?.inputSchema.properties.mode;
        if (!tx || tx.origin || tx.intent.expose || tx.resolution.kind !== 'deterministic'
            || tx.effects.some(item => item.kind === 'clock.advance' || item.kind === 'workflow.transition')
            || field?.type !== 'string' || field.maxLength > 16384
            || mode?.type !== 'string' || mode.enum?.length !== 2
            || !mode.enum.includes('ordinary') || !mode.enum.includes('ironman')
            || !tx.inputSchema.required?.includes('mode')) throw new TypeError('Invalid deterministic story start transaction');
    }
    for (const id of contract.runPolicy?.deathTransactions ?? []) {
        const tx = transactions.find(item => item.id === id);
        if (!tx || tx.origin || ![tx.resolution.fallback, ...tx.resolution.cases.map(item => item.outcome)].includes(contract.runPolicy.deathOutcome)) throw new TypeError('Run death must reference a declared authority outcome');
    }
}

export function assertRunState(value) {
    fields(value, ['schemaVersion', 'mode', 'status', 'sequence', 'startInvocationId', 'startFingerprint'], 'Run state');
    if (value.schemaVersion !== 1 || !['pending', 'active', 'dead'].includes(value.status)
        || !['pending', 'ordinary', 'ironman'].includes(value.mode)
        || (value.status === 'pending') !== (value.mode === 'pending')) throw new TypeError('Invalid run state');
    integer(value.sequence, 0, Number.MAX_SAFE_INTEGER);
    if (value.status !== 'pending' && (typeof value.startInvocationId !== 'string' || !/^[A-Za-z0-9._:-]{1,96}$/.test(value.startInvocationId)
        || !/^[a-f0-9]{64}$/.test(value.startFingerprint))) throw new TypeError('Run start receipt required');
    return assertJsonDeclaration(value, 'Run state', 4096);
}

// Portable continuation preserves sends spent before export. It contains no
// historical revisions or mutable world authority.
export function assertRunContinuation(value) {
    fields(value, ['operations', 'background', 'highWaterTurn', 'retiredCompute'], 'Run continuation');
    if (value.retiredCompute !== undefined) assertRetiredCompute(value.retiredCompute);
    integer(value.highWaterTurn, 0, Number.MAX_SAFE_INTEGER);
    if (!value.operations || Array.isArray(value.operations) || Object.keys(value.operations).length > 128
        || !value.background || Array.isArray(value.background) || Object.keys(value.background).length > 1000) throw new TypeError('Invalid continuation ledger');
    for (const [id, op] of Object.entries(value.operations)) {
        if (!/^[a-f0-9]{64}$/.test(id)) throw new TypeError('Invalid operation identity');
        fields(op, ['lane', 'anchor', 'fingerprint', 'selection', 'attempts', 'total', 'compute', 'taskHistories', 'externalTasks'], 'Run operation');
        if (op.externalTasks !== undefined) {
            fields(op.externalTasks, Object.keys(op.externalTasks), 'External tasks');
            if (Object.keys(op.externalTasks).length > 32) throw new TypeError('External task capacity');
            for (const [operationId, record] of Object.entries(op.externalTasks)) {
                if (typeof operationId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(operationId)) throw new TypeError('External operation identity');
                fields(record, ['protocol', 'input', 'fingerprint', 'identity', 'status', 'expiresAt', 'orchestrationBinding', 'acceptedReceipt'], 'External task');
                if (record.orchestrationBinding !== undefined) assertExternalTaskOrchestrationBinding(record.orchestrationBinding);
                if (record.acceptedReceipt !== undefined) assertA2aAcceptedReceipt(record.acceptedReceipt);
                if (record.protocol !== 'a2a' || !/^[a-f0-9]{64}$/.test(record.fingerprint)
                    || !['queued', 'dispatched', 'completed', 'unknown', 'failed'].includes(record.status)) throw new TypeError('External task evidence');
                integer(record.expiresAt, 0, Number.MAX_SAFE_INTEGER);
                fields(record.input, ['sessionId', 'revisionId', 'viewId', 'itemId', 'skillId', 'routeRef'], 'External task input');
                for (const field of ['sessionId', 'revisionId', 'viewId', 'itemId', 'skillId']) {
                    if (typeof record.input[field] !== 'string' || !record.input[field] || record.input[field].length > 256) throw new TypeError('External task source');
                }
                if (record.input.routeRef !== undefined) {
                    fields(record.input.routeRef, ['scope', 'runtimeRouteId'], 'External Route');
                    if (record.input.routeRef.scope !== 'player' || typeof record.input.routeRef.runtimeRouteId !== 'string') throw new TypeError('External Route');
                }
                if (record.identity !== null) {
                    fields(record.identity, ['id', 'contextId'], 'External acquired identity');
                    for (const field of ['id', 'contextId']) if (typeof record.identity[field] !== 'string' || !record.identity[field] || record.identity[field].length > 256) throw new TypeError('External acquired identity');
                }
                assertJsonDeclaration(record, 'External task', 8192);
            }
        }
        if (op.taskHistories !== undefined) {
            if (!op.taskHistories || Array.isArray(op.taskHistories) || Object.keys(op.taskHistories).length > sessionTaskHistoryLimits.tasks) throw new TypeError('Task history capacity');
            for (const [key, history] of Object.entries(op.taskHistories)) {
                if (!/^[a-f0-9]{64}$/.test(key)) throw new TypeError('Task history identity');
                assertSessionTaskHistory(history);
            }
        }
        if (op.compute !== undefined) assertComputeLedger(op.compute);
        if (!['turn', 'background'].includes(op.lane)) throw new TypeError('Invalid operation lane');
        fields(op.anchor, op.lane === 'background' ? ['invocationId'] : ['branchId', 'revisionId'], 'Operation anchor');
        for (const field of op.lane === 'background' ? ['invocationId'] : ['branchId', 'revisionId']) if (typeof op.anchor[field] !== 'string' || !op.anchor[field] || op.anchor[field].length > 128) throw new TypeError('Invalid operation anchor');
        integer(op.total, 0, 32);
        fields(op.attempts, ['intent_resolver', 'narrator', 'background'], 'Run attempts');
        for (const count of Object.values(op.attempts)) integer(count, 0, 8);
        if (Object.values(op.attempts).reduce((a, b) => a + b, 0) !== op.total) throw new TypeError('Invalid attempt total');
        if (op.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(op.fingerprint)) throw new TypeError('Invalid input fingerprint');
        if (op.selection !== undefined) { fields(op.selection, ['transactionId', 'input'], 'Retained selection'); taskId(op.selection.transactionId); }
    }
    for (const [window, entry] of Object.entries(value.background)) {
        if (!/^(0|[1-9][0-9]*)$/.test(window)) throw new TypeError('Invalid budget window');
        fields(entry, ['operation', 'count', 'period'], 'Background attempts');
        if (!/^[a-f0-9]{64}$/.test(entry.operation)) throw new TypeError('Invalid background operation');
        integer(entry.count, 0, 8); integer(entry.period, 0, Number.MAX_SAFE_INTEGER);
    }
    return assertJsonDeclaration(value, 'Run continuation', 131072);
}
