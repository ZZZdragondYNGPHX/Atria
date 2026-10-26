import { recordById } from './domain-record-index.js';

// One catch-up run, never a cache across mutable Session HEADs. Collection and
// Subject dependencies require broader invalidation and keep full evaluation.
export function simulationEvaluator(contract, budget, evaluate) {
    const entries = new Map();
    const scopes = new Map(contract.lifecycleRuntime.domains.map(domain => [domain.id, domain.scopeId]));
    return (base, job, targetTick, requestedTick) => {
        if (job.subject || job.reads.some(read => read.collection)) return evaluate(base, contract, job, budget, targetTick, requestedTick);
        let entry = entries.get(job);
        if (!entry) {
            entry = { clock: /\bclock\b/.test(JSON.stringify([job.enabled, job.due, job.relevance])) };
            entries.set(job, entry);
        }
        const state = base.states.atri_lifecycle, signature = [targetTick, requestedTick];
        const scope = state.scopes[job.scopeId];
        signature.push(scope?.status, scope?.epoch);
        if (entry.clock) signature.push(state.clocks[contract.simulationRuntime.clockId]);
        if (scope?.status === 'active') for (const read of job.reads) {
            const record = recordById(state.domains[read.domainId].records, read.recordId);
            const readScope = state.scopes[scopes.get(read.domainId)];
            signature.push(readScope?.status, readScope?.epoch, record?.scopeId, record?.value);
            budget.scan(1);
        }
        if (entry.signature && signature.every((value, index) => value === entry.signature[index]) && signature.length === entry.signature.length) {
            budget.step();
            return entry.result;
        }
        const result = evaluate(base, contract, job, budget, targetTick, requestedTick);
        entry.signature = signature; entry.result = result;
        return result;
    };
}
