import { encodeNativeJsonBytes, decodeNativeJson, nativeJsonBytes } from '../storage/engines/native-json-codec.js';
import { portableSaveState, saveStateDocument, storedSaveState } from './save-state-records.js';

const FORMAT = 'atria-save-state-packs-v1';
const ENCODING = 'native-state-pack-v1';
const PACK_BYTES = 32 * 1024 * 1024;
const packPath = index => 'states/' + String(index).padStart(4, '0') + '.bin';

// Neighbouring deltas share a compression dictionary. Each pack expands in
// isolation; neither export nor import materializes the full history graph.
export function packSaveStates(save, contents) {
    const parts = [], records = save.closure.stateRecords.slice(); let texts = [], size = 2;
    const order = new Map();
    for (const revision of save.closure.revisions.slice().sort((a, b) => a.createdAt - b.createdAt)) {
        for (const [namespace, head] of Object.entries(revision.stateHeads)) {
            const key = namespace + '\0' + head;
            if (!order.has(key)) order.set(key, order.size);
        }
    }
    const pending = records.map((record, index) => ({ record, index })).filter(({ record }) => record.encoding);
    // Adjacent snapshots of the same namespace share most population data.
    // Pack in publication order, preserving the original inventory and identities.
    pending.sort((a, b) => a.record.namespace.localeCompare(b.record.namespace)
        || (order.get(a.record.namespace + '\0' + a.record.head) ?? Infinity) - (order.get(b.record.namespace + '\0' + b.record.head) ?? Infinity));
    const flush = () => {
        if (!texts.length) return;
        const name = packPath(parts.length), bytes = Buffer.from('[' + texts.join(',') + ']');
        contents.set(name, encodeNativeJsonBytes(bytes, { brotliQuality: 5, brotliWindow: 24 }));
        parts.push(name); texts = []; size = 2;
    };
    for (const { record, index } of pending) {
        const text = JSON.stringify(saveStateDocument(record)), bytes = Buffer.byteLength(text);
        if (bytes + 2 > PACK_BYTES) continue;
        if (size + bytes + Number(texts.length > 0) > PACK_BYTES) flush();
        records[index] = { ...record, encoding: ENCODING, data: { pack: parts.length, index: texts.length } };
        size += bytes + Number(texts.length > 0); texts.push(text);
    }
    flush();
    return parts.length ? { format: FORMAT, parts, save: { ...save, closure: { ...save.closure, stateRecords: records } } } : save;
}

export function unpackSaveStates(document, read, maxParts) {
    if (document?.format !== FORMAT) return document;
    if (Object.keys(document).sort().join(',') !== 'format,parts,save' || !Array.isArray(document.parts)
        || !document.parts.length || document.parts.length > maxParts || document.save?.schemaVersion !== 4
        || !Array.isArray(document.save?.closure?.stateRecords)) throw new TypeError('Invalid Save state packs');
    const records = document.save.closure.stateRecords.slice(), groups = document.parts.map(() => new Map());
    for (let position = 0; position < records.length; position++) {
        const record = records[position];
        if (record.encoding !== ENCODING) continue;
        const ref = record.data;
        if (!ref || Object.keys(ref).sort().join(',') !== 'index,pack' || !Number.isSafeInteger(ref.pack)
            || !groups[ref.pack] || !Number.isSafeInteger(ref.index) || ref.index < 0 || groups[ref.pack].has(ref.index)) throw new TypeError('Invalid Save state pack reference');
        groups[ref.pack].set(ref.index, position);
    }
    for (let index = 0; index < document.parts.length; index++) {
        if (document.parts[index] !== packPath(index) || !groups[index].size) throw new TypeError('Invalid Save state pack path');
        const bytes = read(document.parts[index]);
        if (!bytes || bytes.length > PACK_BYTES || nativeJsonBytes(bytes) > PACK_BYTES) throw new TypeError('Save state pack expansion limit');
        const values = decodeNativeJson(bytes), slots = groups[index];
        if (!Array.isArray(values) || values.length !== slots.size) throw new TypeError('Invalid Save state pack count');
        for (let item = 0; item < values.length; item++) {
            if (!slots.has(item)) throw new TypeError('Missing Save state pack reference');
            const position = slots.get(item), record = records[position], data = values[item];
            if (!storedSaveState(record.namespace, data)) throw new TypeError('Invalid packed Save state');
            records[position] = portableSaveState(record.namespace, record.head, data);
        }
    }
    return { ...document.save, closure: { ...document.save.closure, stateRecords: records } };
}
