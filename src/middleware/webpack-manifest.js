import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getWebpackCacheVersion } from '../../webpack.config.js';
export const WEBPACK_MANIFEST_FILE = 'atria-bundles.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const outputNames = config => Object.keys(config.entry ?? {}).map(name => name + '.js').sort();
export function inspectWebpackOutput(config) {
    const directory = config?.output?.path, names = outputNames(config);
    if (!directory || !names.length) return { valid: false, reason: 'output_unconfigured' };
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(directory, WEBPACK_MANIFEST_FILE), 'utf8')); } catch { return { valid: false, reason: 'manifest_unavailable' }; }
    if (manifest.schemaVersion !== 1 || manifest.inputFingerprint !== getWebpackCacheVersion()) return { valid: false, reason: 'input_fingerprint_changed' };
    if (!Array.isArray(manifest.files) || JSON.stringify(manifest.files.map(file => file.name).sort()) !== JSON.stringify(names)) return { valid: false, reason: 'bundle_set_mismatch' };
    for (const file of manifest.files) {
        let bytes;
        try { bytes = fs.readFileSync(path.join(directory, file.name)); } catch { return { valid: false, reason: 'bundle_missing' }; }
        if (!bytes.length || bytes.length !== file.size || hash(bytes) !== file.sha256) return { valid: false, reason: 'bundle_integrity_mismatch' };
    }
    return { valid: true, reason: 'verified_manifest', inputFingerprint: manifest.inputFingerprint };
}
export function writeWebpackManifest(config) {
    const directory = config.output.path;
    const manifest = { schemaVersion: 1, inputFingerprint: getWebpackCacheVersion(), files: outputNames(config).map(name => {
        const bytes = fs.readFileSync(path.join(directory, name));
        if (!bytes.length) throw new Error('Empty Webpack bundle: ' + name);
        return { name, size: bytes.length, sha256: hash(bytes) };
    }) };
    const temporary = path.join(directory, WEBPACK_MANIFEST_FILE + '.' + randomUUID());
    try { fs.writeFileSync(temporary, JSON.stringify(manifest)); fs.renameSync(temporary, path.join(directory, WEBPACK_MANIFEST_FILE)); } finally { fs.rmSync(temporary, { force: true }); }
    return manifest;
}
