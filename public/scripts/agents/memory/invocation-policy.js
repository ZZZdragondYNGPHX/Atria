// SPDX-License-Identifier: AGPL-3.0-or-later
/** Pure request-time choice. Reranking cannot manufacture absent causal evidence. */
export function memoryInvocationDecision(plan, candidates, { configured = false, computeContext = null } = {}) {
    const causal = new Set(candidates.filter(doc => ['causes', 'motivated_by', 'explains'].includes(doc.predicate)
        || /因为|由于|\bbecause\b/iu.test(doc.text)).map(doc => JSON.stringify([...(doc.episodeIds || [])].sort())));
    if (!configured) return { action: 'skip', reason: 'rerank_unconfigured' };
    if (plan.intent !== 'cause') return { action: 'skip', reason: 'base_retrieval_only' };
    if (causal.size < 2) return { action: 'skip', reason: causal.size ? 'single_causal_source' : 'causal_evidence_unknown' };
    if (!computeContext) return { action: 'skip', reason: 'budget_authority_unavailable' };
    return { action: 'rerank', reason: 'competing_causal_sources', candidateCount: candidates.length };
}
