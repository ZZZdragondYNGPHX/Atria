import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttempt, controlRecordKey } from './controller-common.js';
import { taskLocalReceiptId } from './task-local-output-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { rpDelegatedControlProfile } from './rp-delegated-control-profile.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP delegated control facts'); };
export const isRpDelegatedControlGraph = root => root.sourceBinding.sourceAuthority === 'rp_chat' && !!root.parentRef
    && root.graph.nodes.some(node => node.kind === 'planner');
export const rpDelegatedPlannerReaderOptions = { verifyControlWork: assertRpControlWork };

/** Exact stage inputs, original dependency receipts and original child grant. */
export async function readRpDelegatedControlInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    const input = intent.inputRef, bundle = input.controlGraph;
    if (!isRpDelegatedControlGraph(child) || input.kind !== 'native_rp_delegated_intent' || input.role !== 'narrator'
        || input.nodeId !== producer.nodeId || input.parentRunId !== child.parentRef.parentRunId || input.childRunId !== child.runId
        || input.parentAttemptId !== child.parentRef.nodeAttemptId || !equal(input.planRef, child.planRef)
        || !equal(input.sourceRef, child.sourceBinding.sourceRef) || !equal(input.audience, { kind: 'task', id: child.runId })
        || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.nodeAttemptId !== producer.attemptId || intent.graphRevision !== producer.graphRevision || intent.epoch !== producer.epoch
        || !bundle || !equal(bundle.evidenceRefs, []) || !Array.isArray(bundle.controlRefs) || !Array.isArray(bundle.bindings)
        || !equal(input.acceptedControlRefs, bundle.controlRefs) || !equal(producer.inputRefs, [input, ...child.parentRef.inputRefs, ...bundle.controlRefs])
        || producer.inputDigest !== hash(producer.inputRefs) || intent.inputHash !== hash(input)) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, child, producer.graphRevision);
    const sources = [];
    for (const ref of bundle.controlRefs) {
        if (ref.kind !== 'graph_planner_control' || ref.runId !== child.runId) invalid();
        const fact = await readGraphPlannerCompletion(tx, handle, child, ref.attemptId, rpDelegatedPlannerReaderOptions);
        if (!fact || !equal(fact.controlRef, ref)) invalid(); sources.push(fact);
    }
    if (new Set(sources.map(fact => fact.producer.attemptId)).size !== sources.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    const incoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === producer.nodeId);
    const loops = bundle.bindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
    if (incoming.some(edge => !bundle.bindings.some(binding => binding.edgeId === edge.edgeId))
        || bundle.bindings.some(binding => !snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.nodeId === producer.nodeId
            && sources.some(source => source.producer.attemptId === binding.producerAttemptId && source.producer.nodeId === edge.from.nodeId)))
        || sources.some(source => !bundle.bindings.some(binding => binding.producerAttemptId === source.producer.attemptId))) invalid();
    for (const binding of loops) {
        const source = sources.find(source => source.producer.attemptId === binding.producerAttemptId);
        if (!source.patch.requests.replan || source.patch.requests.finalize || source.patch.newGraphRevision !== producer.graphRevision) invalid();
    }
    if (!bundle.bindings.length) {
        if (!snapshot.graph.entryNodeIds.includes(producer.nodeId) || sources.length) invalid();
    } else {
        const bindings = bundle.bindings.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        const receiptId = 'oreceipt_' + hash({ runId: child.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, child, { published: sources[0], additionalProducers: sources.slice(1), output: producer,
            producerBindings: bindings, allowLoopBack: loops.length > 0,
            receipt: { decisionSeq: publicationSeq, traversalReceiptRef: { runId: child.runId, receiptId } } });
    }
    return { input, sources, bindings: bundle.bindings, loops };
}

/** Full durable child history. No source lookup is cached or turned into a
 * live read grant; the actual consumer separately revalidates its capture. */
export async function readRpDelegatedGraphHistory(tx, handle, child, { pendingProducer = null, finalPublication = null, closure = null, output = null } = {}) {
    if (!isRpDelegatedControlGraph(child) || Boolean(pendingProducer) === Boolean(finalPublication)) invalid();
    const plan = await readPlanRevision(tx, handle, child.planRef), snapshot = await readTaskGraphRevision(tx, handle, child);
    const profile = rpDelegatedControlProfile({ ...plan, definition: snapshot.graph });
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
    const effects = [], budgetAttemptIds = [], planners = [], entries = [], counts = {}, latest = new Map(); let settled = true, loopIterations = 0;
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
            : finalPublication ? { ...finalPublication, producer, settlement: finalPublication.attemptReceipt } : null;
        if (node.kind === 'planner' && !fact || node.kind === 'agent' && producer.attemptId !== finalProducer.attemptId) invalid();
        const proof = await readRpDelegatedControlInput(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1);
        entries.push({ producer, fact, proof });
        for (const binding of proof.bindings) {
            counts[binding.edgeId] = (counts[binding.edgeId] ?? 0) + 1;
            if (child.graph.edges.find(edge => edge.edgeId === binding.edgeId).loopBack) loopIterations++;
        }
        if (node.kind === 'planner') planners.push(fact);
        const rows = bank.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
        const local = (bank.localWork ?? []).filter(row => row.orchestration?.effectId === effect.effectId);
        if (rows.length !== 1 || rows[0].reservationId !== child.runId || rows[0].orchestration.kind !== 'provider_send'
            || rows[0].orchestration.ordinal !== 0 || !['settled', 'unknown', 'charged'].includes(rows[0].status)
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalid();
        if (rows[0].status !== 'settled') settled = false;
        effects.push(effect); budgetAttemptIds.push(...rows.map(row => row.attemptId), ...local.map(row => row.attemptId));
    }
    for (const { producer, fact, proof } of entries) {
        for (const source of proof.sources) if (latest.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        if (latest.has(producer.nodeId) && !proof.loops.length) invalid();
        latest.set(producer.nodeId, { producer, fact });
    }
    if (profile.models.some(node => !latest.has(node.nodeId)) || effects.length !== new Set(effects.map(effect => effect.effectId)).size
        || planners.length !== child.graphRevision || child.progress.replans !== planners.filter(fact => fact.patch.requests.replan).length
        || bank.attempts.some(row => row.reservationId === child.runId && !budgetAttemptIds.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !budgetAttemptIds.includes(row.attemptId))) invalid();
    const outputs = attempts.filter(attempt => attempt.nodeId === profile.output.nodeId);
    if (outputs.length !== Number(!!output) || output && outputs[0].attemptId !== output.attemptId) invalid();
    if (output) counts[child.graph.edges.find(edge => edge.to.nodeId === output.nodeId).edgeId] = 1;
    if (child.progress.loopIterations !== loopIterations || child.progress.edgeVisits !== Object.values(counts).reduce((a, b) => a + b, 0)
        || !equal(child.progress.edgeVisitCounts, counts)) invalid();
    const history = { plan, profile, graph: snapshot.graph, models: profile.models, output: profile.output, terminalNodeId: profile.terminalNodeId,
        lineage: { ...delegated, parent, child }, finalProducer, effects, planners, rootDigest: hash(child), budgetAttemptIds, settled, loopIterations };
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
