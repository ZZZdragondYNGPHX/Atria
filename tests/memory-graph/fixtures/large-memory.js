import { sourceContent } from '../../../public/scripts/extensions/memory-graph/source-provenance.js';

export function largeMemory(size = 1000) {
    const chat = []; const state = { version: 1, scopeId: 'benchmark', sources: {}, episodes: {}, dependencies: [], facts: {}, entities: {}, relations: {} };
    for (let i = 0; i < size; i++) {
        const message = { memory_os_source_id: `m${i}`, mes: `Person ${i} is at the Castle.`, is_user: false }; chat.push(message);
        const episodeId = `m${i}:1`; const proof = { episodeIds: [episodeId], evidence: [{ episodeId, excerpt: message.mes }] };
        state.episodes[episodeId] = { id: episodeId, scopeId: state.scopeId, status: 'active', sourceFloor: i, messageIds: [`m${i}`], sourceContent: sourceContent(message), content: message.mes };
        state.facts[`f${i}`] = { id: `f${i}`, scopeId: state.scopeId, text: message.mes, type: 'explicit', supports: [{ ...proof, confidence: 0.95 }], supersededBy: [], createdAt: 1 };
        state.entities[`n${i}`] = { id: `n${i}`, scopeId: state.scopeId, type: 'Character', names: [{ ...proof, name: `Person ${i}`, kind: 'canonical' }], merges: [] };
        state.relations[`r${i}`] = { id: `r${i}`, scopeId: state.scopeId, sourceEntityId: `n${i}`, targetEntityId: 'castle', predicate: 'located_in', policy: 'replace_current', exclusiveSide: 'source',
            supports: [{ ...proof, factId: `f${i}` }], supersededBy: [], conflictIds: [], resolutions: [] };
    }
    state.entities.castle = { id: 'castle', scopeId: state.scopeId, type: 'Location', names: [{ episodeIds: ['m0:1'], name: 'Castle', kind: 'canonical' }], merges: [] };
    return { state, chat, key: 'benchmark', assertCurrent() {} };
}
