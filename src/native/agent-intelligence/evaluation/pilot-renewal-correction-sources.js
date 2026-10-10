import { RENEWAL_DEVELOPMENT_SOURCES } from './pilot-renewal-sources.js';

// An observed source-contract ambiguity referred to a primary-binding field
// that Project source does not have. Keep the original package immutable.
export const CORRECTED_RENEWAL_DEVELOPMENT_SOURCES = Object.freeze(RENEWAL_DEVELOPMENT_SOURCES.map(source => {
    if (!['renewal_project_d2', 'renewal_project_d3'].includes(source.sourceId)) return source;
    const input = source.fixture.input
        .replace(' and synchronize its primary binding.', ' in knowledgeBindingIds; its first element is Safety. There is no separate primary-binding field.')
        .replace(', synchronizing its primary binding,', ' in that knowledgeBindingIds order,');
    return Object.freeze({ ...source, sourceId: source.sourceId + '_contract', derivedFrom: Object.freeze([source.sourceId]),
        fixture: Object.freeze({ ...source.fixture, input }) });
}));
