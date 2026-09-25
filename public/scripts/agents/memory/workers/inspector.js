// SPDX-License-Identifier: AGPL-3.0-or-later
import { projectTemporalGraph } from '../temporal-graph.js';
import { projectFacts } from '../atomic-facts.js';
import { inspectMemory } from '../diagnostics.js';
import { applyHistoryBatch } from '../history-build.js';

const compact = record => Object.fromEntries(Object.entries(record).filter(([key]) => !['names', 'merges', 'supports', 'resolutions', 'supersededBy', 'evidence', 'episodeIds'].includes(key)));

self.onmessage = ({ data }) => {
    try {
        const result = data.mode === 'batch' ? applyHistoryBatch(data.state, data.batch, data.ticket, data.chat)
            : data.mode === 'diagnostics' ? inspectMemory(data, data.query) : {
                graph: projectTemporalGraph(data.state, data.chat, { includeInactive: true }),
                facts: projectFacts(data.state, data.chat, { includeInactive: true }),
            };
        if (data.mode === 'graph') {
            for (const key of ['entities', 'relations', 'pending']) result.graph[key] = result.graph[key].map(compact);
            result.facts = result.facts.map(compact);
        }
        self.postMessage({ result });
    } catch (error) { self.postMessage({ error: String(error.message) }); }
};
