import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { durableRemoveAsync } from '../durable-file.js';
import { normalizeNativeResourceKey } from './native-resource-key.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../native/contracts.js';
import { prepareIndependent } from '../../../public/shared/native-independent-preparation.js';
import { decodeNativeJsonAsync } from './native-json-codec.js';
import { encodedNativeJournal, decodeNativeJournal } from './native-journal-codec.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const dependencies = new Set([K.sessionState, K.sessionRevision, K.timelineEntry, K.timelineVariant, K.branch]);

// Recovery-only reader for pre-WAL stores. New transactions use FsNativeStore.
// Complete committed file installation before the one-time SQL import.
export class FsNativeJournal {
    constructor(tx, root, handle, fault = () => {}, stateCache = null) {
        this.base = tx; this.handle = handle; this.fault = fault;
        this.stateCache = stateCache;
        this.file = path.join(root, 'native-commit.journal');
    }
    checkedKey(key) {
        const normalized = normalizeNativeResourceKey(key);
        if (normalized.handle !== this.handle) throw new TypeError('FS transaction handle mismatch');
        return normalized;
    }
    async install(items) {
        const install = async ({ item, index }) => {
            this.checkedKey(item.key);
            if (item.bytes) await this.base.putEncodedNativeResource(item.key, item.bytes);
            else if (item.record) await this.base.putResource(item.key, item.record);
            else await this.base.deleteResource(item.key);
            await this.fault('install', index);
        };
        let batch = [];
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if ((item.bytes || item.record) && dependencies.has(item.key.kind)) batch.push({ item, index });
            else {
                // Independent files may sync together; mutable roots and
                // deletions remain ordered barriers after all siblings settle.
                await prepareIndependent(batch, install, { concurrency: 4 }); batch = [];
                await install({ item, index });
            }
        }
        await prepareIndependent(batch, install, { concurrency: 4 });
    }
    async recover() {
        let raw;
        try { raw = await fsp.readFile(this.file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (raw !== undefined) {
            this.stateCache?.clear();
            let items;
            if (encodedNativeJournal(raw)) items = decodeNativeJournal(raw);
            else {
                const journal = await decodeNativeJsonAsync(raw);
                if (journal.schemaVersion !== 1 || digest(journal.payload) !== journal.digest) throw new Error('Native commit journal integrity mismatch');
                items = JSON.parse(journal.payload);
            }
            await this.install(items);
            await durableRemoveAsync(this.file);
        }
        await durableRemoveAsync(this.file + '.prepared');
    }
}
