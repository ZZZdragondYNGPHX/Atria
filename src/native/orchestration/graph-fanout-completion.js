import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlCommandId, controlRecordKey, readAttempt, graphReachable, assertAttemptConsumable } from './controller-common.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';
import { readFanoutFrame, readFanoutMembership, isFanoutBranchExcluded } from './fanout-controller.js';
import { readTaskGraphRevision, readTaskGraphRevisions } from './graph-revision-contracts.js';
import { joinIdForAttempt, decideJoinOutcome } from './join-controller.js';
import { readGraphNodeResults } from './graph-result-contracts.js';
import { readEffect } from './effect-contracts.js';

const same = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Graph Fanout Join completion facts'); };
export const graphJoinControlRef = (runId, attemptId, receiptId) => ({ kind: 'graph_join_control', runId, attemptId, receiptId });

/** Only the models already declared before a barrier. This is an immutable
 * graph audience bound, not a Source or disclosure grant. */
export function graphFanoutModelScope(graph, fanoutNodeId) {
    const found = new Set(), seen = new Set([fanoutNodeId]);
    const pending = graph.edges.filter(edge => edge.from.nodeId === fanoutNodeId && !edge.loopBack).map(edge => edge.to.nodeId);
    while (pending.length) {
        const id = pending.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        const node = graph.nodes.find(node => node.nodeId === id);
        if (!node || ['join', 'output'].includes(node.kind)) continue;
        if (['agent', 'planner', 'review', 'judge'].includes(node.kind)) found.add(id);
        pending.push(...graph.edges.filter(edge => edge.from.nodeId === id && !edge.loopBack).map(edge => edge.to.nodeId));
    }
    return [...found].sort();
}

async function commandFact(tx, handle, root, kind, identity, detail, field, value) {
    const commandId = controlCommandId(kind, identity), operation = 'runs.control.' + kind;
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.operation !== operation || command.target !== root.runId
        || command.payloadHash !== hash({ operation, body: { runId: root.runId, operation: kind, detail } })
        || !same(command.outcome?.[field], value) || command.outcome.runId !== root.runId
        || command.outcome.versions?.epoch !== value.epoch) invalid();
    return command;
}

async function edgeFacts(tx, handle, root, graph, transfers, refs, decisionSeq, graphRevision) {
    if (!Array.isArray(refs) || refs.length !== transfers.length || new Set(refs).size !== refs.length) invalid();
    const expectedRefs = [];
    for (const transfer of transfers) {
        const edge = graph.edges.find(edge => edge.edgeId === transfer.edgeId);
        const producer = (await readAttempt(tx, handle, root, transfer.producerAttemptId)).doc;
        const target = (await readAttempt(tx, handle, root, transfer.nodeAttemptId)).doc;
        const receiptId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, ...transfer }).slice(0, 32);
        const fact = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
        if (!fact) invalid();
        assertObject(fact, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId',
            'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'EdgeAdmission');
        for (const field of ['graphRevision', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt']) assertCounter(fact[field], field);
        if (!edge || producer.nodeId !== edge.from.nodeId || target.nodeId !== edge.to.nodeId || fact.schemaVersion !== 1
            || fact.receiptKind !== 'edge_admission' || fact.receiptId !== receiptId || fact.runId !== root.runId
            || fact.epoch !== producer.epoch || fact.epoch !== target.epoch || fact.graphRevision !== graphRevision
            || fact.sourceBindingDigest !== root.sourceBinding.bindingDigest || Object.entries(transfer).some(([key, value]) => fact[key] !== value)
            || fact.decisionSeq !== decisionSeq || fact.edgeVisit < 1 || fact.edgeVisit > edge.maxVisits
            || fact.edgeVisit > (root.progress.edgeVisitCounts[edge.edgeId] ?? 0) || fact.loopIteration > root.progress.loopIterations) invalid();
        expectedRefs.push(receiptId);
    }
    if (!same(refs.toSorted(), expectedRefs.toSorted())) invalid();
}

async function assertEdgeHistory(tx, handle, root) {
    const rows = (await tx.listResources({ kind: K.orchestrationRecord, handle, runId: root.runId, recordType: 'receipt' }))
        .filter(row => row.doc.receiptKind === 'edge_admission');
    const byEdge = new Map(), byDecision = new Map();
    for (const row of rows) {
        const fact = row.doc, edge = root.graph.edges.find(edge => edge.edgeId === fact.edgeId);
        if (row.integrity !== hash(fact) || row.key.recordId !== fact.receiptId || !edge || fact.runId !== root.runId
            || fact.epoch > root.epoch || fact.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || fact.decisionSeq > root.eventSeq) invalid();
        const edgeRows = byEdge.get(edge.edgeId) ?? [];
        edgeRows.push(fact); byEdge.set(edge.edgeId, edgeRows);
        const decisionRows = byDecision.get(fact.decisionSeq) ?? [];
        decisionRows.push({ fact, edge }); byDecision.set(fact.decisionSeq, decisionRows);
    }
    if (rows.length !== root.progress.edgeVisits) invalid();
    for (const [edgeId, count] of Object.entries(root.progress.edgeVisitCounts)) {
        const facts = (byEdge.get(edgeId) ?? []).toSorted((a, b) => a.edgeVisit - b.edgeVisit);
        if (facts.length !== count || facts.some((fact, index) => fact.edgeVisit !== index + 1
            || index > 0 && facts[index - 1].decisionSeq > fact.decisionSeq)) invalid();
    }
    let loops = 0;
    for (const [, facts] of [...byDecision].sort(([a], [b]) => a - b)) {
        const loopFacts = facts.filter(item => item.edge.loopBack), after = loops + loopFacts.length;
        if (facts.some(({ fact, edge }) => fact.loopIteration < loops + Number(edge.loopBack) || fact.loopIteration > after)
            || loopFacts.toSorted((a, b) => a.fact.loopIteration - b.fact.loopIteration)
                .some(({ fact }, index) => fact.loopIteration !== loops + index + 1)) invalid();
        loops = after;
    }
    if (loops !== root.progress.loopIterations) invalid();
}

async function cancelFact(tx, handle, root, frame, joinId, item, failedAttemptId) {
    const detail = { fanoutAttemptId: frame.fanoutAttemptId, failedAttemptId, joinId, attemptId: item.attempt.attemptId };
    const commandId = controlCommandId('fanout.cancelPending', { runId: root.runId, ...detail }), operation = 'runs.control.attempt.settle';
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    return !!command && command.commandId === commandId && command.operation === operation && command.target === root.runId
        && command.payloadHash === hash({ operation, body: { runId: root.runId, operation: 'attempt.settle', detail } })
        && same(command.outcome?.attemptReceipt, item.completed);
}

/** Scope identities/topology remain the original freeze, even when an
 * admitted Planner changes scheduling attributes at a later graph revision. */
function assertFrozenScopeGraph(frame, frozen, actual) {
    const ids = new Set(frame.branches.flatMap(branch => branch.scopeNodeIds));
    const shape = graph => ({ nodes: graph.nodes.filter(node => ids.has(node.nodeId)),
        edges: graph.edges.filter(edge => ids.has(edge.from.nodeId) || ids.has(edge.to.nodeId)) });
    if (!same(shape(frozen), shape(actual)) || !same(frozen.outputContract, actual.outputContract)) invalid();
}

/** A Model already admitted by a frozen Frame can finish after an unrelated
 * scheduling revision. Reprove its original membership and every intervening
 * scope shape; this supplies no Source, bank or publication permission. */
export async function readGraphFanoutPublicationGraph(tx, handle, root, producer, publicationRevision, publicationSeq) {
    const actual = (await readAttempt(tx, handle, root, producer.attemptId)).doc;
    const fanoutAttemptId = producer.inputRefs?.[0]?.fanoutAttemptId;
    const frame = fanoutAttemptId ? await readFanoutFrame(tx, handle, root, fanoutAttemptId) : null;
    if (!same(actual, producer) || !frame || producer.graphRevision >= publicationRevision || publicationRevision > root.graphRevision
        || frame.graphRevision > producer.graphRevision || frame.epoch !== producer.epoch || frame.epoch > root.epoch
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || producer.sourceBindingDigest !== frame.sourceBindingDigest
        || !same(frame.parentBudgetRef, root.budgetAuthorityRef) || !same(producer.budgetRef, frame.parentBudgetRef)
        || frame.decisionSeq >= publicationSeq || publicationSeq > root.eventSeq + 1
        || !frame.branches.some(branch => branch.memberAttemptIds.includes(producer.attemptId) && branch.scopeNodeIds.includes(producer.nodeId))) invalid();
    const membership = await readFanoutMembership(tx, handle, root, frame, producer.attemptId);
    const fanout = (await readAttempt(tx, handle, root, fanoutAttemptId)).doc;
    if (!membership || membership.decisionSeq !== frame.decisionSeq || membership.createdAt !== frame.createdAt || fanout.epoch !== frame.epoch
        || fanout.sourceBindingDigest !== frame.sourceBindingDigest || !same(fanout.budgetRef, frame.parentBudgetRef)) invalid();
    const revisions = Array.from({ length: publicationRevision - frame.graphRevision + 1 }, (_, index) => frame.graphRevision + index);
    const snapshots = await readTaskGraphRevisions(tx, handle, root, revisions), frozen = snapshots.get(frame.graphRevision);
    const node = frozen.graph.nodes.find(node => node.nodeId === fanout.nodeId);
    if (node?.kind !== 'fanout' || frame.maxConcurrency !== Math.min(node.policy.maxConcurrency, root.limits.maxConcurrency)
        || frame.failurePolicy !== node.policy.failurePolicy || !graphFanoutModelScope(frozen.graph, fanout.nodeId).includes(producer.nodeId)) invalid();
    for (const snapshot of snapshots.values()) assertFrozenScopeGraph(frame, frozen.graph, snapshot.graph);
    const command = await commandFact(tx, handle, root, 'fanout.freeze', frame.receiptId,
        { fanoutAttemptId, branches: frame.branches }, 'fanoutFrame', frame);
    if (command.outcome.versions.graphRevision !== frame.graphRevision) invalid();
    const transfers = [];
    for (const branch of frame.branches) {
        const entry = (await readAttempt(tx, handle, root, branch.entryAttemptId)).doc;
        const edges = frozen.graph.edges.filter(edge => edge.from.nodeId === fanout.nodeId && edge.to.nodeId === entry.nodeId && !edge.loopBack);
        if (edges.length !== 1 || entry.epoch !== frame.epoch || !branch.scopeNodeIds.includes(entry.nodeId)) invalid();
        transfers.push({ edgeId: edges[0].edgeId, producerAttemptId: fanoutAttemptId, nodeAttemptId: entry.attemptId });
    }
    await edgeFacts(tx, handle, root, frozen.graph, transfers, frame.edgeAdmissionRefs, frame.decisionSeq, frame.graphRevision);
    const patches = await tx.listResources({ kind: K.orchestrationRecord, handle, runId: root.runId, recordType: 'patch' });
    if (patches.some(row => row.doc.accepted && row.doc.newGraphRevision <= publicationRevision
        && row.doc.newGraphRevision > producer.graphRevision && row.doc.decisionSeq >= publicationSeq)) invalid();
    return { frame, membership, graphSnapshot: snapshots.get(producer.graphRevision) };
}

async function reservationFact(tx, handle, root, frame, attempt, snapshot) {
    if (!attempt.reservationRef) return null;
    if (attempt.reservationRef.producerAttemptId !== frame.fanoutAttemptId) invalid();
    const detail = { producerAttemptId: frame.fanoutAttemptId, nodeId: attempt.nodeId };
    const identity = hash({ kind: 'fanout_reservation', runId: root.runId, ...detail });
    const receiptId = 'oreceipt_' + identity.slice(0, 32);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) invalid();
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'producerAttemptId', 'nodeAttemptId', 'epoch',
        'graphRevision', 'decisionSeq', 'createdAt'], 'Attempt reservation');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'attempt_reservation' || receipt.receiptId !== receiptId
        || receipt.nodeAttemptId !== attempt.attemptId || attempt.attemptId !== 'oattempt_' + identity.slice(0, 32)
        || receipt.runId !== root.runId || receipt.producerAttemptId !== frame.fanoutAttemptId || receipt.epoch !== frame.epoch
        || receipt.graphRevision !== frame.graphRevision || receipt.graphRevision > attempt.graphRevision
        || attempt.inputState === 'reserved' && receipt.graphRevision !== attempt.graphRevision
        || snapshot.graphRevision !== attempt.graphRevision || receipt.decisionSeq >= frame.decisionSeq || receipt.createdAt > frame.createdAt) invalid();
    const command = await commandFact(tx, handle, root, 'attempt.reserve', identity, detail, 'reservationReceipt', receipt);
    if (command.outcome.versions.graphRevision !== receipt.graphRevision) invalid();
    return receipt;
}

/** Verify a fanout transfer of an already cold-validated typed Result/control
 * fact. Like assertOutputTransition, this proves lineage only: callers must
 * use their original typed reader, Source, audience and bank boundaries. */
export async function readGraphFanoutInput(tx, handle, root, fanoutAttemptId, recipient, ref, published, { historical = false } = {}) {
    const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
    const fanout = (await readAttempt(tx, handle, root, fanoutAttemptId)).doc;
    const producer = (await readAttempt(tx, handle, root, published.producer.attemptId)).doc;
    const sourceSettlement = await readAttemptSettlement(tx, handle, root, producer);
    if (!historical) await assertAttemptConsumable(tx, handle, root, producer);
    const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
    if (!frame) invalid();
    const graph = (await readTaskGraphRevision(tx, handle, root, frame.graphRevision)).graph;
    const input = fanout.inputRefs?.[0], received = recipient.inputRefs?.[0];
    const membership = await readFanoutMembership(tx, handle, root, frame, recipient.attemptId);
    if (!same(actual, recipient) || !same(producer, published.producer) || !same(sourceSettlement, published.settlement)
        || !['completed', 'partial'].includes(producer.status) || frame.epoch > root.epoch
        || fanout.epoch !== frame.epoch || recipient.epoch !== frame.epoch || producer.epoch !== frame.epoch
        || !historical && (root.status !== 'running' || root.cancelRequested || fanout.status !== 'running' || frame.epoch !== root.epoch
            || !['running', 'waiting_effect'].includes(recipient.status))
        || fanout.sourceBindingDigest !== root.sourceBinding.bindingDigest || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || !same(fanout.budgetRef, root.budgetAuthorityRef)
        || !same(frame.parentBudgetRef, fanout.budgetRef) || !same(recipient.budgetRef, fanout.budgetRef)
        || graph.nodes.find(node => node.nodeId === fanout.nodeId)?.kind !== 'fanout'
        || !membership || membership.decisionSeq > root.eventSeq || !frame.branches.some(branch => branch.scopeNodeIds.includes(recipient.nodeId))
        || !graphFanoutModelScope(graph, fanout.nodeId).includes(recipient.nodeId)
        || input?.nodeId !== fanout.nodeId || !same(input.sourceRef, root.sourceBinding.sourceRef) || !same(input.planRef, root.planRef)
        || fanout.inputDigest !== hash(fanout.inputRefs)
        || fanout.effectiveGrantDigest !== (root.sourceBinding.sourceAuthority === 'project' && root.parentRef && input.kind === 'native_project_delegated_control'
            ? root.parentRef.effectiveGrantDigest : hash({ handle, source: root.sourceBinding, inputRefs: fanout.inputRefs }))
        || !fanout.inputRefs.some(actual => same(actual, ref)) || received?.fanoutAttemptId !== fanoutAttemptId
        || !recipient.inputRefs.some(actual => same(actual, ref))) invalid();
    const rows = (await tx.listResources({ kind: K.orchestrationRecord, handle, runId: root.runId, recordType: 'receipt' }))
        .filter(row => row.doc.receiptKind === 'graph_transition' && row.doc.nodeAttemptId === fanout.attemptId);
    if (rows.length !== 1) invalid();
    const traversal = rows[0].doc, reservedAttemptId = fanout.reservationRef ? fanout.attemptId : null;
    const identity = hash({ runId: root.runId, bindings: traversal.bindings, reservedAttemptId });
    const commandId = controlCommandId('loop.advance', identity);
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    const snapshot = await readTaskGraphRevision(tx, handle, root, fanout.graphRevision);
    if (rows[0].integrity !== hash(traversal) || rows[0].key.recordId !== traversal.receiptId || traversal.receiptId !== 'oreceipt_' + identity.slice(0, 32)
        || fanout.attemptId !== (reservedAttemptId ?? 'oattempt_' + identity.slice(0, 32))
        || traversal.runId !== root.runId || traversal.epoch !== fanout.epoch || traversal.graphRevision !== fanout.graphRevision
        || traversal.inputDigest !== fanout.inputDigest || traversal.decisionSeq >= frame.decisionSeq
        || traversal.decisionSeq <= sourceSettlement.decisionSeq || !traversal.producerReceiptRefs.includes(sourceSettlement.receiptId)
        || !command || command.schemaVersion !== 1 || command.commandId !== commandId || command.target !== root.runId
        || command.operation !== 'runs.control.loop.advance' || command.outcome?.attemptId !== fanout.attemptId
        || !same(command.outcome.traversalReceipt, traversal) || command.outcome.versions?.epoch !== fanout.epoch
        || command.outcome.versions?.graphRevision !== fanout.graphRevision
        || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'loop.advance',
            detail: { bindings: traversal.bindings, reservedAttemptId } } })) invalid();
    const transfers = traversal.bindings.filter(binding => binding.producerAttemptId === producer.attemptId).map(binding => ({
        edgeId: binding.edgeId, producerAttemptId: producer.attemptId, nodeAttemptId: fanout.attemptId,
    }));
    if (!transfers.length || transfers.some(transfer => {
        const edge = snapshot.graph.edges.find(edge => edge.edgeId === transfer.edgeId);
        return !edge || !['always', 'success'].includes(edge.condition) || edge.condition === 'success' && producer.status !== 'completed';
    })) invalid();
    const refs = transfers.map(transfer => 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, ...transfer }).slice(0, 32));
    if (refs.some(id => !traversal.edgeAdmissionRefs.includes(id))) invalid();
    await edgeFacts(tx, handle, root, snapshot.graph, transfers, refs, traversal.decisionSeq, fanout.graphRevision);
    await commandFact(tx, handle, root, 'fanout.freeze', frame.receiptId, { fanoutAttemptId, branches: frame.branches }, 'fanoutFrame', frame);
    return { producer, fanout, frame, membership, traversal };
}

/** Immutable graph/controller/typed Result history only. The domain verifies
 * its existing input and bank facts; these callbacks never issue a permit.
 * Scheduler, current Source and recipient audience still require their
 * original live boundaries before any model send or Result consumption. */
export async function readGraphFanoutCompletion(tx, handle, root, joinAttemptId, {
    verifyMemberInput, verifyControlInput, verifyMemberCost, recipient = null,
}) {
    if ([verifyMemberInput, verifyControlInput, verifyMemberCost].some(fn => typeof fn !== 'function')) invalid();
    // Reuse only this invocation's read-only historical facts. Live recipient,
    // Source, Model, bank and permission checks below and at the consumer's
    // original boundary remain fresh; no evidence survives this function.
    const attempts = new Map();
    const attemptAt = async id => {
        if (!attempts.has(id)) attempts.set(id, (await readAttempt(tx, handle, root, id)).doc);
        return attempts.get(id);
    };
    const join = await attemptAt(joinAttemptId);
    const joinId = joinIdForAttempt(join.attemptId);
    const barrierRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', 'barrier:' + joinId));
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', joinId)))?.doc;
    if (!barrierRow || !receipt) return null;
    const barrier = barrierRow.doc;
    assertObject(barrier, ['schemaVersion', 'joinId', 'runId', 'fanoutAttemptId', 'nodeAttemptId', 'epoch', 'graphRevision', 'memberAttemptIds',
        'memberEdges', 'fanoutFrameRef', 'sourceBindingDigest', 'parentBudgetRef', 'policy', 'quorum', 'deadlineAt', 'frozenSeq', 'createdAt'], 'JoinBarrier');
    assertObject(receipt, ['schemaVersion', 'joinId', 'runId', 'nodeAttemptId', 'epoch', 'graphRevision', 'memberAttemptIds', 'edgeAdmissionRefs',
        'memberReceiptRefs', 'barrierDigest', 'policy', 'quorum', 'deadlineAt', 'cutoffSeq', 'decisionSeq', 'acceptedResultRefs', 'excluded', 'reasons', 'outcome'], 'JoinReceipt');
    for (const field of ['epoch', 'graphRevision', 'deadlineAt', 'frozenSeq', 'createdAt']) assertCounter(barrier[field], field);
    for (const field of ['cutoffSeq', 'decisionSeq']) assertCounter(receipt[field], field, 1);
    const fanout = await attemptAt(barrier.fanoutAttemptId);
    const frame = await readFanoutFrame(tx, handle, root, fanout.attemptId);
    if (!frame) invalid();
    const frozen = await readTaskGraphRevision(tx, handle, root, frame.graphRevision);
    const joinedGraph = barrier.graphRevision === frame.graphRevision ? frozen : await readTaskGraphRevision(tx, handle, root, barrier.graphRevision);
    const plan = await readPlanRevision(tx, handle, root.planRef);
    const snapshots = new Map([[frame.graphRevision, frozen], [barrier.graphRevision, joinedGraph]]);
    const snapshotAt = async revision => {
        if (!snapshots.has(revision)) snapshots.set(revision, await readTaskGraphRevision(tx, handle, root, revision));
        return snapshots.get(revision);
    };
    const fanoutNode = frozen.graph.nodes.find(node => node.nodeId === fanout.nodeId);
    const joinNode = joinedGraph.graph.nodes.find(node => node.nodeId === join.nodeId);
    const settlement = await readAttemptSettlement(tx, handle, root, join);
    if (fanoutNode?.kind !== 'fanout' || joinNode?.kind !== 'join' || frame.epoch !== fanout.epoch || fanout.epoch !== join.epoch
        || fanout.sourceBindingDigest !== root.sourceBinding.bindingDigest || join.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || join.epoch > root.epoch || fanout.graphRevision > frame.graphRevision || frame.graphRevision > barrier.graphRevision || join.graphRevision !== barrier.graphRevision
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || barrier.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !same(fanout.budgetRef, root.budgetAuthorityRef) || !same(join.budgetRef, fanout.budgetRef)
        || !same(frame.parentBudgetRef, fanout.budgetRef) || !same(barrier.parentBudgetRef, fanout.budgetRef)
        || frame.maxConcurrency !== Math.min(fanoutNode.policy.maxConcurrency, root.limits.maxConcurrency)
        || frame.failurePolicy !== fanoutNode.policy.failurePolicy || barrier.schemaVersion !== 1 || barrier.joinId !== joinId
        || barrier.runId !== root.runId || barrier.nodeAttemptId !== join.attemptId || barrier.epoch !== join.epoch
        || !same(barrier.fanoutFrameRef, { receiptId: frame.receiptId, integrity: hash(frame) })
        || barrier.policy !== joinNode.policy.strategy || barrier.quorum !== joinNode.policy.quorum
        || barrier.deadlineAt !== Math.min(barrier.createdAt + joinNode.policy.deadlineMs, root.progress.deadlineAt)
        || barrier.frozenSeq <= frame.decisionSeq || barrier.frozenSeq >= receipt.decisionSeq
        || receipt.schemaVersion !== 1 || receipt.joinId !== joinId || receipt.runId !== root.runId || receipt.nodeAttemptId !== join.attemptId
        || receipt.epoch !== barrier.epoch || receipt.graphRevision !== barrier.graphRevision || receipt.policy !== barrier.policy
        || receipt.quorum !== barrier.quorum || receipt.deadlineAt !== barrier.deadlineAt || receipt.barrierDigest !== barrierRow.integrity
        || receipt.cutoffSeq + 1 !== receipt.decisionSeq || receipt.decisionSeq !== settlement.decisionSeq || receipt.decisionSeq > root.eventSeq
        || settlement.outcome !== receipt.outcome || !same(receipt.acceptedResultRefs, join.resultRefs) || settlement.effectReceiptRefs.length || join.effectRefs.length) invalid();
    const transferIn = [], terminalIds = [], scopeAttempts = [], providerEffects = [], graphResults = [];
    const branchAttempts = new Map(), assigned = new Set();
    for (const branch of frame.branches) {
        const members = [];
        for (const id of root.attemptRefs) {
            if (assigned.has(id)) continue;
            const attempt = await attemptAt(id);
            if (attempt.epoch !== frame.epoch || !branch.scopeNodeIds.includes(attempt.nodeId)
                || !(await readFanoutMembership(tx, handle, root, frame, id))) continue;
            members.push(attempt); assigned.add(id);
        }
        branchAttempts.set(branch, members);
    }
    const resultFacts = await readGraphNodeResults(tx, handle, root,
        [...branchAttempts.values()].flatMap(members => members.flatMap(attempt => attempt.resultRefs.map(ref => ref.resultId))));
    const entries = new Set();
    for (const branch of frame.branches) {
        const entry = await attemptAt(branch.entryAttemptId);
        if (entries.has(entry.nodeId) || !branch.scopeNodeIds.includes(entry.nodeId) || entry.graphRevision !== frame.graphRevision || entry.epoch !== frame.epoch) invalid();
        entries.add(entry.nodeId);
        const scope = { nodes: frozen.graph.nodes, edges: frozen.graph.edges.filter(edge => branch.scopeNodeIds.includes(edge.from.nodeId) && branch.scopeNodeIds.includes(edge.to.nodeId)) };
        if (branch.scopeNodeIds.some(id => !frozen.graph.nodes.some(node => node.nodeId === id && node.nodeId !== fanout.nodeId && node.kind !== 'output'))) invalid();
        const edges = frozen.graph.edges.filter(edge => edge.from.nodeId === fanout.nodeId && edge.to.nodeId === entry.nodeId);
        if (!edges.length || edges.some(edge => !['always', 'success'].includes(edge.condition))) invalid();
        transferIn.push(...edges.map(edge => ({ edgeId: edge.edgeId, producerAttemptId: fanout.attemptId, nodeAttemptId: entry.attemptId })));
        for (const id of branch.memberAttemptIds) {
            const member = await attemptAt(id);
            if (terminalIds.includes(id) || !branch.scopeNodeIds.includes(member.nodeId) || !graphReachable(scope, entry.nodeId, member.nodeId)
                || member.graphRevision < frame.graphRevision || member.graphRevision > root.graphRevision || member.epoch !== frame.epoch) invalid();
            if (joinedGraph.graph.edges.some(edge => edge.from.nodeId === member.nodeId && edge.to.nodeId === join.nodeId)) terminalIds.push(id);
        }
        for (const attempt of branchAttempts.get(branch)) {
            const completed = SETTLED_ATTEMPT_STATUSES.includes(attempt.status) ? await readAttemptSettlement(tx, handle, root, attempt) : null;
            if (!completed || completed.decisionSeq <= frame.decisionSeq) invalid();
            const graphSnapshot = await snapshotAt(attempt.graphRevision);
            if (graphSnapshot.graphRevision !== frame.graphRevision) assertFrozenScopeGraph(frame, frozen.graph, graphSnapshot.graph);
            const reservation = await reservationFact(tx, handle, root, frame, attempt, graphSnapshot);
            if (attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || (attempt.inputState === 'reserved' ? !reservation || attempt.status !== 'cancelled' || attempt.budgetRef !== null
                    || attempt.effectRefs.length || attempt.resultRefs.length || attempt.startedAt !== null || completed.effectReceiptRefs.length
                    : !same(attempt.budgetRef, fanout.budgetRef))) invalid();
            const results = [];
            for (const ref of attempt.resultRefs) {
                const fact = resultFacts.get(ref.resultId);
                if (!fact || fact.producer.attemptId !== attempt.attemptId || !same(fact.receipt.resultRef, ref)) invalid();
                results.push(fact); graphResults.push(fact);
            }
            await verifyMemberInput(tx, handle, root, attempt, { frame, barrier, branch, settlement: completed, results, reservation,
                graphSnapshot, plan });
            await verifyMemberCost(tx, handle, root, attempt, { frame, barrier, branch, settlement: completed, results, reservation });
            for (const effectId of attempt.effectRefs) {
                const effect = (await readEffect(tx, handle, root, effectId)).doc;
                if (effect.nodeAttemptId !== attempt.attemptId) invalid();
                if (effect.capability === 'generation.send') providerEffects.push(effectId);
            }
            scopeAttempts.push({ attempt, completed, results });
        }
        for (const id of [branch.entryAttemptId, ...branch.memberAttemptIds]) if (!scopeAttempts.some(item => item.attempt.attemptId === id)) invalid();
    }
    if (frozen.graph.edges.some(edge => edge.from.nodeId === fanout.nodeId && !entries.has(edge.to.nodeId))
        || !same(terminalIds.toSorted(), barrier.memberAttemptIds) || !same(receipt.memberAttemptIds, barrier.memberAttemptIds)
        || !barrier.memberAttemptIds.length || new Set(barrier.memberAttemptIds).size !== barrier.memberAttemptIds.length
        || new Set(barrier.memberEdges.map(mapping => mapping.nodeAttemptId)).size !== barrier.memberAttemptIds.length) invalid();
    const members = barrier.memberAttemptIds.map(id => {
        const item = scopeAttempts.find(item => item.attempt.attemptId === id);
        const atCutoff = item.completed.decisionSeq <= receipt.cutoffSeq ? item.completed : null;
        return { ...item, receipt: atCutoff, valid: !!(atCutoff && ['completed', 'partial'].includes(atCutoff.outcome)
            && item.results.length && atCutoff.createdAt <= barrier.deadlineAt) };
    });
    const decision = decideJoinOutcome({ policy: barrier.policy, quorum: barrier.quorum, allowPartial: joinedGraph.graph.outputContract.allowPartial,
        deadlineAt: barrier.deadlineAt, now: settlement.createdAt, members });
    const refs = [...new Map(decision.selected.flatMap(item => item.receipt.resultRefs).map(ref => [hash(ref), ref])).values()];
    const selected = new Set(decision.selected.map(item => item.attempt.attemptId));
    const excluded = members.filter(item => !selected.has(item.attempt.attemptId)).map(item => ({ nodeAttemptId: item.attempt.attemptId,
        reasonCode: !item.receipt ? 'unsettled_at_cutoff' : item.receipt.createdAt > barrier.deadlineAt ? 'after_deadline'
            : !item.valid && ['completed', 'partial'].includes(item.receipt.outcome) ? 'result_unavailable' : item.receipt.outcome === 'completed' ? 'not_selected' : item.receipt.outcome }));
    const receiptRefs = members.filter(item => item.receipt).sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq
        || a.attempt.attemptId.localeCompare(b.attempt.attemptId)).map(item => item.receipt.receiptId);
    if (decision.outcome === null || receipt.outcome !== decision.outcome || settlement.reasonCode !== decision.reason || !same(receipt.acceptedResultRefs, refs)
        || !same(receipt.excluded, excluded) || !same(receipt.memberReceiptRefs, receiptRefs)
        || !same(receipt.reasons, decision.reason === null ? [] : [decision.reason])) invalid();
    for (const item of scopeAttempts.filter(item => item.completed.outcome === 'cancelled' && !item.attempt.effectRefs.length)) {
        let valid = item.completed.reasonCode === 'join_member_excluded' && item.completed.decisionSeq > receipt.decisionSeq
            && isFanoutBranchExcluded(frame, barrier, receipt, item.attempt)
            && await cancelFact(tx, handle, root, frame, joinId, item, null);
        if (item.completed.reasonCode === 'fanout_fail_fast' && frame.failurePolicy === 'fail_fast') {
            for (const failed of scopeAttempts.filter(other => other.completed.outcome === 'failed' && other.completed.decisionSeq < item.completed.decisionSeq)) {
                if (await cancelFact(tx, handle, root, frame, null, item, failed.attempt.attemptId)) { valid = true; break; }
            }
        }
        if (!valid) invalid();
    }
    const fanoutSettlement = await readAttemptSettlement(tx, handle, root, fanout);
    if (fanout.status !== receipt.outcome || fanout.effectRefs.length || fanout.resultRefs.length || fanoutSettlement.effectReceiptRefs.length
        || fanoutSettlement.decisionSeq <= receipt.decisionSeq) invalid();
    for (const attempt of [fanout, join]) {
        if (attempt.inputDigest !== hash(attempt.inputRefs)) invalid();
        await verifyControlInput(tx, handle, root, attempt, { frame, barrier, settlement: attempt === join ? settlement : fanoutSettlement });
    }
    const transferOut = [];
    for (const mapping of barrier.memberEdges) {
        assertObject(mapping, ['nodeAttemptId', 'edgeIds'], 'Join member edges');
        const member = members.find(item => item.attempt.attemptId === mapping.nodeAttemptId);
        const edges = joinedGraph.graph.edges.filter(edge => edge.from.nodeId === member?.attempt.nodeId && edge.to.nodeId === join.nodeId);
        if (!member || !edges.length || !same(mapping.edgeIds, edges.map(edge => edge.edgeId).sort())) invalid();
        transferOut.push(...mapping.edgeIds.map(edgeId => ({ edgeId, producerAttemptId: mapping.nodeAttemptId, nodeAttemptId: join.attemptId })));
    }
    await commandFact(tx, handle, root, 'fanout.freeze', frame.receiptId, { fanoutAttemptId: fanout.attemptId, branches: frame.branches }, 'fanoutFrame', frame);
    await commandFact(tx, handle, root, 'join.freeze', joinId, { fanoutAttemptId: fanout.attemptId, nodeAttemptId: join.attemptId, memberAttemptIds: barrier.memberAttemptIds }, 'joinBarrier', barrier);
    const settled = await commandFact(tx, handle, root, 'join.settle', joinId, { joinId }, 'joinReceipt', receipt);
    const settlementGraph = await snapshotAt(settled.outcome.versions.graphRevision);
    await assertEdgeHistory(tx, handle, root);
    await edgeFacts(tx, handle, root, frozen.graph, transferIn, frame.edgeAdmissionRefs, frame.decisionSeq, frame.graphRevision);
    await edgeFacts(tx, handle, root, settlementGraph.graph, transferOut, receipt.edgeAdmissionRefs, receipt.decisionSeq, settlementGraph.graphRevision);
    const controlRef = graphJoinControlRef(root.runId, join.attemptId, settlement.receiptId);
    if (recipient) {
        await assertAttemptConsumable(tx, handle, root, join);
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!same(actual, recipient) || root.status !== 'running' || root.cancelRequested || join.status === 'failed'
            || join.epoch !== root.epoch || recipient.epoch !== root.epoch || !['running', 'waiting_effect'].includes(recipient.status)
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !recipient.inputRefs.some(ref => same(ref, controlRef))
            || !root.graph.edges.some(edge => edge.from.nodeId === join.nodeId && edge.to.nodeId === recipient.nodeId)) invalid();
    }
    return { producer: join, settlement, receipt: { ...receipt, receiptId: settlement.receiptId }, joinReceipt: receipt, fanout, frame, barrier,
        members: decision.selected.flatMap(item => item.results), allMembers: members, scopeAttempts, graphResults,
        providerEffects: [...new Set(providerEffects)], controlRef };
}
