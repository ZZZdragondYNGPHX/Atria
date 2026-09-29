import { fields, identifier } from './native-frontend-contract.js';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
export const MEDIA_TYPES = [...IMAGE_TYPES, 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'video/mp4', 'video/webm'];
export const ASSET_TYPES = [...MEDIA_TYPES, 'font/woff', 'font/woff2', 'font/ttf', 'font/otf'];

export function remoteImageSource(value) {
    fields(value, ['url', 'integrity']);
    if (typeof value.url !== 'string' || value.url.length > 2048) throw new TypeError('Invalid remote image URL');
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== value.url) throw new TypeError('Remote image requires canonical credential-free HTTPS');
    if (value.integrity !== undefined && !/^[a-f0-9]{64}$/.test(value.integrity)) throw new TypeError('Invalid remote image integrity');
    return value;
}

export function assertMediaCatalog(value, assets) {
    fields(value, ['version', 'required', 'entries']);
    if (value.version !== 1 || typeof value.required !== 'boolean' || !Array.isArray(value.entries) || value.entries.length > 10000) throw new TypeError('Invalid Media Catalog');
    const ids = new Set();
    for (const entry of value.entries) {
        fields(entry, ['mediaId', 'sources', 'mediaType', 'width', 'height', 'loading', 'cache', 'fallback']);
        identifier(entry.mediaId);
        if (ids.has(entry.mediaId)) throw new TypeError('Duplicate mediaId'); ids.add(entry.mediaId);
        if (!IMAGE_TYPES.includes(entry.mediaType) || !Array.isArray(entry.sources) || !entry.sources.length || entry.sources.length > 4) throw new TypeError('Remote media supports declared images only');
        entry.sources.forEach(remoteImageSource);
        for (const key of ['width', 'height']) if (!Number.isInteger(entry[key]) || entry[key] < 1 || entry[key] > 32768) throw new TypeError('Invalid media dimensions');
        if (!['lazy', 'eager'].includes(entry.loading) || !['session', 'none'].includes(entry.cache)) throw new TypeError('Invalid media hints');
        identifier(entry.fallback);
        if (assets && !IMAGE_TYPES.includes(assets.get('asset:' + entry.fallback)?.mediaType)) throw new TypeError('Media fallback requires exact image');
    }
    return value;
}

export function mediaOrigins(catalog) {
    return [...new Set(catalog.entries.flatMap(entry => entry.sources.map(source => new URL(source.url).origin)))].sort();
}

// A reference contains identity only. URLs cannot arrive from projection/state.
export function assertMediaRef(value) {
    if (typeof value === 'string') return { kind: 'declared', id: identifier(value) };
    fields(value, ['kind', 'id']);
    if (!['exact', 'declared', 'host'].includes(value.kind)) throw new TypeError('Invalid MediaRef kind');
    identifier(value.id); return value;
}
