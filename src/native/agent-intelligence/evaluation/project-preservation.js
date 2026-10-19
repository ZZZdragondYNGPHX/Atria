import { hash } from './cases.js';

// Exact preservation outside the fixture-declared edits. Malformed proposals
// are failed evidence, never a grader exception or a partially repaired pass.
export function projectPreservationEvidence(source, proposal, edits) {
    const expected = hash(source), preserved = structuredClone(proposal ?? {});
    if (!Array.isArray(preserved?.package?.entryPoints) || !Array.isArray(source?.package?.entryPoints)) return { observed: null, expected };
    for (const edit of edits) {
        const target = preserved.package.entryPoints[edit.index], original = source.package.entryPoints[edit.index];
        if (!target || typeof target !== 'object' || Array.isArray(target) || !original || typeof original !== 'object' || Array.isArray(original))
            return { observed: null, expected };
        const restore = field => { if (Object.hasOwn(original, field)) target[field] = structuredClone(original[field]); else delete target[field]; };
        if (edit.worldIndex !== undefined) { restore('worldIds'); restore('primaryWorldId'); }
        if (edit.bindingIndices !== undefined) restore('knowledgeBindingIds');
    }
    return { observed: hash(preserved), expected };
}
