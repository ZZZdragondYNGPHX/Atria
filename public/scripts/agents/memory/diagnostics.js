// SPDX-License-Identifier: AGPL-3.0-or-later
import { projectFacts } from './atomic-facts.js';
import { projectTemporalGraph } from './temporal-graph.js';
import { buildMemoryCorpus, rankMemory, RETRIEVAL_DEFAULTS } from './hybrid-retrieval.js';

const counts = records => records.reduce((result, record) => { const key = record.status || 'unknown'; result[key] = (result[key] || 0) + 1; return result; }, {});
export function inspectMemory(snapshot, query = '') {
    const start = performance.now();
    const graph = projectTemporalGraph(snapshot.state, snapshot.chat, { includeInactive: true });
    const facts = projectFacts(snapshot.state, snapshot.chat, { includeInactive: true });
    const projected = performance.now();
    const corpus = buildMemoryCorpus(snapshot); const built = performance.now();
    const ranking = rankMemory(String(query).slice(0, 4000), corpus); const ranked = performance.now();
    return { scopeId: snapshot.state.scopeId, mode: 'local lexical + graph; no model/vector request or access-count write',
        counts: { entities: counts(graph.entities), relations: counts(graph.relations), facts: counts(facts), pending: counts(graph.pending),
            episodes: Object.keys(snapshot.state.episodes).length, corpus: corpus.documents.length },
        providers: corpus.providers.map(({ providerId, status }) => ({ providerId, status })),
        history: snapshot.state.historyBuild ? { id: snapshot.state.historyBuild.id, mode: snapshot.state.historyBuild.mode,
            processed: snapshot.state.historyBuild.processed.length, rolledBack: Boolean(snapshot.state.historyBuild.rolledBackAt) } : null,
        limits: RETRIEVAL_DEFAULTS, plan: ranking.plan,
        timingsMs: { projection: projected - start, corpus: built - projected, ranking: ranked - built },
        candidates: ranking.candidates.slice(0, 12).map(({ id, text, type, status, score, episodeIds, manualSources, providerRefs }) => ({ id, text, type, status, score, episodeIds, manualSources, providerRefs })) };
}
