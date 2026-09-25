/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { renderResourceReferenceRows } from '../../public/scripts/native/resource-reference-rows.js';
import { resourceReferenceForNode } from '../../public/scripts/native/studio-authoring.js';

test('reference rows show exact ownership and route to existing owners without resolving latest', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host = { openBuild: jest.fn(), openLibraryResource: jest.fn(), openRuntimeSection: jest.fn(), openLibraryWorld: jest.fn(), openLibraryWork: jest.fn() };
    const nodes = [
        { scope: 'project/project-a', resourceType: 'core.world', resourceId: 'world', revision: 'old', displayName: 'Project harbor' },
        { scope: 'library', resourceType: 'core.prompt-program', resourceId: 'prompt', revision: 'pinned', displayName: 'Narrator' },
        { scope: 'player', resourceId: 'route', displayName: 'Narration route', metadata: { exactRef: { revision: 'pinned' } } },
        { scope: 'package/pkg/version', resourceType: 'core.world', resourceId: 'world', revision: 'old', displayName: 'Packaged harbor' },
    ];
    renderResourceReferenceRows({ document, root, host, references: nodes.map((node, i) => ({ node, owner: i === 0 ? 'Adventure' : 'Library', edge: { kind: i === 2 ? 'runtime-route-exact' : 'references-exact' } })) });
    const rows = root.querySelectorAll('[data-atria-reference-row]');
    for (const row of rows) row.querySelector('button').click();
    await Promise.resolve();
    expect(host.openBuild).toHaveBeenCalledWith('project-a', 'Adventure');
    expect(host.openLibraryResource).toHaveBeenCalledWith({ scope: 'library', resourceType: 'core.prompt-program', resourceId: 'prompt', revision: 'pinned' }, 'Narrator');
    expect(host.openRuntimeSection).toHaveBeenCalledWith('routes', 'route');
    expect(host.openLibraryResource).toHaveBeenCalledWith({ scope: 'package', packageId: 'pkg', packageVersionId: 'version', resourceType: 'core.world', resourceId: 'world', revision: 'old' }, 'Packaged harbor');
    expect(host.openLibraryWork).not.toHaveBeenCalled();
    expect(root.textContent).toContain('pinned');
    expect(resourceReferenceForNode(nodes[3])).toMatchObject({ scope: 'package', packageId: 'pkg', packageVersionId: 'version', revision: 'old' });
});

test('local selection and relationship review are explicit and package originals have no mutation action', () => {
    const root = document.createElement('div'); const host = { openBuild: jest.fn() }; const onOpen = jest.fn(() => true), onManage = jest.fn();
    const local = { scope: 'project/local', resourceType: 'core.knowledge', resourceId: 'knowledge', revision: 'exact', displayName: 'Canon' };
    renderResourceReferenceRows({ document, root, host, onOpen, onManage, references: [{ node: local }] });
    root.querySelector('button').click(); expect(onOpen).toHaveBeenCalledWith(local); expect(host.openBuild).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain('Review relationship');
    root.replaceChildren();
    const library = { ...local, scope: 'library' };
    renderResourceReferenceRows({ document, root, host, onManage, references: [{ node: library }] });
    [...root.querySelectorAll('button')].find(item => item.textContent === 'Review relationship').click();
    expect(onManage).toHaveBeenCalledWith(library, resourceReferenceForNode(library));
});
