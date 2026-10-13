import { bridgeFixture } from './frontend-bridge-fixture.js';
import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { A2UI_VERSION, A2UI_CATALOG } from '../../../src/native/frontend/a2ui-adapter.js';

export function a2uiMessages() {
    return [
        { version: A2UI_VERSION, createSurface: { surfaceId: 'notes', catalogId: A2UI_CATALOG } },
        { version: A2UI_VERSION, updateDataModel: { surfaceId: 'notes', value: { title: '公开任务卡', note: '已由界面确认', label: '确认公开备注' } } },
        { version: A2UI_VERSION, updateComponents: { surfaceId: 'notes', components: [
            { id: 'root', component: 'Column', children: ['title', 'body', 'confirm'] },
            { id: 'title', component: 'Text', text: { path: '/title' }, variant: 'h2' },
            { id: 'body', component: 'Text', text: '只使用本卡片的公开内容；确认后，下方备注会更新。' },
            { id: 'confirm', component: 'Button', child: 'label', action: { event: { name: 'confirm', context: { label: { path: '/note' } } } } },
            { id: 'label', component: 'Text', text: { path: '/label' } },
        ] } },
    ];
}

export function a2uiFixture({ interactive = true, deleted = false, streaming = false, mutate = () => {} } = {}) {
    const f = bridgeFixture();
    const messages = a2uiMessages();
    if (deleted) messages.push({ version: A2UI_VERSION, deleteSurface: { surfaceId: 'notes' } });
    mutate(messages);
    const files = new Map([...f.files].filter(([path]) => !path.startsWith('runtime/')));
    const index = JSON.parse(files.get('frontend.json'));
    index.components = [{ id: 'Main', source: 'Main.aui' }, { id: 'External', source: 'External.a2ui.json',
        a2ui: { actions: { confirm: 'save' }, interactive, ...(streaming ? { stream: true } : {}), fallbackText: '这张任务卡已关闭，请继续使用原文字界面。',
            feedback: { pending: '正在确认…', failed: '确认未完成，请刷新后重试。' } } }];
    index.styles = [{ id: 'publicCard', source: 'public-card.css' }];
    files.set('frontend.json', Buffer.from(JSON.stringify(index)));
    files.set('External.a2ui.json', Buffer.from(JSON.stringify(messages)));
    files.set('public-card.css', Buffer.from('main { padding: 24px; max-width: 640px; margin: auto; font: 16px/1.6 system-ui; overflow-wrap: anywhere; } button { min-height: 44px; padding: 8px 16px; font: inherit; } button:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }'));
    files.set('Main.aui', Buffer.from('<template><main node-id="main"><component node-id="external" ref="External" /><h3 node-id="heading">当前公开备注</h3><output node-id="notes" read="notes" hidden="true" /><div node-id="notesList" each="bridge.notes.data" item-key="id"><p node-id="note" bind:text="item.value.text" /></div></main></template>'));
    const compiled = compileFrontend({ source: 'frontend.json', files, mode: 'full', experienceContract: f.contract });
    f.manifest.runtime.experience.frontend.entry = compiled.entry;
    return { ...f, files: new Map([...files, ...compiled.files]), sourceFiles: files, compiled, messages };
}
