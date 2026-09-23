import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set(['.json', '.jsonl', '.txt', '.md', '.yaml', '.yml', '.css', '.js']);
const EDITABLE_EXTENSIONS = new Set(['.json', '.jsonl', '.txt', '.md', '.yaml', '.yml']);
const MAX_EDIT_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 1024 * 1024;
const GROUP_CHATS_KEY = '__group_chats__';

const GROUPED_DIRS = Object.freeze({
    images: Object.freeze({
        backgrounds: ['backgrounds'],
        'user-images': ['user/images'],
        'user-avatars': ['User Avatars'],
    }),
    attachments: Object.freeze({
        files: ['user/files'],
        workflows: ['user/workflows'],
    }),
    presets: Object.freeze({
        'api-presets': ['OpenAI Settings', 'NovelAI Settings', 'KoboldAI Settings', 'TextGen Settings'],
        'ui-elements': ['themes', 'movingUI', 'QuickReplies'],
        'instruct-templates': ['instruct', 'context', 'sysprompt', 'reasoning'],
    }),
});

const SIMPLE_DIRS = Object.freeze({
    worlds: 'worlds',
    extensions: 'extensions',
    vectors: 'vectors',
});

const OTHER_ROOTS = new Set([
    'groups',
    'assets',
    'thumbnails',
    'image-metadata.json',
    'stats.json',
    'content.log',
    'secrets.json',
]);

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

function insideRoot(root, candidate) {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(candidate);
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

function ensureInsideRoot(root, candidate) {
    if (!insideRoot(root, candidate)) {
        throw error('E_INVALID_PATH', 'Resolved storage path escapes the user root.');
    }
    return path.resolve(candidate);
}

function matchesSettingsBackup(name) {
    return /^settings_.+\.json$/i.test(name);
}

function matchesChatBackup(name) {
    return /^chat_.+\.jsonl$/i.test(name);
}

function isStorageDatabaseName(name) {
    return /^atria-storage\.sqlite(?:-(?:wal|shm))?$/i.test(name)
        || /\.sqlite(?:-(?:wal|shm))?$/i.test(name);
}

function isProtectedRelativePath(relPath) {
    const normalized = relPath.split(path.sep).join('/');
    const base = path.basename(normalized);
    return normalized === 'secrets.json'
        || isStorageDatabaseName(base)
        || base === '_engine_dump.bin'
        || base === '_engine_meta.json';
}

function findUniqueExisting(root, dirs, name) {
    const matches = [];
    for (const rel of dirs) {
        const candidate = ensureInsideRoot(root, path.join(root, rel, name));
        if (fs.existsSync(candidate)) matches.push(candidate);
    }
    if (matches.length === 0) {
        // Preserve a deterministic path for metadata/read 404 handling.
        return ensureInsideRoot(root, path.join(root, dirs[0], name));
    }
    if (matches.length > 1) {
        throw error('E_AMBIGUOUS_PATH', `Storage resource name is ambiguous across ${dirs.length} directories: ${name}`);
    }
    return matches[0];
}

/**
 * Resolve an Inspector UI path + entry kind into a physical user resource.
 * This is intentionally narrower than a general file browser: every mapping
 * corresponds to an entry already exposed by Storage Inspector.
 */
export function resolveStorageResource(userRoot, pathArr, kind = '') {
    if (!Array.isArray(pathArr) || pathArr.length < 2) {
        throw error('E_INVALID_PATH', 'A storage resource path must include a category and resource.');
    }
    const clean = pathArr.map(assertSegment);
    const [category, ...rest] = clean;
    let absolutePath;

    if (category === 'backups') {
        if (rest.length !== 2) throw error('E_INVALID_PATH', 'Backup resource path must be [backups, type, file].');
        const [bucket, name] = rest;
        if (bucket === 'chat-backups' && !matchesChatBackup(name)) throw error('E_INVALID_PATH', 'Not a generated chat backup.');
        if (bucket === 'settings-backups' && !matchesSettingsBackup(name)) throw error('E_INVALID_PATH', 'Not a generated settings backup.');
        if (!['chat-backups', 'settings-backups'].includes(bucket)) throw error('E_INVALID_PATH', 'Unknown backup bucket.');
        absolutePath = path.join(userRoot, 'backups', name);
    } else if (category === 'chats') {
        if (rest.length < 2 || rest.length > 3) throw error('E_INVALID_PATH', 'Chat resource path depth is invalid.');
        const [ownerKey, chatFile, leaf] = rest;
        const dir = ownerKey === GROUP_CHATS_KEY ? 'group chats' : path.join('chats', ownerKey);
        if (!chatFile.endsWith('.jsonl')) throw error('E_INVALID_PATH', 'Chat resource must identify a .jsonl chat.');
        if (!leaf || leaf === '__metadata__' || leaf === '__messages__') {
            absolutePath = path.join(userRoot, dir, chatFile);
        } else {
            absolutePath = path.join(userRoot, dir, leaf);
        }
    } else if (category === 'characters') {
        if (rest.length !== 2) throw error('E_INVALID_PATH', 'Character resource path must include character and leaf.');
        const [characterKey, leaf] = rest;
        if (leaf === '__sprites__') absolutePath = path.join(userRoot, 'characters', characterKey);
        else absolutePath = path.join(userRoot, 'characters', leaf);
    } else if (Object.hasOwn(SIMPLE_DIRS, category)) {
        if (rest.length !== 1) throw error('E_INVALID_PATH', `${category} resource path depth is invalid.`);
        absolutePath = path.join(userRoot, SIMPLE_DIRS[category], rest[0]);
    } else if (category === 'presets' && rest[0] === 'main-settings') {
        if (rest.length !== 2) throw error('E_INVALID_PATH', 'Main settings resource path depth is invalid.');
        absolutePath = path.join(userRoot, rest[1]);
    } else if (Object.hasOwn(GROUPED_DIRS, category)) {
        if (rest.length !== 2) throw error('E_INVALID_PATH', `${category} resource path depth is invalid.`);
        const [bucket, name] = rest;
        const dirs = GROUPED_DIRS[category][bucket];
        if (!dirs) throw error('E_INVALID_PATH', `Unknown ${category} bucket: ${bucket}`);
        absolutePath = findUniqueExisting(userRoot, dirs, name);
    } else if (category === 'other') {
        if (rest.length !== 1) throw error('E_INVALID_PATH', 'Other resource path depth is invalid.');
        const name = rest[0];
        if (!OTHER_ROOTS.has(name) && !isStorageDatabaseName(name)) {
            throw error('E_INVALID_PATH', `Unknown top-level resource: ${name}`);
        }
        absolutePath = path.join(userRoot, name);
    } else {
        throw error('E_INVALID_PATH', `Unsupported storage resource category: ${category}`);
    }

    absolutePath = ensureInsideRoot(userRoot, absolutePath);
    const relativePath = path.relative(path.resolve(userRoot), absolutePath);
    const protectedResource = isProtectedRelativePath(relativePath);
    const stat = fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : null;
    const extension = stat?.isFile() ? path.extname(absolutePath).toLowerCase() : '';
    const isText = Boolean(stat?.isFile() && TEXT_EXTENSIONS.has(extension));
    const isEditable = Boolean(
        stat?.isFile()
        && EDITABLE_EXTENSIONS.has(extension)
        && stat.size <= MAX_EDIT_BYTES
        && !protectedResource
        && kind !== 'chat-metadata'
        && kind !== 'chat-messages',
    );

    // High-level identity resources are deliberately not deletable through
    // the generic manager. Their domain workflows own cascades/references.
    const identityProtected = ['character-card', 'character-group'].includes(kind)
        || relativePath === 'settings.json';
    const canDelete = Boolean(stat && !protectedResource && !identityProtected
        && kind !== 'chat-metadata' && kind !== 'chat-messages');

    return {
        absolutePath,
        relativePath,
        kind,
        exists: Boolean(stat),
        isDirectory: Boolean(stat?.isDirectory()),
        sizeBytes: Number(stat?.size || 0),
        modifiedMs: stat?.mtimeMs ?? null,
        capabilities: {
            view: Boolean(stat),
            viewContent: isText && !protectedResource,
            edit: isEditable,
            delete: canDelete,
            download: Boolean(stat?.isFile() && !protectedResource),
            restore: !protectedResource,
        },
        protected: protectedResource,
    };
}

function validateTextContent(extension, content) {
    if (extension === '.json') {
        try {
            JSON.parse(content);
        } catch (cause) {
            throw error('E_INVALID_CONTENT', `Invalid JSON: ${cause.message}`);
        }
        return;
    }
    if (extension === '.jsonl') {
        const lines = String(content).split(/\r?\n/);
        for (let index = 0; index < lines.length; index++) {
            if (!lines[index].trim()) continue;
            try {
                JSON.parse(lines[index]);
            } catch (cause) {
                throw error('E_INVALID_CONTENT', `Invalid JSONL at line ${index + 1}: ${cause.message}`);
            }
        }
    }
}

export async function readStorageResource(resource) {
    if (!resource?.exists) throw error('E_NOT_FOUND', 'Storage resource does not exist.');
    const stat = await fs.promises.stat(resource.absolutePath);
    const response = {
        ...resource,
        sizeBytes: stat.size,
        modifiedMs: stat.mtimeMs,
        content: null,
        truncated: false,
    };
    if (!resource.capabilities.viewContent || !stat.isFile()) return response;

    const length = Math.min(stat.size, MAX_PREVIEW_BYTES);
    const handle = await fs.promises.open(resource.absolutePath, 'r');
    try {
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, 0);
        response.content = buffer.toString('utf8');
        response.truncated = stat.size > MAX_PREVIEW_BYTES;
    } finally {
        await handle.close();
    }
    return response;
}

function recoveryId() {
    return `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
}

export async function createStorageRecoveryPoint({ recoveryRoot, handle, resource, action }) {
    if (!recoveryRoot || !handle || !resource?.absolutePath || !resource.exists) {
        throw error('E_RECOVERY_INVALID', 'Recovery point requires an existing resource.');
    }
    const id = recoveryId();
    const root = path.join(recoveryRoot, handle, id);
    const payloadPath = path.join(root, 'payload');
    await fs.promises.mkdir(root, { recursive: true });
    const stat = await fs.promises.stat(resource.absolutePath);
    if (stat.isDirectory()) {
        await fs.promises.cp(resource.absolutePath, payloadPath, { recursive: true });
    } else {
        await fs.promises.copyFile(resource.absolutePath, payloadPath);
    }
    const manifest = {
        id,
        handle,
        action,
        relativePath: resource.relativePath,
        kind: resource.kind,
        isDirectory: stat.isDirectory(),
        createdAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return manifest;
}

export async function writeStorageResource({ resource, content, recoveryRoot, handle, expectedModifiedMs = null }) {
    if (!resource?.capabilities?.edit) throw error('E_READ_ONLY', 'This storage resource is not editable.');
    const stat = await fs.promises.stat(resource.absolutePath).catch(() => null);
    if (!stat?.isFile()) throw error('E_NOT_FOUND', 'Editable storage resource does not exist.');
    if (expectedModifiedMs != null && Math.abs(Number(expectedModifiedMs) - stat.mtimeMs) > 1) {
        throw error('E_CONFLICT', 'Storage resource changed since it was opened. Refresh before saving.');
    }
    const text = String(content ?? '');
    if (Buffer.byteLength(text, 'utf8') > MAX_EDIT_BYTES) {
        throw error('E_TOO_LARGE', `Edited content exceeds ${MAX_EDIT_BYTES} bytes.`);
    }
    validateTextContent(path.extname(resource.absolutePath).toLowerCase(), text);
    const recovery = await createStorageRecoveryPoint({ recoveryRoot, handle, resource, action: 'edit' });
    const temp = `${resource.absolutePath}.atria-edit-${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
        await fs.promises.writeFile(temp, text, 'utf8');
        // Re-read and validate bytes before the atomic rename.
        const persisted = await fs.promises.readFile(temp, 'utf8');
        validateTextContent(path.extname(resource.absolutePath).toLowerCase(), persisted);
        await fs.promises.rename(temp, resource.absolutePath);
    } catch (cause) {
        await fs.promises.rm(temp, { force: true }).catch(() => {});
        throw cause;
    }
    return { recovery };
}

export async function deleteStorageResource({ resource, recoveryRoot, handle }) {
    if (!resource?.capabilities?.delete) throw error('E_READ_ONLY', 'This storage resource cannot be deleted here.');
    const recovery = await createStorageRecoveryPoint({ recoveryRoot, handle, resource, action: 'delete' });
    await fs.promises.rm(resource.absolutePath, {
        recursive: resource.isDirectory,
        force: false,
    });
    return { recovery };
}

export async function listStorageRecoveryPoints(recoveryRoot, handle, limit = 25) {
    const root = path.join(recoveryRoot, handle);
    let ids = [];
    try { ids = await fs.promises.readdir(root); } catch { return []; }
    const manifests = [];
    for (const id of ids.sort().reverse().slice(0, Math.max(1, Math.min(100, Number(limit) || 25)))) {
        try {
            const raw = await fs.promises.readFile(path.join(root, id, 'manifest.json'), 'utf8');
            manifests.push(JSON.parse(raw));
        } catch { /* ignore incomplete recovery entries */ }
    }
    return manifests;
}

export async function restoreStorageRecoveryPoint({ recoveryRoot, handle, userRoot, id }) {
    assertSegment(id);
    const root = path.join(recoveryRoot, handle, id);
    const manifest = JSON.parse(await fs.promises.readFile(path.join(root, 'manifest.json'), 'utf8'));
    if (manifest.handle !== handle) throw error('E_RECOVERY_INVALID', 'Recovery point handle mismatch.');
    const target = ensureInsideRoot(userRoot, path.join(userRoot, manifest.relativePath));
    const payload = path.join(root, 'payload');
    await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {});
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (manifest.isDirectory) {
        await fs.promises.cp(payload, target, { recursive: true });
    } else {
        await fs.promises.copyFile(payload, target);
    }
    return manifest;
}

export const storageResourceLimits = Object.freeze({
    maxEditBytes: MAX_EDIT_BYTES,
    maxPreviewBytes: MAX_PREVIEW_BYTES,
});
