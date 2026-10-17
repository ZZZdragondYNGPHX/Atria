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
import { ContextPort } from './context-port.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertContextCompilation } from './generation-local-work.js';
import { getNativeReviewOrigin } from './review-origin.js';
import { ContextRetrievalPort } from './context-retrieval-port.js';

const fail = code => { throw new ConflictError(code); };

/** Internal Host composition. No generic HTTP dispatcher or permissive default authority. */
export function createOrchestrationExecutionService({ engine, sessionCore, projectAgent, projectRepository, rpControl, effectAuthority, retrievalTransport = null }) {
    const lifecycle = engine.nativeHostLifecycle;
    if (!lifecycle) throw new TypeError('Original Native Host ownership is required');
    for (const method of ['authorize', 'verifySend', 'verifyObservation', 'verifyApproval']) if (typeof effectAuthority?.[method] !== 'function') throw new TypeError('Original Effect authority requires ' + method);
    const budgetPort = new BudgetPort({ sessionCore, projectAgent, projectRepository, rpControl });
    const sourcePort = new SourcePort({ budgetPort, sessionCore, projectAgent, rpControl });
    const review = getNativeReviewOrigin(engine);
    const runs = new RunRepository({ engine, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
        authorize: async ({ handle }) => { if (typeof handle !== 'string' || !handle) throw new TypeError('Authenticated owner is required'); },
        admit: ({ handle, tx, sourceRequest }) => sourcePort.capture(handle, sourceRequest, { tx }) });
    let contextRetrieval;
    const effects = new EffectController({ runs,
        authorizeEffect: async args => {
            await sourcePort.revalidate(args.handle, args.root.sourceBinding, { tx: args.tx, root: args.root });
            return (args.proposal ?? args.intent)?.actionRef.kind === 'context_retrieval' ? contextRetrieval.authorize(args) : effectAuthority.authorize(args);
        },
        verifyBudgetAttempt: args => budgetPort.verifyBudgetAttempt(args),
        verifyObservation: args => args.intent.actionRef.kind === 'context_retrieval' ? contextRetrieval.verifyObservation(args) : effectAuthority.verifyObservation(args), verifyApproval: async args => {
            await effectAuthority.verifyApproval(args);
            await review.authority.verifyApproval(args);
        } });
    contextRetrieval = new ContextRetrievalPort({ runs, effects, budgetPort, sourcePort, transport: retrievalTransport, authorizeModel: args => effectAuthority.authorize(args) });
    const approvals = review.authority.connect({ runs, effects, describeReview: effectAuthority.describeReview?.bind(effectAuthority) });
    const delegates = new DelegateController({ runs,
        authorizeDelegation: async args => {
            await sourcePort.revalidate(args.handle, args.parent.sourceBinding, { tx: args.tx, root: args.parent });
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
            await sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
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
        await sourcePort.revalidate(handle, root.sourceBinding, { root });
        const assertContext = async (candidate, current, intent) => {
            if (!(candidate?.port instanceof ContextPort) || candidate.compiled?.request?.sourceBinding.bindingDigest !== current.sourceBinding.bindingDigest
                || candidate.compiled.request.grantDigest !== intent.grantDigest) fail('native_orchestration_context_denied');
            await candidate.port.revalidate(handle, { context: candidate.compiled, phase: 'send' });
        };
        const preparedEffect = () => engine.withTransaction(handle, async tx => {
            const fence = await lifecycle.assertWriter(handle, tx), current = await runs.get(handle, runId);
            await assertChildRunCurrent(tx, handle, current);
            const { doc: intent } = await readEffect(tx, handle, current, effectId);
            if (token || current.cancelRequested || current.status !== 'running' || intent.status !== 'prepared' || intent.epoch !== current.epoch
                || current.hostBootId !== fence.hostBootId || current.hostGeneration !== fence.generation
                || intent.hostBootId !== current.hostBootId || intent.hostGeneration !== current.hostGeneration
                || intent.sourceBindingDigest !== current.sourceBinding.bindingDigest) fail('native_orchestration_effect_not_prepared');
            await sourcePort.revalidate(handle, current.sourceBinding, { tx, root: current });
            const decision = await effectAuthority.authorize({ handle, tx, root: current, intent, phase: 'prepare_context' });
            if (hashNativeDocument(decision) !== hashNativeDocument(effectDecision(intent))) fail('native_orchestration_effect_authority_changed');
            return { current, intent };
        });
        let token = null;
        let actualContext = null, bindingContext = false;
        const initial = await preparedEffect();
        if (context !== undefined) {
            fields(context, ['port', 'compiled'], 'Generation Context');
            await assertContext(context, initial.current, initial.intent);
            actualContext = Object.freeze({ port: context.port, compiled: context.compiled });
        }
        const bank = budgetPort.sendBank(handle, { authorityRef: root.budgetAuthorityRef, reservationId, limits, effectId, firstOrdinal: 0, quotaProof,
            assertCurrent: async () => {
                await sourcePort.revalidate(handle, root.sourceBinding, { root });
                if (token) await assertDispatch({ handle, runId, effectId, dispatchToken: token });
                else await preparedEffect();
            } });
        return { bank, get context() { return actualContext ?? undefined; }, ...(quotaProof ? { quotaProof } : {}),
            bindContext: async candidate => {
                fields(candidate, ['port', 'compiled', 'compileProof'], 'Metered Generation Context');
                if (actualContext || bindingContext) fail('native_orchestration_context_already_bound');
                bindingContext = true;
                try {
                    const { current, intent } = await preparedEffect();
                    await assertContext(candidate, current, intent);
                    // Only the original metered compile proof can authorize
                    // reusing Context work on this same original send bank.
                    await assertContextCompilation({ proof: candidate.compileProof, handle, bank, port: candidate.port, compiled: candidate.compiled, root: current, intent });
                    await preparedEffect();
                    actualContext = Object.freeze({ port: candidate.port, compiled: candidate.compiled, compileProof: candidate.compileProof });
                } finally { bindingContext = false; }
            }, beforeSend: async ({ receipt, prepared, resolved, snapshot, compiledBinding, budgetAttemptRef }) => {
                const expectedSend = compiledSendIdentity({ snapshot, resolved });
                if (hashNativeDocument(compiledBinding) !== hashNativeDocument(snapshot.diagnostics.compiledBinding)
                || hashNativeDocument(budgetAttemptRef) !== hashNativeDocument(receipt.budgetAttemptRef)) fail('native_orchestration_budget_attempt_invalid');
                if (!token) {
                    const { current, intent } = await preparedEffect();
                    if (actualContext) await assertContext(actualContext, current, intent);
                    await effects.ready(handle, { ...runGuard(await runs.get(handle, runId)), effectId, budgetAttemptRef: receipt.budgetAttemptRef });
                    const claim = await effects.claim(handle, { ...runGuard(await runs.get(handle, runId)), effectId });
                    if (!claim.claimed || !claim.dispatchToken) fail('native_orchestration_dispatch_stale');
                    token = claim.dispatchToken;
                }
                const current = await assertDispatch({ handle, runId, effectId, dispatchToken: token });
                if (actualContext) {
                    await assertContext(actualContext, current.root, current.intent);
                    if (actualContext.compileProof) await assertContextCompilation({ proof: actualContext.compileProof, handle, bank, port: actualContext.port, compiled: actualContext.compiled, ...current });
                }
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
        await sourcePort.revalidate(handle, parent.sourceBinding, { root: parent });
        return budgetPort.reserveChild(handle, { authorityRef: parent.budgetAuthorityRef, parentReservationId: parent.parentRef ? parent.runId : null, childRunId, ceiling, limits });
    }
    return { runs, effects, approvals, delegates, budgetPort, sourcePort, generationSend, assertDispatch, reserveChild, contextRetrieval };
}
