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
