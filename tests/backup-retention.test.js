import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    getBackupDirectoryUsage,
    getBackupEntityKey,
    getBackupRetentionConfig,
    getBackupType,
    hasBackupRetentionOverride,
    pruneBackupDirectory,
    pruneBackupType,
    resetBackupRetentionConfig,
    saveBackupRetentionConfig,
} from '../src/backup-retention.js';

function makeTempDirectory() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'atria-backup-retention-'));
}

function writeBackup(directory, name, content, modifiedMs) {
    const filePath = path.join(directory, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    const modified = new Date(modifiedMs);
    fs.utimesSync(filePath, modified, modified);
    return filePath;
}

function policy(overrides = {}) {
    return {
        enabled: true,
        maxPerEntity: -1,
        maxTotalBackups: -1,
        maxTotalSizeBytes: -1,
        ...overrides,
    };
}

describe('backup retention manager', () => {
    let directory;

    beforeEach(() => {
        directory = makeTempDirectory();
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test('classifies generated chat and settings backups independently', () => {
        expect(getBackupEntityKey('chat_some_character_20260915-120000.jsonl')).toBe('chat_some_character');
        expect(getBackupEntityKey('settings_default-user_20260915-120000.json')).toBe('settings_default-user');
        expect(getBackupType('chat_some_character_20260915-120000.jsonl')).toBe('chat');
        expect(getBackupType('settings_default-user_20260915-120000.json')).toBe('settings');
        expect(getBackupEntityKey('notes.txt')).toBeNull();
        expect(getBackupType('notes.txt')).toBeNull();
    });

    test('rejects backup-like files that do not end with a generated timestamp', () => {
        expect(getBackupEntityKey('chat_manual.jsonl')).toBeNull();
        expect(getBackupEntityKey('settings_notes.json')).toBeNull();
        expect(getBackupEntityKey('settings_default-user_20260915-120000-extra.json')).toBeNull();
    });

    test('chat per-entity pruning never consumes the settings budget', () => {
        writeBackup(directory, 'chat_alice_20260915-100000.jsonl', 'a1', 1_000);
        writeBackup(directory, 'chat_alice_20260915-110000.jsonl', 'a2', 2_000);
        writeBackup(directory, 'chat_alice_20260915-120000.jsonl', 'a3', 3_000);
        writeBackup(directory, 'settings_default-user_20260915-090000.json', 's1', 500);

        const result = pruneBackupType(directory, 'chat', policy({ maxPerEntity: 2 }));

        expect(result.deleted).toBe(1);
        expect(result.remaining).toBe(2);
        expect(fs.existsSync(path.join(directory, 'chat_alice_20260915-100000.jsonl'))).toBe(false);
        expect(fs.existsSync(path.join(directory, 'settings_default-user_20260915-090000.json'))).toBe(true);
    });

    test('chat and settings global count limits are independent', () => {
        writeBackup(directory, 'chat_a_20260915-100000.jsonl', 'a', 1_000);
        writeBackup(directory, 'chat_b_20260915-110000.jsonl', 'b', 2_000);
        writeBackup(directory, 'chat_c_20260915-120000.jsonl', 'c', 3_000);
        writeBackup(directory, 'settings_default-user_20260915-090000.json', 's1', 500);
        writeBackup(directory, 'settings_default-user_20260915-130000.json', 's2', 4_000);

        const result = pruneBackupDirectory(directory, {
            chat: policy({ maxTotalBackups: 2 }),
            settings: policy({ maxTotalBackups: 1 }),
        });

        expect(result.chat.deleted).toBe(1);
        expect(result.settings.deleted).toBe(1);
        expect(result.remaining).toBe(3);
        expect(fs.existsSync(path.join(directory, 'chat_a_20260915-100000.jsonl'))).toBe(false);
        expect(fs.existsSync(path.join(directory, 'settings_default-user_20260915-090000.json'))).toBe(false);
    });

    test('byte budgets are enforced per backup class instead of across both classes', () => {
        writeBackup(directory, 'chat_a_20260915-100000.jsonl', '1234', 1_000);
        writeBackup(directory, 'chat_b_20260915-120000.jsonl', 'abcd', 3_000);
        writeBackup(directory, 'settings_default-user_20260915-110000.json', '5678', 2_000);

        const result = pruneBackupDirectory(directory, {
            chat: policy({ maxTotalSizeBytes: 4 }),
            settings: policy({ maxTotalSizeBytes: 4 }),
        });

        expect(result.chat.deleted).toBe(1);
        expect(result.chat.remainingBytes).toBe(4);
        expect(result.settings.deleted).toBe(0);
        expect(result.settings.remainingBytes).toBe(4);
    });

    test('never deletes unrelated files from the backup directory', () => {
        writeBackup(directory, 'chat_a_20260915-100000.jsonl', 'chat', 1_000);
        writeBackup(directory, 'settings_default-user_20260915-100000.json', 'settings', 1_000);
        const unrelated = path.join(directory, 'manual-export.zip');
        fs.writeFileSync(unrelated, 'keep me', 'utf8');

        pruneBackupDirectory(directory, {
            chat: policy({ maxPerEntity: 0, maxTotalBackups: 0, maxTotalSizeBytes: 0 }),
            settings: policy({ maxPerEntity: 0, maxTotalBackups: 0, maxTotalSizeBytes: 0 }),
        });

        expect(fs.existsSync(unrelated)).toBe(true);
    });

    test('persists and reloads split per-user policies', () => {
        const userDirectories = { root: directory, backups: path.join(directory, 'backups') };
        const saved = saveBackupRetentionConfig(userDirectories, {
            chat: policy({ maxPerEntity: 7, maxTotalBackups: 42, maxTotalSizeBytes: 123456 }),
            settings: policy({ enabled: false, maxPerEntity: 3, maxTotalBackups: 12, maxTotalSizeBytes: 45678 }),
        });

        expect(hasBackupRetentionOverride(userDirectories)).toBe(true);
        expect(saved.chat.maxPerEntity).toBe(7);
        expect(saved.chat.maxTotalBackups).toBe(42);
        expect(saved.settings.enabled).toBe(false);
        expect(saved.settings.maxPerEntity).toBe(3);

        const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'backup-retention.json'), 'utf8'));
        expect(persisted).toMatchObject({
            version: 2,
            chat: { maxPerEntity: 7 },
            settings: { enabled: false, maxPerEntity: 3 },
        });

        const reloaded = getBackupRetentionConfig(userDirectories);
        expect(reloaded.chat.maxTotalSizeBytes).toBe(123456);
        expect(reloaded.settings.maxTotalSizeBytes).toBe(45678);
    });

    test('reads a historic flat override into both classes until the new form is saved', () => {
        const userDirectories = { root: directory, backups: path.join(directory, 'backups') };
        fs.writeFileSync(path.join(directory, 'backup-retention.json'), JSON.stringify({
            enabled: false,
            maxPerEntity: 5,
            maxTotalBackups: 25,
            maxTotalSizeBytes: 999,
        }));
        const loaded = getBackupRetentionConfig(userDirectories);
        expect(loaded.chat).toMatchObject({ enabled: false, maxPerEntity: 5, maxTotalBackups: 25, maxTotalSizeBytes: 999 });
        expect(loaded.settings).toMatchObject({ enabled: false, maxPerEntity: 5, maxTotalBackups: 25, maxTotalSizeBytes: 999 });
    });

    test('rejects invalid limits in either split policy without persisting', () => {
        const userDirectories = { root: directory, backups: path.join(directory, 'backups') };
        expect(() => saveBackupRetentionConfig(userDirectories, {
            chat: policy({ maxPerEntity: -2 }),
            settings: policy(),
        })).toThrow(/chat\.maxPerEntity/);
        expect(hasBackupRetentionOverride(userDirectories)).toBe(false);
    });

    test('reset removes the split per-user override', () => {
        const userDirectories = { root: directory, backups: path.join(directory, 'backups') };
        saveBackupRetentionConfig(userDirectories, {
            chat: policy({ maxPerEntity: 1 }),
            settings: policy({ maxPerEntity: 2 }),
        });
        expect(hasBackupRetentionOverride(userDirectories)).toBe(true);

        resetBackupRetentionConfig(userDirectories);
        expect(hasBackupRetentionOverride(userDirectories)).toBe(false);
        expect(fs.existsSync(path.join(directory, 'backup-retention.json'))).toBe(false);
    });

    test('reports aggregate and per-class usage without deleting anything', () => {
        const backupsDirectory = path.join(directory, 'backups');
        writeBackup(backupsDirectory, 'chat_a_20260915-100000.jsonl', '1234', 1_000);
        writeBackup(backupsDirectory, 'settings_default-user_20260915-110000.json', '56', 2_000);
        fs.writeFileSync(path.join(backupsDirectory, 'manual-export.zip'), 'ignored', 'utf8');

        const usage = getBackupDirectoryUsage(backupsDirectory);
        expect(usage.remaining).toBe(2);
        expect(usage.chatBackups).toBe(1);
        expect(usage.settingsBackups).toBe(1);
        expect(usage.remainingBytes).toBe(6);
        expect(usage.chat).toEqual({ count: 1, bytes: 4 });
        expect(usage.settings).toEqual({ count: 1, bytes: 2 });
    });
});
