import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import request from 'supertest';
import archiver from 'archiver';
import storage from 'node-persist';
import { makeEndpointHarness } from '../harness/endpoint-harness.js';
import { router } from '../../../src/endpoints/users-private.js';
import { getChatRepo } from '../../../src/storage/index.js';
import { withChatWrite } from '../../../src/storage/repositories/chat-write-boundary.js';
import { restoreFromSnapshot, snapshotUser } from '../../../src/storage/migration/backup.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../../src/native/contracts.js';
import { createNativeId } from '../../../src/native/identity.js';
import { nativeRecord } from '../../../src/native/repositories/common.js';
import { getUserDirectories } from '../../../src/users.js';
import { USER_DIRECTORY_TEMPLATE } from '../../../src/constants.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const header = { user_name: 'User', character_name: 'Alice', chat_metadata: {} };
const body = mes => [{ name: 'User', is_user: true, mes }];
const selection = { settings: false, secrets: false, characters: false, chats: true, lorebooks: false,
    presets: false, assets: false, native: false, extensions: false, globalExtensions: false, vectors: false };

describe.each(['fs', 'sqlite'])('%s original account restore publication', mode => {
    let h, upload, resetArrived;
    const previousRoot = globalThis.DATA_ROOT;
    beforeEach(async () => {
        h = await makeEndpointHarness({ mode, mount: (app, { handle: _handle, dirs }) => {
            const uploads = path.join(dirs.root, '..', 'uploads'); fs.mkdirSync(uploads, { recursive: true });
            app.use((req, _res, next) => {
                const reset = req.path.startsWith('/api/users/reset-'); next(); if (reset) resetArrived?.resolve();
            });
            app.use('/api/users/restore-backup', multer({ dest: uploads }).single('avatar'));
            app.use('/api/users', router);
        } });
        globalThis.DATA_ROOT = h.dataRoot;
        await getChatRepo().save(h.handle, 'Alice', 'main', header, body('original'), null);
        upload = path.join(h.dataRoot, 'remote.zip');
        await new Promise((resolve, reject) => {
            const out = fs.createWriteStream(upload), zip = archiver('zip');
            out.on('close', resolve); out.on('error', reject); zip.on('error', reject); zip.pipe(out);
            zip.append([header, ...body('restored')].map(row => JSON.stringify(row)).join('\n') + '\n', { name: 'chats/Alice/main.jsonl' });
            zip.finalize();
        });
    });
    afterEach(async () => { resetArrived = null; jest.restoreAllMocks(); await h.cleanup(); globalThis.DATA_ROOT = previousRoot; });
    const restore = () => request(h.app).post('/api/users/restore-backup').field('handle', h.handle)
        .field('mode', 'overwrite').field('selection', JSON.stringify(selection)).attach('avatar', upload, 'remote.zip').then(value => value);

    async function atSnapshot(action) {
        const entered = deferred(), release = deferred(), copy = fs.promises.cp;
        jest.spyOn(fs.promises, 'cp').mockImplementation(async (...args) => {
            const result = await copy(...args);
            if (args[0] === h.dirs.root) { entered.resolve(); await release.promise; }
            return result;
        });
        const pending = action();
        let follower, admitted = false;
        try {
            await Promise.race([entered.promise, pending.then(() => { throw new Error('Snapshot seam was not reached'); })]);
            follower = withChatWrite(h.handle, async () => { admitted = true; return getChatRepo().get(h.handle, 'Alice', 'main'); });
            await new Promise(resolve => setImmediate(resolve));
            expect(admitted).toBe(false);
        } finally { release.resolve(); await Promise.allSettled([pending, follower]); }
        return { response: await pending, chat: await follower };
    }

    test('HTTP overwrite holds the original domain from snapshot through extraction', async () => {
        const { response, chat } = await atSnapshot(restore);
        expect(response.status).toBe(200);
        expect(chat.body[0].mes).toBe('restored');
        await h.reopenEngine();
        expect((await getChatRepo().get(h.handle, 'Alice', 'main')).body[0].mes).toBe('restored');
    });

    test('HTTP recovery apply keeps its undo snapshot and original raw-root replay inside the domain', async () => {
        const saved = await restore(); expect(saved.status).toBe(200);
        const { response, chat } = await atSnapshot(() => request(h.app).post('/api/users/restore-backup/recovery/apply')
            .send({ id: saved.body.recoveryPoint }).then(value => value));
        expect(response.status).toBe(200); expect(chat.body[0].mes).toBe('original');
        await h.reopenEngine();
        expect((await getChatRepo().get(h.handle, 'Alice', 'main')).body[0].mes).toBe('original');
    });

    test('settings reset waits for the original domain before its raw file deletion', async () => {
        const file = path.join(h.dirs.root, 'settings.json'); fs.writeFileSync(file, '{"synthetic":true}');
        const entered = deferred(), release = deferred(); resetArrived = deferred();
        const holder = withChatWrite(h.handle, async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        const remove = jest.spyOn(fs.promises, 'rm');
        const pending = request(h.app).post('/api/users/reset-settings').send({}).then(value => value);
        try {
            await resetArrived.promise; expect(remove).not.toHaveBeenCalled();
            expect(fs.readFileSync(file, 'utf8')).toBe('{"synthetic":true}');
        } finally { release.resolve(); await Promise.allSettled([holder, pending]); }
        expect((await pending).status).toBe(204);
    });

    test('authenticated account reset waits for consumers, evicts the original Engine and preserves its Host identity', async () => {
        await storage.init({ dir: path.join(h.dataRoot, '_accounts'), ttl: false, expiredInterval: 0 });
        await storage.setItem('user:' + h.handle, { handle: h.handle, name: 'Test', enabled: true, admin: true });
        Object.assign(getUserDirectories(h.handle), Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE)
            .map(([key, rel]) => [key, path.join(h.dirs.root, rel)])));
        const identity = fs.readFileSync(path.join(h.dirs.root, 'native-host.identity'), 'utf8');
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        expect((await request(h.app).post('/api/users/reset-step1').send({})).status).toBe(204);
        const printed = log.mock.calls.flat().map(value => String(value).replace(/\x1b\[[0-9;]*m/g, '')).join('\n');
        const code = printed.match(/reset code is: (\d{6})/)[1];
        const entered = deferred(), release = deferred(); resetArrived = deferred();
        const holder = withChatWrite(h.handle, async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        const deletion = jest.spyOn(h.engine, 'deleteUser');
        const pending = request(h.app).post('/api/users/reset-step2').send({ code }).then(value => value);
        try { await resetArrived.promise; expect(deletion).not.toHaveBeenCalled(); }
        finally { release.resolve(); await Promise.allSettled([holder, pending]); }
        expect((await pending).status).toBe(204);
        expect(deletion).toHaveBeenCalledWith(h.handle);
        expect(fs.readFileSync(path.join(h.dirs.root, 'native-host.identity'), 'utf8')).toBe(identity);
        expect((await getChatRepo().get(h.handle, 'Alice', 'main'))).toBeNull();
        await h.reopenEngine();
        expect((await getChatRepo().get(h.handle, 'Alice', 'main'))).toBeNull();
    });

    test('chat-only restore, recovery apply and direct snapshot replay refuse retained V3 history before snapshot or clear', async () => {
        const backupPath = await snapshotUser({ handle: h.handle, userRoot: h.dirs.root,
            backupRoot: path.join(h.dataRoot, '_restore-recovery'), engine: h.engine, metadata: { purpose: 'backup-restore' } });
        // Even an orphan/malformed root is retention, never absence of history.
        const key = { kind: K.orchestrationRun, handle: h.handle, runId: createNativeId('orchestrationRun') };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ retained: true })));
        const copy = jest.spyOn(fs.promises, 'cp'), remove = jest.spyOn(fs.promises, 'rm');
        const restored = await restore();
        const recovered = await request(h.app).post('/api/users/restore-backup/recovery/apply').send({ id: path.basename(backupPath) });
        expect([restored.status, recovered.status]).toEqual([409, 409]);
        expect([restored.body.code, recovered.body.code]).toEqual(Array(2).fill('native_orchestration_retention_review_required'));
        await expect(restoreFromSnapshot({ handle: h.handle, userRoot: h.dirs.root, backupPath, engine: h.engine }))
            .rejects.toMatchObject({ code: 'native_orchestration_retention_review_required' });
        expect(copy).not.toHaveBeenCalled();
        expect(remove.mock.calls.filter(([target]) => path.resolve(target) === h.dirs.root
            || path.resolve(target).startsWith(h.dirs.root + path.sep))).toEqual([]);
        expect((await getChatRepo().get(h.handle, 'Alice', 'main')).body[0].mes).toBe('original');
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).toMatchObject({ doc: { retained: true } });
    });
});
