import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readRpControlFanoutCompletion } from './rp-control-fanout-contracts.js';
import { readGraphFanoutInput } from './graph-fanout-completion.js';
import { readFanoutFrame } from './fanout-controller.js';
import { readGraphNodeResult, readGraphNodeResults } from './graph-result-contracts.js';
import { readGraphPlannerCompletion, graphPlannerProgressFingerprint } from './graph-planner-completion.js';
import { readGraphReviewCompletion } from './graph-review-completion.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readAttempt, assertAttemptConsumable, readAttemptInvalidation } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { assertAudienceRunCapture, audienceContextPin } from './audience-source-contracts.js';
import { rpControlGraph, rpControlReplanScope } from './rp-control-graph.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

const invalid = () => { throw new TypeError('Invalid RP control graph facts'); };
export const rpPlannerReaderOptions = { verifyControlWork: assertRpControlWork };
export const rpReviewReaderOptions = { verifyControlWork: assertRpControlWork, reasonCodes: RP_REVIEW_REASON_CODES };
export const rpJudgeReaderOptions = { verifyControlWork: assertRpControlWork,
    readControlInputs: (tx, handle, root, producer, input) => {
        // The shared Judge reader has already proved every candidate and will
        // check the exact combined Transition. Supply only its other controls.
        const bundle = input.controlGraph, ids = new Set(bundle.controlRefs.map(ref => ref.attemptId));
        return readRpControlInputs(tx, handle, root, { evidenceRefs: [], controlRefs: bundle.controlRefs,
            bindings: bundle.bindings.filter(binding => ids.has(binding.producerAttemptId)) }, { targetNodeId: producer.nodeId, checkSelections: false, controlsOnly: true });
    } };

export async function readRpControlInputs(tx, handle, root, bundle, options = {}) {
    return readControlInputFacts(tx, handle, root, bundle, options, null);
}

async function readControlInputFacts(tx, handle, root, bundle, { targetNodeId = null, live = false, checkSelections = true, recipient = null, controlsOnly = false, fanoutAttemptId = recipient?.inputRefs?.[0]?.fanoutAttemptId ?? null } = {}, ownedFacts) {
    assertObject(bundle, ['evidenceRefs', 'controlRefs', 'bindings'], 'RP graph inputs');
    if (!Array.isArray(bundle.evidenceRefs) || !Array.isArray(bundle.controlRefs) || !Array.isArray(bundle.bindings)
        || new Set(bundle.evidenceRefs.map(hash)).size !== bundle.evidenceRefs.length
        || new Set(bundle.controlRefs.map(hash)).size !== bundle.controlRefs.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    if (controlsOnly && bundle.evidenceRefs.length) invalid();
    const facts = [], controls = [];
    for (const ref of bundle.controlRefs) {
        const fact = ownedFacts ? ownedFacts.controls.get(hash(ref)) : ref.kind === 'graph_join_control' ? await readRpControlFanoutCompletion(tx, handle, root, ref.attemptId)
            : ref.kind === 'graph_review_control'
                ? await readGraphReviewCompletion(tx, handle, root, ref.attemptId, rpReviewReaderOptions)
                : ref.kind === 'graph_judge_control' ? await readGraphJudgeCompletion(tx, handle, root, ref.attemptId, rpJudgeReaderOptions)
                    : ref.kind === 'graph_planner_control' ? await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, rpPlannerReaderOptions) : null;
        if (!fact || !equal(fact.controlRef, ref)) invalid(); controls.push(fact);
    }
    // A complete Join read above already checked its actual member Results,
    // Model receipts and bank in this invocation. Reuse those historical facts
    // for the explicit bundle, retaining its exact order and all live recipient
    // and Source checks below. No fact or grant survives this call.
    const joinedResults = new Map(controls.flatMap(control => (control.graphResults ?? []).map(fact => [fact.record.resultId, fact])));
    const otherResults = ownedFacts ? ownedFacts.results
        : await readGraphNodeResults(tx, handle, root, bundle.evidenceRefs.filter(ref => !joinedResults.has(ref.resultId)).map(ref => ref.resultId));
    for (const ref of bundle.evidenceRefs) {
        const fact = joinedResults.get(ref.resultId) ?? otherResults.get(ref.resultId);
        if (!fact || !equal(fact.receipt.resultRef, ref)) invalid(); facts.push(fact);
    }
    facts.push(...controls);
    let inherited = [];
    if (fanoutAttemptId) {
        const fanout = (await readAttempt(tx, handle, root, fanoutAttemptId)).doc;
        const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
        if (!frame || !frame.branches.some(branch => branch.scopeNodeIds.includes(targetNodeId))
            || !equal(fanout.budgetRef, root.budgetAuthorityRef) || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest) invalid();
        inherited = facts.filter(fact => fanout.inputRefs.some(ref => equal(ref, fact.controlRef ?? fact.receipt.resultRef)));
        // Preparation proves frozen references only. Any actual consumption
        // additionally proves this original recipient's input and membership.
        if (recipient) for (const fact of inherited) await readGraphFanoutInput(tx, handle, root, fanoutAttemptId, recipient,
            fact.controlRef ?? fact.receipt.resultRef, fact, { historical: !live });
    }
    const direct = facts.filter(fact => bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
    const joined = direct.filter(fact => fact.joinReceipt);
    if (facts.filter(fact => !direct.includes(fact) && !inherited.includes(fact)).some(fact => !fact.record
        || !joined.some(join => join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, fact.receipt.resultRef))))
        || !controlsOnly && joined.some(join => join.joinReceipt.acceptedResultRefs.some(ref => !bundle.evidenceRefs.some(actual => equal(actual, ref))))
        || bundle.bindings.some(binding => !direct.some(fact => fact.producer.attemptId === binding.producerAttemptId
            && root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === fact.producer.nodeId
                && (targetNodeId === null || edge.to.nodeId === targetNodeId))))) invalid();
    for (const fact of facts) {
        if (live) await assertAttemptConsumable(tx, handle, root, fact.producer);
        if (targetNodeId !== null && fact.record && !fact.record.envelope.audienceConstraint.nodeIds.includes(targetNodeId)) invalid();
    }
    if (checkSelections && targetNodeId !== null) for (const judge of facts.filter(fact => fact.controlRef?.kind === 'graph_judge_control')) {
        for (const candidate of judge.candidates) {
            const direct = root.graph.edges.some(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === targetNodeId);
            if (direct && bundle.evidenceRefs.some(ref => equal(ref, candidate.receipt.resultRef)) !== equal(candidate.receipt.resultRef, judge.selectedResultRef)) invalid();
        }
    }
    return facts;
}

/** Original persisted dependencies and transitions. Historical reads remain
 * available after Source deletion; they never restore a runtime read grant. */
export async function assertRpControlInput(tx, handle, root, fact, plan = null) {
    return assertControlInputFacts(tx, handle, root, fact, plan, null);
}

async function assertControlInputFacts(tx, handle, root, fact, plan, ownedFacts) {
    plan ??= await readPlanRevision(tx, handle, root.planRef);
    const producer = fact.producer, intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc, input = intent.inputRef;
    const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId), bundle = input.controlGraph;
    if (!bundle || input.kind !== 'native_rp_intent' || input.role !== 'narrator' || input.nodeId !== producer.nodeId
        || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
        || !equal(input.audience, audienceContextPin(node, plan.dependencyPins)?.resourceRef.audience ?? { kind: 'narrator' })
        || !equal(input.acceptedGraphResultRefs, bundle.evidenceRefs)
        || !equal(producer.inputRefs, [input, ...bundle.evidenceRefs, ...bundle.controlRefs]) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    assertAudienceRunCapture(root, node, plan.dependencyPins, input);
    const sources = await readControlInputFacts(tx, handle, root, bundle, { targetNodeId: node.nodeId, recipient: producer }, ownedFacts);
    const loops = bundle.bindings.filter(binding => root.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
    let replanFrom = null;
    if (loops.length) {
        const previous = sources.find(source => source.producer.attemptId === loops[0].producerAttemptId);
        if (!previous?.patch?.requests.replan || previous.patch.requests.finalize) invalid();
        const declared = rpControlReplanScope(root.graph, previous.producer.nodeId);
        if (declared.target.nodeId !== node.nodeId || previous.patch.newGraphRevision !== producer.graphRevision || loops.length !== declared.loops.length
            || loops.some(binding => binding.producerAttemptId !== previous.producer.attemptId || !declared.loops.some(edge => edge.edgeId === binding.edgeId))) invalid();
        replanFrom = previous.producer.attemptId;
    }
    if (input.reviewFeedbackRef) {
        let admission = null;
        for (const id of root.attemptRefs) {
            const attempt = (await readAttempt(tx, handle, root, id)).doc;
            if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId).kind !== 'review') continue;
            const review = ownedFacts ? ownedFacts.attempts.get(id) : await readGraphReviewCompletion(tx, handle, root, id, rpReviewReaderOptions);
            if (review && equal(input.reviewFeedbackRef, { reviewReceiptRef: review.receipt.reviewReceiptRef, reasonCode: review.review.reasonCode })
                && review.review.decision === 'rerun' && review.review.replacements.some(item => item.attemptId === producer.attemptId)) admission = review;
        }
        if (!admission || producer.nodeId !== admission.targets.find(target => admission.review.replacements.some(item => item.targetAttemptId === target.attemptId
            && item.attemptId === producer.attemptId))?.nodeId) invalid();
    } else if (!bundle.bindings.length) {
        if (input.fanoutAttemptId) {
            const frame = await readFanoutFrame(tx, handle, root, input.fanoutAttemptId);
            if (!frame?.branches.some(branch => branch.entryAttemptId === producer.attemptId && branch.scopeNodeIds.includes(producer.nodeId))) invalid();
        } else if (!root.graph.entryNodeIds.includes(node.nodeId) || sources.length) invalid();
    } else {
        const bindings = bundle.bindings.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: producer.reservationRef ? producer.attemptId : null }).slice(0, 32);
        const direct = sources.filter(source => bindings.some(binding => binding.producerAttemptId === source.producer.attemptId));
        await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: producer,
            producerBindings: bindings, allowLoopBack: loops.length > 0, reservedAttemptId: producer.reservationRef ? producer.attemptId : null,
            receipt: { decisionSeq: fact.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
    return { input, sources, replanFrom };
}

/** Reconstruct original model iterations from exact Transition/Model receipts.
 * Loops or actual Review invalidation create fresh work; this never invents one or erases
 * an accepted GraphPatch, old Result, original charge or bank reservation. */
async function assertRpIterationHistory(tx, handle, root, entries, narrator, fanouts) {
    const previous = new Map(), current = new Map(), replacements = new Map(), touched = new Set(), consumed = new Set(), progressKeys = new Map();
    for (const entry of [...entries].sort((a, b) => a.fact.receipt.decisionSeq - b.fact.receipt.decisionSeq)) {
        const { fact, node, inputProof } = entry, prior = previous.get(node.nodeId);
        if (inputProof.replanFrom) {
            const trigger = inputProof.sources.find(source => source.producer.attemptId === inputProof.replanFrom);
            if (!trigger || current.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId
                || consumed.has(trigger.producer.attemptId) || !prior) invalid();
            const snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision);
            const scope = rpControlReplanScope(snapshot.graph, trigger.producer.nodeId);
            if (scope.target.nodeId !== node.nodeId || fanouts.some(group => group.frame.decisionSeq < trigger.receipt.decisionSeq
                && [group.fanout.nodeId, group.producer.nodeId].some(id => scope.affectedNodeIds.includes(id)))) invalid();
            for (const id of scope.affectedNodeIds) {
                const old = current.get(id);
                if (old) {
                    if (!['agent', 'planner', 'review', 'judge'].includes(snapshot.graph.nodes.find(node => node.nodeId === id)?.kind)) invalid();
                    replacements.set(id, { attemptId: old.producer.attemptId, trigger });
                }
                touched.add(id); current.delete(id);
            }
            consumed.add(trigger.producer.attemptId);
        }
        for (const source of inputProof.sources) if (touched.has(source.producer.nodeId)
            && ['agent', 'planner', 'review', 'judge'].includes(root.graph.nodes.find(node => node.nodeId === source.producer.nodeId)?.kind)
            && source.producer.attemptId !== inputProof.replanFrom
            && current.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        if (prior) {
            const invalidation = await readAttemptInvalidation(tx, handle, root, prior.producer), replacement = replacements.get(node.nodeId);
            const loop = replacement?.attemptId === prior.producer.attemptId
                && fact.producer.attemptNumber === prior.producer.attemptNumber + 1
                && (inputProof.replanFrom === replacement.trigger.producer.attemptId
                    || inputProof.sources.some(source => touched.has(source.producer.nodeId)
                        && source.receipt.decisionSeq > replacement.trigger.receipt.decisionSeq));
            // The original Review invalidates settled causal work. Direct
            // targets are pre-created; descendants still need fresh current
            // typed predecessors and their actual original Transitions.
            const review = invalidation && [...previous.values()].find(fact => fact.review?.receiptId === invalidation.reviewReceiptId);
            const directReplacement = review?.review.replacements.some(item => item.targetAttemptId === prior.producer.attemptId && item.attemptId === fact.producer.attemptId);
            const redo = review && review.review.decision === 'rerun' && review.review.invalidatedAttemptIds.includes(prior.producer.attemptId)
                && fact.producer.attemptNumber === prior.producer.attemptNumber + 1 && fact.receipt.decisionSeq > review.receipt.decisionSeq
                && (directReplacement || inputProof.sources.some(source => source.receipt.decisionSeq > review.receipt.decisionSeq));
            if (node.kind === 'planner' ? !loop && !redo : ['agent', 'judge'].includes(node.kind) ? !loop && !redo
                : node.kind === 'review' && !loop && prior.review.decision !== 'rerun' && !redo) invalid();
            replacements.delete(node.nodeId);
        } else if (inputProof.replanFrom) invalid();
        if (fact.review?.decision === 'rerun') for (const [id, old] of current)
            if (fact.review.invalidatedAttemptIds.includes(old.producer.attemptId)) { touched.add(id); current.delete(id); }
        if (fact.patch) {
            const key = graphPlannerProgressFingerprint(fact.patch.appliedOperations, root.sourceBinding, inputProof.sources.filter(source => source.record));
            const keys = progressKeys.get(node.nodeId) ?? new Set(); if (keys.has(key)) invalid(); keys.add(key); progressKeys.set(node.nodeId, keys);
        }
        previous.set(node.nodeId, fact); current.set(node.nodeId, fact);
    }
    for (const source of narrator.sources) if (touched.has(source.producer.nodeId)
        && ['agent', 'planner', 'review', 'judge'].includes(root.graph.nodes.find(node => node.nodeId === source.producer.nodeId)?.kind)
        && current.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
    if (replacements.size || consumed.size !== root.progress.replans) invalid();
}

export async function readRpControlGraphHistory(tx, handle, root, narrator) {
    const plan = await readPlanRevision(tx, handle, root.planRef), admission = rpControlGraph({ ...plan, definition: root.graph }, { force: true });
    if (narrator.producer.nodeId !== admission.narrator.nodeId) invalid();
    const graphResults = [], plannerCompletions = [], reviewCompletions = [], judgeCompletions = [], fanoutCompletions = [], seen = new Map(), loopCounts = new Map(), entries = [];
    const ownedFacts = { results: new Map(), controls: new Map(), attempts: new Map() }, models = [];
    const hasLoops = root.graph.edges.some(edge => edge.loopBack);
    if (root.graph.nodes.some(node => node.kind === 'join')) for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'join') continue;
        const fact = await readRpControlFanoutCompletion(tx, handle, root, id);
        if (!fact) invalid(); fanoutCompletions.push(fact);
        ownedFacts.controls.set(hash(fact.controlRef), fact);
        for (const result of fact.graphResults) ownedFacts.results.set(result.record.resultId, result);
    }
    for (const id of root.attemptRefs) {
        const producer = (await readAttempt(tx, handle, root, id)).doc;
        if (producer.attemptId === narrator.producer.attemptId || producer.nodeId === admission.output.nodeId) continue;
        const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
        if (['fanout', 'join'].includes(node.kind)) continue;
        if (producer.status !== 'completed' && fanoutCompletions.some(group => group.scopeAttempts.some(item => equal(item.attempt, producer)))) continue;
        const fact = node.kind === 'planner'
            ? await readGraphPlannerCompletion(tx, handle, root, id, rpPlannerReaderOptions)
            : node.kind === 'review' ? await readGraphReviewCompletion(tx, handle, root, id, rpReviewReaderOptions)
                : node.kind === 'judge' ? await readGraphJudgeCompletion(tx, handle, root, id, rpJudgeReaderOptions)
                    : ownedFacts.results.get(producer.resultRefs[0]?.resultId)
                        ?? await readGraphNodeResult(tx, handle, root, producer.resultRefs[0]?.resultId);
        if (!fact || !equal(fact.producer, producer)) invalid();
        models.push({ producer, node, fact }); ownedFacts.attempts.set(producer.attemptId, fact);
        if (fact.controlRef) ownedFacts.controls.set(hash(fact.controlRef), fact);
        else ownedFacts.results.set(fact.record.resultId, fact);
    }
    // All facts here were read completely above, through their original typed
    // readers, in this single invocation. Reuse them for dependency/Transition
    // checks instead of replaying the same Model/Join histories per consumer.
    // The public readers never accept this map, and the next live Source/bank
    // boundary starts a completely new historical read.
    for (const { producer, node, fact } of models) {
        const previous = seen.get(node.nodeId);
        const invalidation = previous ? await readAttemptInvalidation(tx, handle, root, previous.producer) : null;
        const inputProof = await assertControlInputFacts(tx, handle, root, fact, plan, ownedFacts);
        if (!hasLoops && node.kind === 'planner' && inputProof.replanFrom !== (invalidation ? null : previous?.producer.attemptId ?? null)) invalid();
        if (!hasLoops && previous && (['agent', 'judge'].includes(node.kind) && !invalidation
            || node.kind === 'review' && previous.review.decision !== 'rerun' && !invalidation)) invalid();
        seen.set(node.nodeId, fact);
        entries.push({ fact, node, inputProof });
        for (const binding of inputProof.input.controlGraph.bindings) if (root.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack)
            loopCounts.set(binding.edgeId, (loopCounts.get(binding.edgeId) ?? 0) + 1);
        if (node.kind !== 'agent') {
            const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc;
            const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
            (node.kind === 'planner' ? plannerCompletions : node.kind === 'review' ? reviewCompletions : judgeCompletions)
                .push({ ...fact, modelEffectId: fact.receipt.modelEffectId, retrievalCompletions });
        } else graphResults.push(fact);
    }
    const narratorProof = await assertControlInputFacts(tx, handle, root, narrator, plan, ownedFacts);
    await assertRpIterationHistory(tx, handle, root, entries, narratorProof, fanoutCompletions);
    // Review creates all replacement attempts before scheduling them. Their
    // creation order is not their Result publication order. Each receipt's
    // sequence is already bound to its original attempt settlement above.
    graphResults.sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq);
    const published = [...graphResults, narrator];
    if (published.some((fact, index) => index > 0 && published[index - 1].receipt.decisionSeq >= fact.receipt.decisionSeq)
        || root.graphRevision !== plannerCompletions.length || !equal(root.resultRefs, published.map(fact => fact.receipt.resultRef))
        || root.progress.replans !== plannerCompletions.filter(fact => fact.patch.requests.replan).length
        || [...seen.values()].some(fact => fact.patch?.requests.replan)
        || root.progress.loopIterations !== [...loopCounts.values()].reduce((total, count) => total + count, 0)
        || root.graph.edges.filter(edge => edge.loopBack).some(edge => (root.progress.edgeVisitCounts[edge.edgeId] ?? 0) !== (loopCounts.get(edge.edgeId) ?? 0))) invalid();
    return { graphResults, plannerCompletions, reviewCompletions, judgeCompletions, fanoutCompletions,
        loopIterations: [...loopCounts.values()].reduce((total, count) => total + count, 0),
        ...(fanoutCompletions.length ? { fanout: { providerEffects: [...new Set([...graphResults.map(fact => fact.receipt.modelEffectId),
            ...fanoutCompletions.flatMap(group => group.providerEffects)])] } } : {}) };
}
