// Runtime-owned record arrays. Writers invalidate on membership changes;
// replacing an array naturally creates a new index. Values remain live.
const indexes = new WeakMap();
export function recordById(records, id) {
    let entry = indexes.get(records);
    if (!entry || entry.length !== records.length) {
        entry = { length: records.length, values: new Map(records.map(record => [record.id, record])) };
        indexes.set(records, entry);
    }
    return entry.values.get(id);
}
export function invalidateRecordIndex(records) { indexes.delete(records); }
