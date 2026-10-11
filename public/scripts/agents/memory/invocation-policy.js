// SPDX-License-Identifier: AGPL-3.0-or-later
import { memorySemanticHints } from './query-plan.js';
/** Pure request-time choice. Reranking cannot manufacture absent causal evidence. */
export function memoryInvocationDecision(plan, candidates, { configured = false, computeContext = null, lane = 'rerank', reuse = null,
    metered = false, rebuild = false } = {}) {
    if (lane === 'vector') {
        if (!configured) return { action: 'skip', reason: 'vector_unconfigured' };
        // Reusing the original exact corpus is a proof about sources, not a
        // cached query answer. Rank the legal base anew; retain vector work for
        // a cold/changed corpus or a request whose required evidence is absent.
        const supported = candidates.some(doc => doc.episodeIds?.length || doc.providerRefs?.length || doc.manualSources?.length);
        const covered = supported && (plan.commitment ? candidates.some(doc => memorySemanticHints(doc.text).commitment)
            : plan.intent === 'location' ? candidates.some(doc => doc.predicate === 'located_in')
                : plan.intent === 'ownership' ? candidates.some(doc => ['owns', 'holds'].includes(doc.predicate))
                    : plan.intent !== 'cause');
        if (metered && !rebuild && reuse?.status === 'valid_hit' && reuse.reason === 'exact_source_authority' && covered) {
            return { action: 'skip', reason: 'source_valid_base_coverage', candidateCount: candidates.length };
        }
        return { action: 'vector', reason: rebuild ? 'explicit_rebuild' : !covered ? 'base_coverage_missing' : 'cold_or_unmetered_corpus' };
    }
    const causal = new Set(candidates.filter(doc => ['causes', 'motivated_by', 'explains'].includes(doc.predicate)
        || /因为|由于|\bbecause\b/iu.test(doc.text)).map(doc => JSON.stringify([...(doc.episodeIds || [])].sort())));
    if (!configured) return { action: 'skip', reason: 'rerank_unconfigured' };
    if (plan.intent !== 'cause') return { action: 'skip', reason: 'base_retrieval_only' };
    if (causal.size < 2) return { action: 'skip', reason: causal.size ? 'single_causal_source' : 'causal_evidence_unknown' };
    if (!computeContext) return { action: 'skip', reason: 'budget_authority_unavailable' };
    return { action: 'rerank', reason: 'competing_causal_sources', candidateCount: candidates.length };
}
