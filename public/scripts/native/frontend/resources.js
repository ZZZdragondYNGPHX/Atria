import { remoteImageSource } from '../../../shared/native-frontend-media.js';
import { fields, resourcePath, FRONTEND_LIMITS, frontendResourceBytes, assertFrontendResourceBudget } from '../../../shared/native-frontend-contract.js';

export async function createFrontendResources({ entry, loadBytes, mediaUrl, remoteAssetsEnabled = false, fetchAsset = globalThis.fetch, fontText, onDiagnostic, signal, crypto = globalThis.crypto, window = globalThis.window }) {
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
        if (refs.has(ref.id) || !/^[a-f0-9]{64}$/.test(ref.contentHash) || !Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > frontendResourceBytes(ref.kind, ref.mediaType)) throw new TypeError('Invalid exact Frontend resource');
        if (ref.remote !== undefined) { if (ref.kind !== 'asset' || !/^(image|font)\//.test(ref.mediaType)) throw new TypeError('Invalid remote asset'); remoteImageSource(ref.remote); }
        refs.set(ref.id, ref);
    }
    if (refs.get(index.primaryView)?.kind !== 'view') throw new TypeError('Missing Primary View');
    const promises = new Map(), assets = new Map(), pinnedAssets = new Map(), installedFonts = new Set(), stylePromises = new Map();
    let assetBytes = 0;
    let remoteQueue = Promise.resolve();
    signal?.addEventListener('abort', dispose, { once: true });
    if (signal?.aborted) dispose();
    const prefix = 'atri_' + (await digest(indexBytes)).slice(0, 20) + '_';
    function active() { if (disposed) throw new Error('Frontend resources disposed'); }
    async function remoteBytes(ref) {
        if (!remoteAssetsEnabled) throw new Error('frontend_remote_asset_disabled');
        const previous = remoteQueue; let release; remoteQueue = new Promise(resolve => { release = resolve; });
        await previous;
        const controller = new AbortController(), cancel = () => controller.abort();
        abort.signal.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, 15000);
        try {
            active();
            const response = await fetchAsset(ref.remote.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors', cache: 'no-store' });
            if (!response.ok || !response.body?.getReader) throw new Error('response_invalid');
            const reader = response.body.getReader(), chunks = []; let length = 0;
            while (true) {
                const { value, done } = await reader.read(); if (done) break; length += value.byteLength;
                if (length > FRONTEND_LIMITS.assetBytes || assetBytes + length > FRONTEND_LIMITS.assetCacheBytes) { await reader.cancel(); throw new Error('byte_budget'); } chunks.push(value);
            }
            const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            if (ref.remote.integrity && await digest(bytes) !== ref.remote.integrity) throw new Error('integrity_mismatch');
            active(); return bytes;
        } catch (cause) {
            onDiagnostic?.({ reasonCode: 'frontend_remote_asset_failed', message: 'Resource unavailable: ' + ref.remote.url });
            throw new Error('frontend_remote_asset_failed: ' + ref.id, { cause });
        } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', cancel); release(); }
    }
    async function load(id) {
        active();
        const ref = refs.get(id); if (!ref) throw new TypeError('Unknown compiled resource: ' + id);
        const value = new Uint8Array(await loadBytes(ref.path, abort.signal)); active();
        if (value.byteLength !== ref.size || await digest(value) !== ref.contentHash) throw new TypeError('Frontend resource integrity mismatch');
        if (ref.remote && JSON.stringify(decode(value)) !== JSON.stringify({ remote: ref.remote })) throw new TypeError('Remote asset declaration mismatch');
        active(); return ref.remote ? remoteBytes(ref) : value;
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
        const media = refs.get(id);
        if (mediaUrl && /^(audio|video)\//.test(media.mediaType)) return { url: mediaUrl(media), release() {} };
        let record = assets.get(id);
        if (!record) {
            const ref = refs.get(id);
            for (const [oldId, old] of assets) {
                if (assetBytes + ref.size <= FRONTEND_LIMITS.assetCacheBytes) break;
                if (!old.users && old.url) drop(oldId, old);
            }
            if (assetBytes + ref.size > FRONTEND_LIMITS.assetCacheBytes) throw new Error('frontend_asset_cache_budget');
            record = { size: ref.remote ? 0 : ref.size, users: 0, url: null, promise: null };
            assets.set(id, record); assetBytes += record.size; // Reserve before awaiting a concurrent load.
            record.promise = load(id).then(value => {
                active();
                if (ref.remote) { if (assetBytes + value.byteLength > FRONTEND_LIMITS.assetCacheBytes) throw new Error('frontend_asset_cache_budget'); record.size = value.byteLength; assetBytes += record.size; }
                record.url = window.URL.createObjectURL(new window.Blob([value], { type: ref.mediaType }));
                return record.url; // Do not retain a second encoded-byte copy.
            }).catch(error => { drop(id, record); throw error; });
        }
        ++record.users; touch(id, record);
        try {
            const url = await record.promise; active(); let released = false;
            return { url, release() { if (released) return; released = true; --record.users; touch(id, record); } };
        } catch (error) {
            --record.users; active();
            if (remoteAssetsEnabled && media.remote && media.mediaType.startsWith('image/')) return { url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E', release() {} };
            throw error;
        }
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
            let renderedText = fontText;
            if (typeof renderedText === 'string') {
                const collect = node => typeof node === 'string' ? node : (node?.children ?? []).map(collect).join('');
                for (const ref of refs.values()) if (ref.kind === 'component') renderedText += collect((await json(ref.id, 'component')).root);
            }
            const codepoints = typeof renderedText === 'string' ? [...new Set([...renderedText].map(char => char.codePointAt(0)))].sort((a, b) => a - b) : [];
            const fonts = value.fonts.filter(font => {
                if (typeof renderedText !== 'string' || !font.descriptors.unicodeRange) return true;
                const ranges = font.descriptors.unicodeRange.split(',').map(part => part.trim().replace(/^U\+/i, '').split('-').map(hex => parseInt(hex, 16)));
                return ranges.some(([start, end = start]) => {
                    let low = 0, high = codepoints.length;
                    while (low < high) { const middle = (low + high) >>> 1; if (codepoints[middle] < start) low = middle + 1; else high = middle; }
                    return codepoints[low] <= end;
                });
            });
            const used = new Set([...value.css.matchAll(/resource:([a-zA-Z][a-zA-Z0-9._-]*)/g), ...fonts.flatMap(font => [...font.src.matchAll(/resource:([a-zA-Z][a-zA-Z0-9._-]*)/g)])].map(match => match[1]));
            const replacements = new Map(await Promise.all([...used].map(async resource => {
                try { return ['resource:' + resource, await asset('asset:' + resource)]; } catch (error) { active(); if (!remoteAssetsEnabled || !refs.get('asset:' + resource)?.remote) throw error; return ['resource:' + resource, null]; }
            })));
            const replace = css => css.replace(/resource:[a-zA-Z][a-zA-Z0-9._-]*/g, match => {
                if (!replacements.has(match)) throw new TypeError('Undeclared CSS resource'); return replacements.get(match) ?? 'data:,';
            }).replace(/__atri_font_(\d+)__/g, (_, number) => prefix + number);
            for (const font of fonts) {
                active();
                const sources = [...font.src.matchAll(/resource:([a-zA-Z][a-zA-Z0-9._-]*)/g)].map(match => match[1]);
                if (sources.some(source => !replacements.get('resource:' + source))) continue;
                const face = new window.FontFace(replace(font.family), replace(font.src), font.descriptors);
                try { await face.load(); } catch (error) {
                    const remote = sources.map(source => refs.get('asset:' + source)?.remote?.url).filter(Boolean);
                    if (!remote.length) throw error;
                    onDiagnostic?.({ reasonCode: 'frontend_remote_font_failed', message: 'Font unavailable; using declared fallback: ' + remote.join(', ') });
                    continue;
                }
                active(); window.document.fonts.add(face); installedFonts.add(face);
            }
            active(); return replace(value.css);
        })().catch(error => { stylePromises.delete(id); throw error; }));
        return stylePromises.get(id);
    }
    function dispose() {
        if (disposed) return; disposed = true; abort.abort();
        signal?.removeEventListener('abort', dispose);
        for (const [id, record] of assets) drop(id, record);
        pinnedAssets.clear();
        installedFonts.forEach(face => window.document.fonts.delete(face)); installedFonts.clear();
        promises.clear(); stylePromises.clear();
    }
    return { index, refs, json, asset, acquireAsset, style, dispose };
}
