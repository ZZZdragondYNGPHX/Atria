import { fields } from '../../../public/shared/native-values.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { canonicalCredentialTarget } from '../model-prompt-runtime/credential-targets.js';
import { executeProjectSkillWork } from '../skill-invocation.js';
import { checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { localWorkAttemptId } from './budget-port.js';
import { assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { assertA2aAcceptanceBinding } from '../../../public/shared/native-run-contract.js';
import { readEffect } from './effect-contracts.js';
import { readRunControl } from '../run-control.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const supported = { mcp: ['tool', 'resource'], a2a: ['send'], skill: ['list', 'pin', 'read', 'files', 'catalog'] };

// Policy intersection only; admission and accounting stay in the original bank.
function workLimits(granted, route) {
    const grant = assertComputeBudget(granted), original = route ? assertComputeBudget(route) : grant;
    if (!grant.localWork || !original.localWork) fail('native_orchestration_tool_budget_unavailable');
    return { maxRequests: Math.min(grant.maxRequests, original.maxRequests), maxTokens: Math.min(grant.maxTokens, original.maxTokens),
        localWork: Object.fromEntries(Object.keys(grant.localWork).map(key => [key, Math.min(grant.localWork[key], original.localWork[key])])) };
}

// Internal Host adapter only. Descriptors, inputs and grants come from original
// authorities, never from remote metadata or a browser's approval Boolean.
export class ToolPort {
    constructor({ mcpService, a2aService, skillAuthority, budgetPort, verifyDispatch, readInput, authorizeTool, credentialAuthority, runs }) {
        if (![verifyDispatch, readInput, authorizeTool].every(fn => typeof fn === 'function') || !budgetPort)
            throw new TypeError('ToolPort requires original dispatch, input, grant and budget authorities');
        Object.assign(this, { mcpService, a2aService, skillAuthority, budgetPort, verifyDispatch, readInput, authorizeTool, credentialAuthority, runs });
    }

    #acceptanceBinding(intent) {
        return assertA2aAcceptanceBinding(Object.fromEntries(['schemaVersion', 'runId', 'effectId', 'epoch', 'sourceBindingDigest', 'grantDigest',
            'inputHash', 'endpointBindingDigest', 'budgetEnvelopeDigest', 'budgetAttemptRef'].map(key => [key, intent[key]])));
    }

    async execute(handle, request, { signal } = {}) {
        fields(request, ['runId', 'effectId', 'dispatchToken'], 'Tool dispatch');
        const proof = await this.verifyDispatch({ handle, ...request });
        const { root, intent } = proof ?? {};
        if (!root || !intent || root.runId !== request.runId || intent.effectId !== request.effectId
            || intent.runId !== root.runId || intent.status !== 'dispatching' || !request.dispatchToken
            || intent.dispatchToken !== request.dispatchToken) fail('native_orchestration_tool_dispatch_denied');
        const action = intent.actionRef;
        fields(action, ['protocol', 'operation'], 'Tool action');
        if (!supported[action.protocol]?.includes(action.operation)) fail('native_orchestration_tool_action_unavailable');
        // These original consumers support bounded Skill reads / external data
        // only. No original destructive action or isolated Review is wired here.
        if (!['R0', 'R1'].includes(intent.risk) || intent.requiresApproval || intent.approvalRef !== null)
            fail('native_orchestration_tool_approval_unavailable');
        if (action.protocol !== 'skill' && intent.risk !== 'R1') fail('native_orchestration_tool_risk_invalid');
        const input = await this.readInput({ handle, inputRef: intent.inputRef });
        if (hash(input) !== intent.inputHash) fail('native_orchestration_tool_input_stale');
        const service = action.protocol === 'mcp' ? this.mcpService : this.a2aService;
        let captured, skill;
        if (action.protocol === 'skill') {
            if (typeof this.skillAuthority !== 'function') fail('native_orchestration_tool_action_unavailable');
            skill = await this.skillAuthority({ handle, root, intent, input });
            if (!skill?.repository || typeof skill.revalidate !== 'function') fail('native_orchestration_tool_action_unavailable');
        } else {
            if (!service?.publicWork) fail('native_orchestration_tool_action_unavailable');
            if (root.budgetAuthorityRef?.domain !== 'session' || input.sessionId !== root.budgetAuthorityRef.sessionId)
                fail('native_orchestration_tool_source_denied');
            fields(intent.targetRef, ['connectionProfileId'], 'External Tool target');
            captured = await service.publicWork.capture(handle, input);
            if (captured.fallback || captured.connection.connectionProfileId !== intent.targetRef.connectionProfileId
                || hash(canonicalCredentialTarget(captured.connection)) !== intent.endpointBindingDigest)
                fail('native_orchestration_tool_target_stale');
            if (action.protocol === 'mcp' && (action.operation === 'tool' ? !input.toolName || input.resourceUri !== undefined : !input.resourceUri || input.toolName !== undefined))
                fail('native_orchestration_tool_action_invalid');
        }
        const authorize = async () => {
            checkCancellation(signal);
            const current = await this.verifyDispatch({ handle, ...request });
            if (!current?.root || !current?.intent || hash(current.intent) !== hash(intent)
                || hash(current.root.budgetAuthorityRef) !== hash(root.budgetAuthorityRef)) fail('native_orchestration_tool_dispatch_denied');
            const grant = await this.authorizeTool({ handle, root: current.root, intent, input, captured });
            for (const key of ['grantDigest', 'egressDigest', 'sourceBindingDigest', 'capability'])
                if (!grant || grant[key] !== intent[key]) fail('native_orchestration_tool_grant_denied');
            if (!grant.limits) fail('native_orchestration_tool_budget_unavailable');
            if (captured) {
                if (!await service.publicWork.fresh(handle, input, captured)) fail('native_orchestration_tool_source_stale');
                if (captured.policy.auth === 'secret') {
                    if (!this.credentialAuthority) fail('native_orchestration_tool_credential_unavailable');
                    await this.credentialAuthority.assertConnection(handle, captured.connection);
                }
            } else await skill.revalidate();
            return grant;
        };
        const grant = await authorize();
        const reservationId = intent.budgetAttemptRef?.reservationId ?? null;
        if (hash(intent.budgetAttemptRef?.authorityRef ?? null) !== hash(root.budgetAuthorityRef))
            fail('native_orchestration_tool_budget_unavailable');
        let ordinal = intent.budgetAttemptRef.kind === 'local_work' ? intent.budgetAttemptRef.localWorkOrdinal + 1 : 0;
        const localWorkAttemptIds = [];
        const localOrdinals = new Map();
        const work = {
            orchestrationBinding: { schemaVersion: 1, runId: root.runId, effectId: intent.effectId,
                sourceBindingDigest: intent.sourceBindingDigest, grantDigest: intent.grantDigest },
            ...(action.protocol === 'a2a' && this.runs ? { acceptanceBinding: this.#acceptanceBinding(intent) } : {}),
            localWorkAttemptIds: () => [...localWorkAttemptIds],
            assertCurrent: authorize,
            nextAttemptId: () => {
                const next = ordinal++, attemptId = localWorkAttemptId(intent.effectId, next);
                localOrdinals.set(attemptId, next); return attemptId;
            },
            chargeLocalWork: async (routeLimits, attempt) => {
                if (!localOrdinals.has(attempt.attemptId)) fail('native_orchestration_tool_budget_unavailable');
                const row = await this.budgetPort.chargeLocalWork(handle,
                    { authorityRef: root.budgetAuthorityRef, reservationId, limits: workLimits(grant.limits, routeLimits), attempt,
                        effectId: intent.effectId, localWorkOrdinal: localOrdinals.get(attempt.attemptId) });
                if (row) localWorkAttemptIds.push(attempt.attemptId);
                return row;
            },
            settleLocalWork: (attemptId, usage) => this.budgetPort.settleLocalWork(handle, root.budgetAuthorityRef, attemptId, usage),
        };
        if (captured) {
            const started = await service.start(handle, input, signal, work);
            if (!started.operationId) return { outcome: 'not_dispatched', operationRef: null, reason: started.reason };
            // The original operation identity can be queried, but it is not a
            // durable Effect-correlated receipt. Recovery must never resend it.
            return { outcome: 'unknown', operationRef: { protocol: action.protocol, operationId: started.operationId,
                ...(action.protocol === 'a2a' ? { sessionId: input.sessionId } : {}) }, receiptRef: null };
        }
        const compute = {
            assertCurrent: authorize,
            beforeLocalWork: async ({ items, inputBytes, indexPath, kind }) => {
                const attemptId = work.nextAttemptId();
                const row = await work.chargeLocalWork(null, { attemptId, requestId: indexPath, kind, estimatedItems: items,
                    estimatedInputBytes: inputBytes, targetFingerprint: intent.inputHash });
                if (!row) fail('native_orchestration_tool_budget_unavailable');
                return { attemptId };
            },
            settleLocalWork: (ticket, usage) => work.settleLocalWork(ticket.attemptId, usage),
        };
        const result = await executeProjectSkillWork({ operation: action.operation, input, compute, repository: skill.repository,
            settings: skill.settings, projectId: skill.projectId, signal });
        return { outcome: 'unknown', operationRef: null, receiptRef: null, result };
    }

    async #acceptedObservation({ handle, tx, root, intent, operationRef }) {
        fields(operationRef, ['protocol', 'operationId', 'sessionId'], 'A2A accepted operation reference');
        if (intent.actionRef.protocol !== 'a2a' || intent.actionRef.operation !== 'send' || root.ownerRef.handle !== handle
            || root.sourceBinding.sourceAuthority !== 'native_session' || operationRef.protocol !== 'a2a'
            || operationRef.sessionId !== root.sourceBinding.sourceRef.sessionId) return null;
        const anchor = { branchId: root.sourceBinding.sourceRef.branchId, revisionId: root.sourceBinding.sourceRef.revisionId };
        const receipt = await this.a2aService?.acceptedObservation(handle, { ...operationRef, anchor }, { tx });
        if (!receipt || hash(receipt.binding) !== hash(this.#acceptanceBinding(intent))
            || hash(receipt.binding.budgetAttemptRef.authorityRef) !== hash(root.budgetAuthorityRef)) return null;
        const ref = receipt.binding.budgetAttemptRef, firstOrdinal = ref.localWorkOrdinal + 1;
        if (receipt.localWorkAttemptIds.some((id, i) => id !== localWorkAttemptId(intent.effectId, firstOrdinal + i))) return null;
        const bank = (await readRunControl(tx, handle, operationRef.sessionId))?.operations[root.budgetAuthorityRef.operationId]?.compute;
        const attemptIds = [ref.attemptId, ...receipt.localWorkAttemptIds];
        if (attemptIds.some((id, i) => {
            const row = bank?.localWork?.find(item => item.attemptId === id);
            return !row || row.status !== 'settled' || row.usage?.outcome !== 'completed' || (row.reservationId ?? null) !== ref.reservationId
                || hash(row.orchestration ?? null) !== hash({ kind: 'local_work', effectId: intent.effectId, ordinal: ref.localWorkOrdinal + i });
        })) return null;
        await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: ref });
        const receiptRef = { ...operationRef, receiptDigest: hash(receipt) };
        return { observationId: 'a2a.accepted:' + operationRef.operationId, observedEpoch: intent.epoch, outcome: 'confirmed',
            dispatchEvidence: { kind: 'original_port_observation', reference: receiptRef }, remoteOperationRef: operationRef, domainReceiptRef: null,
            budgetObservationRef: { authorityRef: root.budgetAuthorityRef, attemptIds, receiptDigest: hash(receipt) }, resultRefs: [],
            sourceRefs: [root.sourceBinding.sourceRef], reasonCode: 'a2a_send_accepted' };
    }

    // EffectController invokes this inside its transaction. Historical accepted
    // facts are checked against the frozen Effect, never a fresh send claim.
    async verifyObservation({ handle, tx, root, intent, observation }) {
        const persisted = (await readEffect(tx, handle, root, intent.effectId)).doc;
        if (hash(persisted) !== hash(intent)) fail('native_orchestration_tool_observation_invalid');
        const expected = await this.#acceptedObservation({ handle, tx, root, intent, operationRef: observation.remoteOperationRef ?? {} });
        if (!expected || hash(expected) !== hash(observation)) fail('native_orchestration_tool_observation_invalid');
        return expected;
    }

    async observe(handle, operationRef, effectRef) {
        fields(operationRef, ['protocol', 'operationId', 'sessionId'], 'Tool operation reference');
        if (operationRef.protocol === 'a2a' && effectRef && this.runs) {
            fields(effectRef, ['runId', 'effectId'], 'Tool Effect reference');
            const observation = await this.runs.engine.withTransaction(handle, async tx => {
                const root = await this.runs.get(handle, effectRef.runId);
                const intent = (await readEffect(tx, handle, root, effectRef.effectId)).doc;
                return this.#acceptedObservation({ handle, tx, root, intent, operationRef });
            });
            if (observation) return { outcome: 'confirmed', operationRef, receiptRef: observation.dispatchEvidence.reference, observation };
            return { outcome: 'unknown', operationRef, receiptRef: null, reason: 'native_a2a_accepted_receipt_unavailable' };
        }
        const service = operationRef.protocol === 'mcp' ? this.mcpService : operationRef.protocol === 'a2a' ? this.a2aService : null;
        if (!service) fail('native_orchestration_tool_action_unavailable');
        const { protocol: _protocol, ...ref } = operationRef;
        try {
            const status = await service.status(handle, ref);
            return { outcome: 'unknown', operationRef, receiptRef: null, status: status.status, current: status.current };
        } catch (error) {
            if (!/^native_(mcp|a2a)_(operation_missing|source_stale)$/.test(error.code ?? '')) throw error;
            return { outcome: 'unknown', operationRef, receiptRef: null, reason: error.code };
        }
    }

    requestCancel(handle, operationRef) {
        fields(operationRef, ['protocol', 'operationId', 'sessionId'], 'Tool operation reference');
        const service = operationRef.protocol === 'mcp' ? this.mcpService : operationRef.protocol === 'a2a' ? this.a2aService : null;
        if (!service) fail('native_orchestration_tool_action_unavailable');
        // Original local scheduler cancellation only. A remote CancelTask is an
        // additional external Effect requiring its own exact authorization.
        return { cancelled: service.scheduler.cancel(handle, operationRef.operationId), outcome: 'unknown', remoteRollbackConfirmed: false };
    }
}
