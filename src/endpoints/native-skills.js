import { readPublicTargetText } from '../native/model-prompt-runtime/credential-fetch.js';
import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { createSkillRepository } from '../skills/repository.js';
import { encodeScopePath } from '../skills/scope.js';
import { hashNativeDocument } from '../native/repositories/common.js';
import { nativeMcpArtifacts } from '../native/mcp-artifacts.js';
import { packEmbedPayload, parseEmbedPayload, computeEmbedItemHash, materializeFromEmbed } from '../skills/embed.js';
import { buildBundledManifest, importBundledSkills } from '../skills/bundled.js';
const keys = (value, allowed) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError('Invalid Native Skill request'); };
const scope = value => { encodeScopePath(value); return value; };
const commands = Object.freeze({ install: ['payload', 'conflictStrategy'], rename: ['toName'], move: ['toScope'],
    'file.write': ['path', 'content', 'expectedSha256'], 'file.edit': ['path', 'oldString', 'newString', 'replaceAll'],
    'file.rename': ['fromPath', 'toPath'], 'file.delete': ['path'], delete: [] });

export function createNativeSkillsRouter({ repository = req => createSkillRepository(req.user.directories.root), readText = readPublicTargetText, artifacts = nativeMcpArtifacts } = {}) {
    const router = express.Router();
    const prepared = new Map();
    const prune = () => { for (const [id, item] of prepared) if (item.expiresAt <= Date.now()) prepared.delete(id); };
    router.use((req, res, next) => req.user?.profile?.handle && req.user?.directories?.root ? next() : res.sendStatus(401));
    const route = handler => async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await handler(repository(req), req.body ?? {}, req)); } catch (error) { res.status(error.status ?? (error.name === 'ConflictError' ? 409 : error.name === 'NotFoundError' ? 404 : 400)).json({ error: error.status === 409 ? 'native_skill_version_conflict' : 'native_skill_request_invalid' }); }
    };
    const rawRoute = (allowed, operation, maxBytes) => async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        try {
            keys(req.body, allowed); scope(req.body.scope);
            const bytes = await operation(repository(req), req.body);
            if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes) throw new TypeError('Skill source exceeds binary response limit');
            res.set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length), 'x-atria-content-sha256': createHash('sha256').update(bytes).digest('hex'),
                'x-atria-server-boot-id': artifacts.bootId, 'X-Content-Type-Options': 'nosniff' }).send(bytes);
        } catch (error) { res.status(error.status ?? (error.name === 'ConflictError' ? 409 : error.name === 'NotFoundError' ? 404 : 400)).json({ error: 'native_skill_source_unavailable' }); }
    };
    router.post('/file/content', rawRoute(['scope', 'name', 'path', 'version', 'expectedSha256'], (repo, input) => repo.readFileContent(input), 4 * 1024 * 1024));
    router.post('/candidate/content', rawRoute(['scope', 'name', 'candidateId', 'expectedMetadataHash', 'field'], (repo, input) => repo.readCandidateContent(input), 512 * 1024));
    router.post('/inspect/content', rawRoute(['scope', 'name', 'expectedInstalledHash'], (repo, input) => repo.readInspectContent(input), 8 * 1024 * 1024));
    router.post('/list', route((repo, i) => { keys(i, ['scope', 'offset', 'limit', 'expectedInventoryHash']); return repo.listPage({ ...i, scope: i.scope === 'all' ? 'all' : scope(i.scope) }); }));
    router.post('/identity', route(async (repo, i) => { keys(i, ['scope', 'name']); return { skill: await repo.getIdentity(i.name, scope(i.scope)), instructionsAreUntrusted: true }; }));
    router.post('/inspect', route((repo, i) => { keys(i, ['scope', 'name', 'field', 'offset', 'limit', 'expectedInstalledHash']); scope(i.scope); return repo.inspectPage(i); }));
    router.post('/file', route((repo, i) => { keys(i, ['scope', 'name', 'path', 'version', 'offset', 'limit', 'expectedSha256']); scope(i.scope); return repo.readFilePage(i); }));
    router.post('/files', route((repo, i) => { keys(i, ['scope', 'name', 'version', 'offset', 'limit', 'expectedFilesHash']); scope(i.scope); return repo.listFileMetadata(i); }));
    router.post('/search', route((repo, i) => { keys(i, ['scope', 'name', 'query', 'path', 'offset', 'limit', 'contextLines', 'version', 'expectedSha256']); scope(i.scope); return repo.searchMetadata(i); }));
    router.post('/history', route((repo, i) => { keys(i, ['scope', 'name']); scope(i.scope); return repo.history(i); }));
    router.post('/candidate/check', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId']); scope(i.scope); return repo.checkCandidateMetadata(i); }));
    router.post('/candidate/diff', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId', 'expectedMetadataHash', 'field', 'offset', 'limit']); scope(i.scope); return repo.readCandidateDiff(i); }));
    router.post('/install/preflight', route((repo, i) => { keys(i, ['scope', 'payload']); scope(i.scope); return repo.previewInstall(i); }));
    router.post('/pin', route((repo, i) => { keys(i, ['scope', 'name', 'expectedHash']); scope(i.scope); return repo.pin(i); }));
    router.post('/candidate/prepare', route(async (repo, i) => {
        keys(i, ['scope', 'name', 'baseVersion', 'content']); scope(i.scope);
        const candidate = await repo.prepareCandidate(i); return repo.checkCandidateMetadata({ scope: i.scope, name: i.name, candidateId: candidate.candidateId });
    }));
    router.post('/candidate/apply', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId', 'expectedBaseVersion']); scope(i.scope); return repo.applyCandidate(i); }));
    router.post('/candidate/rollback', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId', 'expectedVersion']); scope(i.scope); return repo.rollbackCandidate(i); }));
    router.post('/candidate/discard', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId']); scope(i.scope); return repo.discardCandidate(i); }));
    const sourceBinding = value => hashNativeDocument({ purpose: 'runtime-skill-payload', scope: scope(value) });
    const withPayload = (i, req, consume) => artifacts.withSource(req.user.profile.handle, i.artifactRef, 'skill-payload-upload', sourceBinding(scope(i.scope)), async bytes => {
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); keys(value, ['files']);
        if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > 100) throw new TypeError('Invalid staged Skill payload');
        for (const file of value.files) {
            keys(file, ['path', 'encoding', 'content']);
            if (typeof file.path !== 'string' || typeof file.content !== 'string' || !['utf8', 'base64'].includes(file.encoding)) throw new TypeError('Invalid staged Skill file');
            if (file.encoding === 'base64' && (file.content.length > Math.ceil(4 * 1024 * 1024 / 3) * 4 || /[^A-Za-z0-9+/=]/.test(file.content)
                || Buffer.from(file.content, 'base64').toString('base64') !== file.content)) throw new TypeError('Invalid staged Skill base64');
        }
        return consume(value);
    });
    router.post('/payload/staging', route((_repo, i, req) => {
        keys(i, ['scope', 'clientInstanceId', 'contentHash', 'totalBytes']); scope(i.scope);
        if (i.scope.kind === 'package') throw new TypeError('Package Skill originals are read-only');
        return artifacts.beginSource(req.user.profile.handle, { clientInstanceId: i.clientInstanceId, contentHash: i.contentHash, totalBytes: i.totalBytes }, 'skill-payload-upload', sourceBinding(i.scope));
    }));
    router.post('/payload/preflight', route((repo, i, req) => {
        keys(i, ['scope', 'artifactRef']);
        return withPayload(i, req, async payload => {
            const plan = await repo.previewInstall({ scope: i.scope, payload });
            const files = payload.files.map(file => ({ path: file.path, bytes: file._buffer.length, contentHash: createHash('sha256').update(file._buffer).digest('hex') }));
            return { ...plan, artifactRef: i.artifactRef, bindingHash: sourceBinding(i.scope), fileCount: files.length,
                decodedBytes: files.reduce((total, file) => total + file.bytes, 0), filesHash: hashNativeDocument(files), files };
        });
    }));
    router.post('/payload/install', route((repo, i, req) => {
        keys(i, ['scope', 'artifactRef', 'expectedIncomingHash', 'expectedInstalledHash']);
        return withPayload(i, req, async payload => {
            const plan = await repo.previewInstall({ scope: i.scope, payload });
            if (plan.incomingHash !== i.expectedIncomingHash || plan.existingHash !== i.expectedInstalledHash) { const error = new Error('Skill staged review changed'); error.status = 409; throw error; }
            return repo.writeReviewed({ scope: i.scope, name: plan.name, expectedInstalledHash: i.expectedInstalledHash,
                command: { kind: 'install', input: { payload, conflictStrategy: 'replace' } } });
        });
    }));
    router.post('/payload/candidate/prepare', route((repo, i, req) => {
        keys(i, ['scope', 'artifactRef', 'expectedIncomingHash', 'expectedInstalledHash', 'baseVersion']);
        return withPayload(i, req, async payload => {
            const plan = await repo.previewInstall({ scope: i.scope, payload });
            if (plan.incomingHash !== i.expectedIncomingHash) { const error = new Error('Skill source changed'); error.status = 409; throw error; }
            const md = payload.files.find(file => file.path === 'SKILL.md');
            return repo.prepareCandidateReviewed({ scope: i.scope, name: plan.name, baseVersion: i.baseVersion,
                expectedInstalledHash: i.expectedInstalledHash, content: new TextDecoder('utf-8', { fatal: true }).decode(md._buffer) });
        });
    }));
    for (const [kind, allowed] of Object.entries(commands)) router.post('/write/' + kind, route((repo, i) => {
        keys(i, ['scope', 'name', 'expectedInstalledHash', 'input']); scope(i.scope); keys(i.input ?? {}, allowed);
        if (i.expectedInstalledHash !== null && !/^[a-f0-9]{64}$/.test(i.expectedInstalledHash ?? '')) throw new TypeError('Exact installed hash required');
        if (kind !== 'install' && typeof i.name !== 'string') throw new TypeError('Skill name required');
        return repo.writeReviewed({ scope: i.scope, name: i.name, expectedInstalledHash: i.expectedInstalledHash, command: { kind, input: i.input } });
    }));
    router.post('/url/prepare', route(async (repo, i, req) => {
        keys(i, ['scope', 'url', 'clientInstanceId']); scope(i.scope); prune();
        const url = new URL(i.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Public HTTPS source required');
        if (i.scope.kind === 'package' || typeof i.clientInstanceId !== 'string' || i.clientInstanceId.length > 100 || prepared.size >= 16) throw new TypeError('Invalid Skill import');
        const fetched = await readText(i.url, { maxBytes: 512 * 1024 });
        if (Buffer.byteLength(fetched.text, 'utf8') > 512 * 1024) throw new TypeError('Skill source exceeds limit');
        if (fetched.contentType && !/^(text\/(plain|markdown|x-markdown)|application\/octet-stream)(;|$)/i.test(fetched.contentType)) throw new TypeError('Invalid Skill content type');
        const payload = { files: [{ path: 'SKILL.md', encoding: 'utf8', content: fetched.text }] };
        const preflight = await repo.previewInstall({ scope: i.scope, payload });
        const metadata = { prepareId: randomUUID(), clientInstanceId: i.clientInstanceId, sourceUrl: i.url,
            contentHash: createHash('sha256').update(fetched.text).digest('hex'), scope: i.scope, ...preflight, expiresAt: Date.now() + 300000 };
        prepared.set(metadata.prepareId, { metadata, owner: req.user.profile.handle, payload }); return metadata;
    }));
    const preparedItem = (i, req) => {
        prune(); const item = prepared.get(i.prepareId);
        if (!item || item.owner !== req.user.profile.handle || item.metadata.clientInstanceId !== i.clientInstanceId || item.metadata.contentHash !== i.contentHash) throw new TypeError('Prepared Skill unavailable');
        return item;
    };
    router.post('/url/inspect', route((_repo, i, req) => {
        keys(i, ['prepareId', 'clientInstanceId', 'contentHash']); return preparedItem(i, req).metadata;
    }));
    router.post('/url/apply', route(async (repo, i, req) => {
        keys(i, ['prepareId', 'clientInstanceId', 'contentHash', 'expectedInstalledHash']); const item = preparedItem(i, req);
        const result = await repo.writeReviewed({ scope: item.metadata.scope, name: item.metadata.name, expectedInstalledHash: i.expectedInstalledHash,
            command: { kind: 'install', input: { payload: item.payload, conflictStrategy: 'replace' } } });
        prepared.delete(i.prepareId); return { ...result, contentHash: item.metadata.contentHash };
    }));
    router.post('/scope/inspect', route((repo, i) => { keys(i, ['scope']); return repo.observeScope(scope(i.scope)); }));
    router.post('/scope/write', route((repo, i) => {
        keys(i, ['scope', 'expectedInventoryHash', 'command', 'toScope']); scope(i.scope); if (i.toScope) scope(i.toScope);
        if (!/^[a-f0-9]{64}$/.test(i.expectedInventoryHash ?? '')) throw new TypeError('Exact scope hash required');
        return repo.writeScopeReviewed(i);
    }));
    const embedBinding = hashNativeDocument({ purpose: 'runtime-skill-embed' });
    const embedPayload = (i, req, consume) => artifacts.withSource(req.user.profile.handle, i.artifactRef, 'skill-payload-upload', embedBinding,
        async bytes => consume(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))));
    const writable = value => { scope(value); if (value.kind === 'package') throw new TypeError('Package originals are read-only'); return value; };
    const inventory = async (repo, selected) => ({ ...await repo.observeScope(selected), entries: new Map((await repo.list({ scope: selected })).map(row => [row.name, row.installedHash])) });
    const reviewed = async (repo, selected, expected, incoming) => {
        writable(selected); const current = await inventory(repo, selected);
        if (current.inventoryHash !== expected) throw Object.assign(new Error('Skill inventory conflict'), { status: 409 });
        const results = [];
        return { results, repository: { install: async input => {
            if (encodeScopePath(input.scope) !== encodeScopePath(selected)) throw new TypeError('Skill scope mismatch');
            const plan = await repo.previewInstall(input);
            if (incoming && incoming.get(plan.name) !== plan.incomingHash) throw Object.assign(new Error('Incoming Skill changed'), { status: 409 });
            const result = await repo.writeReviewed({ scope: selected, name: plan.name, expectedInstalledHash: current.entries.get(plan.name) ?? null,
                command: { kind: 'install', input: { payload: input.payload, conflictStrategy: input.conflictStrategy } } });
            results.push({ name: plan.name, ...result }); return result;
        } } };
    };
    const bundledView = async (repo, req) => {
        const manifest = await buildBundledManifest({ defaultRoot: req.app.get('atriaDefaultRoot') });
        return { manifest, manifestFingerprint: hashNativeDocument(manifest), ...await repo.observeScope({ kind: 'global' }) };
    };
    router.post('/bundled/preflight', route((repo, i, req) => { keys(i, []); return bundledView(repo, req); }));
    router.post('/bundled/import', route(async (repo, i, req) => {
        keys(i, ['expectedManifestFingerprint', 'expectedInventoryHash']);
        const view = await bundledView(repo, req);
        if (view.manifestFingerprint !== i.expectedManifestFingerprint) throw Object.assign(new Error('Bundled source conflict'), { status: 409 });
        const check = await reviewed(repo, { kind: 'global' }, i.expectedInventoryHash, new Map(view.manifest.map(row => [row.name, row.installedHash])));
        try { return { ok: true, ...await importBundledSkills({ defaultRoot: req.app.get('atriaDefaultRoot'), repository: check.repository }), results: check.results }; } catch (error) { return { ok: false, partial: check.results.length > 0, results: check.results, code: error.status === 409 ? 'native_skill_version_conflict' : 'native_skill_import_failed' }; }
    }));
    router.post('/embed/pack', route(async (repo, i, req) => {
        keys(i, ['scope', 'names', 'mode', 'expectedInventoryHash', 'clientInstanceId']); scope(i.scope);
        if (!Array.isArray(i.names) || !i.names.length || i.names.length > 32 || new Set(i.names).size !== i.names.length) throw new TypeError('Exact Skill selection required');
        const before = await repo.observeScope(i.scope);
        if (before.inventoryHash !== i.expectedInventoryHash) throw Object.assign(new Error('Skill inventory conflict'), { status: 409 });
        const payload = await packEmbedPayload({ repository: repo, scope: i.scope, names: i.names, mode: i.mode });
        if ((await repo.observeScope(i.scope)).inventoryHash !== before.inventoryHash) throw Object.assign(new Error('Skill source changed'), { status: 409 });
        return artifacts.captureSkillEmbed(req.user.profile.handle, i.clientInstanceId, embedBinding, Buffer.from(JSON.stringify(payload)));
    }));
    router.post('/embed/staging', route((_repo, i, req) => {
        keys(i, ['clientInstanceId', 'contentHash', 'totalBytes']); return artifacts.beginSource(req.user.profile.handle, i, 'skill-payload-upload', embedBinding);
    }));
    const embedView = (repo, i, req) => embedPayload(i, req, async payload => {
        writable(i.targetScope); const items = await parseEmbedPayload(payload);
        if (!items.length || items.length > 32 || new Set(items.map(item => item.name)).size !== items.length) throw new TypeError('Bounded unique embed selection required');
        const rows = [];
        for (const item of items) {
            const existing = await repo.get(item.name, i.targetScope), incomingHash = await computeEmbedItemHash(item);
            rows.push({ name: item.name, incomingHash, installedHash: existing?.installedHash ?? null, conflict: !existing ? 'new' : incomingHash === existing.installedHash ? 'same' : 'different' });
        }
        return { artifactRef: i.artifactRef, targetScope: i.targetScope, items: rows, ...await repo.observeScope(i.targetScope), invocationGranted: false };
    });
    router.post('/embed/preflight', route((repo, i, req) => { keys(i, ['artifactRef', 'targetScope']); return embedView(repo, i, req); }));
    router.post('/embed/extract', route(async (repo, i, req) => {
        keys(i, ['artifactRef', 'targetScope', 'expectedPreflightFingerprint', 'conflictStrategies']);
        const view = await embedView(repo, i, req);
        if (hashNativeDocument(view) !== i.expectedPreflightFingerprint) throw Object.assign(new Error('Embed target conflict'), { status: 409 });
        const check = await reviewed(repo, i.targetScope, view.inventoryHash, new Map(view.items.map(row => [row.name, row.incomingHash])));
        return embedPayload(i, req, async payload => {
            try { return { ok: true, ...await materializeFromEmbed({ repository: check.repository, payload, targetScope: i.targetScope, conflictStrategies: i.conflictStrategies }), results: check.results }; } catch (error) { return { ok: false, partial: check.results.length > 0, results: check.results, failedAt: error.failedAt ?? null, code: 'native_skill_extract_failed' }; }
        });
    }));
    return router;
}
export const router = createNativeSkillsRouter();
