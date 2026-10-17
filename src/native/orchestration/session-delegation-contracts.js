import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { audienceContextPin, assertAudienceRunCapture } from './audience-source-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readHandoffReturn, handoffReturnReceiptId } from './handoff-return-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readRunControl } from '../run-control.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { sessionOutputReceiptId } from './session-output-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
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

/** Original published pure child DAG, not an alternative execution profile. */
export async function readSessionDelegatedPlan(tx, handle, child) {
    const plan = await readPlanRevision(tx, handle, child.planRef), graph = plan.definition;
    if (child.sourceBinding.sourceAuthority !== 'native_session' || !child.parentRef || child.graphRevision !== 0
        || !equal(child.graph, graph) || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
        || graph.outputContract.resultPolicy.outputType !== 'text' || graph.graphChangePolicy.allowedOperations.length
        || graph.edges.some(edge => edge.loopBack || !['always', 'success'].includes(edge.condition))
        || graph.nodes.some(node => node.kind !== 'agent' && node.kind !== 'output')
        || graph.nodes.filter(node => node.kind === 'output').length !== 1) invalid();
    const output = graph.nodes.find(node => node.nodeId === graph.outputContract.ownerNodeId);
    const models = graph.nodes.filter(node => node.kind === 'agent');
    if (output?.kind !== 'output' || !models.length || output.capabilities.length || output.outputs.length
        || models.some(node => !node.capabilities.includes('generation.send') || node.capabilities.some(capability => capability !== 'generation.send')
            || node.outputs.length !== 1 || node.outputs[0].type !== 'text' || node.policy.audiencePinId === undefined)) invalid();
    const terminalEdges = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    if (terminalEdges.length !== 1 || !models.some(node => node.nodeId === terminalEdges[0].from.nodeId)) invalid();
    // Every published child task must participate in the returned result.
    const needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) {
            needed.add(edge.from.nodeId); changed = true;
        }
    }
    if (needed.size !== graph.nodes.length) invalid();
    return { plan, graph, models, output, terminalNodeId: terminalEdges[0].from.nodeId };
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
    const delegated = await readSessionDelegatedPlan(tx, handle, child);
    const entryPin = delegated.plan.dependencyPins.find(pin => pin.pinId === input.delegationScope.childPinId);
    if (entryPin?.port !== 'context' || !delegated.graph.entryNodeIds.some(id => delegated.graph.nodes.find(node => node.nodeId === id)?.policy.audiencePinId === entryPin.pinId)) invalid();
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
export async function readSessionDelegatedModelInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
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
    const incoming = lineage.graph.edges.filter(edge => edge.to.nodeId === producer.nodeId).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const sources = [];
    for (const ref of input.acceptedGraphResultRefs) {
        const fact = await readGraphNodeResult(tx, handle, child, ref.resultId);
        if (!fact || ref.runId !== child.runId) invalid(); sources.push(fact);
    }
    const ordered = incoming.map(edge => sources.find(fact => fact.producer.nodeId === edge.from.nodeId));
    if (ordered.some(fact => !fact)) invalid();
    const refs = [...new Map(ordered.map(fact => [hash(fact.receipt.resultRef), fact.receipt.resultRef])).values()];
    const bindings = incoming.map((edge, index) => ({ edgeId: edge.edgeId, producerAttemptId: ordered[index].producer.attemptId }));
    if (!equal(input.acceptedGraphResultRefs, refs) || !equal(input.graphBindings, bindings)
        || !equal(producer.inputRefs, [input, ...child.parentRef.inputRefs, ...refs]) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    if (!incoming.length) {
        if (!lineage.graph.entryNodeIds.includes(producer.nodeId)) invalid();
    } else {
        const identity = hash({ runId: child.runId, bindings, reservedAttemptId: null });
        await assertOutputTransition(tx, handle, child, { published: ordered[0], additionalProducers: ordered.slice(1), output: producer,
            receipt: { decisionSeq: publicationSeq, traversalReceiptRef: { runId: child.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } }, producerBindings: bindings });
    }
    return { lineage, input, sourceRefs, sources: ordered, bindings };
}

/** Validate all actual tasks and their original Transition and bank facts.
 * pendingProducer is used only before the final Model Result is published;
 * the ModelPort must already have proved its exact physical completion. */
export async function readSessionDelegatedGraphHistory(tx, handle, child, { finalPublication = null, pendingProducer = null, closure = null, output = null } = {}) {
    const shape = await readSessionDelegatedPlan(tx, handle, child), { graph, models, plan } = shape;
    if (Boolean(finalPublication) === Boolean(pendingProducer)) invalid();
    const finalProducer = pendingProducer ?? finalPublication.producer ?? (await readAttempt(tx, handle, child, finalPublication.receipt.producerAttemptId)).doc;
    if (finalProducer.nodeId !== shape.terminalNodeId) invalid();
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
    if (!parent) invalid();
    const lineage = await readSessionDelegation(tx, handle, parent, child.runId);
    if (!lineage) invalid();
    const results = [];
    for (const ref of child.resultRefs) {
        if (finalPublication && equal(ref, finalPublication.receipt.resultRef)) continue;
        const fact = await readGraphNodeResult(tx, handle, child, ref.resultId);
        if (!fact) invalid(); results.push(fact);
    }
    const facts = [...results, ...(finalPublication ? [{ ...finalPublication, producer: finalProducer,
        settlement: finalPublication.attemptReceipt }] : [])];
    const attempts = [];
    for (const id of child.attemptRefs) attempts.push((await readAttempt(tx, handle, child, id)).doc);
    const modelAttempts = attempts.filter(attempt => attempt.nodeId !== shape.output.nodeId);
    if (modelAttempts.length !== models.length || new Set(modelAttempts.map(attempt => attempt.nodeId)).size !== models.length
        || modelAttempts.some(attempt => !models.some(node => node.nodeId === attempt.nodeId))
        || attempts.some(attempt => attempt.nodeId === shape.output.nodeId && (!output || attempt.attemptId !== output.attemptId))
        || attempts.filter(attempt => attempt.nodeId === shape.output.nodeId).length !== (output ? 1 : 0)
        || facts.length !== models.length - (pendingProducer ? 1 : 0)) invalid();
    const control = await readRunControl(tx, handle, child.budgetAuthorityRef.sessionId);
    const bank = control?.operations[child.budgetAuthorityRef.operationId]?.compute;
    if (!bank) invalid();
    const effects = [], expectedRefs = [], usedEdges = new Map();
    let settled = true;
    for (const producer of modelAttempts) {
        const fact = facts.find(fact => fact.producer.attemptId === producer.attemptId);
        if (!fact && producer.attemptId !== pendingProducer?.attemptId || producer.effectRefs.length !== 1
            || producer.status !== (producer.attemptId === pendingProducer?.attemptId ? 'running' : 'completed')
            || producer.graphRevision !== 0 || producer.epoch > child.epoch || producer.sourceBindingDigest !== child.sourceBinding.bindingDigest
            || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, child.budgetAuthorityRef)) invalid();
        const effect = (await readEffect(tx, handle, child, producer.effectRefs[0])).doc;
        const sourceRefs = sessionDelegationResultSources(child, producer, plan);
        if (fact && !equal(fact.record.envelope.sourceRefs.slice(2), sourceRefs)) invalid();
        if (producer.attemptId === finalProducer.attemptId) {
            await readSessionDelegatedModelInput(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1);
        }
        for (const edge of graph.edges.filter(edge => edge.to.nodeId === producer.nodeId)) usedEdges.set(edge.edgeId, 1);
        const rows = bank.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
        const local = (bank.localWork ?? []).filter(row => row.orchestration?.effectId === effect.effectId);
        if (rows.length !== 1 || rows[0].reservationId !== child.runId || rows[0].orchestration.kind !== 'provider_send'
            || rows[0].orchestration.ordinal !== 0 || !['settled', 'unknown', 'charged'].includes(rows[0].status)
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalid();
        if (rows.some(row => row.status !== 'settled')) settled = false;
        effects.push(effect); expectedRefs.push(...rows.map(row => row.attemptId), ...local.map(row => row.attemptId));
    }
    if (new Set(effects.map(effect => effect.effectId)).size !== effects.length
        || bank.attempts.some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))) invalid();
    if (output) {
        const edge = graph.edges.find(edge => edge.to.nodeId === output.nodeId);
        usedEdges.set(edge.edgeId, 1);
    }
    const expectedVisits = Object.fromEntries(usedEdges);
    if (child.progress.loopIterations !== 0 || child.progress.edgeVisits !== usedEdges.size || !equal(child.progress.edgeVisitCounts, expectedVisits)) invalid();
    const history = { ...shape, lineage, results, finalProducer, effects, rootDigest: hash(child),
        budgetAttemptIds: expectedRefs, settled };
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
