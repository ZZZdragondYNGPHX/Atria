/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { mountAssetEditor, validateAssetPath } from '../../public/scripts/native/asset-editor.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const asset = { assetId: 'asset_a', path: 'assets/a.png', logicalName: 'Portrait', mediaType: 'image/png', metadata: { credit: 'Painter' } };
function setup(refs = []) {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const source = { assetFiles: [asset], project: { projectId: 'project_a' } };
    const client = { listSources: jest.fn(async () => [{ path: asset.path }, { path: 'assets/taken.png' }]), getResourceReferences: jest.fn(async () => refs), readSource: jest.fn(async () => ({ content: 'YQ==', size: 1 })) };
    const stageOperations = jest.fn(); mountAssetEditor({ document, root, source, projectId: 'project_a', client, stageOperations });
    const row = root.querySelector('article'); const button = label => [...row.querySelectorAll('button')].find(node => node.textContent === label);
    return { root, row, source, client, stageOperations, button };
}
test('asset paths reject collisions, traversal and paths outside the asset directory', () => {
    for (const path of ['other/a.png', 'assets/../a.png', 'assets//a.png', 'assets/a?.png', 'assets/a.png']) expect(() => validateAssetPath(path, [{ path: 'assets/A.png' }], [])).toThrow();
    expect(validateAssetPath(asset.path, [asset], [asset], asset)).toBe(asset.path);
});
test('preview stays in inert media and rename preserves identity and metadata in one reviewed workspace', async () => {
    const ui = setup(); ui.button('Preview asset').click(); await tick(); expect(ui.row.querySelector('img').alt).toBe('Portrait');
    ui.button('Edit asset').click(); await tick();
    const input = label => ui.row.querySelector(`[aria-label="${label}"]`);
    input('Asset path').value = 'assets/taken.png'; ui.button('Review asset changes').click(); await tick(); expect(ui.stageOperations).not.toHaveBeenCalled(); expect(ui.row.textContent).toContain('already exists');
    input('Asset path').value = 'assets/renamed.png'; input('Asset name').value = 'New portrait'; ui.button('Review asset changes').click(); await tick();
    const operations = ui.stageOperations.mock.calls[0][0]; expect(operations.map(item => item.operationType)).toEqual(['source.move', 'project.save']);
    expect(operations[1].input.source.assetFiles[0]).toEqual({ ...asset, path: 'assets/renamed.png', logicalName: 'New portrait' }); expect(ui.source.assetFiles[0]).toEqual(asset);
});
test('dependency inspection blocks removal and graph failure fails closed', async () => {
    const ui = setup([{ node: { resourceType: 'core.world', resourceId: 'world_a', displayName: 'Harbor', scope: 'project/project_a' }, edge: { kind: 'references' } }]);
    ui.button('Remove').click(); await tick(); expect(ui.row.textContent).toContain('Harbor'); expect(ui.button('Review asset removal')).toBeUndefined();
    ui.client.getResourceReferences.mockRejectedValue(new Error('offline')); ui.button('Remove').click(); await tick(); expect(ui.row.textContent).toContain('offline'); expect(ui.stageOperations).not.toHaveBeenCalled();
});
test('removal requires confirmation, ignores containment and rechecks references', async () => {
    const ui = setup([{ edge: { kind: 'contains' } }]); ui.button('Remove').click(); await tick(); expect(ui.stageOperations).not.toHaveBeenCalled();
    ui.button('Review asset removal').click(); await tick(); expect(ui.client.getResourceReferences).toHaveBeenCalledTimes(2);
    const operations = ui.stageOperations.mock.calls[0][0]; expect(operations.map(item => item.operationType)).toEqual(['source.delete', 'project.save']); expect(operations[1].input.source.assetFiles).toEqual([]);
});
test('replacement keeps exact asset ID and metadata; invalid metadata retains edits', async () => {
    const ui = setup(); ui.button('Edit asset').click(); await tick();
    const metadata = ui.row.querySelector('textarea'); metadata.value = '[]'; ui.button('Review asset changes').click(); await tick(); expect(ui.stageOperations).not.toHaveBeenCalled();
    metadata.value = '{"credit":"New painter"}'; const picker = ui.row.querySelector('[type=file]'); Object.defineProperty(picker, 'files', { value: [{ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }] });
    ui.button('Review asset changes').click(); await tick(); const operations = ui.stageOperations.mock.calls[0][0]; expect(operations[0].input).toEqual({ encoding: 'base64', content: 'AQI=' }); expect(operations[1].input.source.assetFiles[0].assetId).toBe(asset.assetId); expect(operations[1].input.source.assetFiles[0].metadata.credit).toBe('New painter');
});
