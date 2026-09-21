import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

import {
    ATRIA_DISTRIBUTION_FORMAT,
    ATRIA_DISTRIBUTION_LIMITS,
    ATRIA_DISTRIBUTION_MANIFEST,
    buildAtriaDistribution,
    createAtriaDistributionFromFiles,
    inspectAtriaDistribution,
    restoreAtriaDistribution,
} from '../../src/game-package/distribution.js';

const roots = [];

function tempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(dir);
    return dir;
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function validFiles() {
    return new Map([
        ['game.json', Buffer.from(JSON.stringify({
            format: 'atria-game',
            manifestVersion: 1,
            id: 'distribution.demo',
            name: 'Distribution Demo',
            version: '1.2.3',
            runtime: { min: 1 },
            world: {
                schema: 'world/schema.json',
                initial: 'world/initial.json',
            },
            logic: { entry: 'logic/game.json' },
            ui: {
                mode: 'hybrid',
                entry: 'ui/game.html',
                selectors: 'ui/selectors.json',
            },
            llm: {
                observations: 'llm/observations.json',
            },
        }, null, 2) + '\n')],
        ['world/schema.json', Buffer.from(JSON.stringify({
            type: 'object',
            additionalProperties: false,
            required: ['hp'],
            properties: {
                hp: { type: 'integer', minimum: 0, maximum: 20 },
            },
        }, null, 2) + '\n')],
        ['world/initial.json', Buffer.from('{"hp":10}\n')],
        ['logic/game.json', Buffer.from(JSON.stringify({
            commands: [{
                id: 'heal',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                events: [{ type: 'Healed', payload: {} }],
                llm: { expose: true },
            }],
            reducers: [{
                type: 'Healed',
                payloadSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                assign: { hp: 20 },
            }],
            rules: [],
            interpretations: [],
        }, null, 2) + '\n')],
        ['ui/game.html', Buffer.from('<main>你好 — nested text</main>\n', 'utf8')],
        ['ui/selectors.json', Buffer.from('[{"id":"player.hp","formula":"world.hp"}]\n')],
        ['llm/observations.json', Buffer.from('[{"id":"player.hp","formula":"world.hp"}]\n')],
        ['knowledge/lore/zone.md', Buffer.from('# Zone\nNested knowledge.\n')],
        ['skills/combat/rules.md', Buffer.from('# Combat\nNested skill.\n')],
        ['assets/icon.bin', Buffer.from([0, 1, 2, 3, 255, 128, 64, 0])],
    ]);
}

function writeFiles(root, files) {
    for (const [relativePath, data] of files) {
        const target = path.join(root, ...relativePath.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
    }
}

function mutateManifest(archive, mutator) {
    const zip = new AdmZip(archive);
    const entry = zip.getEntry(ATRIA_DISTRIBUTION_MANIFEST);
    const manifest = JSON.parse(entry.getData().toString('utf8'));
    mutator(manifest);
    zip.updateFile(
        ATRIA_DISTRIBUTION_MANIFEST,
        Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
    );
    return zip.toBuffer();
}

function replaceArchiveFile(archive, archivePath, data) {
    const zip = new AdmZip(archive);
    zip.updateFile(archivePath, Buffer.from(data));
    return zip.toBuffer();
}

function patchZipEntryName(buffer, from, to) {
    if (Buffer.byteLength(from) !== Buffer.byteLength(to)) {
        throw new Error('patched ZIP entry names must have equal byte length');
    }
    const output = Buffer.from(buffer);
    let offset = 0;
    let patched = 0;
    while ((offset = output.indexOf(from, offset, 'utf8')) !== -1) {
        output.write(to, offset, 'utf8');
        offset += to.length;
        patched += 1;
    }
    if (patched < 2) throw new Error('expected local and central ZIP names to be patched');
    return output;
}

describe('.atria distribution container', () => {
    test('builds a standard ZIP with root manifest and lossless nested text/binary inventory', () => {
        const { archive, manifest } = createAtriaDistributionFromFiles(validFiles(), {
            cardId: 'hero-card',
        });

        expect(Buffer.isBuffer(archive)).toBe(true);
        expect(manifest).toMatchObject({
            format: ATRIA_DISTRIBUTION_FORMAT,
            manifestVersion: 1,
            package: {
                id: 'distribution.demo',
                name: 'Distribution Demo',
                version: '1.2.3',
            },
            card: {
                sourceId: 'hero-card',
            },
            game: {
                root: 'game',
                manifest: 'game/game.json',
            },
            integrity: {
                algorithm: 'sha256',
            },
        });

        const zip = new AdmZip(archive);
        expect(zip.getEntry('manifest.json')).not.toBeNull();
        expect(zip.getEntry('game/game.json')).not.toBeNull();
        expect(zip.getEntry('game/knowledge/lore/zone.md')).not.toBeNull();
        expect(zip.getEntry('game/assets/icon.bin')).not.toBeNull();

        const inspected = inspectAtriaDistribution(archive);
        expect(inspected.files.get('ui/game.html').toString('utf8'))
            .toBe('<main>你好 — nested text</main>\n');
        expect(inspected.files.get('assets/icon.bin'))
            .toEqual(Buffer.from([0, 1, 2, 3, 255, 128, 64, 0]));
        expect(inspected.manifest.inventory.map(item => item.path))
            .toContain('game/skills/combat/rules.md');
    });

    test('excludes save/progress/checkpoint material and .git from distribution by default', () => {
        const root = tempDir('atria-dist-source-');
        writeFiles(root, validFiles());
        fs.mkdirSync(path.join(root, '.git'), { recursive: true });
        fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        fs.mkdirSync(path.join(root, 'saves'), { recursive: true });
        fs.writeFileSync(path.join(root, 'saves', 'slot1.json'), '{"hp":1}');
        fs.mkdirSync(path.join(root, 'progress'), { recursive: true });
        fs.writeFileSync(path.join(root, 'progress', 'player.json'), '{"xp":1}');
        fs.mkdirSync(path.join(root, 'checkpoints'), { recursive: true });
        fs.writeFileSync(path.join(root, 'checkpoints', 'cp.json'), '{}');

        const { archive } = buildAtriaDistribution(root);
        const inspected = inspectAtriaDistribution(archive);

        expect([...inspected.files.keys()].some(file => file.startsWith('.git/'))).toBe(false);
        expect([...inspected.files.keys()].some(file => file.startsWith('saves/'))).toBe(false);
        expect([...inspected.files.keys()].some(file => file.startsWith('progress/'))).toBe(false);
        expect([...inspected.files.keys()].some(file => file.startsWith('checkpoints/'))).toBe(false);
    });

    test('rejects malformed or unsupported container manifest', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());

        const unsupported = mutateManifest(archive, manifest => {
            manifest.manifestVersion = 999;
        });
        expect(() => inspectAtriaDistribution(unsupported)).toThrow(/manifestVersion/);

        const malformedZip = new AdmZip();
        malformedZip.addFile('manifest.json', Buffer.from('{bad json'));
        expect(() => inspectAtriaDistribution(malformedZip.toBuffer())).toThrow(/manifest\.json is malformed/);
    });

    test('rejects missing, undeclared and integrity-mismatched files', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());

        const missingZip = new AdmZip(archive);
        missingZip.deleteFile('game/assets/icon.bin');
        expect(() => inspectAtriaDistribution(missingZip.toBuffer()))
            .toThrow(/inventory does not match archive file count/);

        const extraZip = new AdmZip(archive);
        extraZip.addFile('game/assets/extra.bin', Buffer.from([1, 2, 3]));
        expect(() => inspectAtriaDistribution(extraZip.toBuffer()))
            .toThrow(/inventory does not match archive file count|Undeclared/);

        const tampered = replaceArchiveFile(archive, 'game/assets/icon.bin', Buffer.from([9, 9, 9]));
        expect(() => inspectAtriaDistribution(tampered))
            .toThrow(/Size mismatch|Integrity mismatch/);
    });

    test('rejects container metadata that disagrees with game/game.json', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());
        const mismatched = mutateManifest(archive, manifest => {
            manifest.package.version = '9.9.9';
        });
        expect(() => inspectAtriaDistribution(mismatched))
            .toThrow(/package metadata does not match/);
    });

    test('rejects traversal and backslash-ambiguous entry paths before extraction', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());

        const traversalZip = new AdmZip(archive);
        traversalZip.addFile('game/AAAAAAAAAAAA', Buffer.from('escape'));
        let traversal = traversalZip.toBuffer();
        traversal = patchZipEntryName(traversal, 'game/AAAAAAAAAAAA', 'game/../escape.x');
        expect(() => inspectAtriaDistribution(traversal))
            .toThrow(/path traversal|illegal segment|relative/i);

        const slashZip = new AdmZip(archive);
        slashZip.addFile('game/BBBBBBBB.txt', Buffer.from('escape'));
        let ambiguous = slashZip.toBuffer();
        ambiguous = patchZipEntryName(ambiguous, 'game/BBBBBBBB.txt', 'game\\BBBBBBBB.txt');
        expect(() => inspectAtriaDistribution(ambiguous))
            .toThrow(/illegal or ambiguous path/);
    });

    test('rejects file/child path conflicts', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());
        const zip = new AdmZip(archive);
        zip.addFile('game/conflict', Buffer.from('file'));
        zip.addFile('game/conflict/child.txt', Buffer.from('child'));

        expect(() => inspectAtriaDistribution(zip.toBuffer()))
            .toThrow(/Conflicting .atria file paths/);
    });

    test('rejects oversized or suspiciously compressed entries', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());
        const zip = new AdmZip(archive);
        const bomb = Buffer.alloc(2 * 1024 * 1024, 0);
        zip.addFile('game/bomb.bin', bomb);

        const manifestEntry = zip.getEntry('manifest.json');
        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
        manifest.inventory.push({
            path: 'game/bomb.bin',
            size: bomb.length,
            sha256: '0'.repeat(64),
        });
        // Deliberately leave inventorySha256 stale. Path/ratio validation should
        // reject before any extraction reaches the filesystem.
        zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

        expect(() => inspectAtriaDistribution(zip.toBuffer()))
            .toThrow(/integrity hash mismatch|decompression-ratio/);

        expect(ATRIA_DISTRIBUTION_LIMITS.maxFileBytes)
            .toBeLessThan(ATRIA_DISTRIBUTION_LIMITS.maxTotalUncompressedBytes);
    });

    test('restore replaces source files only after validation, preserves .git, and removes stale source', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());
        const target = tempDir('atria-dist-restore-');
        fs.mkdirSync(path.join(target, '.git'), { recursive: true });
        fs.writeFileSync(path.join(target, '.git', 'HEAD'), 'keep-me');
        fs.writeFileSync(path.join(target, 'stale.txt'), 'remove-me');

        const result = restoreAtriaDistribution(archive, target);

        expect(result.filesRestored).toBe(validFiles().size);
        expect(fs.readFileSync(path.join(target, '.git', 'HEAD'), 'utf8')).toBe('keep-me');
        expect(fs.existsSync(path.join(target, 'stale.txt'))).toBe(false);
        expect(fs.readFileSync(path.join(target, 'knowledge', 'lore', 'zone.md'), 'utf8'))
            .toBe('# Zone\nNested knowledge.\n');
        expect(fs.readFileSync(path.join(target, 'assets', 'icon.bin')))
            .toEqual(Buffer.from([0, 1, 2, 3, 255, 128, 64, 0]));
    });

    test('restore refuses invalid archive without touching current source', () => {
        const { archive } = createAtriaDistributionFromFiles(validFiles());
        const invalid = mutateManifest(archive, manifest => {
            manifest.manifestVersion = 999;
        });
        const target = tempDir('atria-dist-no-touch-');
        fs.writeFileSync(path.join(target, 'existing.txt'), 'still-here');

        expect(() => restoreAtriaDistribution(invalid, target)).toThrow(/manifestVersion/);
        expect(fs.readFileSync(path.join(target, 'existing.txt'), 'utf8')).toBe('still-here');
    });
});
