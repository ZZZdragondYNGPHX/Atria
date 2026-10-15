import { ConflictError } from '../../storage/errors.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';

/** Deterministic dependency/loop admission; original Ports supply references,
 * grant and an already-admitted budget identity. This never reserves or sends. */
export class TransitionController {
    constructor({ runs, authorizeTransition }) {
        if (!runs || typeof authorizeTransition !== 'function') throw new TypeError('TransitionController requires original dependency/source/grant/budget authority');
        Object.assign(this, { runs, authorizeTransition });
    }

    async advance(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'bindings', 'reservedAttemptId'], 'advance');
        const { bindings, reservedAttemptId, ...guard } = cloneNativeDocument(input);
        if (reservedAttemptId !== null) assertNativeId(reservedAttemptId, 'orchestrationAttempt');
        if (!Array.isArray(bindings) || !bindings.length) throw new TypeError('Transition requires durable producer bindings');
        const ids = new Set();
        for (const binding of bindings) {
            assertObject(binding, ['edgeId', 'producerAttemptId'], 'transition binding');
            assertNativeId(binding.edgeId, 'orchestrationEdge'); assertNativeId(binding.producerAttemptId, 'orchestrationAttempt');
            if (ids.has(binding.edgeId)) throw new TypeError('Duplicate traversal edge');
            ids.add(binding.edgeId);
        }
        bindings.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const identity = hashNativeDocument({ runId: guard.runId, bindings, reservedAttemptId });
        const attemptId = reservedAttemptId ?? 'oattempt_' + identity.slice(0, 32), receiptId = 'oreceipt_' + identity.slice(0, 32);
        return this.runs.control(handle, controlCommandId('loop.advance', identity), { ...guard, operation: 'loop.advance', detail: { bindings, reservedAttemptId } }, async ({ tx, root, now }) => {
            if (root.cancelRequested || root.status !== 'running') throw new ConflictError('native_orchestration_transition_not_admitted');
            const edges = bindings.map(binding => root.graph.edges.find(edge => edge.edgeId === binding.edgeId));
            const targetId = edges[0]?.to.nodeId, target = root.graph.nodes.find(node => node.nodeId === targetId);
            if (!target || edges.some(edge => !edge || edge.to.nodeId !== targetId) || target.kind === 'join'
                || root.nodeControl[targetId].disposition !== 'eligible') throw new ConflictError('native_orchestration_transition_target_invalid');
            if (target.inputs.some(port => port.required && !edges.some(edge => edge.to.port === port.name))) throw new ConflictError('native_orchestration_transition_inputs_incomplete');
            const producers = [];
            for (let index = 0; index < bindings.length; index++) {
                const edge = edges[index], { doc: attempt } = await readAttempt(tx, handle, root, bindings[index].producerAttemptId);
                const node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
                if (node.kind === 'output' || attempt.nodeId !== edge.from.nodeId || attempt.epoch !== root.epoch
                    || attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest || !SETTLED_ATTEMPT_STATUSES.includes(attempt.status)) throw new ConflictError('native_orchestration_transition_producer_invalid');
                const receipt = await readAttemptSettlement(tx, handle, root, attempt);
                const matched = edge.condition === 'always' || edge.condition === 'success' && receipt.outcome === 'completed'
                    || edge.condition === 'failure' && ['failed', 'cancelled', 'stale'].includes(receipt.outcome);
                if (!matched) throw new ConflictError('native_orchestration_transition_condition_unmet');
                if ((root.progress.edgeVisitCounts[edge.edgeId] ?? 0) >= edge.maxVisits) throw new ConflictError('native_orchestration_edge_limit_exhausted');
                producers.push({ edge, attempt, receipt });
            }
            const reserved = reservedAttemptId === null ? null : await readAttempt(tx, handle, root, reservedAttemptId);
            if (reserved && (reserved.doc.nodeId !== targetId || reserved.doc.status !== 'reserved' || reserved.doc.inputState !== 'reserved'
                || reserved.doc.epoch !== root.epoch || reserved.doc.sourceBindingDigest !== root.sourceBinding.bindingDigest)) throw new ConflictError('native_orchestration_reservation_not_preparable');
            if (reserved) {
                const { doc: creator } = await readAttempt(tx, handle, root, reserved.doc.reservationRef.producerAttemptId);
                if (creator.epoch !== root.epoch || creator.sourceBindingDigest !== root.sourceBinding.bindingDigest || root.graph.nodes.find(node => node.nodeId === creator.nodeId)?.kind !== 'fanout'
                    || !['running', 'completed'].includes(creator.status)) throw new ConflictError('native_orchestration_reservation_parent_stale');
            }
            const prior = [];
            for (const ref of root.attemptRefs) {
                if (ref === reservedAttemptId) continue;
                const { doc } = await readAttempt(tx, handle, root, ref);
                if (doc.nodeId !== targetId) continue;
                if (!SETTLED_ATTEMPT_STATUSES.includes(doc.status)) throw new ConflictError('native_orchestration_attempt_already_active');
                prior.push(doc);
            }
            if (reserved && reserved.doc.attemptNumber !== prior.length + 1) throw new TypeError('Reserved Attempt history mismatch');
            const loopVisits = edges.filter(edge => edge.loopBack).length;
            if (now >= root.progress.deadlineAt || root.progress.steps >= root.limits.maxSteps || (!reserved && root.progress.attempts >= root.limits.maxAttempts)
                || root.progress.edgeVisits + edges.length > root.limits.maxEdgeVisits || root.progress.loopIterations + loopVisits > root.limits.maxLoopIterations) throw new ConflictError('native_orchestration_limit_exhausted');
            // Read-only revalidation of typed source/result inputs and the
            // existing original reservation; no original-bank writes in CAS.
            const admission = cloneNativeDocument(await this.authorizeTransition({ handle, tx, root, target, attemptId, producers, reservedAttempt: reserved?.doc ?? null }));
            assertObject(admission, ['inputRefs', 'inputDigest', 'effectiveGrantDigest', 'budgetRef'], 'transition admission');
            assertDigest(admission.inputDigest, 'inputDigest'); assertDigest(admission.effectiveGrantDigest, 'effectiveGrantDigest');
            if (!Array.isArray(admission.inputRefs) || hashNativeDocument(admission.inputRefs) !== admission.inputDigest
                || !admission.budgetRef || Object.prototype.toString.call(admission.budgetRef) !== '[object Object]') throw new TypeError('Invalid original transition admission');
            const attempt = { schemaVersion: 1, runId: root.runId, nodeId: targetId, attemptId, attemptNumber: prior.length + 1, epoch: root.epoch, graphRevision: root.graphRevision,
                inputState: 'prepared', reservationRef: reserved?.doc.reservationRef ?? null,
                ...admission, sourceBindingDigest: root.sourceBinding.bindingDigest, status: 'pending', effectRefs: [], resultRefs: [], startedAt: null, endedAt: null, reasonCode: null };
            const receipt = { schemaVersion: 1, receiptKind: 'graph_transition', receiptId, runId: root.runId, epoch: root.epoch, graphRevision: root.graphRevision,
                bindings, producerReceiptRefs: producers.map(producer => producer.receipt.receiptId), nodeAttemptId: attemptId, inputDigest: admission.inputDigest,
                edgeVisits: Object.fromEntries(edges.map(edge => [edge.edgeId, (root.progress.edgeVisitCounts[edge.edgeId] ?? 0) + 1])), loopIterations: root.progress.loopIterations + loopVisits,
                decisionSeq: root.eventSeq + 1, createdAt: now };
            if (reserved) await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId), attempt, { expectedIntegrity: reserved.integrity });
            else await putImmutable(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId), attempt);
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
            if (!reserved) { root.attemptRefs.push(attemptId); root.progress.attempts++; }
            root.progress.steps++; root.progress.edgeVisits += edges.length; root.progress.loopIterations += loopVisits;
            Object.assign(root.progress.edgeVisitCounts, receipt.edgeVisits);
            return { root, eventType: 'graph_transition_admitted', reasonCode: null, outcome: { attemptId, traversalReceipt: receipt } };
        });
    }
}
