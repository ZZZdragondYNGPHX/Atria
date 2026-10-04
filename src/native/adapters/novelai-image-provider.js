import yauzl from 'yauzl';
import { PNG } from 'pngjs';

const MAX_BYTES = 32 * 1024 * 1024;
const fail = code => { throw Object.assign(new Error('native_illustration_' + code), { code: 'native_illustration_' + code }); };
async function readBounded(stream, signal, limit = MAX_BYTES) {
    const chunks = []; let size = 0;
    try {
        for await (const chunk of stream) {
            if (signal?.aborted) fail('image_cancelled');
            size += chunk.length;
            if (size > limit) fail('image_response_invalid');
            chunks.push(Buffer.from(chunk));
        }
    } catch (error) { throw error.code?.startsWith('native_illustration_') ? error : Object.assign(new Error('native_illustration_image_response_invalid'), { code: 'native_illustration_image_response_invalid' }); }
    return Buffer.concat(chunks);
}
async function unzip(bytes, signal) {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
            if (error) return reject(Object.assign(new Error('native_illustration_image_response_invalid'), { code: 'native_illustration_image_response_invalid' }));
            let image, count = 0;
            const invalid = () => { zip.close(); reject(Object.assign(new Error('native_illustration_image_response_invalid'), { code: 'native_illustration_image_response_invalid' })); };
            zip.on('error', invalid);
            zip.on('end', () => image ? resolve(image) : invalid());
            zip.on('entry', entry => {
                if (++count > 32 || signal?.aborted || entry.uncompressedSize > MAX_BYTES) return invalid();
                if (!entry.fileName.endsWith('.png')) return zip.readEntry();
                if (image) return invalid();
                zip.openReadStream(entry, (error, stream) => {
                    if (error) return invalid();
                    void readBounded(stream, signal).then(bytes => { image = bytes; zip.readEntry(); }, invalid);
                });
            });
            zip.readEntry();
        });
    });
}
export function createNovelaiImageProvider({ fetchImpl = fetch } = {}) {
    return Object.freeze({
        async generate({ endpoint, body, responseFormat }, { secret, signal }) {
            let response;
            try {
                response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal,
                    headers: { 'Content-Type': 'application/json', Accept: responseFormat === 'json' ? 'application/json' : responseFormat === 'png' ? 'image/png' : 'application/zip', Authorization: 'Bearer ' + secret },
                    body: JSON.stringify(body) });
            } catch { fail(signal?.aborted ? 'image_cancelled' : 'image_unreachable'); }
            if (!response.ok) {
                await response.body?.cancel();
                fail(response.status === 401 || response.status === 403 ? 'image_authentication_failed' : response.status === 429 ? 'image_rate_limited' : 'image_request_failed');
            }
            let bytes = await readBounded(response.body, signal);
            try {
                if (responseFormat === 'zip') bytes = await unzip(bytes, signal);
                else if (responseFormat === 'json') {
                    const data = JSON.parse(bytes.toString('utf8'));
                    if (!Array.isArray(data.images) || data.images.length !== 1 || typeof data.images[0]?.image !== 'string'
                        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.images[0].image)) fail('image_response_invalid');
                    if (data.images[0].seed !== undefined && data.images[0].seed !== body.parameters.seed) fail('image_response_invalid');
                    bytes = Buffer.from(data.images[0].image, 'base64');
                }
                if (signal?.aborted) fail('image_cancelled');
                if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') fail('image_response_invalid');
                const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
                if (!width || !height || width > 32768 || height > 32768 || width * height > 16777216) fail('image_response_invalid');
                const decoded = PNG.sync.read(bytes, { checkCRC: true });
                if (decoded.width !== width || decoded.height !== height) fail('image_response_invalid');
                return { bytes, width, height };
            } catch (error) { fail(error.code === 'native_illustration_image_cancelled' ? 'image_cancelled' : 'image_response_invalid'); }
        },
    });
}
