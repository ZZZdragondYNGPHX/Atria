/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { mountNativeStudioWorkspace } from '../../public/scripts/native/studio-workspace.js';
import { mountNativeWorldKnowledgeWorkspace } from '../../public/scripts/native/library-workspaces.js';

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        },
    };
}

describe('N9 Native World/Knowledge and Studio workspaces', () => {
    let requests;

    beforeEach(() => {
        document.body.innerHTML = '<main id="slot"></main>';
        requests = [];
        globalThis.Atria = {
            getContext: () => ({
                getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }),
            }),
        };
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            const path = String(url);
            const method = options.method || 'GET';
            requests.push({ path, method, body: options.body });

            if (path === '/api/native/product/worlds') {
                return response([{
                    world: {
                        worldId: 'world_11111111111111111111111111111111',
                        displayName: 'Native World',
                        currentRevisionId: 'worldrev_11111111111111111111111111111111',
                    },
                    currentRevision: {
                        worldId: 'world_11111111111111111111111111111111',
                        worldRevisionId: 'worldrev_11111111111111111111111111111111',
                        knowledgeBindingIds: [],
                        assetIds: [],
                    },
                }]);
            }
            if (
                path === '/api/native/product/worlds/world_11111111111111111111111111111111'
                && method === 'PUT'
            ) {
                const body = JSON.parse(options.body);
                return response({
                    worldId: 'world_11111111111111111111111111111111',
                    displayName: body.displayName,
                    currentRevisionId: 'worldrev_22222222222222222222222222222222',
                });
            }
            if (path === '/api/native/product/worlds/world_11111111111111111111111111111111') {
                return response({
                    world: {
                        worldId: 'world_11111111111111111111111111111111',
                        displayName: 'Native World',
                        currentRevisionId: 'worldrev_22222222222222222222222222222222',
                    },
                    revisions: [
                        {
                            worldId: 'world_11111111111111111111111111111111',
                            worldRevisionId: 'worldrev_11111111111111111111111111111111',
                            createdAt: 1,
                            knowledgeBindingIds: [],
                            assetIds: [],
                        },
                        {
                            worldId: 'world_11111111111111111111111111111111',
                            worldRevisionId: 'worldrev_22222222222222222222222222222222',
                            createdAt: 2,
                            knowledgeBindingIds: [],
                            assetIds: [],
                        },
                    ],
                    currentRevision: {
                        worldRevisionId: 'worldrev_22222222222222222222222222222222',
                    },
                });
            }
            if (path === '/api/native/product/knowledge') {
                return response([{
                    knowledgeBase: {
                        knowledgeBaseId: 'kb_11111111111111111111111111111111',
                        displayName: 'Native Knowledge',
                        currentRevisionId: 'kbrev_22222222222222222222222222222222',
                    },
                    currentRevision: {
                        knowledgeRevisionId: 'kbrev_22222222222222222222222222222222',
                    },
                    bindingCount: 1,
                }]);
            }
            if (
                path === '/api/native/product/knowledge/kb_11111111111111111111111111111111'
                && method === 'PUT'
            ) {
                const body = JSON.parse(options.body);
                return response({
                    knowledgeBaseId: 'kb_11111111111111111111111111111111',
                    displayName: body.displayName,
                    currentRevisionId: 'kbrev_22222222222222222222222222222222',
                });
            }
            if (path === '/api/native/product/knowledge/kb_11111111111111111111111111111111') {
                return response({
                    knowledgeBase: {
                        knowledgeBaseId: 'kb_11111111111111111111111111111111',
                        displayName: 'Native Knowledge',
                        currentRevisionId: 'kbrev_22222222222222222222222222222222',
                    },
                    revisions: [
                        {
                            knowledgeBaseId: 'kb_11111111111111111111111111111111',
                            knowledgeRevisionId: 'kbrev_11111111111111111111111111111111',
                            entryIds: [],
                            createdAt: 1,
                        },
                        {
                            knowledgeBaseId: 'kb_11111111111111111111111111111111',
                            knowledgeRevisionId: 'kbrev_22222222222222222222222222222222',
                            entryIds: ['entry_1'],
                            createdAt: 2,
                        },
                    ],
                    selectedRevision: {
                        knowledgeRevisionId: 'kbrev_22222222222222222222222222222222',
                    },
                    entries: [{
                        knowledgeEntryId: 'entry_1',
                        content: 'Native entry',
                        metadata: { title: 'Entry' },
                    }],
                    bindings: [{
                        binding: {
                            knowledgeBindingId: 'kbinding_11111111111111111111111111111111',
                            source: {
                                kind: 'library',
                                knowledgeBaseId: 'kb_11111111111111111111111111111111',
                                knowledgeRevisionId: 'kbrev_22222222222222222222222222222222',
                            },
                            enabled: true,
                            mode: 'augment',
                        },
                        references: [{ kind: 'world-revision', worldRevisionId: 'worldrev_2' }],
                    }],
                });
            }
            if (path === '/api/native/studio/projects') {
                return response([{
                    project: {
                        projectId: 'project_11111111111111111111111111111111',
                        packageId: 'pkg_11111111111111111111111111111111',
                        displayName: 'Native Project',
                        updatedAt: 2,
                    },
                    revision: {
                        projectId: 'project_11111111111111111111111111111111',
                        revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    },
                }]);
            }
            if (path === '/api/native/studio/projects/project_11111111111111111111111111111111') {
                return response({
                    source: {
                        project: {
                            projectId: 'project_11111111111111111111111111111111',
                            packageId: 'pkg_11111111111111111111111111111111',
                            displayName: 'Native Project',
                            updatedAt: 2,
                        },
                        package: {
                            name: 'Native Project Work',
                            version: '1.0.0',
                            entryPoints: [{
                                entryPointId: 'entrypoint_11111111111111111111111111111111',
                                displayName: 'Start',
                                actorIds: [],
                                worldIds: [],
                                knowledgeBindingIds: [],
                                runtime: { experience: { mode: 'text' } },
                            }],
                            actors: [],
                            capabilities: [],
                            permissions: [],
                        },
                        worlds: [],
                        knowledge: [],
                        knowledgeBindings: [],
                        dependencies: {
                            worlds: [{
                                worldId: 'world_11111111111111111111111111111111',
                                worldRevisionId: 'worldrev_11111111111111111111111111111111',
                            }],
                            knowledge: [{
                                knowledgeBaseId: 'kb_11111111111111111111111111111111',
                                knowledgeRevisionId: 'kbrev_11111111111111111111111111111111',
                            }],
                            knowledgeBindings: [],
                            assets: [],
                        },
                        assetFiles: [],
                    },
                    files: [{ path: 'ui/main.json', size: 10 }],
                    revision: {
                        projectId: 'project_11111111111111111111111111111111',
                        revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    },
                });
            }
            if (path === '/api/native/studio/resources/registry') {
                return response({ schemaVersion: 1, graphMode: 'derived-readonly', descriptors: [] });
            }
            if (path === '/api/native/studio/resources/graph') {
                return response({ nodes: [], edges: [] });
            }
            if (path.startsWith('/api/native/studio/resources?projectId=')) {
                return response([]);
            }
            if (path === '/api/native/studio/library/resources') {
                return response([
                    {
                        resourceType: 'core.world',
                        resourceId: 'world_11111111111111111111111111111111',
                        displayName: 'Native World',
                        currentRevision: 'worldrev_22222222222222222222222222222222',
                        revisions: [
                            'worldrev_11111111111111111111111111111111',
                            'worldrev_22222222222222222222222222222222',
                        ],
                        authority: 'native-library',
                    },
                    {
                        resourceType: 'core.knowledge',
                        resourceId: 'kb_11111111111111111111111111111111',
                        displayName: 'Native Knowledge',
                        currentRevision: 'kbrev_22222222222222222222222222222222',
                        revisions: [
                            'kbrev_11111111111111111111111111111111',
                            'kbrev_22222222222222222222222222222222',
                        ],
                        authority: 'native-library',
                    },
                ]);
            }
            if (path === '/api/native/studio/projects/project_11111111111111111111111111111111/history?limit=40') {
                return response([]);
            }
            if (
                path === '/api/native/studio/projects/project_11111111111111111111111111111111/resources/update'
                && method === 'POST'
            ) {
                return response({
                    changeSet: {
                        changeSetId: 'changeset_update',
                        resultingRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    },
                });
            }
            if (path === '/api/native/product/projects') {
                return response([{
                    projectId: 'project_11111111111111111111111111111111',
                    packageId: 'pkg_11111111111111111111111111111111',
                    displayName: 'Native Project',
                    updatedAt: 2,
                }]);
            }
            if (path === '/api/native/product/projects/project_11111111111111111111111111111111') {
                return response({
                    source: {
                        project: {
                            projectId: 'project_11111111111111111111111111111111',
                            packageId: 'pkg_11111111111111111111111111111111',
                            displayName: 'Native Project',
                            updatedAt: 2,
                        },
                        package: {
                            name: 'Native Project Work',
                            version: '1.0.0',
                            entryPoints: [],
                            capabilities: [],
                            permissions: [],
                        },
                        worlds: [],
                        knowledge: [],
                        knowledgeBindings: [],
                        dependencies: {
                            worlds: [{
                                worldId: 'world_11111111111111111111111111111111',
                                worldRevisionId: 'worldrev_11111111111111111111111111111111',
                            }],
                            knowledge: [{
                                knowledgeBaseId: 'kb_11111111111111111111111111111111',
                                knowledgeRevisionId: 'kbrev_11111111111111111111111111111111',
                            }],
                            knowledgeBindings: ['kbinding_11111111111111111111111111111111'],
                        },
                        assetFiles: [],
                    },
                    files: [{ path: 'runtime/main.js', size: 10 }],
                });
            }
            if (
                path === '/api/native/product/projects/project_11111111111111111111111111111111/dependencies'
                && method === 'PUT'
            ) {
                return response(JSON.parse(options.body));
            }
            throw new Error('Unexpected fetch ' + method + ' ' + path);
        });
    });

    afterEach(() => {
        delete globalThis.Atria;
        delete globalThis.fetch;
    });

    test('World / Knowledge detail surfaces read Native revisions, entries, bindings and references', async () => {
        const body = document.getElementById('slot');
        const host = {
            openLibrarySection: jest.fn(),
            openLibraryWorld: jest.fn(),
            openLibraryKnowledge: jest.fn(),
        };

        const controller = mountNativeWorldKnowledgeWorkspace({
            document,
            body,
            route: { domain: 'library', child: { id: 'worlds' } },
            host,
        });
        await flush();

        expect(body.querySelector('[data-atria-world-library="true"]')).not.toBeNull();
        body.querySelector('[data-atria-world-library] button').click();
        expect(host.openLibraryWorld).toHaveBeenCalled();

        controller.updateRoute({
            domain: 'library',
            child: { id: 'world:world_11111111111111111111111111111111' },
        });
        await flush();
        expect(body.querySelector('[data-atria-world-detail]')).not.toBeNull();
        expect(body.querySelectorAll('[data-atria-revision-id]')).toHaveLength(2);
        const worldName = body.querySelector('[aria-label="World name"]');
        worldName.value = 'Renamed World';
        [...body.querySelectorAll('button')].find(node => node.textContent === 'Rename World').click();
        await flush();
        expect(body.querySelector('[data-atria-world-detail] .atria-runtime-card__title').textContent)
            .toBe('Renamed World');

        controller.updateRoute({
            domain: 'library',
            child: { id: 'knowledge:kb_11111111111111111111111111111111' },
        });
        await flush();
        expect(body.querySelector('[data-atria-knowledge-detail]')).not.toBeNull();
        const knowledgeName = body.querySelector('[aria-label="Knowledge Base name"]');
        knowledgeName.value = 'Renamed Knowledge';
        [...body.querySelectorAll('button')].find(node => node.textContent === 'Rename Knowledge Base').click();
        await flush();
        expect(body.querySelector('[data-atria-knowledge-detail] .atria-runtime-card__title').textContent)
            .toBe('Renamed Knowledge');
        expect(body.querySelector('[data-atria-knowledge-entry-id="entry_1"]').textContent).toContain('Native entry');
        expect(body.querySelector('[data-atria-knowledge-bindings="true"]').textContent)
            .toContain('world-revision');
        expect(body.querySelectorAll('[data-atria-revision-id]')).toHaveLength(2);

        controller.dispose();
    });

    test('Build opens Atria Studio and explicitly updates an exact Library revision through Native Studio', async () => {
        const slot = document.getElementById('slot');
        const host = { openBuild: jest.fn() };
        const controller = mountNativeStudioWorkspace({
            document,
            slot,
            route: { domain: 'build', child: null },
            host,
        });
        await flush();

        expect(slot.querySelector('[data-atria-build-projects="true"]')).not.toBeNull();
        slot.querySelector('[data-atria-build-project-id] button').click();
        expect(host.openBuild).toHaveBeenCalledWith(
            'project_11111111111111111111111111111111',
            'Native Project',
        );

        controller.updateRoute({
            domain: 'build',
            child: {
                id: 'project:project_11111111111111111111111111111111',
                kind: 'detail',
            },
        });
        await flush();

        expect(slot.querySelector('[data-atria-studio-workspace]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-studio-resource-tree="true"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-studio-inspector="true"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-studio-activity="true"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-studio-mobile-nav="true"]')).not.toBeNull();

        slot.querySelector('[data-atria-studio-resource="worlds"]').click();
        await flush();
        const updateButton = [...slot.querySelectorAll('.atria-studio-library-relations__row button')]
            .find(node => node.textContent === 'Update');
        expect(updateButton).toBeTruthy();
        updateButton.click();
        await flush();

        const update = requests.find(item => (
            item.path.endsWith('/resources/update') && item.method === 'POST'
        ));
        expect(JSON.parse(update.body)).toEqual(expect.objectContaining({
            resourceType: 'core.world',
            resourceId: 'world_11111111111111111111111111111111',
            fromRevision: 'worldrev_11111111111111111111111111111111',
            toRevision: 'worldrev_22222222222222222222222222222222',
            baseRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            origin: { kind: 'human', id: 'atria.studio' },
        }));

        controller.dispose();
    });
});
