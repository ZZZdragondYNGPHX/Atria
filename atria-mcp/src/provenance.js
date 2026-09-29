import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const exec = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const id = z.string().min(1).max(256);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceSchema = z.strictObject({ algorithm: z.literal('atria-source-v1'),
    revision: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), branch: id.nullable(), workspaceId: digest.nullable(),
    fingerprint: digest.nullable(), reasons: z.array(id).max(20) });
export const runtimeSchema = z.strictObject({ version: z.literal(1), serverBootId: z.string().uuid(),
    processStartedAt: z.number().positive(), appVersion: id.nullable(), source: sourceSchema });

// Independent protocol implementation: no code imports/execution from the
// configured checkout. v1 uses raw working bytes, Git index modes, full HEAD,
// sorted JSON [path, mode, sha256-or-missing] lines and an explicit source scope.
const relevant = name => !/^public\/(?:_cache|user|chats|characters|backgrounds|groups|group chats|worlds|assets|themes|User Avatars)\//.test(name)
    && !/^public\/lib\.(?:core|optional)\.bundle\.js(?:\.map)?$/.test(name)
    && (/^(?:src|public|default|plugins)\//.test(name) || /^(?:package(?:-lock)?\.json|[^/]+\.(?:js|mjs|cjs))$/.test(name));

export async function readSourceIdentity(directory) {
    try {
        const root = await realpath(directory);
        const git = async (...args) => (await exec('git', ['-C', root, ...args], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 })).stdout;
        const revision = (await git('rev-parse', '--verify', 'HEAD')).trim();
        const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).trim();
        async function manifest() {
            const files = (await git('ls-files', '--stage', '-z')).split('\0').filter(Boolean).map(line => {
                const separator = line.indexOf('\t');
                return { file: line.slice(separator + 1), meta: line.slice(0, separator).split(' ') };
            }).filter(item => relevant(item.file)).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
            const hash = createHash('sha256').update('atria-source-v1\0' + revision + '\0');
            let size = 0;
            for (const { file, meta: [mode, , stage] } of files) {
                if (!['100644', '100755'].includes(mode) || stage !== '0') throw new Error('Unsupported source');
                const target = join(root, file);
                const stat = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
                let content = 'missing';
                if (stat) {
                    size += stat.size;
                    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(target) !== target || stat.size > 33554432 || size > 536870912) throw new Error('Unsafe or oversized source');
                    content = sha(await readFile(target));
                }
                hash.update(JSON.stringify([file, mode, content]) + '\n');
            }
            return hash.digest('hex');
        }
        const fingerprint = await manifest(), reasons = [];
        const extras = (await git('ls-files', '--others', '--exclude-standard', '-z'))
            + (await git('ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', 'src', 'public', 'default', 'plugins'));
        if (extras.split('\0').filter(Boolean).some(relevant)) reasons.push('runtime_relevant_untracked');
        if (fingerprint !== await manifest() || revision !== (await git('rev-parse', 'HEAD')).trim()) reasons.push('source_changed_during_capture');
        return sourceSchema.parse({ algorithm: 'atria-source-v1', revision, branch, fingerprint, reasons,
            workspaceId: sha(process.platform === 'win32' ? root.toLowerCase() : root) });
    } catch { return { algorithm: 'atria-source-v1', revision: null, branch: null, fingerprint: null, workspaceId: null, reasons: ['source_capture_unavailable'] }; }
}

export function compareSource(source, runtime) {
    const a = sourceSchema.safeParse(source), b = runtimeSchema.safeParse(runtime);
    if (!a.success || !b.success || a.data.reasons.length || b.data.source.reasons.length
        || !a.data.revision || !b.data.source.revision || !a.data.fingerprint || !b.data.source.fingerprint) return 'UNVERIFIABLE';
    if (a.data.revision !== b.data.source.revision) return 'DIFFERENT_REVISION';
    if (a.data.fingerprint !== b.data.source.fingerprint) return 'SOURCE_CHANGED_SINCE_RUNTIME_START';
    if (!a.data.workspaceId || !b.data.source.workspaceId) return 'UNVERIFIABLE';
    return a.data.workspaceId === b.data.source.workspaceId ? 'EXACT' : 'CONTENT_MATCH_DIFFERENT_WORKSPACE';
}

export function compareBrowser(loaded, runtime) {
    if (!loaded?.serverBootId || !runtimeSchema.safeParse(runtime).success) return 'UNVERIFIABLE';
    return loaded.serverBootId === runtime.serverBootId ? 'CURRENT' : 'STALE';
}

// Scope identities stay independent. Absent authority fields remain unknown;
// neither a boot ID nor a source match fills missing Experience/Preview evidence.
export const experienceSchema = z.strictObject({ sessionId: id, experienceEpoch: id, revisionId: id,
    branchId: id.optional(), packageVersionId: id.optional(), packageContentHash: digest.optional(), descriptorDigest: digest.optional() });
export const previewSchema = z.strictObject({ projectId: id, baseRevision: id, previewId: id,
    workspaceId: id.optional(), operationsFingerprint: digest.optional(), packageVersionId: id.optional(),
    packageContentHash: digest.optional(), descriptorDigest: digest.optional(), entryPointId: id.optional() });
export function compareScope(previous, current, schema) {
    const a = schema.safeParse(previous), b = schema.safeParse(current);
    if (!a.success || !b.success) return 'UNVERIFIABLE';
    const keys = new Set([...Object.keys(a.data), ...Object.keys(b.data)]);
    return [...keys].every(key => a.data[key] === b.data[key]) ? 'CURRENT' : 'STALE';
}

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
export function scopedResponse(path, request, response, previous = {}) {
    if (path === '/api/native/session/frontend/open' && response?.ok) {
        const identity = experienceSchema.safeParse({ sessionId: request?.sessionId, experienceEpoch: response.epoch,
            revisionId: response.revision, descriptorDigest: response.data?.descriptorDigest });
        return { ...previous, experience: identity.success ? { identity: identity.data, state: 'OBSERVED' } : null };
    }
    if (path === '/api/native/session/frontend/request' && previous.experience?.identity.experienceEpoch === request?.epoch) {
        if (response?.error?.code === 'bridge_epoch_stale') return { ...previous, experience: { ...previous.experience, state: 'STALE' } };
        if (response?.ok && response.epoch === request.epoch && typeof response.revision === 'string') {
            return { ...previous, experience: { identity: { ...previous.experience.identity, revisionId: response.revision }, state: 'OBSERVED' } };
        }
    }
    if (path === '/api/native/session/frontend/close' && previous.experience?.identity.experienceEpoch === request?.epoch) {
        return { ...previous, experience: { ...previous.experience, state: 'STALE' } };
    }
    if (/^\/api\/native\/studio\/projects\/[^/]+\/(?:preview|frontend\/evaluate)$/.test(path) && response?.preview) {
        const p = response.preview, workspace = response.workspace;
        const identity = previewSchema.safeParse({ projectId: p.projectId, baseRevision: workspace?.baseRevision ?? response.revision?.revision,
            previewId: p.previewId, packageVersionId: p.packageVersionId, entryPointId: p.entryPointId,
            ...(p.descriptor?.packageContentHash ? { packageContentHash: p.descriptor.packageContentHash } : {}),
            ...(workspace ? { workspaceId: workspace.workspaceId, operationsFingerprint: sha(canonical(workspace.operations)) } : {}) });
        return { ...previous, preview: identity.success ? { identity: identity.data, state: 'OBSERVED', uiLoaded: false,
            validationStatus: ['passed', 'failed', 'warning'].includes(response.validation?.status) ? response.validation.status : null } : null };
    }
    if (/^\/api\/native\/studio\/previews\/[^/]+\/ui$/.test(path) && previous.preview?.identity.previewId === response?.previewId
        && previous.preview.identity.packageVersionId === response?.packageVersionId) return { ...previous, preview: { ...previous.preview, uiLoaded: true } };
    return previous;
}

export class Provenance {
    constructor(root, browser) { this.root = root; this.browser = browser; }
    async snapshot() {
        const [source, runtime] = await Promise.all([readSourceIdentity(this.root), this.browser.runtimeIdentity()]);
        return { observedAt: new Date().toISOString(), source, server: runtime,
            runtimeSourceMatch: compareSource(source, runtime), browser: this.browser.loadedIdentity ?? null,
            browserFreshness: compareBrowser(this.browser.loadedIdentity, runtime),
            experience: this.browser.scopedEvidence?.experience ?? null, preview: this.browser.scopedEvidence?.preview ?? null,
            scopeNote: 'Scoped evidence is the last observed owning-authority response, not a live freshness assertion. Missing fields cannot establish exact authoring verification.' };
    }
}
