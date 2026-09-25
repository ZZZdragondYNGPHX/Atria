import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, jest, test } from '@jest/globals';

const saveSettings = jest.fn(async () => {});
jest.unstable_mockModule('../../public/script.js', () => ({ saveSettings, eventSource: {}, event_types: {}, getRequestHeaders() {}, buildObjectPatchOperationsAsync() {}, buildObjectPatchOperations() {}, cloneJsonValue: structuredClone }));
jest.unstable_mockModule('../../public/scripts/loader.js', () => ({}));
jest.unstable_mockModule('../../public/scripts/st-context.js', () => ({ getContext: () => ({}) }));
jest.unstable_mockModule('../../public/scripts/templates.js', () => ({ renderTemplate() {}, renderTemplateAsync() {} }));
jest.unstable_mockModule('../../public/scripts/utils.js', () => ({ deleteValueByPath() {}, setValueByPath() {} }));
jest.unstable_mockModule('../../public/scripts/native/session-runtime.js', () => ({ nativeSessionRuntime: {} }));
const host = await import('../../public/scripts/capability-host.js');

test('only current Atria capabilities survive settings hydration and persistence', () => {
    host.primeCapabilitySettings({ extension_settings: { connectionManager: { secret: 'retired' }, vectors: {}, memory_graph: { enabled: true }, orchestrator: { selected: 'mine' }, disabledExtensions: ['regex', 'orchestrator', 'third-party/anything'] } });
    expect(host.serializeCapabilitySettings()).toMatchObject({ memory_graph: { enabled: true }, orchestrator: { selected: 'mine' }, disabledPlugins: ['regex'] });
    expect(host.serializeCapabilitySettings()).not.toHaveProperty('connectionManager');
    expect(host.serializeCapabilitySettings()).not.toHaveProperty('vectors');
    host.primeCapabilitySettings({ atri_capabilities: { memory_graph: { enabled: false } }, extension_settings: { memory_graph: { enabled: true } } });
    expect(host.serializeCapabilitySettings().memory_graph.enabled).toBe(false);
});

test('Global Plugin mutations reject arbitrary installs and roll back failed persistence', async () => {
    await expect(host.enableGlobalPlugin('third-party/anything', false)).rejects.toThrow('Unknown');
    host.primeCapabilitySettings({ atri_capabilities: { disabledPlugins: [] } });
    saveSettings.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(host.disableGlobalPlugin('regex', false)).rejects.toThrow('disk unavailable');
    expect(host.capabilitySettings.disabledPlugins).toEqual([]);
    await host.disableGlobalPlugin('search-tools', false);
    expect(host.serializeCapabilitySettings().disabledPlugins).toEqual(['search-tools']);
    expect(() => host.registerCapabilityApi('third-party/anything', {})).toThrow('Unknown');
});

test('retired extension source and manager endpoints cannot re-enter the product', () => {
    const root = new URL('../../', import.meta.url);
    const plugins = fs.readdirSync(new URL('public/scripts/extensions/', root), { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort();
    expect(plugins).toEqual(['regex', 'search-tools']);
    for (const file of ['public/scripts/extensions.js', 'public/scripts/embedding-service.js', 'src/endpoints/extensions.js', 'src/endpoints/quick-replies.js', 'src/endpoints/stable-diffusion.js']) expect(fs.existsSync(new URL(file, root))).toBe(false);
    const startup = fs.readFileSync(new URL('src/server-startup.js', root), 'utf8');
    expect(startup).not.toMatch(/['"]\/api\/(extensions|quick-replies|sd|caption|classify|tts|translate)['"]/);
    const html = fs.readFileSync(new URL('public/index.html', root), 'utf8');
    expect(html).not.toMatch(/id="(?:third_party_extension_button|extensions_details|extensions_notify_updates)"/);
    const visit = directory => {
        for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, item.name);
            if (item.isDirectory()) visit(file);
            else if (item.name.endsWith('.js')) {
                const source = fs.readFileSync(file, 'utf8');
                expect(source.match(/(?:from\s*|import\s*\()\s*['"][^'"]*extensions\/(?!regex\/|search-tools\/)[^'"]+/g)).toBeNull();
            }
        }
    };
    visit(fileURLToPath(new URL('public/scripts/', root)));
});
