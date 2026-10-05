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
let _mainPreset = 'Daily RP';
const manager = {
    findPreset: jest.fn(() => undefined),
    savePreset: jest.fn(async (name, data, options) => { if (!options?.skipUpdate) _mainPreset = name; }),
    updateList: jest.fn((name, data, options) => { if (options?.select !== false) _mainPreset = name; }),
};
jest.unstable_mockModule('../../public/scripts/popup.js', () => ({
    callGenericPopup: jest.fn(async () => 0),
    POPUP_TYPE: { TEXT: 1, CONFIRM: 2, INPUT: 3 }, POPUP_RESULT: { CANCELLED: 0, AFFIRMATIVE: 1, NEGATIVE: 2 },
    Popup: class { constructor(body, type, value, options) { this.options = options; popups.push(this); } async show() { return 1; } },
}));
jest.unstable_mockModule('../../public/scripts/i18n.js', () => ({ translate: text => text, getCurrentLocale: () => 'en' }));
jest.unstable_mockModule('../../public/scripts/st-context.js', () => ({ getContext: () => ({ getPresetManager: () => manager }) }));
jest.unstable_mockModule('../../public/scripts/utils.js', () => ({ escapeHtml: text => String(text) }));
const { renderRuntimeHelpButton } = await import('../../public/scripts/lib/runtime-help.js');
const { createPresetAuthoring } = await import('../../public/scripts/agents/orchestrator/workspace/authoring.js');
const { createWorkspaceFactoryPreset } = await import('../../public/scripts/agents/orchestrator/workspace/host-presets.js');
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
    document.body.replaceChildren(); popups.length = 0; _mainPreset = 'Daily RP';
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

test('Runtime help opens the Native route owner without importing presets', () => {
    const openRuntimeSection = jest.fn();
    globalThis.Atria.shell = { getWorkspaceHost: () => ({ openRuntimeSection }) };
    document.body.innerHTML = renderRuntimeHelpButton();
    document.querySelector('[data-atria-runtime-route-help]').click();
    expect(openRuntimeSection).toHaveBeenCalledWith('routes');
    expect(manager.savePreset).not.toHaveBeenCalled();
});

const findButton = (root, label) => [...root.querySelectorAll('button')].find(item => item.textContent === label);
for (const mode of ['spec','loop','agenda','director']) test(mode + ' Source preserves malformed and invalid plans without poisoning Fields or saving stale raw text', () => {
    Element.prototype.scrollIntoView = jest.fn();
    const preset = createWorkspaceFactoryPreset(mode, 'raw-' + mode); let original = structuredClone(preset);
    const settings = { agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type:'save', preset }) }; const save = jest.fn(); const { host, ui } = workspaceUi();
    createPresetAuthoring({ getSettings:()=>settings, save, getScope:()=>({}) })(host, ui); original = structuredClone(settings.agentWorkspace.presets.find(item=>item.id === preset.id)); findButton(host,'Preset settings').click();
    let editor = ui.inspector.querySelector('[aria-label="Native Plan JSON"]'); editor.value = '{ malformed'; editor.dispatchEvent(new Event('input',{ bubbles:true }));
    expect(host.dataset.atriaDraftDirty).toBe('true'); findButton(ui.inspector,'Apply JSON to draft').click(); findButton(ui.inspector,'Save').click(); expect(save).not.toHaveBeenCalled();
    findButton(ui.inspector,'Close inspector').click(); findButton(host,'Preset settings').click(); editor = ui.inspector.querySelector('[aria-label="Native Plan JSON"]'); expect(editor.value).toBe('{ malformed');
    const invalid = { ...original.planTemplate, agents:[] }; editor.value = JSON.stringify(invalid); editor.dispatchEvent(new Event('input',{ bubbles:true })); findButton(ui.inspector,'Apply JSON to draft').click(); expect(settings.agentWorkspace.presets[0]).toEqual(original);
    findButton(ui.inspector,'Close inspector').click(); host.querySelector('.workspace-agent-card').click(); expect(ui.inspector.textContent).toContain(original.planTemplate.agents[0].name || original.planTemplate.agents[0].id);
    findButton(host,'Preset settings').click(); editor = ui.inspector.querySelector('[aria-label="Native Plan JSON"]'); const next = structuredClone(original.planTemplate); next.agents[0].instructions = 'B3 applied source'; editor.value = JSON.stringify(next); editor.dispatchEvent(new Event('input',{ bubbles:true })); findButton(ui.inspector,'Apply JSON to draft').click(); findButton(ui.inspector,'Save').click();
    expect(settings.agentWorkspace.presets[0].planTemplate).toEqual(next); expect(save).toHaveBeenCalledTimes(1); expect(host.dataset.atriaDraftDirty).toBe('false');
});
test('old preset defaults and duplicate actions refuse a changed settings owner or scope', () => {
    Element.prototype.scrollIntoView = jest.fn(); const old = { enabled:false, agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type:'save', preset:createWorkspaceFactoryPreset('loop','old') }) }; let settings = old;
    const save = jest.fn(); const { host,ui } = workspaceUi(); createPresetAuthoring({ getSettings:()=>settings,save,getScope:()=>({}) })(host,ui); const count = old.agentWorkspace.presets.length; settings = { enabled:false,agentWorkspace:emptyPresetLibrary() };
    const enabled = host.querySelector('.workspace-authoring-defaults input'); enabled.checked = true; enabled.dispatchEvent(new Event('change')); findButton(host,'Duplicate').click(); expect(save).not.toHaveBeenCalled(); expect(old.enabled).toBe(false); expect(settings.enabled).toBe(false); expect(old.agentWorkspace.presets).toHaveLength(count);
});
