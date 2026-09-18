import fs from 'node:fs';
import path from 'node:path';

import { getConfigValue } from './util.js';
import { getAllUserHandles, getUserDirectories } from './users.js';

const DEFAULT_MAX_PER_ENTITY = 20;
const DEFAULT_MAX_TOTAL_BACKUPS = 500;
const DEFAULT_MAX_TOTAL_SIZE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;
const MIN_CLEANUP_INTERVAL_MS = 10_000;
const BACKUP_TIMESTAMP_MARKER = /_\d{8}-\d{6}$/;
const BACKUP_RETENTION_SETTINGS_FILE = 'backup-retention.json';
const POLICY_KEYS = Object.freeze([
    'enabled',
    'maxPerEntity',
    'maxTotalBackups',
    'maxTotalSizeBytes',
]);
export const BACKUP_RETENTION_TYPES = Object.freeze(['chat', 'settings']);

let schedulerStarted = false;

function normalizeLimit(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function normalizePersistedLimit(value, key) {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < -1) {
        throw new TypeError(`${key} must be an integer greater than or equal to -1.`);
    }
    return numeric;
}

function isUnlimited(limit) {
    return limit < 0;
}

function getRetentionSettingsPath(userDirectories) {
    return userDirectories?.root
        ? path.join(userDirectories.root, BACKUP_RETENTION_SETTINGS_FILE)
        : null;
}

function configKeyFor(type, key) {
    return `backups.retention.${type}.${key}`;
}

function readPolicyDefaults(type) {
    const sharedEnabled = !!getConfigValue('backups.retention.enabled', true, 'boolean');
    const sharedMaxPerEntity = normalizeLimit(
        getConfigValue('backups.retention.maxPerEntity', DEFAULT_MAX_PER_ENTITY, 'number'),
        DEFAULT_MAX_PER_ENTITY,
    );
    const sharedMaxTotalBackups = normalizeLimit(
        getConfigValue('backups.retention.maxTotalBackups', DEFAULT_MAX_TOTAL_BACKUPS, 'number'),
        DEFAULT_MAX_TOTAL_BACKUPS,
    );
    const sharedMaxTotalSizeBytes = normalizeLimit(
        getConfigValue('backups.retention.maxTotalSizeBytes', DEFAULT_MAX_TOTAL_SIZE_BYTES, 'number'),
        DEFAULT_MAX_TOTAL_SIZE_BYTES,
    );

    return {
        enabled: !!getConfigValue(configKeyFor(type, 'enabled'), sharedEnabled, 'boolean'),
        maxPerEntity: normalizeLimit(
            getConfigValue(configKeyFor(type, 'maxPerEntity'), sharedMaxPerEntity, 'number'),
            sharedMaxPerEntity,
        ),
        maxTotalBackups: normalizeLimit(
            getConfigValue(configKeyFor(type, 'maxTotalBackups'), sharedMaxTotalBackups, 'number'),
            sharedMaxTotalBackups,
        ),
        maxTotalSizeBytes: normalizeLimit(
            getConfigValue(configKeyFor(type, 'maxTotalSizeBytes'), sharedMaxTotalSizeBytes, 'number'),
            sharedMaxTotalSizeBytes,
        ),
    };
}

/**
 * Returns server-level defaults split by managed backup class.
 *
 * The historic shared `backups.retention.*` config remains a server-level
 * fallback so existing config.yaml files keep their intent. New installations
 * can override either class under `backups.retention.chat.*` or
 * `backups.retention.settings.*`.
 */
export function getDefaultBackupRetentionConfig() {
    return {
        chat: readPolicyDefaults('chat'),
        settings: readPolicyDefaults('settings'),
        cleanupIntervalMs: Math.max(
            MIN_CLEANUP_INTERVAL_MS,
            normalizeLimit(
                getConfigValue('backups.retention.cleanupIntervalMs', DEFAULT_CLEANUP_INTERVAL_MS, 'number'),
                DEFAULT_CLEANUP_INTERVAL_MS,
            ),
        ),
    };
}

function normalizeSavedPolicy(input, keyPrefix) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError(`${keyPrefix} retention settings must be an object.`);
    }
    if (typeof input.enabled !== 'boolean') {
        throw new TypeError(`${keyPrefix}.enabled must be a boolean.`);
    }
    return {
        enabled: input.enabled,
        maxPerEntity: normalizePersistedLimit(input.maxPerEntity, `${keyPrefix}.maxPerEntity`),
        maxTotalBackups: normalizePersistedLimit(input.maxTotalBackups, `${keyPrefix}.maxTotalBackups`),
        maxTotalSizeBytes: normalizePersistedLimit(input.maxTotalSizeBytes, `${keyPrefix}.maxTotalSizeBytes`),
    };
}

function mergePolicy(base, input) {
    const out = { ...base };
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return out;
    }
    if (typeof input.enabled === 'boolean') {
        out.enabled = input.enabled;
    }
    for (const key of ['maxPerEntity', 'maxTotalBackups', 'maxTotalSizeBytes']) {
        if (!Object.hasOwn(input, key)) continue;
        const value = Number(input[key]);
        if (Number.isSafeInteger(value) && value >= -1) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * Returns the effective per-user split retention configuration.
 *
 * Older flat per-user files are read as a one-time compatibility input and
 * applied to both classes. The next save writes only the split shape.
 */
export function getBackupRetentionConfig(userDirectories = undefined) {
    const defaults = getDefaultBackupRetentionConfig();
    const settingsPath = getRetentionSettingsPath(userDirectories);
    if (!settingsPath || !fs.existsSync(settingsPath)) {
        return defaults;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return defaults;
        }

        const hasSplitShape = parsed.chat && typeof parsed.chat === 'object'
            || parsed.settings && typeof parsed.settings === 'object';
        if (hasSplitShape) {
            return {
                chat: mergePolicy(defaults.chat, parsed.chat),
                settings: mergePolicy(defaults.settings, parsed.settings),
                cleanupIntervalMs: defaults.cleanupIntervalMs,
            };
        }

        // Historic flat override: preserve the user's existing limits until
        // they save the new split form.
        return {
            chat: mergePolicy(defaults.chat, parsed),
            settings: mergePolicy(defaults.settings, parsed),
            cleanupIntervalMs: defaults.cleanupIntervalMs,
        };
    } catch (error) {
        console.warn(`Could not read backup retention settings from ${settingsPath}:`, error?.message || error);
        return defaults;
    }
}

export function hasBackupRetentionOverride(userDirectories) {
    const settingsPath = getRetentionSettingsPath(userDirectories);
    return Boolean(settingsPath && fs.existsSync(settingsPath));
}

export function saveBackupRetentionConfig(userDirectories, input) {
    if (!userDirectories?.root) {
        throw new TypeError('User root directory is required.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Backup retention settings must be an object.');
    }

    const persisted = {
        version: 2,
        chat: normalizeSavedPolicy(input.chat, 'chat'),
        settings: normalizeSavedPolicy(input.settings, 'settings'),
    };

    fs.mkdirSync(userDirectories.root, { recursive: true });
    const settingsPath = getRetentionSettingsPath(userDirectories);
    const tempPath = `${settingsPath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(persisted, null, 4)}\n`, 'utf8');
    fs.renameSync(tempPath, settingsPath);

    return getBackupRetentionConfig(userDirectories);
}

export function resetBackupRetentionConfig(userDirectories) {
    const settingsPath = getRetentionSettingsPath(userDirectories);
    if (settingsPath) {
        fs.rmSync(settingsPath, { force: true });
        fs.rmSync(`${settingsPath}.tmp`, { force: true });
    }
    return getBackupRetentionConfig(userDirectories);
}

/**
 * Maps a managed backup filename to the logical entity it belongs to.
 */
export function getBackupEntityKey(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    const isManagedType = extension === '.json' || extension === '.jsonl';
    const isManagedPrefix = fileName.startsWith('chat_') || fileName.startsWith('settings_');
    if (!isManagedType || !isManagedPrefix) {
        return null;
    }

    const stem = fileName.slice(0, -extension.length);
    const match = BACKUP_TIMESTAMP_MARKER.exec(stem);
    if (!match || match.index <= 0) {
        return null;
    }

    return stem.slice(0, match.index);
}

export function getBackupType(fileName) {
    if (fileName.startsWith('chat_') && path.extname(fileName).toLowerCase() === '.jsonl') {
        return 'chat';
    }
    if (fileName.startsWith('settings_') && path.extname(fileName).toLowerCase() === '.json') {
        return 'settings';
    }
    return null;
}

export function listManagedBackupRecords(directory, type = undefined) {
    if (!directory || !fs.existsSync(directory)) {
        return [];
    }
    if (type !== undefined && !BACKUP_RETENTION_TYPES.includes(type)) {
        throw new TypeError(`Unknown backup type: ${type}`);
    }

    const records = [];
    for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!dirent.isFile()) continue;

        const backupType = getBackupType(dirent.name);
        const entityKey = getBackupEntityKey(dirent.name);
        if (!backupType || !entityKey || (type && backupType !== type)) {
            continue;
        }

        const filePath = path.join(directory, dirent.name);
        try {
            const stat = fs.statSync(filePath);
            records.push({
                name: dirent.name,
                path: filePath,
                type: backupType,
                entityKey,
                modifiedMs: stat.mtimeMs,
                size: stat.size,
            });
        } catch (error) {
            console.warn(`Could not inspect backup file ${filePath}:`, error?.message || error);
        }
    }

    return records;
}

function usageFor(records) {
    return {
        count: records.length,
        bytes: records.reduce((sum, record) => sum + record.size, 0),
    };
}

export function getBackupDirectoryUsage(directory) {
    const records = listManagedBackupRecords(directory);
    const chatRecords = records.filter(record => record.type === 'chat');
    const settingsRecords = records.filter(record => record.type === 'settings');
    const chat = usageFor(chatRecords);
    const settings = usageFor(settingsRecords);
    return {
        scanned: records.length,
        remaining: records.length,
        remainingBytes: chat.bytes + settings.bytes,
        chatBackups: chat.count,
        settingsBackups: settings.count,
        chat,
        settings,
    };
}

export function pruneBackupType(directory, type, policy) {
    if (!BACKUP_RETENTION_TYPES.includes(type)) {
        throw new TypeError(`Unknown backup type: ${type}`);
    }
    const effectivePolicy = policy ?? getDefaultBackupRetentionConfig()[type];
    const records = listManagedBackupRecords(directory, type);

    if (!(effectivePolicy.enabled ?? true) || records.length === 0) {
        return {
            type,
            scanned: records.length,
            deleted: 0,
            remaining: records.length,
            remainingBytes: records.reduce((sum, record) => sum + record.size, 0),
            deletedFiles: [],
        };
    }

    const maxPerEntity = normalizeLimit(effectivePolicy.maxPerEntity, DEFAULT_MAX_PER_ENTITY);
    const maxTotalBackups = normalizeLimit(effectivePolicy.maxTotalBackups, DEFAULT_MAX_TOTAL_BACKUPS);
    const maxTotalSizeBytes = normalizeLimit(effectivePolicy.maxTotalSizeBytes, DEFAULT_MAX_TOTAL_SIZE_BYTES);
    const deletionSet = new Set();

    if (!isUnlimited(maxPerEntity)) {
        const grouped = new Map();
        for (const record of records) {
            const group = grouped.get(record.entityKey) ?? [];
            group.push(record);
            grouped.set(record.entityKey, group);
        }
        for (const group of grouped.values()) {
            group.sort((a, b) => b.modifiedMs - a.modifiedMs || b.name.localeCompare(a.name));
            for (const record of group.slice(Math.max(0, maxPerEntity))) {
                deletionSet.add(record.path);
            }
        }
    }

    let remaining = records.filter(record => !deletionSet.has(record.path));
    remaining.sort((a, b) => a.modifiedMs - b.modifiedMs || a.name.localeCompare(b.name));
    let remainingBytes = remaining.reduce((sum, record) => sum + record.size, 0);

    while (
        remaining.length > 0
        && (
            (!isUnlimited(maxTotalBackups) && remaining.length > maxTotalBackups)
            || (!isUnlimited(maxTotalSizeBytes) && remainingBytes > maxTotalSizeBytes)
        )
    ) {
        const oldest = remaining.shift();
        deletionSet.add(oldest.path);
        remainingBytes -= oldest.size;
    }

    const deletedFiles = [];
    for (const filePath of deletionSet) {
        try {
            fs.unlinkSync(filePath);
            deletedFiles.push(path.basename(filePath));
        } catch (error) {
            console.warn(`Could not delete old backup ${filePath}:`, error?.message || error);
        }
    }

    const survivingRecords = listManagedBackupRecords(directory, type);
    return {
        type,
        scanned: records.length,
        deleted: deletedFiles.length,
        remaining: survivingRecords.length,
        remainingBytes: survivingRecords.reduce((sum, record) => sum + record.size, 0),
        deletedFiles,
    };
}

/**
 * Applies chat and settings retention independently.
 */
export function pruneBackupDirectory(directory, config = undefined) {
    const effective = config ?? getDefaultBackupRetentionConfig();
    const chat = pruneBackupType(directory, 'chat', effective.chat);
    const settings = pruneBackupType(directory, 'settings', effective.settings);
    return {
        scanned: chat.scanned + settings.scanned,
        deleted: chat.deleted + settings.deleted,
        remaining: chat.remaining + settings.remaining,
        remainingBytes: chat.remainingBytes + settings.remainingBytes,
        deletedFiles: [...chat.deletedFiles, ...settings.deletedFiles],
        chat,
        settings,
    };
}

export async function pruneAllUserBackups() {
    const handles = await getAllUserHandles();
    for (const handle of handles) {
        try {
            const directories = getUserDirectories(handle);
            const config = getBackupRetentionConfig(directories);
            const result = pruneBackupDirectory(directories.backups, config);
            if (result.deleted > 0) {
                console.info(`[Backup retention] ${handle}: removed ${result.deleted} old backup(s); chat=${result.chat.remaining}, settings=${result.settings.remaining}.`);
            }
        } catch (error) {
            console.warn(`[Backup retention] Failed for ${handle}:`, error?.message || error);
        }
    }
}

export function startBackupRetentionScheduler() {
    if (schedulerStarted) return;
    schedulerStarted = true;

    const config = getDefaultBackupRetentionConfig();
    const runCleanup = () => {
        void pruneAllUserBackups().catch((error) => {
            console.warn('[Backup retention] Cleanup failed:', error?.message || error);
        });
    };

    const initialTimer = setTimeout(runCleanup, 5_000);
    initialTimer.unref?.();

    const intervalTimer = setInterval(runCleanup, config.cleanupIntervalMs);
    intervalTimer.unref?.();
}

export const backupRetentionPolicyKeys = POLICY_KEYS;
