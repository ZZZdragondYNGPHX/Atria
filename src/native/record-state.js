import { cloneAdmittedDocument } from './repositories/common.js';
import { immutableRecordValue, immutableRecordCollection } from './record-values.js';
import { copyRecordIndexes, updateRecordIndex } from './domain-record-index.js';

const collections = new WeakMap();
export function recordCollectionIdentity(records) {
    const known = collections.get(records);
    if (immutableRecordCollection(records)) {
        // A newly sealed candidate may still carry its predecessor's proof.
        if (known?.items === records) return known;
        const identity = Object.freeze({ items: records });
        collections.set(records, identity);
        return identity;
    }
    // Arrays remain writable candidates. Reuse validation only after comparing
    // every envelope reference with the sealed collection that was admitted.
    if (known && known.items.length === records.length) {
        let same = true;
        for (let index = 0; index < records.length; index++) if (records[index] !== known.items[index]) { same = false; break; }
        if (same) return known;
    }
    // Array.every skips holes; an admitted collection must be dense.
    for (const record of records) if (!immutableRecordValue(record)) return null;
    const identity = Object.freeze({ items: Object.freeze(records.slice()) });
    collections.set(records, identity);
    return identity;
}

export function mutableRecords(domain) {
    const records = domain.records;
    if (!immutableRecordCollection(records)) return records;
    const next = records.slice();
    copyRecordIndexes(records, next);
    collections.set(next, recordCollectionIdentity(records));
    domain.records = next;
    return next;
}

// Published envelopes are sealed along with their values. Detach only the
// record being changed; sibling snapshots keep their original envelope.
export function mutableRecord(records, record) {
    if (!immutableRecordValue(record)) return record;
    const index = records.indexOf(record);
    if (index < 0) throw new TypeError('Record does not belong to this state');
    const next = { ...record };
    records[index] = next;
    updateRecordIndex(records, next, record.value);
    return next;
}

export function copyReceiptState(state) {
    const { receipts, ...rest } = state;
    return { ...cloneAdmittedDocument(rest), receipts: receipts.map(receipt => immutableRecordValue(receipt) ? receipt : cloneAdmittedDocument(receipt)) };
}

export function copyRecordState(state, reusable = immutableRecordValue) {
    const { domains, ...rest } = state;
    return { ...cloneAdmittedDocument(rest), domains: Object.fromEntries(Object.entries(domains).map(([id, domain]) => {
        const { records, ...metadata } = domain;
        if (immutableRecordCollection(records)) return [id, { ...cloneAdmittedDocument(metadata), records }];
        const copied = records.map(record => {
            if (immutableRecordValue(record)) return record;
            const { value, ...envelope } = record;
            return { ...cloneAdmittedDocument(envelope), value: reusable(value) ? value : cloneAdmittedDocument(value) };
        });
        copyRecordIndexes(records, copied);
        const identity = recordCollectionIdentity(records);
        if (identity) collections.set(copied, identity);
        return [id, { ...cloneAdmittedDocument(metadata), records: copied }];
    })) };
}
