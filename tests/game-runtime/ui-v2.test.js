/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { jest, test, expect, afterEach } from '@jest/globals';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { mountUiDocument } from '../../public/scripts/native/experience/ui/v2-runtime.js';
import { createSurfaceHost } from '../../public/scripts/native/experience/ui/surfaces.js';
import { expression, valueTemplate } from '../../public/scripts/native/experience/ui/v2-values.js';
import { compileExperienceComponentModel } from '../../public/scripts/native/experience/ui/component-model.js';

const fixture = () => JSON.parse(readFileSync(new URL('../native/fixtures/component-v2-opening.json', import.meta.url), 'utf8'));
const mounted = [];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function mount(raw = fixture(), overrides = {}) {
    const root = document.createElement('section'); document.body.append(root);
    const writes = jest.fn(); const dispatchAction = jest.fn(async () => ({ receiptId: 'receipt', compensation: 'refund' }));
    const composer = { setDraft: jest.fn(), submit: jest.fn(async () => 'ok') };
    const data = { items: Array.from({ length: 5 }, (_, index) => ({ id: String(index), name: 'Item ' + index })) };
    const runtime = mountUiDocument(compileUiDocument(raw, { mode: 'component' }), {
        document, window, environmentRoot: root,
        surfaceHost: createSurfaceHost({ resolveSurface: () => root }),
        data, stateStorage: { write: writes }, composer,
        worldSession: { getState: () => ({}), getRevisionId: () => 'rev_1', dispatchAction }, ...overrides,
    });
    mounted.push(runtime); return { runtime, root, writes, composer, data, dispatchAction };
}
afterEach(() => { mounted.splice(0).forEach(runtime => runtime.dispose()); document.body.replaceChildren(); });

test('uncertain authority failure retries the exact request and later failure resumes after commit', async () => {
    const raw = fixture();
    raw.actions.buy = { steps: [{ op: 'command.dispatch', commandId: 'buy', args: { name: { expr: 'ui.name' } } }, { op: 'composer.submit' }] };
    const dispatchAction = jest.fn().mockRejectedValueOnce(new Error('Transport interrupted')).mockResolvedValue({ receiptId: 'r1' });
    const composer = { submit: jest.fn().mockRejectedValueOnce(new Error('Generation failed')).mockResolvedValue('ok') };
    const { runtime } = mount(raw, { worldSession: { getRevisionId: () => 'rev_1', dispatchAction }, composer });
    runtime.state.set('ui.name', 'Original');
    await expect(runtime.execute('buy')).rejects.toThrow('Transport');
    runtime.state.set('ui.name', 'Edited');
    await expect(runtime.execute('buy')).rejects.toThrow('Generation');
    expect(dispatchAction.mock.calls[1][0]).toEqual(dispatchAction.mock.calls[0][0]);
    expect(dispatchAction.mock.calls[1][0].args.name).toBe('Original');
    await runtime.execute('buy');
    expect(dispatchAction).toHaveBeenCalledTimes(2);
    expect(composer.submit).toHaveBeenCalledTimes(2);
});

test('remount restores declared session/player state while mount drafts reset', () => {
    const saved = new Map();
    const stateStorage = { read: (root, key, scope) => saved.get([root, key, scope].join(':')), write: (root, key, scope, value) => saved.set([root, key, scope].join(':'), value) };
    const first = mount(fixture(), { stateStorage }).runtime;
    first.state.set('ui.name', 'Saved'); first.state.set('ui.path', 'scholar'); first.state.set('prefs.compact', true); first.dispose();
    const next = mount(fixture(), { stateStorage }).runtime;
    expect(next.state.snapshot()).toMatchObject({ ui: { name: 'Saved', path: 'explorer' }, prefs: { compact: true } });
});

test('host confirmation cancels pending work on disposal', async () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    const raw = fixture();
    raw.actions.buy = { constraints: [{ when: 'true', status: 'confirm_required', reasonCode: 'buy', playerMessage: 'Confirm purchase' }], steps: [{ op: 'command.dispatch', commandId: 'buy' }] };
    const { runtime, dispatchAction } = mount(raw);
    const pending = runtime.execute('buy'); await flush();
    expect(document.querySelector('dialog').open).toBe(true);
    runtime.dispose();
    expect(await pending).toEqual({ status: 'cancelled' });
    expect(dispatchAction).not.toHaveBeenCalled(); expect(document.querySelector('dialog')).toBeNull();
});

test('strict field and authority constraints reject malformed shapes', () => {
    const changes = [
        raw => { raw.localState.name.minLength = -1; },
        raw => { raw.localState.name.min = 1; },
        raw => { raw.localState.name.enum = [1]; },
        raw => { raw.preferences.compact.scope = 'world'; },
        raw => { raw.actions.bad = { compensation: 'undo', steps: [{ op: 'ui.reset', path: 'ui.name' }] }; },
        raw => { raw.actions.bad = { steps: [{ op: 'command.dispatch', commandId: 'a' }, { op: 'command.dispatch', commandId: 'b' }] }; },
    ];
    for (const change of changes) { const raw = fixture(); change(raw); expect(() => compileUiDocument(raw, { mode: 'component' })).toThrow(); }
});

test('v2 Opening validates, preserves drafts, branches forward/back and submits through Composer once', async () => {
    const { runtime, composer, dispatchAction, writes } = mount();
    const form = document.getElementById('atri-ui-setup_form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
    expect(composer.submit).not.toHaveBeenCalled();
    expect(document.activeElement.id).toBe('atri-ui-name');
    const input = document.activeElement; input.value = 'Aster'; input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(writes).toHaveBeenCalledWith('ui', 'name', 'session', 'Aster');
    expect(dispatchAction).not.toHaveBeenCalled();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
    expect(document.getElementById('atri-ui-review_form').closest('[data-atria-game-mount]').hidden).toBe(false);
    expect(document.getElementById('atri-ui-greeting').textContent).toBe('Welcome, Aster');
    await runtime.execute('back');
    expect(document.getElementById('atri-ui-name')).toBe(input);
    expect(input.value).toBe('Aster');
    await runtime.execute('next');
    await Promise.all([runtime.execute('begin'), runtime.execute('begin')]);
    expect(composer.submit).toHaveBeenCalledTimes(1);
    expect(composer.setDraft).toHaveBeenCalledWith('Name: Aster; Path: explorer');
});

test('keyed Collection materializes a page, grows on demand and retains nodes/focus on refresh', () => {
    const { runtime, data } = mount();
    const collection = document.getElementById('atri-ui-items');
    expect(collection.querySelectorAll('.atri-ui-text')).toHaveLength(2);
    const first = document.getElementById('atri-ui-item-0');
    const button = collection.querySelector('button'); button.focus(); button.click();
    expect(collection.querySelectorAll('.atri-ui-text')).toHaveLength(4);
    data.items[0].name = 'Updated'; runtime.refresh();
    expect(document.getElementById('atri-ui-item-0')).toBe(first);
    expect(first.textContent).toBe('Updated'); expect(document.activeElement).toBe(button);
});

test('UI state and player preferences remain typed and never call World authority', async () => {
    const { runtime, writes, dispatchAction } = mount();
    await runtime.execute('compact');
    expect(writes).toHaveBeenCalledWith('prefs', 'compact', 'player', true);
    expect(dispatchAction).not.toHaveBeenCalled();
    expect(() => runtime.state.set('world.hp', 1)).toThrow(/Undeclared/);
    expect(() => runtime.state.set('ui.name', 4)).toThrow(/type/);
    runtime.state.set('ui.name', 'Old'); runtime.state.reset('ui.name');
    expect(document.getElementById('atri-ui-name').value).toBe('');
});

test.each(['allowed', 'advisory', 'confirm_required', 'blocked'])('typed %s constraints are enforced before dispatch', async status => {
    const raw = fixture();
    raw.actions.buy = { constraints: [{ when: 'true', status, reasonCode: 'purchase', playerMessage: 'Purchase?' }], steps: [{ op: 'command.dispatch', commandId: 'buy', args: { name: { expr: 'ui.name' } } }] };
    const confirm = jest.fn(async () => true);
    const { runtime, dispatchAction } = mount(raw, { confirm });
    const outcome = await runtime.execute('buy').then(() => 'done', () => 'blocked');
    expect(outcome).toBe(status === 'blocked' ? 'blocked' : 'done');
    expect(dispatchAction).toHaveBeenCalledTimes(status === 'blocked' ? 0 : 1);
    expect(confirm).toHaveBeenCalledTimes(status === 'confirm_required' ? 1 : 0);
});

test('cancellation and failure stop the sequence without implicit rollback or later side effects', async () => {
    const raw = fixture(); raw.actions.buy = { steps: [{ op: 'command.dispatch', commandId: 'buy' }, { op: 'ui.set', path: 'ui.name', value: 'After' }] };
    const worldSession = { getRevisionId: () => 'rev_1', dispatchAction: jest.fn(async () => { throw new Error('Conflict'); }) };
    const { runtime } = mount(raw, { worldSession });
    await expect(runtime.execute('buy')).rejects.toThrow('Conflict');
    expect(runtime.state.snapshot().ui.name).toBe('');
});

test('pure UI expressions/templates reuse Formula AST with bounded roots and no executable escape', () => {
    expect(expression('ui["display-name"]').read({ ui: { 'display-name': 'Aster' } })).toBe('Aster');
    expect(() => expression('data["constructor"]')).toThrow(/blocked/);
    expect(() => expression('data[ui.name]')).toThrow(/literal/);
    expect(expression('concat("Hello ", ui.name)').read({ ui: { name: 'Aster' } })).toBe('Hello Aster');
    expect(valueTemplate({ template: '{{ui.name}}' }).read({ ui: { name: '<script>' } })).toBe('<script>');
    for (const source of ['window.location', 'ui.constructor', 'rng.float()', 'ui.x = 2', 'fetch("url")']) expect(() => expression(source)).toThrow();
});

test.each([
    raw => { raw.schemaVersion = 1; },
    raw => { raw.script = 'x.js'; },
    raw => { raw.localState.name.type = 'any'; },
    raw => { raw.views[0].root.children[1].model = 'world.hp'; },
    raw => { raw.views[0].root.children[1].props.css = 'red'; },
    raw => { raw.actions.next.steps = [{ op: 'world.patch' }]; },
    raw => { raw.views[0].surface = 'app.root'; },
    raw => { raw.opening.steps[0].next[0].to = 'missing'; },
    raw => { raw.actions.next.steps = [{ op: 'command.dispatch', commandId: 'one' }, { op: 'command.dispatch', commandId: 'two' }]; },
])('strict v2 rejects unsupported or authority-breaking documents %#', mutate => {
    const raw = fixture(); mutate(raw); expect(() => compileUiDocument(raw, { mode: 'component' })).toThrow();
});

test('v1 never interprets a v2 document', () => {
    expect(() => compileExperienceComponentModel(fixture(), { mode: 'component' })).toThrow(/unknown field/);
});
