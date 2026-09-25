/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountPromptEditor, mountPromptLibrary, mountStudioPromptTools, newPromptResource, resourceRef } from '../../public/scripts/native/prompt-authoring.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (root, text) => [...root.querySelectorAll('button')].find(item => item.textContent === text);
const response = (body, ok = true) => ({ ok, json: async () => body });
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
function editor(type = 'core.prompt-module', onSave = jest.fn()) {
    const resource = newPromptResource(type); const root = mountPromptEditor({ document, parent: document.body,
        entry: { resource, ref: resourceRef(type, resource, { scope: 'library' }) }, entries: [], onSave, onBack: jest.fn() });
    return { root, resource, onSave };
}

test('program stages use compiler ordering and adding keeps focus on the stage module picker', async () => {
    const program = newPromptResource('core.prompt-program');
    const entries = [
        ['pmod_z', 'Foundation Z', 'system.foundation', 0],
        ['pmod_a', 'Foundation A', 'system.foundation', 0],
        ['pmod_b', 'High priority', 'system.foundation', 9],
        ['pmod_c', 'Context', 'context.before_history', 99],
        ['pmod_d', 'Agent', 'agent.task', 0],
    ].map(([promptModuleId, displayName, target, priority]) => {
        const resource = { ...newPromptResource('core.prompt-module'), promptModuleId, displayName, target, priority };
        return { resource, ref: resourceRef('core.prompt-module', resource, { scope: 'library' }) };
    });
    program.stages[0].moduleRefs = [entries[3].ref, entries[0].ref, entries[1].ref, entries[4].ref];
    const onSave = jest.fn();
    const root = mountPromptEditor({ document, parent: document.body, entries, librarySurface: true,
        entry: { resource: program, ref: resourceRef('core.prompt-program', program, { scope: 'library' }) }, onSave, onBack: jest.fn() });
    const picker = root.querySelector('[data-atri-stage-module-picker]');
    picker.value = [...picker.options].find(option => option.textContent.startsWith('High priority')).value;
    button(root, 'Add module').click();
    expect(document.activeElement).toBe(root.querySelector('[data-atri-stage-module-picker]'));
    expect([...root.querySelectorAll('.atri-prompt-stages fieldset > div > span')].map(node => node.textContent.split(' · ')[0]))
        .toEqual(['High priority', 'Foundation A', 'Foundation Z', 'Agent', 'Context']);
    button(root, 'Save revision').click(); await flush();
    expect(onSave.mock.calls[0][0].stages[0].moduleRefs.map(ref => ref.resourceId)).toEqual(['pmod_b', 'pmod_a', 'pmod_z', 'pmod_d', 'pmod_c']);
    expect(program.stages[0].moduleRefs).toHaveLength(4); // Editor never mutates the pinned input snapshot.
});
test('Simple/Advanced retains edits and parse failures; failed save stays editable and success cannot double-submit', async () => {
    const onSave = jest.fn().mockRejectedValueOnce(new Error('Save refused')).mockResolvedValueOnce({});
    const { root } = editor('core.prompt-module', onSave); root.querySelector('[aria-label="Prompt body"]').value = 'Kept text';
    button(root, 'Advanced editor').click(); const json = root.querySelector('textarea'); const good = json.value; json.value = '{';
    button(root, 'Simple editor').click(); expect(root.querySelector('[role="alert"]')).not.toBeNull(); json.value = good; button(root, 'Simple editor').click();
    expect(root.querySelector('[aria-label="Prompt body"]').value).toBe('Kept text');
    button(root, 'Review / save revision').click(); await flush(); expect(root.textContent).toContain('Save refused');
    expect(button(root, 'Review / save revision').disabled).toBe(false); button(root, 'Review / save revision').click(); await flush();
    expect(button(root, 'Review / save revision').disabled).toBe(true); expect(onSave).toHaveBeenCalledTimes(2);
});

test('module sections start collapsed, retain expansion across editor modes and reveal invalid conditions', async () => {
    const { root, onSave } = editor();
    expect(root.querySelectorAll('[data-prompt-fold][open]')).toHaveLength(0);
    const module = root.querySelector('[data-prompt-fold="module"]'); module.open = true;
    button(root, 'Advanced editor').click(); button(root, 'Simple editor').click();
    expect(root.querySelector('[data-prompt-fold="module"]').open).toBe(true);
    const condition = root.querySelector('[data-prompt-fold="condition"]');
    const kind = condition.querySelector('select'); kind.value = 'compare'; kind.dispatchEvent(new Event('change'));
    button(root, 'Review / save revision').click(); await flush();
    expect(onSave).not.toHaveBeenCalled();
    expect(condition.open).toBe(true);
    expect(root.querySelector('[role="alert"]').textContent).toContain('declared variable');
});
test('clearing Generation temperature removes the old control instead of retaining it', async () => {
    const { root, onSave } = editor('core.generation-profile'); button(root, 'Advanced editor').click();
    const json = root.querySelector('textarea'), value = JSON.parse(json.value); value.sampling = { temperature: 0.5 }; json.value = JSON.stringify(value);
    button(root, 'Simple editor').click(); root.querySelector('[aria-label="Temperature"]').value = ''; button(root, 'Review / save revision').click(); await flush();
    expect(onSave.mock.calls[0][0].sampling).not.toHaveProperty('temperature');
});

test('canonical Generation editor retains provider controls across modes and validates stop sequences', async () => {
    const { root, onSave } = editor('core.generation-profile');
    root.querySelector('[aria-label="Reasoning effort (OpenAI / Anthropic adaptive)"]').value = 'high';
    root.querySelector('[aria-label="Cache key (OpenAI)"]').value = 'exact-cache';
    root.querySelector('[aria-label="Cache retention (OpenAI)"]').value = '24h';
    button(root, 'Advanced editor').click();
    expect(JSON.parse(root.querySelector('textarea').value)).toMatchObject({ reasoning: { effort: 'high' }, cache: { key: 'exact-cache', retention: '24h' } });
    button(root, 'Simple editor').click();
    const stop = root.querySelector('[aria-label="Stop sequences (JSON array)"]'); stop.value = 'invalid';
    button(root, 'Review / save revision').click(); await flush();
    expect(onSave).not.toHaveBeenCalled(); expect(stop.value).toBe('invalid');
    stop.value = '["END"]'; button(root, 'Review / save revision').click(); await flush();
    expect(onSave.mock.calls[0][0]).toMatchObject({ reasoning: { effort: 'high' }, cache: { key: 'exact-cache', retention: '24h' }, stop: { sequences: ['END'] } });
    expect(onSave.mock.calls[0][0].streaming).not.toHaveProperty('enabled');
});
test('Library loading/error/retry and Package original exposes Fork but never an editor', async () => {
    const resource = newPromptResource('core.prompt-program'); const ref = resourceRef('core.prompt-program', resource, { scope: 'package', packageId: 'pkg', packageVersionId: 'pkgv' });
    globalThis.fetch = jest.fn().mockResolvedValueOnce(response({ error: 'Unavailable' }, false)).mockResolvedValueOnce(response([{ ref, resource }]));
    const mounted = mountPromptLibrary({ document, body: document.body, route: { child: { id: 'prompt-programs' } }, host: {} });
    expect(document.body.textContent).toContain('Loading'); await flush(); expect(document.body.textContent).toContain('Unavailable');
    button(document.body, 'Retry resources').click(); await flush(); expect(document.body.textContent).toContain('Read-only original');
    expect(button(document.body, 'New revision')).toBeUndefined(); expect(button(document.body, 'Fork to Library')).toBeDefined(); mounted.dispose();
});
test('Project edit prepares A1 review only, with no Library POST', async () => {
    globalThis.fetch = jest.fn(async url => response(url.endsWith('/resources') ? [] : { routes: [] }));
    const state = { projectId: 'project', revision: { revision: 'r1' }, source: { package: {}, resources: [] } }; const stageProject = jest.fn(async () => true);
    await mountStudioPromptTools({ document, body: document.body, state, stageProject }); button(document.body, 'New project resource').click();
    button(document.body, 'Review / save revision').click(); await flush();
    expect(stageProject).toHaveBeenCalledTimes(1); expect(state.source.resources).toEqual([]);
    expect(globalThis.fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

test('Runtime Design reloads exact role recommendations and preserves optional requirements', async () => {
    const resource = newPromptResource('core.prompt-program'); const ref = resourceRef('core.prompt-program', resource, { scope: 'library' });
    globalThis.fetch = jest.fn(async url => response(url.endsWith('/resources') ? [{ resource, ref }] : { routes: [] }));
    const state = { projectId: 'project', revision: { revision: 'r1' }, source: { package: { runtime: { modelPrompt: { schemaVersion: 1, roles: [{ role: 'role.narrator', promptProgramRef: ref, requiredCapabilities: [], optionalCapabilities: ['generation.tools'] }] } } }, resources: [] } };
    await mountStudioPromptTools({ document, body: document.body, state, stageProject: jest.fn(), runtimeDesign: true });
    expect(JSON.parse(document.querySelector('[aria-label="Recommended Prompt"]').value)).toEqual(ref);
    button(document.body, 'Set role recommendation').click();
    expect(JSON.parse(document.querySelector('[aria-label="Runtime requirements JSON"]').value).roles[0].optionalCapabilities).toEqual(['generation.tools']);
});

test('P7 same-section route updates focus the exact revision and never substitute latest', async () => {
    const resource = newPromptResource('core.prompt-program'); resource.displayName = 'Pinned';
    const ref = resourceRef('core.prompt-program', resource, { scope: 'library' });
    globalThis.fetch = jest.fn(async () => response([{ ref, resource }]));
    const view = mountPromptLibrary({ document, body: document.body, route: { child: { id: 'prompt-programs' } }, host: {} }); await flush();
    view.updateRoute({ child: { id: 'prompt-programs:' + encodeURIComponent(JSON.stringify(ref)) } }); await flush();
    expect(document.activeElement.dataset.selected).toBe('true'); expect(JSON.parse(document.activeElement.dataset.atriResourceKey)).toEqual(ref);
    view.updateRoute({ child: { id: 'prompt-programs:' + encodeURIComponent(JSON.stringify({ ...ref, revision: 'missing' })) } }); await flush();
    expect(document.querySelector('[role="alert"]').textContent).toContain('exact revision is unavailable');
    expect(document.querySelector('[data-selected="true"]')).toBeNull(); view.dispose();
});


test('P7 translated editor chrome never translates user resource names or JSON payload', async () => {
    const previous = globalThis.__i18n; globalThis.__i18n = { translate: (text, key) => key?.startsWith('atria.') ? 'Translated' : text };
    try {
        const resource = newPromptResource('core.prompt-program'); resource.displayName = 'Routes';
        const ref = resourceRef('core.prompt-program', resource, { scope: 'library' });
        globalThis.fetch = jest.fn(async () => response([{ ref, resource }]));
        const mounted = mountPromptLibrary({ document, body: document.body, route: { child: { id: 'prompt-programs' } }, host: {} }); await flush();
        expect(document.querySelector('article h3').textContent).toBe('Routes');
        expect(document.querySelector('pre').textContent).toContain('"displayName": "Routes"'); mounted.dispose();
    } finally { globalThis.__i18n = previous; }
});
