import path from 'node:path';
import sanitize from 'sanitize-filename';
import { UNSAFE_EXTENSIONS } from './constants.js';

export function validateAssetFileName(inputFilename) {
    if (!/^[a-zA-Z0-9_\-.]+$/.test(inputFilename)) {
        return {
            error: true,
            message: 'Illegal character in filename; only alphanumeric, \'_\', \'-\' are accepted.',
        };
    }

    const inputExtension = path.extname(inputFilename).toLowerCase();
    if (UNSAFE_EXTENSIONS.some(ext => ext === inputExtension)) {
        return {
            error: true,
            message: 'Forbidden file extension.',
        };
    }

    if (inputFilename.startsWith('.')) {
        return {
            error: true,
            message: 'Filename cannot start with \'.\'',
        };
    }

    if (sanitize(inputFilename) !== inputFilename) {
        return {
            error: true,
            message: 'Reserved or long filename.',
        };
    }

    return { error: false };
}
