import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
    clearFsChatRangeIndexCache,
    invalidateFsChatRangeIndex,
    readFsChatRange,
} from '../../src/storage/engines/fs-chat-range.js';

const dirs = [];

afterEach(() => {
    clearFsChatRangeIndexCache();
    while (dirs.length) {
        fs.rmSync(dirs.pop(), { recursive: true, force: true });
    }
    jest.restoreAllMocks();
});

function makeChat(count = 2_000) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-chat-range-'));
    dirs.push(dir);
    const filePath = path.join(dir, 'chat.jsonl');
    const header = { chat_metadata: { integrity: 'fixed' }, user_name: 'u' };
    const messages = Array.from({ length: count }, (_, index) => ({
        name: index % 2 ? 'Assistant' : 'User',
        mes: `message-${index}-${'x'.repeat(80)}`,
        extra: { index },
    }));
    const text = [header, ...messages].map(value => JSON.stringify(value)).join('\n') + '\n';
    fs.writeFileSync(filePath, text);
    return { filePath, header, messages, byteLength: Buffer.byteLength(text) };
}

describe('P-04 FS chat range reader', () => {
    test('returns exact range metadata without changing JSONL semantics', () => {
        const { filePath, messages } = makeChat(100);

        const result = readFsChatRange(filePath, { fromIndex: 40, limit: 3 });

        expect(result.body).toEqual(messages.slice(40, 43));
        expect(result.fromIndex).toBe(40);
        expect(result.nextIndex).toBe(43);
        expect(result.totalMessages).toBe(100);
        expect(result.hasMore).toBe(true);
        expect(result.integrity).toBe('fixed');
    });

    test('warm index reads only the requested message bytes, not the whole file', () => {
        const { filePath, messages, byteLength } = makeChat(5_000);

        // First access builds + validates the disposable line index.
        expect(readFsChatRange(filePath, { fromIndex: 4_000, limit: 1 }).body)
            .toEqual([messages[4_000]]);

        const readSpy = jest.spyOn(fs, 'readSync');
        const result = readFsChatRange(filePath, { fromIndex: 4_321, limit: 1 });
        const requestedBytes = readSpy.mock.calls.reduce(
            (sum, call) => sum + Number(call[3] || 0),
            0,
        );

        expect(result.body).toEqual([messages[4_321]]);
        expect(requestedBytes).toBeLessThan(byteLength / 100);
    });

    test('mtime/size changes invalidate the index and expose appended messages', () => {
        const { filePath, messages } = makeChat(10);
        expect(readFsChatRange(filePath, { fromIndex: 9, limit: 1 }).body)
            .toEqual([messages[9]]);

        const appended = { name: 'Assistant', mes: 'appended', extra: { index: 10 } };
        fs.appendFileSync(filePath, JSON.stringify(appended) + '\n');

        const result = readFsChatRange(filePath, { fromIndex: 10, limit: 1 });
        expect(result.body).toEqual([appended]);
        expect(result.totalMessages).toBe(11);
    });

    test('explicit invalidation rebuilds after an atomic rewrite with equal-size data', () => {
        const { filePath, messages } = makeChat(5);
        readFsChatRange(filePath, { fromIndex: 1, limit: 1 });

        const replacement = { ...messages[1], mes: messages[1].mes.replace('message-1', 'replace-1') };
        const lines = fs.readFileSync(filePath, 'utf8').trimEnd().split('\n');
        lines[2] = JSON.stringify(replacement);
        fs.writeFileSync(filePath, lines.join('\n') + '\n');
        invalidateFsChatRangeIndex(filePath);

        expect(readFsChatRange(filePath, { fromIndex: 1, limit: 1 }).body).toEqual([replacement]);
    });

    test('first index build preserves corrupt-file rejection outside the requested window', () => {
        const { filePath } = makeChat(10);
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        lines[8] = '{broken json';
        fs.writeFileSync(filePath, lines.join('\n'));

        expect(readFsChatRange(filePath, { fromIndex: 0, limit: 1 })).toBeNull();
    });
});
