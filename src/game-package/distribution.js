import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

import AdmZip from 'adm-zip';

import {
    getGamePackageDeclaredFiles,
    validateGameManifest,
} from '../../public/scripts/extensions/game-runtime/manifest.js';
import { validateWorldState } from '../../public/scripts/extensions/game-runtime/world/schema.js';
import { compileDeclarativeLogic } from '../../public/scripts/extensions/game-runtime/logic/declarative.js';
import { createCommandRegistry } from '../../public/scripts/extensions/game-runtime/logic/command-registry.js';
import { createReducerRegistry } from '../../public/scripts/extensions/game-runtime/logic/reducers.js';
import { createRulesEngine } from '../../public/scripts/extensions/game-runtime/logic/rules.js';
import { createInterpretationMappingRegistry } from '../../public/scripts/extensions/game-runtime/logic/interpretations.js';
import { compileGameSelectorDefinitions } from '../../public/scripts/extensions/game-runtime/ui/declarative.js';
import { compileGameObservationDefinitions } from '../../public/scripts/extensions/game-runtime/llm/declarative-observations.js';

export const ATRIA_DISTRIBUTION_FORMAT = 'atria-distribution';
export const ATRIA_DISTRIBUTION_VERSION = 1;
export const ATRIA_DISTRIBUTION_MANIFEST = 'manifest.json';

export const ATRIA_DISTRIBUTION_LIMITS = Object.freeze({
    maxArchiveBytes: 128 * 1024 * 1024,
    maxEntries: 2048,
    maxFileBytes: 32 * 1024 * 1024,
    maxTotalUncompressedBytes: 256 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxPathLength: 512,
    maxSegmentLength: 255,
});

const EXCLUDED_SOURCE_PREFIXES = Object.freeze([
    '.git/',
    '.atria-save/',
    '.atria-saves/',
    'save/',
    'saves/',
    'progress/',
    'checkpoints/',
]);

const EXCLUDED_SOURCE_ROOTS = new Set([
    '.git',
    '.atria-save',
    '.atria-saves',
    'save',
    'saves',
    'progress',
    'checkpoints',
]);

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function canonicalInventoryHash(inventory) {
    const canonical = [...inventory]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(item => item.path + '\0' + item.size + '\0' + item.sha256 + '\0')
        .join('');
    return sha256(Buffer.from(canonical, 'utf8'));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeArchivePath(input, options = {}) {
    if (typeof input !== 'string') throw new Error('Archive entry path must be a string');
    const raw = input;
    if (!raw || raw.includes('\0') || raw.includes('\\')) {
        throw new Error('Archive entry has an illegal or ambiguous path');
    }
    if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
        throw new Error('Archive entry path must be package-relative');
    }

    let value = raw;
    if (options.directory && value.endsWith('/')) value = value.slice(0, -1);
    if (!value || value.length > ATRIA_DISTRIBUTION_LIMITS.maxPathLength) {
        throw new Error('Archive entry path exceeds limits');
    }

    const segments = value.split('/');
    if (
        segments.some(segment => (
            !segment
            || segment === '.'
            || segment === '..'
            || segment.length > ATRIA_DISTRIBUTION_LIMITS.maxSegmentLength
        ))
    ) {
        throw new Error('Archive entry contains path traversal or an illegal segment');
    }
    return segments.join('/');
}

function normalizeProjectRelativePath(input) {
    const value = normalizeArchivePath(String(input || ''));
    if (value === ATRIA_DISTRIBUTION_MANIFEST) {
        return value;
    }
    return value;
}

function shouldExcludeSource(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    if (EXCLUDED_SOURCE_ROOTS.has(normalized)) return true;
    return EXCLUDED_SOURCE_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function readSourceFiles(projectDir) {
    const files = new Map();
    let totalBytes = 0;

    function walk(directory, prefix = '') {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
            const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
            if (shouldExcludeSource(relativePath)) continue;
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath, relativePath);
                continue;
            }
            if (!entry.isFile()) continue;

            const safePath = normalizeProjectRelativePath(relativePath);
            const stat = fs.statSync(fullPath);
            if (stat.size > ATRIA_DISTRIBUTION_LIMITS.maxFileBytes) {
                throw new Error(`Source file '${safePath}' exceeds the .atria per-file limit`);
            }
            totalBytes += stat.size;
            if (totalBytes > ATRIA_DISTRIBUTION_LIMITS.maxTotalUncompressedBytes) {
                throw new Error('.atria source project exceeds the total uncompressed-size limit');
            }
            files.set(safePath, fs.readFileSync(fullPath));
        }
    }

    walk(projectDir);
    if (files.size > ATRIA_DISTRIBUTION_LIMITS.maxEntries - 1) {
        throw new Error('.atria source project exceeds the archive entry limit');
    }
    return files;
}

function parseJsonBuffer(buffer, label, sourcePath) {
    try {
        return JSON.parse(buffer.toString('utf8'));
    } catch (error) {
        throw new Error(
            `${label} '${sourcePath}' is not valid JSON: ${error?.message || String(error)}`,
        );
    }
}

export function validateAtriaSourceFiles(files) {
    if (!(files instanceof Map)) {
        throw new Error('.atria source validation requires a file Map');
    }
    const gameBuffer = files.get('game.json');
    if (!gameBuffer) throw new Error('.atria Source Project requires game.json');

    const rawGame = parseJsonBuffer(gameBuffer, 'Game manifest', 'game.json');
    const validation = validateGameManifest(rawGame);
    if (!validation.ok) {
        throw new Error('Game manifest validation failed: ' + validation.errors.slice(0, 12).join('; '));
    }
    const game = validation.manifest;

    for (const declared of getGamePackageDeclaredFiles(game)) {
        if (!files.has(declared)) {
            throw new Error(`Game manifest references missing source file '${declared}'`);
        }
    }

    if (game.world) {
        const schema = parseJsonBuffer(files.get(game.world.schema), 'World Schema', game.world.schema);
        const initial = parseJsonBuffer(files.get(game.world.initial), 'Initial State', game.world.initial);
        if (!isPlainObject(schema) || !isPlainObject(initial)) {
            throw new Error('World Schema and Initial State must be JSON objects');
        }
        const worldValidation = validateWorldState(initial, schema);
        if (!worldValidation.ok) {
            throw new Error(
                'Initial State does not satisfy World Schema: '
                + worldValidation.errors.slice(0, 12).join('; '),
            );
        }
    }

    if (game.logic) {
        if (!game.logic.entry.endsWith('.json')) {
            throw new Error(
                `Game Logic entry '${game.logic.entry}' is unsupported in .atria v1; declarative JSON is required`,
            );
        }
        const rawLogic = parseJsonBuffer(files.get(game.logic.entry), 'Game Logic', game.logic.entry);
        if (!isPlainObject(rawLogic)) throw new Error('Game Logic must be a JSON object');
        const compiled = compileDeclarativeLogic(rawLogic);
        createCommandRegistry(compiled.commands);
        createReducerRegistry(compiled.reducers);
        createRulesEngine(compiled.rules);
        createInterpretationMappingRegistry(compiled.interpretations);
    }

    if (game.ui?.selectors) {
        compileGameSelectorDefinitions(
            parseJsonBuffer(files.get(game.ui.selectors), 'Selectors', game.ui.selectors),
        );
    }
    if (game.llm?.observations) {
        compileGameObservationDefinitions(
            parseJsonBuffer(files.get(game.llm.observations), 'Observations', game.llm.observations),
        );
    }

    return game;
}

function buildContainerManifest(game, inventory, options = {}) {
    const cardId = String(options.cardId || '').trim();
    return {
        format: ATRIA_DISTRIBUTION_FORMAT,
        manifestVersion: ATRIA_DISTRIBUTION_VERSION,
        package: {
            id: game.id,
            name: game.name,
            version: game.version,
            runtime: structuredClone(game.runtime),
        },
        card: {
            ...(cardId ? { sourceId: cardId } : {}),
        },
        game: {
            root: 'game',
            manifest: 'game/game.json',
        },
        inventory,
        integrity: {
            algorithm: 'sha256',
            inventorySha256: canonicalInventoryHash(inventory),
        },
    };
}

export function buildAtriaDistribution(projectDir, options = {}) {
    const sourceDir = path.resolve(String(projectDir || ''));
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error('.atria build requires an existing Source Project directory');
    }

    const files = readSourceFiles(sourceDir);
    const game = validateAtriaSourceFiles(files);
    const inventory = [...files.entries()]
        .map(([relativePath, buffer]) => ({
            path: 'game/' + relativePath,
            size: buffer.length,
            sha256: sha256(buffer),
        }))
        .sort((left, right) => left.path.localeCompare(right.path));

    const manifest = buildContainerManifest(game, inventory, options);
    const zip = new AdmZip();
    zip.addFile(
        ATRIA_DISTRIBUTION_MANIFEST,
        Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'),
    );
    for (const item of inventory) {
        const relativePath = item.path.slice('game/'.length);
        zip.addFile(item.path, files.get(relativePath));
    }

    const archive = zip.toBuffer();
    if (archive.length > ATRIA_DISTRIBUTION_LIMITS.maxArchiveBytes) {
        throw new Error('.atria archive exceeds the compressed archive-size limit');
    }

    // A builder must never emit an artifact that the matching importer rejects.
    inspectAtriaDistribution(archive);

    return {
        archive,
        manifest,
    };
}

function validateContainerManifest(raw) {
    if (!isPlainObject(raw)) throw new Error('.atria manifest must be a JSON object');
    if (raw.format !== ATRIA_DISTRIBUTION_FORMAT) {
        throw new Error(`Unsupported .atria format '${String(raw.format || '')}'`);
    }
    if (raw.manifestVersion !== ATRIA_DISTRIBUTION_VERSION) {
        throw new Error(
            'Unsupported .atria manifestVersion '
            + String(raw.manifestVersion),
        );
    }
    if (!isPlainObject(raw.package) || !isPlainObject(raw.card) || !isPlainObject(raw.game)) {
        throw new Error('.atria manifest package/card/game metadata is malformed');
    }
    if (raw.game.root !== 'game' || raw.game.manifest !== 'game/game.json') {
        throw new Error('.atria manifest has an unsupported Game Project layout');
    }
    if (!Array.isArray(raw.inventory)) {
        throw new Error('.atria manifest requires inventory[]');
    }
    if (
        !isPlainObject(raw.integrity)
        || raw.integrity.algorithm !== 'sha256'
        || !/^[a-f0-9]{64}$/.test(String(raw.integrity.inventorySha256 || ''))
    ) {
        throw new Error('.atria manifest integrity block is malformed');
    }
    return raw;
}

function entryCompressedSize(entry) {
    return Number(entry?.header?.compressedSize ?? 0);
}

function entryUncompressedSize(entry) {
    return Number(entry?.header?.size ?? entry?.header?.uncompressedSize ?? 0);
}

function validateZipEntryNames(entries) {
    const seen = new Set();
    const folded = new Set();
    const files = new Set();

    for (const entry of entries) {
        const safePath = normalizeArchivePath(entry.entryName, { directory: entry.isDirectory });
        const lower = safePath.toLocaleLowerCase('en-US');
        if (seen.has(safePath) || folded.has(lower)) {
            throw new Error(`Duplicate or case-conflicting .atria entry '${safePath}'`);
        }
        seen.add(safePath);
        folded.add(lower);

        if (!entry.isDirectory) files.add(safePath);
    }

    for (const filePath of files) {
        const segments = filePath.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            const parent = segments.slice(0, index).join('/');
            if (files.has(parent)) {
                throw new Error(
                    `Conflicting .atria file paths '${parent}' and '${filePath}'`,
                );
            }
        }
    }
}

function safeEntryData(entry) {
    const size = entryUncompressedSize(entry);
    const compressedSize = entryCompressedSize(entry);
    if (!Number.isFinite(size) || size < 0 || size > ATRIA_DISTRIBUTION_LIMITS.maxFileBytes) {
        throw new Error(`Archive entry '${entry.entryName}' exceeds the per-file limit`);
    }
    if (!Number.isFinite(compressedSize) || compressedSize < 0) {
        throw new Error(`Archive entry '${entry.entryName}' has invalid compressed size`);
    }
    if (size > 1024 * 1024) {
        const ratio = size / Math.max(1, compressedSize);
        if (ratio > ATRIA_DISTRIBUTION_LIMITS.maxCompressionRatio) {
            throw new Error(
                `Archive entry '${entry.entryName}' exceeds the decompression-ratio limit`,
            );
        }
    }

    let data;
    try {
        data = entry.getData();
    } catch (error) {
        throw new Error(
            `Archive entry '${entry.entryName}' is corrupt: ${error?.message || String(error)}`,
        );
    }
    if (!Buffer.isBuffer(data) || data.length !== size) {
        throw new Error(`Archive entry '${entry.entryName}' is corrupt or size-mismatched`);
    }
    return data;
}

export function inspectAtriaDistribution(archiveInput) {
    const archive = Buffer.isBuffer(archiveInput)
        ? archiveInput
        : Buffer.from(archiveInput || []);
    if (archive.length === 0) throw new Error('.atria archive is empty');
    if (archive.length > ATRIA_DISTRIBUTION_LIMITS.maxArchiveBytes) {
        throw new Error('.atria archive exceeds the compressed archive-size limit');
    }

    let zip;
    let entries;
    try {
        zip = new AdmZip(archive);
        entries = zip.getEntries();
    } catch (error) {
        throw new Error('Malformed .atria ZIP container: ' + (error?.message || String(error)));
    }
    if (entries.length === 0 || entries.length > ATRIA_DISTRIBUTION_LIMITS.maxEntries) {
        throw new Error('.atria archive entry count is outside supported limits');
    }

    validateZipEntryNames(entries);

    const manifestEntry = entries.find(entry => (
        !entry.isDirectory && entry.entryName === ATRIA_DISTRIBUTION_MANIFEST
    ));
    if (!manifestEntry) throw new Error('.atria archive is missing root manifest.json');

    const manifestData = safeEntryData(manifestEntry);
    let rawManifest;
    try {
        rawManifest = JSON.parse(manifestData.toString('utf8'));
    } catch (error) {
        throw new Error('.atria manifest.json is malformed: ' + (error?.message || String(error)));
    }
    const manifest = validateContainerManifest(rawManifest);

    const inventoryMap = new Map();
    let declaredTotal = 0;
    for (const item of manifest.inventory) {
        if (!isPlainObject(item)) throw new Error('.atria inventory entry must be an object');
        const inventoryPath = normalizeArchivePath(String(item.path || ''));
        if (!inventoryPath.startsWith('game/')) {
            throw new Error('.atria inventory files must live under game/');
        }
        const size = Number(item.size);
        const digest = String(item.sha256 || '');
        if (
            !Number.isInteger(size)
            || size < 0
            || size > ATRIA_DISTRIBUTION_LIMITS.maxFileBytes
            || !/^[a-f0-9]{64}$/.test(digest)
        ) {
            throw new Error(`Malformed .atria inventory entry '${inventoryPath}'`);
        }
        if (inventoryMap.has(inventoryPath)) {
            throw new Error(`Duplicate .atria inventory path '${inventoryPath}'`);
        }
        inventoryMap.set(inventoryPath, { size, sha256: digest });
        declaredTotal += size;
        if (declaredTotal > ATRIA_DISTRIBUTION_LIMITS.maxTotalUncompressedBytes) {
            throw new Error('.atria inventory exceeds the total uncompressed-size limit');
        }
    }

    if (canonicalInventoryHash(manifest.inventory) !== manifest.integrity.inventorySha256) {
        throw new Error('.atria inventory integrity hash mismatch');
    }

    const actualEntries = entries.filter(entry => (
        !entry.isDirectory && entry.entryName !== ATRIA_DISTRIBUTION_MANIFEST
    ));
    if (actualEntries.length !== manifest.inventory.length) {
        throw new Error('.atria inventory does not match archive file count');
    }

    const files = new Map();
    let actualTotal = 0;
    for (const entry of actualEntries) {
        const archivePath = normalizeArchivePath(entry.entryName);
        const expected = inventoryMap.get(archivePath);
        if (!expected) {
            throw new Error(`Undeclared .atria archive file '${archivePath}'`);
        }
        if (!archivePath.startsWith('game/')) {
            throw new Error(`Unexpected .atria file outside game/: '${archivePath}'`);
        }

        const data = safeEntryData(entry);
        actualTotal += data.length;
        if (actualTotal > ATRIA_DISTRIBUTION_LIMITS.maxTotalUncompressedBytes) {
            throw new Error('.atria archive exceeds the total uncompressed-size limit');
        }
        if (data.length !== expected.size) {
            throw new Error(`Size mismatch for .atria file '${archivePath}'`);
        }
        if (sha256(data) !== expected.sha256) {
            throw new Error(`Integrity mismatch for .atria file '${archivePath}'`);
        }

        const relativePath = archivePath.slice('game/'.length);
        if (shouldExcludeSource(relativePath)) {
            throw new Error(`Reserved runtime/persistence path is not allowed in .atria: '${relativePath}'`);
        }
        files.set(relativePath, data);
    }

    if (!files.has('game.json')) {
        throw new Error('.atria archive is missing game/game.json');
    }

    const game = validateAtriaSourceFiles(files);
    if (
        manifest.package.id !== game.id
        || manifest.package.name !== game.name
        || manifest.package.version !== game.version
        || JSON.stringify(manifest.package.runtime) !== JSON.stringify(game.runtime)
    ) {
        throw new Error('.atria container package metadata does not match game/game.json');
    }

    return Object.freeze({
        manifest: structuredClone(manifest),
        game: structuredClone(game),
        files,
    });
}

function writeStagedFiles(stageDir, files) {
    for (const [relativePath, data] of files) {
        const safePath = normalizeProjectRelativePath(relativePath);
        const target = path.join(stageDir, ...safePath.split('/'));
        const resolved = path.resolve(target);
        const root = path.resolve(stageDir) + path.sep;
        if (!resolved.startsWith(root)) {
            throw new Error(`Unsafe staged .atria path '${relativePath}'`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
    }
}

function moveDirectoryContents(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) return;
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        fs.renameSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
    }
}

export function restoreAtriaDistribution(archive, targetDir) {
    const inspected = inspectAtriaDistribution(archive);
    const targetInput = String(targetDir || '').trim();
    if (!targetInput) throw new Error('.atria restore requires a target Source Project directory');
    const target = path.resolve(targetInput);

    const parent = path.dirname(target);
    fs.mkdirSync(parent, { recursive: true });
    fs.mkdirSync(target, { recursive: true });

    const tempRoot = fs.mkdtempSync(path.join(parent, '.atria-restore-'));
    const stageDir = path.join(tempRoot, 'stage');
    const backupDir = path.join(tempRoot, 'backup');
    fs.mkdirSync(stageDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    try {
        writeStagedFiles(stageDir, inspected.files);

        try {
            for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
                if (entry.name === '.git') continue;
                fs.renameSync(path.join(target, entry.name), path.join(backupDir, entry.name));
            }
            moveDirectoryContents(stageDir, target);
        } catch (error) {
            for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
                if (entry.name === '.git') continue;
                fs.rmSync(path.join(target, entry.name), { recursive: true, force: true });
            }
            moveDirectoryContents(backupDir, target);
            throw error;
        }

        fs.rmSync(backupDir, { recursive: true, force: true });
        return {
            manifest: inspected.manifest,
            game: inspected.game,
            filesRestored: inspected.files.size,
        };
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

// Exported only for focused security tests.
export function createAtriaDistributionFromFiles(filesInput, options = {}) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-distribution-build-'));
    try {
        for (const [relativePath, data] of filesInput instanceof Map ? filesInput : new Map()) {
            const safePath = normalizeProjectRelativePath(relativePath);
            const target = path.join(tempRoot, ...safePath.split('/'));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, data);
        }
        return buildAtriaDistribution(tempRoot, options);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}
