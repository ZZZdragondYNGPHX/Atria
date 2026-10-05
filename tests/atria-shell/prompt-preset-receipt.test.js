/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountPromptPresets } from '../../public/scripts/native/prompt-presets.js';
import { newPromptResource } from '../../public/scripts/native/prompt-authoring.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; jest.restoreAllMocks(); });

test('preset owner Back checks the editor draft; committed refresh failures expose only a read retry', async () => {
    const program = newPromptResource('core.prompt-program');
    let reads = 0, writes = 0;
    globalThis.fetch = jest.fn(async (_path, options) => {
        if (options.method === 'PUT') { writes++; return { ok: true, json: async () => ({ presetId: program.promptProgramId, revision: 'saved' }) }; }
        reads++;
        if (reads === 2) throw new Error('Refresh failed');
        return { ok: true, json: async () => ({ presetId: program.promptProgramId, revision: reads === 1 ? 'base' : 'saved', programId: program.promptProgramId, entries: [{ resourceType: 'core.prompt-program', resource: program }], categories: [], moduleCategories: {} }) };
    });
    const controller = mountPromptPresets({ document, body: document.body, host: {}, route: { child: { id: 'prompt-presets:' + program.promptProgramId } } });
    await flush(); button('Prompt Programs').click(); await flush();
    const input = document.querySelector('[aria-label="Display name"]'); input.value = 'Changed'; input.dispatchEvent(new Event('input', { bubbles: true })); await flush();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    button('Back to presets').click(); await flush(); expect(input.isConnected).toBe(true); expect(input.value).toBe('Changed');
    button('Save revision').click(); await flush();
    expect(writes).toBe(1); expect(document.body.textContent).toContain('Saved. The view could not be refreshed.');
    expect(button('Save revision')).toBeUndefined();
    button('Try again').click(); await flush(); expect(writes).toBe(1); expect(reads).toBe(3);
    controller.dispose();
});
