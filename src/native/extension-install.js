import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGitClient } from '../git/client.js';
import { assertExtensionFiles } from './extensions-store.js';

export async function readExternalExtension(url, { clone = (url, root) => createGitClient({ backend: 'builtin' }).clone(url, root, { depth: 1 }) } = {}) {
    const remote = new URL(url);
    if (remote.protocol !== 'https:' || remote.username || remote.password || remote.hash || remote.search) throw new TypeError('Use an HTTPS Git repository URL without credentials');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atri-extension-'));
    try {
        await clone(remote.href, root);
        const manifest = JSON.parse(await fs.readFile(path.join(root, 'atria.extension.json'), 'utf8'));
        if (manifest.schemaVersion !== 1 || manifest.apiVersion !== 1 || typeof manifest.name !== 'string' || typeof manifest.entrypoint !== 'string'
            || Object.keys(manifest).some(key => !['schemaVersion', 'apiVersion', 'name', 'entrypoint'].includes(key))) throw new TypeError('Invalid Atria browser extension manifest');
        const files = {}; let bytes = 0;
        async function walk(relative = '') {
            for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
                if (entry.name === '.git') continue;
                if (entry.isSymbolicLink()) throw new TypeError('Plugin symlinks are unsupported');
                const name = relative ? relative + '/' + entry.name : entry.name;
                if (entry.isDirectory()) { if (name.split('/').length > 12) throw new TypeError('Plugin directory depth limit'); await walk(name); } else if (entry.isFile()) {
                    const stat = await fs.stat(path.join(root, name)); bytes += stat.size;
                    if (bytes > 4 * 1024 * 1024 || Object.keys(files).length >= 128) throw new TypeError('Plugin size/file limit');
                    const buffer = await fs.readFile(path.join(root, name));
                    if (buffer.includes(0)) throw new TypeError('Plugin assets must be text; use SVG/CSS/JSON');
                    files[name] = buffer.toString('utf8');
                }
            }
        }
        await walk(); assertExtensionFiles(files, manifest.entrypoint);
        return { name: manifest.name, kind: 'external', entrypoint: manifest.entrypoint, files, sourceUrl: remote.href,
            enabled: false, targets: { global: true, presets: [], works: [] } };
    } finally { await fs.rm(root, { recursive: true, force: true }); }
}
