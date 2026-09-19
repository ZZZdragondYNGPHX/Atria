import { describe, expect, test } from '@jest/globals';
import {
    ItemizedPromptStore,
    getItemizedPromptIndexKey,
    getItemizedPromptRecordKey,
} from '../../public/scripts/atri-itemized-prompt-store.js';

class MemoryStorage {
    constructor(seed = {}) {
        this.map = new Map(Object.entries(structuredClone(seed)));
        this.gets = [];
        this.sets = [];
        this.removes = [];
    }

    async getItem(key) {
        this.gets.push(key);
        return this.map.has(key) ? structuredClone(this.map.get(key)) : null;
    }

    async setItem(key, value) {
        this.sets.push(key);
        this.map.set(key, structuredClone(value));
        return value;
    }

    async removeItem(key) {
        this.removes.push(key);
        this.map.delete(key);
    }

    async clear() {
        this.map.clear();
    }
}

function makeStore(storage) {
    let sequence = 0;
    return new ItemizedPromptStore(storage, {
        makeRecordId: (_chatId, mesId) => `record-${mesId}-${++sequence}`,
        migrationBatchSize: 2,
    });
}

describe('P-02 itemized prompt diagnostics store', () => {
    test('lazy migration preserves the old full-array key and builds a light index', async () => {
        const legacy = [
            { mesId: 4, rawPrompt: 'large prompt A', worldInfoString: 'world A' },
            { mesId: 8, rawPrompt: ['large', 'prompt B'], worldInfoString: 'world B' },
        ];
        const storage = new MemoryStorage({ alpha: legacy });
        const store = makeStore(storage);

        const index = await store.loadIndex('alpha');

        expect(index).toEqual([
            { mesId: 4, recordId: 'record-4-1', hasRawPrompt: true },
            { mesId: 8, recordId: 'record-8-2', hasRawPrompt: true },
        ]);
        expect(storage.map.get('alpha')).toEqual(legacy);
        expect(storage.map.get(getItemizedPromptIndexKey('alpha'))).toEqual({
            version: 1,
            entries: index,
        });
        expect(storage.map.get(getItemizedPromptRecordKey('alpha', 'record-4-1'))).toEqual(legacy[0]);
        expect(storage.map.get(getItemizedPromptRecordKey('alpha', 'record-8-2'))).toEqual(legacy[1]);
    });

    test('after migration, opening a long chat reads only the lightweight index', async () => {
        const entries = Array.from({ length: 10_000 }, (_, mesId) => ({
            mesId,
            recordId: `r-${mesId}`,
            hasRawPrompt: true,
        }));
        const storage = new MemoryStorage({
            [getItemizedPromptIndexKey('long')]: { version: 1, entries },
        });
        const store = makeStore(storage);

        const loaded = await store.loadIndex('long');

        expect(loaded).toHaveLength(10_000);
        expect(storage.gets).toEqual([getItemizedPromptIndexKey('long')]);
        expect(storage.gets.some(key => key.startsWith('atri:p2:record:'))).toBe(false);
    });

    test('opening one diagnostic fetches one record on demand', async () => {
        const index = [
            { mesId: 3, recordId: 'r-3', hasRawPrompt: true },
            { mesId: 7, recordId: 'r-7', hasRawPrompt: true },
        ];
        const storage = new MemoryStorage({
            [getItemizedPromptIndexKey('chat')]: { version: 1, entries: index },
            [getItemizedPromptRecordKey('chat', 'r-7')]: {
                mesId: 7,
                rawPrompt: 'selected',
                worldInfoString: 'only this record should load',
            },
        });
        const store = makeStore(storage);

        const record = await store.getRecord('chat', 7, index);

        expect(record.rawPrompt).toBe('selected');
        expect(storage.gets).toEqual([getItemizedPromptRecordKey('chat', 'r-7')]);
    });

    test('upsert writes one diagnostic record plus the lightweight index, not the legacy array', async () => {
        const storage = new MemoryStorage({
            [getItemizedPromptIndexKey('chat')]: { version: 1, entries: [] },
        });
        const store = makeStore(storage);

        const index = await store.upsert('chat', {
            mesId: 12,
            rawPrompt: 'new prompt',
            worldInfoString: 'world',
        }, []);

        expect(index).toEqual([
            { mesId: 12, recordId: 'record-12-1', hasRawPrompt: true },
        ]);
        expect(storage.sets).toEqual([
            getItemizedPromptRecordKey('chat', 'record-12-1'),
            getItemizedPromptIndexKey('chat'),
        ]);
        expect(storage.map.has('chat')).toBe(false);
    });

    test('previous-prompt diff lookup reads only the nearest indexed raw prompt', async () => {
        const index = [
            { mesId: 2, recordId: 'r-2', hasRawPrompt: true },
            { mesId: 4, recordId: 'r-4', hasRawPrompt: false },
            { mesId: 6, recordId: 'r-6', hasRawPrompt: true },
            { mesId: 8, recordId: 'r-8', hasRawPrompt: true },
        ];
        const storage = new MemoryStorage({
            [getItemizedPromptRecordKey('chat', 'r-6')]: { mesId: 6, rawPrompt: 'nearest' },
        });
        const store = makeStore(storage);

        const previous = await store.getPreviousRecordWithRawPrompt('chat', 8, index);

        expect(previous).toMatchObject({ mesId: 6, rawPrompt: 'nearest' });
        expect(storage.gets).toEqual([getItemizedPromptRecordKey('chat', 'r-6')]);
    });

    test('rollback rematerializes the current records into the old array layout', async () => {
        const index = [
            { mesId: 1, recordId: 'r-1', hasRawPrompt: true },
            { mesId: 5, recordId: 'r-5', hasRawPrompt: true },
        ];
        const storage = new MemoryStorage({
            [getItemizedPromptIndexKey('chat')]: { version: 1, entries: index },
            [getItemizedPromptRecordKey('chat', 'r-1')]: { mesId: 99, rawPrompt: 'one' },
            [getItemizedPromptRecordKey('chat', 'r-5')]: { mesId: 99, rawPrompt: 'five' },
        });
        const store = makeStore(storage);

        const legacy = await store.rollbackToLegacy('chat', index);

        expect(legacy).toEqual([
            { mesId: 1, rawPrompt: 'one' },
            { mesId: 5, rawPrompt: 'five' },
        ]);
        expect(storage.map.get('chat')).toEqual(legacy);
    });

    test('copying a checkpoint duplicates diagnostics without loading an old full-array key', async () => {
        const index = [{ mesId: 2, recordId: 'r-2', hasRawPrompt: true }];
        const storage = new MemoryStorage({
            [getItemizedPromptRecordKey('source', 'r-2')]: { mesId: 2, rawPrompt: 'prompt' },
        });
        const store = makeStore(storage);

        const copied = await store.copyChat('source', 'checkpoint', index);

        expect(copied).toEqual([
            { mesId: 2, recordId: 'record-2-1', hasRawPrompt: true },
        ]);
        expect(storage.map.get(getItemizedPromptRecordKey('checkpoint', 'record-2-1'))).toEqual({
            mesId: 2,
            rawPrompt: 'prompt',
        });
        expect(storage.gets).not.toContain('source');
    });
});
