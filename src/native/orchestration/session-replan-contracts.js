import { readSessionFanoutReplanScope } from './session-fanout-planner-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readAttemptInvalidation } from './controller-common.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readEffect } from './effect-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const invalid = () => { throw new TypeError('Invalid original Session replan facts'); };
const pending = () => { throw Object.assign(new TypeError('native_orchestration_planner_replan_pending'), { code: 'native_orchestration_planner_replan_pending' }); };

/** The original requestReplan carries no target. Only authored return edges
 * select it. This read-only topology projection grants no work or Source. */
export function sessionReplanScope(graph, plannerNodeId) {
    if (graph.nodes.find(node => node.nodeId === plannerNodeId)?.kind !== 'planner') pending();
    const loops = graph.edges.filter(edge => edge.loopBack && edge.from.nodeId === plannerNodeId);
    if (!loops.length || new Set(loops.map(edge => edge.to.nodeId)).size !== 1) pending();
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
    if (!affected.has(plannerNodeId) || graph.nodes.some(node => affected.has(node.nodeId) && ancestors.has(node.nodeId)
        && (!['agent', 'planner', 'review', 'judge'].includes(node.kind) || node.capabilities.includes('agent.delegate')))) pending();
    return { target, loops, affectedNodeIds: [...affected] };
}

/** New receipt IDs or whitespace are not new evidence. This comparison uses
 * already checked advisory payloads and the original captured Source only. */
export function sessionPlannerProgressFingerprint(operations, sourceBinding, evidence) {
    return hash({ operations, sourceBindingDigest: sourceBinding.bindingDigest,
        evidence: evidence.map(fact => ({ nodeId: fact.producer.nodeId, payloadHash: hash(fact.record.payload) })) });
}

export function sessionReplanRequirements(root, profile, completion, scope) {
    const closed = new Set(completion.keys());
    for (const group of profile.fanouts) if (closed.has(group.join.nodeId) && !scope.affectedNodeIds.includes(group.join.nodeId))
        for (const branch of group.branchScopes) for (const id of branch.scopeNodeIds) closed.add(id);
    const remaining = profile.steps.filter(node => root.nodeControl[node.nodeId]?.disposition !== 'cancelled'
        && (!closed.has(node.nodeId) || scope.affectedNodeIds.includes(node.nodeId)));
    return { requests: remaining.filter(node => ['agent', 'planner', 'review', 'judge'].includes(node.kind)).length,
        attempts: remaining.length + 1 };
}

/** Same-call typed Model/Result/control reads reconstruct every iteration.
 * The returned current facts never authorize live consumption or dispatch. */
export async function readSessionReplanHistory(tx, handle, root, { graphResults, plannerCompletions, reviewCompletions, judgeCompletions, fanoutCompletions, narrator }) {
    const facts = [...graphResults, ...plannerCompletions, ...reviewCompletions, ...judgeCompletions, narrator];
    const entries = [], loopCounts = new Map(), seenProgress = new Map();
    for (const fact of facts) {
        const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc, input = intent.inputRef;
        const snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision), node = snapshot.graph.nodes.find(node => node.nodeId === fact.producer.nodeId);
        const sources = (input.acceptedGraphResultRefs ?? []).map(ref => graphResults.find(source => equal(source.receipt.resultRef, ref)));
        for (const ref of input.acceptedControlRefs ?? []) sources.push(facts.find(source => source.controlRef && equal(source.controlRef, ref)));
        if (input.reviewReceiptRef) sources.push(reviewCompletions.find(source => equal(source.receipt.reviewReceiptRef, input.reviewReceiptRef)));
        for (const ref of input.joinReceiptRefs ?? []) sources.push(fanoutCompletions.find(source => equal(ref, { runId: root.runId, joinId: source.joinReceipt.joinId })));
        if (sources.some(source => !source || source.receipt.decisionSeq >= fact.receipt.decisionSeq)) invalid();
        const inferred = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId).flatMap(edge => {
            const source = sources.find(source => source.producer.nodeId === edge.from.nodeId);
            return source ? [{ edgeId: edge.edgeId, producerAttemptId: source.producer.attemptId }] : [];
        });
        const bindings = input.controlGraph?.bindings ?? inferred;
        if (input.controlGraph) assertObject(input.controlGraph, ['bindings'], 'Session loop graph');
        if (!Array.isArray(bindings) || new Set(bindings.map(item => item.edgeId)).size !== bindings.length) invalid();
        for (const binding of bindings) assertObject(binding, ['edgeId', 'producerAttemptId'], 'Session loop binding');
        const loops = bindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
        let trigger = null;
        if (loops.length) {
            trigger = sources.find(source => source.producer.attemptId === loops[0].producerAttemptId);
            if (!trigger?.patch?.requests.replan || trigger.patch.requests.finalize || trigger.patch.newGraphRevision !== fact.producer.graphRevision) invalid();
            const scope = sessionReplanScope(snapshot.graph, trigger.producer.nodeId);
            if (scope.target.nodeId !== node.nodeId || loops.length !== scope.loops.length
                || loops.some(binding => binding.producerAttemptId !== trigger.producer.attemptId || !scope.loops.some(edge => edge.edgeId === binding.edgeId))) invalid();
            for (const binding of loops) loopCounts.set(binding.edgeId, (loopCounts.get(binding.edgeId) ?? 0) + 1);
        }
        if (!input.fanoutAttemptId && fact.producer.inputRefs[0]?.kind !== 'native_session_delegation' && !input.reviewFeedbackRef) {
            const direct = sources.filter(source => bindings.some(binding => binding.producerAttemptId === source.producer.attemptId));
            if (bindings.some(binding => !direct.some(source => source.producer.attemptId === binding.producerAttemptId
                && snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === source.producer.nodeId && edge.to.nodeId === node.nodeId)))
                || snapshot.graph.edges.some(edge => !edge.loopBack && edge.to.nodeId === node.nodeId && node.inputs.find(port => port.name === edge.to.port)?.required
                    && !bindings.some(binding => binding.edgeId === edge.edgeId))) invalid();
            if (bindings.length) {
                const ordered = [...bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
                const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: ordered, reservedAttemptId: null }).slice(0, 32);
                await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: fact.producer,
                    producerBindings: ordered, allowLoopBack: !!loops.length,
                    receipt: { decisionSeq: fact.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
            } else if (!snapshot.graph.entryNodeIds.includes(node.nodeId)) {
                const incoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId);
                if (!incoming.length || incoming.some(edge => node.inputs.find(port => port.name === edge.to.port)?.required
                    || snapshot.nodeControl[edge.from.nodeId]?.disposition !== 'cancelled')) invalid();
            }
        }
        entries.push({ fact, input, node, sources, trigger, snapshot });
    }
    const current = new Map(), previous = new Map(), replaced = new Map(), touched = new Set(), consumed = new Set(), replannedAttemptIds = new Set(), reviewInvalidated = new Set();
    for (const { fact, node, sources, trigger, snapshot } of entries.sort((a, b) => a.fact.receipt.decisionSeq - b.fact.receipt.decisionSeq)) {
        const prior = previous.get(node.nodeId);
        if (trigger) {
            if (!prior || current.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId || consumed.has(trigger.producer.attemptId)) invalid();
            const scope = trigger.producer.inputRefs[0]?.fanoutAttemptId
                ? await readSessionFanoutReplanScope(tx, handle, root, trigger.producer, { decisionSeq: fact.receipt.decisionSeq, targetNodeId: node.nodeId })
                : sessionReplanScope(snapshot.graph, trigger.producer.nodeId);
            if (!scope) invalid();
            if (fanoutCompletions.some(group => group.frame.decisionSeq < trigger.receipt.decisionSeq
                && [group.fanout.nodeId, group.producer.nodeId].some(id => scope.affectedNodeIds.includes(id)))) invalid();
            for (const id of scope.affectedNodeIds) {
                const old = current.get(id), kind = snapshot.graph.nodes.find(node => node.nodeId === id)?.kind;
                if (old) {
                    if (!['agent', 'planner', 'review', 'judge'].includes(kind) || snapshot.graph.nodes.find(node => node.nodeId === id).capabilities.includes('agent.delegate')) invalid();
                    replaced.set(id, { attemptId: old.producer.attemptId, trigger }); replannedAttemptIds.add(old.producer.attemptId);
                }
                touched.add(id); current.delete(id);
            }
            consumed.add(trigger.producer.attemptId);
        }
        for (const source of sources) if (touched.has(source.producer.nodeId) && source.producer.attemptId !== trigger?.producer.attemptId
            && current.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        if (prior) {
            const replacement = replaced.get(node.nodeId), invalidation = await readAttemptInvalidation(tx, handle, root, prior.producer);
            const loop = replacement?.attemptId === prior.producer.attemptId && fact.producer.attemptNumber === prior.producer.attemptNumber + 1
                && (trigger?.producer.attemptId === replacement.trigger.producer.attemptId || sources.some(source => touched.has(source.producer.nodeId)
                    && source.receipt.decisionSeq > replacement.trigger.receipt.decisionSeq));
            const reviewedPlanner = node.kind === 'planner' && invalidation && reviewInvalidated.has(prior.producer.attemptId)
                && fact.producer.attemptNumber === prior.producer.attemptNumber + 1;
            if (node.kind === 'planner' ? !loop && !reviewedPlanner : ['agent', 'judge'].includes(node.kind) ? !loop && !invalidation
                : node.kind === 'review' && !loop && prior.review.decision !== 'rerun' && !invalidation) invalid();
            replaced.delete(node.nodeId);
        }
        if (fact.patch) {
            const key = sessionPlannerProgressFingerprint(fact.patch.appliedOperations, root.sourceBinding, sources.filter(source => source.record));
            const keys = seenProgress.get(node.nodeId) ?? new Set();
            if (keys.has(key)) invalid(); keys.add(key); seenProgress.set(node.nodeId, keys);
        }
        if (fact.review?.decision === 'rerun') for (const [id, old] of current) if (fact.review.invalidatedAttemptIds.includes(old.producer.attemptId)) {
            reviewInvalidated.add(old.producer.attemptId); touched.add(id); current.delete(id);
        }
        previous.set(node.nodeId, fact); current.set(node.nodeId, fact);
    }
    if (replaced.size || consumed.size !== root.progress.replans || root.progress.replans !== plannerCompletions.filter(fact => fact.patch.requests.replan).length
        || [...current.values()].some(fact => fact.patch?.requests.replan)
        || root.progress.loopIterations !== [...loopCounts.values()].reduce((sum, count) => sum + count, 0)
        || root.graph.edges.filter(edge => edge.loopBack).some(edge => (root.progress.edgeVisitCounts[edge.edgeId] ?? 0) !== (loopCounts.get(edge.edgeId) ?? 0))) invalid();
    return { current, replannedAttemptIds };
}
