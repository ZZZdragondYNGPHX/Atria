import { afterEach, expect, jest, test } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { CredentialTargetAuthority, canonicalCredentialTarget, createCredentialSecretPort } from '../../src/native/model-prompt-runtime/credential-targets.js';
import { credentialLookup, credentialFetch, publicTargetFetch } from '../../src/native/model-prompt-runtime/credential-fetch.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); });
async function fixture(endpoint = 'https://api.fixture.invalid/v1/chat/completions') {
    const h = await makeTempFsEngine(); cleanup.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint });
    return { ...h, ...seeded, authority: new CredentialTargetAuthority({ persistence: seeded.persistence }) };
}
async function authorize(f, allowLocal) {
    const view = await f.authority.inspect(f.handle, { connectionProfileId: f.connection.connectionProfileId });
    return f.authority.authorize(f.handle, { connectionProfileId: view.connectionProfileId, expectedFingerprint: view.connectionFingerprint,
        expectedTargetFingerprint: view.targetFingerprint, expectedPermitFingerprint: view.permitFingerprint, ...(allowLocal ? { allowLocal } : {}) });
}

test('Native credential permits require separate exact CAS authorization; profile writes and reads never mint', async () => {
    const f = await fixture(), connection = await f.persistence.getConnectionProfile(f.handle, f.connection.connectionProfileId);
    expect((await f.authority.inspect(f.handle, { connectionProfileId: connection.connectionProfileId })).authorized).toBe(false);
    await expect(f.authority.assertConnection(f.handle, connection)).rejects.toMatchObject({ code: 'native_credential_target_approval_required' });
    await authorize(f);
    await expect(f.authority.assertConnection(f.handle, connection)).resolves.toMatchObject({ endpoint: connection.endpoint });
    const changed = { ...connection, endpoint: 'https://attacker.fixture.invalid/v1/chat/completions' };
    await f.persistence.saveConnectionProfile(f.handle, changed, { expectedFingerprint: hashNativeDocument(connection) });
    await expect(f.authority.assertConnection(f.handle, changed)).rejects.toMatchObject({ code: 'native_credential_target_approval_required' });
    await expect(f.authority.assertConnection(f.handle, connection)).rejects.toMatchObject({ code: 'native_credential_connection_stale' });
    const cloned = { ...connection, connectionProfileId: createNativeId('connectionProfile') };
    await f.persistence.saveConnectionProfile(f.handle, cloned);
    await expect(f.authority.assertConnection(f.handle, cloned)).rejects.toMatchObject({ code: 'native_credential_target_approval_required' });
    await expect(f.authority.assertConnection('foreign', changed)).rejects.toThrow();
});

test('credential transport blocks private/metadata/http downgrade and pins vetted DNS addresses at lookup', async () => {
    for (const endpoint of ['http://public.fixture.invalid/v1', 'https://169.254.169.254/token', 'https://10.0.0.1/v1', 'https://user:pass@example.com/v1']) {
        const f = await fixture();
        const value = { ...f.connection, endpoint };
        expect(() => canonicalCredentialTarget(value)).toThrow();
    }
    // Explicit loopback is local and always requires a separate local permit.
    const local = await fixture();
    expect(canonicalCredentialTarget({ ...local.connection, endpoint: 'https://[::ffff:127.0.0.2]/v1' }).local).toBe(true);
    const check = addresses => new Promise(resolve => credentialLookup(async () => addresses)('example.com', { all: true }, (error, result) => resolve({ error, result })));
    expect((await check([{ address: '10.1.2.3', family: 4 }])).error.code).toBe('native_credential_network_denied');
    const vetted = [{ address: '1.1.1.1', family: 4 }];
    expect((await check(vetted)).result).toEqual(vetted);
    expect((await check([...vetted, { address: '127.0.0.1', family: 4 }])).error.code).toBe('native_credential_network_denied');
    await expect(publicTargetFetch('http://127.0.0.1:1/private')).rejects.toThrow();
});

test('real local Native Provider send resolves no Secret before permit and sends only after explicit local approval', async () => {
    let sends = 0, observedCredential;
    const server = createServer(async (request, response) => {
        sends++; observedCredential = request.headers.authorization;
        for await (const _chunk of request) { /* discard fixture input */ }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'Synthetic response' } }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const f = await fixture(`http://127.0.0.1:${server.address().port}/v1/chat/completions`);
    const resolveSecret = jest.fn(async () => 'synthetic-only-credential');
    const secretPort = createCredentialSecretPort({ authority: f.authority, resolveSecret });
    const projectId = createNativeId('project'), project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const host = new NativeGenerationHost({ persistence: f.persistence, library: f.library, studio: { getProject: async () => project },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: credentialFetch }) }, secretPort });
    const input = { role: 'narrator', projectId, revision: 'r1', messages: [{ role: 'user', content: 'fixture only' }] };
    await expect(host.execute(f.handle, { ...input, requestId: 'unapproved' })).rejects.toMatchObject({ code: 'native_credential_target_approval_required' });
    expect(resolveSecret).not.toHaveBeenCalled(); expect(sends).toBe(0);
    await expect(authorize(f)).rejects.toMatchObject({ code: 'native_credential_local_approval_required' });
    await authorize(f, true);
    const result = await host.execute(f.handle, { ...input, requestId: 'approved' });
    expect(result.response.text).toBe('Synthetic response'); expect(sends).toBe(1);
    expect(observedCredential).toBe('Bearer synthetic-only-credential');
});

test('HTTP probe refuses unapproved saved targets and target substitution before Secret resolution', async () => {
    const f = await fixture(), resolveSecret = jest.fn(async () => { throw new Error('No real credential access'); });
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: f.handle } }; next(); });
    app.use(createNativeGenerationRouter(() => ({ persistence: f.persistence, secretPort: { resolveSecret } }), () => null));
    const connection = await f.persistence.getConnectionProfile(f.handle, f.connection.connectionProfileId);
    const response = await supertest(app).post('/connections/probe').send(connection).expect(400);
    expect(response.body.error).toBe('native_credential_target_approval_required');
    await authorize(f);
    const changed = { ...connection, endpoint: 'https://different.fixture.invalid/v1/chat/completions' };
    expect((await supertest(app).post('/connections/probe').send(changed).expect(400)).body.error).toBe('native_credential_connection_stale');
    expect(resolveSecret).not.toHaveBeenCalled();
});
