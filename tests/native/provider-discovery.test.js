import { afterEach, expect, jest, test } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import supertest from 'supertest';
import { discoverProviderModels, prepareProviderDiscovery } from '../../src/native/adapters/provider-discovery.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { assertModelProfile } from '../../src/native/model-prompt-runtime/contracts.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const connection = (format, endpoint) => ({ schemaVersion: 1, scope: 'player', connectionProfileId: 'conn_' + '1'.repeat(32), displayName: 'Test',
    providerAdapter: 'provider.' + format, transport: 'transport.http', endpoint, secretRef: { scope: 'player', secretId: 'exact-id' }, options: {}, networkPolicy: {} });
async function server(handler) {
    const value = createServer(handler); await new Promise(resolve => value.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise(resolve => { value.closeAllConnections(); value.close(resolve); }));
    return `http://127.0.0.1:${value.address().port}`;
}
test.each(['openai-compatible', 'raw-text', 'anthropic', 'gemini'])('%s discovery uses protocol auth and never sends generation', async format => {
    const requests = [];
    const base = await server((req, res) => {
        requests.push({ method: req.method, url: req.url, headers: req.headers });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(format === 'gemini' ? { models: [{ name: 'models/one', displayName: 'One', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 8000, outputTokenLimit: 2000, thinking: false }], ...(requests.length === 1 ? { nextPageToken: 'next' } : {}) }
            : { data: [{ id: 'one', display_name: 'One', max_input_tokens: 8000, max_tokens: 2000, capabilities: { thinking: { supported: true } } }] }));
    });
    const path = format === 'gemini' ? '/v1beta' : format === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
    const result = await discoverProviderModels(connection(format, base + path), { secret: 'test-private-key' });
    expect(result.status).toBe('reachable'); expect(requests.every(req => req.method === 'GET')).toBe(true);
    expect(requests[0].url).toBe(format === 'gemini' ? '/v1beta/models' : '/v1/models');
    const header = format === 'gemini' ? 'x-goog-api-key' : format === 'anthropic' ? 'x-api-key' : 'authorization';
    expect(requests[0].headers[header]).toBe(header === 'authorization' ? 'Bearer test-private-key' : 'test-private-key');
    expect(result.models[0]).toMatchObject({ remoteModelId: 'one', provenance: [{ kind: 'provider-discovery' }] });
    expect(result.models[0].limits).toEqual(['anthropic', 'gemini'].includes(format) ? { contextTokens: 8000, outputTokens: 2000 } : {});
    expect(JSON.stringify(result)).not.toContain('test-private-key');
    const metadata = result.models[0];
    const model = assertModelProfile({ schemaVersion: 1, scope: 'player', modelProfileId: 'model_' + '1'.repeat(32), displayName: 'One',
        connectionProfileRef: { scope: 'player', connectionProfileId: 'conn_' + '1'.repeat(32) }, remoteModelId: 'one', limits: { contextTokens: 8000, outputTokens: 2000 },
        limitProvenance: { contextTokens: metadata.provenance }, capabilities: metadata.capabilities });
    expect(model.limitProvenance.contextTokens[0].kind).toBe('provider-discovery');
});
test.each([[401, 'authentication_failed'], [404, 'probe_unsupported'], [500, 'unavailable']])('HTTP %s is actionable without returning provider body', async (status, code) => {
    const base = await server((_req, res) => { res.writeHead(status); res.end('sensitive-provider-error'); });
    await expect(discoverProviderModels(connection('anthropic', base + '/v1/messages'), { secret: 'private' })).rejects.toMatchObject({ code: 'native_provider_' + code });
});
test('unsafe and unknown endpoints fail before any credential resolution', async () => {
    expect(() => prepareProviderDiscovery(connection('gemini', 'https://user:pass@example.invalid/v1'))).toThrow('native_provider_endpoint_invalid');
    const secretPort = { resolveSecret: jest.fn() }; const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: 'owner' } }; next(); });
    app.use(createNativeGenerationRouter(() => ({ secretPort })));
    await supertest(app).post('/connections/probe').send(connection('openai-compatible', 'https://example.invalid/custom')).expect(400);
    expect(secretPort.resolveSecret).not.toHaveBeenCalled();
});
test('authenticated probe resolves the exact owner once without invoking persistence', async () => {
    const base = await server((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"data":[]}'); });
    const secretPort = { resolveSecret: jest.fn(async () => 'private') }; const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-test-auth']) req.user = { profile: { handle: 'owner' } }; next(); });
    app.use(createNativeGenerationRouter(() => ({ secretPort })));
    await supertest(app).post('/connections/probe').send(connection('openai-compatible', base + '/v1/chat/completions')).expect(401);
    await supertest(app).post('/connections/probe').set('x-test-auth', 'yes').send(connection('openai-compatible', base + '/v1/chat/completions')).expect(200);
    expect(secretPort.resolveSecret).toHaveBeenCalledWith({ scope: 'player', secretId: 'exact-id' }, { handle: 'owner' });
});

test.each([{ data: [{ id: 'private-key' }] }, { data: [] , has_more: true, last_id: 'repeated' }, { unexpected: true }])('malformed, credential-echo and looping discovery fail closed', async payload => {
    const base = await server((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); });
    await expect(discoverProviderModels(connection('anthropic', base + '/v1/messages'), { secret: 'private-key' })).rejects.toMatchObject({ code: 'native_provider_response_invalid' });
});
