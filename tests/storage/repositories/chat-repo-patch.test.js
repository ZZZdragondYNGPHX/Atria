import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { ConflictError } from '../../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES)('ChatRepo on $name — patch', ({ make }) => {
    let h, repo;
    beforeEach(async () => {
        h = await make();
        repo = new ChatRepo({ engine: h.engine });
    });
    afterEach(() => h.cleanup());

    async function setup(initialBody = []) {
        const { integrity } = await repo.save(h.handle, 'A', 'c', { chat_metadata: {} }, initialBody, null);
        return integrity;
    }

    test('patchMessages uses native whole-message operations where supported', async () => {
        const int1 = await setup([{ mes: 'old' }, { mes: 'remove-me' }]);
        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [
                { op: 'test', path: '/0', value: { mes: 'old' } },
                { op: 'replace', path: '/0', value: { mes: 'new' } },
                { op: 'test', path: '/1', value: { mes: 'remove-me' } },
                { op: 'remove', path: '/1' },
            ],
            int1,
            { chatMetadata: { marker: 'native' } },
        );

        const read = await repo.get(h.handle, 'A', 'c');
        if (h.kind === 'fs') {
            expect(result).toEqual({ status: 'unsupported' });
            expect(read.body).toEqual([{ mes: 'old' }, { mes: 'remove-me' }]);
            return;
        }

        expect(result.status).toBe('ok');
        expect(result.applied).toBe(4);
        expect(result.totalMessages).toBe(1);
        expect(result.integrity).not.toBe(int1);
        expect(read.body).toEqual([{ mes: 'new' }]);
        expect(read.header.chat_metadata.marker).toBe('native');
        expect(read.integrity).toBe(result.integrity);
    });

    test('patchMessages refuses nested paths without mutating the chat', async () => {
        const int1 = await setup([{ mes: 'old' }]);
        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'replace', path: '/0/mes', value: 'new' }],
            int1,
        );
        expect(result).toEqual({ status: 'unsupported' });
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body).toEqual([{ mes: 'old' }]);
        expect(read.integrity).toBe(int1);
    });

    test('native whole-message patch uses supported engines and explicitly falls back on FS', async () => {
        const int1 = await setup([
            { name: 'U', mes: 'a' },
            { name: 'C', mes: 'b' },
        ]);

        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'replace', path: '/1', value: { name: 'C', mes: 'native' } }],
            int1,
        );

        if (h.kind === 'fs') {
            expect(result).toEqual({ status: 'unsupported' });
            const unchanged = await repo.get(h.handle, 'A', 'c');
            expect(unchanged.body[1].mes).toBe('b');
            return;
        }

        expect(result.status).toBe('ok');
        expect(result.applied).toBe(1);
        expect(result.totalMessages).toBe(2);
        expect(result.integrity).not.toBe(int1);
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body[1].mes).toBe('native');
    });

    test('native whole-message remove preserves array shifting semantics', async () => {
        const int1 = await setup([{ mes: 'a' }, { mes: 'b' }, { mes: 'c' }]);
        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'remove', path: '/1' }],
            int1,
        );

        if (h.kind === 'fs') {
            expect(result.status).toBe('unsupported');
            return;
        }

        expect(result).toMatchObject({ status: 'ok', applied: 1, totalMessages: 2 });
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body.map(message => message.mes)).toEqual(['a', 'c']);
    });

    test('native path rejects nested message patches before mutation', async () => {
        const int1 = await setup([{ mes: 'old' }]);
        const result = await repo.patchMessages(
            h.handle,
            'A',
            'c',
            [{ op: 'replace', path: '/0/mes', value: 'new' }],
            int1,
        );
        expect(result).toEqual({ status: 'unsupported' });
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body[0].mes).toBe('old');
        expect(read.integrity).toBe(int1);
    });

    test('patch replaces a message field and rotates integrity', async () => {
        const int1 = await setup([{ name: 'C', mes: 'old' }]);
        const { integrity: int2 } = await repo.patch(h.handle, 'A', 'c', [
            { op: 'replace', path: '/body/0/mes', value: 'new' },
        ], int1);
        expect(int2).not.toBe(int1);
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body[0].mes).toBe('new');
    });

    test('patch with wrong integrity throws ConflictError without applying', async () => {
        void (await setup([{ mes: 'old' }]));
        await expect(
            repo.patch(h.handle, 'A', 'c', [{ op: 'replace', path: '/body/0/mes', value: 'new' }], 'WRONG'),
        ).rejects.toThrow(ConflictError);
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body[0].mes).toBe('old');
    });

    test('add op targeting an existing index with equal value is rewritten to test (idempotent)', async () => {
        const int1 = await setup([{ name: 'U', mes: 'hi' }]);
        const { integrity: int2 } = await repo.patch(h.handle, 'A', 'c', [
            { op: 'add', path: '/body/0', value: { name: 'U', mes: 'hi' } },
        ], int1);
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body).toHaveLength(1);
        expect(read.body[0].mes).toBe('hi');
        expect(int2).not.toBe(int1);
    });

    test('add op targeting a fresh index appends', async () => {
        const int1 = await setup([{ mes: 'a' }]);
        await repo.patch(h.handle, 'A', 'c', [
            { op: 'add', path: '/body/1', value: { mes: 'b' } },
        ], int1);
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.body.map((m) => m.mes)).toEqual(['a', 'b']);
    });

    test('patch on header works (e.g. /header/chat_metadata/variables/foo)', async () => {
        const int1 = await setup([]);
        await repo.patch(h.handle, 'A', 'c', [
            { op: 'add', path: '/header/chat_metadata/variables/foo', value: 'bar' },
        ], int1);
        const read = await repo.get(h.handle, 'A', 'c');
        expect(read.header.chat_metadata.variables.foo).toBe('bar');
    });
});
