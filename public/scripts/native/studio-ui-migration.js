import { compileExperienceComponentModel } from './experience/ui/component-model.js';
import { compileUiDocument } from './experience/ui/v2-document.js';

// Explicit, lossless static-v1 adapter. Dynamic v1 semantics require author
// decisions; never silently drop a binding, action, appearance or visibility.
export function previewStudioUiMigration(model, experience) {
    if (experience.componentModelVersion === 2 || model.schemaVersion === 2) throw new TypeError('UI already uses version 2');
    compileExperienceComponentModel(model, { mode: experience.mode });
    function convert(node) {
        if (['bindings', 'actions', 'visibility', 'responsive'].some(key => node[key] && Object.keys(node[key]).length)) throw new TypeError('Dynamic v1 UI requires explicit author migration: ' + node.id);
        if (node.type === 'input') throw new TypeError('Input migration requires an explicit Local UI State model: ' + node.id);
        const props = node.props ?? {};
        if (Object.keys(props).some(key => !['text', 'disabled', 'component'].includes(key))) throw new TypeError('Appearance migration requires explicit author review: ' + node.id);
        return { id: node.id, type: node.type, ...(node.props ? { props: { ...props } } : {}), ...(node.children ? { children: node.children.map(convert) } : {}) };
    }
    const next = { schemaVersion: 2, stateVersion: 1, views: [{ id: 'main',
        surface: experience.surface ?? (experience.mode === 'component' ? 'chat.footer' : 'app.root'), mount: 'always', root: convert(model) }] };
    compileUiDocument(next, { mode: experience.mode });
    const { surface: _surface, ...previous } = experience;
    return { model: next, experience: { ...previous, componentModelVersion: 2 },
        changes: [{ path: 'experience.componentModelVersion', before: 1, after: 2 }, { path: 'views.main', before: null, after: next.views[0].surface }] };
}
