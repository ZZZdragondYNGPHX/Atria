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
    host.primeCapabilitySettings({ atri_capabilities: { connectionManager: { secret: 'retired' }, vectors: {}, memory_graph: { enabled: true }, orchestrator: { selected: 'mine' }, disabledPlugins: ['regex', 'orchestrator', 'third-party/anything'] } });
    expect(host.serializeCapabilitySettings()).toMatchObject({ memory_graph: { enabled: true }, orchestrator: { selected: 'mine' }, disabledPlugins: ['regex'] });
    expect(host.serializeCapabilitySettings()).not.toHaveProperty('connectionManager');
    expect(host.serializeCapabilitySettings()).not.toHaveProperty('vectors');

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
