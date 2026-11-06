import { compileFrontend } from './frontend/compiler.js';

// Same Native Frontend compiler and isolated runtime, with only draft actions.
export function compilePresetPresentation(presentation) {
    const compiled = compileFrontend({ source: presentation.source,
        files: new Map(Object.entries(presentation.files).map(([path, content]) => [path, Buffer.from(content)])), mode: 'text', namespace: 'preset' });
    const index = JSON.parse(compiled.files.get(compiled.entry));
    for (const resource of index.resources) {
        if (resource.kind === 'component') {
            const component = JSON.parse(compiled.files.get(resource.path));
            if (component.controller) throw new TypeError('Preset presentations cannot contain scripts');
        }
        if (resource.kind === 'bridge') {
            const bridge = JSON.parse(compiled.files.get(resource.path));
            if (bridge.bindings.some(binding => binding.target.service !== 'host.composer' || !['set', 'focus'].includes(binding.target.method))) {
                throw new TypeError('Preset presentations may only fill or focus the composer');
            }
        }
    }
    const view = JSON.parse(compiled.files.get(index.resources.find(ref => ref.id === index.primaryView).path));
    const root = JSON.parse(compiled.files.get(index.resources.find(ref => ref.id === 'component:' + view.root).path));
    const optionKeys = Object.keys(root.presentation.props.options?.schema.properties ?? {});
    return { entry: compiled.entry, optionKeys, files: Object.fromEntries([...compiled.files].map(([path, bytes]) => [path, bytes.toString('base64')])) };
}
