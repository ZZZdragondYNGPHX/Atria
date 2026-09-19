import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { ConflictError, NotFoundError } from '../../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES)('ChatRepo on $name — basic CRUD', ({ make }) => {
    let h, repo;
    beforeEach(async () => {
        h = await make();
        repo = new ChatRepo({ engine: h.engine });
    });
    afterEach(() => h.cleanup());

    test('get returns null when chat missing', async () => {
        const r = await repo.get(h.handle, 'Alice', 'nope');
        expect(r).toBeNull();
    });

    test('getRange returns one bounded window with stable pagination metadata', async () => {
        const messages = Array.from({ length: 12 }, (_, index) => ({
            name: index % 2 ? 'C' : 'U',
            mes: `m-${index}`,
            extra: { index },
        }));
        const { integrity } = await repo.save(
            h.handle,
            'Alice',
            'range',
            { user_name: 'U', chat_metadata: { marker: 'range' } },
            messages,
            null,
        );

        const range = await repo.getRange(h.handle, 'Alice', 'range', {
            fromIndex: 4,
            limit: 3,
        });

        expect(range.body).toEqual(messages.slice(4, 7));
        expect(range.header.chat_metadata.marker).toBe('range');
        expect(range.integrity).toBe(integrity);
        expect(range.fromIndex).toBe(4);
        expect(range.nextIndex).toBe(7);
        expect(range.totalMessages).toBe(12);
        expect(range.hasMore).toBe(true);
    });

    test('getRange clamps past-end requests and missing chats consistently', async () => {
        await repo.save(h.handle, 'Alice', 'range', {}, [{ mes: 'only' }], null);

        const pastEnd = await repo.getRange(h.handle, 'Alice', 'range', {
            fromIndex: 99,
            limit: 5,
        });
        expect(pastEnd.body).toEqual([]);
        expect(pastEnd.fromIndex).toBe(1);
        expect(pastEnd.nextIndex).toBe(1);
        expect(pastEnd.totalMessages).toBe(1);
        expect(pastEnd.hasMore).toBe(false);

        await expect(repo.getRange(h.handle, 'Alice', 'missing', {
            fromIndex: 0,
            limit: 1,
        })).resolves.toBeNull();
    });

    test('save then get returns same chat with new integrity', async () => {
        const header = { user_name: 'U', chat_metadata: { variables: {} } };
        const messages = [{ name: 'U', mes: 'hi' }];
        const { integrity: int1 } = await repo.save(h.handle, 'Alice', 'c1', header, messages, null);
        expect(typeof int1).toBe('string');
        expect(int1.length).toBeGreaterThan(0);

        const fetched = await repo.get(h.handle, 'Alice', 'c1');
        expect(fetched.header.user_name).toBe('U');
        expect(fetched.body).toEqual(messages);
        expect(fetched.integrity).toBe(int1);
    });

    test('save with wrong expectedIntegrity throws ConflictError', async () => {
        await repo.save(h.handle, 'Alice', 'c1', { x: 1 }, [], null);
        await expect(
            repo.save(h.handle, 'Alice', 'c1', { x: 2 }, [], 'WRONG-INT'),
        ).rejects.toThrow(ConflictError);
    });

    test('save with correct expectedIntegrity rotates integrity', async () => {
        const { integrity: int1 } = await repo.save(h.handle, 'Alice', 'c1', {}, [], null);
        const { integrity: int2 } = await repo.save(h.handle, 'Alice', 'c1', {}, [{ mes: 'x' }], int1);
        expect(int2).not.toBe(int1);
        const fetched = await repo.get(h.handle, 'Alice', 'c1');
        expect(fetched.integrity).toBe(int2);
    });

    test('save with expectedIntegrity on a non-existent chat throws NotFoundError', async () => {
        await expect(
            repo.save(h.handle, 'Alice', 'ghost', {}, [], 'SOME-INT'),
        ).rejects.toThrow(NotFoundError);
    });

    test('delete removes the chat', async () => {
        await repo.save(h.handle, 'Alice', 'c1', {}, [], null);
        await repo.delete(h.handle, 'Alice', 'c1');
        expect(await repo.get(h.handle, 'Alice', 'c1')).toBeNull();
    });

    test('delete on a missing chat is a no-op (does not throw)', async () => {
        await expect(repo.delete(h.handle, 'Alice', 'ghost')).resolves.toBeUndefined();
    });

    test('save preserves unknown header fields verbatim', async () => {
        const header = {
            user_name: 'U',
            chat_metadata: { variables: {} },
            future_field_xyz: { nested: [1, 2, 3] },
            _third_party_extension: 'hello',
        };
        await repo.save(h.handle, 'Alice', 'c1', header, [], null);
        const read = await repo.get(h.handle, 'Alice', 'c1');
        expect(read.header.future_field_xyz).toEqual({ nested: [1, 2, 3] });
        expect(read.header._third_party_extension).toBe('hello');
    });

    test('save preserves unknown message fields verbatim', async () => {
        const messages = [
            { name: 'C', mes: 'hi', extra: { future_tool_block: { id: 'x' } } },
        ];
        await repo.save(h.handle, 'Alice', 'c1', {}, messages, null);
        const read = await repo.get(h.handle, 'Alice', 'c1');
        expect(read.body[0].extra.future_tool_block).toEqual({ id: 'x' });
    });
});
