// Values decoded from durable state are owned by the host. Freeze once so
// snapshots and private candidates can share them; writers detach changed paths.
const values = new WeakSet();
const collections = new WeakSet();
export function freezeRecordValue(value) {
    if (!value || typeof value !== 'object' || values.has(value)) return value;
    for (const child of Object.values(value)) freezeRecordValue(child);
    Object.freeze(value); values.add(value); return value;
}
export const immutableRecordValue = value => value !== null && typeof value === 'object' && values.has(value);

// Keep the collection proof separate from payloads: hashing a changed table
// still reuses individual records, rather than serializing the whole table.
export function freezeRecordCollection(records) {
    if (!collections.has(records)) {
        for (const record of records) freezeRecordValue(record);
        Object.freeze(records); collections.add(records);
    }
    return records;
}
export const immutableRecordCollection = value => Array.isArray(value) && collections.has(value);

// Internal declarations may already be deeply frozen by their own admission
// authority. This does not admit caller JSON or turn it into a record value.
const frozenTrees = new WeakSet();
export function frozenJsonTree(value) {
    if (value === null || typeof value !== 'object') return true;
    if (values.has(value) || collections.has(value) || frozenTrees.has(value)) return true;
    if (!Object.isFrozen(value) || !Object.values(value).every(frozenJsonTree)) return false;
    frozenTrees.add(value); return true;
}
