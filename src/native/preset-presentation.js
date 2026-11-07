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

// A template is optional presentation. One this Atria version cannot compile
// (for example a newer template feature) is kept exactly as authored and never
// run; callers report it by name instead of rejecting the preset's prompt content.
const problems = new Map();
export function presetPresentationProblem(presentation) {
    const cacheKey = JSON.stringify([presentation.source, presentation.files]);
    if (!problems.has(cacheKey)) {
        let problem = null;
        try { compilePresetPresentation(presentation); } catch (error) { problem = String(error?.message || error).slice(0, 300); }
        if (problems.size >= 512) problems.delete(problems.keys().next().value);
        problems.set(cacheKey, problem);
    }
    return problems.get(cacheKey);
}
