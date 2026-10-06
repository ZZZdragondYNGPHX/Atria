import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseSkillFrontmatter } from './frontmatter-parser.js';
import { encodeScopePath } from './scope.js';
import { assertWritable } from '../storage/read-only-mode.js';

const queues = new Map();
export function orderSkillOperation(root, operation) {
    const key = resolve(root);
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    queues.set(key, next);
    return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}
const hash = value => createHash('sha256').update(value).digest('hex');
const versionPattern = /^[a-f0-9]{64}$/;
function assertVersion(version) {
    if (typeof version !== 'string' || !versionPattern.test(version)) fail('invalid Skill version');
}
const header = text => text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];
function identity(scope, name) {
    if (typeof name !== 'string' || !/^[a-z0-9_-]{1,128}$/.test(name)) fail('illegal skill name');
    return join(encodeScopePath(scope), name);
}
function filesHash(files) {
    const digest = createHash('sha256');
    for (const file of files) digest.update(file.path).update('\0').update(hash(file.buffer)).update('\0');
    return digest.digest('hex');
}
function validateFiles(files, name) {
    if (!Array.isArray(files) || !files.length || files.length > 100) fail('Skill version file count exceeded');
    const paths = new Set();
    let total = 0;
    for (const file of files) {
        if (typeof file.path !== 'string' || !/^[A-Za-z0-9._\-/]+$/.test(file.path)
            || file.path.includes('..') || file.path.split('/').some(part => !part || part === '.') || paths.has(file.path)) fail('invalid Skill version path');
        paths.add(file.path);
        if (!Buffer.isBuffer(file.buffer) || file.buffer.length > 4 * 1024 * 1024) fail('Skill version file size exceeded');
        total += file.buffer.length;
    }
    if (total > 16 * 1024 * 1024) fail('Skill version total size exceeded');
    const md = files.find(file => file.path === 'SKILL.md');
    if (!md || md.buffer.length > 512 * 1024) fail('Skill version SKILL.md missing or size exceeded');
    if (parseSkillFrontmatter(md.buffer.toString('utf8')).name !== name) fail('Skill version name mismatch');
    files.sort((a, b) => a.path.localeCompare(b.path));
    return total;
}

export function createSkillVersions(skillsRoot, readCurrentFiles) {
    const historyRoot = join(skillsRoot, '.history');
    const directory = (scope, name) => join(historyRoot, identity(scope, name));
    async function readVersion({ scope, name, version }) {
        assertVersion(version);
        // Deletion revokes even a snapshot whose cleanup was interrupted.
        await fs.access(join(skillsRoot, identity(scope, name))).catch(() => fail('Skill not found', 404));
        const path = join(directory(scope, name), `${version}.json`);
        const stat = await fs.stat(path).catch(() => fail('Skill version not found', 404));
        if (stat.size > 24 * 1024 * 1024) fail('Skill version size exceeded');
        const saved = JSON.parse(await fs.readFile(path, 'utf8'));
        if (saved.schema !== 'atria.skill-version.v1' || saved.version !== version || !Array.isArray(saved.files)
            || Object.keys(saved).sort().join(',') !== 'files,schema,version') fail('invalid Skill version schema');
        const files = saved.files.map(file => {
            if (Object.keys(file).sort().join(',') !== 'content,path,sha256' || typeof file.content !== 'string') fail('invalid Skill version file');
            const buffer = Buffer.from(file.content, 'base64');
            if (buffer.toString('base64') !== file.content || hash(buffer) !== file.sha256) fail('Skill version integrity mismatch');
            return { path: file.path, buffer, isBinary: buffer.subarray(0, 512).includes(0) };
        });
        validateFiles(files, name);
        if (filesHash(files) !== version) fail('Skill version integrity mismatch');
        return files;
    }
    async function saveVersion(scope, name, files) {
        const totalBytes = validateFiles(files, name);
        const version = filesHash(files);
        const dir = directory(scope, name);
        const destination = join(dir, `${version}.json`);
        if (await fs.stat(destination).catch(() => null)) {
            await readVersion({ scope, name, version });
            return version;
        }
        assertWritable();
        await fs.mkdir(dir, { recursive: true });
        const existing = (await fs.readdir(dir)).filter(file => versionPattern.test(file.replace(/\.json$/, '')));
        let total = totalBytes;
        for (const file of existing) {
            const previous = await readVersion({ scope, name, version: file.slice(0, -5) });
            total += previous.reduce((sum, entry) => sum + entry.buffer.length, 0);
        }
        if (existing.length >= 64 || total > 64 * 1024 * 1024) fail('Skill history capacity exceeded', 413);
        const staging = join(dir, `.staging-${randomUUID()}`);
        try {
            await fs.writeFile(staging, JSON.stringify({ schema: 'atria.skill-version.v1', version,
                files: files.map(file => ({ path: file.path, sha256: hash(file.buffer), content: file.buffer.toString('base64') })) }), { flag: 'wx' });
            await fs.rename(staging, destination);
        } finally { await fs.rm(staging, { force: true }); }
        return version;
    }
    async function pin({ scope, name, expectedHash }) {
        if (expectedHash !== undefined) assertVersion(expectedHash);
        const files = await readCurrentFiles({ scope, name });
        validateFiles(files, name);
        const version = filesHash(files);
        if (expectedHash !== undefined && version !== expectedHash) fail('Skill version conflict', 409);
        await saveVersion(scope, name, files);
        return { scope, name, version };
    }
    async function history({ scope, name }) {
        await fs.access(join(skillsRoot, identity(scope, name))).catch(() => fail('Skill not found', 404));
        const dir = directory(scope, name);
        const names = await fs.readdir(dir).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
        const versions = [];
        for (const file of names.filter(file => /^[a-f0-9]{64}\.json$/.test(file)).sort()) {
            const version = file.slice(0, -5);
            const files = await readVersion({ scope, name, version });
            versions.push({ version, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.buffer.length, 0) });
        }
        return { versions };
    }
    async function prepareCandidate({ scope, name, baseVersion, content }) {
        assertWritable();
        if (scope.kind === 'package') fail('Package Skill originals are read-only', 403);
        assertVersion(baseVersion);
        if (typeof content !== 'string' || Buffer.byteLength(content) > 512 * 1024) fail('candidate content size exceeded');
        const files = await readVersion({ scope, name, version: baseVersion });
        const md = files.find(file => file.path === 'SKILL.md');
        const before = md.buffer.toString('utf8');
        // Preserve the entire declaration, including unknown compatibility fields.
        if (!header(before) || header(content) !== header(before)) fail('candidate must preserve Skill frontmatter');
        md.buffer = Buffer.from(content);
        const version = await saveVersion(scope, name, files);
        const candidate = { schema: 'atria.skill-candidate.v1', scope, name, baseVersion, version, diff: { path: 'SKILL.md', before, after: content } };
        if (Buffer.byteLength(JSON.stringify(candidate)) > 2 * 1024 * 1024) fail('candidate size exceeded', 413);
        const candidateId = hash(JSON.stringify(candidate));
        const dir = join(directory(scope, name), 'candidates');
        await fs.mkdir(dir, { recursive: true });
        const path = join(dir, `${candidateId}.json`);
        if (await fs.stat(path).catch(() => null)) {
            if (await fs.readFile(path, 'utf8') !== JSON.stringify(candidate)) fail('candidate integrity mismatch');
        } else {
            if ((await fs.readdir(dir)).filter(file => /^[a-f0-9]{64}\.json$/.test(file)).length >= 64) fail('candidate capacity exceeded', 413);
            const staging = join(dir, `.staging-${randomUUID()}`);
            try {
                await fs.writeFile(staging, JSON.stringify(candidate), { flag: 'wx' });
                await fs.rename(staging, path);
            } finally { await fs.rm(staging, { force: true }); }
        }
        return { ...candidate, candidateId };
    }
    async function checkCandidate({ scope, name, candidateId }) {
        assertVersion(candidateId);
        const path = join(directory(scope, name), 'candidates', `${candidateId}.json`);
        const stat = await fs.stat(path).catch(() => fail('candidate not found', 404));
        if (stat.size > 2 * 1024 * 1024) fail('candidate size exceeded');
        const raw = await fs.readFile(path, 'utf8');
        const candidate = JSON.parse(raw);
        if (hash(raw) !== candidateId || candidate.schema !== 'atria.skill-candidate.v1'
            || Object.keys(candidate).sort().join(',') !== 'baseVersion,diff,name,schema,scope,version'
            || candidate.name !== name || encodeScopePath(candidate.scope) !== encodeScopePath(scope)) fail('candidate integrity mismatch');
        const base = await readVersion({ scope, name, version: candidate.baseVersion });
        const desired = await readVersion({ scope, name, version: candidate.version });
        const before = base.find(file => file.path === 'SKILL.md').buffer.toString('utf8');
        const after = desired.find(file => file.path === 'SKILL.md').buffer.toString('utf8');
        if (candidate.diff?.before !== before || candidate.diff?.after !== after || candidate.diff?.path !== 'SKILL.md'
            || Object.keys(candidate.diff).sort().join(',') !== 'after,before,path' || header(after) !== header(before)) fail('candidate integrity mismatch');
        base.find(file => file.path === 'SKILL.md').buffer = Buffer.from(after);
        if (filesHash(base) !== candidate.version) fail('candidate changed supporting files');
        const currentFiles = await readCurrentFiles({ scope, name });
        validateFiles(currentFiles, name);
        const currentVersion = filesHash(currentFiles);
        return { ...candidate, candidateId, currentVersion, conflict: currentVersion !== candidate.baseVersion };
    }
    return { pin, history, readVersion, prepareCandidate, checkCandidate,
        async remove(scope, name) { await fs.rm(name ? directory(scope, name) : join(historyRoot, encodeScopePath(scope)), { recursive: true, force: true }); },
        async copy(fromScope, toScope, fromName, toName = fromName) {
            const from = fromName ? directory(fromScope, fromName) : join(historyRoot, encodeScopePath(fromScope));
            const to = fromName ? directory(toScope, toName) : join(historyRoot, encodeScopePath(toScope));
            if (await fs.stat(from).catch(() => null)) {
                await fs.mkdir(join(to, '..'), { recursive: true });
                await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
            }
        },
    };
}
