import { setImmediate as nextTurn } from 'node:timers/promises';
import { jest } from '@jest/globals';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { GroupRepo } from '../../src/storage/repositories/group-repo.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { withNativeResourceWrite } from '../../src/native/repositories/common.js';
import { withChatWrite } from '../../src/storage/repositories/chat-write-boundary.js';
import { CONTRACT_HARNESSES, makeTempFsEngineHarness, makeTempSqliteEngineHarness } from './harness/contract-harness.js';

const harnesses = process.env.ATRIA_TEST_RP_CHAT_WRITE_SQL === '1'
    ? CONTRACT_HARNESSES.map(({ name, make }) => [name, make])
    : [['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]];
if (process.env.ATRIA_TEST_RP_CHAT_WRITE_SQL === '1') jest.setTimeout(60_000);

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const actions = {
    save: repo => repo.save('u', 'Alice', 'main', {}, [{ mes: 'saved' }], null),
    saveRaw: repo => repo.saveRaw('u', 'Alice', 'main', { header: {}, body: [], integrity: 'raw', updatedAt: 1, createdAt: 1 }),
    append: repo => repo.append('u', 'Alice', 'main', [{ mes: 'append' }], null),
    patchMessages: repo => repo.patchMessages('u', 'Alice', 'main', [{ op: 'replace', path: '/0', value: { mes: 'changed' } }], null),
    patch: repo => repo.patch('u', 'Alice', 'main', [{ op: 'replace', path: '/body/0/mes', value: 'patched' }], null),
    delete: repo => repo.delete('u', 'Alice', 'main'),
    setState: repo => repo.setState('u', 'Alice', 'main', 'control', { value: 2 }),
    deleteState: repo => repo.deleteState('u', 'Alice', 'main', 'control'),
    rename: repo => repo.rename('u', 'Alice', 'main', 'renamed'),
    deleteAllForCharacter: repo => repo.deleteAllForCharacter('u', 'Alice'),
    renameCharDir: repo => repo.renameCharDir('u', 'Alice', 'Bob'),
    updateChatMetadata: repo => repo.updateChatMetadata('u', 'Alice', 'main', { changed: true }, null),
    groupSave: (_repo, group) => group.save('u', 'group-document', { id: 'group-document', chats: ['member-chat'] }),
    groupDelete: (_repo, group) => group.delete('u', 'group-document'),
};

async function fixture(make) {
    const h = await make(), repo = new ChatRepo({ engine: h.engine }), group = new GroupRepo({ engine: h.engine });
    await repo.save(h.handle, 'Alice', 'main', {}, [{ mes: 'original' }], null);
    await repo.setState(h.handle, 'Alice', 'main', 'control', { value: 1 });
    await repo.save(h.handle, null, 'member-chat', {}, [{ mes: 'group original' }], null, { isGroup: true, groupId: 'member-chat' });
    await group.save(h.handle, 'group-document', { id: 'group-document', chats: ['member-chat'] });
    return { h, repo, group, cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
}

// Both tasks are created outside the holder's ALS scope. The Engine wrapper
// records admission only; all reads, writes and commits use the real engine.
async function blockedAdmission(f, boundary, action) {
    const entered = deferred(), release = deferred();
    const original = f.h.engine.withTransaction.bind(f.h.engine);
    let admissions = 0, holder, writer, observed;
    f.h.engine.withTransaction = (...args) => { admissions++; return original(...args); };
    try {
        holder = boundary(async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        writer = action(new ChatRepo({ engine: f.h.engine }), new GroupRepo({ engine: f.h.engine }));
        await nextTurn(); await nextTurn(); observed = admissions;
    } finally {
        release.resolve(); await Promise.allSettled([holder, writer]); f.h.engine.withTransaction = original;
    }
    await writer;
    return observed;
}

describe.each(harnesses)('%s original RP chat write boundary', (_name, make) => {
    test('save waits outside Engine for the original Runtime writer', async () => {
        const f = await fixture(make);
        try { expect(await blockedAdmission(f, work => withRuntimeWrite(f.h.handle, work), actions.save)).toBe(0); }
        finally { await f.cleanup(); }
    });

    test.each(Object.entries(actions))('%s waits outside Engine for the owner chat-domain writer across repository instances', async (_method, action) => {
        const f = await fixture(make);
        try { expect(await blockedAdmission(f, work => withNativeResourceWrite(f.h.handle, 'rp-chat-domain', work), action)).toBe(0); }
        finally { await f.cleanup(); }
    });

    test('the original prototype boundary is reentrant, returns its result, and requires no existing chat', async () => {
        const f = await fixture(make);
        try {
            const result = await ChatRepo.prototype.withWriteLock.call(f.repo, f.h.handle, async () => {
                await f.repo.save(f.h.handle, 'Alice', 'new-chat', {}, [], null);
                await f.repo.delete(f.h.handle, 'Alice', 'new-chat');
                await f.repo.deleteState(f.h.handle, 'Alice', 'new-chat', 'late-accounting');
                await f.group.save(f.h.handle, 'nested-group', { id: 'nested-group', chats: [] });
                return 'original-result';
            });
            expect(result).toBe('original-result');
            expect(await f.repo.get(f.h.handle, 'Alice', 'new-chat')).toBeNull();
            expect((await f.group.get(f.h.handle, 'nested-group')).id).toBe('nested-group');
        } finally { await f.cleanup(); }
    });

    test('Runtime is acquired before the chat domain so waiting writers do not hold the inner lock', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred();
        let holder, writer, probe, timer, admitted;
        try {
            holder = withRuntimeWrite(f.h.handle, async () => { entered.resolve(); await release.promise; });
            await entered.promise;
            writer = f.repo.save(f.h.handle, 'Alice', 'main', {}, [], null);
            await nextTurn();
            probe = withNativeResourceWrite(f.h.handle, 'rp-chat-domain', async () => true);
            admitted = await Promise.race([probe, new Promise(resolve => { timer = setTimeout(() => resolve(false), 500); })]);
        } finally { clearTimeout(timer); release.resolve(); await Promise.allSettled([holder, writer, probe]); }
        try { expect(admitted).toBe(true); }
        finally { await f.cleanup(); }
    });

    test('separate repository writers retain FIFO while reads and another owner boundary remain independent', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred();
        const other = new ChatRepo({ engine: f.h.engine });
        let holder, first, second, whileHeld, otherOwnerResult;
        try {
            holder = withChatWrite(f.h.handle, async () => { entered.resolve(); await release.promise; });
            await entered.promise;
            first = f.repo.append(f.h.handle, 'Alice', 'main', [{ mes: 'first', extra: { gen_id: 'first' } }], null);
            second = other.append(f.h.handle, 'Alice', 'main', [{ mes: 'second', extra: { gen_id: 'second' } }], null);
            otherOwnerResult = await withChatWrite('different-owner', async () => 'other-owner-admitted');
            whileHeld = await f.repo.get(f.h.handle, 'Alice', 'main');
        } finally { release.resolve(); await Promise.allSettled([holder, first, second]); }
        try {
            expect(otherOwnerResult).toBe('other-owner-admitted');
            expect(whileHeld.body.map(message => message.mes)).toEqual(['original']);
            expect((await other.get(f.h.handle, 'Alice', 'main')).body.map(message => message.mes)).toEqual(['original', 'first', 'second']);
            expect((await first).accepted).toBe(1); expect((await second).accepted).toBe(1);
        } finally { await f.cleanup(); }
    });

    test('rename and character-wide rename/delete preserve the original state sidecar and count semantics', async () => {
        const f = await fixture(make);
        try {
            await f.repo.rename(f.h.handle, 'Alice', 'main', 'renamed');
            expect(await f.repo.getState(f.h.handle, 'Alice', 'renamed', 'control')).toEqual({ value: 1 });
            expect(await f.repo.renameCharDir(f.h.handle, 'Alice', 'Bob')).toBe(1);
            expect(await f.repo.getState(f.h.handle, 'Bob', 'renamed', 'control')).toEqual({ value: 1 });
            expect(await f.repo.get(f.h.handle, 'Alice', 'renamed')).toBeNull();
            expect(await f.repo.deleteAllForCharacter(f.h.handle, 'Bob')).toBe(1);
            expect(await f.repo.get(f.h.handle, 'Bob', 'renamed')).toBeNull();
            expect(await f.repo.getState(f.h.handle, 'Bob', 'renamed', 'control')).toBeNull();
        } finally { await f.cleanup(); }
    });

    test('group cascade enumerates and deletes before queued member writes without confusing group documents and chat IDs', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred();
        let holder, deletion, append, observed;
        try {
            await f.repo.save(f.h.handle, null, 'group-document', {}, [{ mes: 'unlisted independent chat' }], null,
                { isGroup: true, groupId: 'group-document' });
            holder = withChatWrite(f.h.handle, async () => { entered.resolve(); await release.promise; });
            await entered.promise;
            deletion = new GroupRepo({ engine: f.h.engine }).delete(f.h.handle, 'group-document');
            append = f.repo.append(f.h.handle, null, 'member-chat', [{ mes: 'late append' }], null,
                { isGroup: true, groupId: 'member-chat' }).then(value => ({ value }), error => ({ error }));
            await nextTurn(); observed = await f.group.get(f.h.handle, 'group-document');
        } finally { release.resolve(); await Promise.allSettled([holder, deletion, append]); }
        try {
            expect(observed.chats).toEqual(['member-chat']);
            expect(await deletion).toEqual({ deleted: true, chatsDeleted: 1 });
            expect((await append).error).toMatchObject({ name: 'NotFoundError', resource: 'chat' });
            expect(await f.group.get(f.h.handle, 'group-document')).toBeNull();
            expect(await f.repo.get(f.h.handle, null, 'member-chat', { isGroup: true, groupId: 'member-chat' })).toBeNull();
            expect((await f.repo.get(f.h.handle, null, 'group-document', { isGroup: true, groupId: 'group-document' })).body)
                .toEqual([{ mes: 'unlisted independent chat' }]);
        } finally { await f.cleanup(); }
    });
});
