import { readProjectDelegatedFanoutInput, readProjectDelegatedFanoutCompletion } from './project-delegated-fanout-contracts.js';
import { readProjectDelegatedControl, readProjectDelegatedReviewReplacement, assertProjectDelegatedJudgeSelections } from './project-delegated-quality-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertObject, nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, assertAttemptConsumable, assertAttemptCurrent, readAttemptInvalidation } from './controller-common.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { readGraphNodeResult, readGraphNodeResults } from './graph-result-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readHandoffReturn, handoffReturnReceiptId } from './handoff-return-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { readProjectControlInputs } from './project-control-input-contracts.js';
import { projectReviewId } from './project-review-output-contracts.js';
import { graphReviewControlRef } from './graph-review-completion.js';
import { projectReplanScope, projectPlannerProgressFingerprint } from './project-replan-contracts.js';
import { projectDelegatedGraphProfile } from './project-delegated-graph-profile.js';
import { readFanoutFrame, readFanoutMembership, readFanoutReplanScope } from './fanout-controller.js';
import { readGraphFanoutInput } from './graph-fanout-completion.js';

const invalid = () => { throw new TypeError('Invalid Project delegation facts'); };

async function durableParent(tx, handle, supplied) {
    const actual = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: supplied.runId }))?.doc;
    if (!actual) invalid();
    if (equal(actual, supplied)) return actual;
    // The original Review writer validates its exact prospective output step
    // before RunRepository saves it. No other staged or reconstructed Root fits.
    const output = (await tx.getResource(controlRecordKey(handle, actual.runId, 'receipt', projectReviewId('output', actual.runId))))?.doc;
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
    const plan = await readPlanRevision(tx, handle, child.planRef);
    if (child.sourceBinding.sourceAuthority !== 'project' || !child.parentRef) invalid();
    const initial = projectDelegatedGraphProfile(plan);
    const snapshot = await readTaskGraphRevision(tx, handle, child, child.graphRevision);
    const shape = projectDelegatedGraphProfile({ ...plan, definition: snapshot.graph });
    if (shape.terminalNodeId !== initial.terminalNodeId || !equal(shape.output, initial.output)
        || !equal(snapshot.graph.edges.filter(edge => edge.loopBack), plan.definition.edges.filter(edge => edge.loopBack))) invalid();
    return { ...shape, plan, graph: snapshot.graph };
}

/** Durable linkage only. Original Source, bank and captures grant live access. */
export async function readProjectDelegation(tx, handle, parent, childRunId) {
    if (parent.sourceBinding.sourceAuthority !== 'project') invalid();
    parent = await durableParent(tx, handle, parent);
    const child = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: childRunId }))?.doc;
    if (!child || child.sourceBinding.sourceAuthority !== 'project') invalid();
    const facts = await readDelegationCompletion(tx, handle, parent, child);
    if (!facts) return null;
    const input = facts.parentAttempt.inputRefs[0];
    if (input?.kind !== 'native_project_delegation' || input.role !== 'studio' || !equal(input.sourceRef, parent.sourceBinding.sourceRef)
        || !equal(input.planRef, parent.planRef) || !equal(input.childPlanRef, child.planRef)
        || input.nodeId !== facts.parentAttempt.nodeId || !equal(child.sourceBinding, parent.sourceBinding)
        || !equal(facts.parentAttempt.inputRefs, [input, ...(parent.parentRef?.inputRefs ?? []), ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, parent, facts.parentAttempt.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === facts.parentAttempt.nodeId);
    await readProjectDelegationInputs(tx, handle, parent, facts.parentAttempt);
    const delegated = await readProjectDelegatedPlan(tx, handle, child);
    return { ...facts, parent, child, parentInput: input, parentNode: node, ...delegated };
}

/** One exact causal Model step, including the original child Transition. */
export async function readProjectDelegatedModelInput(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    const parent = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: child.parentRef?.parentRunId }))?.doc;
    if (!parent) invalid();
    const lineage = await readProjectDelegation(tx, handle, parent, child.runId);
    return readProjectDelegatedModelInputFacts(tx, handle, child, producer, intent, publicationSeq, lineage);
}

// Only this module can provide facts obtained by its own complete typed
// Result/control reads. The public entry above always starts from fresh durable delegation.
async function readProjectDelegatedModelInputFacts(tx, handle, child, producer, intent, publicationSeq, lineage, ownedInputs = null) {
    const parent = lineage?.parent, input = intent.inputRef, storedInput = producer.inputRefs[0];
    const nested = storedInput?.kind === 'native_project_delegation'
        ? await readProjectDelegationContinuation(tx, handle, child, producer, intent) : null;
    if (!lineage || input?.kind !== 'native_project_delegated_intent' || !nested && !equal(input, storedInput)
        || input.parentRunId !== parent.runId || input.parentAttemptId !== lineage.parentAttempt.attemptId
        || input.parentEpoch !== child.parentRef.parentEpoch || input.childRunId !== child.runId || input.childEpoch !== producer.epoch
        || input.delegationInputDigest !== child.parentRef.inputDigest || input.role !== 'studio'
        || !equal(input.sourceRef, child.sourceBinding.sourceRef) || !equal(input.planRef, child.planRef) || input.nodeId !== producer.nodeId
        || intent.nodeAttemptId !== producer.attemptId || intent.epoch !== producer.epoch || intent.graphRevision !== producer.graphRevision
        || intent.inputHash !== hash(input) || intent.sourceBindingDigest !== child.sourceBinding.bindingDigest
        || intent.grantDigest !== producer.effectiveGrantDigest || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest) invalid();
    const snapshot = producer.graphRevision === child.graphRevision ? { graph: lineage.graph, nodeControl: child.nodeControl }
        : await readTaskGraphRevision(tx, handle, child, producer.graphRevision);
    if (producer.graphRevision !== child.graphRevision) projectDelegatedGraphProfile({ ...lineage.plan, definition: snapshot.graph });
    const node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId), pin = nodeModelRoutePins(node, lineage.plan.dependencyPins)[0];
    if (!pin || !equal(input.routeRef, pin.resourceRef) || intent.actionRef.kind !== 'native_model_send'
        || intent.actionRef.runtimeRouteId !== pin.resourceRef.runtimeRouteId) invalid();
    if (input.fanoutAttemptId) return readProjectDelegatedFanoutInput(tx, handle, child, producer, input, publicationSeq);
    const sources = [];
    for (const ref of input.acceptedGraphResultRefs) {
        const fact = ownedInputs?.results.get(hash(ref)) ?? await readGraphNodeResult(tx, handle, child, ref.resultId);
        if (!fact || !equal(fact.receipt.resultRef, ref) || ref.runId !== child.runId || fact.receipt.decisionSeq >= publicationSeq) invalid(); sources.push(fact);
    }
    const controls = [];
    for (const ref of input.acceptedControlRefs ?? []) {
        const fact = ownedInputs?.controls.get(hash(ref)) ?? await readProjectDelegatedControl(tx, handle, child, ref);
        if (!fact || !equal(fact.controlRef, ref) || fact.review?.decision === 'rerun' || fact.receipt.decisionSeq >= publicationSeq) invalid();
        controls.push(fact);
    }
    const judges = controls.filter(fact => fact.selectedResultRef);
    assertProjectDelegatedJudgeSelections(child, node, input.acceptedGraphResultRefs, judges);
    const rawIncoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === producer.nodeId);
    const incoming = rawIncoming.filter(edge => snapshot.nodeControl[edge.from.nodeId]?.disposition !== 'cancelled'
        || node.inputs.find(port => port.name === edge.to.port).required).filter(edge =>
        !judges.some(judge => judge.candidates.some(candidate => candidate.producer.nodeId === edge.from.nodeId
            && !equal(candidate.receipt.resultRef, judge.selectedResultRef))));
    const loops = input.graphBindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
    for (const binding of loops) {
        const edge = snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId), trigger = controls.find(fact => fact.producer.attemptId === binding.producerAttemptId);
        if (!trigger?.patch.requests.replan || trigger.patch.requests.finalize || trigger.patch.newGraphRevision !== producer.graphRevision
            || edge.from.nodeId !== trigger.producer.nodeId || edge.to.nodeId !== producer.nodeId
            || projectReplanScope(snapshot.graph, trigger.producer.nodeId).target.nodeId !== producer.nodeId) invalid();
    }
    const edges = [...incoming, ...loops.map(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId))].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const ordered = edges.map(edge => [...sources, ...controls].find(fact => fact.producer.nodeId === edge.from.nodeId));
    if (ordered.some(fact => !fact)) invalid();
    const refs = [...new Map(ordered.flatMap(fact => fact.record ? [fact.receipt.resultRef] : fact.joinReceipt?.acceptedResultRefs ?? []).map(ref => [hash(ref), ref])).values()];
    const controlRefs = [...new Map(ordered.filter(fact => fact.controlRef).map(fact => [hash(fact.controlRef), fact.controlRef])).values()];
    const bindings = edges.map((edge, index) => ({ edgeId: edge.edgeId, producerAttemptId: ordered[index].producer.attemptId }));
    if (!equal(input.acceptedGraphResultRefs, refs) || !equal(input.acceptedControlRefs ?? [], controlRefs) || !equal(input.graphBindings, bindings)
        || !equal(producer.inputRefs, [storedInput, ...child.parentRef.inputRefs, ...refs, ...controlRefs]) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    let replacement = null;
    if (input.reviewFeedbackRef) replacement = await readProjectDelegatedReviewReplacement(tx, handle, child, producer, input);
    else if (!edges.length) {
        // Only the original accepted patch at this producer's revision can
        // justify absent optional predecessors; a missing Result cannot.
        const cancelledInputs = rawIncoming.length && rawIncoming.every(edge => !node.inputs.find(port => port.name === edge.to.port).required
            && snapshot.nodeControl[edge.from.nodeId]?.disposition === 'cancelled');
        if (!snapshot.graph.entryNodeIds.includes(producer.nodeId) && !cancelledInputs) invalid();
    } else {
        const identity = hash({ runId: child.runId, bindings, reservedAttemptId: null });
        await assertOutputTransition(tx, handle, { ...child, graph: snapshot.graph }, { published: ordered[0], additionalProducers: ordered.slice(1), output: producer,
            receipt: { decisionSeq: publicationSeq, traversalReceiptRef: { runId: child.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } }, producerBindings: bindings, allowLoopBack: !!loops.length });
    }
    return { lineage, input, sources: ordered, bindings, loops, replacement, ...(nested ? { nested } : {}) };
}

/** Complete original Model/Result/Transition/Task-bank history, not a grant. */
export async function readProjectDelegatedGraphHistory(tx, handle, child, { finalPublication = null, pendingProducer = null, closure = null, output = null } = {}) {
    const shape = await readProjectDelegatedPlan(tx, handle, child), { graph, models, planners, reviews, judges } = shape;
    if (Boolean(finalPublication) === Boolean(pendingProducer)) invalid();
    const finalProducer = pendingProducer ?? finalPublication.producer ?? (await readAttempt(tx, handle, child, finalPublication.receipt.producerAttemptId)).doc;
    if (finalProducer.nodeId !== shape.terminalNodeId) invalid();
    let lineage = null;
    const intermediateRefs = child.resultRefs.filter(ref => !finalPublication || !equal(ref, finalPublication.receipt.resultRef));
    const readResults = await readGraphNodeResults(tx, handle, child, intermediateRefs.map(ref => ref.resultId));
    const results = intermediateRefs.map(ref => {
        const fact = readResults.get(ref.resultId);
        if (!fact || !equal(fact.receipt.resultRef, ref)) invalid();
        return fact;
    });
    // An intermediate Result has just proved its actual child Model input and
    // complete parent delegation. Reuse that lineage only after rereading the
    // exact original parent and child in this same history invocation.
    const intermediateLineage = results.find(fact => fact.delegationLineage)?.delegationLineage;
    if (intermediateLineage) {
        const actualParent = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
        const actualChild = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: child.runId }))?.doc;
        if (!actualParent || !actualChild || !equal(intermediateLineage.parent, actualParent)
            || !equal(intermediateLineage.child, actualChild)) invalid();
        // The original output writer also checks its precise prospective
        // Root before committing it. Keep that established public fresh path;
        // only reuse facts for the exact durable child read in this call.
        if (equal(actualChild, child)) lineage = intermediateLineage;
    }
    const facts = [...results, ...(finalPublication ? [{ ...finalPublication, producer: finalProducer, settlement: finalPublication.attemptReceipt }] : [])];
    const attempts = [];
    for (const id of child.attemptRefs) attempts.push((await readAttempt(tx, handle, child, id)).doc);
    const modelAttempts = attempts.filter(attempt => models.some(node => node.nodeId === attempt.nodeId));
    // The verified graph revision proves cancelPending for nodes never
    // admitted. Existing Attempts remain in every history and cost check.
    const requiredModels = models.filter(node => child.nodeControl[node.nodeId].disposition !== 'cancelled'
        || modelAttempts.some(attempt => attempt.nodeId === node.nodeId));
    if (requiredModels.some(node => !modelAttempts.some(attempt => attempt.nodeId === node.nodeId))
        || modelAttempts.some(attempt => !models.some(node => node.nodeId === attempt.nodeId))
        || attempts.some(attempt => !models.some(node => node.nodeId === attempt.nodeId) && !['fanout', 'join', 'output'].includes(graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind))
        || attempts.some(attempt => attempt.nodeId === shape.output.nodeId && (!output || attempt.attemptId !== output.attemptId))
        || attempts.filter(attempt => attempt.nodeId === shape.output.nodeId).length !== (output ? 1 : 0)
        || facts.length !== modelAttempts.filter(attempt => models.find(node => node.nodeId === attempt.nodeId)?.kind === 'agent' && (attempt.status === 'completed' || attempt.attemptId === pendingProducer?.attemptId)).length - (pendingProducer ? 1 : 0)) invalid();
    const source = child.sourceBinding.sourceRef, authority = child.budgetAuthorityRef;
    const task = await readOriginalProjectTask(tx, handle, source), bank = task?.compute;
    if (!bank || task.baseRevision !== source.revision || authority.authority !== 'project_task'
        || authority.projectId !== source.projectId || authority.taskId !== source.taskId
        || authority.operationId !== hash({ projectId: source.projectId, taskId: source.taskId, revision: source.revision, executionFingerprint: source.executionFingerprint })
        || !equal(authority, child.sourceBinding.budgetAuthorityRef)) invalid();
    const controls = [];
    for (const producer of modelAttempts.filter(attempt => [...planners, ...reviews, ...judges].some(node => node.nodeId === attempt.nodeId))) {
        const node = models.find(node => node.nodeId === producer.nodeId);
        const kind = { planner: 'graph_planner_control', review: 'graph_review_control', judge: 'graph_judge_control' }[node.kind];
        const fact = await readProjectDelegatedControl(tx, handle, child, { kind, runId: child.runId, attemptId: producer.attemptId });
        if (!fact) invalid(); controls.push(fact);
    }
    const fanouts = [];
    for (const producer of attempts.filter(attempt => graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'join')) {
        const joined = controls.flatMap(fact => fact.rerunFanouts ?? []).find(joined => equal(joined.producer, producer))
            ?? await readProjectDelegatedFanoutCompletion(tx, handle, child, producer.attemptId);
        if (!joined) invalid(); controls.push(joined); fanouts.push(joined);
    }
    if (attempts.filter(attempt => graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'fanout').length !== fanouts.length) invalid();
    const patches = controls.filter(fact => fact.patch);
    if (patches.length !== child.graphRevision || new Set(patches.map(fact => fact.producer.graphRevision)).size !== patches.length
        || controls.filter(fact => fact.review).length !== child.progress.reviews) invalid();
    // Only this invocation's own complete typed reads enter these private maps.
    // The public entry stays fresh. Caller finalPublication/pendingProducer is
    // excluded; exact durable parent/child lineage was independently read above.
    const ownedInputs = lineage ? { results: new Map(results.map(fact => [hash(fact.receipt.resultRef), fact])),
        controls: new Map(controls.map(fact => [hash(fact.controlRef), fact])) } : null;
    const effects = [], expectedRefs = [], usedEdges = new Map(), entries = [];
    const reservations = new Map([[child.runId, { reservationId: child.runId,
        parentReservationId: child.parentRef.depth === 1 ? null : child.parentRef.parentRunId, status: 'released' }]]);
    const budgetReservations = new Map();
    for (const joined of fanouts) for (const binding of joined.fanout.inputRefs[0].graphBindings) usedEdges.set(binding.edgeId, (usedEdges.get(binding.edgeId) ?? 0) + 1);
    for (const joined of fanouts) for (const id of [...joined.frame.edgeAdmissionRefs, ...joined.joinReceipt.edgeAdmissionRefs]) {
        const admitted = (await tx.getResource(controlRecordKey(handle, child.runId, 'receipt', id)))?.doc;
        if (!admitted || admitted.receiptKind !== 'edge_admission') invalid();
        usedEdges.set(admitted.edgeId, (usedEdges.get(admitted.edgeId) ?? 0) + 1);
    }
    let settled = true;
    for (const producer of modelAttempts) {
        const fact = [...facts, ...controls].find(fact => fact.producer.attemptId === producer.attemptId);
        const scoped = fanouts.flatMap(joined => joined.scopeAttempts).find(item => item.attempt.attemptId === producer.attemptId);
        const unsuccessful = scoped && ['failed', 'cancelled'].includes(producer.status);
        if (unsuccessful) {
            if (!equal(scoped.attempt, producer)) invalid();
            if (!producer.effectRefs.length) continue;
        }
        if (!unsuccessful && (!fact && producer.attemptId !== pendingProducer?.attemptId || producer.effectRefs.length !== 1
            || producer.status !== (producer.attemptId === pendingProducer?.attemptId ? 'running' : 'completed')
            || producer.graphRevision > child.graphRevision || producer.epoch > child.epoch || producer.sourceBindingDigest !== child.sourceBinding.bindingDigest
            || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, authority))) invalid();
        const effect = (await readEffect(tx, handle, child, producer.effectRefs[0])).doc;
        if (producer.inputRefs[0]?.kind === 'native_project_delegation') {
            const nested = fact?.delegationContinuation
                ?? controls.flatMap(control => control.rerunDelegations ?? []).find(completed => equal(completed.producer, producer))?.continuation
                ?? await readProjectDelegationContinuation(tx, handle, child, producer, effect), closure = nested.output.closure;
            if (!closure || !nested.publication.graphHistory.settled) invalid();
            for (const ref of closure.reservationRefs) {
                if (reservations.has(ref.reservationId) || ref.status !== 'released') invalid();
                reservations.set(ref.reservationId, ref);
            }
            for (const ref of closure.budgetAttemptRefs) {
                if (!equal(ref.authorityRef, authority) || budgetReservations.has(ref.attemptId)) invalid();
                budgetReservations.set(ref.attemptId, ref.reservationId); expectedRefs.push(ref.attemptId);
            }
        }
        if (fact?.record && fact.record.envelope.sourceRefs.length !== 2) invalid();
        if (controls.includes(fact)) {
            if (lineage) await readProjectDelegatedModelInputFacts(tx, handle, child, producer, effect, fact.receipt.decisionSeq, lineage, ownedInputs);
            else await readProjectDelegatedModelInput(tx, handle, child, producer, effect, fact.receipt.decisionSeq);
        }
        if (producer.attemptId === finalProducer.attemptId) {
            // The original terminal Model input read also proves this exact
            // parent/child delegation. Reuse its lineage in this history call
            // rather than proving the same full parent chain a second time.
            lineage = (lineage
                ? await readProjectDelegatedModelInputFacts(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1, lineage, ownedInputs)
                : await readProjectDelegatedModelInput(tx, handle, child, producer, effect, fact?.receipt.decisionSeq ?? child.eventSeq + 1)).lineage;
        }
        // Model inputs of every typed fact above already have their original
        // Transition proof. Reconstruct rounds from those same-call facts,
        // never by accepting a caller's current/validated-source flag.
        const input = effect.inputRef, sources = [...input.acceptedGraphResultRefs, ...input.acceptedControlRefs ?? []]
            .map(ref => [...facts, ...controls].find(source => equal(source.controlRef ?? source.receipt.resultRef, ref)));
        if (sources.some(source => !source || source.receipt.decisionSeq >= (fact?.receipt.decisionSeq ?? child.eventSeq + 1))) invalid();
        const bindings = input.graphBindings;
        if (!unsuccessful) {
            for (const binding of input.reviewFeedbackRef ? [] : bindings) usedEdges.set(binding.edgeId, (usedEdges.get(binding.edgeId) ?? 0) + 1);
            const replacement = input.reviewFeedbackRef ? await readProjectDelegatedReviewReplacement(tx, handle, child, producer, input) : null;
            entries.push({ producer, fact, sources, bindings, replacement });
        }
        const rows = bank.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
        const local = (bank.localWork ?? []).filter(row => row.orchestration?.effectId === effect.effectId);
        if (rows.length !== 1 || rows[0].reservationId !== child.runId || rows[0].orchestration.kind !== 'provider_send'
            || rows[0].orchestration.ordinal !== 0 || !['settled', 'unknown', 'charged'].includes(rows[0].status)
            || local.some(row => row.reservationId !== child.runId || row.status !== 'settled')) invalid();
        if (rows.some(row => row.status !== 'settled')) settled = false;
        effects.push(effect);
        for (const row of [...rows, ...local]) {
            if (budgetReservations.has(row.attemptId)) invalid();
            budgetReservations.set(row.attemptId, row.reservationId); expectedRefs.push(row.attemptId);
        }
    }
    if (!lineage) invalid();
    const rounds = await assertDelegatedRounds(tx, handle, child, entries, controls);
    const publishedRefs = [...facts].sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq).map(fact => fact.receipt.resultRef);
    if (!equal(child.resultRefs, publishedRefs) || new Set(facts.map(fact => fact.receipt.decisionSeq)).size !== facts.length
        || new Set(effects.map(effect => effect.effectId)).size !== effects.length
        || bank.attempts.some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))
        || (bank.localWork ?? []).some(row => row.reservationId === child.runId && !expectedRefs.includes(row.attemptId))) invalid();
    if (output) usedEdges.set(graph.edges.find(edge => edge.to.nodeId === output.nodeId).edgeId, 1);
    if (child.progress.loopIterations !== rounds.loopIterations || child.progress.edgeVisits !== [...usedEdges.values()].reduce((sum, count) => sum + count, 0)
        || !equal(child.progress.edgeVisitCounts, Object.fromEntries(usedEdges))) invalid();
    const history = { ...shape, lineage, results, controls, fanouts, finalProducer, effects, rootDigest: hash(child), budgetAttemptIds: expectedRefs,
        reservationRefs: [...reservations.values()].sort((a, b) => a.reservationId.localeCompare(b.reservationId)),
        budgetReservations: Object.fromEntries(budgetReservations), settled, loopIterations: rounds.loopIterations };
    if (closure) assertProjectDelegatedClosure(child, history, closure);
    return history;
}

/** Repeated pure work consumes its original Planner return or typed Review
 * replacement, retains old Attempts/Results/costs and uses current refs.
 * These are history checks, never invalidation, re-admission or permission. */
async function assertDelegatedRounds(tx, handle, child, entries, controls) {
    const latest = new Map(), previous = new Map(), replaced = new Map(), consumed = new Set(), keys = new Map(), loopCounts = new Map();
    let loopIterations = 0;
    for (const { producer, fact, sources, bindings, replacement: reviewReplacement } of entries) {
        const loops = bindings.filter(binding => child.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
        let trigger = null;
        if (loops.length) {
            trigger = sources.find(source => source.producer.attemptId === loops[0].producerAttemptId);
            // A branch-local return repeats only its own branch; other
            // branches may publish scheduling patches in between.
            const scoped = !!trigger?.producer.inputRefs[0]?.fanoutAttemptId;
            if (!trigger?.patch.requests.replan || trigger.patch.requests.finalize
                || (scoped ? trigger.patch.newGraphRevision > producer.graphRevision : trigger.patch.newGraphRevision !== producer.graphRevision)
                || consumed.has(trigger.producer.attemptId) || latest.get(trigger.producer.nodeId)?.producer.attemptId !== trigger.producer.attemptId) invalid();
            const scope = scoped ? await readFanoutReplanScope(tx, handle, child, trigger.producer,
                { decisionSeq: trigger.patch.decisionSeq, targetNodeId: producer.nodeId }) : projectReplanScope(child.graph, trigger.producer.nodeId);
            if (!scope || scope.target.nodeId !== producer.nodeId || !previous.has(producer.nodeId) || loops.length !== scope.loops.length
                || loops.some(binding => binding.producerAttemptId !== trigger.producer.attemptId || !scope.loops.some(edge => edge.edgeId === binding.edgeId))) invalid();
            for (const id of scope.affectedNodeIds) {
                const old = latest.get(id);
                if (old) replaced.set(id, { attemptId: old.producer.attemptId, trigger });
                latest.delete(id);
            }
            for (const binding of loops) loopCounts.set(binding.edgeId, (loopCounts.get(binding.edgeId) ?? 0) + 1);
            loopIterations += loops.length; consumed.add(trigger.producer.attemptId);
        }
        for (const source of sources) if (source !== trigger && !source.joinReceipt && latest.get(source.producer.nodeId)?.producer.attemptId !== source.producer.attemptId) invalid();
        const prior = previous.get(producer.nodeId);
        if (prior) {
            const replacement = replaced.get(producer.nodeId);
            const loop = replacement?.attemptId === prior.producer.attemptId
                && (trigger?.producer.attemptId === replacement.trigger.producer.attemptId
                    || sources.some(source => source.receipt.decisionSeq > replacement.trigger.receipt.decisionSeq));
            const invalidation = await readAttemptInvalidation(tx, handle, child, prior.producer);
            const causalReview = invalidation && controls.find(control => control.review?.receiptId === invalidation.reviewReceiptId
                && control.review.invalidatedAttemptIds.includes(prior.producer.attemptId)
                && control.receipt.decisionSeq < (fact?.receipt.decisionSeq ?? child.eventSeq + 1));
            const quality = reviewReplacement?.target.attemptId === prior.producer.attemptId || !!causalReview
                || prior.fact?.review?.decision === 'rerun' && child.graph.nodes.find(node => node.nodeId === producer.nodeId)?.kind === 'review';
            if (producer.attemptNumber !== prior.producer.attemptNumber + 1 || !loop && !quality) invalid();
            replaced.delete(producer.nodeId);
        }
        if (fact?.patch) {
            const key = projectPlannerProgressFingerprint(fact.patch.appliedOperations, child.sourceBinding, sources.filter(source => source.record));
            const priorKeys = keys.get(producer.nodeId) ?? new Set(); if (priorKeys.has(key)) invalid(); priorKeys.add(key); keys.set(producer.nodeId, priorKeys);
        }
        if (fact?.review?.decision === 'rerun') for (const [id, item] of latest) if (fact.review.invalidatedAttemptIds.includes(item.producer.attemptId)) latest.delete(id);
        latest.set(producer.nodeId, { producer, fact }); previous.set(producer.nodeId, { producer, fact });
    }
    if (replaced.size || consumed.size !== child.progress.replans || controls.filter(fact => fact.patch?.requests.replan).length !== consumed.size
        || [...latest.values()].some(item => item.fact?.patch?.requests.replan)
        || child.graph.edges.filter(edge => edge.loopBack).some(edge => (child.progress.edgeVisitCounts[edge.edgeId] ?? 0) !== (loopCounts.get(edge.edgeId) ?? 0))) invalid();
    return { loopIterations };
}

/** Pure comparison with this invocation's freshly verified complete history. */
export function assertProjectDelegatedClosure(child, history, closure) {
    if (history.rootDigest !== hash(child) || !history.settled
        || !equal(closure.reservationRefs, history.reservationRefs)
        || closure.budgetAttemptRefs.length !== history.budgetAttemptIds.length
        || new Set(closure.budgetAttemptRefs.map(ref => ref.attemptId)).size !== history.budgetAttemptIds.length
        || closure.budgetAttemptRefs.some(ref => !history.budgetAttemptIds.includes(ref.attemptId)
            || ref.reservationId !== history.budgetReservations[ref.attemptId] || !equal(ref.authorityRef, child.budgetAuthorityRef))) invalid();
}

/** Original typed parent brief; these reads convey no new recipient grant. */
export async function readProjectDelegationInputs(tx, handle, root, parent, { live = false } = {}) {
    const input = parent.inputRefs[0], snapshot = await readTaskGraphRevision(tx, handle, root, parent.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === parent.nodeId);
    if (input?.kind !== 'native_project_delegation' || input.nodeId !== node?.nodeId || input.role !== 'studio'
        || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(input.planRef, root.planRef)
        || !Array.isArray(input.graphBindings) || !equal(input.graphBindings, [...input.graphBindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId)))
        || new Set(input.graphBindings.map(binding => binding.edgeId)).size !== input.graphBindings.length
        || !equal(parent.inputRefs, [input, ...(root.parentRef?.inputRefs ?? []), ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])]) || parent.inputDigest !== hash(parent.inputRefs)) invalid();
    const bundle = { evidenceRefs: input.acceptedGraphResultRefs, controlRefs: input.acceptedControlRefs ?? [], bindings: input.graphBindings };
    let facts;
    if (root.parentRef) {
        const ancestor = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: root.parentRef.parentRunId }))?.doc;
        const lineage = ancestor && await readProjectDelegation(tx, handle, ancestor, root.runId);
        const pin = lineage && nodeModelRoutePins(node, lineage.plan.dependencyPins)[0];
        if (!lineage || !pin || input.parentRunId !== root.parentRef.parentRunId || input.parentAttemptId !== root.parentRef.nodeAttemptId
            || input.parentEpoch !== root.parentRef.parentEpoch || input.childRunId !== root.runId || input.childEpoch !== parent.epoch
            || input.delegationInputDigest !== root.parentRef.inputDigest || !equal(input.audience, { kind: 'task', id: root.runId })
            || input.grantDigest !== root.parentRef.effectiveGrantDigest || parent.effectiveGrantDigest !== input.grantDigest
            || !equal(input.routeRef, pin.resourceRef) || input.routeIntegrity !== pin.integrity) invalid();
        facts = [];
        for (const ref of bundle.evidenceRefs) {
            const fact = await readGraphNodeResult(tx, handle, root, ref.resultId);
            if (!fact || !equal(ref, fact.receipt.resultRef)) invalid(); facts.push(fact);
        }
        for (const ref of bundle.controlRefs) {
            const fact = await readProjectDelegatedControl(tx, handle, root, ref);
            if (!fact || !equal(ref, fact.controlRef) || fact.review?.decision === 'rerun') invalid(); facts.push(fact);
        }
        assertProjectDelegatedJudgeSelections({ ...root, graph: snapshot.graph }, node, bundle.evidenceRefs, facts.filter(fact => fact.selectedResultRef));
    } else facts = await readProjectControlInputs(tx, handle, root, null, bundle, { targetNodeId: parent.nodeId });
    const bindings = bundle.bindings;
    for (const fact of facts) {
        if (fact.record && !fact.record.envelope.audienceConstraint.nodeIds.includes(parent.nodeId)) invalid();
        if (live) await assertAttemptConsumable(tx, handle, root, fact.producer);
    }
    if (input.fanoutAttemptId) {
        if (root.parentRef) await readProjectDelegatedFanoutInput(tx, handle, root, parent, input, root.eventSeq + 1);
        else {
            const frame = await readFanoutFrame(tx, handle, root, input.fanoutAttemptId);
            const branch = frame?.branches.find(branch => branch.scopeNodeIds.includes(parent.nodeId));
            if (!frame || !branch || !await readFanoutMembership(tx, handle, root, frame, parent.attemptId)) invalid();
            const fanout = (await readAttempt(tx, handle, root, frame.fanoutAttemptId)).doc;
            if ([...fanout.inputRefs[0].acceptedGraphResultRefs, ...fanout.inputRefs[0].acceptedControlRefs]
                .some(ref => !parent.inputRefs.some(actual => equal(actual, ref)))) invalid();
            const inherited = facts.filter(fact => fanout.inputRefs.some(ref => equal(ref, fact.controlRef ?? fact.receipt.resultRef)));
            for (const fact of inherited) await readGraphFanoutInput(tx, handle, root, frame.fanoutAttemptId, parent,
                fact.controlRef ?? fact.receipt.resultRef, fact, { historical: true });
            const direct = facts.filter(fact => !inherited.includes(fact));
            if (input.reviewFeedbackRef) await assertDelegationReviewReplacement(tx, handle, root, parent, snapshot, facts, { live });
            else if (parent.attemptId === branch.entryAttemptId) {
                if (bindings.length || direct.length) invalid();
            } else {
                if (!bindings.length || direct.some(fact => !branch.scopeNodeIds.includes(fact.producer.nodeId))) invalid();
                const reservedAttemptId = parent.reservationRef ? parent.attemptId : null;
                const traversal = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId }).slice(0, 32);
                await assertOutputTransition(tx, handle, { ...root, graph: snapshot.graph }, { published: direct[0], additionalProducers: direct.slice(1), output: parent,
                    producerBindings: bindings, reservedAttemptId, receipt: { decisionSeq: root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversal } } });
            }
        }
        return facts;
    }
    if (input.reviewFeedbackRef) {
        if (root.parentRef) {
            // The original child Review copies the resolver's complete input
            // and inherited grant. It does not mint a main Task worker grant
            // or fabricate another traversal of the old incoming edges.
            const { fact, target } = await readProjectDelegatedReviewReplacement(tx, handle, root, parent, input);
            if (target.inputRefs[0]?.kind !== 'native_project_delegation' || target.attemptNumber >= parent.attemptNumber
                || !equal(target.inputRefs[0].childPlanRef, input.childPlanRef)) invalid();
            await readProjectDelegationInputs(tx, handle, root, target);
            if (live) {
                await assertAttemptCurrent(tx, handle, root, fact.producer);
                if (root.status !== 'running' || root.cancelRequested || fact.producer.epoch !== root.epoch || parent.epoch !== root.epoch) invalid();
            }
        } else await assertDelegationReviewReplacement(tx, handle, root, parent, snapshot, facts, { live });
        return facts;
    }
    if (bindings.length) {
        const direct = facts.filter(fact => bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
        const joined = direct.filter(fact => fact.joinReceipt);
        if (!direct.length || direct.length !== new Set(bindings.map(binding => binding.producerAttemptId)).size
            || facts.filter(fact => !direct.includes(fact)).some(fact => !fact.record || !joined.some(join => join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, fact.receipt.resultRef))))) invalid();
        const traversal = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, { ...root, graph: snapshot.graph }, { published: direct[0], additionalProducers: direct.slice(1), output: parent, producerBindings: bindings,
            receipt: { decisionSeq: root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversal } } });
    } else {
        const incoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === parent.nodeId);
        const cancelledInputs = incoming.length && incoming.every(edge => !node.inputs.find(port => port.name === edge.to.port).required
            && snapshot.nodeControl[edge.from.nodeId]?.disposition === 'cancelled');
        if (facts.length || !(snapshot.graph.entryNodeIds.includes(parent.nodeId) && !incoming.length || cancelledInputs)) invalid();
    }
    return facts;
}

/** The original Review command creates a replacement directly; it does not
 * fabricate a second Transition or charge the old incoming edges again. */
async function assertDelegationReviewReplacement(tx, handle, root, parent, snapshot, facts, { live }) {
    const input = parent.inputRefs[0], feedback = input.reviewFeedbackRef;
    assertObject(feedback, ['reviewReceiptRef', 'reasonCode'], 'Project delegation Review feedback');
    assertObject(feedback.reviewReceiptRef, ['runId', 'receiptId'], 'Project delegation Review receipt');
    if (feedback.reviewReceiptRef.runId !== root.runId) invalid();
    const saved = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', feedback.reviewReceiptRef.receiptId)))?.doc;
    if (!saved || saved.receiptKind !== 'graph_review' || saved.receiptId !== feedback.reviewReceiptRef.receiptId) invalid();
    const [completed] = await readProjectControlInputs(tx, handle, root, null,
        { controlRefs: [graphReviewControlRef(root.runId, saved.reviewAttemptId)] });
    const review = completed?.review, replacement = review?.replacements.find(item => item.attemptId === parent.attemptId);
    if (!review || review.decision !== 'rerun' || !replacement || review.reasonCode !== feedback.reasonCode
        || review.receiptId !== feedback.reviewReceiptRef.receiptId || review.epoch !== parent.epoch
        || review.graphRevision !== parent.graphRevision || completed.receipt.decisionSeq > root.eventSeq) invalid();
    const target = (await readAttempt(tx, handle, root, replacement.targetAttemptId)).doc;
    if (target.inputRefs[0]?.kind !== 'native_project_delegation' || target.nodeId !== parent.nodeId || target.attemptNumber >= parent.attemptNumber
        || !equal(target.inputRefs[0].childPlanRef, input.childPlanRef)
        || parent.effectiveGrantDigest !== hash({ handle, input })) invalid();
    // Prove the target's original admission as well as the actual Review
    // replacement identity, invalidation and immutable new input above.
    await readProjectDelegationInputs(tx, handle, root, target);
    const bindings = input.graphBindings, node = snapshot.graph.nodes.find(node => node.nodeId === parent.nodeId);
    for (const binding of bindings) {
        assertObject(binding, ['edgeId', 'producerAttemptId'], 'Project delegation Review binding');
        const fact = facts.find(fact => fact.producer.attemptId === binding.producerAttemptId);
        const edge = snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId && !edge.loopBack);
        if (!fact || !edge || edge.from.nodeId !== fact.producer.nodeId || edge.to.nodeId !== parent.nodeId
            || !['always', 'success'].includes(edge.condition) || edge.condition === 'success' && fact.producer.status !== 'completed') invalid();
    }
    for (const port of node.inputs.filter(port => port.required && !input.fanoutAttemptId)) {
        if (!bindings.some(binding => snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.port === port.name))) invalid();
    }
    const direct = facts.filter(fact => bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId)), joined = direct.filter(fact => fact.joinReceipt);
    if (facts.filter(fact => !direct.includes(fact)).some(fact => !fact.record
        || !joined.some(join => join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, fact.receipt.resultRef))))) invalid();
    if (live) {
        // A rerun Review is admission evidence for its exact replacement,
        // never an approve control for ordinary downstream consumption.
        await assertAttemptCurrent(tx, handle, root, completed.producer);
        if (root.status !== 'running' || root.cancelRequested || completed.producer.epoch !== root.epoch || parent.epoch !== root.epoch) invalid();
    }
}

/** Exact parent continuation, from a lawful child output and actual mode. */
export async function readProjectDelegationContinuation(tx, handle, parent, producer, intent) {
    const input = intent.inputRef, ref = input?.acceptedResultRef, parentInput = producer.inputRefs[0];
    if (parentInput?.kind !== 'native_project_delegation' || input?.kind !== (parent.parentRef ? 'native_project_delegated_intent' : 'native_project_intent')
        || !ref || input.parentInputDigest !== producer.inputDigest || producer.inputDigest !== hash(producer.inputRefs)
        || intent.nodeAttemptId !== producer.attemptId || input.nodeId !== producer.nodeId || !equal(input.planRef, parent.planRef)
        || intent.sourceBindingDigest !== parent.sourceBinding.bindingDigest || input.role !== 'studio' || parentInput.role !== input.role
        || input.grantDigest !== producer.effectiveGrantDigest || parentInput.requestId !== input.requestId
        || !equal(input.sourceRef, parentInput.sourceRef) || !equal(input.sourceRef, parent.sourceBinding.sourceRef)
        || !equal(input.acceptedGraphResultRefs ?? [], parentInput.acceptedGraphResultRefs)
        || !equal(input.acceptedControlRefs ?? [], parentInput.acceptedControlRefs ?? [])
        || parentInput.reviewFeedbackRef && !equal(parent.parentRef ? input.reviewFeedbackRef : input.projectQualityTask?.feedback,
            parentInput.reviewFeedbackRef)) invalid();
    if (parent.sourceBinding.sourceAuthority !== 'project') invalid();
    if (parent.parentRef) {
        const expected = { ...parentInput, kind: 'native_project_delegated_intent', acceptedResultRef: input.acceptedResultRef,
            returnReceiptRef: input.returnReceiptRef, parentInputDigest: producer.inputDigest };
        delete expected.childPlanRef;
        if (!equal(input, expected)) invalid();
    }
    const actualParent = await durableParent(tx, handle, parent);
    const child = (await tx.getResource({ kind: K.orchestrationRun, handle, runId: ref.runId }))?.doc;
    if (!child || child.sourceBinding.sourceAuthority !== 'project' || child.status !== 'completed') invalid();
    let returnReceipt = null, output;
    if (input.returnReceiptRef !== null) {
        returnReceipt = await readHandoffReturn(tx, handle, parent, ref.runId);
        if (!returnReceipt || !equal(input.returnReceiptRef, { runId: parent.runId, receiptId: returnReceipt.receiptId }) || !equal(returnReceipt.resultRef, ref)) invalid();
        output = returnReceipt.output;
    } else {
        if (await tx.getResource(controlRecordKey(handle, parent.runId, 'receipt', handoffReturnReceiptId(ref.runId)))) invalid();
        output = await readTaskLocalOutput(tx, handle, child);
    }
    const publication = output?.publication;
    // These facts were obtained by this invocation's complete original output
    // read, including its actual child DAG, delegation command and bank. Reuse
    // that verified lineage rather than replaying the same historical chain.
    const lineage = returnReceipt?.lineage ?? publication?.graphHistory?.lineage;
    if (!publication || !output || !lineage || !equal(output.claim.resultRef, ref)
        || !equal(lineage.parent, actualParent) || !equal(lineage.child, child)
        || lineage.mode !== (returnReceipt ? 'handoff' : 'delegate') || lineage.parentAttempt.attemptId !== producer.attemptId
        || !equal(child.parentRef.inputRefs, producer.inputRefs)) invalid();
    const parentPlan = await readPlanRevision(tx, handle, parent.planRef);
    if (!nodeModelRoutePins(lineage.parentNode, parentPlan.dependencyPins).some(pin => equal(pin.resourceRef, input.routeRef) && pin.integrity === input.routeIntegrity)) invalid();
    return { lineage, publication, output, returnReceipt };
}
