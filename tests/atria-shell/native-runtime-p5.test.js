/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountNativeRuntimeWorkspace } from '../../public/scripts/native/runtime-workspace.js';
import { runtimeGenerationError } from '../../public/scripts/native/runtime-client.js';
const flush = () => new Promise(done => setTimeout(done, 0));
const config = { connections: [{ schemaVersion: 1, scope: 'player', connectionProfileId: 'conn_11111111111111111111111111111111', displayName: 'Exact connection', endpoint: 'https://example.invalid/chat', providerAdapter: 'provider.openai-compatible', secretRef: { scope: 'player', secretId: 'stored-id' } }], models: [], routes: [], profiles: [], resources: [] };
const response = (body, ok = true) => ({ ok, json: async () => body });
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
