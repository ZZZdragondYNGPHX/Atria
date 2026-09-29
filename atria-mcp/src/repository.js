import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, open, opendir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { redact } from './policy.js';
const exec = promisify(execFile);
const MAX_FILE = 2 * 1024 * 1024;
const MAX_FILES = 2000;
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const inside = (root, target) => { const p = relative(root, target); return !isAbsolute(p) && p !== '..' && !p.startsWith('..' + sep); };
export const ARTIFACT_ROOTS = Object.freeze(['.artifacts', 'test-results', 'playwright-report', 'coverage', 'build', 'dist', 'tests/artifacts', 'tests/coverage', 'tests/.e2e-screenshots', 'android-app/app/build']);
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export class RepositoryAccessPolicy {
    constructor(root, dataRoots = []) {
        this.root = root;
        this.dataRoots = dataRoots.map(p => resolve(root, p));
    }
    path(path) {
        if (typeof path !== 'string' || !path || path.length > 1000 || /[\\:\x00-\x1f\x7f]/.test(path)
            || isAbsolute(path) || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p))) throw new Error('Invalid repository path.');
        return path;
    }
    classify(path) {
        this.path(path);
        const parts = path.toLowerCase().split('/');
        if (/^(?:config\.(?:ya?ml|conf)(?:\..*)?|content\.log|access\.log|whitelist\.txt)$/i.test(path)
            || parts.some(p => /^(?:\.npmrc|\.netrc|_netrc|\.git-credentials|\.pypirc|\.ssh|\.aws|\.azure|certs)$/.test(p))) return 'sensitive';
        if (/^public\/(?:characters|user avatars|backgrounds|groups|group chats|worlds|user|themes|openai settings|koboldai settings|novelai settings|textgen settings|instruct|context|movingui|quickreplies|assets|error)(?:\/|$)/i.test(path)
            || /^(?:docker\/(?:config|user|extensions)|vectors|thumbnails)(?:\/|$)/i.test(path)
            || /^public\/(?:stats\.json|css\/(?:user|bg_load)\.css)$/i.test(path)) return 'product/user data';
        if (parts.some(p => /^\.env/.test(p) || /^(?:secrets?|credentials?|cookies?|keystores?)(?:[.-]|$)/.test(p))
            || /(?:^|\/)(?:id_rsa|id_ed25519|settings\.json|storage-state[^/]*|auth[^/]*\.json)$/i.test(path)
            || /\.(?:pem|key|p12|pfx|jks|keystore|sqlite3?|db)(?:$|[.-])/i.test(path)) return 'sensitive';
        if (this.dataRoots.some(root => inside(root, resolve(this.root, path)))
            || parts.some(p => /^(?:data|dataroot|user-data|userdata|user_data|users|sessions|chats|backups|uploads|vector-store)$/.test(p))) return 'product/user data';
        if (parts.some(p => /^(?:\.git|node_modules|\.cache|cache|\.gradle|\.npm|\.venv|__pycache__)$/.test(p))) return 'dependency/cache';
        if (ARTIFACT_ROOTS.some(root => path.toLowerCase() === root || path.toLowerCase().startsWith(root + '/'))) return 'development artifact';
        return 'repository';
    }
    allow(path, artifact = false) {
        const category = this.classify(path);
        if (category !== (artifact ? 'development artifact' : 'repository')) throw new Error('RepositoryAccessPolicy denied: ' + category);
        return category;
    }
    async file(path, artifact = false) {
        this.allow(path, artifact);
        let current = this.root;
        for (const part of path.split('/')) {
            current = resolve(current, part);
            if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink access denied.');
        }
        const canonical = await realpath(current);
        if (!inside(this.root, canonical) || !same(current, canonical)) throw new Error('Symlink/traversal access denied.');
        return current;
    }
}

export class RepositoryObservation {
    constructor(root, dataRoots = []) { this.root = root; this.dataRoots = dataRoots; }
    async init() {
        this.root = await realpath(this.root);
        if (!same(await realpath((await this.git(['rev-parse', '--show-toplevel'])).trim()), this.root)) throw new Error('Repository root required.');
        this.policy = new RepositoryAccessPolicy(this.root, this.dataRoots);
        await this.refreshRuntimeRoots();
        return this;
    }
    async refreshRuntimeRoots() {
        // Keep prior exclusions too: moving a dataRoot must not expose its old state.
        // Local runtime config is used only to exclude its dataRoot, never returned.
        for (const name of ['config.yaml', 'config.yml']) {
            try {
                const target = resolve(this.root, name);
                if ((await lstat(target)).isSymbolicLink()) throw new Error('Runtime config symlink requires explicit data-root configuration.');
                const handle = await open(target, 'r');
                let config;
                try { if ((await handle.stat()).size > MAX_FILE) throw new Error('Runtime config too large.'); config = await handle.readFile('utf8'); } finally { await handle.close(); }
                this.excludeConfigRoot(config);
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
    }
    excludeConfigRoot(config) {
        try {
            const doc = parseDocument(config, { uniqueKeys: true });
            if (doc.errors.length || doc.warnings.length) throw new Error();
            const parsed = doc.toJS({ maxAliasCount: 20 });
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
            if (!Object.hasOwn(parsed, 'dataRoot')) return;
            if (typeof parsed.dataRoot !== 'string' || !parsed.dataRoot.trim() || /[\x00-\x1f]/.test(parsed.dataRoot)) throw new Error();
            const root = resolve(this.root, parsed.dataRoot);
            if (!this.policy.dataRoots.includes(root)) this.policy.dataRoots.push(root);
        } catch { throw new Error('Runtime config cannot safely establish dataRoot exclusions.'); }
    }
    async git(args, maxBuffer = 8 * 1024 * 1024) {
        try { return (await exec('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', '-C', this.root, ...args],
            { maxBuffer, timeout: 15000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' } })).stdout; }
        catch { throw new Error('Git evidence unavailable or exceeds bounded output/time limit.'); }
    }
    async inventory() {
        await this.refreshRuntimeRoots();
        const tracked = (await this.git(['ls-files', '-z', '--cached'])).split('\0').filter(Boolean);
        const untracked = (await this.git(['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean);
        return new Map([...tracked.map(p => [p, 'tracked']), ...untracked.map(p => [p, 'safe untracked development'])]);
    }
    async bytes(path, artifact = false, max = MAX_FILE) {
        const target = await this.policy.file(path, artifact);
        const handle = await open(target, 'r');
        try {
            const st = await handle.stat();
            if (!st.isFile() || st.size > max) throw new Error('Not a regular file or exceeds byte limit.');
            const buffer = Buffer.alloc(Math.min(st.size + 1, max + 1));
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            if (bytesRead > max) throw new Error('File exceeds byte limit.');
            await this.policy.file(path, artifact);
            return buffer.subarray(0, bytesRead);
        } finally { await handle.close(); }
    }
    filter(bytes) {
        if (bytes.includes(0)) throw new Error('Binary content: use artifact inspect.');
        const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (/-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH)[^-]*-----/.test(source)) throw new Error('Sensitive private-key content denied.');
        return redact(source);
    }
    async read({ path, startLine = 1, lineCount = 120 }, artifact = false) {
        const category = artifact ? this.policy.allow(path, true) : (await this.inventory()).get(path);
        if (!category) throw new Error('Only tracked or non-ignored development files are readable.');
        const bytes = await this.bytes(path, artifact);
        const lines = this.filter(bytes).split(/\r?\n/);
        const selected = []; let used = 0; let truncated = false;
        for (let i = startLine - 1; i < Math.min(lines.length, startLine - 1 + lineCount); i++) {
            const line = `${i + 1}: ${lines[i]}`;
            if (used + line.length + 1 > 30000) {
                if (!selected.length) selected.push(line.slice(0, 29900) + ' [line truncated]');
                truncated = true; break;
            }
            selected.push(line); used += line.length + 1;
        }
        return { path, category, sha256: createHash('sha256').update(bytes).digest('hex'), totalLines: lines.length,
            content: selected.join('\n'), truncated,
            nextLine: startLine + selected.length <= lines.length ? startLine + selected.length : null };
    }

    async list({ pathPrefix = '', offset = 0, limit = 100 } = {}, artifact = false) {
        if (pathPrefix) this.policy.path(pathPrefix.replace(/\/$/, ''));
        const inventory = artifact ? await this.artifacts() : await this.inventory();
        const entries = []; let denied = 0;
        for (const [path, category] of inventory) {
            if (!path.startsWith(pathPrefix)) continue;
            try { await this.policy.file(path, artifact); entries.push({ path, category }); } catch { denied++; }
        }
        entries.sort((a, b) => a.path.localeCompare(b.path));
        return { entries: entries.slice(offset, offset + limit), total: entries.length, denied,
            nextOffset: offset + limit < entries.length ? offset + limit : null, scanLimit: artifact ? MAX_FILES : null, scanTruncated: artifact ? this.artifactScanTruncated : false };
    }
    async search({ query, pathPrefix = '', offset = 0, startLine = 1, limit = 30 }, artifact = false) {
        if (!query) throw new Error('Search query required.');
        const listing = await this.list({ pathPrefix, offset, limit: MAX_FILES }, artifact);
        const matches = []; let skipped = 0; let visited = 0; let bytesScanned = 0;
        for (const { path } of listing.entries) {
            visited++;
            try {
                const bytes = await this.bytes(path, artifact); bytesScanned += bytes.length;
                if (bytesScanned > 16 * MAX_FILE) return { matches, skipped, limited: true, nextOffset: offset + visited - 1 };
                const lines = this.filter(bytes).split(/\r?\n/);
                for (let i = visited === 1 ? startLine - 1 : 0; i < lines.length; i++) if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    matches.push({ path, line: i + 1, text: lines[i].slice(0, 500) });
                    if (matches.length >= limit) return { matches, skipped, limited: true, nextOffset: offset + visited - 1, nextLine: i + 2, scanTruncated: listing.scanTruncated };
                }
            } catch { skipped++; }
        }
        return { matches, skipped, limited: listing.nextOffset !== null || listing.scanTruncated, nextOffset: listing.nextOffset, nextLine: 1, scanTruncated: listing.scanTruncated };
    }
    async artifacts() {
        await this.refreshRuntimeRoots();
        this.artifactScanTruncated = false;
        const found = new Map(); let visited = 0;
        const walk = async (path, depth) => {
            if (++visited > MAX_FILES || depth > 6) { this.artifactScanTruncated = true; return; }
            try {
                await this.policy.file(path, true);
                const st = await lstat(resolve(this.root, path));
                if (st.isDirectory()) {
                    const dir = await opendir(resolve(this.root, path));
                    for await (const child of dir) { if (visited >= MAX_FILES) { this.artifactScanTruncated = true; break; } await walk(path + '/' + child.name, depth + 1); }
                } else if (st.isFile()) found.set(path, 'development artifact');
            } catch { /* Denied/missing roots and files are not disclosed. */ }
        };
        for (const root of ARTIFACT_ROOTS) await walk(root, 0);
        return found;
    }
    async artifact(args) {
        await this.refreshRuntimeRoots();
        if (args.operation === 'list') return this.list(args, true);
        if (args.operation === 'read') return this.read(args, true);
        if (args.operation === 'search') return this.search(args, true);
        const bytes = await this.bytes(args.path, true, args.operation === 'image' ? MAX_FILE : 32 * MAX_FILE);
        if (args.operation === 'image') {
            const mimeType = imageTypes[extname(args.path).toLowerCase()];
            const valid = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
                : mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
                    : mimeType === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
            if (!valid) throw new Error('Unsupported image signature.');
            return { content: [{ type: 'image', data: bytes.toString('base64'), mimeType }] };
        }
        return { path: args.path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
            extension: extname(args.path), inspection: 'bounded byte identity only; archive execution/extraction and product validation not performed' };
    }
    async revision(ref = 'HEAD') {
        if (!/^[A-Za-z0-9][A-Za-z0-9_./~^+-]{0,199}$/.test(ref) || ref.includes('..')) throw new Error('Invalid Git revision.');
        return (await this.git(['rev-parse', '--verify', ref + '^{commit}'])).trim();
    }
    async historicalRoots(revision) {
        const entries = (await this.git(['ls-tree', '-z', revision, '--', 'config.yaml', 'config.yml'])).split('\0').filter(Boolean);
        for (const entry of entries) {
            if (!/^100(?:644|755) blob /.test(entry)) throw new Error('Historical runtime config must be regular.');
            const oid = entry.split(' ')[2].split('\t')[0];
            const config = await this.git(['cat-file', 'blob', oid], MAX_FILE);
            this.excludeConfigRoot(config);
        }
    }
    async historical(path, revision) {
        this.policy.allow(path);
        const entry = (await this.git(['ls-tree', '-z', revision, '--', path])).split('\0')[0];
        if (!/^100(?:644|755) blob [a-f0-9]+\t/.test(entry)) throw new Error('Historical path is not a regular file.');
        const oid = entry.split(' ')[2].split('\t')[0];
        if (Number((await this.git(['cat-file', '-s', oid])).trim()) > MAX_FILE) throw new Error('Historical blob exceeds limit.');
        return this.filter(Buffer.from(await this.git(['cat-file', 'blob', oid], MAX_FILE + 1)));
    }
    async guardDiffContent(path, revisions, workingTree) {
        const inspect = bytes => {
            const filtered = this.filter(bytes);
            if (filtered === '[REDACTED SENSITIVE MULTILINE CONTENT]') throw new Error('Sensitive multiline diff denied.');
        };
        for (const revision of revisions) {
            const entry = (await this.git(['ls-tree', '-z', revision, '--', path])).split('\0')[0];
            if (!entry) continue;
            if (!/^100(?:644|755) blob /.test(entry)) throw new Error('Non-regular historical diff denied.');
            inspect(Buffer.from(await this.git(['cat-file', 'blob', entry.split(' ')[2].split('\t')[0]], MAX_FILE)));
        }
        if (!workingTree) return;
        const entry = (await this.git(['ls-files', '--stage', '-z', '--', path])).split('\0')[0];
        if (entry) {
            if (!/^100(?:644|755) [a-f0-9]+ 0\t/.test(entry)) throw new Error('Non-regular or unresolved index diff denied.');
            inspect(Buffer.from(await this.git(['cat-file', 'blob', entry.split(' ')[1]], MAX_FILE)));
        }
        try { inspect(await this.bytes(path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    async evidence({ operation, path, ref = 'HEAD', base, staged = false, limit = 30, startLine = 1, lineCount = 120 }) {
        await this.refreshRuntimeRoots();
        if (path) this.policy.allow(path);
        if (operation === 'status') {
            const fields = (await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0');
            const entries = []; let denied = 0;
            for (let i = 0; i < fields.length; i++) {
                if (!fields[i]) continue;
                const status = fields[i].slice(0, 2), name = fields[i].slice(3);
                const oldPath = /[RC]/.test(status) ? fields[++i] : undefined;
                if (path && name !== path && oldPath !== path) continue;
                try { this.policy.allow(name); if (oldPath) this.policy.allow(oldPath); entries.push({ path: name, status, ...(oldPath ? { oldPath } : {}) }); } catch { denied++; }
            }
            return redact({ entries: entries.slice(0, limit), denied, truncated: entries.length > limit });
        }
        const revision = await this.revision(ref);
        await this.historicalRoots(revision);
        if (path) this.policy.allow(path);
        if (operation === 'log') return { revision, content: redact(await this.git(['log', '-n', String(limit), '--format=%H %aI %s', revision, '--', ...(path ? [path] : [])])).slice(0, 30000) };
        if (operation === 'show' || operation === 'blame') {
            if (!path) throw new Error('Exact path required for historical show/blame.');
            const content = await this.historical(path, revision);
            if (operation === 'show') return { path, revision, content: content.split(/\r?\n/).slice(startLine - 1, startLine - 1 + lineCount).join('\n').slice(0, 30000) };
            const count = content.split(/\r?\n/).length;
            return { path, revision, content: redact(await this.git(['blame', '--no-textconv', '-L', `${startLine},${Math.min(count, startLine + lineCount - 1)}`, revision, '--', path])).slice(0, 30000) };
        }
        if (operation !== 'diff') throw new Error('Unsupported Git operation.');
        const from = base ? await this.revision(base) : undefined;
        if (from) await this.historicalRoots(from);
        if (!from) {
            for (const name of ['config.yaml', 'config.yml']) {
                const entry = (await this.git(['ls-files', '--stage', '-z', '--', name])).split('\0')[0];
                if (!entry) continue;
                if (!/^100(?:644|755) [a-f0-9]+ 0\t/.test(entry)) throw new Error('Index runtime config is not a regular resolved file.');
                this.excludeConfigRoot(await this.git(['cat-file', 'blob', entry.split(' ')[1]], MAX_FILE));
            }
        }
        if (base && staged) throw new Error('base and staged cannot be combined.');
        if (!base && ref !== 'HEAD') throw new Error('A revision diff requires base and ref.');
        const scope = from ? [from, revision] : staged ? ['--cached'] : [];
        const names = (await this.git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', ...scope, '--', ...(path ? [path] : [])])).split('\0').filter(Boolean);
        const files = []; let denied = 0;
        for (const name of names.slice(0, 200)) {
            try {
                this.policy.allow(name);
                await this.guardDiffContent(name, from ? [from, revision] : [revision], !from);
                // Validate whole output before truncation (including multiline private keys).
                const raw = await this.git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', '--unified=3', ...scope, '--', name], MAX_FILE);
                if (/^(?:(?:old|new|deleted file|new file) mode (?:120000|160000)|index .* (?:120000|160000))$/m.test(raw) || /-----BEGIN .*PRIVATE KEY/.test(raw)) throw new Error('Private key denied.');
                files.push({ path: name, content: this.filter(Buffer.from(raw)).slice(0, 10000) });
                if (files.length >= limit || files.reduce((n, f) => n + f.content.length, 0) >= 30000) break;
            } catch { denied++; }
        }
        return { files, denied, truncated: files.length + denied < names.length };
    }
}
