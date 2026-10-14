import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerRuntimeActions } from '../src/runtime-actions.js';
import { redact } from '../src/policy.js';

function fixture(readData = null) {
    const boot = randomUUID(), calls = [], connection = { connectionProfileId: 'conn', endpoint: 'https://example.com/v1/chat/completions', secretRef: { secretId: 'opaque' } };
    let authorized = false, prompts = 0, probes = 0, clock = 1000;
    const target = { endpoint: connection.endpoint, secretRef: connection.secretRef };
    const view = () => ({ connectionProfileId: 'conn', connectionFingerprint: fingerprint(connection), target, targetFingerprint: fingerprint(target), permitFingerprint: fingerprint(authorized), authorized });
    const response = data => ({ status: () => 200, ok: () => true, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost:8000', timeout: 100, maxResponseBytes: 1048576 }, start: async () => {},
        runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }), context: { request: {
            get: async () => response({ token: 'fixture-csrf' }), fetch: async (url, options) => {
                calls.push({ url, ...options });
                const path = new URL(url).pathname;
                if (readData !== null) return response(readData);
                if (path.endsWith('/configuration')) return response({ connections: [connection], models: [], routes: [] });
                if (path.endsWith('/credential-target/inspect')) return response(view());
                if (path.endsWith('/credential-target/authorize')) { authorized = true; return response(view()); }
                if (path.endsWith('/connections/probe')) { probes++; return response({ models: [] }); }
                if (path.endsWith('/resources/current')) return response(null);
                if (path.endsWith('/execute/start')) return response({ operationId: 'operation' });
                return response({ preview: true, password: 'sensitive', snapshot: { requestId: options.data?.requestId, createdAt: clock++,
                    connectionProfileId: 'conn', runtimeRouteId: 'route', contextPlan: { source: { projectId: 'p', revision: 'r1' } }, diagnostics: { executionPlan: {} } } });
            },
        } } };
    const registry = registerRuntimeActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { prompts++; return { action: 'accept', content: { authorize: true, uses: 1 } }; } });
    return { registry, executor, browser, calls, connection, view, get prompts() { return prompts; }, get probes() { return probes; } };
}

test('Runtime exact schema rejects arbitrary URLs/paths, misplaced approval and ambiguous preview sources', async () => {
    const f = fixture();
    await assert.rejects(f.executor.execute('READ', { action: 'runtime.prompt.preview', input: { requestId: 'r', role: 'narrator', routeRef: { scope: 'player', runtimeRouteId: 'route' }, projectId: 'p', revision: 'r1', sessionId: 's' } }));
    for (const input of [{ connectionProfileId: 'conn', endpoint: 'https://evil.invalid' }, { connectionProfileId: '../private' }, { connectionProfileId: 'conn', confirm: true }])
        await assert.rejects(f.executor.execute('READ', { action: 'runtime.connection.target.inspect', input }));
    assert.equal(f.calls.length, 0);
    assert.equal(f.registry.get('runtime.connection.probe').detail.risk, 'INTERACT');
    assert.equal(f.registry.get('runtime.prompt.preview').detail.risk, 'READ');
});

test('large Runtime READ results remain fully reachable after whole-document redaction without forwarding pagination', async () => {
    const data = { text: '汉字😀-'.repeat(10000) + ' api_key=fixture-private-value END', password: 'private-password' }, expected = JSON.stringify(redact(data));
    for (const [action, input] of [
        ['runtime.generation.result', { operationId: 'operation' }],
        ['runtime.resource.exact', { scope: 'library', resourceType: 'core.prompt-module', resourceId: 'module', revision: 'r1' }],
        ['runtime.context.preview', { requestId: 'r', role: 'narrator', routeRef: { scope: 'player', runtimeRouteId: 'route' }, projectId: 'p', revision: 'r1' }],
    ]) {
        const f = fixture(data), fragments = []; let offset = 0, contentHash;
        do {
            const result = await f.executor.execute('READ', { action, input: { ...input, outputOffset: offset, outputLimit: 1999 } });
            assert.equal(result.data.encoding, 'hex-utf16le'); assert.equal(result.page.totalChars, expected.length);
            assert.equal(result.page.contentHash, fingerprint(redact(data))); contentHash ??= result.page.contentHash;
            assert.equal(result.page.contentHash, contentHash); assert.equal(result.page.offset, offset);
            fragments.push(Buffer.from(result.data.encodedText, 'hex').toString('utf16le')); offset = result.page.nextOffset;
        } while (offset !== null);
        assert.equal(fragments.join(''), expected); assert.doesNotMatch(fragments.join(''), /fixture-private-value|private-password/);
        assert.equal(f.prompts, 0);
        for (const call of f.calls) {
            assert.equal(new URL(call.url).search, '');
            assert.equal(call.data?.outputOffset, undefined); assert.equal(call.data?.outputLimit, undefined);
            if (call.method === 'POST') assert.deepEqual(call.data, input);
        }
        const schema = f.registry.get(action).detail.inputSchema;
        assert.equal(schema.additionalProperties, false); assert.ok(schema.properties.outputOffset); assert.ok(schema.properties.outputLimit);
        if (action === 'runtime.context.preview') await assert.rejects(f.executor.execute('READ', { action, input: { ...input, sessionId: 's', revisionId: 'r' } }));
    }
});

test('Runtime pagination bounds are strict and unavailable to mutations', async () => {
    const f = fixture();
    for (const page of [{ outputOffset: -1 }, { outputOffset: 0.5 }, { outputLimit: 0 }, { outputLimit: 24001 }, { arbitraryPage: 1 }])
        await assert.rejects(f.executor.execute('READ', { action: 'runtime.generation.result', input: { operationId: 'operation', ...page } }));
    await assert.rejects(f.executor.execute('INTERACT', { action: 'runtime.generation.stop', input: { operationId: 'operation', outputOffset: 0 } }));
    assert.equal(f.calls.length, 0);
});

test('reviewed generation ignores preview timestamps but binds stable request/configuration at the Native start boundary', async () => {
    const f = fixture(), view = f.view();
    await f.executor.execute('MUTATE', { action: 'runtime.connection.target.authorize', input: { connectionProfileId: 'conn', expectedFingerprint: view.connectionFingerprint,
        expectedTargetFingerprint: view.targetFingerprint, expectedPermitFingerprint: view.permitFingerprint } });
    const result = await f.executor.execute('INTERACT', { action: 'runtime.generation.start', input: { requestId: 'r', role: 'narrator',
        routeRef: { scope: 'player', runtimeRouteId: 'route' }, projectId: 'p', revision: 'r1' } });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.prompts, 2); assert.equal(result.result.data.operationId, 'operation');
    const request = f.calls.find(c => c.url.endsWith('/execute/start'));
    assert.equal(request.data.input.requestId, 'r'); assert.match(request.data.approvedReview.snapshotFingerprint, /^[a-f0-9]{64}$/);
    assert.match(request.data.approvedReview.configurationFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(request.data.input.approvedReview, undefined);
});

test('Native target authorization is an independent approval and probe refuses an unapproved credential destination', async () => {
    const f = fixture(), view = f.view();
    const input = { connectionProfileId: 'conn', expectedFingerprint: view.connectionFingerprint, expectedTargetFingerprint: view.targetFingerprint };
    await assert.rejects(f.executor.execute('INTERACT', { action: 'runtime.connection.probe', input }), /permit/);
    assert.equal(f.probes, 0); assert.equal(f.prompts, 0);
    const granted = await f.executor.execute('MUTATE', { action: 'runtime.connection.target.authorize', input: { ...input, expectedPermitFingerprint: view.permitFingerprint } });
    assert.equal(granted.receipt.status, 'succeeded'); assert.equal(f.prompts, 1); assert.equal(f.probes, 0);
    const probed = await f.executor.execute('INTERACT', { action: 'runtime.connection.probe', input });
    assert.equal(probed.receipt.status, 'succeeded'); assert.equal(f.prompts, 2); assert.equal(f.probes, 1);
    const native = f.calls.find(c => c.url.endsWith('/connections/probe'));
    assert.equal(native.data.endpoint, f.connection.endpoint); assert.ok(native.headers['x-atria-expected-server-boot-id']);
});

test('pure Preview invokes only fixed Native compile authority; Library revision publication carries native current-revision CAS', async () => {
    const f = fixture();
    const preview = await f.executor.execute('READ', { action: 'runtime.prompt.preview', input: { requestId: 'r', role: 'narrator',
        routeRef: { scope: 'player', runtimeRouteId: 'route' }, projectId: 'p', revision: 'r1' } });
    assert.equal(preview.ok, true); assert.equal(preview.data.password, '[REDACTED]'); assert.equal(f.prompts, 0); assert.equal(f.probes, 0);
    const result = await f.executor.execute('MUTATE', { action: 'runtime.resource.revision.create', input: { resourceType: 'core.prompt-module',
        resource: { promptModuleId: 'module', revision: 'r2' }, expectedCurrentRevision: null } });
    assert.equal(result.receipt.status, 'succeeded');
    const native = f.calls.find(c => c.url.endsWith('/resources/revision'));
    assert.equal(native.data.expectedCurrentRevision, null); assert.equal(native.data.resource.revision, 'r2');
});
