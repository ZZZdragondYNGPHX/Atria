import { ConflictError } from '../../storage/errors.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, equalNativeDocuments } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { controlCommandId, controlRecordKey, graphReachable, holdsConcurrencySlot, readAttempt } from './controller-common.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';
import { admitGraphEdges } from './graph-costs.js';
import { joinIdForAttempt } from './join-controller.js';

export const fanoutFrameId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'fanout_frame', runId, attemptId }).slice(0, 32);
const membershipId = (runId, frameId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'fanout_membership', runId, frameId, attemptId }).slice(0, 32);

/** Pure policy over an already validated Frame/Barrier/Join. Shared scope
 * stays live whenever any served terminal was selected by the original Join. */
export function isFanoutBranchExcluded(frame, barrier, join, attempt) {
    if (!Array.isArray(frame?.branches) || !Array.isArray(barrier?.memberAttemptIds) || !Array.isArray(join?.excluded)) return false;
    const excluded = new Set(join.excluded.map(item => item.nodeAttemptId));
    const branches = frame.branches.filter(branch => branch.scopeNodeIds.includes(attempt.nodeId)
        || branch.entryAttemptId === attempt.attemptId || branch.memberAttemptIds.includes(attempt.attemptId));
    return branches.length > 0 && branches.every(branch => {
        const terminals = branch.memberAttemptIds.filter(id => barrier.memberAttemptIds.includes(id));
        return terminals.length > 0 && terminals.every(id => excluded.has(id));
    });
}

export async function readFanoutMembership(tx, handle, root, frame, attemptId) {
    const receiptId = membershipId(root.runId, frame.receiptId, attemptId);
    const record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!record) return null;
    const row = record.doc;
    assertObject(row, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'frameId', 'nodeAttemptId', 'epoch', 'sourceBindingDigest', 'decisionSeq', 'createdAt'], 'FanoutMembership');
    if (row.schemaVersion !== 1 || row.receiptKind !== 'fanout_membership' || row.receiptId !== receiptId || row.runId !== root.runId || row.frameId !== frame.receiptId
        || row.nodeAttemptId !== attemptId || row.epoch !== frame.epoch || row.sourceBindingDigest !== frame.sourceBindingDigest) throw new TypeError('Invalid FanoutMembership');
    assertCounter(row.decisionSeq, 'decisionSeq', 1); assertCounter(row.createdAt, 'createdAt');
    if (row.decisionSeq > root.eventSeq + 1) throw new TypeError('FanoutMembership is ahead of Root');
    return row;
}

/** A branch may redo work before its frozen terminal is dispatched. This
 * proves only original Frame/Barrier membership; domain and bank admission
 * remain with Review's original producer. Historical readers supply the
 * original Review decision sequence, never reopen an already closed Join. */
export async function readFanoutReviewScope(tx, handle, root, reviewer, targets, { decisionSeq = root.eventSeq + 1, rerun = true } = {}) {
    return readFanoutLocalScope(tx, handle, root, reviewer, targets, { decisionSeq, rerun, kind: 'review' });
}

/** Published return edges select the target; this read grants neither a loop
 * visit nor a Model send. The original domain proves the paid Planner request. */
export async function readFanoutReplanScope(tx, handle, root, planner, { decisionSeq = root.eventSeq + 1, targetNodeId = null } = {}) {
    const loops = root.graph.edges.filter(edge => edge.loopBack && edge.from.nodeId === planner.nodeId);
    if (!loops.length || new Set(loops.map(edge => edge.to.nodeId)).size !== 1
        || targetNodeId !== null && loops[0].to.nodeId !== targetNodeId) return null;
    const target = root.graph.nodes.find(node => node.nodeId === loops[0].to.nodeId);
    if (!target || !['agent', 'planner'].includes(target.kind)) return null;
    const scope = await readFanoutLocalScope(tx, handle, root, planner, [target], { decisionSeq, rerun: true, kind: 'planner' });
    if (!scope || !loops.every(edge => scope.branch.scopeNodeIds.includes(edge.to.nodeId))) return null;
    const forward = { ...root.graph, edges: root.graph.edges.filter(edge => !edge.loopBack) };
    return { ...scope, target, loops,
        affectedNodeIds: scope.branch.scopeNodeIds.filter(id => graphReachable(forward, target.nodeId, id)) };
}

async function readFanoutLocalScope(tx, handle, root, reviewer, targets, { decisionSeq, rerun, kind }) {
    const fanoutAttemptId = reviewer.inputRefs?.[0]?.fanoutAttemptId;
    if (!fanoutAttemptId || !targets?.length) return null;
    assertCounter(decisionSeq, 'Review scope sequence', 1);
    const actual = (await readAttempt(tx, handle, root, reviewer.attemptId)).doc;
    const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
    if (!equalNativeDocuments(actual, reviewer) || !frame || frame.epoch !== reviewer.epoch || decisionSeq > root.eventSeq + 1
        || frame.decisionSeq >= decisionSeq || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equalNativeDocuments(frame.parentBudgetRef, root.budgetAuthorityRef)
        || root.graph.nodes.find(node => node.nodeId === reviewer.nodeId)?.kind !== kind) return null;
    const membership = await readFanoutMembership(tx, handle, root, frame, reviewer.attemptId);
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(reviewer.nodeId));
    const causalGraph = kind === 'planner' ? { ...root.graph, edges: root.graph.edges.filter(edge => !edge.loopBack) } : root.graph;
    if (!membership || membership.decisionSeq >= decisionSeq || !branch) return null;
    for (const target of targets) {
        if (!branch.scopeNodeIds.includes(target.nodeId) || kind === 'review' && target.attemptId === reviewer.attemptId
            || !graphReachable(causalGraph, target.nodeId, reviewer.nodeId)
            || target.attemptId && !(await readFanoutMembership(tx, handle, root, frame, target.attemptId))) return null;
    }
    for (const id of root.attemptRefs) {
        const join = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === join.nodeId)?.kind !== 'join' || join.inputRefs?.[0]?.fanoutAttemptId !== fanoutAttemptId) continue;
        const barrier = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', 'barrier:' + joinIdForAttempt(id))))?.doc;
        if (!barrier || barrier.frozenSeq >= decisionSeq || barrier.epoch !== frame.epoch
            || barrier.fanoutFrameRef?.receiptId !== frame.receiptId || barrier.fanoutFrameRef.integrity !== hashNativeDocument(frame)
            || rerun && targets.some(target => barrier.memberAttemptIds.includes(target.attemptId))) return null;
        for (const id of barrier.memberAttemptIds) {
            const terminal = (await readAttempt(tx, handle, root, id)).doc;
            if (rerun && targets.some(target => target.nodeId === terminal.nodeId)) return null;
            if (rerun && branch.scopeNodeIds.includes(terminal.nodeId) && targets.some(target => graphReachable(causalGraph, target.nodeId, terminal.nodeId))
                && !await terminalPreparedAfter(tx, handle, root, terminal, decisionSeq)) return null;
        }
        if (SETTLED_ATTEMPT_STATUSES.includes(join.status)) {
            if ((await readAttemptSettlement(tx, handle, root, join)).decisionSeq <= decisionSeq) return null;
        } else if (join.status !== 'pending' || join.effectRefs.length || join.resultRefs.length || join.startedAt !== null) return null;
        return { frame, branch, barrier, join, fanout: (await readAttempt(tx, handle, root, fanoutAttemptId)).doc };
    }
    return null;
}

async function terminalPreparedAfter(tx, handle, root, terminal, decisionSeq) {
    if (terminal.status === 'reserved' && terminal.inputState === 'reserved' && terminal.startedAt === null
        && !terminal.effectRefs.length && !terminal.resultRefs.length) return true;
    if (decisionSeq > root.eventSeq || !terminal.reservationRef) return false;
    const input = terminal.inputRefs?.[0], bindings = input?.graphBindings ?? input?.fanoutGraphBindings ?? input?.controlGraph?.bindings;
    if (!Array.isArray(bindings) || !bindings.length) return false;
    const ordered = [...bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const receiptId = 'oreceipt_' + hashNativeDocument({ runId: root.runId, bindings: ordered, reservedAttemptId: terminal.attemptId }).slice(0, 32);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    return !!receipt && receipt.receiptKind === 'graph_transition' && receipt.nodeAttemptId === terminal.attemptId
        && receipt.runId === root.runId && receipt.epoch === terminal.epoch && receipt.inputDigest === terminal.inputDigest
        && receipt.decisionSeq > decisionSeq && receipt.decisionSeq <= root.eventSeq && equalNativeDocuments(receipt.bindings, ordered);
}

async function attachMembership({ tx, handle, root, frame, attempt, now }) {
    if (await readFanoutMembership(tx, handle, root, frame, attempt.attemptId)) return;
    const receiptId = membershipId(root.runId, frame.receiptId, attempt.attemptId);
    await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), { schemaVersion: 1, receiptKind: 'fanout_membership', receiptId,
        runId: root.runId, frameId: frame.receiptId, nodeAttemptId: attempt.attemptId, epoch: frame.epoch, sourceBindingDigest: frame.sourceBindingDigest,
        decisionSeq: root.eventSeq + 1, createdAt: now });
}

async function currentFrames(tx, handle, root) {
    const frames = [];
    for (const id of root.attemptRefs) {
        const { doc: producer } = await readAttempt(tx, handle, root, id);
        if (root.graph.nodes.find(node => node.nodeId === producer.nodeId).kind !== 'fanout') continue;
        const frame = await readFanoutFrame(tx, handle, root, id);
        if (!frame || frame.epoch !== root.epoch) continue;
        if (frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || frame.graphRevision > root.graphRevision || frame.decisionSeq > root.eventSeq) throw new TypeError('FanoutFrame source/revision mismatch');
        frames.push(frame);
    }
    return frames;
}

export async function inheritFanoutMembership({ tx, handle, root, producers, targets, now }) {
    for (const frame of await currentFrames(tx, handle, root)) {
        let inherited = false;
        for (const producer of producers) if (await readFanoutMembership(tx, handle, root, frame, producer.attemptId)) inherited = true;
        if (!inherited) continue;
        const scope = new Set(frame.branches.flatMap(branch => branch.scopeNodeIds));
        for (const target of targets) if (scope.has(target.nodeId)) await attachMembership({ tx, handle, root, frame, attempt: target, now });
    }
}

export async function readFanoutFrame(tx, handle, root, fanoutAttemptId) {
    const record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', fanoutFrameId(root.runId, fanoutAttemptId)));
    if (!record) return null;
    const frame = record.doc;
    assertObject(frame, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'fanoutAttemptId', 'epoch', 'graphRevision', 'sourceBindingDigest', 'parentBudgetRef', 'branches', 'maxConcurrency', 'failurePolicy', 'edgeAdmissionRefs', 'decisionSeq', 'createdAt'], 'FanoutFrame');
    if (frame.schemaVersion !== 1 || frame.receiptKind !== 'fanout_frame' || frame.receiptId !== fanoutFrameId(root.runId, fanoutAttemptId)
        || frame.runId !== root.runId || frame.fanoutAttemptId !== fanoutAttemptId || !Array.isArray(frame.branches) || !frame.branches.length) throw new TypeError('Invalid FanoutFrame identity');
    for (const field of ['epoch', 'graphRevision', 'createdAt']) assertCounter(frame[field], field);
    assertCounter(frame.decisionSeq, 'decisionSeq', 1); assertCounter(frame.maxConcurrency, 'maxConcurrency', 1);
    if (!['continue', 'fail_fast'].includes(frame.failurePolicy) || !Array.isArray(frame.edgeAdmissionRefs)) throw new TypeError('Invalid FanoutFrame policy');
    for (const branch of frame.branches) {
        assertObject(branch, ['entryAttemptId', 'memberAttemptIds', 'scopeNodeIds'], 'FanoutBranch');
        assertNativeId(branch.entryAttemptId, 'orchestrationAttempt');
        for (const field of ['memberAttemptIds', 'scopeNodeIds']) {
            if (!Array.isArray(branch[field]) || !branch[field].length || new Set(branch[field]).size !== branch[field].length) throw new TypeError('Invalid persisted Fanout scope');
            for (const id of branch[field]) assertNativeId(id, field === 'scopeNodeIds' ? 'orchestrationNode' : 'orchestrationAttempt');
        }
    }
    return frame;
}

// Called inside the same Run CAS as activation, before original Scheduler
// authorization. These are logical ceilings, never a queue or paid permit.
export async function assertFanoutAdmission({ tx, handle, root, attempt, reserveSlot = true }) {
    for (const frame of await currentFrames(tx, handle, root)) {
        if (!(await readFanoutMembership(tx, handle, root, frame, attempt.attemptId))) continue;
        let active = 0;
        for (const ref of root.attemptRefs) {
            const { doc: member } = await readAttempt(tx, handle, root, ref);
            if (member.epoch !== frame.epoch || !(await readFanoutMembership(tx, handle, root, frame, ref))) continue;
            if (holdsConcurrencySlot(root, member)) active++;
            if (frame.failurePolicy === 'fail_fast' && SETTLED_ATTEMPT_STATUSES.includes(member.status) && member.status !== 'completed') {
                await readAttemptSettlement(tx, handle, root, member);
                throw new ConflictError('native_orchestration_fanout_fail_fast');
            }
        }
        if (reserveSlot && holdsConcurrencySlot(root, { ...attempt, status: 'running' }) && active >= frame.maxConcurrency) throw new ConflictError('native_orchestration_fanout_concurrency_exhausted');
    }
}

/** Freeze complete explicit groups; actual resource permits remain with the
 * original NativeTaskScheduler and budget/source authority supplied by Port. */
export class FanoutController {
    constructor({ runs, authorizeGroup }) {
        if (!runs || typeof authorizeGroup !== 'function') throw new TypeError('FanoutController requires original scope/scheduler/budget authority');
        Object.assign(this, { runs, authorizeGroup });
    }

    async freeze(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'fanoutAttemptId', 'branches'], 'freezeFanout');
        const { fanoutAttemptId, branches, ...guard } = cloneNativeDocument(input);
        assertNativeId(fanoutAttemptId, 'orchestrationAttempt');
        if (!Array.isArray(branches) || !branches.length) throw new TypeError('Fanout requires branches');
        for (const branch of branches) {
            assertObject(branch, ['entryAttemptId', 'memberAttemptIds', 'scopeNodeIds'], 'FanoutBranch');
            assertNativeId(branch.entryAttemptId, 'orchestrationAttempt');
            for (const field of ['memberAttemptIds', 'scopeNodeIds']) {
                if (!Array.isArray(branch[field]) || !branch[field].length || new Set(branch[field]).size !== branch[field].length) throw new TypeError('Fanout requires unique scope/members');
                for (const id of branch[field]) assertNativeId(id, field === 'scopeNodeIds' ? 'orchestrationNode' : 'orchestrationAttempt');
                branch[field].sort();
            }
        }
        branches.sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId));
        const receiptId = fanoutFrameId(guard.runId, fanoutAttemptId);
        return this.runs.control(handle, controlCommandId('fanout.freeze', receiptId), { ...guard, operation: 'fanout.freeze', detail: { fanoutAttemptId, branches } }, async ({ tx, root, now }) => {
            const { doc: producer } = await readAttempt(tx, handle, root, fanoutAttemptId);
            const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
            if (root.cancelRequested || root.status !== 'running' || node.kind !== 'fanout' || producer.status !== 'running' || producer.epoch !== root.epoch
                || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || producer.effectRefs.length || root.nodeControl[node.nodeId].disposition !== 'eligible') throw new ConflictError('native_orchestration_fanout_not_admitted');
            if (now >= root.progress.deadlineAt || root.progress.steps >= root.limits.maxSteps) throw new ConflictError('native_orchestration_limit_exhausted');
            const entries = new Set(), members = new Set(), transfers = [], resolved = [];
            for (const branch of branches) {
                const { doc: entry } = await readAttempt(tx, handle, root, branch.entryAttemptId);
                if (entries.has(entry.nodeId) || !branch.scopeNodeIds.includes(entry.nodeId)) throw new TypeError('Fanout entry scope/identity mismatch');
                entries.add(entry.nodeId);
                for (const nodeId of branch.scopeNodeIds) {
                    const scoped = root.graph.nodes.find(item => item.nodeId === nodeId);
                    if (!scoped || nodeId === node.nodeId || scoped.kind === 'output') throw new TypeError('Invalid Fanout branch scope');
                }
                const graph = { nodes: root.graph.nodes, edges: root.graph.edges.filter(edge => branch.scopeNodeIds.includes(edge.from.nodeId) && branch.scopeNodeIds.includes(edge.to.nodeId)) };
                const terminalMembers = [];
                for (const id of branch.memberAttemptIds) {
                    if (members.has(id)) throw new TypeError('Duplicate Fanout final member');
                    members.add(id);
                    const { doc: member } = await readAttempt(tx, handle, root, id);
                    if (!branch.scopeNodeIds.includes(member.nodeId) || !graphReachable(graph, entry.nodeId, member.nodeId)) throw new TypeError('Fanout final member is outside branch');
                    terminalMembers.push(member);
                }
                for (const member of [entry, ...terminalMembers]) {
                    if (!['pending', 'reserved'].includes(member.status) || member.effectRefs.length || member.epoch !== root.epoch || member.graphRevision !== root.graphRevision
                        || member.sourceBindingDigest !== root.sourceBinding.bindingDigest || root.nodeControl[member.nodeId].disposition !== 'eligible'
                        || member.inputState === 'reserved' && member.reservationRef.producerAttemptId !== fanoutAttemptId) throw new ConflictError('native_orchestration_fanout_invalid_membership');
                }
                if (entry.inputState !== 'prepared') throw new TypeError('Fanout entry requires real prepared inputs');
                const edges = root.graph.edges.filter(edge => edge.from.nodeId === node.nodeId && edge.to.nodeId === entry.nodeId);
                if (!edges.length || edges.some(edge => !['always', 'success'].includes(edge.condition))) throw new TypeError('Fanout requires admitted outgoing edges');
                for (const edge of edges) transfers.push({ edgeId: edge.edgeId, producerAttemptId: fanoutAttemptId, nodeAttemptId: entry.attemptId });
                resolved.push({ entry, members: terminalMembers, scopeNodeIds: branch.scopeNodeIds });
            }
            if (root.graph.edges.some(edge => edge.from.nodeId === node.nodeId && !entries.has(edge.to.nodeId))) throw new TypeError('Fanout group omits an outgoing branch');
            await this.authorizeGroup({ handle, tx, root, producer, branches: resolved });
            const edgeAdmissionRefs = await admitGraphEdges({ tx, handle, root, transfers, now });
            const frame = { schemaVersion: 1, receiptKind: 'fanout_frame', receiptId, runId: root.runId, fanoutAttemptId, epoch: root.epoch, graphRevision: root.graphRevision,
                sourceBindingDigest: root.sourceBinding.bindingDigest, parentBudgetRef: producer.budgetRef, branches, maxConcurrency: Math.min(node.policy.maxConcurrency, root.limits.maxConcurrency),
                failurePolicy: node.policy.failurePolicy, edgeAdmissionRefs, decisionSeq: root.eventSeq + 1, createdAt: now };
            const targets = [...new Map(resolved.flatMap(branch => [branch.entry, ...branch.members]).map(attempt => [attempt.attemptId, attempt])).values()];
            await inheritFanoutMembership({ tx, handle, root, producers: [producer], targets, now });
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), frame);
            for (const attempt of targets) await attachMembership({ tx, handle, root, frame, attempt, now });
            root.progress.steps++;
            return { root, eventType: 'fanout_group_frozen', reasonCode: null, outcome: { fanoutFrame: frame } };
        });
    }
}
