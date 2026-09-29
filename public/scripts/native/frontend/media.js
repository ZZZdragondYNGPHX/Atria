import { assertMediaCatalog, assertMediaRef, mediaOrigins, remoteImageSource, IMAGE_TYPES } from '../../../shared/native-frontend-media.js';

// Host-only resolver. Never exported to Package code; handles contain no URL.
export async function createMediaResolver({ resources, window, fetchImage = globalThis.fetch, enabled = false, changed = () => {} }) {
    const catalog = resources.refs.has('media') ? assertMediaCatalog(await resources.json('media', 'media'), resources.refs) : { version: 1, required: false, entries: [] };
    const entries = new Map(catalog.entries.map(entry => [entry.mediaId, entry])), issued = new Map(), cache = new Map(), requests = new Set(), urls = new Set();
    let disposed = false, epoch = 0, sequence = 0;
    function clear() { ++epoch; requests.forEach(controller => controller.abort()); requests.clear(); urls.forEach(url => window.URL.revokeObjectURL(url)); urls.clear(); cache.clear(); }
    async function resolve(input, type = 'image') {
        const ref = assertMediaRef(input), revision = epoch;
        if (disposed) throw new Error('media_disposed');
        if (ref.kind === 'exact') {
            if (!resources.refs.get('asset:' + ref.id)?.mediaType.startsWith(type + '/')) throw new TypeError('media_type_mismatch');
            return { url: await resources.asset('asset:' + ref.id), status: 'available', reasonCode: 'media_exact' };
        }
        const entry = (ref.kind === 'host' ? issued : entries).get(ref.id);
        if (!entry || type !== 'image') throw new TypeError('media_ref_unknown');
        const fallback = async reasonCode => ({ url: await resources.asset('asset:' + entry.fallback), status: enabled ? 'unavailable' : 'denied', reasonCode });
        if (!enabled) return fallback('media_permission_denied');
        const key = ref.kind + ':' + ref.id + (entry.cache === 'none' ? ':' + (++sequence) : '');
        const acquire = async record => {
            ++record.users;
            try {
                const result = await record.promise; let released = false;
                return { ...result, release() {
                    if (released) return; released = true; --record.users;
                    if (!record.users && entry.cache === 'none') { cache.delete(key); if (record.url) { window.URL.revokeObjectURL(record.url); urls.delete(record.url); } }
                } };
            } catch (error) { --record.users; throw error; }
        };
        if (cache.has(key)) return acquire(cache.get(key));
        if (cache.size >= 64) {
            const oldest = [...cache].find(([, value]) => !value.users && value.settled);
            if (oldest) { cache.delete(oldest[0]); if (oldest[1].url) { window.URL.revokeObjectURL(oldest[1].url); urls.delete(oldest[1].url); } }
        }
        if (cache.size >= 64 || requests.size >= 8) return fallback('media_budget_exceeded');
        const promise = (async () => {
            for (const source of entry.sources) {
                const controller = new AbortController(); requests.add(controller);
                const timer = window.setTimeout(() => controller.abort(), 15000);
                try {
                    const response = await fetchImage(source.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors', cache: 'no-store' });
                    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== entry.mediaType || !response.body?.getReader) throw new Error('media_response_invalid');
                    const reader = response.body.getReader(), chunks = []; let length = 0;
                    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('media_byte_budget'); } chunks.push(value); }
                    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
                    if (source.integrity) {
                        const hash = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
                        if (hash !== source.integrity) throw new Error('media_integrity');
                    }
                    if (disposed || epoch !== revision) throw new Error('media_stale');
                    const url = window.URL.createObjectURL(new window.Blob([bytes], { type: entry.mediaType })); urls.add(url);
                    return { url, status: 'available', reasonCode: 'media_remote' };
                } catch { if (disposed || epoch !== revision) throw new Error('media_stale'); } finally { window.clearTimeout(timer); requests.delete(controller); }
            }
            return fallback('media_offline_or_invalid');
        })();
        const record = { users: 0, settled: false, url: null, promise: promise.then(result => {
            record.settled = true; if (result.status === 'available') record.url = result.url; else cache.delete(key); return result;
        }).catch(error => { cache.delete(key); throw error; }) };
        cache.set(key, record);
        return acquire(record);
    }
    return { resolve, required: catalog.required, origins: mediaOrigins(catalog),
        get enabled() { return enabled; }, get epoch() { return epoch; },
        setEnabled(value) { if (enabled === Boolean(value)) return; enabled = Boolean(value); clear(); changed(); },
        fallback(input) {
            const ref = assertMediaRef(input), entry = (ref.kind === 'host' ? issued : entries).get(ref.id);
            if (!entry) throw new TypeError('media_ref_unknown');
            return resources.asset('asset:' + entry.fallback);
        },
        reset() { clear(); issued.clear(); changed(); },
        issue(entry) {
            if (disposed || issued.size >= 64 || !IMAGE_TYPES.includes(entry.mediaType) || !entries.has(entry.fallbackMediaId)) throw new TypeError('Invalid HostIssuedMediaRef');
            remoteImageSource(entry.source);
            if (!mediaOrigins(catalog).includes(new URL(entry.source.url).origin)) throw new TypeError('Host media origin not disclosed');
            const id = 'host.' + globalThis.crypto.randomUUID(); issued.set(id, { ...entries.get(entry.fallbackMediaId), sources: [entry.source], mediaType: entry.mediaType });
            return Object.freeze({ kind: 'host', id });
        },
        dispose() { disposed = true; clear(); issued.clear(); },
    };
}
