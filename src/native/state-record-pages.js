import { cloneAdmittedDocument, copyStateDocument, hashNativeDocument, nativeDocumentBytes, putImmutable, readNativeRecord } from './repositories/common.js';
import { freezeRecordValue } from './record-values.js';

export const RECORD_PAGE_NAMESPACE = 'atri_record_page';
export const RECORD_PAGE_FORMAT = 'atria-world-state-v5';
const pageRecords = 64, maxPages = 4096, maxRecords = 131072, maxBytes = 64 * 1024 * 1024;
const pageKey = (key, head) => ({ ...key, namespace: RECORD_PAGE_NAMESPACE, head });
export const isRecordPageSnapshot = doc => doc?.format === RECORD_PAGE_FORMAT && doc.kind === 'pages' && doc.depth === 0;
export const isRecordPage = value => Array.isArray(value) && value.length > 0 && value.length <= pageRecords
    && value.every(record => record && typeof record === 'object' && !Array.isArray(record));

export function recordPageHeads(doc) {
    if (!isRecordPageSnapshot(doc) || !Number.isSafeInteger(doc.valueBytes) || doc.valueBytes < 1 || doc.valueBytes > maxBytes
        || !doc.value?.domains || !doc.recordPages || typeof doc.recordPages !== 'object' || Array.isArray(doc.recordPages)) throw new TypeError('Invalid record pages');
    const heads = new Set(); let count = 0;
    for (const [id, refs] of Object.entries(doc.recordPages)) {
        const domain = Object.hasOwn(doc.value.domains, id) && doc.value.domains[id];
        if (!domain || !Array.isArray(domain.records) || domain.records.length || !Array.isArray(refs) || !refs.length) throw new TypeError('Invalid paged Domain');
        for (const head of refs) {
            if (++count > maxPages || typeof head !== 'string' || !/^[a-f0-9]{64}$/.test(head)) throw new TypeError('Invalid record page reference');
            heads.add(head);
        }
    }
    return [...heads];
}

// Keep nearby page boundaries stable when retention removes a row. A record
// ID is only a cut hint: page identity still hashes every byte of every row.
function pageEnd(records, offset, anchored) {
    const limit = Math.min(offset + pageRecords, records.length);
    if (!anchored || limit === records.length) return limit;
    for (let index = offset + pageRecords / 2 - 1; index < limit; index++) {
        const id = records[index]?.id;
        if (typeof id !== 'string') continue;
        let rank = 2166136261;
        for (let i = 0; i < id.length; i++) rank = Math.imul(rank ^ id.charCodeAt(i), 16777619);
        if ((rank & 31) === 0) return index + 1;
    }
    return limit;
}

export async function storeRecordPages(tx, key, snapshot, valueBytes) {
    if (key.namespace !== 'atri_lifecycle' || valueBytes < 1024 * 1024 || valueBytes > maxBytes) return snapshot;
    const paged = Object.values(snapshot.value.domains ?? {}).filter(domain => domain.records.length >= pageRecords * 2);
    if (!paged.length || paged.reduce((n, domain) => n + domain.records.length, 0) > maxRecords
        || paged.reduce((n, domain) => n + Math.ceil(domain.records.length / pageRecords), 0) > maxPages) return snapshot;
    // Near the restore limit, fixed pages retain the original capacity.
    const anchored = paged.reduce((n, domain) => n + Math.ceil(domain.records.length / (pageRecords / 2)), 0) <= maxPages;
    const value = { ...snapshot.value, domains: { ...snapshot.value.domains } }, recordPages = {};
    for (const [id, domain] of Object.entries(value.domains)) {
        if (domain.records.length < pageRecords * 2) continue;
        const refs = [];
        for (let offset = 0; offset < domain.records.length;) {
            const end = pageEnd(domain.records, offset, anchored), page = domain.records.slice(offset, end);
            const head = hashNativeDocument(page), keyOfPage = pageKey(key, head);
            offset = end;
            const existing = await readNativeRecord(tx, keyOfPage);
            if (!existing) await putImmutable(tx, keyOfPage, page, { shareImmutableValues: true });
            else if (existing.integrity !== head) throw new TypeError('Corrupt record page identity');
            refs.push(head);
        }
        recordPages[id] = refs; value.domains[id] = { ...domain, records: [] };
    }
    // Content-addressed pages retain shared dictionary compression without
    // copying append-only history into every periodic full-state checkpoint.
    return { ...snapshot, format: RECORD_PAGE_FORMAT, kind: 'pages', value, valueBytes, recordPages };
}

export async function restoreRecordPages(tx, key, doc) {
    if (key.namespace !== 'atri_lifecycle') throw new TypeError('Invalid record page namespace');
    const heads = recordPageHeads(doc), pages = new Map(); let loadedBytes = 0;
    for (const head of heads) {
        const row = await readNativeRecord(tx, pageKey(key, head));
        if (!row || row.integrity !== head || !isRecordPage(row.doc)) throw new TypeError('Missing or corrupt record page');
        loadedBytes += nativeDocumentBytes(row.doc);
        if (loadedBytes > maxBytes) throw new TypeError('Record page expansion limit');
        pages.set(head, freezeRecordValue(copyStateDocument(row.doc)));
    }
    const value = cloneAdmittedDocument(doc.value); let count = 0, bytes = nativeDocumentBytes(value);
    for (const [id, refs] of Object.entries(doc.recordPages)) {
        const records = value.domains[id].records;
        for (const head of refs) {
            const page = pages.get(head);
            count += page.length;
            bytes += nativeDocumentBytes(page) - 2 + Number(records.length > 0);
            if (count > maxRecords || bytes > maxBytes) throw new TypeError('Record page expansion limit');
            records.push(...page);
        }
    }
    if (bytes !== doc.valueBytes) throw new TypeError('Record page byte count mismatch');
    return value;
}
