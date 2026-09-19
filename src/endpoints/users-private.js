import dns from 'node:dns/promises';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import storage from 'node-persist';
import express from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { getIpAddress, retryAfter } from '../express-common.js';
import ipaddr from 'ipaddr.js';
import yauzl from 'yauzl';

import { getUserAvatar, toKey, getPasswordHash, getPasswordSalt, createBackupArchive, ensurePublicDirectoriesExist, toAvatarKey, getAccountVersion, getUserDirectories, getUserBackupTargets, normalizeUserBackupSelection } from '../users.js';
import { SETTINGS_FILE, PUBLIC_DIRECTORIES, UPLOADS_DIRECTORY } from '../constants.js';
import { checkForNewContent, CONTENT_TYPES } from './content-manager.js';
import { invalidateRecentChatIndex } from './chats.js';
import { color, Cache, getConfigValue, ensureDirectory, isValidUrl, normalizeZipEntryPath, trimTrailingSlash } from '../util.js';
import { createLanMigrationOffer, LAN_MIGRATION_PATH_PREFIX } from '../lan-migration.js';
import { listForUser, mergeReadIds } from '../announcements.js';
import { getStorageEngine, setReadOnly } from '../storage/index.js';
import { ENGINE_META_ENTRY, ENGINE_DUMP_ENTRY } from '../storage/engine-backup-entries.js';
import { crossModeRestore } from '../storage/migration/cross-mode-restore.js';
import { SNAPSHOT_META_ENTRY, snapshotUser, restoreFromSnapshot } from '../storage/migration/backup.js';
import {
    CrossModeScratchCredsRequiredError,
    CrossModeScratchConnectionError,
    CrossModeConversionFailedError,
} from '../storage/migration/cross-mode-errors.js';
import {
    acquireMigrationLock,
    makeHolderId,
    releaseMigrationLock,
    startHeartbeat,
    stopHeartbeat,
} from '../storage/migration/lock.js';
import { resolvePath, StorageInspectorError } from '../storage/inspector.js';
import {
    deleteStorageResource,
    listStorageRecoveryPoints,
    readStorageResource,
    resolveStorageResource,
    restoreStorageRecoveryPoint,
    writeStorageResource,
} from '../storage/management.js';
import { getAdminSettings } from '../admin-settings.js';
import { stageRestoreArchiveForRandomAccess } from '../backup-sync/restore-staging.js';
import { resetGlobalExtensionsRestoreDirectory } from '../backup-sync/restore-targets.js';
import {
    isRestoreCancelledError,
    RestoreCancelledError,
    throwIfRestoreCancelled,
} from '../backup-sync/restore-cancel.js';
import {
    extractZipEntryWithAdmZip,
    isRestoreEntryIdleTimeoutError,
    RestoreEntryAdaptivePolicy,
    streamZipEntryWithIdleTimeout,
} from '../backup-sync/restore-entry-extractor.js';

// Two sentinel filenames the backup ZIP carries when the storage engine isn't
// fs (spec §5.1/§5.2). The meta entry is captured during the analyze pass for
// engine-kind validation; the dump entry is consumed during extract by
// `engine.restoreUser(handle, stream)` instead of being written to disk.
// Defined in src/storage/engine-backup-entries.js so the writer side
// (createBackupArchive, snapshotUser) and the reader side here cannot drift.

/**
 * Thrown when an uploaded backup's engine kind does not match the engine the
 * server is currently running. The route handler converts this into a 400 so
 * the operator sees an actionable message instead of an opaque 500. Migrating
 * a backup across engines requires the explicit storage-migrate tool, not
 * silent restore.
 */
class RestoreEngineKindMismatchError extends Error {
    constructor(backupKind, currentKind) {
        super(`Backup engine kind ${backupKind} does not match current engine ${currentKind}. Run storage-migrate to convert the backup first.`);
        this.name = 'RestoreEngineKindMismatchError';
        this.backupKind = backupKind;
        this.currentKind = currentKind;
    }
}

/**
 * Thrown when an uploaded backup lacks `_engine_meta.json` (a legacy fs-only
 * archive, produced before engine-dump injection existed) but the server
 * is currently running on a db engine (sqlite/mysql/postgres). Silently
 * extracting such a ZIP would unpack the disk tree but leave the engine slot
 * empty — every Repo read returns null, every chat appears deleted.
 * Missing engineMeta on a non-fs server is a 400 with an actionable
 * message: the operator must run `storage-migrate` to convert the legacy
 * backup before restore can proceed.
 */
class RestoreLegacyFsOnDbModeError extends Error {
    constructor(currentKind) {
        super(`Legacy fs-only backup uploaded to ${currentKind}-mode server. Run storage-migrate to convert the backup first.`);
        this.name = 'RestoreLegacyFsOnDbModeError';
        this.currentKind = currentKind;
    }
}

const RESET_POINTS = getConfigValue('rateLimiting.accountsResetMaxAttempts', 5, 'number');
const PREFER_REAL_IP_HEADER = getConfigValue('rateLimiting.preferRealIpHeader', false, 'boolean');
const RESET_CACHE = new Cache(5 * 60 * 1000);
const FULL_IMPORT_SELECTION = Object.freeze({
    ...Object.fromEntries(Object.keys(normalizeUserBackupSelection({})).map((key) => [key, true])),
    globalExtensions: false,
});
const BACKUP_CATEGORY_ORDER = Object.freeze(Object.keys(FULL_IMPORT_SELECTION));
const LAN_MIGRATION_LINK_PATH_PATTERN = /^\/api\/users\/transfer\/backup\/[a-f0-9]{64}$/i;

function sanitizeBackupSelectionForUser(selection, isAdminUser) {
    const normalized = normalizeUserBackupSelection(selection);
    if (!isAdminUser) {
        normalized.globalExtensions = false;
    }
    return normalized;
}

function parseBackupSelectionPayload(payload) {
    if (typeof payload === 'string') {
        try {
            return JSON.parse(payload);
        } catch {
            return {};
        }
    }
    return payload;
}

/**
 * Pull scratch DB connection fields out of a multipart restore request body.
 * Returns null when neither mysqlUrl nor postgresUrl is present, so the
 * cross-mode orchestrator's "creds required" check fires for db-source ZIPs.
 */
function parseScratchCreds(body) {
    if (!body || typeof body !== 'object') return null;
    const mysqlUrl = typeof body.scratchMysqlUrl === 'string' ? body.scratchMysqlUrl.trim() : '';
    const postgresUrl = typeof body.scratchPostgresUrl === 'string' ? body.scratchPostgresUrl.trim() : '';
    const mysqlPoolSize = body.scratchMysqlPoolSize != null && Number.isFinite(Number(body.scratchMysqlPoolSize))
        ? Number(body.scratchMysqlPoolSize) : undefined;
    const postgresPoolSize = body.scratchPostgresPoolSize != null && Number.isFinite(Number(body.scratchPostgresPoolSize))
        ? Number(body.scratchPostgresPoolSize) : undefined;
    if (!mysqlUrl && !postgresUrl) return null;
    const out = {};
    if (mysqlUrl) { out.mysqlUrl = mysqlUrl; if (mysqlPoolSize !== undefined) out.mysqlPoolSize = mysqlPoolSize; }
    if (postgresUrl) { out.postgresUrl = postgresUrl; if (postgresPoolSize !== undefined) out.postgresPoolSize = postgresPoolSize; }
    return out;
}

function getRequestBaseUrl(request) {
    const forwardedProto = request.get('x-forwarded-proto');
    const protocol = forwardedProto || request.protocol || 'http';
    const host = request.get('x-forwarded-host') || request.get('host');
    return `${protocol}://${host}`;
}

function isLanMigrationAddress(address) {
    try {
        let parsed = ipaddr.parse(String(address || '').trim());
        if (parsed.kind() === 'ipv6' && parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
            parsed = parsed.toIPv4Address();
        }

        const range = parsed.range();
        if (parsed.kind() === 'ipv4') {
            return ['private', 'loopback', 'linkLocal'].includes(range);
        }

        return ['uniqueLocal', 'loopback', 'linkLocal'].includes(range);
    } catch {
        return false;
    }
}

async function resolveLanMigrationAddresses(hostname) {
    const value = String(hostname || '').trim();
    const candidate = value.replace(/^\[/, '').replace(/\]$/, '');
    if (!value) {
        return [];
    }

    if (candidate === 'localhost') {
        return ['127.0.0.1', '::1'];
    }

    if (net.isIP(candidate)) {
        return [candidate];
    }

    try {
        const results = await dns.lookup(candidate, { all: true, verbatim: true });
        return [...new Set(results.map(entry => String(entry?.address || '')).filter(Boolean))];
    } catch {
        return [];
    }
}

async function resolveLanMigrationSourceUrl(input) {
    if (!isValidUrl(input)) {
        throw new Error('Migration link is not a valid URL.');
    }

    const url = new URL(String(input).trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Migration link must use http or https.');
    }

    if (url.username || url.password) {
        throw new Error('Migration link cannot include credentials.');
    }

    if (url.search || url.hash) {
        throw new Error('Migration link format is invalid.');
    }

    const normalizedPath = trimTrailingSlash(url.pathname);
    if (!LAN_MIGRATION_LINK_PATH_PATTERN.test(normalizedPath)) {
        throw new Error('Migration link must be a one-time Atria migration link.');
    }

    const addresses = await resolveLanMigrationAddresses(url.hostname);
    if (addresses.length === 0 || !addresses.every(isLanMigrationAddress)) {
        throw new Error('Migration link host must resolve to a LAN or localhost address.');
    }

    url.pathname = normalizedPath;
    return url;
}

async function downloadLanMigrationArchive(sourceUrl, destinationPath) {
    const response = await fetch(sourceUrl, {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        headers: {
            'Accept': 'application/zip, application/octet-stream;q=0.9',
        },
    });

    if (response.status === 404 || response.status === 410) {
        throw new Error('Migration link expired or already used.');
    }

    if (!response.ok || !response.body) {
        throw new Error(`Failed to download migration archive (${response.status}).`);
    }

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destinationPath, { mode: 0o600 }));
}

function normalizeRestoreArchiveEntryPath(entryName) {
    const normalized = normalizeZipEntryPath(entryName);
    if (normalized) {
        return normalized;
    }

    if (typeof entryName !== 'string') {
        return null;
    }

    const raw = entryName.replace(/\\/g, '/').trim();
    if (!raw) {
        return null;
    }

    const posixNormalized = path.posix.normalize(raw).replace(/^\/+/, '');
    const looksLikeLegacyGlobalExtensionsPath =
        posixNormalized.includes('public/scripts/extensions/third-party/') ||
        posixNormalized.includes('scripts/extensions/third-party/') ||
        posixNormalized.includes('extensions/third-party/') ||
        posixNormalized.includes('third-party/');

    if (!looksLikeLegacyGlobalExtensionsPath) {
        return null;
    }

    const stripped = posixNormalized.replace(/^(\.\.\/)+/, '');
    return normalizeZipEntryPath(stripped);
}

function toPosixRelativePath(basePath, targetPath) {
    const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return '';
    }
    return path.posix.normalize(relative.split(path.sep).join('/'));
}

function buildRestoreDirectoryAliases(rootPath, allowedDirectories) {
    const aliases = [];
    const globalExtensionsPath = path.resolve(PUBLIC_DIRECTORIES.globalExtensions);

    for (const directory of allowedDirectories) {
        const resolvedDirectory = path.resolve(directory);
        const fromRoot = toPosixRelativePath(rootPath, resolvedDirectory);
        if (fromRoot) {
            aliases.push({ prefix: fromRoot, directory: resolvedDirectory });
        }

        const fromCwd = toPosixRelativePath(process.cwd(), resolvedDirectory);
        if (fromCwd) {
            aliases.push({ prefix: fromCwd, directory: resolvedDirectory });
        }

        if (resolvedDirectory === globalExtensionsPath) {
            aliases.push({ prefix: 'public/scripts/extensions/third-party', directory: resolvedDirectory });
            aliases.push({ prefix: 'scripts/extensions/third-party', directory: resolvedDirectory });
            aliases.push({ prefix: 'extensions/third-party', directory: resolvedDirectory });
            aliases.push({ prefix: 'third-party', directory: resolvedDirectory });
        }
    }

    const deduplicated = new Map();
    for (const alias of aliases) {
        if (!alias.prefix) {
            continue;
        }

        const key = `${alias.directory}::${alias.prefix}`;
        if (!deduplicated.has(key)) {
            deduplicated.set(key, alias);
        }
    }

    return [...deduplicated.values()];
}

function resolveAllowedRestorePath(normalizedEntryPath, rootPath, allowedFiles, allowedDirectories, directoryAliases = []) {
    const parts = normalizedEntryPath.split('/').filter(Boolean);
    const candidates = [];

    for (let index = 0; index < parts.length; index++) {
        const candidate = parts.slice(index).join('/');
        if (candidate) {
            candidates.push(candidate);
        }
    }

    for (const candidate of candidates) {
        if (!candidate || candidate === 'manifest.json') {
            continue;
        }

        const resolved = path.resolve(path.join(rootPath, candidate));

        if (allowedFiles.has(resolved)) {
            return resolved;
        }

        for (const directory of allowedDirectories) {
            if (resolved.startsWith(directory + path.sep)) {
                return resolved;
            }
        }

        for (const alias of directoryAliases) {
            if (!candidate.startsWith(`${alias.prefix}/`)) {
                continue;
            }

            const suffix = candidate.slice(alias.prefix.length + 1);
            if (!suffix) {
                continue;
            }

            const mappedPath = path.resolve(path.join(alias.directory, suffix));
            if (mappedPath.startsWith(alias.directory + path.sep)) {
                return mappedPath;
            }
        }
    }

    return '';
}

function addRestoreReportSample(report, entry, reason) {
    if (!entry || !reason) {
        return;
    }

    if (!Array.isArray(report.sampleSkippedEntries)) {
        report.sampleSkippedEntries = [];
    }

    if (report.sampleSkippedEntries.length >= 30) {
        return;
    }

    report.sampleSkippedEntries.push({ entry, reason });
}

function buildRestoreCategoryTargets(directories, selection, options = {}) {
    const categories = [];
    for (const category of BACKUP_CATEGORY_ORDER) {
        if (!selection[category]) {
            continue;
        }

        const categorySelection = Object.fromEntries(BACKUP_CATEGORY_ORDER.map((key) => [key, key === category]));
        const categoryTargets = getUserBackupTargets(directories, categorySelection, options);
        categories.push({
            name: category,
            files: new Set(categoryTargets.files.map(file => path.resolve(file))),
            directories: categoryTargets.directories.map(directory => path.resolve(directory)),
        });
    }
    return categories;
}

function resolveRestoreCategoryByTargetPath(targetPath, categoryTargets) {
    for (const category of categoryTargets) {
        if (category.files.has(targetPath)) {
            return category.name;
        }

        for (const directory of category.directories) {
            if (targetPath.startsWith(directory + path.sep)) {
                return category.name;
            }
        }
    }

    return '';
}

async function analyzeRestoreArchive(uploadPath, targetRoot, targetFiles, targetDirectories, categoryTargets, onProgress = null) {
    /** @type {Map<string, { targetPath: string, category: string }>} */
    const targetByNormalizedEntry = new Map();
    const categoryStats = Object.fromEntries(
        categoryTargets.map((category) => [
            category.name,
            { targetableEntries: 0, restoredEntries: 0, failedEntries: 0 },
        ]),
    );
    const report = {
        totalEntries: 0,
        fileEntries: 0,
        directoryEntries: 0,
        targetableEntries: 0,
        skippedEntries: 0,
        rejectedEntries: 0,
        engineDumpEntries: 0, // _engine_dump.bin entries — consumed by engine.restoreUser, not written to disk.
        categoryStats,
        sampleSkippedEntries: [],
    };
    /** @type {object|null} Parsed contents of `_engine_meta.json`, or null if the archive has no engine dump. */
    let engineMeta = null;
    const directoryAliases = buildRestoreDirectoryAliases(targetRoot, targetDirectories);
    const reportAnalyzeProgress = typeof onProgress === 'function'
        ? (entryCount) => {
            try { onProgress({ phase: 'analyze', current: report.totalEntries, total: entryCount }); } catch { /* sink errors ignored */ }
        }
        : () => {};

    await new Promise((resolve, reject) => {
        yauzl.open(uploadPath, { lazyEntries: true, decodeStrings: true }, (openError, zipfile) => {
            if (openError) {
                reject(openError);
                return;
            }

            const entryCount = typeof zipfile.entryCount === 'number' ? zipfile.entryCount : 0;
            reportAnalyzeProgress(entryCount);

            let finished = false;
            const finish = (error) => {
                if (finished) {
                    return;
                }
                finished = true;
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };

            zipfile.readEntry();

            let lastProgressAt = 0;
            zipfile.on('entry', (entry) => {
                try {
                    report.totalEntries += 1;

                    // Engine sentinel entries (spec §5.1) — case-sensitive
                    // match on the raw name. They live at the archive root,
                    // bypass the per-category target classifier, and are
                    // accounted for as their own bookkeeping kind so the
                    // operator-facing "X targetable / Y skipped" totals stay
                    // honest. _engine_meta.json is read into a buffer now so
                    // the engine-kind check can happen before any snapshot
                    // is taken; _engine_dump.bin is left for the extract
                    // pass to pipe into engine.restoreUser.
                    if (entry.fileName === ENGINE_META_ENTRY) {
                        zipfile.openReadStream(entry, (streamErr, readStream) => {
                            if (streamErr) {
                                finish(streamErr);
                                return;
                            }
                            const chunks = [];
                            readStream.on('data', (chunk) => chunks.push(chunk));
                            readStream.on('error', finish);
                            readStream.on('end', () => {
                                try {
                                    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                                    engineMeta = parsed;
                                    zipfile.readEntry();
                                } catch (parseErr) {
                                    finish(new Error(`Invalid ${ENGINE_META_ENTRY} in backup: ${parseErr.message}`));
                                }
                            });
                        });
                        return;
                    }
                    if (entry.fileName === ENGINE_DUMP_ENTRY) {
                        report.engineDumpEntries += 1;
                        zipfile.readEntry();
                        return;
                    }

                    const normalized = normalizeRestoreArchiveEntryPath(entry.fileName);
                    if (!normalized) {
                        report.rejectedEntries += 1;
                        addRestoreReportSample(report, String(entry.fileName || ''), 'invalid_path');
                        zipfile.readEntry();
                        return;
                    }

                    if (entry.fileName.endsWith('/')) {
                        report.directoryEntries += 1;
                        zipfile.readEntry();
                        return;
                    }

                    const unixFileType = (entry.externalFileAttributes >> 16) & 0o170000;
                    if (unixFileType === 0o120000) {
                        report.rejectedEntries += 1;
                        addRestoreReportSample(report, normalized, 'symlink_rejected');
                        zipfile.readEntry();
                        return;
                    }

                    report.fileEntries += 1;
                    const targetPath = resolveAllowedRestorePath(normalized, targetRoot, targetFiles, targetDirectories, directoryAliases);
                    if (!targetPath) {
                        report.skippedEntries += 1;
                        addRestoreReportSample(report, normalized, 'path_not_in_selected_categories');
                        zipfile.readEntry();
                        return;
                    }

                    const category = resolveRestoreCategoryByTargetPath(targetPath, categoryTargets);
                    targetByNormalizedEntry.set(normalized, { targetPath, category });
                    report.targetableEntries += 1;
                    if (category && report.categoryStats[category]) {
                        report.categoryStats[category].targetableEntries += 1;
                    }
                    const now = Date.now();
                    if (now - lastProgressAt >= 200) {
                        lastProgressAt = now;
                        reportAnalyzeProgress(entryCount);
                    }
                    zipfile.readEntry();
                } catch (error) {
                    finish(error);
                }
            });

            zipfile.on('end', () => {
                reportAnalyzeProgress(entryCount);
                finish();
            });
            zipfile.on('close', () => finish());
            zipfile.on('error', finish);
        });
    });

    return { targetByNormalizedEntry, report, engineMeta };
}

const RESTORE_RECOVERY_DIR = '_restore-recovery';
const activeRestoreControllers = new Map();

async function createRestoreRecoveryPoint(handle, directories, engine, onProgress = null, metadata = {}) {
    const backupRoot = path.join(globalThis.DATA_ROOT, RESTORE_RECOVERY_DIR);
    ensureDirectory(backupRoot);
    try { onProgress?.({ phase: 'snapshot', current: 0, total: 1 }); } catch { /* observer */ }
    const backupPath = await snapshotUser({
        handle,
        userRoot: directories.root,
        backupRoot,
        engine,
        metadata: {
            purpose: 'backup-restore',
            engineKind: engine.kind,
            ...metadata,
        },
    });
    try { onProgress?.({ phase: 'snapshot', current: 1, total: 1 }); } catch { /* observer */ }
    return backupPath;
}

async function rollbackRestoreRecoveryPoint(handle, directories, engine, recoveryPath) {
    await restoreFromSnapshot({
        handle,
        userRoot: directories.root,
        backupPath: recoveryPath,
        engine,
    });
}

async function restoreUserBackupArchive(uploadPath, directories, selection, mode, options = {}) {
    const restoreStart = Date.now();
    const signal = options.signal || null;
    throwIfRestoreCancelled(signal);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const reportProgress = (event) => {
        if (!onProgress) {
            return;
        }
        try {
            onProgress(event);
        } catch { /* progress sink errors must not break restore */ }
    };

    let uploadSize = 0;
    try {
        uploadSize = (await fsPromises.stat(uploadPath)).size;
    } catch { /* stat is informational; ignore */ }
    // Derive the engine handle from directories.root once — engine.restoreUser
    // needs it to pick the right per-user DB / schema when consuming the
    // _engine_dump.bin entry. Matches the path the route handler uses to
    // resolve the same directories (see /restore-backup at the bottom of
    // this file).
    const handle = path.basename(directories.root);
    console.info(`[user-backup] Restore start: handle=${handle} mode=${mode} uploadSize=${uploadSize}B`);

    const backupTargets = getUserBackupTargets(directories, selection, options);
    const targetRoot = path.resolve(directories.root);
    const targetDirectories = backupTargets.directories.map(dir => path.resolve(dir));
    const targetFiles = new Set(backupTargets.files.map(file => path.resolve(file)));

    if (targetDirectories.length === 0 && targetFiles.size === 0) {
        throw new Error('At least one restore category must be selected.');
    }

    const categoryTargets = buildRestoreCategoryTargets(directories, selection, options);
    const tAnalyze = Date.now();
    const analysis = await analyzeRestoreArchive(uploadPath, targetRoot, targetFiles, targetDirectories, categoryTargets, reportProgress);
    throwIfRestoreCancelled(signal);
    const analyzeMs = Date.now() - tAnalyze;
    console.info(
        `[user-backup] Analyze done: entries=${analysis.report.totalEntries} targetable=${analysis.report.targetableEntries} `
        + `skipped=${analysis.report.skippedEntries} rejected=${analysis.report.rejectedEntries} analyze=${analyzeMs}ms`,
    );

    // When the archive carries an engine dump, validate that the
    // recorded engineKind matches the server's current engine. If kinds
    // differ AND the operator supplied enough context, delegate to the
    // cross-mode-restore orchestrator instead of refusing.
    //
    // For a ZIP that lacks `_engine_meta.json` (legacy fs-only backup), the
    // contents are an on-disk fs tree. On an fs server those unpack cleanly
    // via the directory tree (original same-mode path). On a db server we
    // delegate to crossModeRestore as well — synthesizing an
    // `engineMeta = { engineKind: 'fs' }` — so the orchestrator can build a
    // transient FsEngine from the ZIP and run MigrationRunner into the live
    // db engine. This subsumes the legacy 400 "run storage-migrate" error.
    const currentEngine = getStorageEngine();
    const effectiveMeta = analysis.engineMeta || (currentEngine.kind !== 'fs' ? { engineKind: 'fs' } : null);
    if (effectiveMeta) {
        // Database-backed archives are always staged, even when source and
        // destination engine kinds match. This prevents a selected-category
        // restore from replaying a whole-user dump via engine.restoreUser().
        // Legacy fs archives on DB destinations use the same staging path.
        // Returns a normalized
        // `{ restoredCount, failedCount, crossMode: {...} }` shape that the
        // caller can echo straight back.
        const crossResult = await crossModeRestore(
            uploadPath,
            effectiveMeta,
            directories,
            selection,
            mode,
            {
                dataRoot: globalThis.DATA_ROOT,
                currentEngine,
                onProgress: reportProgress,
                scratchCreds: options.scratchCreds || null,
                includeGlobalExtensions: !!options.includeGlobalExtensions,
                signal,
            },
        );
        const totalMs = Date.now() - restoreStart;
        console.info(`[user-backup] Cross-mode restore done: source=${effectiveMeta.engineKind} dest=${currentEngine.kind} entries=${crossResult.restoredCount} failed=${crossResult.failedCount} total=${totalMs}ms`);
        return {
            ...crossResult,
            preflight: analysis.report,
        };
    }
    // Note: the legacy-fs-on-db-server path now goes through crossModeRestore
    // above (synthesized engineMeta = fs). The `RestoreLegacyFsOnDbModeError`
    // type is kept exported for defensive backward compat with consumers that
    // still match on it, but the throw site has been removed.

    // Same-mode fs restore mutates the live user tree directly. Hold the same
    // migration lock/read-only gate used by cross-mode restore so the
    // asynchronous recovery snapshot cannot race normal writes.
    const holderId = makeHolderId();
    let heartbeat = null;
    await acquireMigrationLock({ dataRoot: globalThis.DATA_ROOT, holderId });
    heartbeat = startHeartbeat({ dataRoot: globalThis.DATA_ROOT, holderId });
    setReadOnly(true);

    try {
        if (isReplacingRestoreMode(mode) && analysis.report.targetableEntries === 0 && !analysis.engineMeta) {
            throw new Error('Archive does not match selected restore categories. Overwrite was cancelled to protect existing data.');
        }

        let recoveryPath = null;
        let snapshotMs = 0;
        const tSnap = Date.now();
        console.info('[user-backup] Recovery snapshot start');
        try {
            recoveryPath = await createRestoreRecoveryPoint(handle, directories, currentEngine, reportProgress, {
                restoreMode: mode,
            });
        } catch (snapshotError) {
            throw new Error(`Failed to create recovery point before restore: ${snapshotError?.message || snapshotError}`);
        }
        snapshotMs = Date.now() - tSnap;
        console.info(`[user-backup] Recovery snapshot done: ${snapshotMs}ms path=${path.basename(recoveryPath)}`);
        throwIfRestoreCancelled(signal);

        if (isReplacingRestoreMode(mode)) {
            try {
                for (const filePath of targetFiles) {
                    throwIfRestoreCancelled(signal);
                    await fsPromises.rm(filePath, { force: true });
                }
                const globalExtensionsPath = path.resolve(PUBLIC_DIRECTORIES.globalExtensions);
                for (const directoryPath of targetDirectories) {
                    throwIfRestoreCancelled(signal);
                    if (path.resolve(directoryPath) === globalExtensionsPath) {
                        await resetGlobalExtensionsRestoreDirectory(directoryPath);
                        continue;
                    }
                    await fsPromises.rm(directoryPath, { recursive: true, force: true });
                    ensureDirectory(directoryPath);
                }
            } catch (clearError) {
                try {
                    await rollbackRestoreRecoveryPoint(handle, directories, currentEngine, recoveryPath);
                } catch (rollbackError) {
                    throw new Error(
                        `Failed to prepare overwrite restore and rollback also failed. Recovery point: ${recoveryPath}. `
                        + `Prepare error: ${clearError?.message || clearError}. Rollback error: ${rollbackError?.message || rollbackError}`,
                    );
                }
                throw new Error(`Failed to prepare overwrite restore; previous data restored. ${clearError?.message || clearError}`);
            }
        }

        const result = {
            restoredCount: 0,
            failedCount: 0,
            skippedCount: analysis.report.skippedEntries,
            rejectedCount: analysis.report.rejectedEntries,
            preflight: analysis.report,
        };

        const tExtract = Date.now();
        let extractMs = 0;
        const extractTotal = analysis.report.targetableEntries;
        console.info(`[user-backup] Extract start: targetable=${extractTotal}`);
        reportProgress({ phase: 'extract', current: 0, total: extractTotal });
        let lastExtractProgressAt = 0;
        let lastExtractLogAt = 0;
        const entryExtractionPolicy = new RestoreEntryAdaptivePolicy();
        const reportExtractProgress = (force) => {
            const now = Date.now();
            const current = result.restoredCount + result.failedCount;
            if (force || now - lastExtractProgressAt >= 200) {
                lastExtractProgressAt = now;
                reportProgress({ phase: 'extract', current, total: extractTotal });
            }
            if (force || now - lastExtractLogAt >= 5000) {
                lastExtractLogAt = now;
                console.info(`[user-backup] Extract progress: ${current}/${extractTotal} failed=${result.failedCount}`);
            }
        };
        try {
            await new Promise((resolve, reject) => {
                yauzl.open(uploadPath, { lazyEntries: true, decodeStrings: true }, (openError, zipfile) => {
                    if (openError) {
                        reject(openError);
                        return;
                    }

                    let finished = false;
                    const finish = (error) => {
                        if (finished) {
                            return;
                        }
                        finished = true;
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    };

                    zipfile.readEntry();

                    zipfile.on('entry', (entry) => {
                        (async () => {
                            throwIfRestoreCancelled(signal);
                            // Engine sentinel entries (spec §5.2). _engine_meta.json
                            // was already consumed during analyze for kind
                            // validation, so skip it on disk. _engine_dump.bin is
                            // routed to engine.restoreUser(handle, stream) and
                            // never lands as a file under the user's data root —
                            // it's the opaque payload the engine ingests itself.
                            if (entry.fileName === ENGINE_META_ENTRY) {
                                zipfile.readEntry();
                                return;
                            }
                            if (entry.fileName === ENGINE_DUMP_ENTRY) {
                                if (!analysis.engineMeta) {
                                    // Defensive: dump without meta is a malformed
                                    // archive — discard the bytes and move on
                                    // rather than risk a half-restore.
                                    zipfile.readEntry();
                                    return;
                                }
                                zipfile.openReadStream(entry, async (streamError, readStream) => {
                                    if (streamError) {
                                        finish(streamError);
                                        return;
                                    }
                                    try {
                                        await currentEngine.restoreUser(handle, readStream);
                                        zipfile.readEntry();
                                    } catch (error) {
                                        finish(error);
                                    }
                                });
                                return;
                            }

                            const normalized = normalizeRestoreArchiveEntryPath(entry.fileName);
                            if (!normalized) {
                                zipfile.readEntry();
                                return;
                            }

                            if (entry.fileName.endsWith('/')) {
                                zipfile.readEntry();
                                return;
                            }

                            const unixFileType = (entry.externalFileAttributes >> 16) & 0o170000;
                            if (unixFileType === 0o120000) {
                                zipfile.readEntry();
                                return;
                            }

                            const targetMapping = analysis.targetByNormalizedEntry.get(normalized);
                            if (!targetMapping) {
                                zipfile.readEntry();
                                return;
                            }

                            const targetPath = targetMapping.targetPath;
                            ensureDirectory(path.dirname(targetPath));

                            const entryOrdinal = result.restoredCount + result.failedCount + 1;
                            const entryTotalBytes = Number(entry.uncompressedSize || 0);
                            let entryBytes = 0;
                            let lastEntryReportAt = 0;
                            const reportEntryProgress = (force = false) => {
                                const now = Date.now();
                                if (!force && now - lastEntryReportAt < 500) return;
                                lastEntryReportAt = now;
                                reportProgress({
                                    phase: 'extract',
                                    current: result.restoredCount + result.failedCount,
                                    total: extractTotal,
                                    entry: normalized,
                                    entryOrdinal,
                                    entryBytes,
                                    entryTotalBytes,
                                });
                                if (force || now - lastExtractLogAt >= 5000) {
                                    lastExtractLogAt = now;
                                    console.info(
                                        `[user-backup] Extract entry: ${entryOrdinal}/${extractTotal} `
                                        + `name=${normalized} bytes=${entryBytes}/${entryTotalBytes}`,
                                    );
                                }
                            };
                            reportEntryProgress(true);

                            try {
                                try {
                                    await streamZipEntryWithIdleTimeout({
                                        zipfile,
                                        entry,
                                        targetPath,
                                        timeoutMs: entryExtractionPolicy.timeoutMs,
                                        signal,
                                        onChunk: (_chunkBytes, totalBytes) => {
                                            entryBytes = totalBytes;
                                            reportEntryProgress(false);
                                        },
                                    });
                                } catch (error) {
                                    if (!isRestoreEntryIdleTimeoutError(error)) {
                                        throw error;
                                    }

                                    const wasDegraded = entryExtractionPolicy.degraded;
                                    entryExtractionPolicy.noteStall();
                                    console.warn(
                                        '[user-backup] Entry stream stalled; retrying with fallback extractor: '
                                        + `name=${normalized} size=${entryTotalBytes} timeout=${error.timeoutMs}ms`,
                                    );
                                    if (!wasDegraded) {
                                        console.warn(
                                            '[user-backup] Adaptive fallback enabled for remaining entries: '
                                            + `primary idle probe=${entryExtractionPolicy.timeoutMs}ms`,
                                        );
                                    }
                                    await fsPromises.rm(targetPath, { force: true });
                                    entryBytes = 0;
                                    reportEntryProgress(true);
                                    throwIfRestoreCancelled(signal);
                                    await extractZipEntryWithAdmZip({
                                        zipPath: uploadPath,
                                        entryName: entry.fileName,
                                        targetPath,
                                        expectedSize: entryTotalBytes,
                                        onBytes: totalBytes => {
                                            entryBytes = totalBytes;
                                            reportEntryProgress(true);
                                        },
                                    });
                                    console.info(
                                        `[user-backup] Fallback extractor succeeded: name=${normalized} bytes=${entryBytes}`,
                                    );
                                }

                                reportEntryProgress(true);
                                const zipLastModified = typeof entry.getLastModDate === 'function'
                                    ? entry.getLastModDate()
                                    : null;
                                if (zipLastModified instanceof Date && !Number.isNaN(zipLastModified.getTime())) {
                                    try {
                                        await fsPromises.utimes(targetPath, zipLastModified, zipLastModified);
                                    } catch {
                                        // Non-fatal: keep restored content even if timestamp restore fails.
                                    }
                                }
                                result.restoredCount += 1;
                                if (targetMapping.category && result.preflight.categoryStats[targetMapping.category]) {
                                    result.preflight.categoryStats[targetMapping.category].restoredEntries += 1;
                                }
                                reportExtractProgress(false);
                                zipfile.readEntry();
                            } catch (error) {
                                result.failedCount += 1;
                                if (targetMapping.category && result.preflight.categoryStats[targetMapping.category]) {
                                    result.preflight.categoryStats[targetMapping.category].failedEntries += 1;
                                }
                                addRestoreReportSample(result.preflight, normalized, `write_failed:${error instanceof Error ? error.message : String(error)}`);
                                reportExtractProgress(true);
                                finish(error);
                            }
                        })().catch(finish);
                    });

                    zipfile.on('end', () => finish());
                    zipfile.on('close', () => finish());
                    zipfile.on('error', finish);
                });
            });
            extractMs = Date.now() - tExtract;
            reportExtractProgress(true);

            const verification = {
                ok: true,
                checkedFiles: 0,
                missingFiles: [],
                enginePing: null,
            };
            for (const mapping of analysis.targetByNormalizedEntry.values()) {
                verification.checkedFiles += 1;
                if (!fs.existsSync(mapping.targetPath)) {
                    verification.ok = false;
                    verification.missingFiles.push(path.relative(targetRoot, mapping.targetPath));
                }
            }
            if (analysis.engineMeta && currentEngine.kind !== 'fs') {
                try {
                    await currentEngine.ping();
                    verification.enginePing = true;
                } catch (verifyError) {
                    verification.ok = false;
                    verification.enginePing = false;
                    addRestoreReportSample(
                        result.preflight,
                        ENGINE_DUMP_ENTRY,
                        `engine_verify_failed:${verifyError?.message || verifyError}`,
                    );
                }
            }
            if (!verification.ok) {
                throw new Error(
                    `Restore verification failed: ${verification.missingFiles.length} restored file(s) missing`
                    + (verification.enginePing === false ? '; storage engine verification failed' : ''),
                );
            }
            result.verification = verification;

            reportProgress({ phase: 'finalize' });
            result.recoveryPoint = path.basename(recoveryPath);
        } catch (extractError) {
            extractMs = Date.now() - tExtract;
            const totalMs = Date.now() - restoreStart;
            console.warn(`[user-backup] Restore failed after ${totalMs}ms (analyze=${analyzeMs}ms snapshot=${snapshotMs}ms extract=${extractMs}ms): ${extractError?.message || extractError}`);
            const baseMessage = extractError instanceof Error ? extractError.message : String(extractError);
            const cancelled = isRestoreCancelledError(extractError);
            if (recoveryPath) {
                try {
                    await rollbackRestoreRecoveryPoint(handle, directories, currentEngine, recoveryPath);
                    if (cancelled) {
                        throw new RestoreCancelledError(
                            'Restore cancelled by user; previous data restored from recovery point.',
                            { rolledBack: true },
                        );
                    }
                    throw new Error(`Restore failed; previous data restored from recovery point. Original error: ${baseMessage}`);
                } catch (rollbackError) {
                    if (isRestoreCancelledError(rollbackError)) {
                        throw rollbackError;
                    }
                    if (String(rollbackError?.message || '').startsWith('Restore failed; previous data restored')) {
                        throw rollbackError;
                    }
                    throw new Error(
                        `Restore failed and automatic rollback failed. Recovery point: ${recoveryPath}. `
                        + `Original error: ${baseMessage}. Rollback error: ${rollbackError?.message || rollbackError}`,
                    );
                }
            }
            throw extractError;
        }

        if (result.preflight.targetableEntries === 0 && mode !== 'overwrite') {
            addRestoreReportSample(result.preflight, '(archive)', 'no_restorable_entries_detected');
        }

        const totalMs = Date.now() - restoreStart;
        console.info(`[user-backup] Restore done: mode=${mode} entries=${result.restoredCount}/${analysis.report.totalEntries} failed=${result.failedCount} analyze=${analyzeMs}ms snapshot=${snapshotMs}ms extract=${extractMs}ms total=${totalMs}ms recovery=${result.recoveryPoint}`);
        return result;
    } finally {
        try { setReadOnly(false); } catch { /* best effort */ }
        try { stopHeartbeat(heartbeat); } catch { /* best effort */ }
        try { await releaseMigrationLock({ dataRoot: globalThis.DATA_ROOT, holderId }); } catch { /* best effort */ }
    }
}


async function listRestoreRecoveryPoints(handle) {
    const root = path.join(globalThis.DATA_ROOT, RESTORE_RECOVERY_DIR);
    let entries = [];
    try {
        entries = await fsPromises.readdir(root, { withFileTypes: true });
    } catch {
        return [];
    }

    const points = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const recoveryPath = path.join(root, entry.name);
        const metaPath = path.join(recoveryPath, SNAPSHOT_META_ENTRY);
        try {
            const meta = JSON.parse(await fsPromises.readFile(metaPath, 'utf8'));
            if (meta?.handle !== handle) continue;
            const stat = await fsPromises.stat(recoveryPath);
            points.push({
                id: entry.name,
                createdAt: meta.createdAt || stat.mtime.toISOString(),
                purpose: meta.purpose || 'backup-restore',
                restoreMode: meta.restoreMode || null,
                engineKind: meta.engineKind || null,
                sourceRecoveryPoint: meta.sourceRecoveryPoint || null,
            });
        } catch {
            // Ignore non-restore snapshots or incomplete forensic directories.
        }
    }
    points.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return points.slice(0, 50);
}

function resolveRestoreRecoveryPath(handle, id) {
    const safeId = String(id || '').trim();
    if (!safeId || safeId.includes('/') || safeId.includes('\\') || safeId.includes('..')) {
        throw new Error('Invalid recovery point id.');
    }
    const root = path.resolve(globalThis.DATA_ROOT, RESTORE_RECOVERY_DIR);
    const recoveryPath = path.resolve(root, safeId);
    if (!recoveryPath.startsWith(root + path.sep)) {
        throw new Error('Invalid recovery point path.');
    }
    const metaPath = path.join(recoveryPath, SNAPSHOT_META_ENTRY);
    if (!fs.existsSync(metaPath)) throw new Error('Recovery point not found.');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta?.handle !== handle) throw new Error('Recovery point does not belong to this account.');
    return { recoveryPath, meta };
}

async function applyRestoreRecoveryPoint({ handle, directories, recoveryId }) {
    const { recoveryPath } = resolveRestoreRecoveryPath(handle, recoveryId);
    const engine = getStorageEngine();
    const holderId = makeHolderId();
    let heartbeat = null;
    await acquireMigrationLock({ dataRoot: globalThis.DATA_ROOT, holderId });
    heartbeat = startHeartbeat({ dataRoot: globalThis.DATA_ROOT, holderId });
    setReadOnly(true);

    let undoPath = null;
    try {
        undoPath = await createRestoreRecoveryPoint(handle, directories, engine, null, {
            purpose: 'before-recovery-apply',
            restoreMode: 'recovery',
            sourceRecoveryPoint: recoveryId,
        });
        await restoreFromSnapshot({
            handle,
            userRoot: directories.root,
            backupPath: recoveryPath,
            engine,
        });
        return {
            restored: recoveryId,
            undoRecoveryPoint: path.basename(undoPath),
        };
    } catch (error) {
        if (undoPath) {
            try {
                await restoreFromSnapshot({
                    handle,
                    userRoot: directories.root,
                    backupPath: undoPath,
                    engine,
                });
            } catch (rollbackError) {
                throw new Error(
                    `Recovery apply failed and rollback failed. Undo point: ${undoPath}. `
                    + `Apply error: ${error?.message || error}. Rollback error: ${rollbackError?.message || rollbackError}`,
                );
            }
        }
        throw error;
    } finally {
        try { setReadOnly(false); } catch { /* best effort */ }
        try { stopHeartbeat(heartbeat); } catch { /* best effort */ }
        try { await releaseMigrationLock({ dataRoot: globalThis.DATA_ROOT, holderId }); } catch { /* best effort */ }
    }
}

const RESTORE_STREAM_MIME = 'application/x-ndjson';

function wantsRestoreProgressStream(request) {
    const accept = String(request.headers.accept || '');
    return accept.includes(RESTORE_STREAM_MIME);
}

function beginRestoreProgressStream(response) {
    response.status(200);
    response.setHeader('Content-Type', `${RESTORE_STREAM_MIME}; charset=utf-8`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    if (typeof response.flushHeaders === 'function') {
        response.flushHeaders();
    }
    const writeLine = (payload) => {
        try {
            response.write(JSON.stringify(payload) + '\n');
        } catch { /* downstream disconnect — restore continues, frontend will see broken stream */ }
    };
    return {
        onProgress(event) { writeLine({ type: 'progress', ...event }); },
        sendResult(payload) { writeLine({ type: 'result', ...payload }); response.end(); },
        sendError(message, details = {}) {
            writeLine({
                type: 'error',
                error: String(message || 'Restore failed'),
                ...details,
            });
            response.end();
        },
    };
}

const generateResetCode = () => Array.from({ length: 6 }, () => crypto.randomInt(0, 10)).join('');

export const router = express.Router();
const resetLimiter = new RateLimiterMemory({
    points: RESET_POINTS > 0 ? RESET_POINTS : Number.MAX_SAFE_INTEGER,
    duration: 300,
});

router.post('/logout', async (request, response) => {
    try {
        if (!request.session) {
            console.error('Session not available');
            return response.sendStatus(500);
        }

        request.session.handle = null;
        request.session.csrfToken = null;
        request.session.version = null;
        request.session = null;
        return response.sendStatus(204);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.get('/me', async (request, response) => {
    try {
        if (!request.user) {
            return response.sendStatus(403);
        }

        const user = request.user.profile;
        const viewModel = {
            handle: user.handle,
            name: user.name,
            avatar: await getUserAvatar(user.handle),
            admin: user.admin,
            password: !!user.password,
            created: user.created,
        };

        return response.json(viewModel);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/change-avatar', async (request, response) => {
    try {
        if (!request.body.handle) {
            console.warn('Change avatar failed: Missing required fields');
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (request.body.handle !== request.user.profile.handle && !request.user.profile.admin) {
            console.error('Change avatar failed: Unauthorized');
            return response.status(403).json({ error: 'Unauthorized' });
        }

        // Avatar is not a data URL or not an empty string
        if (!request.body.avatar.startsWith('data:image/') && request.body.avatar !== '') {
            console.warn('Change avatar failed: Invalid data URL');
            return response.status(400).json({ error: 'Invalid data URL' });
        }

        /** @type {import('../users.js').User} */
        const user = await storage.getItem(toKey(request.body.handle));

        if (!user) {
            console.error('Change avatar failed: User not found');
            return response.status(404).json({ error: 'User not found' });
        }

        await storage.setItem(toAvatarKey(request.body.handle), request.body.avatar);

        return response.sendStatus(204);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/change-password', async (request, response) => {
    try {
        if (!request.body.handle) {
            console.warn('Change password failed: Missing required fields');
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (request.body.handle !== request.user.profile.handle && !request.user.profile.admin) {
            console.error('Change password failed: Unauthorized');
            return response.status(403).json({ error: 'Unauthorized' });
        }

        /** @type {import('../users.js').User} */
        const user = await storage.getItem(toKey(request.body.handle));

        if (!user) {
            console.error('Change password failed: User not found');
            return response.status(404).json({ error: 'User not found' });
        }

        if (!user.enabled) {
            console.error('Change password failed: User is disabled');
            return response.status(403).json({ error: 'User is disabled' });
        }

        if (!request.user.profile.admin && user.password && user.password !== getPasswordHash(request.body.oldPassword, user.salt)) {
            console.error('Change password failed: Incorrect password');
            return response.status(403).json({ error: 'Incorrect password' });
        }

        if (request.body.newPassword) {
            const salt = getPasswordSalt();
            user.password = getPasswordHash(request.body.newPassword, salt);
            user.salt = salt;
        } else {
            user.password = '';
            user.salt = '';
        }

        await storage.setItem(toKey(request.body.handle), user);

        // Update session version to keep the current session valid after password change
        if (request.session && request.session.handle === user.handle) {
            request.session.version = getAccountVersion(user);
        }

        return response.sendStatus(204);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/backup', async (request, response) => {
    try {
        const allowFullDataBackup = !!getConfigValue('backups.allowFullDataBackup', true, 'boolean');

        if (!allowFullDataBackup) {
            console.warn('Backup failed: Full data backup is disabled in configuration');
            return response.status(403).json({ error: 'Full data backup is disabled' });
        }

        const handle = request.body.handle;

        if (!handle) {
            console.warn('Backup failed: Missing required fields');
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (handle !== request.user.profile.handle && !request.user.profile.admin) {
            console.error('Backup failed: Unauthorized');
            return response.status(403).json({ error: 'Unauthorized' });
        }

        const isAdminUser = Boolean(request.user?.profile?.admin);
        const parsedSelection = parseBackupSelectionPayload(request.body.selection);
        const selection = sanitizeBackupSelectionForUser(parsedSelection, isAdminUser);
        if (!Object.values(selection).some(Boolean)) {
            return response.status(400).json({ error: 'At least one backup category must be selected.' });
        }

        await createBackupArchive(handle, response, selection, { includeGlobalExtensions: isAdminUser });
    } catch (error) {
        console.error('Backup failed', error);
        return response.sendStatus(500);
    }
});

router.post('/lan-migration/offer', async (request, response) => {
    try {
        const handle = String(request.body?.handle || '').trim();
        if (!handle) {
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (handle !== request.user.profile.handle && !request.user.profile.admin) {
            return response.status(403).json({ error: 'Unauthorized' });
        }

        const isAdminUser = Boolean(request.user?.profile?.admin);
        const parsedSelection = parseBackupSelectionPayload(request.body.selection);
        const selection = sanitizeBackupSelectionForUser(parsedSelection, isAdminUser);
        if (!Object.values(selection).some(Boolean)) {
            return response.status(400).json({ error: 'At least one backup category must be selected.' });
        }

        const { token, expiresAt } = createLanMigrationOffer({
            handle,
            selection,
            includeGlobalExtensions: isAdminUser,
        });
        const baseUrl = trimTrailingSlash(getRequestBaseUrl(request));
        const url = `${baseUrl}${LAN_MIGRATION_PATH_PREFIX}${token}`;
        return response.json({ url, expiresAt });
    } catch (error) {
        console.error('LAN migration offer failed', error);
        return response.sendStatus(500);
    }
});

router.post('/restore-backup/recovery/list', async (request, response) => {
    try {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.status(401).json({ error: 'Not logged in' });
        return response.json({ recoveryPoints: await listRestoreRecoveryPoints(handle) });
    } catch (error) {
        console.error('Restore recovery list failed:', error);
        return response.status(500).json({ error: error?.message || 'Failed to list recovery points' });
    }
});

router.post('/restore-backup/recovery/apply', async (request, response) => {
    try {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.status(401).json({ error: 'Not logged in' });
        const directories = request.user.directories ?? getUserDirectories(handle);
        const result = await applyRestoreRecoveryPoint({
            handle,
            directories,
            recoveryId: request.body?.id,
        });
        await invalidateRecentChatIndex(request);
        return response.json({ ok: true, ...result });
    } catch (error) {
        console.error('Restore recovery apply failed:', error);
        const locked = String(error?.message || '').includes('another holder is migrating');
        return response.status(locked ? 409 : 400).json({ error: error?.message || 'Failed to apply recovery point' });
    }
});

function normalizeRestoreMode(value) {
    const mode = String(value || 'merge').trim().toLowerCase();
    return mode === 'overwrite' || mode === 'full' ? mode : 'merge';
}

function buildFullRestoreSelection(isAdminUser) {
    const base = normalizeUserBackupSelection({});
    for (const key of Object.keys(base)) base[key] = true;
    if (!isAdminUser) base.globalExtensions = false;
    return base;
}

function isReplacingRestoreMode(mode) {
    return mode === 'overwrite' || mode === 'full';
}

router.post('/restore-backup/probe', async (request, response) => {
    let uploadPath = '';
    try {
        if (!request.file) {
            return response.status(400).json({ error: 'No backup file uploaded' });
        }

        const originalName = String(request.file.originalname || '');
        if (!originalName.toLowerCase().endsWith('.zip')) {
            return response.status(400).json({ error: 'Backup file must be a .zip archive' });
        }

        uploadPath = request.file.path;
        const user = request.user?.profile;
        if (!user) {
            return response.status(401).json({ error: 'Not logged in' });
        }

        const isAdminUser = Boolean(user.admin);
        const mode = normalizeRestoreMode(request.body?.mode);
        const parsedSelection = parseBackupSelectionPayload(request.body?.selection);
        const selection = mode === 'full'
            ? buildFullRestoreSelection(isAdminUser)
            : sanitizeBackupSelectionForUser(parsedSelection, isAdminUser);
        if (!Object.values(selection).some(Boolean)) {
            return response.status(400).json({ error: 'At least one restore category must be selected.' });
        }
        const directories = request.user.directories ?? getUserDirectories(user.handle);
        const backupTargets = getUserBackupTargets(directories, selection, {
            includeGlobalExtensions: isAdminUser,
        });
        const targetRoot = path.resolve(directories.root);
        const targetDirectories = backupTargets.directories.map(dir => path.resolve(dir));
        const targetFiles = new Set(backupTargets.files.map(file => path.resolve(file)));
        const categoryTargets = buildRestoreCategoryTargets(directories, selection, {
            includeGlobalExtensions: isAdminUser,
        });

        const analysis = await analyzeRestoreArchive(
            uploadPath,
            targetRoot,
            targetFiles,
            targetDirectories,
            categoryTargets,
        );

        const currentEngine = getStorageEngine();
        const sourceMeta = analysis.engineMeta || { engineKind: 'fs', schemaVersion: null, handle: null };
        const supportedKinds = new Set(['fs', 'sqlite', 'mysql', 'postgres']);
        const sourceKind = String(sourceMeta.engineKind || '');
        const crossModeRequired = sourceKind !== currentEngine.kind;
        // Every database-backed archive is staged before apply so category
        // selection never replays a whole-user dump directly into the live
        // engine. Same-kind MySQL/PostgreSQL staging reuses the live engine
        // under an isolated scratch handle; extra scratch credentials are
        // needed only for a true cross-engine MySQL/PostgreSQL source.
        const stagedEngineRestore = Boolean(analysis.engineMeta) || crossModeRequired;
        const scratchCredsNeeded = crossModeRequired && (sourceKind === 'mysql' || sourceKind === 'postgres')
            ? sourceKind
            : null;

        let compatible = true;
        let reason = null;
        if (!supportedKinds.has(sourceKind)) {
            compatible = false;
            reason = `Unsupported backup engine kind: ${sourceKind || '(missing)'}`;
        } else if (analysis.report.targetableEntries === 0 && analysis.report.engineDumpEntries === 0) {
            compatible = false;
            reason = 'Archive contains no entries matching the selected restore categories.';
        }

        return response.json({
            compatible,
            reason,
            engineKind: sourceKind,
            destinationEngineKind: currentEngine.kind,
            schemaVersion: sourceMeta.schemaVersion ?? null,
            sourceHandle: sourceMeta.handle || null,
            crossModeRequired,
            scratchCredsNeeded,
            restoreMode: mode,
            selectedCategories: Object.entries(selection).filter(([, enabled]) => enabled).map(([key]) => key),
            requiresRecoveryPoint: true,
            restorePlan: {
                mode,
                destructive: isReplacingRestoreMode(mode),
                fullAccount: mode === 'full',
                selectedCategories: Object.entries(selection)
                    .filter(([, enabled]) => enabled)
                    .map(([key]) => key),
                sourceEngineKind: sourceKind,
                destinationEngineKind: currentEngine.kind,
                stagedEngineRestore,
                crossModeRequired,
                scratchCredsNeeded,
                recoveryPoint: 'required',
                verification: 'required',
                targetableEntries: analysis.report.targetableEntries,
                engineDumpEntries: analysis.report.engineDumpEntries,
            },
            preflight: analysis.report,
        });
    } catch (err) {
        console.error('Restore backup preflight failed:', err);
        return response.status(400).json({ error: err?.message || 'Preflight failed' });
    } finally {
        if (uploadPath) {
            await fsPromises.rm(uploadPath, { force: true }).catch(() => {});
        }
    }
});

router.post('/restore-backup/cancel', async (request, response) => {
    try {
        const handle = String(request.body?.handle || request.user?.profile?.handle || '').trim();
        if (!handle) {
            return response.status(400).json({ error: 'Missing required fields' });
        }
        if (handle !== request.user.profile.handle && !request.user.profile.admin) {
            return response.status(403).json({ error: 'Unauthorized' });
        }

        const session = activeRestoreControllers.get(handle);
        if (!session) {
            return response.status(404).json({
                error: 'No active restore for this account.',
                cancelRequested: false,
            });
        }

        if (!session.controller.signal.aborted) {
            session.controller.abort(new RestoreCancelledError());
            console.warn(`[user-backup] Manual cancel requested: handle=${handle} restoreId=${session.restoreId}`);
        }

        return response.json({
            cancelRequested: true,
            restoreId: session.restoreId,
            startedAt: session.startedAt,
        });
    } catch (error) {
        console.error('Restore cancel failed', error);
        return response.status(500).json({ error: error?.message || 'Restore cancel failed' });
    }
});

router.post('/restore-backup', async (request, response) => {
    let uploadPath = '';
    let stagedArchive = null;
    let restoreSession = null;
    const streaming = wantsRestoreProgressStream(request);
    let stream = null;

    try {
        const handle = request.body.handle;
        if (!handle) {
            console.warn('Restore failed: Missing required fields');
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (handle !== request.user.profile.handle && !request.user.profile.admin) {
            console.error('Restore failed: Unauthorized');
            return response.status(403).json({ error: 'Unauthorized' });
        }

        if (!request.file) {
            return response.status(400).json({ error: 'No backup file uploaded' });
        }

        const originalName = String(request.file.originalname || '');
        if (!originalName.toLowerCase().endsWith('.zip')) {
            return response.status(400).json({ error: 'Backup file must be a .zip archive' });
        }

        uploadPath = request.file.path;
        const mode = normalizeRestoreMode(request.body.mode);

        let parsedSelection = request.body.selection;
        if (typeof parsedSelection === 'string' && parsedSelection.trim()) {
            try {
                parsedSelection = JSON.parse(parsedSelection);
            } catch {
                parsedSelection = {};
            }
        }

        const isAdminUser = Boolean(request.user?.profile?.admin);
        const selection = mode === 'full'
            ? buildFullRestoreSelection(isAdminUser)
            : sanitizeBackupSelectionForUser(parsedSelection, isAdminUser);
        if (!Object.values(selection).some(Boolean)) {
            return response.status(400).json({ error: 'At least one restore category must be selected.' });
        }

        const directories = handle === request.user.profile.handle ? request.user.directories : getUserDirectories(handle);

        if (activeRestoreControllers.has(handle)) {
            return response.status(409).json({ error: 'A restore is already active for this account.' });
        }
        const controller = new AbortController();
        restoreSession = {
            controller,
            restoreId: crypto.randomUUID(),
            handle,
            startedAt: Date.now(),
        };
        activeRestoreControllers.set(handle, restoreSession);

        // Cross-mode restore optionally needs scratch DB connection strings
        // when the backup's source engine is mysql or postgres. These are
        // multipart fields the UI fills in after a probe-endpoint call
        // returns `crossModeScratchRequired`. Absent fields stay null and
        // cross-mode-restore raises CrossModeScratchCredsRequiredError →
        // 400, which the UI translates into the creds prompt.
        const scratchCreds = parseScratchCreds(request.body);

        if (streaming) {
            stream = beginRestoreProgressStream(response);
        }

        stagedArchive = await stageRestoreArchiveForRandomAccess(
            uploadPath,
            stream?.onProgress,
            { signal: restoreSession.controller.signal },
        );
        const restoreResult = await restoreUserBackupArchive(
            stagedArchive.path,
            directories,
            selection,
            mode,
            {
                includeGlobalExtensions: isAdminUser,
                onProgress: stream?.onProgress,
                scratchCreds,
                signal: restoreSession.controller.signal,
            },
        );
        await invalidateRecentChatIndex(request);

        const payload = { mode, ...restoreResult };
        if (stream) {
            stream.sendResult(payload);
            return;
        }
        return response.json(payload);
    } catch (error) {
        console.error('Restore failed', error);
        const message = error?.message || 'Restore failed';
        if (stream) {
            stream.sendError(message, {
                code: error?.code || null,
                rolledBack: Boolean(error?.rolledBack),
            });
            return;
        }
        // Engine-kind mismatch and legacy-fs-on-db (both spec §5.2) plus
        // the legacy "Archive does not match selected restore categories"
        // preflight all surface as 400 — operator-correctable mistakes, not
        // server faults. Everything else is a 500.
        if (error instanceof CrossModeScratchCredsRequiredError) {
            return response.status(400).json({
                error: error.message,
                crossModeScratchRequired: { kind: error.kind },
            });
        }
        if (error instanceof CrossModeScratchConnectionError) {
            return response.status(400).json({
                error: error.message,
                crossModeScratchConnection: { kind: error.kind },
            });
        }
        if (error?.code === 'MIGRATION_LOCKED') {
            return response.status(409).json({ error: message });
        }
        if (error instanceof CrossModeConversionFailedError) {
            return response.status(500).json({
                error: error.message,
                crossModeFailure: {
                    rollback: error.rollback,
                    snapshotPath: error.snapshotPath,
                },
            });
        }
        if (isRestoreCancelledError(error)) {
            return response.status(409).json({
                error: message,
                code: error.code,
                rolledBack: Boolean(error.rolledBack),
            });
        }
        const isValidationError = error instanceof RestoreEngineKindMismatchError
            || error instanceof RestoreLegacyFsOnDbModeError
            || message.includes('Archive does not match selected restore categories');
        const statusCode = isValidationError ? 400 : 500;
        return response.status(statusCode).json({ error: message });
    } finally {
        if (restoreSession && activeRestoreControllers.get(restoreSession.handle) === restoreSession) {
            activeRestoreControllers.delete(restoreSession.handle);
        }
        await stagedArchive?.cleanup?.().catch(() => {});
        if (uploadPath) {
            await fsPromises.rm(uploadPath, { force: true });
        }
    }
});

router.post('/lan-migration/import', async (request, response) => {
    let downloadPath = '';
    let stagedArchive = null;
    const streaming = wantsRestoreProgressStream(request);
    let stream = null;

    try {
        const handle = String(request.body?.handle || '').trim();
        if (!handle) {
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (handle !== request.user.profile.handle && !request.user.profile.admin) {
            return response.status(403).json({ error: 'Unauthorized' });
        }

        const rawUrl = String(request.body?.url || '').trim();
        if (!rawUrl) {
            return response.status(400).json({ error: 'No migration link provided' });
        }

        const isAdminUser = Boolean(request.user?.profile?.admin);
        const selection = sanitizeBackupSelectionForUser(parseBackupSelectionPayload(request.body.selection), isAdminUser);
        if (!Object.values(selection).some(Boolean)) {
            return response.status(400).json({ error: 'At least one restore category must be selected.' });
        }

        const mode = String(request.body.mode || 'merge').toLowerCase() === 'overwrite' ? 'overwrite' : 'merge';
        const sourceUrl = await resolveLanMigrationSourceUrl(rawUrl);
        const uploadsPath = path.join(globalThis.DATA_ROOT, UPLOADS_DIRECTORY);
        ensureDirectory(uploadsPath);
        downloadPath = path.join(uploadsPath, `lan-migration-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.zip`);

        if (streaming) {
            stream = beginRestoreProgressStream(response);
            stream.onProgress({ phase: 'download' });
        }

        await downloadLanMigrationArchive(sourceUrl.toString(), downloadPath);

        const directories = handle === request.user.profile.handle ? request.user.directories : getUserDirectories(handle);
        const scratchCreds = parseScratchCreds(request.body);
        stagedArchive = await stageRestoreArchiveForRandomAccess(downloadPath, stream?.onProgress);
        const restoreResult = await restoreUserBackupArchive(
            stagedArchive.path,
            directories,
            selection,
            mode,
            { includeGlobalExtensions: isAdminUser, onProgress: stream?.onProgress, scratchCreds },
        );
        await invalidateRecentChatIndex(request);

        const payload = {
            mode,
            source: { origin: sourceUrl.origin, host: sourceUrl.host },
            ...restoreResult,
        };
        if (stream) {
            stream.sendResult(payload);
            return;
        }
        return response.json(payload);
    } catch (error) {
        console.error('LAN migration import failed', error);
        const message = error?.message || 'LAN migration import failed';
        if (stream) {
            stream.sendError(message);
            return;
        }
        if (error instanceof CrossModeScratchCredsRequiredError) {
            return response.status(400).json({
                error: error.message,
                crossModeScratchRequired: { kind: error.kind },
            });
        }
        if (error instanceof CrossModeScratchConnectionError) {
            return response.status(400).json({
                error: error.message,
                crossModeScratchConnection: { kind: error.kind },
            });
        }
        if (error?.code === 'MIGRATION_LOCKED') {
            return response.status(409).json({ error: message });
        }
        if (error instanceof CrossModeConversionFailedError) {
            return response.status(500).json({
                error: error.message,
                crossModeFailure: { rollback: error.rollback, snapshotPath: error.snapshotPath },
            });
        }
        const isValidationError = error instanceof RestoreEngineKindMismatchError
            || error instanceof RestoreLegacyFsOnDbModeError
            || message.includes('Migration link')
            || message.includes('No migration link provided')
            || message.includes('At least one restore category')
            || message.includes('Archive does not match selected restore categories')
            || message.includes('Failed to download migration archive');
        const statusCode = isValidationError ? 400 : 500;
        return response.status(statusCode).json({ error: message });
    } finally {
        await stagedArchive?.cleanup?.().catch(() => {});
        if (downloadPath) {
            await fsPromises.rm(downloadPath, { force: true });
        }
    }
});

router.post('/import/data-zip', async (request, response) => {
    let uploadPath = '';
    let stagedArchive = null;

    try {
        if (!request.file) {
            return response.status(400).json({ error: 'No backup file uploaded' });
        }

        const originalName = String(request.file.originalname || '');
        if (!originalName.toLowerCase().endsWith('.zip')) {
            return response.status(400).json({ error: 'Backup file must be a .zip archive' });
        }

        uploadPath = request.file.path;
        const mode = String(request.body.mode || 'merge').toLowerCase() === 'overwrite' ? 'overwrite' : 'merge';
        const scratchCreds = parseScratchCreds(request.body);
        stagedArchive = await stageRestoreArchiveForRandomAccess(uploadPath);
        const restoreResult = await restoreUserBackupArchive(
            stagedArchive.path, request.user.directories, FULL_IMPORT_SELECTION, mode,
            { includeGlobalExtensions: false, scratchCreds },
        );
        await invalidateRecentChatIndex(request);

        return response.json({
            mode,
            ...restoreResult,
        });
    } catch (error) {
        console.error('Data ZIP import failed', error);
        const message = error?.message || 'Data ZIP import failed';
        if (error instanceof CrossModeScratchCredsRequiredError) {
            return response.status(400).json({ error: message, crossModeScratchRequired: { kind: error.kind } });
        }
        if (error instanceof CrossModeScratchConnectionError) {
            return response.status(400).json({ error: message, crossModeScratchConnection: { kind: error.kind } });
        }
        if (error?.code === 'MIGRATION_LOCKED') {
            return response.status(409).json({ error: message });
        }
        if (error instanceof CrossModeConversionFailedError) {
            return response.status(500).json({
                error: message,
                crossModeFailure: { rollback: error.rollback, snapshotPath: error.snapshotPath },
            });
        }
        // Mirror /restore-backup and /lan-migration/import: typed errors for
        // engine-kind mismatch and legacy-fs-on-db (spec §5.2) plus the
        // legacy preflight string surface as 400 — operator-correctable.
        const isValidationError = error instanceof RestoreEngineKindMismatchError
            || error instanceof RestoreLegacyFsOnDbModeError
            || message.includes('Archive does not match selected restore categories');
        const statusCode = isValidationError ? 400 : 500;
        return response.status(statusCode).json({ error: message });
    } finally {
        await stagedArchive?.cleanup?.().catch(() => {});
        if (uploadPath) {
            await fsPromises.rm(uploadPath, { force: true });
        }
    }
});

router.post('/reset-settings', async (request, response) => {
    try {
        const password = request.body.password;

        if (request.user.profile.password && request.user.profile.password !== getPasswordHash(password, request.user.profile.salt)) {
            console.warn('Reset settings failed: Incorrect password');
            return response.status(403).json({ error: 'Incorrect password' });
        }

        const pathToFile = path.join(request.user.directories.root, SETTINGS_FILE);
        await fsPromises.rm(pathToFile, { force: true });
        await checkForNewContent([request.user.directories], [CONTENT_TYPES.SETTINGS]);

        return response.sendStatus(204);
    } catch (error) {
        console.error('Reset settings failed', error);
        return response.sendStatus(500);
    }
});

router.post('/change-name', async (request, response) => {
    try {
        if (!request.body.name || !request.body.handle) {
            console.warn('Change name failed: Missing required fields');
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (request.body.handle !== request.user.profile.handle && !request.user.profile.admin) {
            console.error('Change name failed: Unauthorized');
            return response.status(403).json({ error: 'Unauthorized' });
        }

        /** @type {import('../users.js').User} */
        const user = await storage.getItem(toKey(request.body.handle));

        if (!user) {
            console.warn('Change name failed: User not found');
            return response.status(404).json({ error: 'User not found' });
        }

        user.name = request.body.name;
        await storage.setItem(toKey(request.body.handle), user);

        return response.sendStatus(204);
    } catch (error) {
        console.error('Change name failed', error);
        return response.sendStatus(500);
    }
});

router.post('/reset-step1', async (request, response) => {
    try {
        const ip = getIpAddress(request, PREFER_REAL_IP_HEADER);
        const rateLimit = await resetLimiter.get(ip);

        // Check for existing rate limits, but allow requesting a new code unless locked out
        if (rateLimit !== null && rateLimit.consumedPoints > resetLimiter.points) {
            throw rateLimit;
        }

        const resetCode = generateResetCode();
        console.log();
        console.log(color.magenta(`${request.user.profile.name}, your account reset code is: `) + color.red(resetCode));
        console.log();
        RESET_CACHE.set(request.user.profile.handle, resetCode);
        return response.sendStatus(204);
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            console.error('Reset step 1 failed: Rate limited from', getIpAddress(request, PREFER_REAL_IP_HEADER));
            return retryAfter(response, error).status(429).send({ error: 'Too many attempts. Try again later or contact your admin.' });
        }

        console.error('Reset step 1 failed:', error);
        return response.sendStatus(500);
    }
});

router.post('/reset-step2', async (request, response) => {
    try {
        if (!request.body.code) {
            console.warn('Reset step 2 failed: Missing required fields');
            return response.status(400).json({ error: 'Missing required fields' });
        }

        if (request.user.profile.password && request.user.profile.password !== getPasswordHash(request.body.password, request.user.profile.salt)) {
            console.warn('Reset step 2 failed: Incorrect password');
            return response.status(400).json({ error: 'Incorrect password' });
        }

        const ip = getIpAddress(request, PREFER_REAL_IP_HEADER);
        const rateLimit = await resetLimiter.get(ip);

        if (rateLimit !== null && rateLimit.consumedPoints > resetLimiter.points) {
            throw rateLimit;
        }

        const code = RESET_CACHE.get(request.user.profile.handle);

        if (!code || code !== request.body.code) {
            await resetLimiter.consume(ip);
            console.warn('Reset step 2 failed: Incorrect code');
            return response.status(400).json({ error: 'Incorrect code' });
        }

        console.info('Resetting account data:', request.user.profile.handle);
        await fsPromises.rm(request.user.directories.root, { recursive: true, force: true });

        await ensurePublicDirectoriesExist();
        await checkForNewContent([request.user.directories]);

        await resetLimiter.delete(ip);
        RESET_CACHE.remove(request.user.profile.handle);
        return response.sendStatus(204);
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            console.error('Reset step 2 failed: Rate limited from', getIpAddress(request, PREFER_REAL_IP_HEADER));
            return retryAfter(response, error).status(429).send({ error: 'Too many attempts. Try again later or contact your admin.' });
        }

        console.error('Reset step 2 failed:', error);
        return response.sendStatus(500);
    }
});

router.post('/announcements/me/list', async (request, response) => {
    try {
        if (!request.user) {
            return response.sendStatus(403);
        }
        const multiUser = getConfigValue('enableUserAccounts', false, 'boolean');
        const handle = request.user.profile.handle;
        const userRecord = await storage.getItem(toKey(handle));
        const readIds = Array.isArray(userRecord?.readAnnouncementIds)
            ? userRecord.readAnnouncementIds
            : [];
        const result = await listForUser({ readIds });
        return response.json({ ...result, multiUser });
    } catch (error) {
        console.error('Announcements me/list failed:', error);
        return response.sendStatus(500);
    }
});

router.post('/announcements/me/mark-read', async (request, response) => {
    try {
        if (!request.user) {
            return response.sendStatus(403);
        }
        const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
        const handle = request.user.profile.handle;
        const userRecord = await storage.getItem(toKey(handle));
        if (!userRecord) {
            return response.sendStatus(404);
        }
        const next = mergeReadIds({
            existing: userRecord.readAnnouncementIds,
            ids,
        });
        userRecord.readAnnouncementIds = next;
        await storage.setItem(toKey(handle), userRecord);
        return response.sendStatus(204);
    } catch (error) {
        console.error('Announcements me/mark-read failed:', error);
        return response.sendStatus(500);
    }
});

/**
 * POST /storage/inspect — Storage Inspector 自看 endpoint。
 * 永远看当前登录用户 · 无 admin 权限判断。
 *
 * Body: { path?: string[] } — 默认 [] · path 前端从上一层 response 里的 entry.key 拿。
 * Response 200: InspectorResponse(见 src/storage/inspector.js)· target 强制 { type:'self', handle:<current> }
 * Response 400: { error: { code, message } } · code ∈ E_INVALID_PATH / E_NOT_INSPECTABLE
 * Response 401: 未登录
 * Response 500: { error: { code: 'E_INTERNAL', message } }
 */
router.post('/storage/inspect', async (request, response) => {
    try {
        const user = request.user?.profile;
        if (!user) {
            return response.status(401).json({ error: { code: 'E_UNAUTHORIZED', message: 'not logged in' } });
        }
        const pathArr = Array.isArray(request.body?.path) ? request.body.path : [];
        const dirs = request.user?.directories ?? getUserDirectories(user.handle);
        const adminSettings = await getAdminSettings();

        const result = await resolvePath(dirs.root, pathArr, {
            target: { type: 'self', handle: user.handle },
            user,
            adminSettings,
        });
        // Add mutation capabilities only for concrete resources that the
        // safe storage-management resolver can map back to this user's root.
        for (const entry of result.entries ?? []) {
            try {
                const resource = resolveStorageResource(
                    dirs.root,
                    [...pathArr, entry.key],
                    String(entry.kind || ''),
                );
                entry.capabilities = resource.capabilities;
                entry.canDelete = Boolean(resource.capabilities.delete);
            } catch {
                entry.capabilities = {
                    view: false,
                    viewContent: false,
                    edit: false,
                    delete: false,
                    download: false,
                    restore: false,
                };
                entry.canDelete = false;
            }
        }

        // pure lib 默认 target.handle:null · 这里补齐当前用户 handle
        result.target = { type: 'self', handle: user.handle };
        return response.json(result);
    } catch (err) {
        if (err instanceof StorageInspectorError) {
            return response.status(400).json({ error: { code: err.code, message: err.message } });
        }
        console.error('storage-inspector /inspect error:', err);
        return response.status(500).json({ error: { code: 'E_INTERNAL', message: String(err?.message ?? err) } });
    }
});


function storageRecoveryRoot() {
    return path.join(globalThis.DATA_ROOT, '_storage-recovery');
}

function storageResourceErrorResponse(response, err) {
    const code = String(err?.code || 'E_INTERNAL');
    const status = code === 'E_NOT_FOUND' ? 404
        : code === 'E_CONFLICT' ? 409
            : code === 'E_TOO_LARGE' ? 413
                : code === 'E_INTERNAL' ? 500
                    : 400;
    return response.status(status).json({
        error: {
            code,
            message: String(err?.message || err || 'Storage operation failed'),
        },
    });
}

function publicStorageResource(resource) {
    const safe = { ...resource };
    delete safe.absolutePath;
    return safe;
}

router.post('/storage/resource/read', async (request, response) => {
    try {
        const user = request.user?.profile;
        if (!user) return response.status(401).json({ error: { code: 'E_UNAUTHORIZED', message: 'not logged in' } });
        const dirs = request.user?.directories ?? getUserDirectories(user.handle);
        const resource = resolveStorageResource(
            dirs.root,
            Array.isArray(request.body?.path) ? request.body.path : [],
            String(request.body?.kind || ''),
        );
        const result = await readStorageResource(resource);
        return response.json(publicStorageResource(result));
    } catch (err) {
        return storageResourceErrorResponse(response, err);
    }
});

router.post('/storage/resource/write', async (request, response) => {
    try {
        const user = request.user?.profile;
        if (!user) return response.status(401).json({ error: { code: 'E_UNAUTHORIZED', message: 'not logged in' } });
        const dirs = request.user?.directories ?? getUserDirectories(user.handle);
        const pathArr = Array.isArray(request.body?.path) ? request.body.path : [];
        const resource = resolveStorageResource(dirs.root, pathArr, String(request.body?.kind || ''));
        const result = await writeStorageResource({
            resource,
            content: request.body?.content,
            recoveryRoot: storageRecoveryRoot(),
            handle: user.handle,
            expectedModifiedMs: request.body?.expectedModifiedMs ?? null,
        });
        await invalidateRecentChatIndex(request);
        const refreshed = await readStorageResource(resolveStorageResource(dirs.root, pathArr, String(request.body?.kind || '')));
        return response.json({
            ok: true,
            recovery: result.recovery,
            resource: publicStorageResource(refreshed),
        });
    } catch (err) {
        return storageResourceErrorResponse(response, err);
    }
});

router.post('/storage/resource/delete', async (request, response) => {
    try {
        const user = request.user?.profile;
        if (!user) return response.status(401).json({ error: { code: 'E_UNAUTHORIZED', message: 'not logged in' } });
        const dirs = request.user?.directories ?? getUserDirectories(user.handle);
        const resource = resolveStorageResource(
            dirs.root,
            Array.isArray(request.body?.path) ? request.body.path : [],
            String(request.body?.kind || ''),
        );
        const result = await deleteStorageResource({
            resource,
            recoveryRoot: storageRecoveryRoot(),
            handle: user.handle,
        });
        await invalidateRecentChatIndex(request);
        return response.json({ ok: true, recovery: result.recovery });
    } catch (err) {
        return storageResourceErrorResponse(response, err);
    }
});

router.post('/storage/recovery/list', async (request, response) => {
    try {
        const user = request.user?.profile;
        if (!user) return response.status(401).json({ error: { code: 'E_UNAUTHORIZED', message: 'not logged in' } });
        const points = await listStorageRecoveryPoints(
            storageRecoveryRoot(),
            user.handle,
            request.body?.limit,
        );
        return response.json({ recoveryPoints: points });
    } catch (err) {
        return storageResourceErrorResponse(response, err);
    }
});

router.post('/storage/recovery/restore', async (request, response) => {
    try {
        const user = request.user?.profile;
        if (!user) return response.status(401).json({ error: { code: 'E_UNAUTHORIZED', message: 'not logged in' } });
        const dirs = request.user?.directories ?? getUserDirectories(user.handle);
        const restored = await restoreStorageRecoveryPoint({
            recoveryRoot: storageRecoveryRoot(),
            handle: user.handle,
            userRoot: dirs.root,
            id: String(request.body?.id || ''),
        });
        await invalidateRecentChatIndex(request);
        return response.json({ ok: true, restored });
    } catch (err) {
        return storageResourceErrorResponse(response, err);
    }
});
