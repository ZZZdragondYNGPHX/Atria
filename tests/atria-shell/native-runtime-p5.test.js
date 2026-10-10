/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { mountNativeRuntimeWorkspace } from '../../public/scripts/native/runtime-workspace.js';
import { runtimeGenerationError } from '../../public/scripts/native/runtime-client.js';
import { NOVELAI_IMAGE_ENDPOINT, officialNovelaiCapabilities } from '../../public/shared/novelai-illustration.js';
globalThis.structuredClone ??= value => deserialize(serialize(value));
const flush = () => new Promise(done => setTimeout(done, 0));
const config = { connections: [{ schemaVersion: 1, scope: 'player', connectionProfileId: 'conn_11111111111111111111111111111111', displayName: 'Exact connection', endpoint: 'https://example.invalid/chat', providerAdapter: 'provider.openai-compatible', secretRef: { scope: 'player', secretId: 'stored-id' } }], models: [], routes: [], profiles: [], resources: [] };
const response = (body, ok = true) => ({ ok, json: async () => body });

test('G06 Route budget editor validates bounds, preserves policy and removes only the configured budget', async () => {
    const policy = { schemaVersion: 1, allowedModelProfileIds: ['model-current', 'model-fallback'], continuity: 'none', reuse: 'exact' };
    const route = { schemaVersion: 1, runtimeRouteId: 'route-budget', displayName: 'Bounded Narrator', role: 'role.narrator',
        modelProfileRef: { modelProfileId: 'model-current' }, connectionProfileRef: { connectionProfileId: config.connections[0].connectionProfileId },
        generationProfileRef: {}, promptProgramRef: {}, fallbackRouteRefs: [], executionPolicy: policy };
    let storedRoute = route;
    globalThis.fetch = jest.fn(async (url, options) => {
        if (options.method === 'PUT') { storedRoute = JSON.parse(options.body); return response(storedRoute); }
        return response(url.endsWith('/resources') ? [] : { ...config, models: [{ modelProfileId: 'model-current', displayName: 'Current model', connectionProfileRef: route.connectionProfileRef }], routes: [storedRoute] });
    });
    const body = document.createElement('div'); document.body.append(body);
    const view = mountNativeRuntimeWorkspace({ document, body, section: 'routes', route: { child: { id: 'routes:route-budget' } }, host: {} }); await flush();
    const enabled = view.root.querySelector('[aria-label="启用共享发送额度"]');
    const requests = view.root.querySelector('[aria-label="最大发送次数"]'), tokens = view.root.querySelector('[aria-label="Token 占用上限"]');
    if (!requests) throw new Error(view.root.textContent);
    expect(requests.disabled).toBe(true); expect(tokens.value).toBe('');
    enabled.checked = true; enabled.dispatchEvent(new Event('change'));
    expect(requests.required).toBe(true); expect(tokens.disabled).toBe(false);
    requests.value = '33'; tokens.value = '64000';
    const form = view.root.querySelector('form'); form.dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(globalThis.fetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false);
    expect(requests.value).toBe('33');
    requests.value = '2'; form.dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    const writes = () => globalThis.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
    expect(JSON.parse(writes()[0][1].body).executionPolicy).toEqual({ ...policy, computeBudget: { maxRequests: 2, maxTokens: 64000 } });
    view.updateRoute({ child: { id: 'routes:route-budget' } }); await flush();
    const reopened = view.root.querySelector('[aria-label="启用共享发送额度"]');
    expect(reopened.checked).toBe(true); reopened.checked = false; reopened.dispatchEvent(new Event('change'));
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(JSON.parse(writes()[1][1].body).executionPolicy).toEqual(policy);
    view.dispose();
});

test('Diagnostics pins Build inventory and requires an explicit revision selection after refresh', async () => {
    let revision = 'a'.repeat(40);
    const projectId = 'project_11111111111111111111111111111111';
    globalThis.fetch = jest.fn(async url => {
        if (url.endsWith('/studio/projects')) return response([{ project: { projectId, displayName: 'Authored world' }, revision: { revision } }]);
        if (url.endsWith('/preview')) return response({ error: 'native_generation_context_required' }, false);
        return response({ ...config, routes: [{ runtimeRouteId: 'route-one', displayName: 'Narrator', role: 'role.narrator' }] });
    });
    const body = document.createElement('div'); document.body.append(body);
    const view = mountNativeRuntimeWorkspace({ document, body, section: 'diagnostics', host: {} }); await flush();
    const project = view.root.querySelector('[aria-label="Build Project"]');
    const exact = view.root.querySelector('[aria-label="Exact Project revision"]');
    view.root.querySelector('[aria-label="Route to preview"]').value = 'route-one';
    const form = view.root.querySelector('form');
    const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
    submit(); await flush();
    expect(globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/preview'))).toHaveLength(0);
    project.value = projectId; project.dispatchEvent(new Event('change'));
    expect(exact.value).toBe(revision);
    submit(); await flush();
    const writes = globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/preview'));
    expect(JSON.parse(writes[0][1].body)).toMatchObject({ projectId, revision });
    revision = 'b'.repeat(40);
    [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Refresh Projects').click(); await flush();
    expect(exact.value).toBe(''); expect(view.root.textContent).toContain('The Project revision changed');
    submit(); await flush();
    expect(globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/preview'))).toHaveLength(1);
    exact.value = revision; exact.dispatchEvent(new Event('change')); submit(); await flush();
    expect(JSON.parse(globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/preview'))[1][1].body).revision).toBe(revision);
    view.dispose();
});

test('Diagnostics retries failed Build inventory and ignores superseded refreshes', async () => {
    const pending = [];
    globalThis.fetch = jest.fn(async url => url.endsWith('/studio/projects') ? new Promise(resolve => pending.push(resolve)) : response(config));
    const body = document.createElement('div'); document.body.append(body);
    const view = mountNativeRuntimeWorkspace({ document, body, section: 'diagnostics', host: {} }); await flush();
    pending.shift()(response({ error: 'offline' }, false)); await flush();
    expect(view.root.textContent).toContain('Could not load Build Projects');
    const refresh = [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Refresh Projects');
    refresh.click(); refresh.click();
    pending[1](response([])); await flush();
    pending[0](response([{ project: { projectId: 'stale', displayName: 'Stale project' }, revision: { revision: 'old' } }])); await flush();
    expect(view.root.textContent).toContain('No Build Projects are available');
    expect(view.root.textContent).not.toContain('Stale project');
    expect(view.root.querySelector('[aria-label="Build Project"]').disabled).toBe(true);
    view.dispose();
});
afterEach(() => { delete globalThis.fetch; document.body.replaceChildren(); });
function mount() {
    const body = document.createElement('div'); document.body.append(body);
    return mountNativeRuntimeWorkspace({ document, body, section: 'connections', route: { child: { id: 'connections:' + config.connections[0].connectionProfileId } }, host: {} });
}
test('NovelAI image connection uses the existing exact Secret store and persists an explicit compatible protocol', async () => {
    globalThis.fetch = jest.fn(async () => response(config));
    const view = mount(); await flush();
    const adapter = view.root.querySelector('[aria-label="Provider transport"]');
    adapter.value = 'provider.novelai-image'; adapter.dispatchEvent(new Event('change'));
    expect(view.root.querySelector('[aria-label="Completions endpoint URL"]').value).toBe(NOVELAI_IMAGE_ENDPOINT);
    expect([...view.root.querySelectorAll('button')].find(button => button.textContent === 'Test connection').hidden).toBe(true);
    const capabilities = view.root.querySelector('[aria-label="第三方图片能力（按服务文档填写 JSON）"]');
    expect(capabilities.parentElement.hidden).toBe(true);
    adapter.value = 'provider.novelai-image-compatible'; adapter.dispatchEvent(new Event('change'));
    expect(capabilities.value).toBe('');
    [...view.root.querySelectorAll('button')].find(button => button.textContent === '采用官方协议透传配置').click();
    expect(JSON.parse(capabilities.value)).toEqual(officialNovelaiCapabilities());
    const endpoint = 'https://gateway.invalid/ai/generate-image';
    view.root.querySelector('[aria-label="Completions endpoint URL"]').value = endpoint;
    const declared = officialNovelaiCapabilities(); declared.models = [declared.models[1]]; declared.responseFormat = 'json';
    capabilities.value = JSON.stringify(declared);
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(view.root.querySelector('.atri-runtime-status [role="alert"]')?.textContent).toBeUndefined();
    const write = globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT');
    expect(JSON.parse(write[1].body)).toMatchObject({ providerAdapter: 'provider.novelai-image-compatible', endpoint,
        secretRef: config.connections[0].secretRef, options: { imageCapabilities: declared } });
    expect(globalThis.fetch.mock.calls.some(([path]) => path.endsWith('/connections/probe'))).toBe(false);
    view.dispose();
});
test('a failed save preserves editable values and never reports success', async () => {
    globalThis.fetch = jest.fn(async (_url, options) => options.method === 'PUT' ? response({ error: 'native_generation_configuration_invalid' }, false) : response(config));
    const view = mount(); await flush();
    const name = view.root.querySelector('[aria-label="Display name"]'); name.value = 'Unsaved edit';
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(name.value).toBe('Unsaved edit');
    expect(view.root.textContent).toContain('Save failed');
    expect(view.root.textContent).not.toContain('Saved successfully');
    expect(view.root.querySelector('[type="submit"]').disabled).toBe(false);
    view.dispose();
});
test('successful save followed by refresh failure reports committed state and prevents duplicate revision saves', async () => {
    let gets = 0;
    globalThis.fetch = jest.fn(async (_url, options) => {
        if (options.method === 'PUT') return response(config.connections[0]);
        return ++gets === 1 ? response(config) : response({ error: 'offline' }, false);
    });
    const view = mount(); await flush();
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(view.root.textContent).toContain('Saved, but the list could not refresh');
    expect(view.root.querySelector('[type="submit"]').disabled).toBe(true);
    view.dispose();
});
test('missing route errors publish an actionable owning route without losing machine-readable code', () => {
    const observed = jest.fn(); document.addEventListener('atria-native-runtime-error', observed);
    const error = runtimeGenerationError('native_generation_route_missing', 400);
    expect(error.code).toBe('native_generation_route_missing');
    expect(error.message).toContain('Create a route');
    expect(observed.mock.calls[0][0].detail.target).toBe('routes');
    document.removeEventListener('atria-native-runtime-error', observed);
});

test('pending saves deduplicate, focus failed feedback and retain exact Secret references', async () => {
    let finish;
    globalThis.fetch = jest.fn(async (_url, options) => options.method === 'PUT'
        ? new Promise(resolve => { finish = resolve; }) : response(config));
    const view = mount(); await flush();
    const form = view.root.querySelector('form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    const writes = globalThis.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body).secretRef).toEqual(config.connections[0].secretRef);
    expect(view.root.querySelector('[type="submit"]').getAttribute('aria-busy')).toBe('true');
    finish(response({ error: 'native_generation_configuration_invalid' }, false)); await flush();
    expect(document.activeElement).toBe(view.root.querySelector('.atri-runtime-status [role="alert"]'));
    expect(view.root.querySelector('[aria-label="Stored Secret"]').value).toBe('stored-id');
    view.dispose();
});

test('a disposed Runtime does not render late configuration or leave modal ownership behind', async () => {
    let finish;
    globalThis.fetch = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const view = mount(); view.dispose(); finish(response(config)); await flush();
    expect(document.querySelector('[data-atria-runtime-native]')).toBeNull();
    expect(view.root.querySelector('form')).toBeNull();
});

test('duplicating a connection creates a draft identity and retains only its exact Secret reference', async () => {
    globalThis.fetch = jest.fn(async () => response(config));
    const view = mount(); await flush();
    [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Duplicate').click();
    expect(globalThis.fetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false);
    expect(view.root.querySelector('[aria-label="Display name"]').value).toBe('Exact connection Copy');
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    const write = globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT');
    const saved = JSON.parse(write[1].body);
    expect(saved.connectionProfileId).not.toBe(config.connections[0].connectionProfileId);
    expect(saved.secretRef).toEqual(config.connections[0].secretRef);
    view.dispose();
});

test('leaving a deep-linked editor through the same section restores the list and focus', async () => {
    globalThis.fetch = jest.fn(async () => response(config));
    const view = mount(); await flush();
    expect(view.root.querySelector('form')).not.toBeNull();
    view.updateRoute({ child: { id: 'connections' } });
    expect(view.root.querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(view.root.querySelector('[type="search"]'));
    view.dispose();
});

test('Secret creation deduplicates, selects the exact ID and never puts the API key in a connection write', async () => {
    let finish;
    globalThis.fetch = jest.fn(async (url, options) => {
        if (url.endsWith('/secrets')) return options.method === 'POST' ? new Promise(resolve => { finish = resolve; }) : response([]);
        return response(config);
    });
    const view = mount(); await flush();
    const click = label => [...view.root.querySelectorAll('button')].find(button => button.textContent === label).click();
    click('Create Secret');
    view.root.querySelector('[aria-label="Secret label"]').value = 'Provider';
    const key = view.root.querySelector('[aria-label="API key"]'); key.value = 'private-test-key';
    click('Store Secret'); click('Store Secret');
    expect(globalThis.fetch.mock.calls.filter(([url, options]) => url.endsWith('/secrets') && options.method === 'POST')).toHaveLength(1);
    finish(response({ secretId: 'new-exact-id', label: 'Provider' })); await flush();
    expect(key.value).toBe('');
    expect(view.root.querySelector('[aria-label="Stored Secret"]').value).toBe('new-exact-id');
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    const write = globalThis.fetch.mock.calls.find(([url, options]) => url.endsWith('/configuration/connections') && options.method === 'PUT');
    expect(JSON.parse(write[1].body).secretRef).toEqual({ scope: 'player', secretId: 'new-exact-id' });
    expect(write[1].body).not.toContain('private-test-key');
    view.dispose();
});

test('failed Secret creation retains the draft and cancel clears sensitive input', async () => {
    globalThis.fetch = jest.fn(async (url, options) => url.endsWith('/secrets')
        ? options.method === 'POST' ? response({ error: 'native_secret_create_failed' }, false) : response([]) : response(config));
    const view = mount(); await flush();
    const click = label => [...view.root.querySelectorAll('button')].find(button => button.textContent === label).click();
    click('Create Secret'); view.root.querySelector('[aria-label="Secret label"]').value = 'Provider';
    const key = view.root.querySelector('[aria-label="API key"]'); key.value = 'retry-key';
    click('Store Secret'); await flush();
    expect(document.activeElement).toBe(key); expect(key.value).toBe('retry-key');
    click('Cancel'); expect(key.value).toBe(''); expect(key.disabled).toBe(true);
    view.dispose();
});

test('model discovery requires selection and explicit metadata apply, then preserves manual overrides', async () => {
    const model = { schemaVersion: 1, scope: 'player', modelProfileId: 'model_' + '1'.repeat(32), displayName: 'Model',
        remoteModelId: 'manual-model', connectionProfileRef: { scope: 'player', connectionProfileId: config.connections[0].connectionProfileId }, limits: { contextTokens: 1000, outputTokens: 100 }, capabilities: [] };
    const provenance = [{ kind: 'provider-discovery', source: 'Test provider', observedAt: 100 }];
    globalThis.fetch = jest.fn(async url => url.endsWith('/connections/probe') ? response({ models: [{ remoteModelId: 'found-model', displayName: 'Found', limits: { contextTokens: 8000, outputTokens: 2000 },
        capabilities: [{ capability: 'generation.reasoning', state: 'unsupported', provenance }], provenance }] }) : response({ ...config, models: [model] }));
    const body = document.createElement('div'); document.body.append(body);
    const view = mountNativeRuntimeWorkspace({ document, body, section: 'models', route: { child: { id: 'models:' + model.modelProfileId } }, host: {} }); await flush();
    const field = label => view.root.querySelector(`[aria-label="${label}"]`);
    const click = label => [...view.root.querySelectorAll('button')].find(button => button.textContent === label).click();
    click('Fetch models'); await flush();
    expect(field('Remote model ID').value).toBe('manual-model'); expect(field('Context tokens').value).toBe('1000');
    const choices = field('Available provider models'); choices.value = 'found-model'; choices.dispatchEvent(new Event('change'));
    expect(field('Remote model ID').value).toBe('found-model'); expect(field('Context tokens').value).toBe('1000');
    click('Use discovered metadata'); expect(field('Context tokens').value).toBe('8000');
    field('Context tokens').value = '7000'; field('Context tokens').dispatchEvent(new Event('input'));
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    const write = globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT');
    expect(JSON.parse(write[1].body)).toMatchObject({ remoteModelId: 'found-model', limits: { contextTokens: 7000, outputTokens: 2000 },
        limitProvenance: { contextTokens: [{ kind: 'user-override' }], outputTokens: provenance }, capabilities: [{ capability: 'generation.reasoning', state: 'unsupported', provenance }] });
    view.dispose();
});

test('connection editor persists explicit gateway compatibility and removes it for native Gemini', async () => {
    globalThis.fetch = jest.fn(async (url, options = {}) => {
        if (url.endsWith('/secrets')) return response([{ secretId: 'stored-id', label: 'Stored' }]);
        if (options.method === 'PUT') return response(JSON.parse(options.body));
        return response(config);
    });
    let view = mount(); await flush(); await flush();
    const mode = view.root.querySelector('[aria-label="Tool schema compatibility"]');
    expect(mode.value).toBe('json-schema'); mode.value = 'string-enums';
    view.root.querySelector('[aria-label="Gateway response mode"]').value = 'stream';
    view.root.querySelector('[aria-label="Minimum total output tokens"]').value = '20000';
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    let write = globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT');
    expect(JSON.parse(write[1].body).options).toEqual({ toolSchemaMode: 'string-enums', responseMode: 'stream', minimumOutputTokens: 20000 });
    view.dispose(); globalThis.fetch.mockClear();
    view = mount(); await flush(); await flush();
    view.root.querySelector('[aria-label="Tool schema compatibility"]').value = 'string-enums';
    view.root.querySelector('[aria-label="Gateway response mode"]').value = 'stream';
    view.root.querySelector('[aria-label="Minimum total output tokens"]').value = '20000';
    const transport = view.root.querySelector('[aria-label="Provider transport"]');
    transport.value = 'provider.gemini'; transport.dispatchEvent(new Event('change'));
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    write = globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT');
    expect(JSON.parse(write[1].body).options).toEqual({}); view.dispose();
});
test.each(['generation_provider_endpoint_not_found', 'generation_provider_request_rejected', 'generation_provider_authentication_failed', 'generation_provider_timeout'])('%s has a useful owning remediation', code => {
    const observed = jest.fn(); document.addEventListener('atria-native-runtime-error', observed);
    const error = runtimeGenerationError(code, 400);
    expect(error.code).toBe(code); expect(error.message).not.toContain('could not complete this request');
    expect(observed.mock.calls[0][0].detail.target).toBe(code.endsWith('timeout') ? 'routes' : 'connections');
    document.removeEventListener('atria-native-runtime-error', observed);
});


test('internal Runtime Back cancels without losing the raw connection draft', async () => {
    globalThis.fetch = jest.fn(async () => response(config));
    const view = mount(); await flush();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const name = view.root.querySelector('[aria-label="Display name"]'); name.focus(); name.value = 'Unsaved'; name.dispatchEvent(new Event('input', { bubbles: true }));
    const back = [...view.root.querySelectorAll('button')].find(node => node.textContent === 'Back to connections');
    back.click(); expect(view.root.querySelector('[aria-label="Display name"]')).toBe(name); expect(name.value).toBe('Unsaved');
    confirm.mockReturnValue(true); back.click(); expect(view.root.querySelector('form')).toBeNull();
    view.dispose(); confirm.mockRestore();
});

test('Retrieval commits once, retains a read-only receipt after list failure and retries only the read', async () => {
    const randomUUID = globalThis.crypto.randomUUID; globalThis.crypto.randomUUID = () => '12345678-1234-4234-8234-123456789abc';
    let saved = null, unavailable = false;
    globalThis.fetch = jest.fn(async (path, options = {}) => {
        if (path.endsWith('/secrets')) return response([]);
        if (options.method === 'POST') { saved = JSON.parse(options.body); unavailable = true; return response(saved); }
        if (unavailable) return response({ message: 'Read unavailable' }, false);
        return response(saved ? [saved] : []);
    });
    const body = document.createElement('main'); document.body.append(body);
    const view = mountNativeRuntimeWorkspace({ document, body, section: 'retrieval', route: {}, host: {} }); await flush();
    const click = label => [...view.root.querySelectorAll('button')].find(node => node.textContent === label).click();
    click('New retrieval resource');
    view.root.querySelector('[aria-label="Display name"]').value = 'Exact local embedding';
    const provider = view.root.querySelector('[aria-label="Provider"]'); provider.value = 'transformers'; provider.dispatchEvent(new Event('change'));
    view.root.querySelector('[aria-label="Model"]').value = 'fixture-model';
    view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(view.root.textContent).toContain('Saved, but the list could not refresh');
    expect(view.root.querySelector('[aria-label="Display name"]').matches(':disabled')).toBe(true);
    expect([...view.root.querySelectorAll('button')].find(node => node.textContent === 'Save exact revision').disabled).toBe(true);
    unavailable = false; click('Reload list'); await flush();
    expect(view.root.textContent).toContain('Exact local embedding');
    expect(globalThis.fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    view.dispose(); globalThis.crypto.randomUUID = randomUUID;
});

test('Runtime Source keeps exact identity, advanced JSON, malformed drafts and the original configuration write', async () => {
    globalThis.fetch = jest.fn(async () => response(config));
    const view = mount(); await flush(); await flush();
    const click = label => [...view.root.querySelectorAll('button')].find(node => node.textContent === label).click();
    click('Source'); let source = view.root.querySelector('[aria-label="Runtime resource JSON"]');
    const draft = JSON.parse(source.value); draft.networkPolicy = { private: { nested: [null, false, 7] } }; draft.options = { advanced: { values: [null, true, 'opaque'] } }; source.value = JSON.stringify(draft);
    click('Fields'); await flush(); click('Source'); source = view.root.querySelector('[aria-label="Runtime resource JSON"]'); expect(JSON.parse(source.value).networkPolicy).toEqual(draft.networkPolicy);
    source.value = '{ malformed'; click('Fields'); await flush(); expect(view.root.querySelector('[aria-label="Runtime resource JSON"]').value).toBe('{ malformed');
    source.value = JSON.stringify({ ...draft, connectionProfileId: 'other' }); view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush(); expect(globalThis.fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(0);
    source.value = JSON.stringify(draft); view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(JSON.parse(globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT')[1].body)).toEqual(draft); view.dispose();
});

test('Runtime malformed advanced shapes remain in Source instead of replacing the editor', async () => {
    const modelId = 'model_' + 'a'.repeat(32), model = { schemaVersion: 1, scope: 'player', modelProfileId: modelId, displayName: 'Model', connectionProfileRef: { scope: 'player', connectionProfileId: config.connections[0].connectionProfileId }, remoteModelId: 'Remote', limits: { contextTokens: 100, outputTokens: 20 }, capabilities: [], tokenizer: { encoding: 'cl100k_base', source: 'provider', advanced: { value: [null, false, 3] } } };
    const data = { ...config, models: [model] }; globalThis.fetch = jest.fn(async () => response(data));
    const body = document.createElement('main'); document.body.append(body); const view = mountNativeRuntimeWorkspace({ document, body, section: 'models', route: { child: { id: 'model:' + modelId } }, host: {} }); await flush();
    const click = label => [...view.root.querySelectorAll('button')].find(node => node.textContent === label).click();
    click('Source'); const source = view.root.querySelector('[aria-label="Runtime resource JSON"]'); expect(JSON.parse(source.value).tokenizer).toEqual(model.tokenizer);
    const invalid = JSON.stringify({ ...model, capabilities: {} }); source.value = invalid; click('Fields'); await flush(); expect(source.isConnected).toBe(true); expect(source.value).toBe(invalid);
    source.value = JSON.stringify(model); click('Fields'); await flush(); view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush();
    expect(JSON.parse(globalThis.fetch.mock.calls.find(([, options]) => options.method === 'PUT')[1].body).tokenizer).toEqual(model.tokenizer); view.dispose();
});

test('Retrieval provider options survive switching, Source and immutable revision review without moving its exact identity', async () => {
    const randomUUID = globalThis.crypto.randomUUID; globalThis.crypto.randomUUID = () => '12345678-1234-4234-8234-123456789abc';
    const profile = { retrievalProfileId: 'retr_' + 'a'.repeat(32), revision: 'rev_' + 'a'.repeat(32), displayName: 'Jina', mode: 'embed', source: 'jina', model: 'jina', endpoint: 'https://jina.invalid', secretRef: { secretId: 'stored' }, options: { dimensions: 512, task: 'retrieval.query', lateChunking: true } };
    globalThis.fetch = jest.fn(async path => response(path.endsWith('/secrets') ? [{ secretId: 'stored', label: 'Stored' }] : [profile]));
    const body = document.createElement('main'); document.body.append(body); const view = mountNativeRuntimeWorkspace({ document, body, section: 'retrieval', route: {}, host: {} }); await flush();
    const click = label => [...view.root.querySelectorAll('button')].find(node => node.textContent === label).click(); click('Create revision'); await flush();
    view.root.querySelector('[aria-label="Dimensions"]').value = '1024'; const provider = view.root.querySelector('[aria-label="Provider"]'); provider.value = 'ollama'; provider.dispatchEvent(new Event('change')); provider.value = 'jina'; provider.dispatchEvent(new Event('change')); expect(view.root.querySelector('[aria-label="Dimensions"]').value).toBe('1024');
    click('Source'); let source = view.root.querySelector('[aria-label="Retrieval resource JSON"]'), draft = JSON.parse(source.value); expect(draft.options).toEqual({ dimensions: 1024, task: 'retrieval.query', lateChunking: true }); expect(draft.revision).not.toBe(profile.revision);
    click('Fields'); await flush(); click('Source'); source = view.root.querySelector('[aria-label="Retrieval resource JSON"]'); expect(JSON.parse(source.value)).toEqual(draft);
    source.value = JSON.stringify({ ...draft, options: { wrong: true } }); click('Fields'); await flush(); expect(view.root.querySelector('[aria-label="Retrieval resource JSON"]')).toBe(source);
    source.value = JSON.stringify(draft); view.root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await flush(); expect(JSON.parse(globalThis.fetch.mock.calls.find(([, options]) => options.method === 'POST')[1].body)).toEqual(draft);
    expect(profile.options.dimensions).toBe(512); view.dispose(); globalThis.crypto.randomUUID = randomUUID;
});
