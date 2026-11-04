import fs from 'node:fs';
import path from 'node:path';
import { assertAccountPath } from './path-boundary.js';
import { accountEngineForDirectory, withAccountFileGrowth } from './account-quota.js';
import { listAccountFiles } from './resource-accounting.js';
import { withChatWrite } from './repositories/chat-write-boundary.js';

function error(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function assertSegment(value) {
    const segment = String(value ?? '');
    if (!segment || segment.includes('..') || segment.includes('/') || segment.includes('\\') || segment.includes('\0') || path.isAbsolute(segment)) {
        throw error('E_INVALID_PATH', `Unsafe storage path segment: ${JSON.stringify(value)}`);
    }
    return segment;
}

function isProtectedRelativePath(relPath) {
    const normalized = relPath.split(path.sep).join('/');
    const base = path.basename(normalized);
    return normalized === 'secrets.json'
        || ['atria-native', 'projects', 'assets', 'groups', 'characters'].includes(normalized.split('/')[0])
        || /\.sqlite(?:-(?:wal|shm))?$/i.test(base)
        || base === '_engine_dump.bin'
        || base === '_engine_meta.json';
}

// Keep existing recovery points accessible after retiring the raw inspector.
export async function listStorageRecoveryPoints(recoveryRoot, handle, limit = 25, before = null) {
    const root = path.join(recoveryRoot, handle);
    let ids = [];
    try { ids = await fs.promises.readdir(root); } catch (cause) { if (cause.code === 'ENOENT') return []; throw cause; }
    if (before != null) before = assertSegment(before);
    const manifests = [];
    const pageSize = Math.max(1, Math.min(100, Number(limit) || 25));
    for (const id of ids.sort().reverse()) {
        if (before != null && id >= before) continue;
        try {
            const raw = await fs.promises.readFile(path.join(root, id, 'manifest.json'), 'utf8');
            const manifest = JSON.parse(raw);
            if (manifest.id === id && manifest.handle === handle) manifests.push(manifest);
        } catch { /* ignore incomplete recovery entries */ }
        if (manifests.length >= pageSize) break;
    }
    return manifests;
}

export async function restoreStorageRecoveryPoint(args) {
    return withChatWrite(args.handle, async () => {
        const { recoveryRoot, handle, userRoot, id } = args;
        assertSegment(id);
        const root = path.join(recoveryRoot, handle, id);
        const manifest = JSON.parse(await fs.promises.readFile(path.join(root, 'manifest.json'), 'utf8'));
        if (manifest.handle !== handle) throw error('E_RECOVERY_INVALID', 'Recovery point handle mismatch.');
        const target = path.resolve(userRoot, manifest.relativePath);
        const resolvedRoot = path.resolve(userRoot);
        if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) throw error('E_INVALID_PATH', 'Resolved storage path escapes the user root.');
        assertAccountPath(userRoot, target);
        if (isProtectedRelativePath(manifest.relativePath) || manifest.relativePath === 'settings.json') throw error('E_READ_ONLY', 'This path requires its domain recovery service.');
        const payload = path.join(root, 'payload');
        if (fs.existsSync(target)) throw error('E_CONFLICT', 'Recovery never overwrites an existing resource.');
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const listing = manifest.isDirectory ? await listAccountFiles(payload) : { files: [{ bytes: (await fs.promises.stat(payload)).size }], errors: [] };
        if (listing.errors.length) throw error('E_INVALID_PATH', 'Recovery payload contains unreadable or linked paths.');
        await withAccountFileGrowth(handle, listing.files.reduce((sum, file) => sum + file.bytes, 0), async () => {
            try {
                if (manifest.isDirectory) {
                    await fs.promises.mkdir(target);
                    for (const name of await fs.promises.readdir(payload)) {
                        await fs.promises.cp(path.join(payload, name), path.join(target, name), { recursive: true, force: false, errorOnExist: true });
                    }
                } else await fs.promises.copyFile(payload, target, fs.constants.COPYFILE_EXCL);
            } catch (cause) {
                if (cause.code === 'EEXIST' || cause.code === 'ERR_FS_CP_EEXIST') throw error('E_CONFLICT', 'Recovery never overwrites an existing resource.');
                throw cause;
            }
        }, accountEngineForDirectory(handle, userRoot));
        return manifest;
    });
}
