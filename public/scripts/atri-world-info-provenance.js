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
    const native = entry?.atri_native && typeof entry.atri_native === 'object'
        ? structuredClone(entry.atri_native)
        : null;
    return {
        id: native?.identity || JSON.stringify([String(entry.world ?? ''), entry.uid ?? null]),
        world: String(entry.world ?? ''), uid: entry.uid ?? null,
        ...(native ? { atri_native: native } : {}),
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


function pushSourceSnapshot(target, channel, record, extra = {}) {
    if (!record || typeof record !== 'object') return;
    target.push({
        channel,
        id: String(record.id ?? ''),
        world: String(record.world ?? ''),
        uid: record.uid ?? null,
        sourceVersion: record.sourceVersion ?? null,
        comment: String(record.comment ?? ''),
        ...extra,
    });
}

/**
 * Create a compact, immutable-by-convention snapshot for request diagnostics.
 * Rendered body text is intentionally omitted: itemized prompts already retain
 * the assembled prompt, and duplicating world-info bodies here would multiply
 * long-chat diagnostic storage.
 *
 * @param {object|null|undefined} provenance Request-local WI occurrence provenance.
 * @returns {{schemaVersion:number,sources:object[]}}
 */
export function snapshotWorldInfoProvenance(provenance, {
    includeAuthorsNote = true,
    includeDepth = true,
    includeOutlets = true,
} = {}) {
    const snapshot = { schemaVersion: 1, sources: [] };
    if (!provenance || typeof provenance !== 'object') return snapshot;

    const addArray = (channel, records, extra = {}) => {
        if (!Array.isArray(records)) return;
        records.forEach((record, ordinal) => pushSourceSnapshot(snapshot.sources, channel, record, { ...extra, ordinal }));
    };

    addArray('before', provenance.worldInfoBeforeEntries);
    addArray('after', provenance.worldInfoAfterEntries);
    addArray('examples', provenance.worldInfoExamples);
    if (includeAuthorsNote) {
        addArray('authors_note_before', provenance.anBefore);
        addArray('authors_note_after', provenance.anAfter);
    }

    if (includeDepth && Array.isArray(provenance.worldInfoDepth)) {
        provenance.worldInfoDepth.forEach((bucket, bucketOrdinal) => {
            addArray('depth', bucket?.entries, {
                bucketOrdinal,
                depth: bucket?.depth ?? null,
                role: bucket?.role ?? null,
            });
        });
    }

    if (includeOutlets && provenance.outletEntries && typeof provenance.outletEntries === 'object') {
        for (const outlet of Object.keys(provenance.outletEntries)) {
            addArray('outlet', provenance.outletEntries[outlet], { outlet });
        }
    }

    return snapshot;
}

/**
 * Bind a compact WI identity snapshot to one generated request. Dispatch
 * receipts are appended later at the actual transport boundary.
 *
 * @param {object|null|undefined} provenance Request-local WI provenance.
 * @returns {{schemaVersion:number,sources:object[],dispatches:object[]}}
 */
export function createWorldInfoDispatchAttribution(provenance, options = {}) {
    const snapshot = snapshotWorldInfoProvenance(provenance, options);
    return {
        schemaVersion: snapshot.schemaVersion,
        sources: snapshot.sources,
        dispatches: [],
    };
}

/**
 * Append a lightweight request-boundary receipt without copying the provider
 * request or prompt body. This function is deliberately best-effort and never
 * throws for malformed metadata.
 *
 * @param {object|null|undefined} attribution Mutable attribution object.
 * @param {object} [meta] Dispatch metadata.
 * @returns {object|null} The appended receipt, if any.
 */
export function markWorldInfoDispatch(attribution, meta = {}) {
    if (!attribution || typeof attribution !== 'object') return null;
    if (!Array.isArray(attribution.dispatches)) attribution.dispatches = [];

    const receipt = {
        sequence: attribution.dispatches.length + 1,
        boundary: String(meta.boundary || 'transport_handoff'),
        providerConfirmed: meta.providerConfirmed === true,
        mainApi: String(meta.mainApi || ''),
        type: String(meta.type || ''),
        stream: meta.stream === true,
    };
    if (meta.requestScope != null) receipt.requestScope = String(meta.requestScope);
    if (meta.model != null && String(meta.model).trim()) receipt.model = String(meta.model).trim();
    if (Number.isFinite(Number(meta.messageCount))) receipt.messageCount = Number(meta.messageCount);

    attribution.dispatches.push(receipt);
    // Bound diagnostics even if a transport performs many retries.
    if (attribution.dispatches.length > 16) {
        attribution.dispatches.splice(0, attribution.dispatches.length - 16);
        attribution.dispatches.forEach((entry, index) => { entry.sequence = index + 1; });
    }
    return receipt;
}
