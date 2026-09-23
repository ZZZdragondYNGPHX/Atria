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
        expect(slot.textContent).toContain('ChangeSet changeset_111 committed');

        controller.dispose();
    });
});
