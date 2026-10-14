/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { TextDecoder } from 'node:util';
import { sourceFileInfo, sourceTextDiff, validateSourceText, mountSourceEditor } from '../../public/scripts/native/source-editor.js';
globalThis.TextDecoder = TextDecoder;
const content = value => Buffer.from(value).toString('base64');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('file inspection never decodes binary, non UTF-8 or oversized files into writable text', () => {
    for (const [path, bytes] of [['a.png', 'text'], ['a.txt', Buffer.from([255])], ['a.dat', Buffer.from([0, 1])], ['huge.txt', 'a'.repeat(1024 * 1024 + 1)]]) expect(sourceFileInfo(path, content(bytes)).readOnly).toBe(true);
    expect(sourceFileInfo('x.json', content('\uFEFF{"x":1}')).text).toBe('\uFEFF{"x":1}');
});
test('diff locates changed lines, escapes through text and bounds large previews without truncating writes', () => {
    expect(sourceTextDiff('a\nb\nc', 'a\n<script>\nc').text).toBe('@@ -2,1 +2,1 @@\n- b\n+ <script>');
    expect(sourceTextDiff('a', 'a').text).toBe(''); expect(sourceTextDiff('', 'x\n'.repeat(600)).truncated).toBe(true);
});
test('format validation covers JSON, JSON Lines, YAML, XML and existing structured validators', async () => {
    await expect(validateSourceText({ extension: 'json' }, '{bad')).rejects.toThrow();
    await expect(validateSourceText({ extension: 'jsonl' }, '{}\n{bad')).rejects.toThrow();
    await expect(validateSourceText({ extension: 'xml' }, '<unclosed>')).rejects.toThrow('valid XML');
    const parseYaml = jest.fn(() => ({ value: 1 })), validateStructured = jest.fn();
    await validateSourceText({ extension: 'yaml' }, 'value: 1', { parseYaml, validateStructured }); expect(validateStructured).toHaveBeenCalledWith({ value: 1 }, 'value: 1');
    await expect(validateSourceText({ extension: 'json' }, '{}', { validateStructured: () => { throw new Error('Invalid component'); } })).rejects.toThrow('Invalid component');
});
async function setup() {
    const root = document.createElement('div'); document.body.replaceChildren(root); const stageOperations = jest.fn();
    const client = { listSources: jest.fn(async () => [{ path: 'a.json' }, { path: 'b.bin' }]), readSource: jest.fn(async (_, path) => ({ content: content(path === 'a.json' ? '{"a":1}' : 'bytes') })) };
    await mountSourceEditor({ document, root, projectId: 'project_a', client, stageOperations });
    return { root, client, stageOperations, editor: root.querySelector('textarea'), chooser: root.querySelector('select'), button: label => [...root.querySelectorAll('button')].find(node => node.textContent === label) };
}
test('invalid draft remains available, diff is inert, and only validated source enters Review', async () => {
    const ui = await setup(); ui.editor.value = '{bad'; ui.editor.dispatchEvent(new Event('input')); ui.button('Review Source Change').click(); await tick();
    expect(ui.stageOperations).not.toHaveBeenCalled(); expect(ui.editor.value).toBe('{bad'); expect(ui.root.textContent).toContain('Your draft is still here');
    ui.editor.value = '{"a":"<img>"}'; ui.editor.dispatchEvent(new Event('input')); expect(ui.root.querySelector('img')).toBeNull();
    ui.button('Review Source Change').click(); await tick(); expect(ui.stageOperations.mock.calls[0][0][0].input.content).toBe('{"a":"<img>"}');
});
test('switching to binary disables writes and restores unsaved text on return; failed reload blocks review', async () => {
    const ui = await setup(); ui.editor.value = '{"a":2}'; ui.editor.dispatchEvent(new Event('input'));
    ui.chooser.value = 'b.bin'; ui.chooser.dispatchEvent(new Event('change')); await tick(); expect(ui.editor.readOnly).toBe(true); expect(ui.button('Review Source Change').disabled).toBe(true);
    ui.chooser.value = 'a.json'; ui.chooser.dispatchEvent(new Event('change')); await tick(); expect(ui.editor.value).toBe('{"a":2}');
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    ui.client.readSource.mockRejectedValueOnce(new Error('offline')); ui.button('Reload file').click(); await tick(); expect(ui.button('Review Source Change').disabled).toBe(true);
    expect(ui.editor.value).toBe('{"a":2}'); expect(ui.editor.readOnly).toBe(true); expect(ui.editor.disabled).toBe(false);
    ui.button('Reload file').click(); await tick(); expect(ui.editor.value).toBe('{"a":1}'); expect(ui.button('Review Source Change').disabled).toBe(false); confirm.mockRestore();
});

test('file tree selection shares the selector draft and late reads cannot replace a newer file', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    let release;
    const client = { listSources: async () => [{ path: 'a.json' }, { path: 'b.json' }], readSource: jest.fn(async (_, path) => ({ content: content(path === 'a.json' ? '{"a":1}' : '{"b":1}') })) };
    const onSelection = jest.fn();
    const controller = await mountSourceEditor({ document, root, projectId: 'project_a', client, stageOperations: jest.fn(), onSelection });
    const editor = root.querySelector('textarea'); editor.value = '{"a":2}'; editor.dispatchEvent(new Event('input'));
    client.readSource.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const old = controller.selectFile('b.json');
    await expect(controller.selectFile('b.json')).resolves.toBe(false);
    await expect(controller.selectFile('a.json')).resolves.toBe(true);
    expect(editor.value).toBe('{"a":2}');
    release({ content: content('{"b":99}') }); await expect(old).resolves.toBe(false);
    expect(editor.value).toBe('{"a":2}'); expect(root.querySelector('select').value).toBe('a.json');
    expect(onSelection.mock.calls.map(([path]) => path)).toEqual(['a.json', 'b.json', 'a.json']);
    controller.dispose(); await expect(controller.selectFile('b.json')).resolves.toBe(false);
});

test('external selection is unavailable while a reviewed write is preparing and disposal blocks late staging', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root); let finish;
    const validateStructured = () => new Promise(resolve => { finish = resolve; });
    const stageOperations = jest.fn(), onReviewBusy = jest.fn();
    const client = { listSources: async () => [{ path: 'a.json' }, { path: 'b.json' }], readSource: async () => ({ content: content('{"a":1}') }) };
    const controller = await mountSourceEditor({ document, root, projectId: 'project_a', client, stageOperations, validateStructured, onReviewBusy });
    root.querySelector('textarea').value = '{"a":2}'; root.querySelector('textarea').dispatchEvent(new Event('input'));
    [...root.querySelectorAll('button')].find(node => node.textContent === 'Review Source Change').click();
    await expect(controller.selectFile('b.json')).resolves.toBe(false); expect(onReviewBusy).toHaveBeenCalledWith(true);
    controller.dispose(); finish(); await tick(); expect(stageOperations).not.toHaveBeenCalled();
});
