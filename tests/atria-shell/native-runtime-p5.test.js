/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountNativeRuntimeWorkspace } from '../../public/scripts/native/runtime-workspace.js';
import { runtimeGenerationError } from '../../public/scripts/native/runtime-client.js';
const flush = () => new Promise(done => setTimeout(done, 0));
const config = { connections: [{ schemaVersion: 1, scope: 'player', connectionProfileId: 'conn_11111111111111111111111111111111', displayName: 'Exact connection', endpoint: 'https://example.invalid/chat', providerAdapter: 'provider.openai-compatible', secretRef: { scope: 'player', secretId: 'stored-id' } }], models: [], routes: [], profiles: [], resources: [] };
const response = (body, ok = true) => ({ ok, json: async () => body });

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
