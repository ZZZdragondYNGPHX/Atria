import fs from 'node:fs';
import path from 'node:path';

import { ENGINE_META_ENTRY, ENGINE_DUMP_ENTRY } from '../engine-backup-entries.js';
import { withChatWrite } from '../repositories/chat-write-boundary.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../native/contracts.js';
import { nativeSnapshotExcluded, NATIVE_DATABASE } from '../engines/fs-native-store.js';

export const SNAPSHOT_META_ENTRY = '_atria_snapshot_meta.json';
export const SNAPSHOT_GLOBAL_EXTENSIONS_ENTRY = '_atria_global_extensions';

// Account restore may replace the entire root during rollback, including a
// restore that selected only chats. Reuse the original V3 retention refusal
// before its snapshot, rather than treating category selection as permission.
export async function assertSnapshotRestoreAllowed({ engine, handle, userRoot }) {
    const retained = engine ? await engine.withTransaction(handle, async tx => [
        ...await tx.listResources({ kind: K.orchestrationRun, handle }),
        ...await tx.listResources({ kind: K.orchestrationRecord, handle }),
    ]) : fs.existsSync(path.join(userRoot, 'atria-native')) ? [null] : [];
    if (retained.length) throw Object.assign(new Error('Native orchestration history requires restore retention review'),
        { code: 'native_orchestration_retention_review_required' });
}

/**
 * Snapshot a user's directory tree into <backupRoot>/<timestamp>-<handle>/.
 * Returns the absolute backup path.
 *
 * Native FS records use an online SQLite snapshot; active DB/WAL/SHM and
 * inactive pre-upgrade copies are excluded from the file walk. An open Native
 * database requires its engine. Non-FS engines also stream their logical dump
 * into the snapshot. Callers hold the existing account/migration write boundary.
 *
 * @param {object} args
 * @param {string} args.handle
 * @param {string} args.userRoot
 * @param {string} args.backupRoot
 * @param {object|null} [args.engine] — engine instance with `kind`, `dumpUser`.
 * @param {object|null} [args.metadata] — optional operator-facing snapshot metadata.
 * @returns {Promise<string>} the absolute snapshot directory path.
 */
export async function snapshotUser({ handle, userRoot, backupRoot, engine = null, metadata = null }) {
    if (!handle) throw new Error('snapshotUser: handle is required');
    if (!userRoot) throw new Error('snapshotUser: userRoot is required');
    if (!backupRoot) throw new Error('snapshotUser: backupRoot is required');
    if (!fs.existsSync(userRoot)) {
        throw new Error(`snapshotUser: source userRoot does not exist: ${userRoot}`);
    }
    fs.mkdirSync(backupRoot, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupRoot, `${timestamp}-${handle}`);
    // WAL databases require an online snapshot; copying the main file (or
    // racing copies of main/WAL/SHM) does not define a consistent commit.
    if (!engine && fs.existsSync(path.join(userRoot, NATIVE_DATABASE))) throw new Error('Native WAL snapshot requires its storage engine');
    if (engine?.kind === 'fs') await engine.withTransaction(handle, () => {});
    await fs.promises.cp(userRoot, dest, { recursive: true,
        filter: source => engine?.kind !== 'fs' || !nativeSnapshotExcluded(path.relative(userRoot, source)),
    });
    if (engine?.kind === 'fs') await engine.snapshotNative(handle, dest);

    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        const snapshotMeta = {
            ...metadata,
            handle,
            createdAt: new Date().toISOString(),
        };
        await fs.promises.writeFile(
            path.join(dest, SNAPSHOT_META_ENTRY),
            JSON.stringify(snapshotMeta, null, 2) + '\n',
            'utf8',
        );
    }

    // In non-fs modes also capture an engine dump so the
    // engine-side state (mysql/pg rows; sqlite .sqlite file) survives a
    // restore even if the on-disk user dir contained none of it.
    if (engine && engine.kind !== 'fs') {
        const dumpStream = await engine.dumpUser(handle);
        if (dumpStream != null) {
            const dumpPath = path.join(dest, ENGINE_DUMP_ENTRY);
            const metaPath = path.join(dest, ENGINE_META_ENTRY);
            const meta = {
                engineKind: engine.kind,
                // schemaVersion is fixed at 1 today. A future change will route
                // this through a CURRENT_SCHEMA_VERSION constant so dumps and
                // restores can refuse mismatched schema generations.
                schemaVersion: 1,
                createdAt: new Date().toISOString(),
                handle,
            };
            await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));
            await new Promise((resolve, reject) => {
                const write = fs.createWriteStream(dumpPath);
                dumpStream.on('error', reject);
                write.on('error', reject);
                write.on('finish', resolve);
                dumpStream.pipe(write);
            });
        }
    }

    return dest;
}

/**
 * Restore a user's on-disk directory tree from a snapshot taken by
 * `snapshotUser`. The inverse of `snapshotUser` for the fs/sqlite path: a
 * verbatim recursive copy back from `backupPath` to `userRoot`.
 *
 * Engine-dump replay:
 *  - When `engine` is passed and `engine.kind !== 'fs'`, after restoring the
 *    fs tree this reads `<backupPath>/_engine_dump.bin` and pipes it through
 *    `engine.restoreUser(handle, stream)`. The `_engine_meta.json` is checked
 *    first: if its `engineKind` doesn't match the current engine, this throws
 *    rather than silently producing a partial restore (e.g. a mysql dump
 *    replayed into a pg engine would either error mid-stream or, worse, only
 *    overwrite rows whose shapes happen to match).
 *  - When `engine.kind === 'fs'` or `engine` is null/undefined, only the fs
 *    tree (including the standalone Native database) is restored; the
 *    cpSync already covers everything.
 *  - Engine state living inside the user dir (the sqlite .sqlite file) is
 *    restored by the cpSync too. Passing `engine` for sqlite is harmless —
 *    `engine.restoreUser` writes the same bytes through a different path.
 *
 * Called by `MigrationRunner.migrateUser`'s catch handler to undo a partial
 * in-place migration. Idempotent in two senses:
 *  - If `userRoot` was already deleted (e.g. a fault between snapshot and
 *    re-population), the restore re-creates it from the backup.
 *  - If `userRoot` already exists, it is removed first so the restore is a
 *    clean replacement rather than a merge — otherwise stale files written
 *    by the failed migration would linger alongside the restored ones.
 *
 * @param {object} args
 * @param {string} args.handle
 * @param {string} args.userRoot
 * @param {string} args.backupPath
 * @param {object|null} [args.engine] — engine instance with `kind`, `restoreUser`.
 */
export async function restoreFromSnapshot(args) {
    return withChatWrite(args.handle, () => restoreSnapshot(args));
}

async function restoreSnapshot({ handle, userRoot, backupPath, engine = null }) {
    if (!handle) throw new Error('restoreFromSnapshot: handle is required');
    if (!userRoot) throw new Error('restoreFromSnapshot: userRoot is required');
    if (!backupPath) throw new Error('restoreFromSnapshot: backupPath is required');
    if (!fs.existsSync(backupPath)) {
        throw new Error(`restoreFromSnapshot: backupPath does not exist: ${backupPath}`);
    }
    await assertSnapshotRestoreAllowed({ engine, handle, userRoot });
    const dumpPath = path.join(backupPath, ENGINE_DUMP_ENTRY);
    const metaPath = path.join(backupPath, ENGINE_META_ENTRY);
    if (engine && engine.kind !== 'fs' && fs.existsSync(dumpPath) && fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.engineKind !== engine.kind) {
            throw new Error(`restoreFromSnapshot: engineKind mismatch (snapshot=${meta.engineKind}, current=${engine.kind})`);
        }
    }
    // SQLite holds the file open. Close/evict this user's connection before
    // replacing the directory, especially on Windows where a partial removal
    // could otherwise delete blobs before failing on the database file.
    engine?.closeHandle?.(handle);
    if (fs.existsSync(userRoot)) {
        await fs.promises.rm(userRoot, { recursive: true, force: true });
    }
    // Exclude the engine-side artifacts at copy time so userRoot doesn't end up
    // with top-level `_engine_dump.bin` / `_engine_meta.json` after rollback —
    // those files are snapshot-internal scaffolding for `engine.restoreUser`,
    // not part of the user's payload. Without this filter the next snapshot
    // taken from the restored userRoot would re-snapshot the previous dump,
    // bloating backups and confusing forensic inspection.
    await fs.promises.cp(backupPath, userRoot, {
        recursive: true,
        filter: (src) => {
            const base = path.basename(src);
            return base !== ENGINE_DUMP_ENTRY
                && base !== ENGINE_META_ENTRY
                && base !== SNAPSHOT_META_ENTRY
                && base !== SNAPSHOT_GLOBAL_EXTENSIONS_ENTRY;
        },
    });

    // In db modes, replay the engine dump if the snapshot captured one. We
    // gate on both the meta file AND the bin file being present — older
    // snapshots taken before engine-dump capture existed (or for an fs
    // engine) have neither, and there's nothing to replay. The meta file's
    // engineKind is the source of truth for what engine wrote the dump.
    if (engine && engine.kind !== 'fs') {
        if (fs.existsSync(dumpPath) && fs.existsSync(metaPath)) {
            const readStream = fs.createReadStream(dumpPath);
            await engine.restoreUser(handle, readStream);
        }
    }
}

/**
 * Delete a snapshot directory created by `snapshotUser`. Used by
 * `MigrationRunner.migrateUser` to drop the snapshot once a migration has
 * succeeded (the migrate `finally` clause: "if success and !keepSnapshot:
 * removeSnapshot(snapshot)").
 *
 * Tolerant by design:
 *  - `backupPath` falsy → no-op (dry-run / snapshot was never taken).
 *  - `backupPath` already gone → no-op (a previous gc pass, manual cleanup,
 *    or a concurrent admin action could remove it; we still want migration to
 *    treat the post-condition "snapshot is gone" as satisfied).
 *  - `recursive: true, force: true` so the engine-dump sidecars
 *    (`_engine_dump.bin` + `_engine_meta.json`) are swept up
 *    alongside the fs tree without a dedicated branch.
 *
 * Callers should null out their reference to `backupPath` afterwards so the
 * stats object can't be confused with a snapshot that still exists on disk.
 *
 * @param {string|null|undefined} backupPath
 */
export function removeSnapshot(backupPath) {
    if (!backupPath) return;
    if (!fs.existsSync(backupPath)) return;
    fs.rmSync(backupPath, { recursive: true, force: true });
}
