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

const ui = {
    el(tag, text, parent) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; parent?.append(element); return element; },
    button(parent, text, click) { const b = ui.el('button', text, parent); b.addEventListener('click', click); return b; },
    detail() {},
};
beforeEach(() => {
    document.body.replaceChildren(); popups.length = 0; mainPreset = 'Daily RP';
    manager.savePreset.mockClear(); manager.updateList.mockClear();
    globalThis.fetch = jest.fn(async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(`../../public${url}`, import.meta.url), 'utf8')) }));
});

test('Agenda help imports into native draft fields without changing the main RP preset', async () => {
    const settings = { agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: createWorkspaceFactoryPreset('agenda', 'test-agenda') }) };
    const render = createPresetAuthoring({ getSettings: () => settings, save: jest.fn(), getScope: () => ({}), renderPresetHelp: renderPresetHelpButton });
    render(document.body, ui);
    const buttons = [...document.querySelectorAll('.atria-preset-help')];
    expect(buttons).toHaveLength(8); // global fallback + planner + six workers
    expect(document.querySelector('[aria-label="Default prompt preset"]').value).toBe('');
    for (const [index, name, url] of [[1, 'Atri-plugin-only', '/presets/plugin-only.json'], [2, 'Atri-agenda-agent', '/presets/agent-non-director.json']]) {
        buttons[index].click();
        const action = popups.at(-1).options.customButtons[0];
        expect(action.text).toBe(`Import ${name} preset`);
        await action.action();
        expect(fetch).toHaveBeenLastCalledWith(url);
        expect(manager.savePreset).toHaveBeenLastCalledWith(name, expect.objectContaining({ name }), { skipUpdate: true });
        expect(manager.updateList).toHaveBeenLastCalledWith(name, expect.objectContaining({ name }), { select: false });
        expect(document.getElementById(buttons[index].dataset.atriaPresetHelpFor).value).toBe(name);
    }
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Save definition for future runs').click();
    const agents = settings.agentWorkspace.presets[0].planTemplate.agents;
    expect(agents[0].modelProfile.promptPresetName).toBe('Atri-plugin-only');
    expect(agents[1].modelProfile.promptPresetName).toBe('Atri-agenda-agent');
    expect(settings.llmNodePresetName).toBeUndefined();
    expect(mainPreset).toBe('Daily RP');
});

test('Director help retains its separate preset', () => {
    const settings = { agentWorkspace: updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: createWorkspaceFactoryPreset('director', 'test-director') }) };
    createPresetAuthoring({ getSettings: () => settings, save: jest.fn(), getScope: () => ({}), renderPresetHelp: renderPresetHelpButton })(document.body, ui);
    const button = document.querySelector('.workspace-agent .atria-preset-help');
    button.click();
    expect(popups.at(-1).options.customButtons[0].text).toBe('Import agent-director preset');
});
