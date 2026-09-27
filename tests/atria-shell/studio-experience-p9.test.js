/** @jest-environment jsdom */
import { describe, test, expect, jest } from '@jest/globals';
import { mountStructuredUiEditor } from '../../public/scripts/native/studio-ui-editor.js';
import { mountStudioPreviewUi } from '../../public/scripts/native/studio-preview-ui.js';
import { previewStudioUiMigration } from '../../public/scripts/native/studio-ui-migration.js';
import { mountExperienceHealth } from '../../public/scripts/native/experience-health-ui.js';
import { presentationNegotiation } from '../../public/scripts/native/host-capabilities.js';
import { mountSharedSessionPanel } from '../../public/scripts/native/shared-session-ui.js';

const fixture = () => ({ schemaVersion: 2, stateVersion: 1, localState: { name: { type: 'string', default: '', required: true } },
    actions: { local: { steps: [{ op: 'ui.set', path: 'ui.name', value: 'Atria' }] } },
    views: [{ id: 'main', surface: 'chat.footer', mount: 'always', root: { id: 'root', type: 'container', children: [
        { id: 'name', type: 'input', model: 'ui.name', props: { label: 'Name' } },
        { id: 'label', type: 'text', props: { text: 'Welcome' } },
        { id: 'button', type: 'button', props: { text: 'Fill' }, events: { click: 'local' } },
    ] } }] });
const click = (root, label) => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { document.body.replaceChildren(); });

describe('P9 authoring and product surfaces', () => {
    test('v2 visual editing preserves document state, actions and form models and stages through the existing callback', () => {
        const root = document.createElement('div'); document.body.append(root); const onStage = jest.fn();
        const editor = mountStructuredUiEditor({ document, root, initialModel: fixture(), mode: 'component', onStage });
        editor.select('label'); const text = root.querySelector('[aria-label="Component text"]'); text.value = 'Changed'; text.dispatchEvent(new Event('input'));
        expect([...root.querySelectorAll('button')].find(node => node.textContent === 'Stage UI Change').disabled).toBe(true);
        click(root, 'Apply Properties'); click(root, 'Stage UI Change');
        expect(onStage.mock.calls[0][0].views[0].root.children[1].props.text).toBe('Changed');
        expect(onStage.mock.calls[0][0].actions).toEqual(fixture().actions);
        expect(onStage.mock.calls[0][0].views[0].root.children[0].model).toBe('ui.name');
        editor.dispose(); expect(root.childNodes).toHaveLength(0);
    });
    test('document drafts survive tab changes; source validation rejects a second authority write', async () => {
        const root = document.createElement('div'); const onStage = jest.fn();
        const editor = mountStructuredUiEditor({ document, root, initialModel: fixture(), mode: 'component', onStage });
        click(root, 'Document'); const actions = root.querySelector('[aria-label="actions"]'); actions.value = '{"draft":null}'; actions.dispatchEvent(new Event('input'));
        click(root, 'Structure'); click(root, 'Document'); expect(root.querySelector('[aria-label="actions"]').value).toBe('{"draft":null}');
        click(root, 'Source'); const source = root.querySelector('textarea'); const invalid = fixture(); invalid.actions.local.steps = [{ op: 'shared.open', args: {} }, { op: 'realm.command', args: {} }];
        source.value = JSON.stringify(invalid); click(root, 'Apply Source'); await flush();
        expect(root.querySelector('[role="alert"]').textContent).toContain('one typed Command');
        click(root, 'Stage UI Change'); expect(onStage).not.toHaveBeenCalled(); editor.dispose();
    });
    test.each(['component', 'hybrid', 'full'])('author preview uses production v2 local interaction in %s layout', async mode => {
        const model = fixture(); if (mode !== 'component') model.views[0].surface = 'app.root';
        const root = document.createElement('div'); const mounted = mountStudioPreviewUi(document, root, model, mode);
        click(root, 'Fill'); await flush(); expect(root.querySelector('input').value).toBe('Atria');
        mounted.dispose(); expect(root.childNodes).toHaveLength(0);
    });
    test('author preview never reparents live private Native slots and Scene placeholders remain editable', () => {
        const privateRoot = document.createElement('div'); const conversation = document.createElement('div'); conversation.dataset.atriaNativeProductComponent = 'conversation'; conversation.textContent = 'private transcript'; privateRoot.append(conversation); document.body.append(privateRoot);
        const root = document.createElement('div'); const model = fixture(); model.views[0].surface = 'app.root';
        model.views[0].root.children.push({ id: 'native', type: 'native-slot', props: { component: 'conversation' } }, { id: 'scene', type: 'scene', props: { sceneId: 'scene' } });
        const mounted = mountStudioPreviewUi(document, root, model, 'full');
        expect(conversation.parentElement).toBe(privateRoot); expect(root.textContent).not.toContain('private transcript'); expect(root.textContent).toContain('Scene playback requires');
        mounted.dispose(); expect(conversation.parentElement).toBe(privateRoot);
    });
    test('explicit static migration preserves nodes and rejects implicit dynamic/appearance conversion', () => {
        const old = { id: 'root', type: 'container', children: [{ id: 'text', type: 'text', props: { text: 'Hello' } }] };
        const experience = { mode: 'component', componentModelVersion: 1, component: 'ui.json', surface: 'chat.footer' };
        const plan = previewStudioUiMigration(old, experience);
        expect(plan.model.views[0].root).toEqual(old); expect(plan.experience.componentModelVersion).toBe(2); expect(experience.componentModelVersion).toBe(1);
        old.children[0].bindings = { text: 'world.hp' }; expect(() => previewStudioUiMigration(old, experience)).toThrow(/explicit author migration/);
    });
    test('capability negotiation describes required blocks and optional degradation without changing mode', () => {
        expect(presentationNegotiation({ host: [{ id: 'speech', required: false }, { id: 'fullscreen', required: true }] }, document, {})).toMatchObject([
            { status: 'degraded' }, { status: 'blocked' },
        ]);
    });
    test('Health never repairs on read; explicit preview and confirmation use the exact token', async () => {
        const root = document.createElement('div'); const runtime = { snapshot: { session: { sessionId: 's' }, manifest: {} }, open: jest.fn() };
        const report = { anchor: { revisionId: 'r' }, capabilities: [], diagnostics: [], repairKinds: ['retention.compact'], status: 'healthy' };
        const plan = { request: { kind: 'retention.compact', expectedRevisionId: 'r' }, token: 'exact', changes: { before: 1, after: 0 } };
        const request = jest.fn(async path => path === 'health/preview' ? plan : report);
        const controller = mountExperienceHealth({ document, root, runtime, request, invocationId: () => 'test-repair' }); await flush();
        expect(request.mock.calls.map(call => call[0])).toEqual(['health']);
        click(root, 'Preview retention repair'); await flush(); expect(root.textContent).toContain('Proposed changes');
        click(root, 'Confirm repair'); await flush();
        expect(request).toHaveBeenCalledWith('health/apply', expect.objectContaining({ repair: expect.objectContaining({ token: 'exact', confirmed: true }) }), expect.anything());
        controller.dispose();
    });
    test('disposed Health reads cannot render into a newer panel', async () => {
        const root = document.createElement('div'); let finish;
        const request = () => new Promise(resolve => { finish = resolve; });
        const controller = mountExperienceHealth({ document, root, runtime: { snapshot: { session: { sessionId: 's' } } }, request });
        controller.dispose(); root.textContent = 'next'; finish({}); await flush(); expect(root.textContent).toBe('next');
    });
    test('Shared connection forwards no private local runtime and disposes a late remote mount', async () => {
        const root = document.createElement('div'); let finish; const dispose = jest.fn();
        const mount = jest.fn(() => new Promise(resolve => { finish = resolve; }));
        const controller = mountSharedSessionPanel({ document, root, runtime: { snapshot: { session: { sessionId: 'private' }, states: { secret: 'private' } } }, mount });
        click(root, 'Connect'); expect(mount.mock.calls[0][0]).not.toHaveProperty('runtime'); expect(mount.mock.calls[0][0]).not.toHaveProperty('states');
        controller.dispose(); finish({ dispose }); await flush(); expect(dispose).toHaveBeenCalled();
    });
});
