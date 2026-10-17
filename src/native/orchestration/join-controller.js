import { ConflictError } from '../../storage/errors.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { controlCommandId, controlRecordKey, graphReachable, readAttempt, assertAttemptCurrent, assertAttemptConsumable } from './controller-common.js';
import { readAttemptSettlement, writeAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';
import { admitGraphEdges } from './graph-costs.js';
import { readFanoutFrame } from './fanout-controller.js';

export const joinIdForAttempt = attemptId => 'ojoin_' + hashNativeDocument({ nodeAttemptId: attemptId }).slice(0, 32);
const barrierKey = (handle, runId, joinId) => controlRecordKey(handle, runId, 'join', 'barrier:' + joinId);
const compare = (a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq || a.attempt.attemptId.localeCompare(b.attempt.attemptId);

function assertLive(root) {
    if (root.cancelRequested || !['admitted', 'running', 'waiting_approval'].includes(root.status)) throw new ConflictError('native_orchestration_join_not_admitted');
    if (root.progress.steps >= root.limits.maxSteps) throw new ConflictError('native_orchestration_limit_exhausted');
}

/** Pure Host barriers over frozen Attempt identities and durable receipts. */
export class JoinController {
    constructor({ runs, authorizeMembership, verifyResults }) {
        if (!runs || typeof authorizeMembership !== 'function' || typeof verifyResults !== 'function') throw new TypeError('JoinController requires original membership/source/audience authority');
        Object.assign(this, { runs, authorizeMembership, verifyResults });
    }

    async freeze(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'fanoutAttemptId', 'nodeAttemptId', 'memberAttemptIds'], 'freezeJoin');
        const { fanoutAttemptId, nodeAttemptId, memberAttemptIds, ...guard } = cloneNativeDocument(input);
        assertNativeId(fanoutAttemptId, 'orchestrationAttempt'); assertNativeId(nodeAttemptId, 'orchestrationAttempt');
        if (!Array.isArray(memberAttemptIds) || !memberAttemptIds.length || new Set(memberAttemptIds).size !== memberAttemptIds.length) throw new TypeError('Join requires unique nonempty frozen members');
        for (const id of memberAttemptIds) assertNativeId(id, 'orchestrationAttempt');
        memberAttemptIds.sort();
        const joinId = joinIdForAttempt(nodeAttemptId);
        return this.runs.control(handle, controlCommandId('join.freeze', joinId), { ...guard, operation: 'join.freeze', detail: { fanoutAttemptId, nodeAttemptId, memberAttemptIds } }, async ({ tx, root, now }) => {
            assertLive(root);
            if (now >= root.progress.deadlineAt) throw new ConflictError('native_orchestration_limit_exhausted');
            const { doc: fanout } = await readAttempt(tx, handle, root, fanoutAttemptId);
            const { doc: join } = await readAttempt(tx, handle, root, nodeAttemptId);
            const fanoutNode = root.graph.nodes.find(node => node.nodeId === fanout.nodeId), joinNode = root.graph.nodes.find(node => node.nodeId === join.nodeId);
            if (fanoutNode.kind !== 'fanout' || fanout.status !== 'running' || joinNode.kind !== 'join' || join.status !== 'pending'
                || fanout.epoch !== root.epoch || join.epoch !== root.epoch || join.graphRevision !== root.graphRevision
                || fanout.sourceBindingDigest !== root.sourceBinding.bindingDigest || join.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || root.nodeControl[join.nodeId].disposition !== 'eligible') throw new ConflictError('native_orchestration_join_invalid_membership');
            if (joinNode.policy.quorum > memberAttemptIds.length || (joinNode.policy.strategy === 'deadline' && !root.graph.outputContract.allowPartial)) throw new TypeError('Join quorum/partial policy is not satisfiable');
            const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
            if (frame) {
                if (frame.epoch !== root.epoch || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest) throw new ConflictError('native_orchestration_join_invalid_membership');
                const expected = [];
                for (const id of frame.branches.flatMap(branch => branch.memberAttemptIds)) {
                    const { doc } = await readAttempt(tx, handle, root, id);
                    if (root.graph.edges.some(edge => edge.from.nodeId === doc.nodeId && edge.to.nodeId === join.nodeId)) expected.push(id);
                }
                if (hashNativeDocument(expected.sort()) !== hashNativeDocument(memberAttemptIds)) throw new ConflictError('native_orchestration_join_invalid_membership');
            }
            const members = [], memberEdges = [];
            const nodeIds = new Set();
            for (const attemptId of memberAttemptIds) {
                const { doc: member } = await readAttempt(tx, handle, root, attemptId);
                if (attemptId === fanoutAttemptId || attemptId === nodeAttemptId || nodeIds.has(member.nodeId) || !['pending', 'reserved'].includes(member.status) || member.effectRefs.length
                    || member.epoch !== root.epoch || member.graphRevision !== root.graphRevision || member.sourceBindingDigest !== root.sourceBinding.bindingDigest
                    || root.nodeControl[member.nodeId].disposition !== 'eligible'
                    || member.inputState === 'reserved' && member.reservationRef.producerAttemptId !== fanoutAttemptId
                    || !graphReachable(root.graph, fanout.nodeId, member.nodeId) || !graphReachable(root.graph, member.nodeId, join.nodeId)) throw new ConflictError('native_orchestration_join_invalid_membership');
                const edges = root.graph.edges.filter(edge => edge.from.nodeId === member.nodeId && edge.to.nodeId === join.nodeId);
                if (!edges.length) throw new ConflictError('native_orchestration_join_requires_direct_member');
                memberEdges.push({ nodeAttemptId: attemptId, edgeIds: edges.map(edge => edge.edgeId).sort() });
                nodeIds.add(member.nodeId); members.push(member);
            }
            // The original scheduler/bank Port verifies this invocation's
            // complete fan-out group and parent reservation, without charging.
            await this.authorizeMembership({ handle, tx, root, fanout, join, members });
            const barrier = { schemaVersion: 1, joinId, runId: root.runId, fanoutAttemptId, nodeAttemptId, epoch: root.epoch, graphRevision: root.graphRevision,
                memberAttemptIds, memberEdges, fanoutFrameRef: frame ? { receiptId: frame.receiptId, integrity: hashNativeDocument(frame) } : null,
                sourceBindingDigest: root.sourceBinding.bindingDigest, parentBudgetRef: fanout.budgetRef,
                policy: joinNode.policy.strategy, quorum: joinNode.policy.quorum, deadlineAt: Math.min(now + joinNode.policy.deadlineMs, root.progress.deadlineAt),
                frozenSeq: root.eventSeq + 1, createdAt: now };
            await putImmutable(tx, barrierKey(handle, root.runId, joinId), barrier);
            root.progress.steps++;
            return { root, eventType: 'join_membership_frozen', reasonCode: null, outcome: { joinBarrier: barrier } };
        });
    }

    async settle(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'joinId'], 'settleJoin');
        const { joinId, ...guard } = cloneNativeDocument(input);
        assertNativeId(joinId, 'orchestrationJoin');
        return this.runs.control(handle, controlCommandId('join.settle', joinId), { ...guard, operation: 'join.settle', detail: { joinId } }, async ({ tx, root, now }) => {
            assertLive(root);
            const stored = await checkedRecord(tx, barrierKey(handle, root.runId, joinId));
            if (!stored) throw new TypeError('Join membership was not frozen');
            const barrier = stored.doc;
            assertObject(barrier, ['schemaVersion', 'joinId', 'runId', 'fanoutAttemptId', 'nodeAttemptId', 'epoch', 'graphRevision', 'memberAttemptIds', 'memberEdges', 'fanoutFrameRef', 'sourceBindingDigest', 'parentBudgetRef', 'policy', 'quorum', 'deadlineAt', 'frozenSeq', 'createdAt'], 'JoinBarrier');
            if (barrier.fanoutFrameRef !== null) {
                assertObject(barrier.fanoutFrameRef, ['receiptId', 'integrity'], 'fanoutFrameRef');
                const frame = await readFanoutFrame(tx, handle, root, barrier.fanoutAttemptId);
                if (!frame || frame.receiptId !== barrier.fanoutFrameRef.receiptId || hashNativeDocument(frame) !== barrier.fanoutFrameRef.integrity) throw new TypeError('Join FanoutFrame reference is unavailable');
            }
            const joinRecord = await readAttempt(tx, handle, root, barrier.nodeAttemptId), join = joinRecord.doc;
            await assertAttemptCurrent(tx, handle, root, join);
            const joinNode = root.graph.nodes.find(node => node.nodeId === join.nodeId);
            if (barrier.schemaVersion !== 1 || barrier.joinId !== joinId || barrier.runId !== root.runId || joinIdForAttempt(join.attemptId) !== joinId
                || barrier.epoch !== root.epoch || join.epoch !== root.epoch || barrier.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || !['pending', 'running'].includes(join.status) || root.nodeControl[join.nodeId].disposition !== 'eligible') throw new ConflictError('native_orchestration_join_stale');
            assertCounter(barrier.graphRevision, 'barrier.graphRevision'); assertCounter(barrier.frozenSeq, 'frozenSeq', 1);
            assertCounter(barrier.deadlineAt, 'deadlineAt'); assertCounter(barrier.quorum, 'quorum', 1);
            if (joinNode.kind !== 'join' || barrier.policy !== joinNode.policy.strategy || barrier.quorum !== joinNode.policy.quorum || barrier.frozenSeq > root.eventSeq
                || barrier.graphRevision > root.graphRevision || barrier.deadlineAt > root.progress.deadlineAt
                || !Array.isArray(barrier.memberAttemptIds) || !barrier.memberAttemptIds.length || barrier.quorum > barrier.memberAttemptIds.length
                || new Set(barrier.memberAttemptIds).size !== barrier.memberAttemptIds.length || !Array.isArray(barrier.memberEdges)
                || barrier.memberEdges.length !== barrier.memberAttemptIds.length) throw new TypeError('Invalid persisted JoinBarrier');
            const memberTransfers = [], mappedMembers = new Set();
            for (const mapping of barrier.memberEdges) {
                assertObject(mapping, ['nodeAttemptId', 'edgeIds'], 'Join member edges');
                if (!barrier.memberAttemptIds.includes(mapping.nodeAttemptId) || mappedMembers.has(mapping.nodeAttemptId) || !Array.isArray(mapping.edgeIds) || !mapping.edgeIds.length
                    || new Set(mapping.edgeIds).size !== mapping.edgeIds.length) throw new TypeError('Invalid frozen member edges');
                mappedMembers.add(mapping.nodeAttemptId);
                for (const edgeId of mapping.edgeIds) memberTransfers.push({ edgeId, producerAttemptId: mapping.nodeAttemptId, nodeAttemptId: join.attemptId });
            }
            const members = [];
            for (const attemptId of barrier.memberAttemptIds) {
                const { doc: attempt } = await readAttempt(tx, handle, root, attemptId);
                if (attempt.epoch !== barrier.epoch || attempt.sourceBindingDigest !== barrier.sourceBindingDigest) throw new TypeError('Join member source/epoch mismatch');
                await assertAttemptConsumable(tx, handle, root, attempt);
                const receipt = SETTLED_ATTEMPT_STATUSES.includes(attempt.status) ? await readAttemptSettlement(tx, handle, root, attempt) : null;
                let valid = false;
                if (receipt && receipt.createdAt <= barrier.deadlineAt && ['completed', 'partial'].includes(receipt.outcome)) {
                    const verdict = await this.verifyResults({ handle, tx, root, barrier, attempt, receipt });
                    assertObject(verdict, ['valid'], 'JoinResultValidity');
                    if (typeof verdict.valid !== 'boolean') throw new TypeError('Invalid original Result validity');
                    valid = verdict.valid;
                }
                members.push({ attempt, receipt, valid });
            }
            const success = members.filter(member => member.valid && member.receipt.outcome === 'completed').sort(compare);
            const usable = members.filter(member => member.valid).sort(compare);
            const settled = members.filter(member => member.receipt).length, remaining = members.length - settled;
            const expired = now >= barrier.deadlineAt;
            let selected = [], outcome = null, reason = null;
            if (barrier.policy === 'all-success') {
                if (success.length === members.length) { outcome = 'completed'; selected = success; } else if (settled > success.length || expired) { outcome = 'failed'; reason = expired ? 'join_deadline' : 'join_member_unsuccessful'; }
            } else if (barrier.policy === 'all-settled') {
                if (!remaining || expired) {
                    selected = usable;
                    outcome = success.length === members.length ? 'completed' : root.graph.outputContract.allowPartial && usable.some(member => member.receipt.resultRefs.length) ? 'partial' : 'failed';
                    reason = outcome === 'completed' ? null : expired ? 'join_deadline' : 'join_member_unsuccessful';
                }
            } else if (barrier.policy === 'any-success' || barrier.policy === 'count-quorum') {
                const required = barrier.policy === 'any-success' ? 1 : barrier.quorum;
                if (success.length >= required) { outcome = 'completed'; selected = success.slice(0, required); } else if (success.length + remaining < required || expired) { outcome = 'failed'; reason = expired ? 'join_deadline' : 'join_quorum_unreachable'; }
            } else if (barrier.policy === 'deadline' && expired) {
                selected = usable;
                outcome = success.length === members.length ? 'completed' : root.graph.outputContract.allowPartial && usable.some(member => member.receipt.resultRefs.length) ? 'partial' : 'failed';
                reason = outcome === 'completed' ? null : 'join_deadline';
            }
            if (outcome === null) throw new ConflictError('native_orchestration_join_not_ready');
            if (outcome === 'failed') selected = [];
            // Closing the barrier accounts for each frozen dependency once,
            // including an explicit absence/cancellation at the cutoff. This
            // is logical control work, never evidence of an external send.
            const edgeAdmissionRefs = await admitGraphEdges({ tx, handle, root, transfers: memberTransfers, now });
            const acceptedResultRefs = [...new Map(selected.flatMap(member => member.receipt.resultRefs).map(ref => [hashNativeDocument(ref), ref])).values()];
            const selectedIds = new Set(selected.map(member => member.attempt.attemptId));
            const receipt = { schemaVersion: 1, joinId, runId: root.runId, nodeAttemptId: join.attemptId, epoch: barrier.epoch, graphRevision: barrier.graphRevision,
                memberAttemptIds: barrier.memberAttemptIds, edgeAdmissionRefs, memberReceiptRefs: members.filter(member => member.receipt).sort(compare).map(member => member.receipt.receiptId),
                barrierDigest: stored.integrity, policy: barrier.policy, quorum: barrier.quorum, deadlineAt: barrier.deadlineAt, cutoffSeq: root.eventSeq, decisionSeq: root.eventSeq + 1,
                acceptedResultRefs, excluded: members.filter(member => !selectedIds.has(member.attempt.attemptId)).map(member => ({ nodeAttemptId: member.attempt.attemptId, reasonCode: !member.receipt ? 'unsettled_at_cutoff' : member.receipt.createdAt > barrier.deadlineAt ? 'after_deadline' : !member.valid && ['completed', 'partial'].includes(member.receipt.outcome) ? 'result_unavailable' : member.receipt.outcome === 'completed' ? 'not_selected' : member.receipt.outcome })),
                reasons: reason === null ? [] : [reason], outcome };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'join', joinId), receipt);
            await writeAttemptSettlement({ tx, handle, root, record: joinRecord, outcome, resultRefs: acceptedResultRefs, effectReceiptRefs: [], reasonCode: reason, now });
            root.progress.steps++;
            return { root, eventType: 'join_settled', reasonCode: reason, outcome: { joinReceipt: receipt } };
        });
    }
}
