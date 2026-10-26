// Runtime-owned record arrays. Writers invalidate on membership changes;
// replacing an array naturally creates a new index. Values remain live.
const indexes = new WeakMap();
function indexFor(records) {
    let entry = indexes.get(records);
    if (!entry || entry.length !== records.length) {
        entry = { length: records.length, values: null, fields: new Map() };
        indexes.set(records, entry);
    }
    return entry;
}
export function recordById(records, id) {
    const entry = indexFor(records);
    entry.values ??= new Map(records.map(record => [record.id, record]));
    return entry.values.get(id);
}
export function invalidateRecordIndex(records) { indexes.delete(records); }

const fieldValue = (value, parts) => parts.reduce((parent, key) => parent?.[key], value);
export function selectRecords(records, { ids, where, expected, match }, scan) {
    if (!where || ids && match !== 'any') {
        const candidates = ids ? [...ids].map(id => recordById(records, id)).filter(Boolean) : records;
        scan(ids ? ids.size : records.length);
        const parts = where?.field.split('.');
        return where ? candidates.filter(record => fieldValue(record.value, parts) === expected) : candidates;
    }
    // An OR with an unrestricted ID selector has the same meaning as before.
    if (match === 'any' && !ids) { scan(records.length); return records; }
    const entry = indexFor(records), field = where.field;
    let index = entry.fields.get(field);
    if (!index) {
        scan(records.length);
        const parts = field.split('.'), values = new Map(), matches = [];
        for (const record of records) {
            const value = fieldValue(record.value, parts);
            let keys = values.get(value);
            if (!keys) { keys = new Set(); values.set(value, keys); }
            keys.add(record.id);
            if (value === expected || ids?.has(record.id)) matches.push(record);
        }
        if (entry.fields.size >= 8) entry.fields.delete(entry.fields.keys().next().value);
        index = { parts, values }; entry.fields.set(field, index);
        // The build already visited and selected these records; do not traverse
        // or charge the matched subset a second time on a cold query.
        return matches;
    }
    const matches = index.values.get(expected) ?? [];
    scan(matches.size ?? 0);
    const keys = new Set(matches);
    if (ids) { scan(ids.size); for (const id of ids) keys.add(id); }
    return [...keys].map(id => recordById(records, id)).filter(Boolean);
}

// Candidate envelopes differ, while their admitted values and field -> ID sets
// are unchanged. Copy only touched buckets when a writer replaces a value.
export function copyRecordIndexes(before, after) {
    if (before.length === after.length && before.every((record, index) => record.value === after[index].value)) {
        const entry = indexFor(before);
        // Lazy construction can populate both identical views. The first write
        // detaches this field map before changing any bucket.
        indexes.set(after, { length: after.length, values: null, fields: entry.fields });
    }
}
export function updateRecordIndex(records, record, previousValue) {
    const entry = indexes.get(records);
    if (!entry) return;
    entry.length = records.length; entry.values?.set(record.id, record);
    entry.fields = new Map(entry.fields);
    for (const [field, index] of entry.fields) {
        const before = fieldValue(previousValue, index.parts), after = fieldValue(record.value, index.parts);
        if (previousValue !== undefined && before === after) continue;
        const values = new Map(index.values);
        if (previousValue !== undefined) {
            const keys = new Set(values.get(before)); keys.delete(record.id);
            if (keys.size) values.set(before, keys); else values.delete(before);
        }
        const keys = new Set(values.get(after)); keys.add(record.id); values.set(after, keys);
        entry.fields.set(field, { parts: index.parts, values });
    }
}
