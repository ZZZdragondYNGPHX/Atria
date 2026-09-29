import { fields, resourcePath, FRONTEND_LIMITS } from '../../../shared/native-frontend-contract.js';

export async function createFrontendResources({ entry, loadBytes, crypto = globalThis.crypto, window = globalThis.window }) {
    resourcePath(entry);
    const abort = new AbortController();
    let disposed = false;
    const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const indexBytes = new Uint8Array(await loadBytes(entry, abort.signal));
    if (indexBytes.byteLength > FRONTEND_LIMITS.bytes) throw new TypeError('Frontend Index exceeds budget');
    const index = decode(indexBytes);
    fields(index, ['format', 'version', 'primaryView', 'resources', 'globalStyles']);
    if (index.format !== 'atria-frontend-index' || index.version !== 3 || !Array.isArray(index.resources) || index.resources.length > FRONTEND_LIMITS.resources) throw new TypeError('Compiled Frontend Index required');
    const refs = new Map();
    for (const ref of index.resources) {
        resourcePath(ref.path);
        if (refs.has(ref.id) || !/^[a-f0-9]{64}$/.test(ref.contentHash) || !Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > FRONTEND_LIMITS.bytes) throw new TypeError('Invalid exact Frontend resource');
        refs.set(ref.id, ref);
    }
    if (refs.get(index.primaryView)?.kind !== 'view') throw new TypeError('Missing Primary View');
    const promises = new Map(), urls = new Map(), installedFonts = new Set(), stylePromises = new Map();
    const prefix = 'atri_' + (await digest(indexBytes)).slice(0, 20) + '_';
    function active() { if (disposed) throw new Error('Frontend resources disposed'); }
    async function bytes(id) {
        active();
        const ref = refs.get(id); if (!ref) throw new TypeError('Unknown compiled resource: ' + id);
        if (!promises.has(id)) promises.set(id, (async () => {
            const value = new Uint8Array(await loadBytes(ref.path, abort.signal)); active();
            if (value.byteLength !== ref.size || await digest(value) !== ref.contentHash) throw new TypeError('Frontend resource integrity mismatch');
            active(); return value;
        })().catch(error => { promises.delete(id); throw error; }));
        return promises.get(id);
    }
    async function json(id, kind) {
        if (refs.get(id)?.kind !== kind) throw new TypeError('Unexpected Frontend resource kind');
        return decode(await bytes(id));
    }
    async function asset(id) {
        active();
        if (refs.get(id)?.kind !== 'asset') throw new TypeError('Exact asset required');
        const value = await bytes(id); active();
        if (!urls.has(id)) urls.set(id, window.URL.createObjectURL(new window.Blob([value], { type: refs.get(id).mediaType })));
        return urls.get(id);
    }
    async function style(id) {
        if (!stylePromises.has(id)) stylePromises.set(id, (async () => {
            const value = await json(id, 'style');
            const replacements = new Map(await Promise.all(value.resources.map(async resource => ['resource:' + resource, await asset('asset:' + resource)])));
            const replace = css => css.replace(/resource:[a-zA-Z][a-zA-Z0-9._-]*/g, match => {
                if (!replacements.has(match)) throw new TypeError('Undeclared CSS resource'); return replacements.get(match);
            }).replace(/__atri_font_(\d+)__/g, (_, number) => prefix + number);
            for (const font of value.fonts) {
                active();
                const face = new window.FontFace(replace(font.family), replace(font.src), font.descriptors);
                await face.load();
                active(); window.document.fonts.add(face); installedFonts.add(face);
            }
            active(); return replace(value.css);
        })().catch(error => { stylePromises.delete(id); throw error; }));
        return stylePromises.get(id);
    }
    return { index, refs, json, asset, style,
        dispose() {
            if (disposed) return; disposed = true; abort.abort();
            urls.forEach(url => window.URL.revokeObjectURL(url)); urls.clear();
            installedFonts.forEach(face => window.document.fonts.delete(face)); installedFonts.clear();
            promises.clear(); stylePromises.clear();
        },
    };
}
