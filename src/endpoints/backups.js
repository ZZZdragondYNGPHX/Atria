import express from 'express';
import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { CHAT_BACKUPS_PREFIX, getChatInfo } from './chats.js';
import {
    getBackupDirectoryUsage,
    getBackupRetentionConfig,
    getBackupType,
    hasBackupRetentionOverride,
    listManagedBackupRecords,
    pruneBackupDirectory,
    resetBackupRetentionConfig,
    saveBackupRetentionConfig,
    startBackupRetentionScheduler,
} from '../backup-retention.js';
import { listBuiltinBackupSyncProviders } from '../backup-sync/providers/registry.js';

export const router = express.Router();

if (process.env.NODE_ENV !== 'test') {
    startBackupRetentionScheduler();
}


router.post('/providers/list', (_request, response) => {
    return response.json({ providers: listBuiltinBackupSyncProviders() });
});

router.post('/managed/list', async (request, response) => {
    try {
        const type = request.body?.type == null ? undefined : String(request.body.type);
        if (type && !['chat', 'settings'].includes(type)) {
            return response.status(400).json({ error: 'Unknown backup type.' });
        }

        const records = listManagedBackupRecords(request.user.directories.backups, type)
            .sort((a, b) => b.modifiedMs - a.modifiedMs || b.name.localeCompare(a.name));

        const enriched = [];
        for (const record of records) {
            if (record.type === 'chat') {
                const info = await getChatInfo(record.path);
                enriched.push({
                    ...record,
                    path: undefined,
                    chat: info && info.file_name ? info : null,
                });
            } else {
                enriched.push({ ...record, path: undefined });
            }
        }
        return response.json({ records: enriched });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/managed/preview', async (request, response) => {
    try {
        const name = sanitize(String(request.body?.name || ''));
        const type = getBackupType(name);
        if (!type) {
            return response.status(400).json({ error: 'Not a managed backup file.' });
        }
        const filePath = path.join(request.user.directories.backups, name);
        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }

        const stat = await fsPromises.stat(filePath);
        const maxBytes = 512 * 1024;
        const handle = await fsPromises.open(filePath, 'r');
        try {
            const length = Math.min(stat.size, maxBytes);
            const buffer = Buffer.alloc(length);
            await handle.read(buffer, 0, length, 0);
            return response.json({
                name,
                type,
                size: stat.size,
                modifiedMs: stat.mtimeMs,
                truncated: stat.size > maxBytes,
                content: buffer.toString('utf8'),
            });
        } finally {
            await handle.close();
        }
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/managed/delete', async (request, response) => {
    try {
        const name = sanitize(String(request.body?.name || ''));
        const type = getBackupType(name);
        if (!type) {
            return response.status(400).json({ error: 'Not a managed backup file.' });
        }
        const filePath = path.join(request.user.directories.backups, name);
        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }
        await fsPromises.unlink(filePath);
        return response.json({ ok: true, name, type });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/managed/download', async (request, response) => {
    try {
        const name = sanitize(String(request.body?.name || ''));
        if (!getBackupType(name)) {
            return response.status(400).json({ error: 'Not a managed backup file.' });
        }
        const filePath = path.join(request.user.directories.backups, name);
        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }
        return response.download(filePath);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/chat/get', async (request, response) => {
    try {
        // Keep the visible backup list consistent with the current user's
        // retention policy even if the periodic cleanup has not run yet.
        const policy = getBackupRetentionConfig(request.user.directories);
        pruneBackupDirectory(request.user.directories.backups, policy);

        const backupModels = [];
        const backupFiles = await fsPromises
            .readdir(request.user.directories.backups, { withFileTypes: true })
            .then(d => d.filter(d => d.isFile() && path.extname(d.name) === '.jsonl' && d.name.startsWith(CHAT_BACKUPS_PREFIX)).map(d => d.name));

        for (const name of backupFiles) {
            const filePath = path.join(request.user.directories.backups, name);
            const info = await getChatInfo(filePath);
            if (!info || !info.file_name) {
                continue;
            }
            backupModels.push(info);
        }

        return response.json(backupModels);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/retention/status', async (request, response) => {
    try {
        const policy = getBackupRetentionConfig(request.user.directories);
        const usage = getBackupDirectoryUsage(request.user.directories.backups);
        return response.json({
            policy,
            usage,
            source: hasBackupRetentionOverride(request.user.directories) ? 'user' : 'default',
        });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/retention/settings', async (request, response) => {
    try {
        const policy = saveBackupRetentionConfig(request.user.directories, request.body);
        const cleanup = pruneBackupDirectory(request.user.directories.backups, policy);
        const usage = { ...getBackupDirectoryUsage(request.user.directories.backups), deleted: cleanup.deleted };
        return response.json({ policy, usage, source: 'user' });
    } catch (error) {
        if (error instanceof TypeError) {
            return response.status(400).json({ error: error.message });
        }
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/retention/reset', async (request, response) => {
    try {
        const policy = resetBackupRetentionConfig(request.user.directories);
        const cleanup = pruneBackupDirectory(request.user.directories.backups, policy);
        const usage = { ...getBackupDirectoryUsage(request.user.directories.backups), deleted: cleanup.deleted };
        return response.json({ policy, usage, source: 'default' });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/retention/cleanup', async (request, response) => {
    try {
        const policy = getBackupRetentionConfig(request.user.directories);
        const cleanup = pruneBackupDirectory(request.user.directories.backups, policy);
        const usage = { ...getBackupDirectoryUsage(request.user.directories.backups), deleted: cleanup.deleted };
        return response.json({ policy, usage, source: hasBackupRetentionOverride(request.user.directories) ? 'user' : 'default' });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/chat/delete', async (request, response) => {
    try {
        const { name } = request.body;
        const filePath = path.join(request.user.directories.backups, sanitize(name));

        if (getBackupType(path.parse(filePath).base) !== 'chat') {
            console.warn('Attempt to delete non-chat backup file:', name);
            return response.sendStatus(400);
        }

        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }

        await fsPromises.unlink(filePath);
        return response.sendStatus(200);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/chat/download', async (request, response) => {
    try {
        const { name } = request.body;
        const filePath = path.join(request.user.directories.backups, sanitize(name));

        if (getBackupType(path.parse(filePath).base) !== 'chat') {
            console.warn('Attempt to download non-chat backup file:', name);
            return response.sendStatus(400);
        }

        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }

        return response.download(filePath);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});
