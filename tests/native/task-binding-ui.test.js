import { jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { ensureTaskBindings } from '../../public/scripts/native/task-binding-ui.js';

const packageId = 'pkg_' + 'a'.repeat(32), packageVersionId = 'pkgv_' + 'b'.repeat(32);
const route = { runtimeRouteId: 'route_' + 'c'.repeat(32), displayName: 'My route', compatible: true };
const ref = { scope: 'player', runtimeRouteId: route.runtimeRouteId };
let dom, document, root, settings, save, start, routes, fetchImpl, host, turnRoutes;
const manifest = { runtime: { experienceContract: { taskRuntime: { tasks: [{ id: 'narrator' }] } } } };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settled() { for (let i = 0; i < 12; i++) await tick(); }
const buttons = name => [...root.querySelectorAll('button')].find(node => node.textContent === name);
const change = (selector, value) => { const node = root.querySelector(selector); node.value = value; node.dispatchEvent(new dom.window.Event('change')); };
beforeEach(() => {
    dom = new JSDOM('<!doctype html><main></main>'); document = dom.window.document; root = document.querySelector('main');
    turnRoutes = []; settings = {}; save = jest.fn(); start = jest.fn(); routes = [route]; host = { openRuntimeSection: jest.fn() };
    globalThis.Atria = { getContext: () => ({ capabilitySettings: settings, saveSettingsDebounced: save }) };
    fetchImpl = jest.fn(async (_path, { body }) => {
        const { slotBindings } = JSON.parse(body);
        const slots = ['narrative', 'structured'].map(id => {
            const binding = slotBindings[id]; const choice = binding?.scope === 'player' && routes.find(route => route.runtimeRouteId === binding.runtimeRouteId && route.compatible);
            return { id, tasks: id === 'narrative' ? ['narrator'] : ['case.reflection', 'claim.advisor', 'agenda.deliberation'], requiredCapabilities: [], routes,
                binding: choice ? binding : null, error: choice ? null : 'native_task_binding_missing' };
        });
        return { ok: true, json: async () => ({ packageId, packageVersionId, slots, turnRoutes, ready: slots.every(slot => !slot.error) && turnRoutes.every(route => !route.error) }) };
    }); globalThis.fetch = fetchImpl;
});
afterEach(() => { dom.window.close(); delete globalThis.Atria; delete globalThis.fetch; });
const setup = (options = {}) => ensureTaskBindings({ document, root, manifest, packageId, packageVersionId, host, onReady: start, ...options });
test('no Task Runtime skips preflight; complete bindings skip configuration', async () => {
    expect(await setup({ manifest: {} })).toBe(true); expect(fetchImpl).not.toHaveBeenCalled();
    settings.atri_task_bindings = { [packageId]: { narrative: ref, structured: ref } };
    expect(await setup()).toBe(true); expect(root.children).toHaveLength(0); expect(start).not.toHaveBeenCalled();
});
test('first start lists two purposes, explicit routes only; shared selection persists through existing settings then starts', async () => {
    expect(await setup()).toBe(false); expect(start).not.toHaveBeenCalled();
    expect(root.querySelectorAll('[data-atria-binding-slot]')).toHaveLength(2); expect(root.textContent).toContain('needs 2 model purposes');
    expect(buttons('Save and continue').disabled).toBe(true);
    change('[aria-label="Use one route for all purposes"]', route.runtimeRouteId);
    expect(save).not.toHaveBeenCalled(); buttons('Save and continue').click(); await settled();
    expect(settings.atri_task_bindings[packageId]).toEqual({ narrative: ref, structured: ref }); expect(save).toHaveBeenCalledTimes(2); expect(start).toHaveBeenCalledTimes(1);
});
test('route deleted while editing is rejected before writing bindings or starting', async () => {
    await setup(); change('[aria-label="Use one route for all purposes"]', route.runtimeRouteId); routes = [];
    buttons('Save and continue').click(); await settled(); expect(start).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    expect(root.textContent).toContain('No compatible Runtime Route'); expect(buttons('Save and continue').disabled).toBe(true);
});
test('foreign and stale saved bindings require explicit reconfiguration', async () => {
    settings.atri_task_bindings = { [packageId]: { narrative: { ...ref, scope: 'session' }, structured: { ...ref, runtimeRouteId: 'invalid' } } };
    expect(await setup()).toBe(false); expect(root.querySelector('[aria-label="Narrative"]').value).toBe(''); expect(buttons('Save and continue').disabled).toBe(true);
});
test('capability rejection explains failure, disables save, and links existing Runtime configuration', async () => {
    routes = [{ ...route, compatible: false, error: 'generation_capability_unsupported' }];
    await setup(); expect(root.textContent).toContain('does not support the capabilities'); expect(buttons('Save and continue').disabled).toBe(true);
    expect(root.querySelector('[aria-label="Use one route for all purposes"]')).toBeNull();
    buttons('Configure Runtime Routes').click(); await settled(); expect(host.openRuntimeSection).toHaveBeenCalledWith('routes'); expect(start).not.toHaveBeenCalled();
});
test('cancel, navigation during check and network failure cannot start a story', async () => {
    await setup(); buttons('Cancel').click(); await settled(); expect(root.children).toHaveLength(0); expect(start).not.toHaveBeenCalled();
    fetchImpl.mockRejectedValueOnce(new Error('offline')); await setup(); expect(root.textContent).toContain('No story was started'); expect(start).not.toHaveBeenCalled();
    expect(await setup({ isCurrent: () => false })).toBe(false); expect(start).not.toHaveBeenCalled();
});

test('missing turn role blocks complete purposes, names Intent resolver, and refresh resumes without inference', async () => {
    settings.atri_task_bindings = { [packageId]: { narrative: ref, structured: ref } };
    turnRoutes = [{ role: 'intent_resolver', requiredCapabilities: ['generation.tools'], error: 'native_generation_route_missing' }];
    expect(await setup()).toBe(false);
    expect(root.textContent).toContain('Intent resolver: No route is configured');
    expect(buttons('Save and continue').disabled).toBe(true);
    expect(save).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    buttons('Configure Runtime Routes').click(); await settled(); expect(host.openRuntimeSection).toHaveBeenCalledWith('routes');
    turnRoutes[0].error = null;
    buttons('Refresh Runtime Routes').click(); await settled();
    expect(buttons('Save and continue').disabled).toBe(false);
    buttons('Save and continue').click(); await settled(); expect(start).toHaveBeenCalledTimes(1);
});
test('route removed after refresh cannot pass final revalidation or save settings', async () => {
    settings.atri_task_bindings = { [packageId]: { narrative: ref, structured: ref } };
    await setup({ force: true });
    turnRoutes = [{ role: 'intent_resolver', requiredCapabilities: ['generation.tools'], error: 'native_generation_route_missing' }];
    buttons('Save and continue').click(); await settled();
    expect(buttons('Save and continue').disabled).toBe(true);
    expect(start).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});
