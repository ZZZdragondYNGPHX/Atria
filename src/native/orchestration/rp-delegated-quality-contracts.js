import { readRpDelegatedFanoutInput, readRpDelegatedFanoutCompletion } from './rp-delegated-fanout-contracts.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { rpControlReplanScope } from './rp-control-graph.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttempt, controlRecordKey, readAttemptInvalidation, readGraphReviewReceipt, assertAttemptConsumable, assertAttemptCurrent } from './controller-common.js';
import { readGraphNodeResults } from './graph-result-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { readGraphReviewCompletion, graphReviewControlRef } from './graph-review-completion.js';
import { readGraphJudgeCompletion, graphJudgeControlRef } from './graph-judge-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { isRpDelegatedControlGraph, rpDelegatedPlannerReaderOptions, assertRpDelegatedClosure } from './rp-delegation-control-contracts.js';
import { taskLocalReceiptId } from './task-local-output-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { rpDelegatedControlProfile } from './rp-delegated-control-profile.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP delegated quality facts'); };

// Only completed historical input proofs live in this private read boundary.
// No thunk, registration API, caller proof, Source or bank grant is exported.
const inputInspections = new AsyncLocalStorage();
async function inspectInputs(tx, handle, root, body) {
    const rootDigest = hash(root), current = inputInspections.getStore();
    if (current?.active && current.tx === tx && current.handle === handle && current.rootDigest === rootDigest) return body();
    const scope = { active: true, tx, handle, rootDigest, inputs: new Map() };
    try { return await inputInspections.run(scope, body); } finally { scope.active = false; scope.inputs.clear(); }
}


/** Cold typed facts only. The private delegation capture remains the only
 * live Task/Source grant, and every original child charge stays in its bank. */
export function readRpDelegatedControl(tx, handle, root, ref) {
    return inspectInputs(tx, handle, root, () => readControl(tx, handle, root, ref));
}

async function readControl(tx, handle, root, ref) {
    if (root.sourceBinding.sourceAuthority !== 'rp_chat' || !root.parentRef || ref?.runId !== root.runId) invalid();
    if (ref.kind === 'graph_join_control') {
        const fact = await readRpDelegatedFanoutCompletion(tx, handle, root, ref.attemptId);
        if (!fact || !equal(fact.controlRef, ref)) invalid();
        return fact;
    }
    let fact; const completedControls = [];
    if (ref.kind === 'graph_planner_control') fact = await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, { verifyControlWork: assertRpControlWork });
    else if (ref.kind === 'graph_review_control') fact = await readGraphReviewCompletion(tx, handle, root, ref.attemptId,
        { verifyControlWork: assertRpControlWork, reasonCodes: RP_REVIEW_REASON_CODES });
    else if (ref.kind === 'graph_judge_control') fact = await readGraphJudgeCompletion(tx, handle, root, ref.attemptId,
        { verifyControlWork: assertRpControlWork, readControlInputs: async (_tx, _handle, _root, _producer, input) => {
            const controls = [];
            for (const control of input.controlGraph.controlRefs) {
                const previous = (await readAttempt(_tx, _handle, _root, control.attemptId)).doc;
                const current = await readAttemptSettlement(_tx, _handle, _root, _producer);
                if ((await readAttemptSettlement(_tx, _handle, _root, previous)).decisionSeq >= current.decisionSeq) invalid();
                const checked = await readRpDelegatedControl(_tx, _handle, _root, control);
                controls.push(checked); completedControls.push(checked);
            }
            return controls;
        } });
    else invalid();
    if (!fact || !equal(fact.controlRef, ref)) invalid();
    const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc;
    // These same invocation's immutable facts were fully read above by the
    // shared completion reader, including their Model/settlement/bank proof.
    // Reuse them only for this control's domain input verification. The maps
    // are private, never returned, and every public read starts from storage.
    const ownedFacts = { results: new Map((fact.evidence ?? fact.candidates ?? []).map(source => [hash(source.receipt.resultRef), source])),
        controls: new Map(completedControls.map(source => [hash(source.controlRef), source])) };
    const rpDelegatedInput = await readControlInputFacts(tx, handle, root, fact.producer, intent, fact.receipt.decisionSeq, ownedFacts);
    return { ...fact, rpDelegatedInput };
}

/** Each input still names an original typed producer and an actual edge.
 * No model selection declassifies either candidate or changes the Task grant. */
export function readRpDelegatedInputSources(tx, handle, root, bundle, targetNodeId, options = {}) {
    return inspectInputs(tx, handle, root, () => readInputSources(tx, handle, root, bundle, targetNodeId, options, null));
}

async function readInputSources(tx, handle, root, bundle, targetNodeId, { live = false, recipient = null, beforeSeq = null } = {}, ownedFacts) {
    assertObject(bundle, ['evidenceRefs', 'controlRefs', 'bindings'], 'RP child graph inputs');
    if (![bundle.evidenceRefs, bundle.controlRefs, bundle.bindings].every(Array.isArray)
        || new Set(bundle.evidenceRefs.map(hash)).size !== bundle.evidenceRefs.length
        || new Set(bundle.controlRefs.map(hash)).size !== bundle.controlRefs.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    // Only this bundle's missing immutable facts enter one original batch.
    // Its private graph snapshots cannot escape this invocation. Every Result
    // retains its complete Model, Source, settlement and publication proof.
    const missingRefs = bundle.evidenceRefs.filter(ref => !ownedFacts?.results.has(hash(ref)));
    const readFacts = await readGraphNodeResults(tx, handle, root, missingRefs.map(ref => ref.resultId));
    const facts = [];
    for (const ref of bundle.evidenceRefs) {
        const fact = ownedFacts?.results.get(hash(ref)) ?? readFacts.get(ref.resultId);
        if (!fact || ref.runId !== root.runId || !equal(fact.receipt.resultRef, ref)
            || !fact.record.envelope.audienceConstraint.nodeIds.includes(targetNodeId)) invalid();
        facts.push(fact);
    }
    for (const ref of bundle.controlRefs) {
        const completed = ownedFacts?.controls.get(hash(ref));
        if (beforeSeq !== null) {
            const settlement = completed?.settlement ?? await readAttemptSettlement(tx, handle, root, (await readAttempt(tx, handle, root, ref.attemptId)).doc);
            if (settlement.decisionSeq >= beforeSeq) invalid();
        }
        const fact = completed ?? await readRpDelegatedControl(tx, handle, root, ref);
        if (!equal(fact.controlRef, ref)) invalid(); facts.push(fact);
    }
    const bound = fact => bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId);
    const selectedByJoin = fact => fact.record && facts.some(join => join.joinReceipt && bound(join)
        && join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, fact.receipt.resultRef)));
    if (facts.some(fact => !bound(fact) && !selectedByJoin(fact))
        || bundle.bindings.some(binding => !root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.nodeId === targetNodeId
            && facts.some(fact => fact.producer.attemptId === binding.producerAttemptId && fact.producer.nodeId === edge.from.nodeId)))) invalid();
    for (const judge of facts.filter(fact => fact.controlRef?.kind === 'graph_judge_control')) for (const candidate of judge.candidates) {
        const direct = root.graph.edges.some(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === targetNodeId);
        if (direct && bundle.evidenceRefs.some(ref => equal(ref, candidate.receipt.resultRef)) !== equal(candidate.receipt.resultRef, judge.selectedResultRef)) invalid();
    }
    if (!live) return facts;
    if (recipient) {
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || recipient.nodeId !== targetNodeId || recipient.epoch !== root.epoch || root.status !== 'running' || root.cancelRequested
            || !['running', 'waiting_effect'].includes(recipient.status) || !equal(recipient.inputRefs[0]?.controlGraph, bundle)
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(recipient.inputRefs[0]?.audience, { kind: 'task', id: root.runId })) invalid();
        await assertAttemptCurrent(tx, handle, root, recipient);
    }
    const ownReview = recipient && root.graph.nodes.find(node => node.nodeId === targetNodeId)?.kind === 'review'
        ? await readGraphReviewReceipt(tx, handle, root, recipient) : null;
    for (const fact of facts) {
        const invalidation = await readAttemptInvalidation(tx, handle, root, fact.producer);
        if (!invalidation) { await assertAttemptConsumable(tx, handle, root, fact.producer); continue; }
        // Only this still-running Review's decide→settle saga may prove its
        // own old Result. A later stage, other Review, or old control cannot.
        if (!fact.record || ownReview?.decision !== 'rerun' || invalidation.reviewReceiptId !== ownReview.receiptId
            || invalidation.reviewIntegrity !== hash(ownReview) || !ownReview.invalidatedAttemptIds.includes(fact.producer.attemptId)
            || !equal(ownReview.evidenceRefs, bundle.evidenceRefs) || !ownReview.evidenceRefs.some(ref => equal(ref, fact.receipt.resultRef))) invalid();
    }
    return facts;
}

/** Prepared replacements are admitted by the original ReviewController. Their
 * exact prior inputs plus feedback do not invent another incoming Transition. */
export function readRpDelegatedReviewReplacement(tx, handle, root, producer, input) {
    return inspectInputs(tx, handle, root, () => readReviewReplacement(tx, handle, root, producer, input));
}

async function readReviewReplacement(tx, handle, root, producer, input) {
    const ref = input.reviewFeedbackRef?.reviewReceiptRef;
    const stored = ref?.runId === root.runId ? await checkedRecord(tx, { kind: K.orchestrationRecord, handle, runId: root.runId,
        recordType: 'receipt', recordId: ref.receiptId }) : null;
    if (!stored || stored.doc.receiptKind !== 'graph_review') invalid();
    const modelRef = graphReviewControlRef(root.runId, stored.doc.reviewAttemptId);
    const fact = await readRpDelegatedControl(tx, handle, root, modelRef), replacement = fact.review.replacements.find(item => item.attemptId === producer.attemptId);
    const target = fact.targets.find(item => item.attemptId === replacement?.targetAttemptId);
    if (fact.review.decision !== 'rerun' || !target || !equal(ref, fact.receipt.reviewReceiptRef)
        || input.reviewFeedbackRef.reasonCode !== fact.review.reasonCode || producer.nodeId !== target.nodeId
        || producer.effectiveGrantDigest !== target.effectiveGrantDigest || producer.graphRevision !== fact.review.graphRevision
        || !equal(producer.inputRefs, [{ ...target.inputRefs[0], reviewFeedbackRef: input.reviewFeedbackRef }, ...target.inputRefs.slice(1)])) invalid();
    const invalidation = await readAttemptInvalidation(tx, handle, root, target);
    if (!invalidation || invalidation.reviewReceiptId !== fact.review.receiptId) invalid();
    return { fact, target };
}

/** Fresh public input proof; historical facts cannot be injected by a caller. */
export function readRpDelegatedInputFacts(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    return inspectInputs(tx, handle, child, () => readControlInputFacts(tx, handle, child, producer, intent, publicationSeq, null));
}

/** Reuse only this inspection's completed input proof. Every shared Model,
 * Result, control completion and bank verifier retains its fresh entry. */
async function readControlInputFacts(tx, handle, child, producer, intent, publicationSeq, ownedFacts) {
    const scope = inputInspections.getStore();
    if (!scope?.active || scope.tx !== tx || scope.handle !== handle || scope.rootDigest !== hash(child))
        return readControlInputFactsFresh(tx, handle, child, producer, intent, publicationSeq, ownedFacts);
    const key = hash({ producer, intent, publicationSeq });
    if (scope.inputs.has(key)) return scope.inputs.get(key);
    // In-flight work and rejected/partial proofs are never reusable.
    const proof = await readControlInputFactsFresh(tx, handle, child, producer, intent, publicationSeq, ownedFacts);
    if (scope.active && scope.rootDigest === hash(child)) scope.inputs.set(key, proof);
    return proof;
}

/** Exact stage inputs, original dependency receipts and original child grant. */
async function readControlInputFactsFresh(tx, handle, child, producer, intent, publicationSeq, ownedFacts) {
    const input = intent.inputRef, bundle = input.controlGraph;
    if (!isRpDelegatedControlGraph(child) || input.kind !== 'native_rp_delegated_intent' || input.role !== 'narrator'
        || input.nodeId !== producer.nodeId || input.parentRunId !== child.parentRef.parentRunId || input.childRunId !== child.runId
        || input.parentAttemptId !== child.parentRef.nodeAttemptId || !equal(input.planRef, child.planRef)
        || !equal(input.sourceRef, child.sourceBinding.sourceRef) || !equal(input.audience, { kind: 'task', id: child.runId })
        || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.nodeAttemptId !== producer.attemptId || intent.graphRevision !== producer.graphRevision || intent.epoch !== producer.epoch
        || !bundle || !Array.isArray(bundle.evidenceRefs) || !equal(input.acceptedGraphResultRefs ?? [], bundle.evidenceRefs) || !Array.isArray(bundle.controlRefs) || !Array.isArray(bundle.bindings)
        || !equal(input.acceptedControlRefs, bundle.controlRefs) || !equal(producer.inputRefs, [input, ...child.parentRef.inputRefs, ...bundle.evidenceRefs, ...bundle.controlRefs])
        || producer.inputDigest !== hash(producer.inputRefs) || intent.inputHash !== hash(input)) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, child, producer.graphRevision);
    const plan = await readPlanRevision(tx, handle, child.planRef), node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const pin = plan.dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId);
    if (pin?.port !== 'model' || !node.dependencyPinIds.includes(pin.pinId) || !equal(input.routeRef, pin.resourceRef)
        || intent.actionRef.kind !== 'native_model_send' || intent.actionRef.runtimeRouteId !== pin.resourceRef.runtimeRouteId) invalid();
    if (input.fanoutAttemptId) return { ...await readRpDelegatedFanoutInput(tx, handle, child, producer, input, publicationSeq),
        requestedRootDigest: hash(child), producerDigest: hash(producer), effectDigest: hash(intent) };
    const sources = await readInputSources(tx, handle, child, bundle, producer.nodeId, { beforeSeq: publicationSeq }, ownedFacts);
    if (sources.some(fact => fact.receipt.decisionSeq >= publicationSeq)
        || new Set(sources.map(fact => fact.producer.attemptId)).size !== sources.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    const incoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === producer.nodeId);
    const loops = bundle.bindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
    if (incoming.some(edge => node.inputs.find(port => port.name === edge.to.port).required && !bundle.bindings.some(binding => binding.edgeId === edge.edgeId))
        || bundle.bindings.some(binding => !snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.nodeId === producer.nodeId
            && sources.some(source => source.producer.attemptId === binding.producerAttemptId && source.producer.nodeId === edge.from.nodeId)))
        || sources.some(source => !bundle.bindings.some(binding => binding.producerAttemptId === source.producer.attemptId)
            && !(source.record && sources.some(join => join.joinReceipt && bundle.bindings.some(binding => binding.producerAttemptId === join.producer.attemptId)
                && join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, source.receipt.resultRef)))))) invalid();
    for (const binding of loops) {
        const source = sources.find(source => source.producer.attemptId === binding.producerAttemptId);
        if (!source?.patch?.requests.replan || source.patch.requests.finalize || source.patch.newGraphRevision !== producer.graphRevision
            || rpControlReplanScope(snapshot.graph, source.producer.nodeId).target.nodeId !== producer.nodeId) invalid();
    }
    let replacement = null;
    if (input.reviewFeedbackRef) replacement = await readRpDelegatedReviewReplacement(tx, handle, child, producer, input);
    else if (!bundle.bindings.length) {
        if (!snapshot.graph.entryNodeIds.includes(producer.nodeId) || sources.length) invalid();
    } else {
        const bindings = bundle.bindings.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        const receiptId = 'oreceipt_' + hash({ runId: child.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        const direct = sources.filter(source => bindings.some(binding => binding.producerAttemptId === source.producer.attemptId));
        await assertOutputTransition(tx, handle, child, { published: direct[0], additionalProducers: direct.slice(1), output: producer,
            producerBindings: bindings, allowLoopBack: loops.length > 0,
            receipt: { decisionSeq: publicationSeq, traversalReceiptRef: { runId: child.runId, receiptId } } });
    }
    return { input, sources, bindings: replacement ? [] : bundle.bindings, loops, replacement,
        requestedRootDigest: hash(child), producerDigest: hash(producer), effectDigest: hash(intent) };
}

const invalidHistory = () => { throw new TypeError('Invalid RP delegated control facts'); };

/** Full durable child history. No source lookup is cached or turned into a
 * live read grant; the actual consumer separately revalidates its capture. */
export function readRpDelegatedGraphHistory(tx, handle, child, options = {}) {
    return inspectInputs(tx, handle, child, () => readGraphHistory(tx, handle, child, options));
}

async function readGraphHistory(tx, handle, child, { pendingProducer = null, finalPublication = null, closure = null, output = null } = {}) {
    if (!isRpDelegatedControlGraph(child) || Boolean(pendingProducer) === Boolean(finalPublication)) invalidHistory();
    const plan = await readPlanRevision(tx, handle, child.planRef), snapshot = await readTaskGraphRevision(tx, handle, child);
    const rootDigest = hash(child);
    const initial = rpDelegatedControlProfile(plan), profile = rpDelegatedControlProfile({ ...plan, definition: snapshot.graph });
    if (!initial || profile?.terminalNodeId !== initial.terminalNodeId || !equal(profile.output, initial.output)
        || !equal(snapshot.graph.edges.filter(edge => edge.loopBack), plan.definition.edges.filter(edge => edge.loopBack))) invalidHistory();
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
    if (!parent || !profile) invalidHistory();
    const durable = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.runId }))?.doc;
    if (!durable) invalidHistory();
    if (!equal(durable, child)) {
        // The original RunRepository proves the exact prospective TaskLocal
        // output before saving its Root. All lineage still uses the real row.
        const receipt = (await checkedRecord(tx, controlRecordKey(handle, child.runId, 'receipt', taskLocalReceiptId(child.runId))))?.doc;
        if (!receipt || receipt.receiptKind !== 'task_local_output' || durable.status !== 'running' || durable.outputClaims.length
            || durable.cancelRequested || receipt.runId !== durable.runId || receipt.epoch !== durable.epoch
            || receipt.graphRevision !== durable.graphRevision || receipt.decisionSeq !== durable.eventSeq + 1) invalidHistory();
        const pending = { ...durable, status: 'completed', outputClaims: [receipt.claimRef],
            progress: { ...durable.progress, steps: durable.progress.steps + 1 },
            treeProgress: { ...durable.treeProgress, steps: durable.treeProgress.steps + 1 },
            stateVersion: durable.stateVersion + 1, eventSeq: durable.eventSeq + 1, updatedAt: receipt.createdAt };
        if (!equal(pending, child)) invalidHistory();
    }
    const delegated = await readDelegationCompletion(tx, handle, parent, durable);
    if (!delegated) invalidHistory();
    const finalProducer = pendingProducer ?? finalPublication.producer
        ?? (await readAttempt(tx, handle, child, finalPublication.receipt.producerAttemptId)).doc;
    if (finalProducer.nodeId !== profile.terminalNodeId) invalidHistory();
    const bankControl = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: child.budgetAuthorityRef.controlId }))?.doc;
    const bank = bankControl?.operations[child.budgetAuthorityRef.operationId]?.compute;
    if (!bank) invalidHistory();
    const effects = [], budgetAttemptIds = [], planners = [], reviews = [], judges = [], results = [], entries = [], counts = {}, latest = new Map(), previous = new Map(), replaced = new Map(), consumed = new Set(); let settled = true, loopIterations = 0;
    const attempts = [];
    for (const id of child.attemptRefs) attempts.push((await readAttempt(tx, handle, child, id)).doc);
    const fanouts = [];
    for (const producer of attempts.filter(attempt => child.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'join')) {
        const fact = await readRpDelegatedFanoutCompletion(tx, handle, child, producer.attemptId); if (!fact) invalidHistory(); fanouts.push(fact);
    }
    if (attempts.filter(attempt => child.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'fanout').length !== fanouts.length) invalidHistory();
    // Only this history's freshly read Fanout facts can provide their complete
    // original Agent proofs. Caller finalPublication/pendingProducer is excluded.
    const scopeResults = new Map(fanouts.flatMap(fact => fact.graphResults).map(fact => [fact.receipt.resultRef.resultId, fact]));
    const intermediateRefs = attempts.filter(attempt => attempt.attemptId !== finalProducer.attemptId
        && child.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'agent' && attempt.resultRefs.length === 1)
        .map(attempt => attempt.resultRefs[0].resultId);
    const missingRefs = intermediateRefs.filter(id => !scopeResults.has(id));
    const resultFacts = await readGraphNodeResults(tx, handle, child, missingRefs);
    const intermediate = new Map();
    for (const id of intermediateRefs) {
        const fact = scopeResults.get(id) ?? resultFacts.get(id);
        if (!fact || !equal(fact.receipt.resultRef, { runId: child.runId, resultId: id })) invalidHistory();
        intermediate.set(id, fact);
    }
    for (const fact of fanouts) {
        for (const binding of fact.fanout.inputRefs[0].graphBindings) counts[binding.edgeId] = (counts[binding.edgeId] ?? 0) + 1;
        for (const id of [...fact.frame.edgeAdmissionRefs, ...fact.joinReceipt.edgeAdmissionRefs]) {
            const receipt = (await checkedRecord(tx, controlRecordKey(handle, child.runId, 'receipt', id)))?.doc;
            if (!receipt || receipt.receiptKind !== 'edge_admission') invalidHistory();
            counts[receipt.edgeId] = (counts[receipt.edgeId] ?? 0) + 1;
        }
        entries.push({ producer: fact.producer, fact, proof: { sources: fact.members, bindings: [], loops: [], replacement: null } });
    }
    for (const producer of attempts.filter(attempt => profile.models.some(node => node.nodeId === attempt.nodeId))) {
        const node = child.graph.nodes.find(node => node.nodeId === producer.nodeId);
        const scoped = fanouts.flatMap(fact => fact.scopeAttempts).find(item => item.attempt.attemptId === producer.attemptId);
        const unsuccessful = scoped && ['failed', 'cancelled'].includes(producer.status);
        if (unsuccessful && !equal(scoped.attempt, producer)) invalidHistory();
        if (unsuccessful && !producer.effectRefs.length) continue;
        if (!unsuccessful && (!profile.models.some(item => item.nodeId === node?.nodeId) || producer.effectRefs.length !== 1
            || producer.status !== (producer.attemptId === pendingProducer?.attemptId ? 'running' : 'completed')
            || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, child.budgetAuthorityRef))) invalidHistory();
        const checked = producer.attemptId !== finalProducer.attemptId && node.kind === 'agent'
            ? intermediate.get(producer.resultRefs[0]?.resultId) : null;
        const checkedInput = checked?.rpDelegatedInput;
        const effect = checked ? checked.modelEffect : (await readEffect(tx, handle, child, producer.effectRefs[0])).doc;
        if (checked && (!checkedInput || checkedInput.requestedRootDigest !== rootDigest || checkedInput.producerDigest !== hash(producer)
            || checkedInput.effectDigest !== hash(effect) || effect.effectId !== producer.effectRefs[0] || !checked.modelCompletion)) invalidHistory();
        const model = checked ? checked.modelCompletion : await readModelCompletionReceipt(handle, tx, child, effect);
        if (!unsuccessful && !model || effect.sourceBindingDigest !== child.sourceBinding.bindingDigest) invalidHistory();
        const fact = node.kind === 'planner' ? await readGraphPlannerCompletion(tx, handle, child, producer.attemptId, rpDelegatedPlannerReaderOptions)
            : node.kind === 'review' ? await readRpDelegatedControl(tx, handle, child, graphReviewControlRef(child.runId, producer.attemptId))
                : node.kind === 'judge' ? await readRpDelegatedControl(tx, handle, child, graphJudgeControlRef(child.runId, producer.attemptId))
                    : producer.attemptId === finalProducer.attemptId ? finalPublication ? { ...finalPublication, producer, settlement: finalPublication.attemptReceipt } : null
                        : producer.resultRefs.length === 1 ? intermediate.get(producer.resultRefs[0].resultId) : null;
        if (!unsuccessful && (node.kind !== 'agent' && !fact || node.kind === 'agent' && producer.attemptId !== finalProducer.attemptId && !fact)) invalidHistory();
        if (node.kind === 'agent' && fact && producer.attemptId !== finalProducer.attemptId) results.push(fact);
        // Only the nonfinal fact this history itself just read can supply its
        // complete input proof. The caller's final publication (and a pending
        // producer) always starts a fresh original input boundary.
        const proof = producer.attemptId !== finalProducer.attemptId && fact?.rpDelegatedInput
            ? fact.rpDelegatedInput
            : producer.attemptId === finalProducer.attemptId
                ? await readControlInputFactsFresh(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1, null)
                : await readControlInputFacts(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1, null);
        if (!unsuccessful) entries.push({ producer, fact, proof });
        for (const binding of unsuccessful ? [] : proof.bindings) {
            counts[binding.edgeId] = (counts[binding.edgeId] ?? 0) + 1;
            if (child.graph.edges.find(edge => edge.edgeId === binding.edgeId).loopBack) loopIterations++;
        }
        if (node.kind === 'planner') planners.push(fact);
        if (node.kind === 'review') reviews.push(fact);
        if (node.kind === 'judge') judges.push(fact);
        const rows = bank.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
        const local = (bank.localWork ?? []).filter(row => row.orchestration?.effectId === effect.effectId);
        if (rows.length !== 1 || rows[0].reservationId !== child.runId || rows[0].orchestration.kind !== 'provider_send'
            || rows[0].orchestration.ordinal !== 0 || !['settled', 'unknown', 'charged'].includes(rows[0].status)
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalidHistory();
        if (rows[0].status !== 'settled') settled = false;
        effects.push(effect); budgetAttemptIds.push(...rows.map(row => row.attemptId), ...local.map(row => row.attemptId));
    }
    for (const { producer, fact, proof } of entries.sort((a, b) => (a.fact?.receipt.decisionSeq ?? child.eventSeq + 1) - (b.fact?.receipt.decisionSeq ?? child.eventSeq + 1))) {
        let trigger = null;
        if (proof.loops.length) {
            trigger = proof.sources.find(source => source.producer.attemptId === proof.loops[0].producerAttemptId);
            if (!trigger || consumed.has(trigger.producer.attemptId) || latest.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId) invalidHistory();
            const scope = rpControlReplanScope(child.graph, trigger.producer.nodeId);
            if (scope.target.nodeId !== producer.nodeId || !previous.has(producer.nodeId) || proof.loops.length !== scope.loops.length
                || proof.loops.some(binding => binding.producerAttemptId !== trigger.producer.attemptId || !scope.loops.some(edge => edge.edgeId === binding.edgeId))) invalidHistory();
            for (const id of scope.affectedNodeIds) {
                const old = latest.get(id); if (old) replaced.set(id, { attemptId: old.producer.attemptId, trigger });
                latest.delete(id);
            }
            consumed.add(trigger.producer.attemptId);
        }
        for (const source of proof.sources) if (source !== trigger && latest.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalidHistory();
        const prior = previous.get(producer.nodeId);
        if (prior) {
            const replacement = replaced.get(producer.nodeId);
            const loop = replacement?.attemptId === prior.producer.attemptId
                && (trigger?.producer.attemptId === replacement.trigger.producer.attemptId
                    || proof.sources.some(source => source.receipt.decisionSeq > replacement.trigger.receipt.decisionSeq));
            const invalidation = await readAttemptInvalidation(tx, handle, child, prior.producer);
            const causalReview = invalidation && reviews.find(control => control.review.receiptId === invalidation.reviewReceiptId
                && control.review.invalidatedAttemptIds.includes(prior.producer.attemptId)
                && control.receipt.decisionSeq < (fact?.receipt.decisionSeq ?? child.eventSeq + 1));
            const quality = proof.replacement?.target.attemptId === prior.producer.attemptId || causalReview
                && proof.sources.some(source => source.receipt.decisionSeq > causalReview.receipt.decisionSeq)
                || prior.fact?.review?.decision === 'rerun' && child.graph.nodes.find(node => node.nodeId === producer.nodeId)?.kind === 'review'
                    && proof.sources.some(source => source.receipt.decisionSeq > prior.fact.receipt.decisionSeq);
            if (producer.attemptNumber !== prior.producer.attemptNumber + 1 || !loop && !quality) invalidHistory();
            replaced.delete(producer.nodeId);
        }
        if (fact?.review?.decision === 'rerun') for (const [id, old] of latest)
            if (fact.review.invalidatedAttemptIds.includes(old.producer.attemptId)) latest.delete(id);
        latest.set(producer.nodeId, { producer, fact }); previous.set(producer.nodeId, { producer, fact });
    }
    const orderedRefs = [...results, ...finalPublication ? [finalPublication] : []].sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq).map(fact => fact.receipt.resultRef);
    if (!equal(child.resultRefs, orderedRefs) || replaced.size || consumed.size !== child.progress.replans
        || [...latest.values()].some(item => item.fact?.patch?.requests.replan)) invalidHistory();
    if (profile.models.some(node => !latest.has(node.nodeId)
        && !fanouts.some(fact => fact.scopeAttempts.some(item => item.attempt.nodeId === node.nodeId && ['failed', 'cancelled'].includes(item.attempt.status)))) || effects.length !== new Set(effects.map(effect => effect.effectId)).size
        || reviews.length !== child.progress.reviews || planners.length !== child.graphRevision || child.progress.replans !== planners.filter(fact => fact.patch.requests.replan).length
        || bank.attempts.some(row => row.reservationId === child.runId && !budgetAttemptIds.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !budgetAttemptIds.includes(row.attemptId))) invalidHistory();
    const outputs = attempts.filter(attempt => attempt.nodeId === profile.output.nodeId);
    if (outputs.length !== Number(!!output) || output && outputs[0].attemptId !== output.attemptId) invalidHistory();
    if (output) counts[child.graph.edges.find(edge => edge.to.nodeId === output.nodeId).edgeId] = 1;
    if (child.progress.loopIterations !== loopIterations || child.progress.edgeVisits !== Object.values(counts).reduce((a, b) => a + b, 0)
        || !equal(child.progress.edgeVisitCounts, counts)) invalidHistory();
    if (hash(child) !== rootDigest) invalidHistory();
    const history = { plan, profile, graph: snapshot.graph, models: profile.models, output: profile.output, terminalNodeId: profile.terminalNodeId,
        lineage: { ...delegated, parent, child }, finalProducer, effects, planners, reviews, judges, fanouts, results, rootDigest: hash(child), budgetAttemptIds, settled, loopIterations };
    if (closure) assertRpDelegatedClosure(child, history, closure);
    return history;
}
