import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureShadowRepo, snapshotLiveToShadow, reconcileShadowToLive } from '../../src/sync/shadow.js';

function dirsAt(root) {
    return {
        root,
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        groups: path.join(root, 'groups'),
        groupChats: path.join(root, 'group chats'),
        worlds: path.join(root, 'worlds'),
    };
}

describe('reconcileShadowToLive', () => {
    let userRoot, liveRoot;
    beforeEach(() => {
        userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-sync-rec-shadow-'));
        liveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-sync-rec-live-'));
        for (const sub of ['characters', 'chats', 'worlds', 'groups', 'group chats']) {
            fs.mkdirSync(path.join(liveRoot, sub), { recursive: true });
        }
    });
    afterEach(() => {
        fs.rmSync(userRoot, { recursive: true, force: true });
        fs.rmSync(liveRoot, { recursive: true, force: true });
    });

    test('copies shadow files into live and deletes live files no longer in shadow', async () => {
        // Live starts with two files; shadow snapshot mirrors them.
        fs.writeFileSync(path.join(liveRoot, 'characters', 'a.png'), 'A');
        fs.writeFileSync(path.join(liveRoot, 'characters', 'b.png'), 'B');
        await snapshotLiveToShadow({ userRoot, peerId: 'p', directories: dirsAt(liveRoot), enabledCategoryIds: ['characters'] });

        // Simulate that after a merge, the shadow has c.png (new) and only a.png; b.png was deleted in shadow.
        const paths = await ensureShadowRepo({ userRoot, peerId: 'p' });
        fs.unlinkSync(path.join(paths.workdir, 'characters', 'b.png'));
        fs.writeFileSync(path.join(paths.workdir, 'characters', 'c.png'), 'C');

        // Manually commit the changed shadow state (this is what the merge step would do in production).
        // We use isomorphic-git directly because IsomorphicGitClient assumes <dir>/.git layout.
        const git = (await import('isomorphic-git')).default;
        await git.add({ fs, dir: paths.workdir, gitdir: paths.gitDir, filepath: 'characters/c.png' });
        await git.remove({ fs, dir: paths.workdir, gitdir: paths.gitDir, filepath: 'characters/b.png' });
        await git.commit({
            fs, dir: paths.workdir, gitdir: paths.gitDir,
            message: 'manual edit',
            author: { name: 't', email: 't@t' },
        });

        const result = await reconcileShadowToLive({
            userRoot, peerId: 'p',
            directories: dirsAt(liveRoot),
            enabledCategoryIds: ['characters'],
        });

        expect(fs.existsSync(path.join(liveRoot, 'characters', 'a.png'))).toBe(true);
        expect(fs.existsSync(path.join(liveRoot, 'characters', 'b.png'))).toBe(false); // deleted
        expect(fs.existsSync(path.join(liveRoot, 'characters', 'c.png'))).toBe(true);  // created
        expect(fs.readFileSync(path.join(liveRoot, 'characters', 'c.png'), 'utf8')).toBe('C');
        expect(result.written).toContain('characters/c.png');
        expect(result.deleted).toContain('characters/b.png');
    });

    test('uses atomic writes — interrupted mid-write leaves old file intact', async () => {
        fs.writeFileSync(path.join(liveRoot, 'characters', 'a.png'), 'OLD_CONTENT');
        await snapshotLiveToShadow({ userRoot, peerId: 'p', directories: dirsAt(liveRoot), enabledCategoryIds: ['characters'] });

        const paths = await ensureShadowRepo({ userRoot, peerId: 'p' });
        fs.writeFileSync(path.join(paths.workdir, 'characters', 'a.png'), 'NEW_CONTENT');
        const git = (await import('isomorphic-git')).default;
        await git.add({ fs, dir: paths.workdir, gitdir: paths.gitDir, filepath: 'characters/a.png' });
        await git.commit({
            fs, dir: paths.workdir, gitdir: paths.gitDir,
            message: 'change', author: { name: 't', email: 't@t' },
        });

        // Inject a failure: monkey-patch fs.renameSync (which write-file-atomic uses) to throw.
        const fsModule = await import('node:fs');
        const original = fsModule.default.renameSync;
        fsModule.default.renameSync = () => { throw new Error('disk full!'); };
        try {
            await expect(reconcileShadowToLive({
                userRoot, peerId: 'p',
                directories: dirsAt(liveRoot),
                enabledCategoryIds: ['characters'],
            })).rejects.toThrow(/disk full/);
        } finally {
            fsModule.default.renameSync = original;
        }

        // Old content is intact (write-file-atomic writes to .tmp then renames).
        expect(fs.readFileSync(path.join(liveRoot, 'characters', 'a.png'), 'utf8')).toBe('OLD_CONTENT');
    });
    test('reconcile neither imports nor deletes FS chat patch recovery artifacts', async () => {
        const chatDir = path.join(liveRoot, 'chats', 'char_a');
        fs.mkdirSync(chatDir, { recursive: true });
        fs.writeFileSync(path.join(chatDir, 'chat.jsonl'), '{"chat_metadata":{"integrity":"x"}}\n');
        const localJournal = path.join(chatDir, 'chat.jsonl.atria-patch-journal');
        fs.writeFileSync(localJournal, 'owned-by-local-transaction');

        await snapshotLiveToShadow({
            userRoot,
            peerId: 'p',
            directories: dirsAt(liveRoot),
            enabledCategoryIds: ['chats'],
        });
        const paths = await ensureShadowRepo({ userRoot, peerId: 'p' });

        const remoteArtifact = path.join(
            paths.workdir,
            'chats',
            'char_a',
            'remote.jsonl.atria-patch-journal',
        );
        fs.writeFileSync(remoteArtifact, 'must-not-cross-devices');

        const result = await reconcileShadowToLive({
            userRoot,
            peerId: 'p',
            directories: dirsAt(liveRoot),
            enabledCategoryIds: ['chats'],
        });

        expect(fs.readFileSync(localJournal, 'utf8')).toBe('owned-by-local-transaction');
        expect(fs.existsSync(path.join(chatDir, 'remote.jsonl.atria-patch-journal'))).toBe(false);
        expect(result.deleted.some(file => file.includes('atria-patch-journal'))).toBe(false);
        expect(result.written.some(file => file.includes('atria-patch-journal'))).toBe(false);
    });

});
