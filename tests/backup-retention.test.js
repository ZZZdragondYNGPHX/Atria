import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getBackupEntityKey, pruneBackupDirectory } from '../src/backup-retention.js';

function makeTempDirectory() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'luker-backup-retention-'));
}

function writeBackup(directory, name, content, modifiedMs) {
    const filePath = path.join(directory, name);
    fs.writeFileSync(filePath, content, 'utf8');
    const modified = new Date(modifiedMs);
    fs.utimesSync(filePath, modified, modified);
    return filePath;
}

describe('backup retention manager', () => {
    let directory;

    beforeEach(() => {
        directory = makeTempDirectory();
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test('derives stable entity keys from chat and settings backup names', () => {
        expect(getBackupEntityKey('chat_some_character_2026-09-15@12h00m00s.jsonl')).toBe('chat_some_character');
        expect(getBackupEntityKey('settings_default-user_2026-09-15@12h00m00s.json')).toBe('settings_default-user');
        expect(getBackupEntityKey('notes.txt')).toBeNull();
    });

    test('keeps only the newest backups per entity', () => {
        writeBackup(directory, 'chat_alice_2026-09-15@10h00m00s.jsonl', 'a1', 1_000);
        writeBackup(directory, 'chat_alice_2026-09-15@11h00m00s.jsonl', 'a2', 2_000);
        writeBackup(directory, 'chat_alice_2026-09-15@12h00m00s.jsonl', 'a3', 3_000);
        writeBackup(directory, 'chat_bob_2026-09-15@11h00m00s.jsonl', 'b1', 2_000);
        writeBackup(directory, 'chat_bob_2026-09-15@12h00m00s.jsonl', 'b2', 3_000);

        const result = pruneBackupDirectory(directory, {
            enabled: true,
            maxPerEntity: 2,
            maxTotalBackups: -1,
            maxTotalSizeBytes: -1,
        });

        expect(result.deleted).toBe(1);
        expect(fs.existsSync(path.join(directory, 'chat_alice_2026-09-15@10h00m00s.jsonl'))).toBe(false);
        expect(result.remaining).toBe(4);
    });

    test('enforces the global backup count by deleting the oldest files first', () => {
        writeBackup(directory, 'chat_a_2026-09-15@10h00m00s.jsonl', 'a', 1_000);
        writeBackup(directory, 'chat_b_2026-09-15@11h00m00s.jsonl', 'b', 2_000);
        writeBackup(directory, 'settings_default-user_2026-09-15@12h00m00s.json', 'c', 3_000);
        writeBackup(directory, 'chat_c_2026-09-15@13h00m00s.jsonl', 'd', 4_000);

        const result = pruneBackupDirectory(directory, {
            enabled: true,
            maxPerEntity: -1,
            maxTotalBackups: 3,
            maxTotalSizeBytes: -1,
        });

        expect(result.deleted).toBe(1);
        expect(fs.existsSync(path.join(directory, 'chat_a_2026-09-15@10h00m00s.jsonl'))).toBe(false);
        expect(result.remaining).toBe(3);
    });

    test('enforces the byte budget across chat and settings backups', () => {
        writeBackup(directory, 'chat_a_2026-09-15@10h00m00s.jsonl', '1234', 1_000);
        writeBackup(directory, 'settings_default-user_2026-09-15@11h00m00s.json', '5678', 2_000);
        writeBackup(directory, 'chat_b_2026-09-15@12h00m00s.jsonl', 'abcd', 3_000);

        const result = pruneBackupDirectory(directory, {
            enabled: true,
            maxPerEntity: -1,
            maxTotalBackups: -1,
            maxTotalSizeBytes: 8,
        });

        expect(result.deleted).toBe(1);
        expect(result.remainingBytes).toBe(8);
        expect(fs.existsSync(path.join(directory, 'chat_a_2026-09-15@10h00m00s.jsonl'))).toBe(false);
    });

    test('never deletes unrelated files from the backup directory', () => {
        writeBackup(directory, 'chat_a_2026-09-15@10h00m00s.jsonl', 'chat', 1_000);
        const unrelated = path.join(directory, 'manual-export.zip');
        fs.writeFileSync(unrelated, 'keep me', 'utf8');

        pruneBackupDirectory(directory, {
            enabled: true,
            maxPerEntity: 0,
            maxTotalBackups: 0,
            maxTotalSizeBytes: 0,
        });

        expect(fs.existsSync(unrelated)).toBe(true);
    });
});
