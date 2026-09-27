/** @jest-environment jsdom */
import { jest, test, expect, beforeEach } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { mountExtensionPlugins } from '../../public/scripts/native/extensions-workspace.js';
import { createSkillOrganization } from '../../public/scripts/native/skill-organization.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';

globalThis.structuredClone ??= value => deserialize(serialize(value));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent === text);
const input = label => [...document.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === label) || [...document.querySelectorAll('label')].find(node => node.textContent === label)?.querySelector('input,select,textarea');
beforeEach(() => { document.body.replaceChildren(); });

test('script editor saves stable OR scope IDs, preserves unavailable selections and excludes revision', async () => {
    const record = { id: 'ext_a', revision: 'r1', kind: 'local', name: 'Example', enabled: false, files: { 'index.js': 'export function activate() {}' }, entrypoint: 'index.js', sourceUrl: null, targets: { global: false, presets: ['missing'], works: [] } };
    const client = { list: jest.fn(async () => [record]), get: jest.fn(async () => record), save: jest.fn(async () => record) };
    const controller = mountExtensionPlugins({ body: document.body, client, presets: async () => [{ presetId: 'preset_one', displayName: 'Same name' }], productClient: { listWorks: async () => [{ package: { packageId: 'work_one', displayName: 'Same name' } }] } });
    await flush(); button('Local scripts').click(); await flush(); button('Edit').click(); await flush();
    input('Global').checked = true;
    input('Same name · preset_one').checked = true; input('Same name · work_one').checked = true;
    button('Save').click(); await flush();
    expect(client.save).toHaveBeenCalledWith(expect.objectContaining({ targets: { global: true, presets: ['preset_one', 'missing'], works: ['work_one'] } }), 'r1');
    expect(client.save.mock.calls[0][0]).not.toHaveProperty('revision');
    controller.dispose();
});

test('conflict keeps unsaved script and old revision without retrying writes', async () => {
    const client = { list: async () => [], save: jest.fn(async () => { throw Object.assign(new Error('conflict'), { status: 409 }); }) };
    const controller = mountExtensionPlugins({ body: document.body, client, presets: async () => [], productClient: { listWorks: async () => [] } });
    await flush(); button('Local scripts').click(); await flush(); button('New script').click(); await flush();
    input('Name').value = 'Draft'; input('JavaScript').value = 'my draft'; button('Save').click(); await flush();
    expect(input('JavaScript').value).toBe('my draft'); expect(document.querySelector('[role=alert]').textContent).toContain('draft is kept');
    expect(client.save).toHaveBeenCalledTimes(1); expect(document.querySelector('fieldset').disabled).toBe(false);
    controller.dispose();
});

test('disposed plugin listing cannot repaint a newer owner', async () => {
    let resolve;
    const controller = mountExtensionPlugins({ body: document.body, client: { list: () => new Promise(done => { resolve = done; }) } });
    controller.dispose(); document.body.textContent = 'new owner'; resolve([]); await flush();
    expect(document.body.textContent).toBe('new owner');
});

test('external install and update use the existing URL endpoint and revision', async () => {
    const record = { id: 'ext_a', revision: 'r1', name: 'External', kind: 'external', enabled: false, sourceUrl: 'https://example.org/plugin.git' };
    const client = { list: async () => [record], install: jest.fn(async () => record) };
    const controller = mountExtensionPlugins({ body: document.body, client, confirm: async () => true });
    await flush(); input('HTTPS repository URL').value = record.sourceUrl; button('Install').click(); await flush();
    expect(client.install).toHaveBeenNthCalledWith(1, record.sourceUrl);
    button('Update').click(); await flush();
    expect(client.install).toHaveBeenNthCalledWith(2, record.sourceUrl, { id: record.id, expectedRevision: 'r1' });
    controller.dispose();
});

function skillMount(entry) {
    document.body.innerHTML = '<main><div class="atria_skill_manager_body"><div class="atria_skill_row"><div class="atria_skill_row_main"></div></div></div></main>';
    const row = document.querySelector('.atria_skill_row'); row.dataset.skillName = entry.name; row.dataset.skillScope = JSON.stringify(entry.scope);
    return document.querySelector('main');
}
test('folder deletion only clears folder IDs and retains invocation settings', async () => {
    const entry = { name: 'test', scope: { kind: 'global' } }, key = skillEntryKey(entry);
    const snapshot = { revision: 'r1', value: { schemaVersion: 1, folders: [{ id: 'folder_one', name: 'One' }], skills: { [key]: { folderId: 'folder_one', paths: { narrative: 'off', studio: 'always' } } } } };
    const request = jest.fn(async () => snapshot), refresh = jest.fn();
    await createSkillOrganization({ request, confirm: async () => true }).render(skillMount(entry), [entry], refresh);
    button('Delete folder').click(); await flush();
    expect(request.mock.calls[1][1].body).toEqual({ expectedRevision: 'r1', value: { schemaVersion: 1, folders: [], skills: { [key]: { folderId: null, paths: { narrative: 'off', studio: 'always' } } } } });
});
test('per-path defaults and save preserve independent physical scope', async () => {
    const entry = { name: 'test', scope: { kind: 'package', packageId: 'p', packageVersionId: 'v' }, metadata: { 'atria-paths': 'studio' } }, key = skillEntryKey(entry);
    const request = jest.fn(async () => ({ revision: 'r1', value: { schemaVersion: 1, folders: [], skills: {} } }));
    await createSkillOrganization({ request }).render(skillMount(entry), [entry], jest.fn());
    expect(input('Narrative').value).toBe('off'); expect(input('Studio').value).toBe('on-demand');
    input('Studio').value = 'always'; button('Save Skill settings').click(); await flush();
    expect(request.mock.calls[1][1].body.value.skills[key]).toEqual({ folderId: null, paths: { narrative: 'off', studio: 'always', agents: 'off' } });
});

test('Skill preference conflicts keep the pending selects and never retry blindly', async () => {
    const entry = { name: 'test', scope: { kind: 'global' } };
    const request = jest.fn(async (_path, options) => {
        if (options) throw Object.assign(new Error('conflict'), { status: 409 });
        return { revision: 'r1', value: { schemaVersion: 1, folders: [], skills: {} } };
    });
    const refresh = jest.fn();
    await createSkillOrganization({ request }).render(skillMount(entry), [entry], refresh);
    input('Studio').value = 'always'; button('Save Skill settings').click(); await flush();
    expect(input('Studio').value).toBe('always'); expect(refresh).not.toHaveBeenCalled();
    expect(document.querySelector('[role=alert]').textContent).toContain('Refresh before trying again');
    expect(request).toHaveBeenCalledTimes(2);
});
