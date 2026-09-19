import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';

import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { recoverFsChatPatchJournal } from '../../../src/storage/engines/fs-chat-range.js';
import { makeTempFsEngine } from '../harness/fs-harness.js';

const JOURNAL_SUFFIX = '.atria-patch-journal';
const JOURNAL_MAGIC = 'ATRIA_FS_CHAT_PATCH_V1';

function chatPath(h) {
    return path.join(h.dirs.chats, 'A', 'c.jsonl');
}

function lineStarts(buffer) {
    const starts = [0];
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x0a && i + 1 < buffer.length) starts.push(i + 1);
    }
    return starts;
}

function writeSyntheticJournal(filePath, original, stat, suffixStart, status = 'P') {
    const headerLength = original.indexOf(0x0a);
    if (headerLength < 0) throw new Error('fixture must contain a JSONL header');
    const metadata = {
        headerStart: 0,
        headerLength,
        suffixStart,
        originalSize: original.length,
        mtimeMs: stat.mtimeMs,
    };
    const envelope = Buffer.from(
        status + ' ' + JOURNAL_MAGIC + ' ' + JSON.stringify(metadata) + '\n',
        'utf8',
    );
    const payload = Buffer.concat([
        original.subarray(0, headerLength),
        original.subarray(suffixStart),
    ]);
    fs.writeFileSync(filePath + JOURNAL_SUFFIX, Buffer.concat([envelope, payload]));
}

describe('FS native whole-message patch journal', () => {
    let h;
    let repo;

    beforeEach(async () => {
        h = await makeTempFsEngine();
        repo = new ChatRepo({ engine: h.engine });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        if (h) await h.cleanup();
    });

    async function seed(messages) {
        return repo.save(
            h.handle,
            'A',
            'c',
            { user_name: 'U', character_name: 'A', chat_metadata: {} },
            messages,
            null,
        );
    }

    test('variable-length replace keeps the untouched prefix byte-for-byte and leaves canonical JSONL', async () => {
        const { integrity } = await seed([
            { mes: 'first', marker: 'keep-prefix' },
            { mes: 'second', marker: 'also-prefix' },
            { mes: 'tail' },
        ]);
        const filePath = chatPath(h);
        const before = fs.readFileSync(filePath);
        const starts = lineStarts(before);
        // Header integrity rotates on every successful write. The invariant
        // we want here is that message bytes *before* the changed tail remain
        // byte-for-byte untouched.
        const bodyPrefixBefore = before.subarray(starts[1], starts[3]);

        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'replace', path: '/2', value: { mes: 'a much longer replacement tail', extra: { n: 1 } } }],
            integrity,
        );

        expect(result).toMatchObject({ status: 'ok', applied: 1, totalMessages: 3 });
        const after = fs.readFileSync(filePath);
        const afterStarts = lineStarts(after);
        expect(after.subarray(afterStarts[1], afterStarts[3]).equals(bodyPrefixBefore)).toBe(true);
        const parsed = after.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
        expect(parsed).toHaveLength(4);
        expect(parsed[1]).toMatchObject({ mes: 'first', marker: 'keep-prefix' });
        expect(parsed[2]).toMatchObject({ mes: 'second', marker: 'also-prefix' });
        expect(parsed[3]).toEqual({ mes: 'a much longer replacement tail', extra: { n: 1 } });
        expect(fs.existsSync(filePath + JOURNAL_SUFFIX)).toBe(false);
    });

    test('middle remove preserves sequential array shifting semantics', async () => {
        const { integrity } = await seed([
            { mes: 'a' },
            { mes: 'b' },
            { mes: 'c' },
            { mes: 'd' },
        ]);

        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [
                { op: 'test', path: '/1', value: { mes: 'b' } },
                { op: 'remove', path: '/1' },
                { op: 'replace', path: '/1', value: { mes: 'C-after-shift-and-longer' } },
            ],
            integrity,
        );

        expect(result).toMatchObject({ status: 'ok', applied: 3, totalMessages: 3 });
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body).toEqual([
            { mes: 'a' },
            { mes: 'C-after-shift-and-longer' },
            { mes: 'd' },
        ]);
    });

    test('header-size-changing metadata merge returns unsupported before mutation', async () => {
        const { integrity } = await seed([{ mes: 'a' }, { mes: 'b' }]);
        const filePath = chatPath(h);
        const before = fs.readFileSync(filePath);

        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'replace', path: '/1', value: { mes: 'changed' } }],
            integrity,
            { chatMetadata: { newly_added_metadata_field: 'forces-header-growth' } },
        );

        expect(result).toEqual({ status: 'unsupported' });
        expect(fs.readFileSync(filePath).equals(before)).toBe(true);
        expect(fs.existsSync(filePath + JOURNAL_SUFFIX)).toBe(false);
    });

    test('commit-marker fsync failure rolls back instead of exposing an uncertain commit', async () => {
        const { integrity } = await seed([{ mes: 'a' }, { mes: 'b' }]);
        const filePath = chatPath(h);
        const original = fs.readFileSync(filePath);
        const realWriteSync = fs.writeSync.bind(fs);
        const realFsyncSync = fs.fsyncSync.bind(fs);
        let failNextFsync = false;

        jest.spyOn(fs, 'writeSync').mockImplementation((...args) => {
            const buffer = args[1];
            const length = Number(args[3] || 0);
            if (Buffer.isBuffer(buffer)
                && length === 1
                && buffer.subarray(Number(args[2] || 0), Number(args[2] || 0) + 1).toString('utf8') === 'C') {
                failNextFsync = true;
            }
            return realWriteSync(...args);
        });
        jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
            if (failNextFsync) {
                failNextFsync = false;
                throw new Error('simulated commit-marker fsync failure');
            }
            return realFsyncSync(fd);
        });

        await expect(repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'replace', path: '/1', value: { mes: 'replacement-with-different-size' } }],
            integrity,
        )).rejects.toThrow('simulated commit-marker fsync failure');

        expect(fs.readFileSync(filePath).equals(original)).toBe(true);
        expect(fs.existsSync(filePath + JOURNAL_SUFFIX)).toBe(false);
    });

    test('pending journal restores the exact original bytes after an interrupted suffix rewrite', async () => {
        await seed([{ mes: 'a' }, { mes: 'b' }, { mes: 'c' }]);
        const filePath = chatPath(h);
        const original = fs.readFileSync(filePath);
        const stat = fs.statSync(filePath);
        const starts = lineStarts(original);
        const suffixStart = starts[2];

        writeSyntheticJournal(filePath, original, stat, suffixStart, 'P');

        const corrupted = Buffer.concat([
            original.subarray(0, suffixStart),
            Buffer.from('{"mes":"half-written'),
        ]);
        fs.writeFileSync(filePath, corrupted);

        expect(recoverFsChatPatchJournal(filePath)).toBe(true);
        expect(fs.readFileSync(filePath).equals(original)).toBe(true);
        expect(fs.existsSync(filePath + JOURNAL_SUFFIX)).toBe(false);
    });

    test('committed journal is cleaned without rolling back the target', async () => {
        await seed([{ mes: 'a' }, { mes: 'b' }]);
        const filePath = chatPath(h);
        const original = fs.readFileSync(filePath);
        const stat = fs.statSync(filePath);
        const starts = lineStarts(original);
        const suffixStart = starts[2];

        writeSyntheticJournal(filePath, original, stat, suffixStart, 'C');
        const committed = Buffer.concat([
            original.subarray(0, suffixStart),
            Buffer.from(JSON.stringify({ mes: 'committed-tail' }) + '\n'),
        ]);
        fs.writeFileSync(filePath, committed);

        expect(recoverFsChatPatchJournal(filePath)).toBe(true);
        expect(fs.readFileSync(filePath).equals(committed)).toBe(true);
        expect(fs.existsSync(filePath + JOURNAL_SUFFIX)).toBe(false);
    });

    test('new FsEngine process sweep recovers pending journals before the first Repo read', async () => {
        await seed([{ mes: 'a' }, { mes: 'b' }, { mes: 'c' }]);
        const filePath = chatPath(h);
        const original = fs.readFileSync(filePath);
        const stat = fs.statSync(filePath);
        const starts = lineStarts(original);
        const suffixStart = starts[2];

        writeSyntheticJournal(filePath, original, stat, suffixStart, 'P');
        fs.writeFileSync(filePath, Buffer.concat([
            original.subarray(0, suffixStart),
            Buffer.from('{"mes":"interrupted'),
        ]));

        // Force the same engine to behave like a fresh process for this handle.
        // The recovery-set is process-local bookkeeping only; persisted safety
        // comes from the journal on disk.
        h.engine._recoveredPatchJournals.clear();

        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body).toEqual([{ mes: 'a' }, { mes: 'b' }, { mes: 'c' }]);
        expect(fs.readFileSync(filePath).equals(original)).toBe(true);
        expect(fs.existsSync(filePath + JOURNAL_SUFFIX)).toBe(false);
    });
});
