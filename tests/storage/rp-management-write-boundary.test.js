import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from './harness/contract-harness.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { withChatWrite } from '../../src/storage/repositories/chat-write-boundary.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { withNativeResourceWrite } from '../../src/native/repositories/common.js';
import { ensureShadowRepo, reconcileShadowToLive } from '../../src/sync/shadow.js';
import { dematerializeWorkdirIntoUserData, publishShadowToUserData } from '../../src/sync/materialize.js';
import { restoreFromSnapshot, snapshotUser } from '../../src/storage/migration/backup.js';
import { crossModeRestore } from '../../src/storage/migration/cross-mode-restore.js';
import { resolveStorageResource, writeStorageResource, deleteStorageResource, restoreStorageRecoveryPoint } from '../../src/storage/management.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const header = { user_name: 'User', character_name: 'Alice', chat_metadata: {} };
const body = mes => [{ name: 'User', is_user: true, mes }];
const lines = mes => [header, ...body(mes)].map(value => JSON.stringify(value)).join('\n') + '\n';

async function zipChat(file) {
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(file), zip = archiver('zip');
        out.on('close', resolve); out.on('error', reject); zip.on('error', reject); zip.pipe(out);
        zip.append(lines('remote'), { name: 'chats/Alice/main.jsonl' }); zip.finalize();
    });
}

describe.each([['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]])('%s RP management publication', (mode, make) => {
    let h, repo, shadow;
    beforeEach(async () => {
        h = await make(); repo = new ChatRepo({ engine: h.engine });
        for (const key of ['groups', 'groupChats']) fs.mkdirSync(h.dirs[key], { recursive: true });
        await repo.save(h.handle, 'Alice', 'main', header, body('original'), null);
        shadow = await ensureShadowRepo({ userRoot: h.dirs.root, peerId: 'test-peer' });
        fs.mkdirSync(path.join(shadow.workdir, 'chats', 'Alice'), { recursive: true });
        fs.writeFileSync(path.join(shadow.workdir, 'chats', 'Alice', 'main.jsonl'), lines('remote'));
    });
    afterEach(async () => { jest.restoreAllMocks(); setReadOnly(false); await h.engine.close(); await h.cleanup(); });

    // Start both tasks outside the holder's ALS scope. A queued publication
    // must not enter Engine, delete the live source or mark itself complete.
    async function waitsFor(boundary, action) {
        const entered = deferred(), release = deferred();
        const holder = boundary(async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        const transactions = jest.spyOn(h.engine, 'withTransaction'), remove = jest.spyOn(fs.promises, 'rm');
        let done = false;
        const pending = action().then(value => { done = true; return value; });
        try {
            await turn(); await turn();
            expect(done).toBe(false); expect(transactions).not.toHaveBeenCalled();
            expect(remove.mock.calls.filter(([target]) => path.resolve(target) === h.dirs.root
                || path.resolve(target).startsWith(h.dirs.root + path.sep))).toEqual([]);
            expect((await repo.get(h.handle, 'Alice', 'main')).body[0].mes).toBe('original');
        } finally { release.resolve(); await Promise.allSettled([holder, pending]); transactions.mockRestore(); remove.mockRestore(); }
        return pending;
    }

    test.each(['runtime', 'chat-domain'])('shadow publication waits for %s before pruning the live tree', async boundary => {
        await waitsFor(work => boundary === 'runtime' ? withRuntimeWrite(h.handle, work)
            : withNativeResourceWrite(h.handle, 'rp-chat-domain', work), () => reconcileShadowToLive({
            handle: h.handle, userRoot: h.dirs.root, peerId: 'test-peer', directories: h.dirs, enabledCategoryIds: ['chats'],
        }));
        expect(fs.readFileSync(path.join(h.dirs.chats, 'Alice', 'main.jsonl'), 'utf8')).toBe(lines('remote'));
    });

    test('database publication waits outside Engine and preserves the original SQL/no-op behavior', async () => {
        await waitsFor(work => withChatWrite(h.handle, work), () => dematerializeWorkdirIntoUserData({
            handle: h.handle, directories: h.dirs, categories: ['chats'], workdir: shadow.workdir, engine: h.engine,
        }));
        expect((await repo.get(h.handle, 'Alice', 'main')).body[0].mes).toBe(mode === 'fs' ? 'original' : 'remote');
    });

    test('one publication keeps canonical followers behind the filesystem-to-SQL seam', async () => {
        const entered = deferred(), release = deferred(), read = fs.promises.readFile;
        const target = path.join(shadow.workdir, 'chats', 'Alice', 'main.jsonl');
        let once = false;
        jest.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
            if (args[0] === target && !once) { once = true; entered.resolve(); await release.promise; }
            return read(...args);
        });
        const pending = publishShadowToUserData({ handle: h.handle, userRoot: h.dirs.root, peerId: 'test-peer',
            directories: h.dirs, categories: ['chats'], workdir: shadow.workdir, engine: h.engine });
        let follower, admitted = false;
        try {
            await entered.promise;
            follower = repo.append(h.handle, 'Alice', 'main', body('follower'), null).then(value => { admitted = true; return value; });
            await turn(); expect(admitted).toBe(false);
        } finally { release.resolve(); await Promise.allSettled([pending, follower]); }
        await pending; await follower;
        expect((await repo.get(h.handle, 'Alice', 'main')).body.map(message => message.mes)).toEqual(['remote', 'follower']);
    });

    test('snapshot replacement waits before closing SQLite or removing the live root', async () => {
        const backupPath = await snapshotUser({ handle: h.handle, userRoot: h.dirs.root, backupRoot: h.backupRoot, engine: h.engine });
        await waitsFor(work => withChatWrite(h.handle, work), () => restoreFromSnapshot({ handle: h.handle,
            userRoot: h.dirs.root, backupPath, engine: h.engine }));
        expect((await repo.get(h.handle, 'Alice', 'main')).body[0].mes).toBe('original');
    });

    test('cross-mode overwrite drains consumers before snapshot and original raw category clear', async () => {
        const file = path.join(h.dataRoot, 'remote.zip'); await zipChat(file);
        const result = await waitsFor(work => withChatWrite(h.handle, work), () => crossModeRestore(file, { engineKind: 'fs' },
            h.dirs, { chats: true }, 'overwrite', { dataRoot: h.dataRoot, currentEngine: h.engine }));
        expect(result.verification.engineRecordsVerified).toBe(true);
        expect((await repo.get(h.handle, 'Alice', 'main')).body[0].mes).toBe('remote');
    });

    test('failed overwrite holds followers until full rollback and releases the original domain', async () => {
        const file = path.join(h.dataRoot, 'remote.zip'); await zipChat(file);
        const entered = deferred(), release = deferred(), write = ChatRepo.prototype.saveRaw;
        jest.spyOn(ChatRepo.prototype, 'saveRaw').mockImplementation(async function (...args) {
            if (this._engine === h.engine && args[0] === h.handle && args[1] === 'Alice') {
                entered.resolve(); await release.promise; throw new Error('synthetic destination failure');
            }
            return write.apply(this, args);
        });
        const pending = crossModeRestore(file, { engineKind: 'fs' }, h.dirs, { chats: true }, 'overwrite',
            { dataRoot: h.dataRoot, currentEngine: h.engine });
        const outcome = pending.catch(error => error);
        let follower, admitted = false;
        try {
            await Promise.race([entered.promise, outcome.then(() => { throw new Error('Destination seam was not reached'); })]);
            // Status/response consumers remain allowed while read-only. A
            // public mutation is correctly refused by the existing gate.
            follower = withChatWrite(h.handle, async () => {
                admitted = true; return repo.get(h.handle, 'Alice', 'main');
            });
            await turn(); expect(admitted).toBe(false);
        } finally { release.resolve(); await Promise.allSettled([outcome, follower]); }
        expect(await outcome).toMatchObject({ rollback: 'ok' });
        expect((await follower).body[0].mes).toBe('original');
        await repo.append(h.handle, 'Alice', 'main', body('after-rollback'), null);
        expect((await repo.get(h.handle, 'Alice', 'main')).body.map(message => message.mes)).toEqual(['original', 'after-rollback']);
    });
});

describe('raw storage-management chat entry points', () => {
    let h, repo, resource, recoveryRoot;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); repo = new ChatRepo({ engine: h.engine });
        await repo.save(h.handle, 'Alice', 'main', header, body('original'), null);
        resource = resolveStorageResource(h.dirs.root, ['chats', 'Alice', 'main.jsonl']);
        recoveryRoot = path.join(h.dataRoot, 'recovery');
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.engine.close(); await h.cleanup(); });

    test.each(['edit', 'delete', 'recover'])('%s waits outside raw filesystem publication', async action => {
        let id;
        if (action === 'recover') id = (await deleteStorageResource({ handle: h.handle, resource, recoveryRoot })).recovery.id;
        const entered = deferred(), release = deferred();
        const holder = withChatWrite(h.handle, async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        let done = false;
        const args = { handle: h.handle, resource, recoveryRoot };
        const pending = (action === 'edit' ? writeStorageResource({ ...args, content: lines('edited') })
            : action === 'delete' ? deleteStorageResource(args)
                : restoreStorageRecoveryPoint({ ...args, userRoot: h.dirs.root, id })).then(value => { done = true; return value; });
        try {
            await turn(); await turn(); expect(done).toBe(false);
            expect((await repo.get(h.handle, 'Alice', 'main'))?.body[0].mes).toBe(action === 'recover' ? undefined : 'original');
        } finally { release.resolve(); await Promise.allSettled([holder, pending]); }
        await pending;
        expect((await repo.get(h.handle, 'Alice', 'main'))?.body[0].mes).toBe(action === 'delete' ? undefined : action === 'edit' ? 'edited' : 'original');
    });
});
