import { PNG } from 'pngjs';
import { imageSize } from 'image-size';
import { visualError } from '../../../public/shared/native-visual-contract.js';

export function imageEndpoint(endpoint) {
    let url; try { url = new URL(endpoint); } catch { visualError('endpoint_invalid'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || /^(?:169\.254\.|0\.|\[?fe80:|\[?::ffff:169\.254\.)/i.test(url.hostname)) visualError('endpoint_invalid');
    return url.toString();
}
export function imageRoute(endpoint, path) {
    const base = imageEndpoint(endpoint);
    return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}
export async function boundedImageBytes(response, signal, max = 32 * 1024 * 1024) {
    if (!response.ok) { await response.body?.cancel(); visualError(response.status === 429 ? 'rate_limited' : [401, 403].includes(response.status) ? 'authentication_failed' : 'request_failed'); }
    const chunks = []; let total = 0;
    if (Number(response.headers.get('content-length') ?? 0) > max) { await response.body?.cancel(); visualError('response_limit'); }
    for await (const chunk of response.body ?? []) {
        if (signal?.aborted) visualError('cancelled');
        total += chunk.length; if (total > max) { await response.body?.cancel().catch(() => {}); visualError('response_limit'); }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
export async function imageFetch(fetchImpl, endpoint, { secret, signal, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
    imageEndpoint(endpoint.split('?')[0]);
    try {
        return await fetchImpl(endpoint, { method, redirect: 'error', signal, headers: { ...(secret ? { Authorization: 'Bearer ' + secret } : {}),
            ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    } catch { visualError(signal?.aborted ? 'cancelled' : 'unreachable'); }
}
export async function imageJson(fetchImpl, endpoint, options) {
    const response = await imageFetch(fetchImpl, endpoint, options);
    const bytes = await boundedImageBytes(response, options?.signal, 8 * 1024 * 1024);
    try { return JSON.parse(bytes.toString('utf8')); } catch { visualError('response_invalid'); }
}
export async function normalizeImage(bytesValue) {
    let bytes = Buffer.from(bytesValue), dimensions;
    if (bytes.length > 32 * 1024 * 1024) visualError('response_limit');
    try { dimensions = imageSize(bytes); } catch { visualError('response_invalid'); }
    const { width, height, type } = dimensions;
    if (!width || !height || width > 32768 || height > 32768 || width * height > 16777216 || !['png', 'jpg', 'webp'].includes(type)) visualError('response_invalid');
    try {
        if (type === 'png') PNG.sync.read(bytes, { checkCRC: true });
        else {
            const { default: Jimp } = await import('../../jimp.js');
            const image = await Jimp.read(bytes); bytes = await image.getBuffer('image/png');
        }
    } catch { visualError('response_invalid'); }
    return { bytes, width, height, mediaType: 'image/png' };
}
export function imageBase64(value) {
    if (typeof value !== 'string' || value.length > 44 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) visualError('response_invalid');
    return Buffer.from(value, 'base64');
}
export function canonicalMaskPng(bytes, width, height, alpha = false) {
    if (bytes.length !== width * height || width * height > 16777216) visualError('mask_invalid');
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < bytes.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = alpha ? 255 : bytes[i]; data[i * 4 + 3] = alpha ? 255 - bytes[i] : 255; }
    return PNG.sync.write({ width, height, data });
}
export async function readImageInput(options, reference) {
    const input = await options.readAsset(reference.assetId);
    if (!input || input.ref.contentHash !== reference.contentHash) visualError('input_integrity_invalid');
    return input;
}
export async function imagePollDelay(signal, milliseconds = 1000) {
    if (signal?.aborted) visualError('cancelled');
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(Object.assign(new Error('native_visual_cancelled'), { code: 'native_visual_cancelled' })); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
        signal?.addEventListener('abort', abort, { once: true });
    });
}
