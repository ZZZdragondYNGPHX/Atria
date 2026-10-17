import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, assertAttemptConsumable } from './controller-common.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readHandoffReturn, handoffReturnReceiptId } from './handoff-return-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { readProjectControlInputs } from './project-control-input-contracts.js';
import { projectReviewId } from './project-review-output-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Project delegation facts'); };

async function durableParent(tx, handle, supplied) {
    const actual = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: supplied.runId }))?.doc;
    if (!actual) invalid();
    if (equal(actual, supplied)) return actual;
    // The original Review writer validates its exact prospective output step
    // before RunRepository saves it. No other staged or reconstructed Root fits.
    const output = (await checkedRecord(tx, controlRecordKey(handle, actual.runId, 'receipt', projectReviewId('output', actual.runId))))?.doc;
    if (!output || output.receiptKind !== 'project_review_output' || actual.status !== 'running' || actual.outputClaims.length
        || actual.cancelRequested || output.runId !== actual.runId || output.epoch !== actual.epoch
        || output.graphRevision !== actual.graphRevision || output.decisionSeq !== actual.eventSeq + 1) invalid();
    const pending = { ...actual, status: 'completed', outputClaims: [output.claimRef],
        progress: { ...actual.progress, steps: actual.progress.steps + 1 },
        treeProgress: { ...actual.treeProgress, steps: actual.treeProgress.steps + 1 },
        stateVersion: actual.stateVersion + 1, eventSeq: actual.eventSeq + 1, updatedAt: output.createdAt };
    if (!equal(pending, supplied)) invalid();
    return actual;
}

/** The original published advisory child DAG, with no Task or tool writer. */
export async function readProjectDelegatedPlan(tx, handle, child) {
    const plan = await readPlanRevision(tx, handle, child.planRef), graph = plan.definition;
    const models = graph.nodes.filter(node => node.kind === 'agent');
    const outputs = graph.nodes.filter(node => node.kind === 'output'), [output] = outputs;
    if (child.sourceBinding.sourceAuthority !== 'project' || !child.parentRef || child.graphRevision !== 0
        || !equal(child.graph, graph) || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
        || graph.outputContract.resultPolicy.outputType !== 'text' || !equal(graph.capabilityCeiling, ['generation.send'])
        || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length
        || !models.length || outputs.length !== 1 || graph.nodes.length !== models.length + 1
        || output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length
        || output.inputs.length !== 1 || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length) invalid();
    for (const node of models) {
        const pins = nodeModelRoutePins(node, plan.dependencyPins);
        if (pins.length !== 1 || node.dependencyPinIds.length !== 1 || !equal(node.capabilities, ['generation.send'])
            || node.outputs.length !== 1 || node.outputs[0].type !== 'text'
            || node.inputs.some(port => port.type !== 'text' || !port.required) || node.policy.allowedPlanPinIds?.length) invalid();
        const incoming = graph.edges.filter(edge => edge.to.nodeId === node.nodeId);
        if (incoming.length !== node.inputs.length || new Set(incoming.map(edge => edge.from.nodeId)).size !== incoming.length
            || node.inputs.some(port => incoming.filter(edge => edge.to.port === port.name).length !== 1)) invalid();
    }
    if (plan.dependencyPins.some(pin => !models.some(node => node.dependencyPinIds.includes(pin.pinId)))) invalid();
    for (const edge of graph.edges) {
        const from = models.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        if (!from || !to || edge.loopBack || edge.maxVisits !== 1 || !['always', 'success'].includes(edge.condition)
            || edge.from.port !== from.outputs[0].name || !to.inputs.some(port => port.name === edge.to.port && port.type === 'text')) invalid();
    }
    const entries = models.filter(node => !graph.edges.some(edge => edge.to.nodeId === node.nodeId)).map(node => node.nodeId).sort();
    if (!equal([...graph.entryNodeIds].sort(), entries)) invalid();
    const needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) {
            needed.add(edge.from.nodeId); changed = true;
        }
    }
    const terminalEdges = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    if (needed.size !== graph.nodes.length || terminalEdges.length !== 1) invalid();
    return { plan, graph, models, output, terminalNodeId: terminalEdges[0].from.nodeId };
}

/** Durable linkage only. Original Source, bank and captures grant live access. */
export async function readProjectDelegation(tx, handle, parent, childRunId) {
    if (parent.sourceBinding.sourceAuthority !== 'project') invalid();
    parent = await durableParent(tx, handle, parent);
    const child = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: childRunId }))?.doc;
    if (!child || child.sourceBinding.sourceAuthority !== 'project') invalid();
    const facts = await readDelegationCompletion(tx, handle, parent, child);
    if (!facts) return null;
    const input = facts.parentAttempt.inputRefs[0];
    if (input?.kind !== 'native_project_delegation' || input.role !== 'studio' || !equal(input.sourceRef, parent.sourceBinding.sourceRef)
        || !equal(input.planRef, parent.planRef) || !equal(input.childPlanRef, child.planRef)
        || input.nodeId !== facts.parentAttempt.nodeId || !equal(child.sourceBinding, parent.sourceBinding)
        || !equal(facts.parentAttempt.inputRefs, [input, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, parent, facts.parentAttempt.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === facts.parentAttempt.nodeId);
    await readProjectDelegationInputs(tx, handle, parent, facts.parentAttempt);
    const delegated = await readProjectDelegatedPlan(tx, handle, child);
    return { ...facts, parent, child, parentInput: input, parentNode: node, ...delegated };
}

/** One exact causal Model step, including the original child Transition. */
export async function readProjectDelegatedModelInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef?.parentRunId }))?.doc;
    if (!parent) invalid();
    const lineage = await readProjectDelegation(tx, handle, parent, child.runId), input = intent.inputRef;
    if (!lineage || input?.kind !== 'native_project_delegated_intent' || !equal(input, producer.inputRefs[0])
        || input.parentRunId !== parent.runId || input.parentAttemptId !== lineage.parentAttempt.attemptId
        || input.parentEpoch !== child.parentRef.parentEpoch || input.childRunId !== child.runId || input.childEpoch !== producer.epoch
        || input.delegationInputDigest !== child.parentRef.inputDigest || input.role !== 'studio'
        || !equal(input.sourceRef, child.sourceBinding.sourceRef) || !equal(input.planRef, child.planRef) || input.nodeId !== producer.nodeId
        || intent.nodeAttemptId !== producer.attemptId || intent.epoch !== producer.epoch || intent.graphRevision !== producer.graphRevision
        || intent.inputHash !== hash(input) || intent.sourceBindingDigest !== child.sourceBinding.bindingDigest
        || intent.grantDigest !== producer.effectiveGrantDigest || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest) invalid();
    const incoming = lineage.graph.edges.filter(edge => edge.to.nodeId === producer.nodeId).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const sources = [];
    for (const ref of input.acceptedGraphResultRefs) {
        const fact = await readGraphNodeResult(tx, handle, child, ref.resultId);
        if (!fact || ref.runId !== child.runId || fact.receipt.decisionSeq >= publicationSeq) invalid(); sources.push(fact);
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
    return { lineage, input, sources: ordered, bindings };
}

/** Complete original Model/Result/Transition/Task-bank history, not a grant. */
export async function readProjectDelegatedGraphHistory(tx, handle, child, { finalPublication = null, pendingProducer = null, closure = null, output = null } = {}) {
    const shape = await readProjectDelegatedPlan(tx, handle, child), { graph, models } = shape;
    if (Boolean(finalPublication) === Boolean(pendingProducer)) invalid();
    const finalProducer = pendingProducer ?? finalPublication.producer ?? (await readAttempt(tx, handle, child, finalPublication.receipt.producerAttemptId)).doc;
    if (finalProducer.nodeId !== shape.terminalNodeId) invalid();
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
    if (!parent) invalid();
    const lineage = await readProjectDelegation(tx, handle, parent, child.runId);
    if (!lineage) invalid();
    const results = [];
    for (const ref of child.resultRefs) {
        if (finalPublication && equal(ref, finalPublication.receipt.resultRef)) continue;
        const fact = await readGraphNodeResult(tx, handle, child, ref.resultId);
        if (!fact) invalid(); results.push(fact);
    }
    const facts = [...results, ...(finalPublication ? [{ ...finalPublication, producer: finalProducer, settlement: finalPublication.attemptReceipt }] : [])];
    const attempts = [];
    for (const id of child.attemptRefs) attempts.push((await readAttempt(tx, handle, child, id)).doc);
    const modelAttempts = attempts.filter(attempt => attempt.nodeId !== shape.output.nodeId);
    if (modelAttempts.length !== models.length || new Set(modelAttempts.map(attempt => attempt.nodeId)).size !== models.length
        || modelAttempts.some(attempt => !models.some(node => node.nodeId === attempt.nodeId))
        || attempts.some(attempt => attempt.nodeId === shape.output.nodeId && (!output || attempt.attemptId !== output.attemptId))
        || attempts.filter(attempt => attempt.nodeId === shape.output.nodeId).length !== (output ? 1 : 0)
        || facts.length !== models.length - (pendingProducer ? 1 : 0)) invalid();
    const source = child.sourceBinding.sourceRef, authority = child.budgetAuthorityRef;
    const task = await readOriginalProjectTask(tx, handle, source), bank = task?.compute;
    if (!bank || task.baseRevision !== source.revision || authority.authority !== 'project_task'
        || authority.projectId !== source.projectId || authority.taskId !== source.taskId
        || authority.operationId !== hash({ projectId: source.projectId, taskId: source.taskId, revision: source.revision, executionFingerprint: source.executionFingerprint })
        || !equal(authority, child.sourceBinding.budgetAuthorityRef)) invalid();
    const effects = [], expectedRefs = [], usedEdges = new Map();
    let settled = true;
    for (const producer of modelAttempts) {
        const fact = facts.find(fact => fact.producer.attemptId === producer.attemptId);
        if (!fact && producer.attemptId !== pendingProducer?.attemptId || producer.effectRefs.length !== 1
            || producer.status !== (producer.attemptId === pendingProducer?.attemptId ? 'running' : 'completed')
            || producer.graphRevision !== 0 || producer.epoch > child.epoch || producer.sourceBindingDigest !== child.sourceBinding.bindingDigest
            || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, authority)) invalid();
        const effect = (await readEffect(tx, handle, child, producer.effectRefs[0])).doc;
        if (fact && fact.record.envelope.sourceRefs.length !== 2) invalid();
        if (producer.attemptId === finalProducer.attemptId) await readProjectDelegatedModelInput(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1);
        for (const edge of graph.edges.filter(edge => edge.to.nodeId === producer.nodeId)) usedEdges.set(edge.edgeId, 1);
        const rows = bank.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
        const local = (bank.localWork ?? []).filter(row => row.orchestration?.effectId === effect.effectId);
        if (rows.length !== 1 || rows[0].reservationId !== child.runId || rows[0].orchestration.kind !== 'provider_send'
            || rows[0].orchestration.ordinal !== 0 || !['settled', 'unknown', 'charged'].includes(rows[0].status)
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalid();
        if (rows.some(row => row.status !== 'settled')) settled = false;
        effects.push(effect); expectedRefs.push(...rows.map(row => row.attemptId), ...local.map(row => row.attemptId));
    }
    const publishedRefs = [...facts].sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq).map(fact => fact.receipt.resultRef);
    if (!equal(child.resultRefs, publishedRefs) || new Set(facts.map(fact => fact.receipt.decisionSeq)).size !== facts.length
        || new Set(effects.map(effect => effect.effectId)).size !== effects.length
        || bank.attempts.some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))) invalid();
    if (output) usedEdges.set(graph.edges.find(edge => edge.to.nodeId === output.nodeId).edgeId, 1);
    if (child.progress.loopIterations !== 0 || child.progress.edgeVisits !== usedEdges.size || !equal(child.progress.edgeVisitCounts, Object.fromEntries(usedEdges))) invalid();
    const history = { ...shape, lineage, results, finalProducer, effects, rootDigest: hash(child), budgetAttemptIds: expectedRefs, settled };
    if (closure) assertProjectDelegatedClosure(child, history, closure);
    return history;
}

/** Pure comparison with this invocation's freshly verified complete history. */
export function assertProjectDelegatedClosure(child, history, closure) {
    if (history.rootDigest !== hash(child) || !history.settled
        || !equal(closure.reservationRefs, [{ reservationId: child.runId, parentReservationId: child.parentRef.depth === 1 ? null : history.lineage.parent.runId, status: 'released' }])
        || closure.budgetAttemptRefs.length !== history.budgetAttemptIds.length
        || new Set(closure.budgetAttemptRefs.map(ref => ref.attemptId)).size !== history.budgetAttemptIds.length
        || closure.budgetAttemptRefs.some(ref => !history.budgetAttemptIds.includes(ref.attemptId)
            || ref.reservationId !== child.runId || !equal(ref.authorityRef, child.budgetAuthorityRef))) invalid();
}

/** Original typed parent brief; these reads convey no new recipient grant. */
export async function readProjectDelegationInputs(tx, handle, root, parent, { live = false } = {}) {
    const input = parent.inputRefs[0], snapshot = await readTaskGraphRevision(tx, handle, root, parent.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === parent.nodeId);
    if (input?.kind !== 'native_project_delegation' || input.nodeId !== node?.nodeId || input.role !== 'studio'
        || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(input.planRef, root.planRef)
        || !Array.isArray(input.graphBindings) || !equal(input.graphBindings, [...input.graphBindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId)))
        || new Set(input.graphBindings.map(binding => binding.edgeId)).size !== input.graphBindings.length
        || !equal(parent.inputRefs, [input, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])]) || parent.inputDigest !== hash(parent.inputRefs)) invalid();
    const bundle = { evidenceRefs: input.acceptedGraphResultRefs, controlRefs: input.acceptedControlRefs ?? [], bindings: input.graphBindings };
    const facts = await readProjectControlInputs(tx, handle, root, null, bundle, { targetNodeId: parent.nodeId });
    const bindings = bundle.bindings;
    for (const fact of facts) {
        if (fact.record && !fact.record.envelope.audienceConstraint.nodeIds.includes(parent.nodeId)) invalid();
        if (live) await assertAttemptConsumable(tx, handle, root, fact.producer);
    }
    if (bindings.length) {
        const direct = facts.filter(fact => bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
        const joined = direct.filter(fact => fact.joinReceipt);
        if (!direct.length || direct.length !== new Set(bindings.map(binding => binding.producerAttemptId)).size
            || facts.filter(fact => !direct.includes(fact)).some(fact => !fact.record || !joined.some(join => join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, fact.receipt.resultRef))))) invalid();
        const traversal = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, { ...root, graph: snapshot.graph }, { published: direct[0], additionalProducers: direct.slice(1), output: parent, producerBindings: bindings,
            receipt: { decisionSeq: root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversal } } });
    } else if (facts.length || !snapshot.graph.entryNodeIds.includes(parent.nodeId) || snapshot.graph.edges.some(edge => edge.to.nodeId === parent.nodeId)) invalid();
    return facts;
}

/** Exact parent continuation, from a lawful child output and actual mode. */
export async function readProjectDelegationContinuation(tx, handle, parent, producer, intent) {
    const input = intent.inputRef, ref = input?.acceptedResultRef, parentInput = producer.inputRefs[0];
    if (parentInput?.kind !== 'native_project_delegation' || input?.kind !== 'native_project_intent'
        || !ref || input.parentInputDigest !== producer.inputDigest || producer.inputDigest !== hash(producer.inputRefs)
        || intent.nodeAttemptId !== producer.attemptId || input.nodeId !== producer.nodeId || !equal(input.planRef, parent.planRef)
        || intent.sourceBindingDigest !== parent.sourceBinding.bindingDigest || input.role !== 'studio' || parentInput.role !== input.role
        || input.grantDigest !== producer.effectiveGrantDigest || parentInput.requestId !== input.requestId
        || !equal(input.sourceRef, parentInput.sourceRef) || !equal(input.sourceRef, parent.sourceBinding.sourceRef)
        || !equal(input.acceptedGraphResultRefs ?? [], parentInput.acceptedGraphResultRefs)
        || !equal(input.acceptedControlRefs ?? [], parentInput.acceptedControlRefs ?? [])) invalid();
    const lineage = await readProjectDelegation(tx, handle, parent, ref.runId);
    if (!lineage || lineage.parentAttempt.attemptId !== producer.attemptId || lineage.child.status !== 'completed'
        || !equal(lineage.child.parentRef.inputRefs, producer.inputRefs)) invalid();
    const parentPlan = await readPlanRevision(tx, handle, parent.planRef);
    if (!nodeModelRoutePins(lineage.parentNode, parentPlan.dependencyPins).some(pin => equal(pin.resourceRef, input.routeRef) && pin.integrity === input.routeIntegrity)) invalid();
    let returnReceipt = null, output;
    if (lineage.mode === 'handoff') {
        returnReceipt = await readHandoffReturn(tx, handle, parent, ref.runId);
        if (!returnReceipt || !equal(input.returnReceiptRef, { runId: parent.runId, receiptId: returnReceipt.receiptId }) || !equal(returnReceipt.resultRef, ref)) invalid();
        output = returnReceipt.output;
    } else {
        if (input.returnReceiptRef !== null || await checkedRecord(tx, controlRecordKey(handle, parent.runId, 'receipt', handoffReturnReceiptId(ref.runId)))) invalid();
        output = await readTaskLocalOutput(tx, handle, lineage.child);
    }
    const publication = output?.publication;
    if (!publication || !output || !equal(output.claim.resultRef, ref)) invalid();
    return { lineage, publication, output, returnReceipt };
}
