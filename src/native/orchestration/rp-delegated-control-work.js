import { RpControlGraphWork } from './rp-control-graph-work.js';
import { rpDelegatedControlProfile } from './rp-delegated-control-profile.js';
import { rpDelegatedPlannerReaderOptions } from './rp-delegation-control-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
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
        this.admitGraph = graph => rpDelegatedControlProfile({ ...this.state.selected.plan, definition: graph });
        this.canReadControl = async () => true; // All child stages share the exact same Task audience.
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
        const bundle = this.state.controlBundle, facts = [];
        if (bundle.evidenceRefs.length) fail();
        for (const ref of bundle.controlRefs) {
            const fact = await readGraphPlannerCompletion(tx, this.state.handle, root, ref.attemptId, rpDelegatedPlannerReaderOptions);
            if (!fact || !equal(fact.controlRef, ref)) fail(); facts.push(fact);
        }
        if (facts.some(fact => !bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId))
            || bundle.bindings.some(binding => !root.graph.edges.some(edge => edge.edgeId === binding.edgeId
                && edge.to.nodeId === this.state.activeSelection.node.nodeId
                && facts.some(fact => fact.producer.attemptId === binding.producerAttemptId && fact.producer.nodeId === edge.from.nodeId)))) fail();
        return facts;
    }

    async currentInputs(tx, root) { return this.inputs(tx, root); }
}
