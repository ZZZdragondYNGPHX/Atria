// Readable route child IDs for Library details that point at exact revisions.
// Native IDs never contain ':', so the parts are joined with it instead of
// serialising JSON into the URL. Older JSON-encoded links still open.

const isPart = value => typeof value === 'string' && value.length > 0 && !/[:%{}\s]/.test(value);

function legacyJson(rest) {
    try { return JSON.parse(decodeURIComponent(rest)); } catch { return null; }
}

// world:package:{packageId}:{packageVersionId}:{resourceId}:{revision}
export function formatPackageOriginalChild(ref) {
    const kind = ref.resourceType === 'core.world' ? 'world' : 'knowledge';
    const parts = [ref.packageId, ref.packageVersionId, ref.resourceId, ref.revision];
    if (!parts.every(isPart)) return kind + ':package:' + encodeURIComponent(JSON.stringify(ref));
    return kind + ':package:' + parts.join(':');
}

export function parsePackageOriginalChild(child) {
    const match = /^(world|knowledge):package:(.+)$/.exec(String(child || ''));
    if (!match) return null;
    const resourceType = match[1] === 'world' ? 'core.world' : 'core.knowledge';
    const parts = match[2].split(':');
    if (parts.length === 4 && parts.every(isPart)) {
        const [packageId, packageVersionId, resourceId, revision] = parts;
        return { scope: 'package', resourceType, resourceId, revision, packageId, packageVersionId };
    }
    return legacyJson(match[2]);
}

// knowledge:entry:{knowledgeBaseId}:{revisionId}:{entryId}
export function formatKnowledgeEntryChild({ knowledgeBaseId, revisionId, entryId }) {
    const parts = [knowledgeBaseId, revisionId, entryId];
    if (!parts.every(isPart)) return 'knowledge:entry:' + encodeURIComponent(JSON.stringify({ knowledgeBaseId, revisionId, entryId }));
    return 'knowledge:entry:' + parts.join(':');
}

export function parseKnowledgeEntryChild(child) {
    const value = String(child || '');
    if (!value.startsWith('knowledge:entry:')) return null;
    const rest = value.slice('knowledge:entry:'.length);
    const parts = rest.split(':');
    if (parts.length === 3 && parts.every(isPart)) {
        const [knowledgeBaseId, revisionId, entryId] = parts;
        return { knowledgeBaseId, revisionId, entryId };
    }
    return legacyJson(rest);
}
