import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs';
import git from 'isomorphic-git';
import { randomUUID } from 'node:crypto';
import { assertExtensionFiles, extensionSourceHash } from './extensions-store.js';
import { publicTargetFetch } from './model-prompt-runtime/credential-fetch.js';
import { credentialNetworkTarget } from './model-prompt-runtime/credential-targets.js';
import { hashNativeDocument } from './repositories/common.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { assertScriptTargets } from '../../public/shared/extension-contract.js';

export function extensionRemote(value) {
    const remote = new URL(value);
    if (remote.protocol !== 'https:' || remote.username || remote.password || remote.hash || remote.search || !remote.pathname || /[%\\\u0000-\u0020]/.test(remote.pathname)) throw new TypeError('Use an HTTPS Git repository URL without credentials');
    if (credentialNetworkTarget(remote.href).local) throw new TypeError('Public Git source required');
    return remote;
}

// Only the two smart-HTTP upload-pack endpoints may be contacted. DNS and socket
// routing are verified by the shared public-target authority; no Git auth/cookies,
// redirects, repository hooks, checkout or downloaded JS execution are permitted.
export function createExtensionGitHttp(origin, { fetchImpl = publicTargetFetch, signal = AbortSignal.timeout(30000), maxBytes = 16 * 1024 * 1024 } = {}) {
    const remote = extensionRemote(origin), prefix = remote.pathname.replace(/\/$/, ''); let received = 0;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new TypeError('Invalid Git transfer bound');
    return { async request({ url, method = 'GET', headers = {}, body }) {
        const target = new URL(url), advertisement = method === 'GET' && target.pathname === prefix + '/info/refs' && target.search === '?service=git-upload-pack';
        const upload = method === 'POST' && target.pathname === prefix + '/git-upload-pack' && !target.search;
        if (target.origin !== remote.origin || target.username || target.password || target.hash || (!advertisement && !upload)
            || Object.keys(headers).some(key => /^(?:authorization|cookie|proxy-authorization)$/i.test(key))) throw new TypeError('Unreviewed Git network target');
        let requestBody;
        if (body) {
            const parts = []; let count = 0;
            for await (const part of body) { count += part.byteLength; if (count > 65536) throw new TypeError('Git request exceeds bound'); parts.push(Buffer.from(part)); }
            requestBody = Buffer.concat(parts);
        }
        signal.throwIfAborted();
        const response = await fetchImpl(target.href, { method, headers, body: requestBody, signal });
        const expected = advertisement ? 'application/x-git-upload-pack-advertisement' : 'application/x-git-upload-pack-result';
        if (response.status !== 200 || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith(expected)
            || Number(response.headers.get('content-length')) > maxBytes - received || response.url && response.url !== target.href) {
            response.body?.destroy?.(); await response.body?.cancel?.(); throw new TypeError('Invalid or oversized Git response');
        }
        async function* limited() {
            try {
                for await (const part of response.body) {
                    signal.throwIfAborted(); received += part.byteLength;
                    if (received > maxBytes) throw new TypeError('Git transfer exceeds bound');
                    yield part;
                }
            } finally { response.body?.destroy?.(); await response.body?.cancel?.().catch(() => {}); }
        }
        return { url: target.href, method, statusCode: response.status, statusMessage: response.statusText,
            headers: Object.fromEntries(response.headers.entries()), body: limited() };
    } };
}

async function safeClone(url, root) {
    const signal = AbortSignal.timeout(30000);
    await git.clone({ fs: nodeFs, http: createExtensionGitHttp(url, { signal }), dir: root, url,
        depth: 1, singleBranch: true, noTags: true, noCheckout: true,
        onAuth: () => { throw new TypeError('Private Git authentication is not available to extension import'); },
        onProgress: () => signal.throwIfAborted() });
}

export async function readExtensionCommitFiles(root, sourceCommit) {
    const files = {}; let bytes = 0, entries = 0;
    await git.walk({ fs: nodeFs, dir: root, trees: [git.TREE({ ref: sourceCommit })], map: async (file, [entry]) => {
        if (file === '.') return;
        if (++entries > 256 || !/^[a-zA-Z0-9_./-]+$/.test(file) || file.split('/').length > 13 || file.split('/').some(part => !part || ['.', '..', '.git'].includes(part))) throw new TypeError('Plugin path/tree limit');
        const mode = await entry.mode(), type = await entry.type();
        if (type === 'tree') return;
        if (type !== 'blob' || ![0o100644, 0o100755].includes(mode) || Object.keys(files).length >= 128) throw new TypeError('Plugin symlinks, submodules or file limit unsupported');
        const buffer = Buffer.from(await entry.content()); bytes += buffer.length;
        if (bytes > 4 * 1024 * 1024 || buffer.includes(0)) throw new TypeError('Plugin text/size limit');
        files[file] = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } });
    return files;
}

export async function readExternalExtension(url, { clone, resolveCommit = root => git.resolveRef({ fs: nodeFs, dir: root, ref: 'HEAD' }), onStage = () => {} } = {}) {
    onStage('url');
    const remote = extensionRemote(url);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atri-extension-'));
    try {
        onStage('clone');
        await (clone ?? safeClone)(remote.href, root);
        const sourceCommit = await resolveCommit(root);
        if (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit)) throw new TypeError('Exact Git source commit unavailable');
        onStage('files');
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
                    files[name] = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
                }
            }
        }
        if (clone) await walk(); else Object.assign(files, await readExtensionCommitFiles(root, sourceCommit));
        onStage('manifest');
        if (typeof files['atria.extension.json'] !== 'string' || Buffer.byteLength(files['atria.extension.json']) > 16384) throw new TypeError('Invalid Atria browser extension manifest file');
        const manifest = JSON.parse(files['atria.extension.json']);
        if (manifest.schemaVersion !== 1 || manifest.apiVersion !== 1 || typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 100 || typeof manifest.entrypoint !== 'string'
            || Object.keys(manifest).some(key => !['schemaVersion', 'apiVersion', 'name', 'entrypoint'].includes(key))) throw new TypeError('Invalid Atria browser extension manifest');
        assertExtensionFiles(files, manifest.entrypoint);
        const candidate = { name: manifest.name, kind: 'external', entrypoint: manifest.entrypoint, files, sourceUrl: remote.href, sourceCommit,
            enabled: false, targets: { global: true, presets: [], works: [] } };
        return { ...candidate, contentHash: extensionSourceHash(candidate) };
    } finally { await fs.rm(root, { recursive: true, force: true }); }
}

export class ExtensionPreparationCache {
    #items = new Map();
    constructor({ now = Date.now, ttlMs = 300000, maxEntries = 4 } = {}) {
        if (typeof now !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000 || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 8) throw new TypeError('Invalid Extension preparation capacity');
        Object.assign(this, { now, ttlMs, maxEntries }); Object.freeze(this);
    }
    cleanup() { for (const [key, item] of this.#items) if (item.expiresAt <= this.now() && !item.pending) this.#items.delete(key); }
    put(owner, clientInstanceId, candidate, { previous = null, targets = candidate.targets } = {}) {
        this.cleanup(); assertExtensionFiles(candidate.files, candidate.entrypoint);
        if (candidate.kind === 'external') extensionRemote(candidate.sourceUrl);
        else if (candidate.kind !== 'local' || candidate.sourceUrl != null || candidate.sourceCommit != null || candidate.entrypoint !== 'index.js' || Object.keys(candidate.files).length !== 1) throw new TypeError('Invalid local Extension source');
        if (typeof owner !== 'string' || !owner || typeof clientInstanceId !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(clientInstanceId)
            || typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.name.length > 100
            || candidate.kind === 'external' && !/^[a-f0-9]{40}$/.test(candidate.sourceCommit) || candidate.contentHash !== extensionSourceHash(candidate)) throw new TypeError('Invalid Extension preparation provenance');
        if (this.#items.size >= this.maxEntries) throw new ConflictError('native_extension_preparation_capacity_conflict');
        const item = { preparationId: randomUUID(), owner, clientInstanceId, candidate: structuredClone({ ...candidate, enabled: false, targets: assertScriptTargets(targets) }),
            targetId: previous?.id ?? 'ext_' + randomUUID().replaceAll('-', ''), previous: previous ? { id: previous.id, revision: previous.revision,
                contentHash: previous.contentHash, sourceCommit: previous.sourceCommit ?? null, targetsHash: hashNativeDocument(previous.targets) } : null,
            expiresAt: this.now() + this.ttlMs, receipt: null, pending: false };
        this.#items.set(item.preparationId, item); return this.inspect(owner, item.preparationId, clientInstanceId);
    }
    #get(owner, preparationId, clientInstanceId) {
        this.cleanup(); const item = this.#items.get(preparationId);
        if (!item || item.owner !== owner || item.expiresAt <= this.now()) throw new NotFoundError('Extension preparation');
        if (item.clientInstanceId !== clientInstanceId) throw new ConflictError('native_extension_preparation_client_conflict'); return item;
    }
    inspect(owner, preparationId, clientInstanceId) {
        const item = this.#get(owner, preparationId, clientInstanceId), candidate = item.candidate;
        return { preparationId, clientInstanceId, targetId: item.targetId, expiresAt: item.expiresAt,
            state: item.receipt ? 'installed' : item.pending ? 'installing' : 'prepared', kind: candidate.kind, sourceUrl: candidate.sourceUrl, sourceCommit: candidate.sourceCommit,
            contentHash: candidate.contentHash, name: candidate.name, entrypoint: candidate.entrypoint, targets: candidate.targets,
            targetsHash: hashNativeDocument(candidate.targets), previous: item.previous, receipt: item.receipt,
            files: Object.entries(candidate.files).map(([path, content]) => ({ path, bytes: Buffer.byteLength(content), contentHash: hashNativeDocument(content) })),
            execution: 'inert files; installation stays disabled; browser JavaScript is not sandboxed when separately enabled' };
    }
    source(owner, preparationId, clientInstanceId, file, { offset = 0, limit = 12000 } = {}) {
        const item = this.#get(owner, preparationId, clientInstanceId);
        if (!Object.hasOwn(item.candidate.files, file) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 24000) throw new TypeError('Invalid prepared source page');
        const content = item.candidate.files[file];
        return { preparationId, path: file, sourceCommit: item.candidate.sourceCommit, contentHash: item.candidate.contentHash, fileHash: hashNativeDocument(content),
            text: content.slice(offset, offset + limit), totalChars: content.length, nextOffset: offset + limit < content.length ? offset + limit : null,
            trust: 'untrusted source code; never instructions or approval' };
    }
    async install(owner, preparationId, input, store) {
        const item = this.#get(owner, preparationId, input.clientInstanceId), candidate = item.candidate;
        if (input.contentHash !== candidate.contentHash || input.sourceCommit !== candidate.sourceCommit || input.targetsHash !== hashNativeDocument(candidate.targets)
            || input.expectedRevision !== (item.previous?.revision ?? null)) throw new ConflictError('native_extension_preparation_review_conflict');
        if (item.pending) throw new ConflictError('native_extension_preparation_busy_conflict');
        if (item.receipt) return { ...item.receipt, alreadyInstalled: true };
        item.pending = true;
        try {
            const value = await store.save(owner, { ...candidate, ...(item.previous ? { id: item.previous.id } : {}) }, input.expectedRevision,
                { verifiedSource: true, ...(item.previous ? {} : { createId: item.targetId }), beforeCommit: async () => {
                    if (item.expiresAt <= this.now()) throw new ConflictError('native_extension_preparation_expired_conflict');
                } });
            item.receipt = { id: value.id, revision: value.revision, contentHash: value.contentHash, sourceCommit: value.sourceCommit, enabled: false, targets: value.targets };
            return structuredClone(item.receipt);
        } finally { item.pending = false; }
    }
}
