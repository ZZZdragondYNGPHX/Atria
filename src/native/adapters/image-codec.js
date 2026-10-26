import { PNG } from 'pngjs';
import { imageSize } from 'image-size';
import { visualError } from '../../../public/shared/native-visual-contract.js';

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
    const normalized = imageSize(bytes);
    if (normalized.width * normalized.height > 16777216) visualError('response_invalid');
    return { bytes, width: normalized.width, height: normalized.height, mediaType: 'image/png' };
}
export function canonicalMaskPng(bytes, width, height, alpha = false) {
    if (bytes.length !== width * height || width * height > 16777216) visualError('mask_invalid');
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < bytes.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = alpha ? 255 : bytes[i]; data[i * 4 + 3] = alpha ? 255 - bytes[i] : 255; }
    return PNG.sync.write({ width, height, data });
}
