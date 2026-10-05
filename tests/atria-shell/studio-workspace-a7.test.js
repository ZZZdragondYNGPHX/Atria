/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';

import { mountNativeStudioWorkspace } from '../../public/scripts/native/studio-workspace.js';
globalThis.structuredClone = value => deserialize(serialize(value));

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

    function actorsFixture() {
        const detail = projectDetail();
        detail.source.package.actors = ['a', 'b'].map(letter => ({ actorId: 'actor_' + letter.repeat(32), displayName: 'Same name', profile: { description: 'Original ' + letter, plugin: { nested: [null, true, 4] } }, metadata: { opaque: false } }));
        detail.source.package.entryPoints[0].actorIds = [detail.source.package.actors[0].actorId];
        const previous = globalThis.fetch;
        globalThis.fetch = jest.fn((url, options) => url === `/api/native/studio/projects/${projectId}` ? Promise.resolve(response(detail)) : previous(url, options));
        return detail;
    }
    const click = (root, label) => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
    const fill = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };

    test('Actors exact identity, Source and view cancellation keep one draft; Review Cancel retains advanced data', async () => {
        const detail = actorsFixture(), slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'Actors'); await flush();
        const center = slot.querySelector('.atria-studio-center'), chooser = center.querySelector('[aria-label="Actors resource"]');
        const input = center.querySelector('[name="displayName"]'); fill(input, 'Draft A');
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        chooser.value = detail.source.package.actors[1].actorId; chooser.dispatchEvent(new Event('change', { bubbles: true }));
        expect(chooser.value).toBe(detail.source.package.actors[0].actorId); expect(center.querySelector('[name="displayName"]')).toBe(input);
        click(center, 'Source'); const source = center.querySelector('[aria-label="Actors resource JSON"]');
        const draft = JSON.parse(source.value); expect(draft.displayName).toBe('Draft A'); expect(draft.profile.plugin).toEqual({ nested: [null, true, 4] });
        click(center, 'Collection Source'); expect(source.isConnected).toBe(true);
        click(slot.querySelector('.atria-studio-resource-tree'), 'Actors'); expect(source.isConnected).toBe(true);
        click(center, 'Review Changes'); await flush();
        const inspected = requests.find(item => item.path.endsWith('/workspaces/inspect')).body;
        expect(inspected.baseRevision).toBe(revision); expect(inspected.origin.kind).toBe('human');
        expect(inspected.operations[0].operationType).toBe('project.save'); expect(inspected.operations[0].input.source.package.actors[0]).toEqual(draft);
        click(slot.querySelector('.atria-studio-activity'), 'Cancel'); await flush();
        expect(source.value).toBe(JSON.stringify(draft, null, 2)); expect(requests.some(item => item.path.endsWith('/workspaces/execute'))).toBe(false);
        confirm.mockReturnValue(true); chooser.value = detail.source.package.actors[1].actorId; chooser.dispatchEvent(new Event('change', { bubbles: true }));
        expect(center.querySelector('[name="profile.description"]').value).toBe('Original b');
        controller.dispose();
    });

    test('Actors conflict exposes exact malformed Source for copy and requires explicit discard before reload', async () => {
        const detail = actorsFixture(), previous = globalThis.fetch;
        globalThis.fetch = jest.fn((url, options) => String(url).endsWith('/workspaces/execute') ? Promise.resolve(response({ message: 'Stale revision' }, 409)) : previous(url, options));
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'Actors'); await flush();
        const center = slot.querySelector('.atria-studio-center'), activity = slot.querySelector('.atria-studio-activity');
        fill(center.querySelector('[name="displayName"]'), 'Conflict draft'); click(center, 'Review Changes'); await flush();
        click(activity, 'Apply ChangeSet'); await flush();
        click(center, 'Source'); const source = center.querySelector('[aria-label="Actors resource JSON"]'); fill(source, '{ malformed after review');
        click(activity, 'Copy Actors draft'); await flush();
        expect(activity.querySelector('[data-atria-actors-draft-copy]').value).toBe(source.value);
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false); click(activity, 'Reload Latest'); await flush();
        expect(source.isConnected).toBe(true); expect(source.value).toBe('{ malformed after review');
        detail.source.package.actors.reverse(); confirm.mockReturnValue(true); click(activity, 'Reload Latest'); await flush();
        expect(center.querySelector('[aria-label="Actors resource"]').value).toBe('actor_' + 'a'.repeat(32));
        expect(center.querySelector('[name="displayName"]').value).toBe('Same name'); controller.dispose();
    });

    test('Actors collection save receipt blocks edits after read failure and reload never replays execute', async () => {
        const detail = actorsFixture(), previous = globalThis.fetch; let committed = false, failRead = true, writes = 0;
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            if (String(url).endsWith('/workspaces/execute')) {
                writes++; const body = JSON.parse(options.body); detail.source = body.operations[0].input.source;
                detail.revision.revision = 'b'.repeat(40); committed = true; return previous(url, options);
            }
            if (url === `/api/native/studio/projects/${projectId}` && committed && failRead) return response({ message: 'Read unavailable' }, 503);
            return previous(url, options);
        });
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'Actors'); await flush();
        const center = slot.querySelector('.atria-studio-center'), activity = slot.querySelector('.atria-studio-activity');
        const chooser = center.querySelector('[aria-label="Actors resource"]'); chooser.value = 'actor_' + 'b'.repeat(32); chooser.dispatchEvent(new Event('change', { bubbles: true }));
        click(center, 'Collection Source'); fill(center.querySelector('textarea'), JSON.stringify([...detail.source.package.actors].reverse()));
        click(center, 'Review Changes'); await flush(); click(activity, 'Apply ChangeSet'); await flush();
        expect(center.inert).toBe(true); expect(activity.textContent).toContain('Saved, but'); expect(writes).toBe(1);
        failRead = false; click(activity, 'Reload Latest'); await flush(); expect(writes).toBe(1);
        click(center, 'Actor fields'); expect(center.querySelector('[aria-label="Actors resource"]').value).toBe('actor_' + 'b'.repeat(32));
        expect(center.querySelector('[name="profile.description"]').value).toBe('Original b'); controller.dispose();
    });

    function entryPointsFixture() {
        const detail = projectDetail();
        detail.source.package.entryPoints = ['a', 'b'].map(letter => ({ entryPointId: 'entry_' + letter.repeat(32), displayName: 'Same name', actorIds: [], worldIds: [], knowledgeBindingIds: [], initialStateOverlay: { description: 'Original ' + letter }, runtime: { plugin: { nested: [null, true, 4] } } }));
        const previous = globalThis.fetch;
        globalThis.fetch = jest.fn((url, options) => url === `/api/native/studio/projects/${projectId}` ? Promise.resolve(response(detail)) : previous(url, options));
        return detail;
    }

    test('EntryPoints exact identity, Source and view cancellation keep one draft; Review Cancel retains advanced data', async () => {
        const detail = entryPointsFixture(), slot = document.querySelector('#slot');
        const controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'EntryPoints'); await flush();
        const center = slot.querySelector('.atria-studio-center'), chooser = center.querySelector('[aria-label="EntryPoints resource"]');
        const input = center.querySelector('[name="displayName"]'); fill(input, 'Draft A');
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        chooser.value = detail.source.package.entryPoints[1].entryPointId; chooser.dispatchEvent(new Event('change', { bubbles: true }));
        expect(chooser.value).toBe(detail.source.package.entryPoints[0].entryPointId); expect(center.querySelector('[name="displayName"]')).toBe(input);
        click(center, 'Source'); const source = center.querySelector('[aria-label="EntryPoints resource JSON"]');
        const draft = JSON.parse(source.value); expect(draft.displayName).toBe('Draft A'); expect(draft.runtime.plugin).toEqual({ nested: [null, true, 4] });
        click(center, 'Collection Source'); expect(source.isConnected).toBe(true);
        click(slot.querySelector('.atria-studio-resource-tree'), 'Actors'); expect(source.isConnected).toBe(true);
        click(center, 'Review Changes'); await flush();
        const inspected = requests.find(item => item.path.endsWith('/workspaces/inspect')).body;
        expect(inspected.baseRevision).toBe(revision); expect(inspected.origin.kind).toBe('human');
        expect(inspected.operations[0].operationType).toBe('project.save'); expect(inspected.operations[0].input.source.package.entryPoints[0]).toEqual(draft);
        click(slot.querySelector('.atria-studio-activity'), 'Cancel'); await flush();
        expect(source.value).toBe(JSON.stringify(draft, null, 2)); expect(requests.some(item => item.path.endsWith('/workspaces/execute'))).toBe(false);
        confirm.mockReturnValue(true); chooser.value = detail.source.package.entryPoints[1].entryPointId; chooser.dispatchEvent(new Event('change', { bubbles: true }));
        expect(center.querySelector('[name="initialStateOverlay.description"]').value).toBe('Original b');
        controller.dispose();
    });

    test('EntryPoints conflict exposes exact malformed Source for copy and requires explicit discard before reload', async () => {
        const detail = entryPointsFixture(), previous = globalThis.fetch;
        globalThis.fetch = jest.fn((url, options) => String(url).endsWith('/workspaces/execute') ? Promise.resolve(response({ message: 'Stale revision' }, 409)) : previous(url, options));
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'EntryPoints'); await flush();
        const center = slot.querySelector('.atria-studio-center'), activity = slot.querySelector('.atria-studio-activity');
        fill(center.querySelector('[name="displayName"]'), 'Conflict draft'); click(center, 'Review Changes'); await flush();
        click(activity, 'Apply ChangeSet'); await flush();
        click(center, 'Source'); const source = center.querySelector('[aria-label="EntryPoints resource JSON"]'); fill(source, '{ malformed after review');
        click(activity, 'Copy EntryPoints draft'); await flush();
        expect(activity.querySelector('[data-atria-entry-points-draft-copy]').value).toBe(source.value);
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false); click(activity, 'Reload Latest'); await flush();
        expect(source.isConnected).toBe(true); expect(source.value).toBe('{ malformed after review');
        detail.source.package.entryPoints.reverse(); confirm.mockReturnValue(true); click(activity, 'Reload Latest'); await flush();
        expect(center.querySelector('[aria-label="EntryPoints resource"]').value).toBe('entry_' + 'a'.repeat(32));
        expect(center.querySelector('[name="displayName"]').value).toBe('Same name'); controller.dispose();
    });

    test('EntryPoints collection save receipt blocks edits after read failure and reload never replays execute', async () => {
        const detail = entryPointsFixture(), previous = globalThis.fetch; let committed = false, failRead = true, writes = 0;
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            if (String(url).endsWith('/workspaces/execute')) {
                writes++; const body = JSON.parse(options.body); detail.source = body.operations[0].input.source;
                detail.revision.revision = 'b'.repeat(40); committed = true; return previous(url, options);
            }
            if (url === `/api/native/studio/projects/${projectId}` && committed && failRead) return response({ message: 'Read unavailable' }, 503);
            return previous(url, options);
        });
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'EntryPoints'); await flush();
        const center = slot.querySelector('.atria-studio-center'), activity = slot.querySelector('.atria-studio-activity');
        const chooser = center.querySelector('[aria-label="EntryPoints resource"]'); chooser.value = 'entry_' + 'b'.repeat(32); chooser.dispatchEvent(new Event('change', { bubbles: true }));
        click(center, 'Collection Source'); fill(center.querySelector('textarea'), JSON.stringify([...detail.source.package.entryPoints].reverse()));
        click(center, 'Review Changes'); await flush(); click(activity, 'Apply ChangeSet'); await flush();
        expect(center.inert).toBe(true); expect(activity.textContent).toContain('Saved, but'); expect(writes).toBe(1);
        failRead = false; click(activity, 'Reload Latest'); await flush(); expect(writes).toBe(1);
        click(center, 'EntryPoint fields'); expect(center.querySelector('[aria-label="EntryPoints resource"]').value).toBe('entry_' + 'b'.repeat(32));
        expect(center.querySelector('[name="initialStateOverlay.description"]').value).toBe('Original b'); controller.dispose();
    });

    test.each(['empty', 'duplicate'])('EntryPoints %s source routes to repair and never guesses a single-entry patch', async mode => {
        const detail = entryPointsFixture(), entries = detail.source.package.entryPoints;
        detail.source.package.entryPoints = mode === 'empty' ? [] : [entries[0], entries[0]];
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'EntryPoints'); await flush();
        const center = slot.querySelector('.atria-studio-center'); expect(center.querySelector('[aria-label="EntryPoints resource"]')).toBeNull();
        const source = center.querySelector('[aria-label="EntryPoints collection JSON"]'); expect(source).not.toBeNull();
        click(center, 'Review Changes'); await flush(); expect(requests.some(item => item.path.endsWith('/workspaces/inspect'))).toBe(false);
        fill(source, JSON.stringify([entries[0]])); click(center, 'Review Changes'); await flush();
        expect(requests.find(item => item.path.endsWith('/workspaces/inspect')).body.operations[0].input.source.package.entryPoints).toEqual([entries[0]]);
        controller.dispose();
    });

    test('EntryPoints explicit ID save restores that identity, preserves source neighbors and exposes the project graph boundary', async () => {
        const detail = entryPointsFixture(), previous = globalThis.fetch;
        globalThis.fetch = jest.fn(async (url, options) => {
            if (String(url).endsWith('/workspaces/execute')) detail.source = JSON.parse(options.body).operations[0].input.source;
            return previous(url, options);
        });
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'EntryPoints'); await flush();
        const center = slot.querySelector('.atria-studio-center'), original = JSON.parse(JSON.stringify(detail.source));
        const chooser = center.querySelector('[aria-label="EntryPoints resource"]'); chooser.value = original.package.entryPoints[1].entryPointId; chooser.dispatchEvent(new Event('change', { bubbles: true }));
        const id = 'entry_' + 'c'.repeat(32); fill(center.querySelector('[name="entryPointId"]'), id); click(center, 'Review Changes'); await flush();
        click(slot.querySelector('.atria-studio-activity'), 'Apply ChangeSet'); await flush();
        expect(center.querySelector('[aria-label="EntryPoints resource"]').value).toBe(id);
        expect(slot.querySelector('[data-atria-studio-entry-point-id][data-active="true"]').dataset.atriaStudioEntryPointId).toBe(id);
        expect(detail.source).toEqual({ ...original, package: { ...original.package, entryPoints: [original.package.entryPoints[0], { ...original.package.entryPoints[1], entryPointId: id }] } });
        expect(slot.querySelector('.atria-studio-inspector').textContent).toContain('no independent EntryPoint resource');
        controller.dispose();
    });

    function worldsFixture() {
        const detail = projectDetail();
        detail.source.worlds = ['a', 'b'].map(letter => ({ world: { worldId: 'world_' + letter.repeat(32), displayName: 'Same name', currentRevisionId: 'worldv_' + letter.repeat(32) }, revision: { worldId: 'world_' + letter.repeat(32), worldRevisionId: 'worldv_' + letter.repeat(32), metadata: { opaque: [null, false, 3] } } }));
        detail.source.package.entryPoints[0].worldIds = [detail.source.worlds[0].world.worldId];
        const previous = globalThis.fetch;
        globalThis.fetch = jest.fn((url, options) => url === `/api/native/studio/projects/${projectId}` ? Promise.resolve(response(detail)) : previous(url, options));
        return detail;
    }
    test('Worlds exact choice, collection reorder and explicit ID save preserve one project draft and selection', async () => {
        const detail = worldsFixture(), previous = globalThis.fetch;
        globalThis.fetch = jest.fn(async (url, options) => {
            if (String(url).endsWith('/workspaces/execute')) detail.source = JSON.parse(options.body).operations[0].input.source;
            return previous(url, options);
        });
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'Worlds'); await flush();
        const center = slot.querySelector('.atria-studio-center');
        const chooser = center.querySelector('[aria-label="Worlds resource"]'); chooser.value = detail.source.worlds[1].world.worldId; chooser.dispatchEvent(new Event('change')); await flush();
        fill(center.querySelector('[aria-label="World name"]'), 'Changed');
        click(center, 'Source'); const editor = center.querySelector('textarea'), draft = JSON.parse(editor.value); draft.world.worldId = draft.revision.worldId = 'world_' + 'c'.repeat(32); fill(editor, JSON.stringify(draft));
        click(center, 'Review Changes'); await flush(); click(slot.querySelector('.atria-studio-activity'), 'Cancel'); await flush(); expect(editor.value).toBe(JSON.stringify(draft));
        click(center, 'Review Changes'); await flush(); click(slot.querySelector('.atria-studio-activity'), 'Apply ChangeSet'); await flush();
        expect(center.querySelector('[aria-label="Worlds resource"]').value).toBe(draft.world.worldId);
        expect(detail.source.worlds[0].world.displayName).toBe('Same name');
        click(center, 'Collection Source'); fill(center.querySelector('textarea'), JSON.stringify([...detail.source.worlds].reverse()));
        click(center, 'Review Changes'); await flush(); click(slot.querySelector('.atria-studio-activity'), 'Apply ChangeSet'); await flush(); click(center, 'World fields'); await flush();
        expect(center.querySelector('[aria-label="Worlds resource"]').value).toBe(draft.world.worldId);
        expect(slot.querySelector('[data-atria-studio-world-id][data-active="true"]').dataset.atriaStudioWorldId).toBe(draft.world.worldId);
        controller.dispose();
    });
    test('Worlds 409 copies malformed Source and requires explicit discard', async () => {
        worldsFixture(); const previous = globalThis.fetch;
        globalThis.fetch = jest.fn((url, options) => String(url).endsWith('/workspaces/execute') ? Promise.resolve(response({ message: 'Stale' }, 409)) : previous(url, options));
        const slot = document.querySelector('#slot'), controller = mountNativeStudioWorkspace({ document, slot, route: { child: { id: 'project:' + projectId } }, host: {} }); await flush();
        click(slot.querySelector('.atria-studio-resource-tree'), 'Worlds'); await flush(); const center = slot.querySelector('.atria-studio-center'), activity = slot.querySelector('.atria-studio-activity');
        fill(center.querySelector('[aria-label="World name"]'), 'Unsaved'); click(center, 'Review Changes'); await flush(); click(activity, 'Apply ChangeSet'); await flush();
        click(center, 'Source'); fill(center.querySelector('textarea'), '{ malformed'); click(activity, 'Copy Worlds draft'); await flush();
        expect(activity.querySelector('[data-atria-worlds-draft-copy]').value).toBe('{ malformed');
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false); click(activity, 'Reload Latest'); await flush(); expect(center.querySelector('textarea').value).toBe('{ malformed');
        confirm.mockReturnValue(true); click(activity, 'Reload Latest'); await flush(); expect(center.querySelector('[aria-label="World name"]').value).toBe('Same name');
        controller.dispose(); confirm.mockRestore();
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
