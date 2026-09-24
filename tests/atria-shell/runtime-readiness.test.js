/** @jest-environment jsdom */
import { expect, test, jest } from '@jest/globals';
import { runtimeReadiness } from '../../public/scripts/native/runtime-readiness.js';
import { mountNativeRuntimeWorkspace } from '../../public/scripts/native/runtime-workspace.js';

const ref = (resourceType, resourceId) => ({ scope: 'library', resourceType, resourceId, revision: 'r1' });
const prompt = ref('core.prompt-program', 'prompt'); const generation = ref('core.generation-profile', 'generation');
const connection = { connectionProfileId: 'conn', secretRef: { secretId: 'secret' } };
const model = { modelProfileId: 'model', connectionProfileRef: { connectionProfileId: 'conn' } };
const route = { runtimeRouteId: 'route', modelProfileRef: { modelProfileId: 'model' }, connectionProfileRef: model.connectionProfileRef, promptProgramRef: prompt, generationProfileRef: generation };
const next = (config, secrets, resources) => runtimeReadiness(config, secrets, resources).find(step => !step.ready)?.label;

test('setup follows the dependency chain and checks references rather than counts', () => {
    const config = { connections: [], models: [], routes: [] }; const secrets = []; const resources = [];
    expect(next(config, secrets, resources)).toBe('Secret');
    secrets.push({ secretId: 'secret' }); expect(next(config, secrets, resources)).toBe('Connection');
    config.connections.push(connection); expect(next(config, secrets, resources)).toBe('Model');
    config.models.push({ ...model, connectionProfileRef: { connectionProfileId: 'missing' } });
    expect(next(config, secrets, resources)).toBe('Model');
    config.models.push(model); expect(next(config, secrets, resources)).toBe('Prompt Program');
    resources.push({ ref: prompt }); expect(next(config, secrets, resources)).toBe('Generation Profile');
    resources.push({ ref: generation }); expect(next(config, secrets, resources)).toBe('Runtime Route');
    config.routes.push({ ...route, promptProgramRef: { ...prompt, revision: 'wrong' } });
    expect(next(config, secrets, resources)).toBe('Runtime Route');
    config.routes.push(route); expect(next(config, secrets, resources)).toBeUndefined();
    secrets.length = 0; expect(next(config, secrets, resources)).toBe('Secret');
});

test('archived originals remain available to pinned routes but are not new setup choices', () => {
    const config = { connections: [connection], models: [model], routes: [] };
    const resources = [{ ref: prompt, archived: true }, { ref: generation, archived: true }];
    expect(next(config, [{ secretId: 'secret' }], resources)).toBe('Prompt Program');
    config.routes.push(route);
    expect(next(config, [{ secretId: 'secret' }], resources)).toBeUndefined();
});

test('setup refresh recovers from inventory failure and opens the canonical missing resource owner', async () => {
    let failed = true;
    const config = { connections: [connection], models: [model], routes: [], resources: [] };
    globalThis.fetch = jest.fn(async url => ({ ok: !(url.endsWith('/resources') && failed), json: async () => url.endsWith('/configuration') ? config : url.endsWith('/secrets') ? [{ secretId: 'secret' }] : [] }));
    const body = document.createElement('div'); document.body.append(body);
    const host = { openLibrarySection: jest.fn() };
    const view = mountNativeRuntimeWorkspace({ document, body, section: 'routes', host });
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
        // Routes first loads the shared catalog; retry this initial failure.
        await flush(); failed = false;
        [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Retry loading').click(); await flush();
        [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Set up Prompt Program').click();
        expect(host.openLibrarySection).toHaveBeenCalledWith('prompt-programs');
        failed = true;
        [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Check setup again').click(); await flush();
        expect(view.root.textContent).toContain('Could not check Runtime setup');
        failed = false;
        [...view.root.querySelectorAll('button')].find(button => button.textContent === 'Check setup again').click(); await flush();
        expect(view.root.textContent).toContain('Set up Prompt Program');
    } finally { view.dispose(); delete globalThis.fetch; document.body.replaceChildren(); }
});
