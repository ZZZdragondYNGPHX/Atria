import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttempt, controlRecordKey, readAttemptInvalidation } from './controller-common.js';
import { taskLocalReceiptId } from './task-local-output-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { rpControlReplanScope } from './rp-control-graph.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { rpDelegatedControlProfile } from './rp-delegated-control-profile.js';
import { readRpDelegatedControl, readRpDelegatedInputFacts } from './rp-delegated-quality-contracts.js';
import { graphReviewControlRef } from './graph-review-completion.js';
import { graphJudgeControlRef } from './graph-judge-completion.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP delegated control facts'); };
export const isRpDelegatedControlGraph = root => root.sourceBinding.sourceAuthority === 'rp_chat' && !!root.parentRef
    && (root.graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind))
        || root.graph.nodes.filter(node => node.kind === 'agent').length >= 2);
export const rpDelegatedPlannerReaderOptions = { verifyControlWork: assertRpControlWork };

/** Public reads always start a new full fact boundary. No caller can supply
 * an input proof or a previously checked Model/Result/Review snapshot. */
export function readRpDelegatedControlInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    return readRpDelegatedInputFacts(tx, handle, child, producer, intent, publicationSeq);
}

/** Full durable child history. No source lookup is cached or turned into a
 * live read grant; the actual consumer separately revalidates its capture. */
export async function readRpDelegatedGraphHistory(tx, handle, child, { pendingProducer = null, finalPublication = null, closure = null, output = null } = {}) {
    if (!isRpDelegatedControlGraph(child) || Boolean(pendingProducer) === Boolean(finalPublication)) invalid();
    const plan = await readPlanRevision(tx, handle, child.planRef), snapshot = await readTaskGraphRevision(tx, handle, child);
    const initial = rpDelegatedControlProfile(plan), profile = rpDelegatedControlProfile({ ...plan, definition: snapshot.graph });
    if (!initial || profile?.terminalNodeId !== initial.terminalNodeId || !equal(profile.output, initial.output)
        || !equal(snapshot.graph.edges.filter(edge => edge.loopBack), plan.definition.edges.filter(edge => edge.loopBack))) invalid();
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
    if (!parent || !profile) invalid();
    const durable = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.runId }))?.doc;
    if (!durable) invalid();
    if (!equal(durable, child)) {
        // The original RunRepository proves the exact prospective TaskLocal
        // output before saving its Root. All lineage still uses the real row.
        const receipt = (await checkedRecord(tx, controlRecordKey(handle, child.runId, 'receipt', taskLocalReceiptId(child.runId))))?.doc;
        if (!receipt || receipt.receiptKind !== 'task_local_output' || durable.status !== 'running' || durable.outputClaims.length
            || durable.cancelRequested || receipt.runId !== durable.runId || receipt.epoch !== durable.epoch
            || receipt.graphRevision !== durable.graphRevision || receipt.decisionSeq !== durable.eventSeq + 1) invalid();
        const pending = { ...durable, status: 'completed', outputClaims: [receipt.claimRef],
            progress: { ...durable.progress, steps: durable.progress.steps + 1 },
            treeProgress: { ...durable.treeProgress, steps: durable.treeProgress.steps + 1 },
            stateVersion: durable.stateVersion + 1, eventSeq: durable.eventSeq + 1, updatedAt: receipt.createdAt };
        if (!equal(pending, child)) invalid();
    }
    const delegated = await readDelegationCompletion(tx, handle, parent, durable);
    if (!delegated) invalid();
    const finalProducer = pendingProducer ?? finalPublication.producer
        ?? (await readAttempt(tx, handle, child, finalPublication.receipt.producerAttemptId)).doc;
    if (finalProducer.nodeId !== profile.terminalNodeId) invalid();
    const bankControl = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: child.budgetAuthorityRef.controlId }))?.doc;
    const bank = bankControl?.operations[child.budgetAuthorityRef.operationId]?.compute;
    if (!bank) invalid();
    const effects = [], budgetAttemptIds = [], planners = [], reviews = [], judges = [], results = [], entries = [], counts = {}, latest = new Map(), previous = new Map(), replaced = new Map(), consumed = new Set(); let settled = true, loopIterations = 0;
    const attempts = [];
    for (const id of child.attemptRefs) attempts.push((await readAttempt(tx, handle, child, id)).doc);
    for (const producer of attempts.filter(attempt => attempt.nodeId !== profile.output.nodeId)) {
        const node = child.graph.nodes.find(node => node.nodeId === producer.nodeId);
        if (!profile.models.some(item => item.nodeId === node?.nodeId) || producer.effectRefs.length !== 1
            || producer.status !== (producer.attemptId === pendingProducer?.attemptId ? 'running' : 'completed')
            || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, child.budgetAuthorityRef)) invalid();
        const effect = (await readEffect(tx, handle, child, producer.effectRefs[0])).doc;
        const model = await readModelCompletionReceipt(handle, tx, child, effect);
        if (!model || effect.sourceBindingDigest !== child.sourceBinding.bindingDigest) invalid();
        const fact = node.kind === 'planner' ? await readGraphPlannerCompletion(tx, handle, child, producer.attemptId, rpDelegatedPlannerReaderOptions)
            : node.kind === 'review' ? await readRpDelegatedControl(tx, handle, child, graphReviewControlRef(child.runId, producer.attemptId))
                : node.kind === 'judge' ? await readRpDelegatedControl(tx, handle, child, graphJudgeControlRef(child.runId, producer.attemptId))
                    : producer.attemptId === finalProducer.attemptId ? finalPublication ? { ...finalPublication, producer, settlement: finalPublication.attemptReceipt } : null
                        : producer.resultRefs.length === 1 ? await readGraphNodeResult(tx, handle, child, producer.resultRefs[0].resultId) : null;
        if (node.kind !== 'agent' && !fact || node.kind === 'agent' && producer.attemptId !== finalProducer.attemptId && !fact) invalid();
        if (node.kind === 'agent' && fact && producer.attemptId !== finalProducer.attemptId) results.push(fact);
        const proof = await readRpDelegatedControlInput(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1);
        entries.push({ producer, fact, proof });
        for (const binding of proof.bindings) {
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
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalid();
        if (rows[0].status !== 'settled') settled = false;
        effects.push(effect); budgetAttemptIds.push(...rows.map(row => row.attemptId), ...local.map(row => row.attemptId));
    }
    for (const { producer, fact, proof } of entries.sort((a, b) => (a.fact?.receipt.decisionSeq ?? child.eventSeq + 1) - (b.fact?.receipt.decisionSeq ?? child.eventSeq + 1))) {
        let trigger = null;
        if (proof.loops.length) {
            trigger = proof.sources.find(source => source.producer.attemptId === proof.loops[0].producerAttemptId);
            if (!trigger || consumed.has(trigger.producer.attemptId) || latest.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId) invalid();
            const scope = rpControlReplanScope(child.graph, trigger.producer.nodeId);
            if (scope.target.nodeId !== producer.nodeId || !previous.has(producer.nodeId) || proof.loops.length !== scope.loops.length
                || proof.loops.some(binding => binding.producerAttemptId !== trigger.producer.attemptId || !scope.loops.some(edge => edge.edgeId === binding.edgeId))) invalid();
            for (const id of scope.affectedNodeIds) {
                const old = latest.get(id); if (old) replaced.set(id, { attemptId: old.producer.attemptId, trigger });
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
            const causalReview = invalidation && reviews.find(control => control.review.receiptId === invalidation.reviewReceiptId
                && control.review.invalidatedAttemptIds.includes(prior.producer.attemptId)
                && control.receipt.decisionSeq < (fact?.receipt.decisionSeq ?? child.eventSeq + 1));
            const quality = proof.replacement?.target.attemptId === prior.producer.attemptId || causalReview
                && proof.sources.some(source => source.receipt.decisionSeq > causalReview.receipt.decisionSeq)
                || prior.fact?.review?.decision === 'rerun' && child.graph.nodes.find(node => node.nodeId === producer.nodeId)?.kind === 'review'
                    && proof.sources.some(source => source.receipt.decisionSeq > prior.fact.receipt.decisionSeq);
            if (producer.attemptNumber !== prior.producer.attemptNumber + 1 || !loop && !quality) invalid();
            replaced.delete(producer.nodeId);
        }
        if (fact?.review?.decision === 'rerun') for (const [id, old] of latest)
            if (fact.review.invalidatedAttemptIds.includes(old.producer.attemptId)) latest.delete(id);
        latest.set(producer.nodeId, { producer, fact }); previous.set(producer.nodeId, { producer, fact });
    }
    const orderedRefs = [...results, ...finalPublication ? [finalPublication] : []].sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq).map(fact => fact.receipt.resultRef);
    if (!equal(child.resultRefs, orderedRefs) || replaced.size || consumed.size !== child.progress.replans
        || [...latest.values()].some(item => item.fact?.patch?.requests.replan)) invalid();
    if (profile.models.some(node => !latest.has(node.nodeId)) || effects.length !== new Set(effects.map(effect => effect.effectId)).size
        || reviews.length !== child.progress.reviews || planners.length !== child.graphRevision || child.progress.replans !== planners.filter(fact => fact.patch.requests.replan).length
        || bank.attempts.some(row => row.reservationId === child.runId && !budgetAttemptIds.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !budgetAttemptIds.includes(row.attemptId))) invalid();
    const outputs = attempts.filter(attempt => attempt.nodeId === profile.output.nodeId);
    if (outputs.length !== Number(!!output) || output && outputs[0].attemptId !== output.attemptId) invalid();
    if (output) counts[child.graph.edges.find(edge => edge.to.nodeId === output.nodeId).edgeId] = 1;
    if (child.progress.loopIterations !== loopIterations || child.progress.edgeVisits !== Object.values(counts).reduce((a, b) => a + b, 0)
        || !equal(child.progress.edgeVisitCounts, counts)) invalid();
    const history = { plan, profile, graph: snapshot.graph, models: profile.models, output: profile.output, terminalNodeId: profile.terminalNodeId,
        lineage: { ...delegated, parent, child }, finalProducer, effects, planners, reviews, judges, results, rootDigest: hash(child), budgetAttemptIds, settled, loopIterations };
    if (closure) assertRpDelegatedClosure(child, history, closure);
    return history;
}

export function assertRpDelegatedClosure(child, history, closure) {
    if (history.rootDigest !== hash(child) || !history.settled
        || !equal(closure.reservationRefs, [{ reservationId: child.runId, parentReservationId: child.parentRef.depth === 1 ? null : history.lineage.parent.runId, status: 'released' }])
        || closure.budgetAttemptRefs.length !== history.budgetAttemptIds.length
        || new Set(closure.budgetAttemptRefs.map(ref => ref.attemptId)).size !== history.budgetAttemptIds.length
        || closure.budgetAttemptRefs.some(ref => !history.budgetAttemptIds.includes(ref.attemptId)
            || ref.reservationId !== child.runId || !equal(ref.authorityRef, child.budgetAuthorityRef))) invalid();
}
