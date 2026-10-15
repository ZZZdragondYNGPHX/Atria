import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument } from '../repositories/common.js';
import { BudgetPort } from './budget-port.js';
import { SourcePort } from './source-port.js';
import { RunRepository, assertChildRunCurrent, assertRunTreeConcurrency } from './run-repository.js';
import { DelegateController } from './delegate-controller.js';
import { EffectController } from './effect-controller.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { runGuard } from './controller-common.js';
import { compiledSendIdentity } from '../model-prompt-runtime/compiled-binding.js';

const fail = code => { throw new ConflictError(code); };

/** Internal Host composition. No generic HTTP dispatcher or permissive default authority. */
export function createOrchestrationExecutionService({ engine, sessionCore, projectAgent, projectRepository, rpControl, effectAuthority }) {
    const lifecycle = engine.nativeHostLifecycle;
    if (!lifecycle) throw new TypeError('Original Native Host ownership is required');
    for (const method of ['authorize', 'verifySend', 'verifyObservation', 'verifyApproval']) if (typeof effectAuthority?.[method] !== 'function') throw new TypeError('Original Effect authority requires ' + method);
    const budgetPort = new BudgetPort({ sessionCore, projectAgent, projectRepository, rpControl });
    const sourcePort = new SourcePort({ budgetPort, sessionCore, projectAgent, rpControl });
    const runs = new RunRepository({ engine, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
        authorize: async ({ handle }) => { if (typeof handle !== 'string' || !handle) throw new TypeError('Authenticated owner is required'); },
        admit: ({ handle, tx, sourceRequest }) => sourcePort.capture(handle, sourceRequest, { tx }) });
    const effects = new EffectController({ runs,
        authorizeEffect: async args => { await sourcePort.revalidate(args.handle, args.root.sourceBinding, { tx: args.tx }); return effectAuthority.authorize(args); },
        verifyBudgetAttempt: args => budgetPort.verifyBudgetAttempt(args),
        verifyObservation: args => effectAuthority.verifyObservation(args), verifyApproval: args => effectAuthority.verifyApproval(args) });
    const delegates = new DelegateController({ runs,
        authorizeDelegation: async args => {
            await sourcePort.revalidate(args.handle, args.parent.sourceBinding, { tx: args.tx });
            if (typeof effectAuthority.authorizeDelegation !== 'function') fail('native_orchestration_delegation_unavailable');
            return effectAuthority.authorizeDelegation(args);
        }, verifyReservation: args => budgetPort.verifyReservation(args) });

    async function assertDispatch({ handle, runId, effectId, dispatchToken }) {
        return engine.withTransaction(handle, async tx => {
            const fence = await lifecycle.assertWriter(handle, tx), root = await runs.get(handle, runId);
            await assertChildRunCurrent(tx, handle, root);
            await assertRunTreeConcurrency(tx, handle, root);
            const { doc: intent } = await readEffect(tx, handle, root, effectId);
            if (!dispatchToken || root.cancelRequested || root.status !== 'running' || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                || intent.status !== 'dispatching' || intent.dispatchToken !== dispatchToken || intent.epoch !== root.epoch
                || intent.hostBootId !== root.hostBootId || intent.hostGeneration !== root.hostGeneration) fail('native_orchestration_dispatch_stale');
            await sourcePort.revalidate(handle, root.sourceBinding, { tx });
            const decision = await effectAuthority.authorize({ handle, tx, root, intent, phase: 'dispatch' });
            if (hashNativeDocument(decision) !== hashNativeDocument(effectDecision(intent))) fail('native_orchestration_effect_authority_changed');
            return { root, intent };
        });
    }

    /**
     * The original bank admits in GenerationHost immediately before send; only
     * then do ready/claim commit. Unknown ACKs never run this hook or resend.
     * A fresh Effect claim covers its bounded provider retries/fallbacks, each
     * of which still gets its own original bank admission and currentness check.
     */
    async function generationSend(handle, { runId, effectId, reservationId = null, limits, context, quotaProof }) {
        const root = await runs.get(handle, runId);
        if (root.parentRef ? reservationId !== root.runId : reservationId !== null && reservationId !== root.runId) fail('native_orchestration_budget_reservation_mismatch');
        await sourcePort.revalidate(handle, root.sourceBinding);
        await engine.withTransaction(handle, async tx => {
            await assertChildRunCurrent(tx, handle, root);
            const { doc: intent } = await readEffect(tx, handle, root, effectId);
            if (intent.status !== 'prepared') fail('native_orchestration_effect_not_prepared');
            if (context && (context.compiled.request.sourceBinding.bindingDigest !== root.sourceBinding.bindingDigest
                || context.compiled.request.grantDigest !== intent.grantDigest)) fail('native_orchestration_context_denied');
        });
        let token = null;
        const bank = budgetPort.sendBank(handle, { authorityRef: root.budgetAuthorityRef, reservationId, limits, effectId, firstOrdinal: 0, quotaProof,
            assertCurrent: async () => {
                await sourcePort.revalidate(handle, root.sourceBinding);
                if (token) await assertDispatch({ handle, runId, effectId, dispatchToken: token });
            } });
        return { bank, ...(context ? { context } : {}), ...(quotaProof ? { quotaProof } : {}), beforeSend: async ({ receipt, prepared, resolved, snapshot, compiledBinding, budgetAttemptRef }) => {
            const expectedSend = compiledSendIdentity({ snapshot, resolved });
            if (hashNativeDocument(compiledBinding) !== hashNativeDocument(snapshot.diagnostics.compiledBinding)
                || hashNativeDocument(budgetAttemptRef) !== hashNativeDocument(receipt.budgetAttemptRef)) fail('native_orchestration_budget_attempt_invalid');
            if (!token) {
                await effects.ready(handle, { ...runGuard(await runs.get(handle, runId)), effectId, budgetAttemptRef: receipt.budgetAttemptRef });
                const claim = await effects.claim(handle, { ...runGuard(await runs.get(handle, runId)), effectId });
                if (!claim.claimed || !claim.dispatchToken) fail('native_orchestration_dispatch_stale');
                token = claim.dispatchToken;
            }
            const current = await assertDispatch({ handle, runId, effectId, dispatchToken: token });
            await effectAuthority.verifySend({ handle, ...current, prepared, resolved, snapshot, compiledBinding, budgetAttemptRef });
            await engine.withTransaction(handle, tx => budgetPort.verifyBudgetAttempt({ handle, tx, ...current, budgetAttemptRef, expectedSend }));
        } };
    }

    async function reserveChild(handle, { parentRunId, childRunId, ceiling, limits }) {
        // This does not authorize or create a child Run. The Delegate controller
        // must first persist the exact parentRef/root authority, then transfer
        // capacity outside its Host transaction. Failure leaves that child blocked.
        const parent = await runs.get(handle, parentRunId), child = await runs.get(handle, childRunId);
        if (parent.cancelRequested || !['admitted', 'running'].includes(parent.status) || child.cancelRequested || child.status !== 'admitted'
            || child.parentRef?.parentRunId !== parent.runId || child.rootRunId !== parent.rootRunId
            || hashNativeDocument(child.budgetAuthorityRef) !== hashNativeDocument(parent.budgetAuthorityRef)
            || child.sourceBinding.bindingDigest !== parent.sourceBinding.bindingDigest) fail('native_orchestration_child_authority_invalid');
        if (hashNativeDocument(ceiling) !== hashNativeDocument(child.parentRef.budgetCeiling)) fail('native_orchestration_budget_reservation_mismatch');
        await sourcePort.revalidate(handle, parent.sourceBinding);
        return budgetPort.reserveChild(handle, { authorityRef: parent.budgetAuthorityRef, parentReservationId: parent.parentRef ? parent.runId : null, childRunId, ceiling, limits });
    }
    return { runs, effects, delegates, budgetPort, sourcePort, generationSend, assertDispatch, reserveChild };
}
