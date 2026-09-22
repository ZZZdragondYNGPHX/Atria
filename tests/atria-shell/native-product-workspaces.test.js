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

        controller.updateRoute({
            domain: 'library',
            child: { id: 'knowledge:kb_11111111111111111111111111111111' },
        });
        await flush();
        expect(body.querySelector('[data-atria-knowledge-detail]')).not.toBeNull();
        expect(body.querySelector('[data-atria-knowledge-entry-id="entry_1"]').textContent).toContain('Native entry');
        expect(body.querySelector('[data-atria-knowledge-bindings="true"]').textContent)
            .toContain('world-revision');
        expect(body.querySelectorAll('[data-atria-revision-id]')).toHaveLength(2);

        controller.dispose();
    });

    test('Studio lists ProjectStore projects and saves exact World/Knowledge/Binding dependencies', async () => {
        const slot = document.getElementById('slot');
        const host = { openStudio: jest.fn() };
        const controller = mountNativeStudioWorkspace({
            document,
            slot,
            route: { domain: 'studio', child: null },
            host,
        });
        await flush();

        expect(slot.querySelector('[data-atria-studio-projects="true"]')).not.toBeNull();
        slot.querySelector('[data-atria-studio-project-id] button').click();
        expect(host.openStudio).toHaveBeenCalledWith(
            'project_11111111111111111111111111111111',
            'Native Project',
        );

        controller.updateRoute({
            domain: 'studio',
            child: {
                id: 'project:project_11111111111111111111111111111111',
                kind: 'detail',
            },
        });
        await flush();

        expect(slot.querySelector('[data-atria-studio-project-detail]')).not.toBeNull();
        const worldRow = slot.querySelector('[data-atria-dependency-kind="world"]');
        const knowledgeRow = slot.querySelector('[data-atria-dependency-kind="knowledge"]');
        expect(worldRow.querySelector('input').checked).toBe(true);
        expect(worldRow.querySelector('select').value).toBe('worldrev_11111111111111111111111111111111');
        expect(knowledgeRow.querySelector('input').checked).toBe(true);
        expect(knowledgeRow.querySelector('select').value).toBe('kbrev_11111111111111111111111111111111');
        expect(slot.querySelector('[data-atria-knowledge-binding-id] input').checked).toBe(true);

        worldRow.querySelector('select').value = 'worldrev_22222222222222222222222222222222';
        knowledgeRow.querySelector('select').value = 'kbrev_22222222222222222222222222222222';
        [...slot.querySelectorAll('button')].find(node => node.textContent === 'Save Dependencies').click();
        await flush();

        const put = requests.find(item => item.method === 'PUT');
        expect(JSON.parse(put.body)).toEqual({
            dependencies: {
                worlds: [{
                    worldId: 'world_11111111111111111111111111111111',
                    worldRevisionId: 'worldrev_22222222222222222222222222222222',
                }],
                knowledge: [{
                    knowledgeBaseId: 'kb_11111111111111111111111111111111',
                    knowledgeRevisionId: 'kbrev_22222222222222222222222222222222',
                }],
                knowledgeBindings: ['kbinding_11111111111111111111111111111111'],
            },
        });

        controller.dispose();
    });
});
