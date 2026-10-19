/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountPromptEditor, newPromptResource, resourceRef } from '../../public/scripts/native/prompt-authoring.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent === text);
const field = label => document.querySelector(`[aria-label="${label}"]`);
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('upstream comparison applies chosen edits to the same draft, preserves provenance and supports Undo/Redo across editor views', async () => {
    const type = 'core.prompt-module', old = { ...newPromptResource(type), body: 'Original', displayName: 'Original title' };
    const oldRef = resourceRef(type, old, { scope: 'library' });
    const upstream = { ...old, revision: 'upstream-2', body: 'Upstream prose', displayName: 'New title' }, nextRef = { ...oldRef, revision: upstream.revision };
    const privateResource = { ...old, promptModuleId: 'pmod_' + 'b'.repeat(32), revision: 'private', body: 'Private prose', provenance: [{ source: 'atria.fork', ref: JSON.stringify(oldRef) }] };
    const onSave = jest.fn();
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => [{ ref: oldRef, resource: old }, { ref: nextRef, resource: upstream }] }));
    mountPromptEditor({ document, parent: document.body, entry: { resource: privateResource, ref: resourceRef(type, privateResource, { scope: 'library' }) }, entries: [], librarySurface: true, onSave, onBack: jest.fn() });
    const panel = [...document.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === 'Compare an upstream revision');
    panel.open = true; panel.dispatchEvent(new Event('toggle')); await flush(); await flush();
    field('New upstream revision').value = JSON.stringify(nextRef); field('New upstream revision').dispatchEvent(new Event('change')); button('Compare revisions').click(); await flush();
    expect(button('Use merged draft').disabled).toBe(true);
    const resolution = field('Resolve /body'); resolution.value = 'local'; resolution.dispatchEvent(new Event('change'));
    button('Use merged draft').click(); expect(field('Prompt body').value).toBe('Private prose');
    button('Advanced editor').click(); let value = JSON.parse(document.querySelector('.atri-prompt-json').value);
    expect(value.displayName).toBe('New title'); expect(value.promptModuleId).toBe(privateResource.promptModuleId);
    expect(value.provenance.at(-1).source).toBe('atria.upstream');
    button('Undo').click(); value = JSON.parse(document.querySelector('.atri-prompt-json').value); expect(value.displayName).toBe('Original title');
    button('Redo').click(); button('Save revision').click(); await flush();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'New title', body: 'Private prose' }));
});

test('a preset Program upgrade copies new exact dependencies into its own draft and supplies them to sample preview', async () => {
    const type = 'core.prompt-program', old = newPromptResource(type), module = { ...newPromptResource('core.prompt-module'), body: 'New dependency' };
    const oldRef = resourceRef(type, old, { scope: 'library' }), moduleRef = resourceRef('core.prompt-module', module, { scope: 'library' });
    const upstream = { ...old, revision: 'new-upstream', stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] }, nextRef = { ...oldRef, revision: upstream.revision };
    const privateResource = { ...old, promptProgramId: 'pprog_' + 'c'.repeat(32), provenance: [{ source: 'atria.fork', ref: JSON.stringify(oldRef) }] };
    const onSave = jest.fn(), catalogue = [{ ref: oldRef, resource: old }, { ref: nextRef, resource: upstream }, { ref: moduleRef, resource: module }];
    let previewPayload;
    globalThis.fetch = jest.fn(async (url, options) => ({ ok: true, json: async () => {
        if (url.endsWith('/configuration')) return { routes: [{ runtimeRouteId: 'sample-route', scope: 'player', role: 'role.narrator', displayName: 'Model', modelProfileRef: { modelProfileId: 'model' }, promptProgramRef: oldRef }], models: [{ modelProfileId: 'model', limits: { contextTokens: 4000 } }] };
        if (url.endsWith('/preview/draft')) {
            previewPayload = JSON.parse(options.body);
            const observation = { authored: {}, effective: { inputTokens: 1, promptIr: { semanticBlocks: [] }, compilation: {} }, wire: {} };
            return { candidate: observation, baseline: observation, diff: { authored: [], effective: [], wire: [] } };
        }
        return catalogue;
    } }));
    mountPromptEditor({ document, parent: document.body, entry: { resource: privateResource, ref: resourceRef(type, privateResource, { scope: 'library' }) }, entries: [], librarySurface: true, presetSurface: true, onSave, onBack: jest.fn() });
    const panel = [...document.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === 'Compare an upstream revision');
    panel.open = true; panel.dispatchEvent(new Event('toggle')); await flush(); await flush();
    field('New upstream revision').value = JSON.stringify(nextRef); field('New upstream revision').dispatchEvent(new Event('change')); button('Compare revisions').click(); await flush();
    button('Use merged draft').click();
    const sample = document.querySelector('.atri-prompt-preview'); sample.open = true; sample.dispatchEvent(new Event('toggle')); await flush(); await flush();
    button('Preview sample').click(); await flush();
    expect(previewPayload.drafts).toHaveLength(2);
    expect(previewPayload.drafts[1].resource.body).toBe(module.body); expect(previewPayload.drafts[1].expectedFingerprint).toBeNull();
    button('Save revision').click(); await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    const [resource, upgrade] = onSave.mock.calls[0];
    expect(resource.displayName).toBe(privateResource.displayName); expect(resource.promptProgramId).toBe(privateResource.promptProgramId);
    expect(upgrade.dependencies).toHaveLength(1); expect(upgrade.dependencies[0].resource.body).toBe(module.body);
    expect(upgrade.dependencies[0].ref.resourceId).not.toBe(moduleRef.resourceId);
    expect(resource.stages[0].entries[0].moduleRef).toEqual(upgrade.dependencies[0].ref);
});

test('a derivative with missing upstream entries requires an exact replacement or removal for each private operation', async () => {
    const type = 'core.prompt-program', old = { ...newPromptResource(type), stages: [{ stageId: 'stage.main', entries: [{ entryId: 'old', kind: 'anchor', target: 'context.before_history', accepts: ['context.fact'] }] }] };
    const oldRef = resourceRef(type, old, { scope: 'library' }), upstream = { ...old, revision: 'new', stages: [{ stageId: 'stage.main', entries: [{ ...old.stages[0].entries[0], entryId: 'new' }] }] };
    const nextRef = { ...oldRef, revision: 'new' }, derivative = { ...newPromptResource(type), parentRef: oldRef, derive: [{ op: 'disable', stageId: 'stage.main', entryId: 'old' }] };
    const onSave = jest.fn(); globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => [{ ref: oldRef, resource: old }, { ref: nextRef, resource: upstream }] }));
    mountPromptEditor({ document, parent: document.body, entry: { resource: derivative, ref: resourceRef(type, derivative, { scope: 'library' }) }, entries: [], librarySurface: true, onSave, onBack: jest.fn() });
    const panel = [...document.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === 'Compare an upstream revision');
    panel.open = true; panel.dispatchEvent(new Event('toggle')); await flush(); await flush();
    field('New upstream revision').value = JSON.stringify(nextRef); field('New upstream revision').dispatchEvent(new Event('change')); button('Compare revisions').click(); await flush();
    expect(button('Use merged draft').disabled).toBe(true);
    const resolution = field('Resolve /derive/0'); resolution.value = JSON.stringify({ stageId: 'stage.main', entryId: 'new' }); resolution.dispatchEvent(new Event('change'));
    button('Use merged draft').click(); button('Save revision').click(); await flush();
    expect(onSave.mock.calls[0][0]).toMatchObject({ parentRef: nextRef, derive: [{ op: 'disable', stageId: 'stage.main', entryId: 'new' }] });
});
