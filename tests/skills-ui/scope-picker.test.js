/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
jest.unstable_mockModule('../../public/scripts/skills/i18n.js', () => ({ ensureSkillI18n() {} }));
const { pickTargetScope } = await import('../../public/scripts/skills/scope-picker.js');
afterEach(() => { document.body.replaceChildren(); delete globalThis.toastr; });
function open(suggestScope, projects = []) {
    let popup;
    const context = { POPUP_RESULT: { AFFIRMATIVE: 1, NEGATIVE: 0 }, POPUP_TYPE: { CONFIRM: 2 },
        skills: { listOwners: jest.fn(async () => ({ projects })) },
        getPresetManager: jest.fn(() => { throw new Error('Retired discovery'); }),
        Popup: class {
            constructor(html, type, title, opts) { popup = this; this.opts = opts; this.dlg = document.createElement('div'); this.dlg.innerHTML = html; document.body.append(this.dlg); }
            show() { return new Promise(resolve => { this.resolve = resolve; }); }
        } };
    const result = pickTargetScope(context, s => s, 'Choose owner', suggestScope);
    return { result, context, get popup() { return popup; } };
}
test('validates Project against actual owners and preserves cancellation', async () => {
    const state = open({ kind: 'project', projectId: 'p1' }, [{ projectId: 'p1', displayName: 'Harbor' }]);
    await Promise.resolve(); await Promise.resolve();
    const { popup } = state;
    const args = { result: 1, dlg: popup.dlg };
    popup.dlg.querySelector('select').replaceChildren(new Option('Missing', 'missing'));
    globalThis.toastr = { error: jest.fn() };
    expect(popup.opts.onClosing(args)).toBe(false);
    expect(toastr.error).toHaveBeenCalled();
    popup.dlg.querySelector('select').replaceChildren(new Option('Harbor', 'p1'));
    expect(popup.opts.onClosing(args)).toBe(true); popup.resolve(1);
    await expect(state.result).resolves.toEqual({ kind: 'project', projectId: 'p1' });
    expect(state.context.getPresetManager).not.toHaveBeenCalled();
    const cancelled = open(null); await Promise.resolve(); await Promise.resolve(); cancelled.popup.resolve(0);
    await expect(cancelled.result).resolves.toBeNull();
});
test('legacy suggestion defaults to Global; Project selection exposes its field', async () => {
    const state = open({ kind: 'character', characterFile: 'old.png' }, [{ projectId: 'p1' }]);
    await Promise.resolve(); await Promise.resolve();
    const { popup } = state;
    expect(popup.dlg.querySelector('input:checked').value).toBe('global');
    const project = popup.dlg.querySelector('input[value="project"]'); project.checked = true; project.dispatchEvent(new Event('change'));
    expect(popup.dlg.querySelector('[data-skill-scope-row="project"]').hidden).toBe(false);
    popup.resolve(0); await state.result;
});
