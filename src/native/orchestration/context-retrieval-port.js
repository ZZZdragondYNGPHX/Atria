import { ConflictError } from '../../storage/errors.js';
import { NativeRetrievalPersistence } from '../retrieval-persistence.js';
import { resolveRetrievalSecret } from '../retrieval-execution.js';
import { retrievalSendIdentity, retrievalPostTarget } from '../retrieval-send-contracts.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { ContextPort } from './context-port.js';
import { assertOriginalSendBank, BudgetPort } from './budget-port.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { runGuard, readAttempt, controlRecordKey } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { createNativeId } from '../identity.js';
import { rerank } from '../../vectors/rerank.js';
import { buildMemoryCorpus } from '../../../public/scripts/agents/memory/hybrid-retrieval.js';
import { contextRetrievalDecision, contextRetrievalCompletionBinding as completionBinding, contextRetrievalReceiptId } from './context-retrieval-contracts.js';
import { NativeModelPromptPersistence } from '../model-prompt-runtime/persistence.js';
import { optionalComputeOptions } from '../../../public/shared/native-compute-budget.js';

const fail = (code = 'native_orchestration_context_retrieval_denied') => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const binding = root => hash({ runId: root.runId, ownerRef: root.ownerRef, epoch: root.epoch, hostBootId: root.hostBootId,
    hostGeneration: root.hostGeneration, planRef: root.planRef, sourceBinding: root.sourceBinding, budgetAuthorityRef: root.budgetAuthorityRef });
const proposalOf = value => Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(field => [field, value[field]]));

/** Original Context compiler → exact Profile/protocol → original Effect/bank.
 * Tokens and response proofs are instance-private and never restored from JSON.
 */
export class ContextRetrievalPort {
    #scopes = new WeakMap();
    #models = new Map();
    #effects = new Map();
    #observations = new WeakMap();
    #proofs = new WeakMap();
    #skips = new WeakSet();
    constructor({ runs, effects, budgetPort, sourcePort, authorizeModel }) {
        Object.assign(this, { runs, effects, budgetPort, sourcePort, authorizeModel });
        this.retrieval = new NativeRetrievalPersistence({ engine: runs.engine });
        this.persistence = new NativeModelPromptPersistence({ engine: runs.engine });
    }

    async #current(scope, { tx, allowSent = false } = {}) {
        if (scope.closed) fail();
        const root = await this.runs.get(scope.handle, scope.runId);
        if (root.cancelRequested || root.status !== 'running' || binding(root) !== scope.rootBinding) fail();
        const read = async active => {
            const parent = (await readEffect(active, scope.handle, root, scope.modelEffectId)).doc;
            if (parent.nodeAttemptId !== scope.attemptId || parent.capability !== 'generation.send'
                || !(allowSent ? ['prepared', 'ready', 'dispatching', 'confirmed'] : ['prepared']).includes(parent.status)
                || parent.epoch !== root.epoch || parent.grantDigest !== scope.request.grantDigest
                || !allowSent && (parent.budgetAttemptRef !== null || parent.dispatchToken !== null)) fail();
            await this.sourcePort.revalidate(scope.handle, root.sourceBinding, { tx: active, root });
            const decision = await this.authorizeModel({ handle: scope.handle, tx: active, root, intent: parent, phase: 'context_retrieval' });
            if (!equal(decision, effectDecision(parent))) fail();
            if (!equal(await this.runs.get(scope.handle, scope.runId), root)) fail();
            return { root, parent };
        };
        return tx ? read(tx) : this.runs.engine.withTransaction(scope.handle, read);
    }

    async createCompilation(handle, { port, request, bank, root, modelEffectId, limits, actualInput, signal }) {
        if (!(port instanceof ContextPort) || !(this.budgetPort instanceof BudgetPort) || root.ownerRef.handle !== handle
            || root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef !== null || root.graph.nodes.length !== 2
            || !equal(root.sourceBinding, request.sourceBinding)) fail();
        assertOriginalSendBank(bank, { budgetPort: this.budgetPort, handle, authorityRef: root.budgetAuthorityRef, effectId: modelEffectId });
        if (!equal(await ContextPort.prototype.compilationDescriptor.call(port, handle, request), actualInput)) fail();
        const key = hash({ handle, runId: root.runId, modelEffectId });
        if (this.#models.has(key)) fail('native_orchestration_context_retrieval_replayed');
        const scope = { handle, runId: root.runId, rootBinding: binding(root), modelEffectId, request: cloneNativeDocument(request),
            memoryDescriptorDigest: hash(actualInput.memoryDescriptor), limits: cloneNativeDocument(limits), signal, used: false, effectIds: [] };
        const { parent } = await this.runs.engine.withTransaction(handle, async tx => ({ parent: (await readEffect(tx, handle, root, modelEffectId)).doc }));
        scope.attemptId = parent.nodeAttemptId;
        if (parent.budgetEnvelopeDigest !== hash(limits)) fail();
        const route = await this.persistence.getRuntimeRoute(handle, parent.actionRef.runtimeRouteId);
        if (!route?.executionPolicy || !equal(route.executionPolicy.computeBudget, limits)) fail();
        scope.computeOptions = cloneNativeDocument(optionalComputeOptions(route.executionPolicy, 'rerank'));
        const node = root.graph.nodes.find(node => node.nodeId === request.inputRefs[0]?.nodeId);
        if (!node?.capabilities.includes('memory.retrieve') || node.nodeId !== (await this.runs.engine.withTransaction(handle, tx => readAttempt(tx, handle, root, parent.nodeAttemptId))).doc.nodeId) fail();
        await this.#current(scope);
        const token = Object.freeze({}); this.#scopes.set(token, scope); this.#models.set(key, scope); return token;
    }

    /** End the original producer's private lifetime without changing durable
     * Effects, fees, reservations or unknown observations. */
    releaseCompilation(handle, { runId, modelEffectId }) {
        const key = hash({ handle, runId, modelEffectId }), scope = this.#models.get(key);
        if (!scope) return;
        scope.closed = true;
        for (const effectId of scope.effectIds) this.#effects.delete(effectId);
        this.#models.delete(key);
    }

    async openRecall(handle, token, { descriptor, legal, query, assertCurrent }) {
        const scope = this.#scopes.get(token), settings = descriptor.settings.value;
        if (!scope || scope.handle !== handle || scope.used || scope.memoryDescriptorDigest !== hash(descriptor)
            || settings.nativeRetrieval?.embed || !settings.rerankEnabled || !settings.nativeRetrieval?.rerank) fail();
        scope.used = true;
        const { root } = await this.#current(scope), ref = settings.nativeRetrieval.rerank;
        const profile = await this.retrieval.getExact(handle, ref);
        const plan = await this.runs.engine.withTransaction(handle, tx => readPlanRevision(tx, handle, root.planRef));
        const node = root.graph.nodes.find(node => node.nodeId === scope.request.inputRefs[0].nodeId);
        const pins = plan.dependencyPins.filter(pin => pin.port === 'context' && node.dependencyPinIds.includes(pin.pinId));
        if (profile.mode !== 'rerank' || pins.length !== 1 || !equal(pins[0].resourceRef, ref) || pins[0].integrity !== hash(profile)) fail();
        const permitted = new Set(buildMemoryCorpus(legal).documents.map(doc => doc.text));
        const current = async () => { scope.signal?.throwIfAborted(); await assertCurrent(); await this.#current(scope); };
        await current();
        let invoked = false, completed = false;
        const service = { admitCorpus: async () => { await current(); return { admitted: true, metered: false }; },
            rerank: async ({ query: actualQuery, documents, topK, profile: actualProfile }) => {
                if (invoked || actualQuery !== query || !equal(actualProfile, { nativeRetrievalRef: ref })
                    || !Array.isArray(documents) || !documents.length || documents.length > 64
                    || documents.some(doc => !permitted.has(doc.text)) || topK !== documents.length) fail();
                invoked = true; await current();
                try {
                    const response = await this.#rerank(scope, { profile, documents, topK, query, current,
                        descriptorDigest: hash(descriptor), corpusDigest: hash({ key: legal.key, state: legal.state, chat: legal.chat, eligibility: legal.eligibility?.identity ?? null }) });
                    completed = true; return response;
                } catch (error) {
                    // Only this instance's pre-Effect, zero-send decision can
                    // retain the original optional lexical fallback.
                    if (this.#skips.has(error)) completed = true;
                    throw error;
                }
            } };
        return { service, rerankProfile: { nativeRetrievalRef: ref }, finish: async () => {
            await current(); if (invoked && !completed) fail('native_orchestration_context_retrieval_unresolved');
            const proof = Object.freeze({}); this.#proofs.set(proof, { scope, effectIds: [...scope.effectIds] }); return proof;
        } };
    }

    async authorize({ handle, tx, root, proposal, intent }) {
        const value = proposal ?? intent, state = this.#effects.get(value.inputRef.retrievalEffectId);
        if (!state || state.scope.handle !== handle || root.runId !== state.scope.runId || !equal(proposalOf(value), proposalOf(state.decision))) fail();
        await state.current(); await this.#current(state.scope, { tx });
        if (!equal(await this.retrieval.getExact(handle, retrievalRef(state.profile)), state.profile)) fail();
        if (intent && !equal(effectDecision(intent), state.decision)) fail();
        return cloneNativeDocument(state.decision);
    }

    async #rerank(scope, { profile, documents, topK, query, current, descriptorDigest, corpusDigest }) {
        const handle = scope.handle, effectId = createNativeId('orchestrationEffect');
        const body = { model: profile.model, query, documents: documents.map(doc => doc.text), top_n: topK };
        const upperBound = Math.max(1, Buffer.byteLength(JSON.stringify(body), 'utf8'));
        const reserve = scope.computeOptions.reserve;
        if (reserve !== undefined) {
            const root = await this.runs.get(handle, scope.runId);
            const capacity = reserve === null ? null : await this.runs.engine.withTransaction(handle, tx => this.budgetPort.observeCapacity(handle,
                { authorityRef: root.budgetAuthorityRef, reservationId: null }, { tx }));
            const code = reserve === null || !capacity ? 'native_generation_required_budget_unknown'
                : capacity.overrun || capacity.remaining.requests < reserve.maxRequests + 1 || capacity.remaining.tokens < reserve.maxTokens + upperBound
                    ? 'native_generation_required_budget_reserved' : null;
            if (code) { const error = new ConflictError(code); this.#skips.add(error); throw error; }
        }
        const target = retrievalPostTarget(profile), expectedSend = retrievalSendIdentity(profile, body, { endpoint: target.endpoint, method: target.method });
        const decision = contextRetrievalDecision({ sourceBindingDigest: scope.request.sourceBinding.bindingDigest, parentGrantDigest: scope.request.grantDigest,
            budgetEnvelopeDigest: hash(scope.limits), effectId, modelEffectId: scope.modelEffectId, profile, descriptorDigest, corpusDigest, inputFingerprint: expectedSend.inputFingerprint });
        const state = { scope, profile, current, decision, expectedSend, budgetAttemptRef: null, observation: null };
        this.#effects.set(effectId, state);
        await this.effects.prepareContextRetrieval(handle, { ...runGuard(await this.runs.get(handle, scope.runId)), effectId, nodeAttemptId: scope.attemptId, proposal: proposalOf(decision) });
        scope.effectIds.push(effectId);
        const bank = this.budgetPort.sendBank(handle, { authorityRef: (await this.runs.get(handle, scope.runId)).budgetAuthorityRef,
            limits: scope.limits, effectId, firstOrdinal: 0, assertCurrent: current });
        let ticket, dispatchToken;
        const compute = { beforeSend: async (actualBody, transport) => {
            if (ticket || !equal(retrievalSendIdentity(profile, actualBody, transport), expectedSend)) fail();
            await current();
            const receipt = await bank.admit({ requestId: 'retrieval:' + effectId, ...expectedSend, ...scope.computeOptions,
                upperBound });
            state.budgetAttemptRef = receipt.budgetAttemptRef; ticket = Object.freeze({});
            await this.effects.ready(handle, { ...runGuard(await this.runs.get(handle, scope.runId)), effectId, budgetAttemptRef: receipt.budgetAttemptRef });
            const claim = await this.effects.claim(handle, { ...runGuard(await this.runs.get(handle, scope.runId)), effectId });
            if (!claim.claimed || !claim.dispatchToken) fail('native_orchestration_context_retrieval_unresolved');
            dispatchToken = claim.dispatchToken; await current(); return ticket;
        }, settle: async (usage, actualTicket) => {
            if (actualTicket === undefined) return;
            if (actualTicket !== ticket || !state.budgetAttemptRef) fail();
            await bank.settle(state.budgetAttemptRef.attemptId, usage);
        } };
        const dirs = this.runs.engine._directoriesByHandle(handle), secret = resolveRetrievalSecret(dirs, profile.secretRef);
        let response;
        try {
            response = await rerank(profile.source, { model: profile.model, reverseProxy: profile.endpoint, proxyPassword: secret,
                apiUrl: profile.endpoint, apiKey: secret }, query, documents, topK, dirs,
            { nativeRetrieval: { profile, compute, signal: scope.signal } });
        } catch (error) {
            if (state.budgetAttemptRef) await this.#observe(state, null, dispatchToken);
            throw error;
        }
        await this.#observe(state, response, dispatchToken);
        await current(); return response;
    }

    async #observe(state, response, dispatchToken) {
        const { scope, budgetAttemptRef } = state, handle = scope.handle, effectId = state.decision.inputRef.retrievalEffectId;
        const root = await this.runs.get(handle, scope.runId), row = await this.budgetPort.observeAttempt(handle, budgetAttemptRef);
        const intent = await this.runs.engine.withTransaction(handle, async tx => (await readEffect(tx, handle, root, effectId)).doc);
        const confirmed = response !== null && row.status === 'settled' && dispatchToken && intent.dispatchToken === dispatchToken;
        const observation = { observationId: 'retrieval.completed:' + effectId, observedEpoch: intent.epoch, outcome: confirmed ? 'confirmed' : 'unknown',
            dispatchEvidence: { kind: 'original_port_observation', reference: { protocol: 'retrieval', completionBindingDigest: completionBinding(intent),
                responseHash: hash(response), expectedSend: state.expectedSend } }, remoteOperationRef: null, domainReceiptRef: null,
            budgetObservationRef: { budgetAttemptRef, status: row.status, usageHash: hash(row.usage) }, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef],
            reasonCode: confirmed ? 'retrieval_response_validated' : 'retrieval_response_unresolved' };
        this.#observations.set(observation, state); state.observation = observation;
        await this.effects.observe(handle, { ...runGuard(root), effectId, observation });
        if (!confirmed) fail('native_orchestration_context_retrieval_unresolved');
    }

    async verifyObservation({ handle, tx, root, intent, observation }) {
        const state = this.#observations.get(observation);
        if (!state || state.scope.handle !== handle || state.scope.runId !== root.runId || state.observation !== observation
            || intent.inputRef.retrievalEffectId !== state.decision.inputRef.retrievalEffectId || !equal(effectDecision(intent), state.decision)
            || observation.dispatchEvidence.reference.completionBindingDigest !== completionBinding(intent)) fail();
        await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: state.budgetAttemptRef,
            expectedSend: { requestId: 'retrieval:' + intent.effectId, ...state.expectedSend } });
        const row = await this.budgetPort.observeAttempt(handle, state.budgetAttemptRef);
        if (!equal(observation.budgetObservationRef, { budgetAttemptRef: state.budgetAttemptRef, status: row.status, usageHash: hash(row.usage) })) fail();
    }

    async assertRecall(handle, proof) {
        const value = this.#proofs.get(proof);
        if (!value || value.scope.handle !== handle) fail();
        const { root } = await this.#current(value.scope, { allowSent: true });
        for (const effectId of value.effectIds) {
            const state = this.#effects.get(effectId), row = await this.budgetPort.observeAttempt(handle, state.budgetAttemptRef);
            if (!state.observation || state.observation.outcome !== 'confirmed' || row.status !== 'settled'
                || state.observation.budgetObservationRef.usageHash !== hash(row.usage)) fail();
            await this.runs.engine.withTransaction(handle, async tx => {
                const intent = (await readEffect(tx, handle, root, effectId)).doc;
                const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', contextRetrievalReceiptId(effectId))))?.doc;
                if (!receipt || intent.status !== 'confirmed' || !equal(effectDecision(intent), state.decision)
                    || intent.nodeAttemptId !== value.scope.attemptId || intent.epoch !== root.epoch || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
                    || completionBinding(intent) !== state.observation.dispatchEvidence.reference.completionBindingDigest
                    || !equal(intent.budgetAttemptRef, state.budgetAttemptRef)) fail();
                const { schemaVersion: _schema, receiptId: _id, runId: _run, effectId: _effect, observedAt: _at, ...observation } = receipt;
                if (!equal(observation, state.observation)) fail();
                await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: state.budgetAttemptRef,
                    expectedSend: { requestId: 'retrieval:' + effectId, ...state.expectedSend } });
            });
        }
        await this.#current(value.scope, { allowSent: true });
        return [...value.effectIds];
    }
}
