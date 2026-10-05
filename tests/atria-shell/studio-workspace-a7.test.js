/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { mountNativeStudioWorkspace } from '../../public/scripts/native/studio-workspace.js';

async function flush(rounds = 3) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
    }
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

const projectId = 'project_11111111111111111111111111111111';
const packageId = 'pkg_11111111111111111111111111111111';
const entryPointId = 'entrypoint_11111111111111111111111111111111';
const revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function projectDetail() {
    return {
        source: {
            format: 'atria-project-source',
            schemaVersion: 1,
            project: {
                projectId,
                packageId,
                displayName: 'Studio Project',
                createdAt: 1,
                updatedAt: 1,
            },
            package: {
                name: 'Studio Work',
                version: '1.0.0',
                actors: [],
                entryPoints: [{
                    entryPointId,
                    displayName: 'Start',
                    actorIds: [],
                    worldIds: [],
                    knowledgeBindingIds: [],
                    runtime: { experience: { mode: 'text' } },
                }],
                capabilities: [],
                permissions: [],
            },
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] },
            assetFiles: [],
        },
        files: [],
        revision: { projectId, revision, parentRevision: null },
    };
}

describe('A7 Atria Studio workspace', () => {
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
            const body = options.body ? JSON.parse(options.body) : null;
            requests.push({ path, method, body });

            if (path === `/api/native/studio/projects/${projectId}`) return response(projectDetail());
            if (path === '/api/native/studio/resources/registry') {
                return response({
                    schemaVersion: 1,
                    graphMode: 'derived-readonly',
                    descriptors: [{
                        resourceType: 'plugin.quest',
                        displayName: 'Quest',
                        provider: { kind: 'plugin', pluginId: 'example.quest' },
                        authority: 'plugin-source',
                        capabilities: ['read', 'update'],
                        schema: { type: 'object' },
                        metadata: {},
                    }],
                });
            }
            if (path === '/api/native/studio/resources/graph') return response({ nodes: [], edges: [] });
            if (path === `/api/native/studio/resources?projectId=${projectId}`) return response([]);
            if (path === '/api/native/studio/library/resources') return response([]);
            if (path.startsWith('/api/native/studio/resources/references')) return response([]);
            if (path === `/api/native/studio/projects/${projectId}/history?limit=40`) return response([]);
            if (path === `/api/native/studio/projects/${projectId}/workspaces/inspect` && method === 'POST') {
                return response({
                    workspace: body,
                    changes: [{
                        operationId: body.operations[0].operationId,
                        kind: 'project-save',
                        resourceType: 'core.project',
                        resourceId: projectId,
                    }],
                });
            }
            if (path === `/api/native/studio/projects/${projectId}/workspaces/execute` && method === 'POST') {
                return response({
                    changeSet: {
                        changeSetId: 'changeset_111',
                        workspaceId: body.workspaceId,
                        projectId,
                        baseRevision: revision,
                        operations: body.operations,
                        validation: { status: 'passed', diagnostics: [] },
                        resultingRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    },
                    changes: [],
                });
            }
            throw new Error('Unexpected request ' + method + ' ' + path);
        });
    });

    test('relationship detach exposes consumers before review and navigates to the exact project owner', async () => {
        const previous = globalThis.fetch;
        const detail = projectDetail(); const worldId = 'world_' + 'b'.repeat(32), worldRevisionId = 'worldv_' + 'c'.repeat(32);
        detail.source.dependencies.worlds = [{ worldId, worldRevisionId }];
        detail.source.package.entryPoints[0].worldIds = [worldId];
        globalThis.fetch = jest.fn(async (url, options) => {
            if (url === `/api/native/studio/projects/${projectId}`) return response(detail);
            if (url === '/api/native/studio/library/resources') return response([{ resourceType: 'core.world', resourceId: worldId, displayName: 'Harbor', currentRevision: worldRevisionId, revisions: [worldRevisionId] }]);
            return previous(url, options);
        });
        const slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        [...slot.querySelectorAll('.atria-studio-resource-tree button')].find(node => node.textContent === 'Worlds').click(); await flush();
        [...slot.querySelectorAll('button')].find(node => node.textContent === 'Review detach').click(); await flush();
        const blockers = slot.querySelector('[data-atria-detach-blockers]'); expect(blockers.textContent).toContain('Start');
        expect(requests.some(item => item.path.endsWith('/workspaces/inspect'))).toBe(false);
        blockers.querySelector('button').click(); await flush();
        expect(slot.querySelector('[data-atria-studio-view="entrypoints"]')).not.toBeNull();
        controller.dispose();
    });

    test('internal navigation cancellation preserves fields and Source; reference tabs retain one draft', async () => {
        const slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        const field = slot.querySelector('[aria-label="Project display name"]'); field.focus(); field.value = 'Draft'; field.dispatchEvent(new Event('input', { bubbles: true }));
        const navigate = name => [...slot.querySelectorAll('.atria-studio-resource-tree button')].find(node => node.textContent === name).click();
        navigate('Worlds'); expect(slot.querySelector('[aria-label="Project display name"]')).toBe(field); expect(field.value).toBe('Draft');
        confirm.mockReturnValue(true); navigate('Worlds'); await flush();
        const source = slot.querySelector('.atri-studio-value-editor');
        [...source.querySelectorAll('button')].find(node => node.textContent === 'Source').click();
        const editor = source.querySelector('textarea'); editor.value = '[{"custom":true}]'; editor.dispatchEvent(new Event('input', { bubbles: true }));
        [...slot.querySelectorAll('button')].find(node => node.textContent === 'Library references').click();
        expect(editor.isConnected).toBe(true);
        [...slot.querySelectorAll('.atria-studio-center > nav button')].find(node => node.textContent === 'Editor').click();
        expect(editor.value).toBe('[{"custom":true}]');
        confirm.mockReturnValue(false); navigate('Overview'); expect(editor.isConnected).toBe(true); expect(editor.value).toBe('[{"custom":true}]');
        controller.dispose(); confirm.mockRestore();
    });

    test('committed human ChangeSet remains a receipt after refresh failure and cannot execute twice', async () => {
        const previous = globalThis.fetch; let committed = false, failRead = true;
        globalThis.fetch = jest.fn(async (url, options) => {
            if (url.endsWith('/workspaces/execute')) committed = true;
            if (committed && failRead && url === `/api/native/studio/projects/${projectId}`) return response({ message: 'Read unavailable' }, 503);
            return previous(url, options);
        });
        const slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        const click = name => [...slot.querySelectorAll('button')].find(node => node.textContent === name).click();
        click('Review Changes'); await flush(); click('Apply ChangeSet'); await flush();
        expect(slot.textContent).toContain('Saved, but the list could not refresh');
        expect(slot.querySelector('[data-atria-studio-editor]').inert).toBe(true);
        expect([...slot.querySelectorAll('button')].some(node => node.textContent === 'Apply ChangeSet')).toBe(false);
        failRead = false; click('Reload Latest'); await flush();
        expect(requests.filter(item => item.path.endsWith('/workspaces/execute'))).toHaveLength(1);
        expect(slot.querySelector('[data-atria-studio-editor]').inert).toBe(false);
        controller.dispose();
    });

    test('late Preview cannot replace an editor opened while its request was pending', async () => {
        const previous = globalThis.fetch; let finish;
        globalThis.fetch = jest.fn((url, options) => url.endsWith('/preview') ? new Promise(resolve => { finish = resolve; }) : previous(url, options));
        const slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        [...slot.querySelectorAll('.atria-studio-topbar button')].find(node => node.textContent === 'Preview').click(); await flush();
        [...slot.querySelectorAll('.atria-studio-resource-tree button')].find(node => node.textContent === 'EntryPoints').click();
        finish(response({ preview: { previewId: 'preview-test', experience: { mode: 'text' } } })); await flush();
        expect(slot.querySelector('[data-atria-studio-view="entrypoints"]')).not.toBeNull();
        controller.dispose();
    });

    test('Experience authoring creates a native@3 source graph in the reviewed Workspace', async () => {
        const previous = globalThis.fetch;
        globalThis.fetch = jest.fn(async (url, options) => url.endsWith('/sources') ? response([]) : previous(url, options));
        const slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        [...slot.querySelectorAll('.atria-studio-resource-tree button')].find(node => node.textContent === 'Experience').click(); await flush();
        slot.querySelector('[aria-label="Experience mode"]').value = 'full';
        [...slot.querySelectorAll('button')].find(node => node.textContent === 'Review Changes').click(); await flush();
        const inspected = requests.find(item => item.path.endsWith('/workspaces/inspect'));
        expect(inspected.body.operations).toHaveLength(3);
        const experience = inspected.body.operations[0].input.source.package.entryPoints[0].runtime.experience;
        expect(experience.frontend).toEqual({ kind: 'native', version: 3, source: 'frontend/index.json' });
        expect(experience.componentModelVersion).toBeUndefined();
        expect(inspected.body.operations[2].input.content).toContain('node-id="title"');
        expect(requests.some(item => item.path.endsWith('/workspaces/execute'))).toBe(false);
        controller.dispose();
    });

    afterEach(() => {
        delete globalThis.Atria;
        delete globalThis.fetch;
    });

    test('human edits enter inspect/review before execute and never bypass the A1 Workspace boundary', async () => {
        const slot = document.getElementById('slot');
        const controller = mountNativeStudioWorkspace({
            document,
            slot,
            route: { domain: 'build', child: { id: 'project:' + projectId, kind: 'detail' } },
            host: { openBuild: jest.fn() },
        });
        await flush();

        expect(slot.querySelector('[data-atria-studio-workspace]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-studio-plugin-resource="plugin.quest"]')).not.toBeNull();
        expect([...slot.querySelectorAll('[data-atria-studio-mobile-nav] button')].map(node => node.textContent))
            .toEqual(['Project', 'Editor', 'Preview', 'AI', 'More']);

        const name = slot.querySelector('[aria-label="Project display name"]');
        name.value = 'Changed Project';
        [...slot.querySelectorAll('[data-atria-studio-view="overview"] button')]
            .find(node => node.textContent === 'Review Changes').click();
        await flush();

        const inspected = requests.find(item => item.path.endsWith('/workspaces/inspect'));
        expect(inspected.body.baseRevision).toBe(revision);
        expect(inspected.body.origin).toEqual({ kind: 'human', id: 'atria.studio' });
        expect(inspected.body.operations).toHaveLength(1);
        expect(inspected.body.operations[0]).toEqual(expect.objectContaining({
            operationType: 'project.save',
            target: { resourceType: 'core.project', resourceId: projectId },
            origin: { kind: 'human', id: 'atria.studio' },
        }));
        expect(inspected.body.operations[0].input.source.project.displayName).toBe('Changed Project');

        const apply = [...slot.querySelectorAll('[data-atria-studio-activity-tab="changes"] button')]
            .find(node => node.textContent === 'Apply ChangeSet');
        expect(apply).toBeTruthy();
        apply.click();
        await flush();

        const executed = requests.find(item => item.path.endsWith('/workspaces/execute'));
        expect(executed.body.workspaceId).toBe(inspected.body.workspaceId);
        expect(executed.body.baseRevision).toBe(revision);

        [...slot.querySelectorAll('.atria-studio-activity-tabs button')]
            .find(node => node.textContent === 'Output').click();
        expect(slot.textContent).toContain('ChangeSet changeset_111 committed');

        controller.dispose();
    });
    test('an unavailable supporting inventory preserves the project editor and retry keeps its draft', async () => {
        const fetch = globalThis.fetch; let unavailable = true;
        globalThis.fetch = jest.fn(async (url, options) => String(url).endsWith('/resources/registry') && unavailable ? response({ message: 'Registry unavailable' }, 503) : fetch(url, options));
        const slot = document.getElementById('slot'); const view = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        const name = slot.querySelector('[aria-label="Project display name"]'); expect(name).not.toBeNull();
        name.value = 'Unsaved title'; name.dispatchEvent(new Event('input', { bubbles: true }));
        expect(slot.textContent).toContain('Some project resources could not load');
        unavailable = false; [...slot.querySelectorAll('button')].find(node => node.textContent === 'Retry loading').click(); await flush();
        expect(slot.querySelector('[aria-label="Project display name"]')).toBe(name); expect(name.value).toBe('Unsaved title');
        expect(slot.textContent).not.toContain('Some project resources could not load'); view.dispose();
    });

});
