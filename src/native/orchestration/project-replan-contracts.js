import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { readAttempt, readAttemptInvalidation, controlRecordKey } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readEffect } from './effect-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { readGraphReviewCompletion } from './graph-review-completion.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readProjectFanoutCompletion } from './project-fanout-contracts.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { PROJECT_QUALITY_REASONS } from './project-quality-profile.js';
import { projectJudgeReaderOptions } from './project-control-input-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const invalid = () => { throw new TypeError('Invalid Project replan facts'); };
const pending = () => { throw Object.assign(new TypeError('native_orchestration_project_replan_unavailable'), { code: 'native_orchestration_project_replan_unavailable' }); };

/** requestReplan has no target field. Only published bounded return edges
 * identify the destination. This projection never invalidates old receipts. */
export function projectReplanScope(graph, plannerNodeId) {
    const planner = graph.nodes.find(node => node.nodeId === plannerNodeId);
    const loops = graph.edges.filter(edge => edge.loopBack && edge.from.nodeId === plannerNodeId);
    if (planner?.kind !== 'planner' || !loops.length || new Set(loops.map(edge => edge.to.nodeId)).size !== 1) pending();
    const target = graph.nodes.find(node => node.nodeId === loops[0].to.nodeId);
    if (!target || !['agent', 'planner'].includes(target.kind)) pending();
    const reach = (start, reverse = false) => {
        const seen = new Set(), work = [start];
        while (work.length) {
            const id = work.pop(); if (seen.has(id)) continue; seen.add(id);
            work.push(...graph.edges.filter(edge => !edge.loopBack && edge[reverse ? 'to' : 'from'].nodeId === id)
                .map(edge => edge[reverse ? 'from' : 'to'].nodeId));
        }
        return seen;
    };
    const affected = reach(target.nodeId), ancestors = reach(plannerNodeId, true);
    // Official Task tools, completed Fanout and delegation stay outside this
    // pure Model interval. Repeated quality work keeps its original receipts.
    if (!affected.has(plannerNodeId) || graph.nodes.some(node => affected.has(node.nodeId) && ancestors.has(node.nodeId)
        && (!['agent', 'planner', 'review', 'judge'].includes(node.kind) || node.capabilities.some(capability => !['generation.send', 'graph.patch'].includes(capability))))) pending();
    return { target, loops, affectedNodeIds: [...affected] };
}

export function projectPlannerProgressFingerprint(operations, sourceBinding, evidence) {
    return hash({ operations, sourceBindingDigest: sourceBinding.bindingDigest,
        evidence: evidence.map(fact => ({ nodeId: fact.producer.nodeId, payloadHash: hash(fact.record.payload) })) });
}

async function readPureFacts(tx, handle, root) {
    const facts = [];
    for (const id of root.attemptRefs) {
        const producer = (await readAttempt(tx, handle, root, id)).doc;
        if (producer.status !== 'completed') continue;
        const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
        let fact;
        if (node.kind === 'planner') fact = await readGraphPlannerCompletion(tx, handle, root, id, { verifyControlWork: assertProjectControlWork });
        else if (node.kind === 'review') fact = await readGraphReviewCompletion(tx, handle, root, id, { verifyControlWork: assertProjectControlWork, reasonCodes: PROJECT_QUALITY_REASONS });
        else if (node.kind === 'judge') fact = await readGraphJudgeCompletion(tx, handle, root, id, projectJudgeReaderOptions);
        else if (node.kind === 'join') fact = await readProjectFanoutCompletion(tx, handle, root, id);
        else if (node.kind === 'agent' && node.outputs[0]?.type === 'text') {
            if (producer.resultRefs.length !== 1) invalid();
            fact = await readGraphNodeResult(tx, handle, root, producer.resultRefs[0].resultId);
        } else continue;
        if (!fact || fact.producer.attemptId !== id) invalid();
        facts.push(fact);
    }
    return facts;
}

/** Reconstruct every completed round from original typed facts and actual
 * Transitions. A pending recipient is checked from its own durable admission;
 * this function publishes no synthetic Result, invalidation or new authority. */
export async function readProjectReplanHistory(tx, handle, root, { recipient = null } = {}) {
    const facts = await readPureFacts(tx, handle, root), events = facts.map(fact => ({ fact, producer: fact.producer, seq: fact.receipt.decisionSeq }));
    let cutoff = root.eventSeq + 1, formalRecipient = false;
    if (recipient) {
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient)) invalid();
        const admission = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', 'oreceipt_' + actual.attemptId.slice('oattempt_'.length))))?.doc;
        if (admission) {
            if (admission.receiptKind !== 'graph_transition' || admission.nodeAttemptId !== actual.attemptId
                || admission.runId !== root.runId || admission.inputDigest !== actual.inputDigest) invalid();
            cutoff = admission.decisionSeq;
        } else if (actual.attemptNumber !== 1 || !root.graph.entryNodeIds.includes(actual.nodeId)
            || root.graph.edges.some(edge => !edge.loopBack && edge.to.nodeId === actual.nodeId)) invalid();
        formalRecipient = root.graph.nodes.find(node => node.nodeId === actual.nodeId)?.outputs[0]?.type === 'json'
            && root.graph.nodes.find(node => node.nodeId === actual.nodeId)?.kind === 'agent';
        if (!formalRecipient) events.push({ fact: null, producer: actual, seq: cutoff });
    }
    const current = new Map(), previous = new Map(), replaced = new Map(), consumed = new Set(), loopCounts = new Map(), seenProgress = new Map();
    for (const { fact, producer, seq } of events.filter(event => !recipient || event.seq <= cutoff).sort((a, b) => a.seq - b.seq)) {
        const snapshot = await readTaskGraphRevision(tx, handle, root, producer.graphRevision), node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId);
        const input = producer.inputRefs[0];
        if (fact?.receipt.modelEffectId && input.kind !== 'native_project_delegation') {
            const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc;
            if (!equal(intent.inputRef, input) || intent.inputHash !== hash(input) || producer.inputDigest !== hash(producer.inputRefs)
                || intent.grantDigest !== producer.effectiveGrantDigest || intent.nodeAttemptId !== producer.attemptId) invalid();
        }
        if (input.kind === 'native_project_intent' && !equal(producer.inputRefs, [input, ...input.acceptedGraphResultRefs ?? [], ...input.acceptedControlRefs ?? []])) invalid();
        const admission = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', 'oreceipt_' + producer.attemptId.slice('oattempt_'.length))))?.doc;
        const bundle = input.controlGraph ?? { bindings: admission?.bindings ?? [] };
        if (!Array.isArray(bundle.bindings)) invalid();
        if (node.kind === 'join') { current.set(node.nodeId, fact); previous.set(node.nodeId, fact); continue; }
        const sources = [...input.acceptedGraphResultRefs ?? [], ...input.acceptedControlRefs ?? []].map(ref => facts.find(source => equal(source.controlRef ?? source.receipt.resultRef, ref)));
        if (sources.some(source => !source || source.receipt.decisionSeq >= seq)) invalid();
        const bindings = [...bundle.bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (new Set(bindings.map(binding => binding.edgeId)).size !== bindings.length) invalid();
        const loops = bindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
        let trigger = null;
        if (loops.length) {
            trigger = sources.find(source => source.producer.attemptId === loops[0].producerAttemptId);
            if (!trigger?.patch?.requests.replan || trigger.patch.requests.finalize || trigger.patch.newGraphRevision !== producer.graphRevision
                || current.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId || consumed.has(trigger.producer.attemptId)) invalid();
            const scope = projectReplanScope(snapshot.graph, trigger.producer.nodeId);
            if (scope.target.nodeId !== node.nodeId || !previous.has(node.nodeId) || loops.length !== scope.loops.length
                || loops.some(binding => binding.producerAttemptId !== trigger.producer.attemptId || !scope.loops.some(edge => edge.edgeId === binding.edgeId))) invalid();
            for (const id of scope.affectedNodeIds) {
                const old = current.get(id), original = snapshot.graph.nodes.find(item => item.nodeId === id);
                if (old) {
                    if (!['agent', 'planner', 'review', 'judge'].includes(original.kind) || original.capabilities.some(capability => !['generation.send', 'graph.patch'].includes(capability))) invalid();
                    replaced.set(id, { attemptId: old.producer.attemptId, trigger }); current.delete(id);
                }
            }
            for (const binding of loops) loopCounts.set(binding.edgeId, (loopCounts.get(binding.edgeId) ?? 0) + 1);
            consumed.add(trigger.producer.attemptId);
        }
        for (const source of sources) if (source !== trigger && current.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        const direct = sources.filter(source => bindings.some(binding => binding.producerAttemptId === source.producer.attemptId));
        if (bindings.some(binding => !direct.some(source => source.producer.attemptId === binding.producerAttemptId
            && snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === source.producer.nodeId && edge.to.nodeId === node.nodeId)))) invalid();
        for (const port of node.inputs.filter(port => port.required)) if (!bindings.some(binding => snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.port === port.name))) invalid();
        const feedback = input.projectQualityTask?.feedback;
        let reviewedReplacement = null;
        if (feedback) {
            reviewedReplacement = facts.find(source => source.review?.decision === 'rerun'
                && equal(feedback, { reviewReceiptRef: source.receipt.reviewReceiptRef, reasonCode: source.review.reasonCode })
                && source.review.replacements.some(item => item.attemptId === producer.attemptId));
            const replacement = reviewedReplacement?.review.replacements.find(item => item.attemptId === producer.attemptId);
            const target = reviewedReplacement?.targets.find(item => item.attemptId === replacement?.targetAttemptId);
            if (!target || producer.nodeId !== target.nodeId || producer.epoch !== reviewedReplacement.review.epoch
                || producer.graphRevision !== reviewedReplacement.review.graphRevision || seq <= reviewedReplacement.receipt.decisionSeq
                || !equal(bundle, target.inputRefs[0].controlGraph)) invalid();
            const expected = { ...target.inputRefs[0],
                requestId: 'project-quality:' + hash({ runId: root.runId, nodeId: producer.nodeId, token: producer.attemptId }).slice(0, 32),
                projectQualityTask: { ...target.inputRefs[0].projectQualityTask, feedback } };
            expected.grantDigest = hash({ handle, input: { ...expected, grantDigest: null } });
            if (!equal(input, expected) || producer.effectiveGrantDigest !== expected.grantDigest) invalid();
        }
        // Prepared targets come from the actual Review admission above. They
        // do not invent a second Transition or charge old input edges again.
        if (bindings.length && !input.fanoutAttemptId && !reviewedReplacement) {
            const traversal = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, { ...root, graph: snapshot.graph }, { published: direct[0], additionalProducers: direct.slice(1),
                output: producer, producerBindings: bindings, allowLoopBack: !!loops.length,
                receipt: { decisionSeq: fact?.receipt.decisionSeq ?? root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversal } } });
        } else if (!bindings.length && !snapshot.graph.entryNodeIds.includes(node.nodeId) && !reviewedReplacement) invalid();
        const prior = previous.get(node.nodeId);
        if (prior) {
            const replacement = replaced.get(node.nodeId), invalidation = await readAttemptInvalidation(tx, handle, root, prior.producer);
            const repeated = replacement?.attemptId === prior.producer.attemptId && producer.attemptNumber === prior.producer.attemptNumber + 1
                && (trigger?.producer.attemptId === replacement.trigger.producer.attemptId || sources.some(source => source.receipt.decisionSeq > replacement.trigger.receipt.decisionSeq));
            const review = invalidation && facts.find(source => source.review?.receiptId === invalidation.reviewReceiptId);
            const directReplacement = review?.review.replacements.some(item => item.targetAttemptId === prior.producer.attemptId && item.attemptId === producer.attemptId);
            const redo = review?.review.decision === 'rerun' && review.review.invalidatedAttemptIds.includes(prior.producer.attemptId)
                && producer.attemptNumber === prior.producer.attemptNumber + 1 && seq > review.receipt.decisionSeq
                && (directReplacement && reviewedReplacement === review || sources.some(source => source.receipt.decisionSeq > review.receipt.decisionSeq));
            if (!repeated && !redo && !(node.kind === 'review' && prior.review.decision === 'rerun')) invalid();
            replaced.delete(node.nodeId);
        }
        if (fact?.patch) {
            const key = projectPlannerProgressFingerprint(fact.patch.appliedOperations, root.sourceBinding, sources.filter(source => source.record));
            const keys = seenProgress.get(node.nodeId) ?? new Set();
            if (keys.has(key)) invalid(); keys.add(key); seenProgress.set(node.nodeId, keys);
        }
        if (fact?.review?.decision === 'rerun') for (const [id, old] of current) if (fact.review.invalidatedAttemptIds.includes(old.producer.attemptId)) current.delete(id);
        if (fact) { previous.set(node.nodeId, fact); current.set(node.nodeId, fact); }
    }
    if (formalRecipient) {
        for (const ref of [...recipient.inputRefs[0].acceptedGraphResultRefs ?? [], ...recipient.inputRefs[0].acceptedControlRefs ?? []]) {
            const source = facts.find(fact => equal(fact.controlRef ?? fact.receipt.resultRef, ref));
            if (!source || current.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        }
    }
    if (!recipient && (replaced.size || consumed.size !== root.progress.replans || [...current.values()].some(fact => fact.patch?.requests.replan)
        || facts.filter(fact => fact.patch?.requests.replan).length !== consumed.size
        || root.graph.edges.filter(edge => edge.loopBack && root.graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind === 'planner')
            .some(edge => (root.progress.edgeVisitCounts[edge.edgeId] ?? 0) !== (loopCounts.get(edge.edgeId) ?? 0)))) invalid();
    return { facts, current, consumed, loopCounts };
}
