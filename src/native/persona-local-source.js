import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hashNativeDocument } from './repositories/common.js';
import { validateAvatar } from './repositories/persona-repo.js';
import { personaFailure } from './persona-contract.js';

// The caller supplies authenticated directories/settings, never a browser path.
export async function captureLocalPersonaSource(settings, directories) {
    const power = settings?.power_user ?? {};
    const source = Object.fromEntries(Object.entries(power).filter(([key]) => /^(?:persona(?:s|_|$)|default_persona$)/.test(key)));
    const avatars = Object.create(null), hashes = Object.create(null), pending = Object.create(null);
    const keys = [...new Set([...Object.keys(source.personas ?? {}), ...Object.keys(source.persona_descriptions ?? {})])];
    if (keys.length > 1000) throw personaFailure();
    let total = 0;
    for (const key of keys) {
        try {
            if (!key || path.basename(key) !== key || key.includes('\\')) throw new Error('filename');
            const filename = path.join(directories.avatars, key);
            const stat = await lstat(filename);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024 || !stat.size) throw new Error('invalid');
            const parent = await realpath(directories.avatars), resolved = await realpath(filename);
            if (path.dirname(resolved) !== parent) throw new Error('outside');
            const { imageSize } = await import('image-size');
            const bytes = await readFile(filename), mediaType = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' }[imageSize(bytes).type];
            await validateAvatar(bytes, mediaType); total += bytes.length;
            if (total > 16 * 1024 * 1024) throw personaFailure();
            avatars[key] = { bytes: bytes.toString('base64'), mediaType };
            hashes[key] = createHash('sha256').update(bytes).digest('hex');
        } catch (error) { if (total > 16 * 1024 * 1024) throw error; pending[key] = 'avatar_missing_or_invalid'; }
    }
    source.atri_local_source = { format: 'account-settings-personas', namespaceDigest: hashNativeDocument(source), avatarHashes: hashes, avatarPending: pending,
        bindingDigest: hashNativeDocument(source.persona_descriptions ?? {}), bindings: 'unresolved' };
    return { rawSource: JSON.stringify(source), avatars };
}
