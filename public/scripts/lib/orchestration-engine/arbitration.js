import { copy } from '../agent-runtime/contracts.js';
import { planIdentity } from './contracts.js';

/** One current result per node: old attempts cannot receive extra votes or enter a Judge pool. */
export function latestResults(results, nodeIds) {
    const latest = new Map();
    for (const result of results) if (!nodeIds || nodeIds.includes(result.nodeId)) latest.set(result.nodeId, result);
    return [...latest.values()];
}

export function arbitrate(results, policy, decision = null) {
    const selected = policy.inputResultIds ? policy.inputResultIds.map(id => {
        const result = results.find(item => item.resultId === id);
        if (!result) throw new Error('Unknown arbitration result ID');
        return result;
    }) : results;
    if (new Set(selected.map(result => result.resultId)).size !== selected.length) throw new Error('Duplicate arbitration result ID');
    const allowed = policy.allowPartial ? ['completed', 'partial'] : ['completed'];
    const candidates = selected.filter(result => allowed.includes(result.status));
    if (!candidates.length) throw new Error('No admissible arbitration results');
    const inputs = candidates.map(result => result.resultId);
    const partial = candidates.some(result => result.status === 'partial') || candidates.length !== selected.length;
    if (partial && policy.conflict === 'fail') throw new Error('Incomplete arbitration inputs');
    if (policy.kind === 'judge') {
        if (!decision || !inputs.includes(decision.choice) || typeof decision.reason !== 'string') throw new Error('Invalid Judge choice/reason');
        return { value: copy(candidates.find(result => result.resultId === decision.choice).value), inputResultIds: inputs, partial, reason: decision.reason };
    }
    if (policy.kind === 'synthesize') {
        if (!decision || typeof decision.text !== 'string' || !Array.isArray(decision.inputResultIds)
            || !decision.inputResultIds.length || new Set(decision.inputResultIds).size !== decision.inputResultIds.length
            || decision.inputResultIds.some(id => !inputs.includes(id))) throw new Error('Invalid synthesis references');
        return { value: decision.text, inputResultIds: decision.inputResultIds, partial };
    }
    if (policy.kind === 'consensus') {
        const groups = new Map();
        for (const result of candidates) {
            const key = planIdentity(result.value);
            groups.set(key, [...(groups.get(key) || []), result]);
        }
        const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
        if (ranked[0].length <= candidates.length / 2) throw new Error('No result consensus');
        return { value: copy(ranked[0][0].value), inputResultIds: inputs, partial };
    }
    if (policy.kind === 'pass-through' || policy.kind === 'best-effort') {
        const result = policy.kind === 'best-effort' ? candidates.find(result => result.status === 'completed') || candidates[0] : candidates.at(-1);
        return { value: copy(result.value), inputResultIds: inputs, partial };
    }
    if (policy.kind !== 'merge') throw new Error('Invalid arbitration kind');
    return { value: candidates.map(result => ({ resultId: result.resultId, value: copy(result.value) })), inputResultIds: inputs, partial };
}
