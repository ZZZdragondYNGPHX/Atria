/**
 * Request-local provenance for WI prompt channels. Legacy string arrays stay
 * intact; each source record describes the corresponding rendered occurrence,
 * never a reverse lookup by body. This is not a provider send receipt.
 */
export function createWorldInfoProvenance() {
    return {
        worldInfoBeforeEntries: [], worldInfoAfterEntries: [],
        worldInfoExamples: [], anBefore: [], anAfter: [],
        worldInfoDepth: [], outletEntries: {},
    };
}

export function worldInfoSource(entry, content) {
    return {
        id: JSON.stringify([String(entry.world ?? ''), entry.uid ?? null]),
        world: String(entry.world ?? ''), uid: entry.uid ?? null,
        sourceVersion: entry.hash ?? null, comment: String(entry.comment ?? ''),
        content,
    };
}

function provenanceError() {
    const error = new Error('World info channels changed without matching provenance; refusing an ambiguous profile filter.');
    error.code = 'atri_world_info_provenance_mismatch';
    return error;
}

/** Validate every channel before mutating any; preserve caller array identity. */
export function filterWorldInfoByProvenance(payload, provenance, reject) {
    const pairs = [];
    const add = (values, records, { normalize = false, examples = false } = {}) => {
        const sources = normalize && values?.length !== records?.length
            ? records?.filter(record => String(record.content ?? '').trim()) : records;
        const text = value => normalize ? String(value ?? '').trim() : value;
        if (!Array.isArray(values) || !Array.isArray(sources) || values.length !== sources.length
            || values.some((value, index) => text(examples ? value?.content : value) !== text(sources[index].content))) {
            throw provenanceError();
        }
        pairs.push({ values, records, sources });
    };
    for (const channel of ['worldInfoBeforeEntries', 'worldInfoAfterEntries', 'anBefore', 'anAfter', 'worldInfoExamples']) {
        add(payload[channel] ?? [], provenance[channel], {
            normalize: channel === 'worldInfoBeforeEntries' || channel === 'worldInfoAfterEntries',
            examples: channel === 'worldInfoExamples',
        });
    }
    const depth = payload.worldInfoDepth ?? [];
    if (!Array.isArray(depth) || !Array.isArray(provenance.worldInfoDepth) || depth.length !== provenance.worldInfoDepth.length) throw provenanceError();
    depth.forEach((bucket, index) => {
        const source = provenance.worldInfoDepth[index];
        if (bucket.depth !== source.depth || bucket.role !== source.role) throw provenanceError();
        add(bucket.entries, source.entries);
    });
    const outlets = payload.outletEntries ?? {};
    if (!provenance.outletEntries || Object.keys(outlets).length !== Object.keys(provenance.outletEntries).length) throw provenanceError();
    for (const key of Object.keys(outlets)) add(outlets[key], provenance.outletEntries[key]);

    // Compute all decisions before applying them, including user supplied tests.
    const decisions = pairs.map(pair => pair.sources.map(source => reject(source.world, source.comment)));
    pairs.forEach(({ values, records, sources }, pairIndex) => {
        const drops = decisions[pairIndex];
        const keptSources = sources.filter((_, index) => !drops[index]);
        for (let index = values.length - 1; index >= 0; index--) {
            if (drops[index]) values.splice(index, 1);
        }
        records.splice(0, records.length, ...keptSources);
    });
    // The aggregate is also consumed by text-completion and extension paths.
    payload.worldInfoString = [...(payload.worldInfoBeforeEntries ?? []), ...(payload.worldInfoAfterEntries ?? [])].join('\n');
    if ('worldInfoBefore' in payload) payload.worldInfoBefore = (payload.worldInfoBeforeEntries ?? []).join('\n');
    if ('worldInfoAfter' in payload) payload.worldInfoAfter = (payload.worldInfoAfterEntries ?? []).join('\n');
    if (payload.worldInfoResolution && payload.worldInfoResolution !== payload) {
        for (const key of Object.keys(provenance)) payload.worldInfoResolution[key] = payload[key];
        payload.worldInfoResolution.worldInfoString = payload.worldInfoString;
        payload.worldInfoResolution.worldInfoBefore = (payload.worldInfoBeforeEntries ?? []).join('\n');
        payload.worldInfoResolution.worldInfoAfter = (payload.worldInfoAfterEntries ?? []).join('\n');
    }
}
