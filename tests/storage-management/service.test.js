import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    deleteStorageResource,
    listStorageRecoveryPoints,
    readStorageResource,
    resolveStorageResource,
    restoreStorageRecoveryPoint,
    writeStorageResource,
} from '../../src/storage/management.js';

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-storage-management-'));
    fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(root, 'worlds'), { recursive: true });
    fs.mkdirSync(path.join(root, 'user', 'files'), { recursive: true });
    return root;
}

describe('storage management service', () => {
    let root;
    let recoveryRoot;

    beforeEach(() => {
        root = makeRoot();
        recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-storage-recovery-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(recoveryRoot, { recursive: true, force: true });
    });

    test('resolves managed backup paths but rejects traversal', () => {
        fs.writeFileSync(path.join(root, 'backups', 'chat_alice_20260918-100000.jsonl'), '{}\n');
        const resource = resolveStorageResource(root, ['backups', 'chat-backups', 'chat_alice_20260918-100000.jsonl'], 'file');
        expect(resource.relativePath).toBe(path.join('backups', 'chat_alice_20260918-100000.jsonl'));
        expect(resource.capabilities.edit).toBe(true);
        expect(() => resolveStorageResource(root, ['backups', 'chat-backups', '../secrets.json'], 'file')).toThrow(/Unsafe/);
    });

    test('protects secrets and storage database files from generic content access', async () => {
        fs.writeFileSync(path.join(root, 'secrets.json'), '{"api":"secret"}');
        fs.writeFileSync(path.join(root, 'atria-storage.sqlite'), 'db');
        const secrets = resolveStorageResource(root, ['other', 'secrets.json'], 'sensitive-blob');
        const db = resolveStorageResource(root, ['other', 'atria-storage.sqlite'], 'file');
        expect(secrets.protected).toBe(true);
        expect(secrets.capabilities).toMatchObject({ view: true, viewContent: false, edit: false, delete: false, download: false });
        expect(db.protected).toBe(true);
        expect((await readStorageResource(secrets)).content).toBeNull();
    });

    test('validates JSON before atomic edit and creates a recovery point', async () => {
        const file = path.join(root, 'worlds', 'demo.json');
        fs.writeFileSync(file, '{"entries":{}}');
        const resource = resolveStorageResource(root, ['worlds', 'demo.json'], 'file');
        await expect(writeStorageResource({
            resource,
            content: '{broken',
            recoveryRoot,
            handle: 'u',
        })).rejects.toMatchObject({ code: 'E_INVALID_CONTENT' });
        expect(fs.readFileSync(file, 'utf8')).toBe('{"entries":{}}');

        const before = fs.statSync(file).mtimeMs;
        const result = await writeStorageResource({
            resource,
            content: '{"entries":{"1":{"content":"ok"}}}',
            recoveryRoot,
            handle: 'u',
            expectedModifiedMs: before,
        });
        expect(result.recovery.id).toBeTruthy();
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).entries['1'].content).toBe('ok');

        const points = await listStorageRecoveryPoints(recoveryRoot, 'u');
        expect(points).toHaveLength(1);
        expect(points[0]).toMatchObject({ action: 'edit', relativePath: path.join('worlds', 'demo.json') });
    });

    test('JSONL validation reports the bad line', async () => {
        const file = path.join(root, 'backups', 'chat_a_20260918-100000.jsonl');
        fs.writeFileSync(file, '{}\n{}\n');
        const resource = resolveStorageResource(root, ['backups', 'chat-backups', path.basename(file)], 'file');
        await expect(writeStorageResource({
            resource,
            content: '{}\nnot-json\n',
            recoveryRoot,
            handle: 'u',
        })).rejects.toMatchObject({ code: 'E_INVALID_CONTENT' });
    });

    test('delete creates a recovery point and can restore it', async () => {
        const file = path.join(root, 'user', 'files', 'note.txt');
        fs.writeFileSync(file, 'before');
        const resource = resolveStorageResource(root, ['attachments', 'files', 'note.txt'], 'file');
        const { recovery } = await deleteStorageResource({ resource, recoveryRoot, handle: 'u' });
        expect(fs.existsSync(file)).toBe(false);

        await restoreStorageRecoveryPoint({
            recoveryRoot,
            handle: 'u',
            userRoot: root,
            id: recovery.id,
        });
        expect(fs.readFileSync(file, 'utf8')).toBe('before');
    });

    test('settings.json remains viewable but cannot be deleted generically', () => {
        fs.writeFileSync(path.join(root, 'settings.json'), '{}');
        const resource = resolveStorageResource(root, ['presets', 'main-settings', 'settings.json'], 'file');
        expect(resource.capabilities.viewContent).toBe(true);
        expect(resource.capabilities.edit).toBe(true);
        expect(resource.capabilities.delete).toBe(false);
    });
});
