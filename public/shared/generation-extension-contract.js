// This contract contains host capabilities only; extension algorithms and
// configuration schemas travel with the installed source.
export const GENERATION_EXTENSION_CAPABILITIES = Object.freeze([
    'request.text', 'request.parameters', 'response.frames', 'response.text',
    'response.carrier', 'generation.repeat', 'generation.continue', 'generation.observe',
]);

export function extensionManifest(files, entrypoint) {
    if (!files['atria.extension.json']) return null;
    const value = JSON.parse(files['atria.extension.json']);
    if (!value || value.schemaVersion !== 1 || ![1, 2].includes(value.apiVersion)
        || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100
        || value.entrypoint !== entrypoint
        || Object.keys(value).some(key => !['schemaVersion', 'apiVersion', 'name', 'entrypoint', 'generation', 'settings'].includes(key))) {
        throw new TypeError('Invalid extension manifest');
    }
    if (value.settings !== undefined && typeof value.settings !== 'boolean') throw new TypeError('Invalid extension settings declaration');
    if (value.generation !== undefined) {
        const generation = value.generation;
        if (value.apiVersion !== 2 || !generation || typeof generation.entrypoint !== 'string'
            || !/\.(m?js|ts)$/.test(generation.entrypoint) || !Object.hasOwn(files, generation.entrypoint)
            || Object.keys(generation).some(key => !['entrypoint', 'capabilities'].includes(key))
            || !Array.isArray(generation.capabilities) || new Set(generation.capabilities).size !== generation.capabilities.length
            || generation.capabilities.some(key => !GENERATION_EXTENSION_CAPABILITIES.includes(key))) {
            throw new TypeError('Invalid generation extension declaration');
        }
    }
    return value;
}

export function readExtensionBundle(text) {
    const bundle = JSON.parse(text);
    if (!bundle || bundle.format !== 'atria.extension' || bundle.schemaVersion !== 1
        || Object.keys(bundle).some(key => !['format', 'schemaVersion', 'files'].includes(key))
        || !bundle.files || Array.isArray(bundle.files) || typeof bundle.files['atria.extension.json'] !== 'string') throw new TypeError('Invalid extension bundle');
    const manifest = JSON.parse(bundle.files['atria.extension.json']);
    return { files: bundle.files, manifest: extensionManifest(bundle.files, manifest.entrypoint) };
}
