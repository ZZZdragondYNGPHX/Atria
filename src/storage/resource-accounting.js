import fsp from 'node:fs/promises';
import path from 'node:path';
import { NATIVE_RESOURCE_KINDS } from '../native/contracts.js';
import { nativeResourceFileId } from './engines/native-resource-key.js';
import { projectExperienceOwner } from '../native/agent-intelligence/experience-repository.js';
import {
    classifyNativeRecord, emptyResourceTotals, nativeResourceIdentity,
    resourceContentBytes, resourceFingerprint, resourceCapabilities,
} from './resource-catalog.js';

const engineFile = name => /^atria-storage\.sqlite(?:-(?:wal|shm))?$/.test(name) || /^native-commit\.journal(?:\.prepared)?$/.test(name);
const fileCategory = relative => relative.startsWith('projects/') ? 'projects'
    : relative.startsWith('assets/atria-native/blobs/') ? 'media'
        : relative.startsWith('backups/') ? 'recovery'
            : relative === 'secrets.json' || relative === 'settings.json' ? 'settings' : 'advanced';
const structuredLegacyFile = relative => /^(settings\.json|stats\.json)$/.test(relative)
    || /^(chats|group chats|worlds|groups|OpenAI Settings|NovelAI Settings|KoboldAI Settings|TextGen Settings|themes|movingUI|QuickReplies|instruct|context|sysprompt|reasoning)\/.*\.(json|jsonl)$/.test(relative)
    || relative.startsWith('atria-native/resources/');

/** No symlink traversal and no hidden filesystem recovery/repair on enumeration. */
export async function listAccountFiles(root) {
    const files = [], errors = [];
    async function walk(directory, prefix = '') {
        let entries;
        try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT' || prefix) errors.push({ source: prefix || '.', reason: error.code }); return; }
        for (const entry of entries) {
            const relative = prefix + entry.name, absolute = path.join(directory, entry.name);
            try {
                if (entry.isSymbolicLink()) { errors.push({ source: relative, reason: 'symbolic-link-not-followed' }); continue; }
                if (entry.isDirectory()) await walk(absolute, relative + '/');
                else if (entry.isFile()) {
                    const stat = await fsp.stat(absolute);
                    files.push({ relative, absolute, bytes: stat.size, modifiedAt: stat.mtimeMs });
                }
            } catch (error) { errors.push({ source: relative, reason: error.code || error.message }); }
        }
    }
    await walk(root);
    return { files, errors };
}

export async function readAccountContent(tx, handle) {
    if (tx.listAccountContent) return tx.listAccountContent(handle);
    const native = [], errors = [];
    for (const kind of Object.values(NATIVE_RESOURCE_KINDS)) {
        try { native.push(...await tx.listResources({ kind, handle })); } catch (error) { errors.push({ source: kind, reason: error.code || error.message }); }
    }
    return { native, legacy: [], errors };
}

/** Same canonical content measurement is used by the panel and quota authority. */
export async function measureAccount({ engine, handle, directories, tx = null }) {
    if (!tx) return engine.withTransaction(handle, transaction => measureAccount({ engine, handle, directories, tx: transaction }));
    const startedAt = Date.now();
    const content = await readAccountContent(tx, handle);
    const { files, errors: fileErrors } = await listAccountFiles(directories.root);
    const legacyRecovery = await listAccountFiles(path.join(path.dirname(directories.root), '_storage-recovery', handle));
    files.push(...legacyRecovery.files.map(file => ({ ...file, relative: 'legacy-recovery/' + file.relative })));
    fileErrors.push(...legacyRecovery.errors.map(error => ({ ...error, source: 'legacy-recovery/' + error.source })));
    const errors = [...content.errors, ...fileErrors], totals = emptyResourceTotals(), units = [], claimed = new Set();
    const add = unit => { units.push(unit); totals[unit.category].bytes += unit.bytes; totals[unit.category].count++; };
    const projectScopes = new Map();
    for (const record of content.native) {
        try { const owner = projectExperienceOwner(record); if (owner) projectScopes.set(record.key.scopeId, owner); } catch (error) { errors.push({ source: record.key.kind, reason: error.message }); }
    }
    for (const record of content.native) {
        try {
            const owner = [NATIVE_RESOURCE_KINDS.agentExperience, NATIVE_RESOURCE_KINDS.agentEvolution].includes(record.key.kind) && projectScopes.get(record.key.scopeId);
            const category = owner ? 'projects' : classifyNativeRecord(record);
            add({ id: nativeResourceIdentity(record.key), source: 'native', category,
                bytes: resourceContentBytes(record.doc), version: resourceFingerprint(record.doc),
                key: record.key, owner: owner ? { type: 'project', id: owner } : undefined, updatedAt: record.updatedAt, capabilities: resourceCapabilities({ view: true }),
            });
            if (engine.kind === 'fs' && !record.key.encodedKey) {
                claimed.add(`atria-native/resources/${record.key.kind}/${record.key.sessionId ? record.key.sessionId + '/' : ''}${nativeResourceFileId(record.key)}.json`);
            }
        } catch (error) { errors.push({ source: record.key.kind, reason: error.message }); }
    }
    for (const record of content.legacy) add({ id: 'legacy:' + resourceFingerprint(record.identity),
        source: 'legacy', category: 'advanced', bytes: resourceContentBytes(record.doc), version: resourceFingerprint(record.doc),
        capabilities: resourceCapabilities({ view: true }),
    });
    let physicalBytes = 0;
    for (const file of files) {
        physicalBytes += file.bytes;
        // Prepared file publications are an engine commit mechanism. Their
        // metadata/reserved net growth is counted once; copies are physical only.
        if (file.relative.startsWith('atria-native/file-publications/')) continue;
        if (claimed.has(file.relative) || engineFile(file.relative)) continue;
        let category = fileCategory(file.relative);
        if (file.relative.startsWith('atria-native/recovery/') || file.relative.startsWith('legacy-recovery/')) category = 'recovery';
        if (file.relative.startsWith('assets/atria-native/blobs/')) {
            const hash = path.basename(file.relative);
            const retained = content.native.some(row => row.doc?.protocol === 'atria.storage-center.v1' && row.doc.type === 'recovery' && row.doc.hashes?.includes(hash));
            const active = content.native.some(row => row.key.kind === NATIVE_RESOURCE_KINDS.assetRef && row.doc.contentHash === hash
                || row.key.kind === NATIVE_RESOURCE_KINDS.packageVersion && row.doc.packageContentHash === hash);
            if (retained && !active) category = 'recovery';
        }
        let bytes = file.bytes, method = 'file-bytes';
        // Legacy structured file content follows the same canonical JSON rule
        // as its SQL counterpart. Project sources and backups remain raw files.
        if (structuredLegacyFile(file.relative) && category !== 'recovery'
            && /\.(json|jsonl)$/.test(file.relative)) {
            try {
                const text = await fsp.readFile(file.absolute, 'utf8');
                let doc;
                if (file.relative.endsWith('.jsonl')) {
                    const [header, ...body] = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
                    doc = { header, body };
                } else {
                    doc = JSON.parse(text);
                    if (file.relative.startsWith('atria-native/resources/') && doc?.key && doc?.doc) doc = doc.doc;
                }
                bytes = resourceContentBytes(doc); method = 'canonical-json-utf8';
            } catch { /* Unknown or damaged file: retain measured raw bytes. */ }
        }
        add({ id: 'file:' + Buffer.from(file.relative).toString('base64url'), source: 'file', category,
            bytes, method, version: resourceFingerprint({ bytes: file.bytes, modifiedAt: file.modifiedAt }),
            relative: file.relative, updatedAt: file.modifiedAt, capabilities: resourceCapabilities({ view: true }),
        });
    }
    const knownBytes = units.reduce((sum, unit) => sum + unit.bytes, 0), completedAt = Date.now();
    return {
        protocol: 1, scope: { type: 'server', handle }, startedAt, completedAt,
        consistency: 'transaction-content-and-file-observation', completeness: errors.length ? 'partial' : 'complete',
        knownBytes, totalBytes: errors.length ? null : knownBytes, unknownBytes: errors.length ? null : 0,
        physical: { bytes: physicalBytes, scope: 'account-files', databaseAllocationIncluded: engine.kind === 'sqlite',
            sharedDatabaseBytes: ['mysql', 'postgres'].includes(engine.kind) ? null : undefined },
        categories: totals, errors, units,
        version: resourceFingerprint(units.map(({ id, version, bytes }) => ({ id, version, bytes })).sort((a, b) => a.id.localeCompare(b.id))),
    };
}
