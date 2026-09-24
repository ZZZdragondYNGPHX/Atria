/** @jest-environment jsdom */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { jest, test, expect, beforeEach } from '@jest/globals';

globalThis.structuredClone = value => deserialize(serialize(value));
globalThis.crypto.randomUUID = randomUUID;
globalThis.matchMedia = () => ({ matches: true });
globalThis.Atria = { getContext: () => ({ constants: { promptRoles: {}, wiPosition: {} }, translate: text => text, addLocaleData: () => {} }) };
window.eval(fs.readFileSync(new URL('../../public/lib/jquery-3.5.1.min.js', import.meta.url), 'utf8'));
globalThis.$ = window.jQuery;
globalThis.toastr = { success: jest.fn(), info: jest.fn(), error: jest.fn() };
const popups = [];
let mainPreset = 'Daily RP';
const manager = {
    findPreset: jest.fn(() => undefined),
    savePreset: jest.fn(async (name, data, options) => { if (!options?.skipUpdate) mainPreset = name; }),
    updateList: jest.fn((name, data, options) => { if (options?.select !== false) mainPreset = name; }),
};
jest.unstable_mockModule('../../public/scripts/popup.js', () => ({
    callGenericPopup: jest.fn(async () => 0),
    POPUP_TYPE: { TEXT: 1, CONFIRM: 2, INPUT: 3 }, POPUP_RESULT: { CANCELLED: 0, AFFIRMATIVE: 1, NEGATIVE: 2 },
    Popup: class { constructor(body, type, value, options) { this.options = options; popups.push(this); } async show() { return 1; } },
}));
jest.unstable_mockModule('../../public/scripts/i18n.js', () => ({ translate: text => text, getCurrentLocale: () => 'en' }));
jest.unstable_mockModule('../../public/scripts/st-context.js', () => ({ getContext: () => ({ getPresetManager: () => manager }) }));
const { renderPresetHelpButton } = await import('../../public/scripts/extensions/preset-help.js');
const { createPresetAuthoring } = await import('../../public/scripts/extensions/orchestrator/workspace/authoring.js');
const { createWorkspaceFactoryPreset } = await import('../../public/scripts/extensions/orchestrator/workspace/host-presets.js');
const { emptyPresetLibrary, updatePresetLibrary } = await import('../../public/scripts/lib/agent-workspace/presets.js');

const baseUi = {
    el(tag, text, parent) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; parent?.append(element); return element; },
    button(parent, text, click) { const b = baseUi.el('button', text, parent); b.type = 'button'; b.addEventListener('click', click); return b; },
    detail() {},
};
function workspaceUi() {
    const host = document.createElement('main');
    const inspector = document.createElement('aside');
    document.body.append(host, inspector);
    return { host, ui: { ...baseUi, inspector } };
}
beforeEach(() => {
    document.body.replaceChildren(); popups.length = 0; mainPreset = 'Daily RP';
    manager.savePreset.mockClear(); manager.updateList.mockClear();
    globalThis.fetch = jest.fn(async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(`../../public${url}`, import.meta.url), 'utf8')) }));
});

for (const mode of ['spec', 'loop', 'agenda', 'director']) test(`${mode} Native authoring exposes exact Runtime routing without compatibility presets`, async () => {
    const route = { runtimeRouteId: 'route_' + 'a'.repeat(32), role: 'role.orchestrator', displayName: 'Writer' };
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ routes: [route] }) }));
    const settings = { agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: createWorkspaceFactoryPreset(mode, 'test-' + mode) }) };
    const { host, ui } = workspaceUi();
    createPresetAuthoring({ getSettings: () => settings, save: jest.fn(), getScope: () => ({}) })(host, ui);
    host.querySelector('.workspace-agent-card').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ui.inspector.querySelector('.atria-preset-help')).toBeNull();
    expect(host.textContent).not.toContain('Default API profile');
    expect(host.textContent).not.toContain('Default prompt preset');
    const select = ui.inspector.querySelector('select[aria-label="Native Runtime Route"]');
    expect(select.disabled).toBe(false);
    select.value = route.runtimeRouteId; select.dispatchEvent(new Event('change'));
    [...ui.inspector.querySelectorAll('button')].find(button => button.textContent === 'Save').click();
    expect(settings.agentWorkspace.presets.find(preset => preset.id === 'test-' + mode).planTemplate.agents[0].modelProfile).toEqual({ nativeRouteRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId } });
    const obsolete = []; const visit = (value, path = '') => { if (!value || typeof value !== 'object') return; for (const [key, item] of Object.entries(value)) { if (/^(apiPresetName|promptPresetName|llmPresetName)$/.test(key)) obsolete.push(path + '.' + key); visit(item, path + '.' + key); } };
    visit(settings.agentWorkspace); expect(obsolete).toEqual([]);
    expect(manager.savePreset).not.toHaveBeenCalled();
});

test('explicit non-Native preset help still imports without changing the active preset', async () => {
    document.body.innerHTML = '<select id="legacy-target"><option value="">Current</option></select>' + renderPresetHelpButton({ kind: 'agent', agentMode: 'non-director', targetSelectId: 'legacy-target' });
    document.querySelector('.atria-preset-help').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const action = popups.at(-1).options.customButtons[0];
    await action.action();
    expect(manager.savePreset).toHaveBeenCalledWith('Atri-agenda-agent', expect.any(Object), { skipUpdate: true });
    expect(mainPreset).toBe('Daily RP');
});
