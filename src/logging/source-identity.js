import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const SOURCE_IDENTITY_ALGORITHM = 'atria-source-v1';
const hash = value => createHash('sha256').update(value).digest('hex');

// Protocol scope, not a repository-read permission. Only aggregate hashes leave
// this module. User data, generated bundles and installed dependencies are not
// source identity; runtime extensions outside Git make identity uncertain.
export function isRuntimeSource(file) {
    if (/^public\/(?:_cache|user|chats|characters|backgrounds|groups|group chats|worlds|assets|themes|User Avatars)\//.test(file)) return false;
    if (/^public\/lib\.(?:core|optional)\.bundle\.js(?:\.map)?$/.test(file)) return false;
    return /^(?:src|public|default|plugins)\//.test(file)
        || /^(?:package(?:-lock)?\.json|[^/]+\.(?:js|mjs|cjs))$/.test(file);
}

export async function captureSourceIdentity(directory) {
    const unavailable = reasons => ({ algorithm: SOURCE_IDENTITY_ALGORITHM, revision: null, branch: null,
        workspaceId: null, fingerprint: null, reasons });
    try {
        const root = await realpath(directory);
        const git = async args => (await exec('git', ['-C', root, ...args], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 })).stdout;
        const revision = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
        const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
        const workspaceId = hash(process.platform === 'win32' ? root.toLowerCase() : root);
        const scan = async () => {
            const entries = (await git(['ls-files', '--stage', '-z'])).split('\0').filter(Boolean)
                .map(line => { const [metadata, file] = line.split('\t'); return { metadata, file }; })
                .filter(entry => isRuntimeSource(entry.file)).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
            const digest = createHash('sha256').update(SOURCE_IDENTITY_ALGORITHM + '\0' + revision + '\0');
            let total = 0;
            for (const { metadata, file } of entries) {
                const [mode, , stage] = metadata.split(' ');
                if (!/^100(?:644|755)$/.test(mode) || stage !== '0') throw new Error('unsafe_source');
                const target = path.join(root, file);
                let state;
                try { state = await lstat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
                let content = 'missing';
                if (state) {
                    if (!state.isFile() || state.isSymbolicLink() || await realpath(target) !== target) throw new Error('unsafe_source');
                    total += state.size;
                    if (state.size > 32 * 1024 * 1024 || total > 512 * 1024 * 1024) throw new Error('source_limit');
                    content = hash(await readFile(target));
                }
                digest.update(JSON.stringify([file, mode, content]) + '\n');
            }
            return digest.digest('hex');
        };
        const fingerprint = await scan();
        const reasons = [];
        const unknown = (await git(['ls-files', '--others', '--exclude-standard', '-z']))
            + (await git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', 'src', 'public', 'default', 'plugins']));
        if (unknown.split('\0').filter(Boolean).some(isRuntimeSource)) reasons.push('runtime_relevant_untracked');
        if (fingerprint !== await scan() || revision !== (await git(['rev-parse', 'HEAD'])).trim()) reasons.push('source_changed_during_capture');
        return { algorithm: SOURCE_IDENTITY_ALGORITHM, revision, branch, workspaceId, fingerprint, reasons };
    } catch {
        // No Git stderr, paths or content in the public identity document.
        return unavailable(['source_capture_unavailable']);
    }
}
