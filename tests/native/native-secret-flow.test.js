import { afterEach, expect, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { getUserDirectories } from '../../src/users.js';
import { SecretManager, SECRET_KEYS } from '../../src/endpoints/secrets.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const cleanups = [];
afterEach(async () => { setReadOnly(false); for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture() {
    const h = await makeTempFsEngine();
    globalThis.DATA_ROOT ||= h.dataRoot;
    const directories = getUserDirectories(h.handle); const previous = { ...directories };
    Object.assign(directories, h.dirs);
    cleanups.push(async () => { Object.assign(directories, previous); await h.cleanup(); });
    const manager = new SecretManager(h.dirs);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-test-auth']) req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeGenerationRouter(() => { throw new Error('Secret inventory does not need generation services'); }));
    return { manager, request: supertest(app) };
}
test('Native inventory and creation return exact metadata without values or active-key mutation', async () => {
    const { manager, request } = await fixture();
    const existing = manager.writeSecret(SECRET_KEYS.OPENAI, 'existing-private-key', 'Existing');
    const created = await request.post('/secrets').set('x-test-auth', 'yes').send({ label: 'Native provider', value: 'native-private-key' }).expect(201);
    expect(created.body).toEqual({ label: 'Native provider', secretId: expect.any(String) });
    expect(manager.readSecret(SECRET_KEYS.ATRIA_RUNTIME, created.body.secretId)).toBe('native-private-key');
    expect(manager.readSecret(SECRET_KEYS.ATRIA_RUNTIME)).toBe('');
    expect(manager.readSecret(SECRET_KEYS.OPENAI)).toBe('existing-private-key');
    const inventory = await request.get('/secrets').set('x-test-auth', 'yes').expect(200);
    expect(inventory.body).toEqual(expect.arrayContaining([{ secretId: existing, label: 'Existing' }, created.body]));
    expect(JSON.stringify(inventory.body)).not.toContain('private-key');
    expect(inventory.body.every(item => Object.keys(item).sort().join() === 'label,secretId')).toBe(true);
});
test('Secret endpoints authenticate, reject caller ownership and respect the backup write gate', async () => {
    const { manager, request } = await fixture();
    await request.get('/secrets').expect(401);
    await request.post('/secrets').send({ label: 'No', value: 'secret' }).expect(401);
    await request.post('/secrets').set('x-test-auth', 'yes').send({ label: 'No', value: 'secret', handle: 'other' }).expect(400);
    await request.post('/secrets').set('x-test-auth', 'yes').send({ label: '', value: 'secret' }).expect(400);
    setReadOnly(true);
    await request.post('/secrets').set('x-test-auth', 'yes').send({ label: 'No', value: 'secret' }).expect(400);
    expect(manager.listReferences()).toEqual([]);
});
