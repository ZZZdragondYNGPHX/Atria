import { RpControlGraphWork } from './rp-control-graph-work.js';
import { rpDelegatedControlProfile } from './rp-delegated-control-profile.js';
import { rpDelegatedPlannerReaderOptions } from './rp-delegation-control-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readAttempt, assertAttemptConsumable } from './controller-common.js';
import { readRpDelegatedInputSources } from './rp-delegated-quality-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { runGenerationLocalWork } from './generation-local-work.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = () => { throw new TypeError('Invalid RP delegated control inputs'); };

/** Reuses the original GraphController Planner writer. Only references and
 * original callback-local metering live here; no additional execution grant. */
export class RpDelegatedControlWork extends RpControlGraphWork {
    constructor(args) {
        super(args);
        this.reservationId = this.runId;
        this.plannerReaderOptions = rpDelegatedPlannerReaderOptions;
        this.admitGraph = graph => {
            const plan = this.state.selected.plan, initial = rpDelegatedControlProfile(plan), profile = rpDelegatedControlProfile({ ...plan, definition: graph });
            if (!profile || profile.terminalNodeId !== initial.terminalNodeId || !equal(profile.output, initial.output)
                || !equal(graph.edges.filter(edge => edge.loopBack), plan.definition.edges.filter(edge => edge.loopBack))) fail();
            return profile;
        };
        this.canReadControl = async () => true; // All child stages share the exact same Task audience.
        this.reviewRerunRequests = (root, reviewer, invalidatedIds) => rpDelegatedControlProfile({ ...this.state.selected.plan, definition: root.graph }).models
            .filter(node => node.nodeId === reviewer.nodeId || !this.records.has(node.nodeId)
                || invalidatedIds.includes(this.records.get(node.nodeId).attemptId)).length;
        this.revalidateResult = async (tx, root, recipient, ref) => {
            const fact = await readGraphNodeResult(tx, this.state.handle, root, ref.resultId);
            if (!fact || !equal(fact.receipt.resultRef, ref) || !fact.record.envelope.audienceConstraint.nodeIds.includes(recipient.nodeId)
                || !recipient.inputRefs.some(input => equal(input, ref))) fail();
            await assertAttemptConsumable(tx, this.state.handle, root, fact.producer);
            await this.current();
        };

        this.controlWork = ({ root, send, limits, signal }, rows) => async (kind, value, operation) => {
            const effectId = this.state.effectId;
            const attempt = { attemptId: send.bank.nextLocalWorkAttemptId(), requestId: this.state.request.requestId, kind, estimatedItems: 1,
                estimatedInputBytes: Buffer.byteLength(JSON.stringify(value)), targetFingerprint: hash({ runId: root.runId, effectId, kind, inputHash: hash(value) }) };
            let row;
            const result = await runGenerationLocalWork({ signal, attempt, requireAdmission: true, assertCurrent: this.current,
                admit: item => send.bank.chargeLocalWork(limits, item), settle: ({ attempt, usage }) => send.bank.settleLocalWork(attempt.attemptId, usage),
                onAdmitted: entry => { row = entry; } }, operation);
            const observed = await this.service.budgetPort.observeAttempt(this.state.handle, { kind: 'local_work', authorityRef: root.budgetAuthorityRef,
                effectId, localWorkOrdinal: row.orchestration.ordinal, attemptId: row.attemptId, reservationId: root.runId });
            if (observed.status !== 'settled' || observed.usage?.outcome !== 'completed') fail();
            rows.push({ kind, attemptId: observed.attemptId, ordinal: observed.orchestration.ordinal, targetFingerprint: attempt.targetFingerprint, rowHash: hash(observed) });
            return result;
        };
    }

    async inputs(tx, root) {
        const recipient = this.state.attemptId ? (await readAttempt(tx, this.state.handle, root, this.state.attemptId)).doc : null;
        return readRpDelegatedInputSources(tx, this.state.handle, root, this.state.controlBundle, this.state.activeSelection.node.nodeId,
            { live: true, recipient: recipient && ['running', 'waiting_effect'].includes(recipient.status) ? recipient : null });
    }

    async currentInputs(tx, root) { return this.inputs(tx, root); }
}
