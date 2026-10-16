import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { makeEndpointHarness } from '../harness/endpoint-harness.js';
import { router as chatsRouter, _resetChatBackupThrottlesForTests } from '../../../src/endpoints/chats.js';
import { router as charactersRouter, diskCache } from '../../../src/endpoints/characters.js';
import { getChatRepo } from '../../../src/storage/index.js';
import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { withChatWrite } from '../../../src/storage/repositories/chat-write-boundary.js';
import { write as writeCard } from '../../../src/character-card-parser.js';
import { createGenerationJob, completeGenerationJobFromText, subscribeToJob, failGenerationJob } from '../../../src/endpoints/backends/atria-generation.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const HEADER = { user_name: 'User', character_name: 'Alice', chat_metadata: {} };
const turn = mes => [{ name: 'User', is_user: true, mes }];

// Real PNG reads initialize the original cache's periodic maintenance timer.
afterAll(() => diskCache.dispose());

// Real online authorities only. Sync/restore publication is a separate gate;
// these synthetic replies never mint a V3 model or final-output permission.
describe.each(['fs', 'sqlite'])('RP online write boundaries on %s', mode => {
    let h, incoming;
    beforeEach(async () => {
        _resetChatBackupThrottlesForTests();
        incoming = null;
        h = await makeEndpointHarness({ mode, mount: app => {
            app.use((req, _res, next) => { next(); incoming?.resolve(req.path); });
            app.use('/api/chats', chatsRouter);
            app.use('/api/characters', charactersRouter);
        } });
    });
    afterEach(async () => {
        jest.restoreAllMocks(); jest.useRealTimers();
        _resetChatBackupThrottlesForTests();
        await h?.cleanup();
    });

    test('state patch waits outside Engine before its original storage mutation', async () => {
        if (mode === 'sqlite') await getChatRepo().save(h.handle, 'Alice', 'missing', HEADER, [], null);
        const entered = deferred(), release = deferred();
        const holder = withChatWrite(h.handle, async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        incoming = deferred();
        const transactions = jest.spyOn(h.engine, 'withTransaction');
        let settled = false;
        const pending = request(h.app).post('/api/chats/state/patch').send({ avatar_url: 'Alice.png', file_name: 'missing', namespace: 'demo',
            operations: [{ op: 'add', path: '/value', value: 'real sidecar' }] }).then(result => { settled = true; return result; });
        try {
            await incoming.promise;
            expect(settled).toBe(false);
            expect(transactions).not.toHaveBeenCalled();
        } finally { release.resolve(); await holder; await pending; }
        expect((await pending).status).toBe(200);
        transactions.mockRestore();
        expect((await getChatRepo().get(h.handle, 'Alice', 'missing')) === null).toBe(mode === 'fs');
        expect(await getChatRepo().getState(h.handle, 'Alice', 'missing', 'demo')).toEqual({ value: 'real sidecar' });
        await h.reopenEngine();
        expect(await getChatRepo().getState(h.handle, 'Alice', 'missing', 'demo')).toEqual({ value: 'real sidecar' });
    });

    test('absent-parent state patch preserves original FS permissiveness and SQLite refusal', async () => {
        const result = await request(h.app).post('/api/chats/state/patch').send({ avatar_url: 'Alice.png', file_name: 'absent', namespace: 'demo',
            operations: [{ op: 'add', path: '/value', value: 'source state' }] });
        // The original SQLite writer enforces a parent; raw EngineTx never
        // granted the FS-only permissive behavior to relational storage.
        expect(result.status).toBe(mode === 'fs' ? 200 : 500);
        await h.reopenEngine();
        expect(await getChatRepo().get(h.handle, 'Alice', 'absent')).toBeNull();
        expect(await getChatRepo().getState(h.handle, 'Alice', 'absent', 'demo')).toEqual(mode === 'fs' ? { value: 'source state' } : null);
    });

    test.each(['character', 'group'])('original %s job autosave uses authenticated owner and the active Engine', async kind => {
        const repo = getChatRepo(), group = kind === 'group', charDir = group ? '' : 'Alice', name = 'autosave';
        const route = group ? { isGroup: true, groupId: name } : {};
        await repo.save(h.handle, charDir, name, HEADER, turn('original active-engine source'), null, route);
        const req = { user: { profile: { handle: h.handle }, directories: h.dirs }, body: { model: 'synthetic', handle: 'untrusted' } };
        const job = createGenerationJob(req, { job_id: 'boundary-' + randomUUID(), persist_target: group
            ? { kind, id: name } : { kind, avatar_url: 'Alice.png', file_name: name + '.jsonl' } });
        expect(job.handle).toBe(h.handle); expect(job.requestMeta.handle).toBeUndefined();
        const done = deferred();
        const unsubscribe = subscribeToJob(job.id, event => { if (event.type === 'status' && ['completed', 'failed'].includes(event.status)) done.resolve(); });
        const append = jest.spyOn(repo, 'append'), entered = deferred(), release = deferred();
        const holder = withChatWrite(h.handle, async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'performance'] });
        try {
            await completeGenerationJobFromText(req, job, 'Synthetic original job response');
            await jest.advanceTimersByTimeAsync(60000);
            expect(job.status).toBe('persisting');
            expect(job.persisted).toBe(false);
            release.resolve(); await holder;
            await done.promise;
            expect(job.status).toBe('completed'); expect(job.persisted).toBe(true);
            expect(append).toHaveBeenCalledWith(h.handle, charDir, name, expect.any(Array), null, expect.objectContaining({ isGroup: group }));
        } finally {
            release.resolve(); await holder; unsubscribe();
            if (job.persistenceTimer) failGenerationJob(job, 'test cleanup');
            jest.useRealTimers(); append.mockRestore();
        }
        const actual = await getChatRepo().get(h.handle, charDir, name, route);
        expect(actual.body.map(message => message.mes)).toEqual(['original active-engine source', 'Synthetic original job response']);
        await h.reopenEngine();
        expect((await getChatRepo().get(h.handle, charDir, name, route)).body).toEqual(actual.body);
    });

    test.each(['rename', 'delete'])('character %s keeps a follower behind the original Repo and raw filesystem tail', async action => {
        const originalImage = fs.readFileSync(path.resolve('../default/content/default_Seraphina.png'));
        fs.writeFileSync(path.join(h.dirs.characters, 'Alice.png'), writeCard(originalImage, JSON.stringify({
            name: 'Alice', spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Alice', extensions: {} },
        })));
        const oldDir = path.join(h.dirs.chats, 'Alice'); fs.mkdirSync(oldDir, { recursive: true });
        fs.writeFileSync(path.join(oldDir, 'synthetic-sidecar.txt'), 'original sidecar');
        const repo = getChatRepo(); await repo.save(h.handle, 'Alice', 'original', HEADER, turn('original'), null);
        const repoDone = deferred(), release = deferred(), method = action === 'rename' ? 'renameCharDir' : 'deleteAllForCharacter';
        const original = ChatRepo.prototype[method];
        const seam = jest.spyOn(ChatRepo.prototype, method).mockImplementation(async function (...args) {
            const value = await original.apply(this, args); repoDone.resolve(); await release.promise; return value;
        });
        const pending = request(h.app).post('/api/characters/' + action).send(action === 'rename'
            ? { avatar_url: 'Alice.png', new_name: 'Renamed' } : { avatar_url: 'Alice.png', delete_chats: true }).then(result => result);
        let followerFinished = false, follower, followerTransactions;
        try {
            await repoDone.promise;
            followerTransactions = jest.spyOn(h.engine, 'withTransaction');
            follower = repo.save(h.handle, 'Alice', 'after-tail', HEADER, turn('follower'), null).then(value => { followerFinished = true; return value; });
            // The delegate has returned from the original Repo transaction but
            // the real endpoint still owns its domain scope before raw FS work.
            await new Promise(resolve => setImmediate(resolve));
            expect(followerFinished).toBe(false);
            expect(followerTransactions).not.toHaveBeenCalled();
        } finally {
            followerTransactions?.mockRestore(); release.resolve(); seam.mockRestore();
            await pending; await follower;
        }
        const response = await pending; expect(response.status).toBe(200);
        await follower;
        expect((await repo.get(h.handle, 'Alice', 'after-tail')).body).toEqual(turn('follower'));
        const originalDirectory = action === 'rename' ? response.body.avatar.replace(/\.png$/, '') : 'Alice';
        const retained = await repo.get(h.handle, originalDirectory, 'original');
        expect(retained?.body ?? null).toEqual(action === 'rename' ? turn('original') : null);
        await h.reopenEngine();
        expect((await getChatRepo().get(h.handle, 'Alice', 'after-tail')).body).toEqual(turn('follower'));
    });
});
