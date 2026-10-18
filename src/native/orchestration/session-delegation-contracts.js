import { readSessionDelegatedFanoutInput, readSessionDelegatedFanoutCompletion } from './session-delegated-fanout-contracts.js';
import { readSessionDelegatedControl, readSessionDelegatedReviewCompletion, readSessionDelegatedJudgeCompletion, readSessionDelegatedReviewReplacement } from './session-delegated-quality-contracts.js';
import { readAttemptInvalidation } from './controller-common.js';
import { assertSessionJudgeSelections } from './session-judge-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { audienceContextPin, assertAudienceRunCapture } from './audience-source-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { readGraphNodeResults } from './graph-result-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readHandoffReturn, handoffReturnReceiptId } from './handoff-return-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readRunControl } from '../run-control.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { sessionOutputReceiptId } from './session-output-contracts.js';
import { readSessionDelegationInputs } from './session-delegation-inputs.js';
import { sessionDelegatedGraphProfile } from './session-delegated-graph-profile.js';
import { readSessionPlannerCompletion } from './session-planner-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { sessionPlannerProgressFingerprint, sessionReplanScope } from './session-replan-contracts.js';

const invalid = () => { throw new TypeError('Invalid Session delegation facts'); };

async function durableParent(tx, handle, supplied) {
    const actual = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: supplied.runId }))?.doc;
    if (!actual) invalid();
    if (equal(actual, supplied)) return actual;
    // RunRepository checks original output facts before publishing its next
    // Root. Accept only that exact prospective Session output step; lineage
    // still comes from the actual original row, never a reconstructed Host.
    const output = (await checkedRecord(tx, controlRecordKey(handle, actual.runId, 'receipt', sessionOutputReceiptId(actual.runId))))?.doc;
    if (!output || output.receiptKind !== 'session_output' || actual.status !== 'running' || actual.outputClaims.length
        || actual.cancelRequested || output.runId !== actual.runId || output.epoch !== actual.epoch
        || output.graphRevision !== actual.graphRevision || output.decisionSeq !== actual.eventSeq + 1) invalid();
    const pending = { ...actual, status: 'completed', outputClaims: [output.claimRef],
        progress: { ...actual.progress, steps: actual.progress.steps + 1 },
        treeProgress: { ...actual.treeProgress, steps: actual.treeProgress.steps + 1 },
        stateVersion: actual.stateVersion + 1, eventSeq: actual.eventSeq + 1, updatedAt: output.createdAt };
    if (!equal(pending, supplied)) invalid();
    return actual;
}

/** Original published Model dependencies and their accepted Graph revisions. */
export async function readSessionDelegatedPlan(tx, handle, child) {
    const plan = await readPlanRevision(tx, handle, child.planRef), snapshot = await readTaskGraphRevision(tx, handle, child);
    if (child.sourceBinding.sourceAuthority !== 'native_session' || !child.parentRef) invalid();
    const initial = sessionDelegatedGraphProfile(plan), profile = sessionDelegatedGraphProfile({ ...plan, definition: snapshot.graph });
    if (profile.terminalNodeId !== initial.terminalNodeId || !equal(profile.output, initial.output)) invalid();
    return { plan, profile, graph: snapshot.graph, models: profile.models, output: profile.output, terminalNodeId: profile.terminalNodeId };
}

/** Historical linkage only. Live callers separately prove Source and permits. */
export async function readSessionDelegation(tx, handle, parent, childRunId) {
    if (parent.sourceBinding.sourceAuthority !== 'native_session') invalid();
    parent = await durableParent(tx, handle, parent);
    const child = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: childRunId }))?.doc;
    if (!child || child.sourceBinding.sourceAuthority !== 'native_session') invalid();
    const facts = await readDelegationCompletion(tx, handle, parent, child);
    if (!facts) return null;
    const input = facts.parentAttempt.inputRefs[0];
    if (input?.kind !== 'native_session_delegation' || !equal(input.planRef, parent.planRef)
        || !equal(input.childPlanRef, child.planRef) || input.nodeId !== facts.parentAttempt.nodeId
        || !equal(child.sourceBinding, parent.sourceBinding)) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, parent, facts.parentAttempt.graphRevision);
    const parentPlan = await readPlanRevision(tx, handle, parent.planRef);
    const node = snapshot.graph.nodes.find(node => node.nodeId === facts.parentAttempt.nodeId);
    const pin = audienceContextPin(node, parentPlan.dependencyPins);
    const capture = assertAudienceRunCapture(parent, node, parentPlan.dependencyPins, input);
    if (!pin || pin.resourceRef.audience.kind !== 'actor') invalid();
    assertObject(input.delegationScope, ['parentPinId', 'childPinId', 'sourceRef', 'integrity'], 'Parent delegated Actor scope');
    if (input.delegationScope.parentPinId !== pin.pinId
        || !equal(input.delegationScope.sourceRef, capture?.sourceRef ?? pin.resourceRef)
        || input.delegationScope.integrity !== (capture?.integrity ?? pin.integrity)) invalid();
    await readSessionDelegationInputs(tx, handle, parent, facts.parentAttempt);
    const delegated = await readSessionDelegatedPlan(tx, handle, child);
    const entryPin = delegated.plan.dependencyPins.find(pin => pin.pinId === input.delegationScope.childPinId);
    if (entryPin?.port !== 'context' || !delegated.graph.entryNodeIds.some(id => {
        const entry = delegated.graph.nodes.find(node => node.nodeId === id);
        return entry.policy.audiencePinId === entryPin.pinId || entry.kind === 'fanout' && delegated.profile.fanouts.find(group => group.fanout.nodeId === id)?.branches
            .some(branch => branch.entry.policy.audiencePinId === entryPin.pinId);
    })) invalid();
    return { ...facts, parent, child, parentInput: input, parentNode: node, parentPin: pin, ...delegated };
}

/** Exact original Actor source on the child's actual Model Attempt. */
export function sessionDelegationResultSources(child, producer, plan) {
    const node = child.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const pin = audienceContextPin(node, plan.dependencyPins), input = producer.inputRefs[0];
    const capture = assertAudienceRunCapture(child, node, plan.dependencyPins, input);
    if (!pin || pin.resourceRef.audience.kind !== 'actor' || input?.kind !== 'native_session_delegated_intent'
        || !equal(input.planRef, child.planRef) || input.nodeId !== producer.nodeId || !equal(input.audience, pin.resourceRef.audience)) invalid();
    return [{ kind: 'native_information_context', pinId: pin.pinId, sourceRef: capture?.sourceRef ?? pin.resourceRef, integrity: pin.integrity }];
}

/** One causal child step, also usable while later child nodes do not exist. */
export function readSessionDelegatedModelInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    return readModelInput(tx, handle, child, producer, intent, publicationSeq, null);
}

/** Only this module's current History call can supply its own fully read
 * facts. Public input reads always enter without reusable facts. */
async function readModelInput(tx, handle, child, producer, intent, publicationSeq, ownedFacts) {
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef?.parentRunId }))?.doc;
    if (!parent) invalid();
    const lineage = await readSessionDelegation(tx, handle, parent, child.runId);
    if (!lineage) invalid();
    const input = intent.inputRef, sourceRefs = sessionDelegationResultSources(child, producer, lineage.plan), scope = input.delegationScope;
    assertObject(scope, ['parentPinId', 'childPinId', 'sourceRef', 'integrity'], 'Delegated Actor source scope');
    if (!equal(input, producer.inputRefs[0]) || input.parentRunId !== parent.runId || input.parentAttemptId !== lineage.parentAttempt.attemptId
        || input.parentEpoch !== child.parentRef.parentEpoch || input.childRunId !== child.runId || input.childEpoch !== producer.epoch
        || input.delegationInputDigest !== child.parentRef.inputDigest || input.role !== 'narrator'
        || scope.parentPinId !== lineage.parentInput.delegationScope.parentPinId
        || !equal(scope.sourceRef, lineage.parentInput.delegationScope.sourceRef) || scope.integrity !== lineage.parentInput.delegationScope.integrity
        || scope.parentPinId !== lineage.parentPin.pinId || scope.childPinId !== sourceRefs[0].pinId
        || !equal(scope.sourceRef, sourceRefs[0].sourceRef) || input.audienceCapture && scope.integrity !== input.audienceCapture.integrity
        || !equal(input.sourceRef, child.sourceBinding.sourceRef) || intent.nodeAttemptId !== producer.attemptId
        || intent.epoch !== producer.epoch || intent.graphRevision !== producer.graphRevision || intent.grantDigest !== producer.effectiveGrantDigest
        || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, child, producer.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId), modelPin = nodeModelRoutePins(node, lineage.plan.dependencyPins)[0];
    if (!modelPin || !equal(input.routeRef, modelPin.resourceRef) || intent.actionRef.kind !== 'native_model_send'
        || intent.actionRef.runtimeRouteId !== modelPin.resourceRef.runtimeRouteId) invalid();
    if (input.fanoutAttemptId) return { ...await readSessionDelegatedFanoutInput(tx, handle, child, producer, input, publicationSeq), sourceRefs,
        requestedRootDigest: hash(child), producerDigest: hash(producer), effectDigest: hash(intent) };
    const controls = input.acceptedControlRefs ?? [], sources = [], completedControls = [];
    for (const ref of controls) {
        const fact = ownedFacts?.controls.get(hash(ref)) ?? await readSessionDelegatedControl(tx, handle, child, ref);
        if (!fact || ref.runId !== child.runId || !equal(ref, fact.controlRef) || fact.review?.decision === 'rerun') invalid(); completedControls.push(fact);
    }
    // This invocation just proved every original member of its explicit Join.
    // Reuse those typed facts only for these exact input refs, then batch any
    // remaining Results through the original full reader. No grant is saved.
    const joinedResults = new Map(completedControls.flatMap(fact => fact.graphResults ?? []).map(fact => [hash(fact.receipt.resultRef), fact]));
    // A fact enters this private map only through this History call's own
    // complete Graph Result reader. Caller final/pending facts never enter it.
    for (const ref of input.acceptedGraphResultRefs) {
        const checked = ownedFacts?.results.get(ref.resultId);
        if (!checked || joinedResults.has(hash(ref))) continue;
        const proof = checked.sessionDelegatedInput;
        if (!proof || proof.requestedRootDigest !== ownedFacts.rootDigest || proof.producerDigest !== hash(checked.producer)
            || proof.effectDigest !== hash(checked.modelEffect) || !checked.modelCompletion
            || checked.modelEffect.effectId !== checked.producer.effectRefs[0] || !equal(ref, checked.receipt.resultRef)) invalid();
        joinedResults.set(hash(ref), checked);
    }
    const missingRefs = input.acceptedGraphResultRefs.filter(ref => !joinedResults.has(hash(ref)));
    const resultFacts = await readGraphNodeResults(tx, handle, child, missingRefs.map(ref => ref.resultId));
    for (const ref of input.acceptedGraphResultRefs) {
        const fact = joinedResults.get(hash(ref)) ?? resultFacts.get(ref.resultId);
        if (!fact || ref.runId !== child.runId || !equal(ref, fact.receipt.resultRef)) invalid(); sources.push(fact);
    }
    sources.push(...completedControls);
    if (sources.some(fact => fact.receipt.decisionSeq >= publicationSeq)) invalid();
    const judges = sources.filter(fact => fact.selectedResultRef);
    assertSessionJudgeSelections(child, node, input.acceptedGraphResultRefs, judges);
    const incoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === producer.nodeId).filter(edge =>
        !judges.some(judge => judge.candidates.some(candidate => candidate.producer.nodeId === edge.from.nodeId
            && !equal(candidate.receipt.resultRef, judge.selectedResultRef))));
    const loops = input.graphBindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
    for (const binding of loops) {
        const edge = snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId), source = sources.find(fact => fact.producer.attemptId === binding.producerAttemptId);
        if (!source?.patch?.requests.replan || source.patch.requests.finalize || source.patch.newGraphRevision !== producer.graphRevision
            || edge.from.nodeId !== source.producer.nodeId || edge.to.nodeId !== producer.nodeId
            || sessionReplanScope(snapshot.graph, source.producer.nodeId).target.nodeId !== producer.nodeId) invalid();
    }
    const edges = [...incoming, ...loops.map(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId))].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const joined = sources.filter(fact => fact.joinReceipt);
    const joinRefs = joined.flatMap(fact => fact.joinReceipt.acceptedResultRefs);
    const direct = sources.filter(fact => !fact.record || !joinRefs.some(ref => equal(ref, fact.receipt.resultRef)));
    const ordered = edges.map(edge => direct.find(fact => fact.producer.nodeId === edge.from.nodeId));
    if (ordered.some(fact => !fact) || new Set(sources.map(fact => fact.producer.attemptId)).size !== sources.length) invalid();
    const refs = [...new Map(ordered.flatMap(fact => fact.joinReceipt ? fact.joinReceipt.acceptedResultRefs : fact.record ? [fact.receipt.resultRef] : []).map(ref => [hash(ref), ref])).values()];
    const controlRefs = [...new Map(ordered.filter(fact => fact.controlRef).map(fact => [hash(fact.controlRef), fact.controlRef])).values()];
    const bindings = edges.map((edge, index) => ({ edgeId: edge.edgeId, producerAttemptId: ordered[index].producer.attemptId }));
    if (!equal(input.acceptedGraphResultRefs, refs) || !equal(controls, controlRefs) || !equal(input.graphBindings, bindings)
        || !equal(producer.inputRefs, [input, ...child.parentRef.inputRefs, ...refs, ...controls]) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    let replacement = null;
    if (input.reviewFeedbackRef) replacement = await readSessionDelegatedReviewReplacement(tx, handle, child, producer, input);
    else if (!edges.length) {
        if (!snapshot.graph.entryNodeIds.includes(producer.nodeId)) invalid();
    } else {
        const identity = hash({ runId: child.runId, bindings, reservedAttemptId: null }), direct = [...new Map(ordered.map(fact => [fact.producer.attemptId, fact])).values()];
        await assertOutputTransition(tx, handle, child, { published: direct[0], additionalProducers: direct.slice(1), output: producer,
            receipt: { decisionSeq: publicationSeq, traversalReceiptRef: { runId: child.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } }, producerBindings: bindings, allowLoopBack: !!loops.length });
    }
    return { lineage, input, sourceRefs, sources, bindings, loops, replacement,
        requestedRootDigest: ownedFacts?.rootDigest ?? hash(child), producerDigest: hash(producer), effectDigest: hash(intent) };
}

/** Validate all actual tasks and their original Transition and bank facts.
 * pendingProducer is used only before the final Model Result is published;
 * the ModelPort must already have proved its exact physical completion. */
export async function readSessionDelegatedGraphHistory(tx, handle, child, { finalPublication = null, pendingProducer = null, closure = null, output = null } = {}) {
    const shape = await readSessionDelegatedPlan(tx, handle, child), { graph, models, plan } = shape, rootDigest = hash(child);
    if (Boolean(finalPublication) === Boolean(pendingProducer)) invalid();
    const finalProducer = pendingProducer ?? finalPublication.producer ?? (await readAttempt(tx, handle, child, finalPublication.receipt.producerAttemptId)).doc;
    if (finalProducer.nodeId !== shape.terminalNodeId) invalid();
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
    if (!parent) invalid();
    const lineage = await readSessionDelegation(tx, handle, parent, child.runId);
    if (!lineage) invalid();
    const attempts = [];
    for (const id of child.attemptRefs) attempts.push((await readAttempt(tx, handle, child, id)).doc);
    const fanouts = [];
    for (const producer of attempts.filter(attempt => graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'join')) {
        const fact = await readSessionDelegatedFanoutCompletion(tx, handle, child, producer.attemptId); if (!fact) invalid(); fanouts.push(fact);
    }
    if (attempts.filter(attempt => graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'fanout').length !== fanouts.length) invalid();
    // Only original scope facts fully read by this history can supply its
    // intermediate proofs. Caller finalPublication/pendingProducer is excluded.
    const scopeResults = new Map(fanouts.flatMap(fact => fact.graphResults).map(fact => [hash(fact.receipt.resultRef), fact]));
    const intermediateRefs = child.resultRefs.filter(ref => !finalPublication || !equal(ref, finalPublication.receipt.resultRef));
    const missingRefs = intermediateRefs.filter(ref => !scopeResults.has(hash(ref)));
    const resultFacts = await readGraphNodeResults(tx, handle, child, missingRefs.map(ref => ref.resultId));
    const results = [];
    for (const ref of intermediateRefs) {
        const fact = scopeResults.get(hash(ref)) ?? resultFacts.get(ref.resultId);
        if (!fact || !equal(ref, fact.receipt.resultRef)) invalid(); results.push(fact);
    }
    // Only facts just read above may provide their original complete input and
    // Model proof. A caller's finalPublication/pendingProducer never enters this
    // same-call map and cannot supply or replace a proof through this API.
    const checkedResults = new Map(results.map(fact => [fact.producer.attemptId, fact]));
    const ownedFacts = { rootDigest, results: new Map(results.map(fact => [fact.receipt.resultRef.resultId, fact])), controls: new Map() };
    const facts = [...results, ...(finalPublication ? [{ ...finalPublication, producer: finalProducer,
        settlement: finalPublication.attemptReceipt }] : [])];
    const modelAttempts = attempts.filter(attempt => models.some(node => node.nodeId === attempt.nodeId));
    if (modelAttempts.length < models.length || new Set(modelAttempts.map(attempt => attempt.nodeId)).size !== models.length
        || modelAttempts.some(attempt => !models.some(node => node.nodeId === attempt.nodeId))
        || attempts.some(attempt => attempt.nodeId === shape.output.nodeId && (!output || attempt.attemptId !== output.attemptId))
        || attempts.filter(attempt => attempt.nodeId === shape.output.nodeId).length !== (output ? 1 : 0)
        || facts.length !== modelAttempts.filter(attempt => graph.nodes.find(node => node.nodeId === attempt.nodeId).kind === 'agent' && (attempt.status === 'completed' || attempt.attemptId === pendingProducer?.attemptId)).length - (pendingProducer ? 1 : 0)) invalid();
    const control = await readRunControl(tx, handle, child.budgetAuthorityRef.sessionId);
    const bank = control?.operations[child.budgetAuthorityRef.operationId]?.compute;
    if (!bank) invalid();
    const effects = [], expectedRefs = [], usedEdges = new Map(), planners = [], reviews = [], judges = [], entries = [];
    for (const fact of fanouts) {
        for (const binding of fact.fanout.inputRefs[0].graphBindings) usedEdges.set(binding.edgeId, (usedEdges.get(binding.edgeId) ?? 0) + 1);
        for (const id of [...fact.frame.edgeAdmissionRefs, ...fact.joinReceipt.edgeAdmissionRefs]) {
            const receipt = (await checkedRecord(tx, controlRecordKey(handle, child.runId, 'receipt', id)))?.doc;
            if (!receipt || receipt.receiptKind !== 'edge_admission') invalid();
            usedEdges.set(receipt.edgeId, (usedEdges.get(receipt.edgeId) ?? 0) + 1);
        }
        entries.push({ producer: fact.producer, fact, proof: { sources: fact.members, bindings: [], loops: [], replacement: null } });
    }
    let settled = true, loopIterations = 0;
    for (const producer of modelAttempts) {
        const node = graph.nodes.find(node => node.nodeId === producer.nodeId);
        const fact = node.kind === 'planner' ? await readSessionPlannerCompletion(tx, handle, child, producer.attemptId)
            : node.kind === 'review' ? await readSessionDelegatedReviewCompletion(tx, handle, child, producer.attemptId)
                : node.kind === 'judge' ? await readSessionDelegatedJudgeCompletion(tx, handle, child, producer.attemptId) : facts.find(fact => fact.producer.attemptId === producer.attemptId);
        const scoped = fanouts.flatMap(fact => fact.scopeAttempts).find(item => item.attempt.attemptId === producer.attemptId);
        const unsuccessful = scoped && ['failed', 'cancelled'].includes(producer.status);
        if (unsuccessful && !equal(scoped.attempt, producer)) invalid();
        if (unsuccessful && !producer.effectRefs.length) continue;
        if (!unsuccessful && (!fact && producer.attemptId !== pendingProducer?.attemptId || producer.effectRefs.length !== 1
            || producer.status !== (producer.attemptId === pendingProducer?.attemptId ? 'running' : 'completed')
            || producer.graphRevision > child.graphRevision || producer.epoch > child.epoch || producer.sourceBindingDigest !== child.sourceBinding.bindingDigest
            || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, child.budgetAuthorityRef))) invalid();
        const checked = checkedResults.get(producer.attemptId), checkedInput = checked?.sessionDelegatedInput;
        const effect = checked ? checked.modelEffect : (await readEffect(tx, handle, child, producer.effectRefs[0])).doc;
        const sourceRefs = sessionDelegationResultSources(child, producer, plan);
        if (fact?.record && !equal(fact.record.envelope.sourceRefs.slice(2), sourceRefs)) invalid();
        if (checked && (!checkedInput || checkedInput.requestedRootDigest !== rootDigest || checkedInput.producerDigest !== hash(producer)
            || checkedInput.effectDigest !== hash(effect) || effect.effectId !== producer.effectRefs[0] || !checked.modelCompletion)) invalid();
        // These control facts came from the original typed reader immediately
        // above, including its full Model/settlement/bank proof. Re-read only a
        // producer for which this call has no own completed proof.
        const checkedControl = ['planner', 'review', 'judge'].includes(node.kind) ? fact : null;
        if (checkedControl && (!equal(checkedControl.producer, producer) || checkedControl.receipt.modelEffectId !== effect.effectId
            || effect.nodeAttemptId !== producer.attemptId || effect.epoch !== producer.epoch
            || effect.sourceBindingDigest !== child.sourceBinding.bindingDigest || effect.grantDigest !== producer.effectiveGrantDigest)) invalid();
        if (!unsuccessful && !checked && !checkedControl && !await readModelCompletionReceipt(handle, tx, child, effect)) invalid();
        const proof = checkedInput ?? await readModelInput(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1, ownedFacts);
        for (const binding of unsuccessful || proof.replacement ? [] : proof.bindings) {
            usedEdges.set(binding.edgeId, (usedEdges.get(binding.edgeId) ?? 0) + 1);
            if (graph.edges.find(edge => edge.edgeId === binding.edgeId).loopBack) loopIterations++;
        }
        if (!unsuccessful) entries.push({ producer, fact, proof }); if (node.kind === 'planner') planners.push(fact);
        if (node.kind === 'review') reviews.push(fact); if (node.kind === 'judge') judges.push(fact);
        const rows = bank.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
        const local = (bank.localWork ?? []).filter(row => row.orchestration?.effectId === effect.effectId);
        if (rows.length !== 1 || rows[0].reservationId !== child.runId || rows[0].orchestration.kind !== 'provider_send'
            || rows[0].orchestration.ordinal !== 0 || !['settled', 'unknown', 'charged'].includes(rows[0].status)
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalid();
        if (rows.some(row => row.status !== 'settled')) settled = false;
        effects.push(effect); expectedRefs.push(...rows.map(row => row.attemptId), ...local.map(row => row.attemptId));
        if (checkedControl) ownedFacts.controls.set(hash(checkedControl.controlRef), checkedControl);
    }
    const latest = new Map(), previous = new Map(), replaced = new Map(), consumed = new Set(), keys = new Map();
    for (const { producer, fact, proof } of entries.toSorted((a, b) => (a.fact?.receipt.decisionSeq ?? child.eventSeq + 1) - (b.fact?.receipt.decisionSeq ?? child.eventSeq + 1))) {
        let trigger = null;
        if (proof.loops.length) {
            trigger = proof.sources.find(source => source.producer.attemptId === proof.loops[0].producerAttemptId);
            if (!trigger || consumed.has(trigger.producer.attemptId) || proof.loops.some(binding => binding.producerAttemptId !== trigger.producer.attemptId)
                || latest.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId) invalid();
            const scope = sessionReplanScope(graph, trigger.producer.nodeId);
            if (scope.target.nodeId !== producer.nodeId || !previous.has(producer.nodeId) || proof.loops.length !== scope.loops.length
                || proof.loops.some(binding => !scope.loops.some(edge => edge.edgeId === binding.edgeId))) invalid();
            for (const id of scope.affectedNodeIds) {
                const old = latest.get(id);
                if (old) replaced.set(id, { attemptId: old.producer.attemptId, trigger });
                latest.delete(id);
            }
            consumed.add(trigger.producer.attemptId);
        }
        for (const source of proof.sources) if (source !== trigger && latest.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        const prior = previous.get(producer.nodeId);
        if (prior) {
            const replacement = replaced.get(producer.nodeId);
            const loop = replacement?.attemptId === prior.producer.attemptId
                && (trigger?.producer.attemptId === replacement.trigger.producer.attemptId
                    || proof.sources.some(source => source.receipt.decisionSeq > replacement.trigger.receipt.decisionSeq));
            const invalidation = await readAttemptInvalidation(tx, handle, child, prior.producer);
            const quality = proof.replacement?.target.attemptId === prior.producer.attemptId || invalidation
                || prior.fact?.review?.decision === 'rerun' && graph.nodes.find(node => node.nodeId === producer.nodeId)?.kind === 'review';
            if (producer.attemptNumber !== prior.producer.attemptNumber + 1 || !loop && !quality) invalid();
            replaced.delete(producer.nodeId);
        }
        if (fact?.patch) {
            const key = sessionPlannerProgressFingerprint(fact.patch.appliedOperations, child.sourceBinding, proof.sources.filter(source => source.record));
            const prior = keys.get(producer.nodeId) ?? new Set(); if (prior.has(key)) invalid(); prior.add(key); keys.set(producer.nodeId, prior);
        }
        if (fact?.review?.decision === 'rerun') for (const [id, item] of latest) if (fact.review.invalidatedAttemptIds.includes(item.producer.attemptId)) latest.delete(id);
        latest.set(producer.nodeId, { producer, fact }); previous.set(producer.nodeId, { producer, fact });
    }
    if (replaced.size) invalid();
    if (reviews.length !== child.progress.reviews || planners.length !== child.graphRevision || child.progress.replans !== planners.filter(fact => fact.patch.requests.replan).length
        || consumed.size !== child.progress.replans || [...latest.values()].some(item => item.fact?.patch?.requests.replan)) invalid();
    if (new Set(effects.map(effect => effect.effectId)).size !== effects.length
        || bank.attempts.some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))) invalid();
    if (output) {
        const edge = graph.edges.find(edge => edge.to.nodeId === output.nodeId);
        usedEdges.set(edge.edgeId, 1);
    }
    const expectedVisits = Object.fromEntries(usedEdges);
    if (child.progress.loopIterations !== loopIterations || child.progress.edgeVisits !== [...usedEdges.values()].reduce((sum, count) => sum + count, 0) || !equal(child.progress.edgeVisitCounts, expectedVisits)) invalid();
    const history = { ...shape, lineage, results, finalProducer, effects, rootDigest,
        budgetAttemptIds: expectedRefs, settled, planners, reviews, judges, fanouts, loopIterations };
    if (closure) assertSessionDelegatedClosure(child, history, closure);
    return history;
}

/** Pure comparison against this call's complete freshly read graph/bank proof.
 * It supplies no reservation observation, Source decision or writer grant. */
export function assertSessionDelegatedClosure(child, history, closure) {
    if (history.rootDigest !== hash(child) || !history.settled
        || !equal(closure.reservationRefs, [{ reservationId: child.runId,
            parentReservationId: child.parentRef.depth === 1 ? null : history.lineage.parent.runId, status: 'released' }])
        || closure.budgetAttemptRefs.length !== history.budgetAttemptIds.length
        || new Set(closure.budgetAttemptRefs.map(ref => ref.attemptId)).size !== history.budgetAttemptIds.length
        || closure.budgetAttemptRefs.some(ref => !history.budgetAttemptIds.includes(ref.attemptId)
            || ref.reservationId !== child.runId || !equal(ref.authorityRef, child.budgetAuthorityRef))) invalid();
}

/** A parent Model may consume only its exact settled child. Never a new grant. */
export async function readSessionDelegationContinuation(tx, handle, parent, producer, intent) {
    const input = intent.inputRef, ref = input?.acceptedResultRef, parentInput = producer.inputRefs[0];
    if (parentInput?.kind !== 'native_session_delegation' || input?.kind !== 'native_turn_intent'
        || !ref || input.parentInputDigest !== producer.inputDigest || producer.inputDigest !== hash(producer.inputRefs)
        || intent.nodeAttemptId !== producer.attemptId || input.nodeId !== producer.nodeId || !equal(input.planRef, parent.planRef)
        || intent.sourceBindingDigest !== parent.sourceBinding.bindingDigest || input.role !== 'narrator' || parentInput.role !== input.role
        || input.grantDigest !== producer.effectiveGrantDigest || parentInput.requestId !== input.invocationId
        || !equal(input.audience, parentInput.audience) || !equal(input.audienceCapture ?? null, parentInput.audienceCapture ?? null)
        || !equal(input.bindingRef, parentInput.bindingRef) || !equal(input.acceptedGraphResultRefs ?? [], parentInput.acceptedGraphResultRefs)
        || !equal(input.acceptedControlRefs ?? [], parentInput.acceptedControlRefs ?? [])
        || !equal(producer.inputRefs, [parentInput, ...parentInput.acceptedGraphResultRefs, ...(parentInput.acceptedControlRefs ?? [])])
        || !['sessionId', 'branchId', 'revisionId'].every(field => input.sourceRef[field] === parentInput.sourceRef[field]
            && input.sourceRef[field] === parent.sourceBinding.sourceRef[field])) invalid();
    const lineage = await readSessionDelegation(tx, handle, parent, ref.runId);
    if (!lineage || lineage.parentAttempt.attemptId !== producer.attemptId || lineage.child.status !== 'completed'
        || !equal(lineage.child.parentRef.inputRefs, producer.inputRefs)) invalid();
    const parentPlan = await readPlanRevision(tx, handle, parent.planRef);
    if (!nodeModelRoutePins(lineage.parentNode, parentPlan.dependencyPins).some(pin => equal(pin.resourceRef, input.routeRef)
        && pin.integrity === input.routeIntegrity)) invalid();
    let returnReceipt = null, output;
    if (lineage.mode === 'handoff') {
        returnReceipt = await readHandoffReturn(tx, handle, parent, ref.runId);
        if (!returnReceipt || !equal(input.returnReceiptRef, { runId: parent.runId, receiptId: returnReceipt.receiptId })
            || !equal(returnReceipt.resultRef, ref)) invalid();
        output = returnReceipt.output;
    } else {
        if (input.returnReceiptRef !== null || await checkedRecord(tx, controlRecordKey(handle, parent.runId, 'receipt', handoffReturnReceiptId(ref.runId)))) invalid();
        output = await readTaskLocalOutput(tx, handle, lineage.child);
    }
    const publication = output?.publication;
    if (!publication || !output || !equal(output.claim.resultRef, ref)) invalid();
    return { lineage, publication, output, returnReceipt };
}
