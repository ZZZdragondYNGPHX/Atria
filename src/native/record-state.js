import { cloneAdmittedDocument } from './repositories/common.js';
import { immutableRecordValue } from './record-values.js';
import { copyRecordIndexes } from './domain-record-index.js';

export function copyReceiptState(state) {
    const { receipts, ...rest } = state;
    return { ...cloneAdmittedDocument(rest), receipts: receipts.map(receipt => immutableRecordValue(receipt) ? receipt : cloneAdmittedDocument(receipt)) };
}

export function copyRecordState(state, reusable = immutableRecordValue) {
    const { domains, ...rest } = state;
    return { ...cloneAdmittedDocument(rest), domains: Object.fromEntries(Object.entries(domains).map(([id, domain]) => {
        const { records, ...metadata } = domain;
        const copied = records.map(record => {
            const { value, ...envelope } = record;
            return { ...cloneAdmittedDocument(envelope), value: reusable(value) ? value : cloneAdmittedDocument(value) };
        });
        copyRecordIndexes(records, copied);
        return [id, { ...cloneAdmittedDocument(metadata), records: copied }];
    })) };
}
