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
    POPUP_TYPE: { TEXT: 1, CONFIRM: 2 }, POPUP_RESULT: { CANCELLED: 0, AFFIRMATIVE: 1, NEGATIVE: 2 },
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

test('Agenda help imports into native draft fields without changing the main RP preset', async () => {
    const settings = { agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: createWorkspaceFactoryPreset('agenda', 'test-agenda') }) };
    const render = createPresetAuthoring({ getSettings: () => settings, save: jest.fn(), getScope: () => ({}), renderPresetHelp: renderPresetHelpButton });
    const { host, ui } = workspaceUi();
    render(host, ui);
    expect(document.querySelectorAll('.atria-preset-help')).toHaveLength(2); // workspace default + selected planner
    expect(document.querySelector('[aria-label="Default prompt preset"]').value).toBe('');

    let agentHelp = ui.inspector.querySelector('.atria-preset-help');
    agentHelp.click();
    let action = popups.at(-1).options.customButtons[0];
    expect(action.text).toBe('Import Atri-plugin-only preset');
    await action.action();
    expect(fetch).toHaveBeenLastCalledWith('/presets/plugin-only.json');
    expect(document.getElementById(agentHelp.dataset.atriaPresetHelpFor).value).toBe('Atri-plugin-only');

    host.querySelectorAll('.workspace-agent-card')[1].click();
    agentHelp = ui.inspector.querySelector('.atria-preset-help');
    agentHelp.click();
    action = popups.at(-1).options.customButtons[0];
    expect(action.text).toBe('Import Atri-agenda-agent preset');
    await action.action();
    expect(fetch).toHaveBeenLastCalledWith('/presets/agent-non-director.json');
    expect(manager.savePreset).toHaveBeenLastCalledWith('Atri-agenda-agent', expect.objectContaining({ name: 'Atri-agenda-agent' }), { skipUpdate: true });
    expect(manager.updateList).toHaveBeenLastCalledWith('Atri-agenda-agent', expect.objectContaining({ name: 'Atri-agenda-agent' }), { select: false });
    expect(document.getElementById(agentHelp.dataset.atriaPresetHelpFor).value).toBe('Atri-agenda-agent');

    [...ui.inspector.querySelectorAll('button')].find(b => b.textContent === 'Save').click();
    const agents = settings.agentWorkspace.presets[0].planTemplate.agents;
    expect(agents[0].modelProfile.promptPresetName).toBe('Atri-plugin-only');
    expect(agents[1].modelProfile.promptPresetName).toBe('Atri-agenda-agent');
    expect(settings.llmNodePresetName).toBeUndefined();
    expect(mainPreset).toBe('Daily RP');
});

test('Director help retains its separate preset', () => {
    const settings = { agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: createWorkspaceFactoryPreset('director', 'test-director') }) };
    const { host, ui } = workspaceUi();
    createPresetAuthoring({ getSettings: () => settings, save: jest.fn(), getScope: () => ({}), renderPresetHelp: renderPresetHelpButton })(host, ui);
    const help = ui.inspector.querySelector('.atria-preset-help');
    help.click();
    expect(popups.at(-1).options.customButtons[0].text).toBe('Import agent-director preset');
});
