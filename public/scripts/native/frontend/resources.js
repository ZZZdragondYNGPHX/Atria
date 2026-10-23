import { fields, resourcePath, FRONTEND_LIMITS, frontendResourceBytes, assertFrontendResourceBudget } from '../../../shared/native-frontend-contract.js';

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
    if (index.format !== 'atria-frontend-index' || index.version !== 3) throw new TypeError('Compiled Frontend Index required');
    assertFrontendResourceBudget(index.resources);
    const refs = new Map();
    for (const ref of index.resources) {
        resourcePath(ref.path);
        if (refs.has(ref.id) || !/^[a-f0-9]{64}$/.test(ref.contentHash) || !Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > frontendResourceBytes(ref.kind)) throw new TypeError('Invalid exact Frontend resource');
        refs.set(ref.id, ref);
    }
    if (refs.get(index.primaryView)?.kind !== 'view') throw new TypeError('Missing Primary View');
    const promises = new Map(), assets = new Map(), pinnedAssets = new Map(), installedFonts = new Set(), stylePromises = new Map();
    let assetBytes = 0;
    const prefix = 'atri_' + (await digest(indexBytes)).slice(0, 20) + '_';
    function active() { if (disposed) throw new Error('Frontend resources disposed'); }
    async function load(id) {
        active();
        const ref = refs.get(id); if (!ref) throw new TypeError('Unknown compiled resource: ' + id);
        const value = new Uint8Array(await loadBytes(ref.path, abort.signal)); active();
        if (value.byteLength !== ref.size || await digest(value) !== ref.contentHash) throw new TypeError('Frontend resource integrity mismatch');
        active(); return value;
    }
    async function bytes(id) {
        if (!promises.has(id)) promises.set(id, load(id).catch(error => { promises.delete(id); throw error; }));
        return promises.get(id);
    }
    async function json(id, kind) {
        if (refs.get(id)?.kind !== kind) throw new TypeError('Unexpected Frontend resource kind');
        return decode(await bytes(id));
    }
    function drop(id, record) {
        if (assets.get(id) !== record) return;
        assets.delete(id); assetBytes -= record.size;
        if (record.url) window.URL.revokeObjectURL(record.url);
    }
    function touch(id, record) { if (assets.get(id) === record) { assets.delete(id); assets.set(id, record); } }
    async function acquireAsset(id) {
        active();
        if (refs.get(id)?.kind !== 'asset') throw new TypeError('Exact asset required');
        let record = assets.get(id);
        if (!record) {
            const ref = refs.get(id);
            for (const [oldId, old] of assets) {
                if (assetBytes + ref.size <= FRONTEND_LIMITS.assetCacheBytes) break;
                if (!old.users && old.url) drop(oldId, old);
            }
            if (assetBytes + ref.size > FRONTEND_LIMITS.assetCacheBytes) throw new Error('frontend_asset_cache_budget');
            record = { size: ref.size, users: 0, url: null, promise: null };
            assets.set(id, record); assetBytes += ref.size; // Reserve before awaiting a concurrent load.
            record.promise = load(id).then(value => {
                active();
                record.url = window.URL.createObjectURL(new window.Blob([value], { type: ref.mediaType }));
                return record.url; // Do not retain a second encoded-byte copy.
            }).catch(error => { drop(id, record); throw error; });
        }
        ++record.users; touch(id, record);
        try {
            const url = await record.promise; active(); let released = false;
            return { url, release() { if (released) return; released = true; --record.users; touch(id, record); } };
        } catch (error) { --record.users; throw error; }
    }
    // CSS URLs/fonts live for the entire frontend. Dynamic media uses leases.
    async function asset(id) {
        active();
        if (!pinnedAssets.has(id)) pinnedAssets.set(id, acquireAsset(id).catch(error => { pinnedAssets.delete(id); throw error; }));
        return (await pinnedAssets.get(id)).url;
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
    return { index, refs, json, asset, acquireAsset, style,
        dispose() {
            if (disposed) return; disposed = true; abort.abort();
            for (const [id, record] of assets) drop(id, record);
            pinnedAssets.clear();
            installedFonts.forEach(face => window.document.fonts.delete(face)); installedFonts.clear();
            promises.clear(); stylePromises.clear();
        },
    };
}
