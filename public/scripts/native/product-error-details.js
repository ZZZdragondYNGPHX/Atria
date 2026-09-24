// Shared HTTP/UI detail contract. Raw exception messages and payloads are not public.
const scalarKeys = new Set(['field', 'code', 'kind', 'scope', 'resourceType', 'projectId', 'packageId', 'packageVersionId',
    'worldId', 'worldRevisionId', 'knowledgeBaseId', 'knowledgeRevisionId', 'knowledgeBindingId', 'resourceId',
    'sessionId', 'saveId', 'revisionId', 'revision', 'expectedRevisionId', 'actualRevisionId', 'entryPointId', 'assetId']);
const containerKeys = new Set(['references', 'usedBy', 'fields', 'issues', 'blockers', 'ref', 'dependency', 'dependencies', 'revisions', 'permissions']);

export function sanitizeProductDetails(value, depth = 0) {
    if (depth > 5 || value == null) return undefined;
    if (typeof value === 'string') return depth === 0 ? undefined : value.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 256);
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeProductDetails(item, depth + 1)).filter(item => item !== undefined);
    if (typeof value !== 'object') return undefined;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
        if (scalarKeys.has(key) && typeof item === 'string') result[key] = sanitizeProductDetails(item, depth + 1);
        else if (containerKeys.has(key) && item && typeof item === 'object') result[key] = sanitizeProductDetails(item, depth + 1);
    }
    return Object.keys(result).length ? result : undefined;
}
