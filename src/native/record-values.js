// Values decoded from durable state are owned by the host. Freeze once so
// snapshots and private candidates can share them; record envelopes stay mutable.
const values = new WeakSet();
export function freezeRecordValue(value) {
    if (!value || typeof value !== 'object' || values.has(value)) return value;
    for (const child of Object.values(value)) freezeRecordValue(child);
    Object.freeze(value); values.add(value); return value;
}
export const immutableRecordValue = value => value !== null && typeof value === 'object' && values.has(value);
