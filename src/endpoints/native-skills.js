import { readPublicTargetText } from '../native/model-prompt-runtime/credential-fetch.js';
import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { createSkillRepository } from '../skills/repository.js';
import { encodeScopePath } from '../skills/scope.js';
const keys = (value, allowed) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError('Invalid Native Skill request'); };
const scope = value => { encodeScopePath(value); return value; };
const commands = Object.freeze({ install: ['payload', 'conflictStrategy'], rename: ['toName'], move: ['toScope'],
    'file.write': ['path', 'content', 'expectedSha256'], 'file.edit': ['path', 'oldString', 'newString', 'replaceAll'],
    'file.rename': ['fromPath', 'toPath'], 'file.delete': ['path'], delete: [] });

export function createNativeSkillsRouter({ repository = req => createSkillRepository(req.user.directories.root), readText = readPublicTargetText } = {}) {
    const router = express.Router();
    const prepared = new Map();
    const prune = () => { for (const [id, item] of prepared) if (item.expiresAt <= Date.now()) prepared.delete(id); };
    router.use((req, res, next) => req.user?.profile?.handle && req.user?.directories?.root ? next() : res.sendStatus(401));
    const route = handler => async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await handler(repository(req), req.body ?? {}, req)); } catch (error) { res.status(error.status ?? (error.name === 'ConflictError' ? 409 : 400)).json({ error: error.status === 409 ? 'native_skill_version_conflict' : 'native_skill_request_invalid' }); }
    };
    router.post('/list', route((repo, i) => { keys(i, ['scope']); return repo.list({ scope: i.scope === 'all' ? 'all' : scope(i.scope) }); }));
    router.post('/inspect', route(async (repo, i) => { keys(i, ['scope', 'name']); return { skill: await repo.get(i.name, scope(i.scope)), instructionsAreUntrusted: true }; }));
    router.post('/file', route((repo, i) => { keys(i, ['scope', 'name', 'path', 'version', 'offset', 'limit']); scope(i.scope); return repo.readFile(i); }));
    router.post('/files', route((repo, i) => { keys(i, ['scope', 'name', 'version']); scope(i.scope); return repo.listFiles(i); }));
    router.post('/search', route((repo, i) => { keys(i, ['scope', 'name', 'query', 'path', 'limit', 'contextLines', 'version']); scope(i.scope); return repo.search(i); }));
    router.post('/history', route((repo, i) => { keys(i, ['scope', 'name']); scope(i.scope); return repo.history(i); }));
    router.post('/candidate/check', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId']); scope(i.scope); return repo.checkCandidate(i); }));
    router.post('/install/preflight', route((repo, i) => { keys(i, ['scope', 'payload']); scope(i.scope); return repo.previewInstall(i); }));
    router.post('/pin', route((repo, i) => { keys(i, ['scope', 'name', 'expectedHash']); scope(i.scope); return repo.pin(i); }));
    router.post('/candidate/prepare', route((repo, i) => { keys(i, ['scope', 'name', 'baseVersion', 'content']); scope(i.scope); return repo.prepareCandidate(i); }));
    router.post('/candidate/apply', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId', 'expectedBaseVersion']); scope(i.scope); return repo.applyCandidate(i); }));
    router.post('/candidate/rollback', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId', 'expectedVersion']); scope(i.scope); return repo.rollbackCandidate(i); }));
    router.post('/candidate/discard', route((repo, i) => { keys(i, ['scope', 'name', 'candidateId']); scope(i.scope); return repo.discardCandidate(i); }));
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
    return router;
}
export const router = createNativeSkillsRouter();
