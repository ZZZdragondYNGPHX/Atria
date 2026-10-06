import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import request from 'supertest';
import { createSkillRepository } from '../../src/skills/repository.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { createSkillsRouter } from '../../src/endpoints/skills.js';
import { prepareNarrativeSkills } from '../../src/native/skill-invocation.js';

const scope = { kind: 'global' };
const name = 'guide';
const md = body => `---\nname: guide\ndescription: Guidance\nmetadata:\n  atria-paths: narrative,studio,agents\n---\n${body}`;
let root, repo, base;
beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'atri-s07-'));
    repo = createSkillRepository(root);
    await repo.install({ scope, payload: { files: [
        { path: 'SKILL.md', content: md('old instructions') },
        { path: 'references/guide.txt', content: 'old reference\nline two' },
        { path: 'scripts/tool.js', content: 'unchanged script' },
        { path: 'assets/image.bin', encoding: 'base64', content: Buffer.from([0, 1, 2]).toString('base64') },
    ] } });
    base = (await repo.pin({ scope, name, expectedHash: (await repo.get(name, scope)).installedHash })).version;
});
afterEach(async () => { jest.restoreAllMocks(); setReadOnly(false); await fs.rm(root, { recursive: true, force: true }); });
const read = (repository = repo, version = base, path = 'SKILL.md') => repository.readFile({ scope, name, version, path });
const candidate = () => repo.prepareCandidate({ scope, name, baseVersion: base, content: md('new instructions') });

test('complete immutable version survives replace, supporting-file edit and repository restart', async () => {
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'new reference' });
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('new instructions') });
    repo = createSkillRepository(root);
    expect((await read()).content).toBe(md('old instructions'));
    expect((await read(repo, base, 'references/guide.txt')).content).toBe('old reference\nline two');
    const files = await repo.listFiles({ scope, name, version: base });
    expect(files.find(file => file.path === 'assets/image.bin').buffer).toEqual(Buffer.from([0, 1, 2]));
    await expect(read(repo, base, 'assets/image.bin')).rejects.toThrow('binary');
    expect((await repo.readFile({ scope, name })).content).toBe(md('new instructions'));
    expect((await repo.history({ scope, name })).versions.map(item => item.version)).toContain(base);
});

test('legacy installation has no fabricated history until pinned or edited', async () => {
    await repo.install({ scope, payload: { files: [{ path: 'SKILL.md', content: '---\nname: legacy\ndescription: legacy\n---\nold' }] } });
    expect((await repo.history({ scope, name: 'legacy' })).versions).toEqual([]);
    const old = (await repo.get('legacy', scope)).installedHash;
    await repo.editFile({ scope, name: 'legacy', path: 'SKILL.md', oldString: 'old', newString: 'new' });
    expect((await repo.readFile({ scope, name: 'legacy', version: old })).content).toContain('old');
});

test('pin rejects stale inventory and unknown versions without latest fallback', async () => {
    await repo.editFile({ scope, name, path: 'SKILL.md', oldString: 'old', newString: 'new' });
    await expect(repo.pin({ scope, name, expectedHash: base })).rejects.toMatchObject({ status: 409 });
    await expect(read(repo, 'f'.repeat(64))).rejects.toMatchObject({ status: 404 });
    await expect(read(repo, '../latest')).rejects.toThrow('invalid');
});

test('candidate freezes full content, diff and base without changing the installed authority', async () => {
    const value = await candidate();
    expect(value.baseVersion).toBe(base);
    expect(value.version).not.toBe(base);
    expect(value.diff).toEqual({ path: 'SKILL.md', before: md('old instructions'), after: md('new instructions') });
    expect(await candidate()).toEqual(value);
    expect((await repo.get(name, scope)).installedHash).toBe(base);
    expect((await read(repo, value.version, 'scripts/tool.js')).content).toBe('unchanged script');
    expect((await repo.checkCandidate({ scope, name, candidateId: value.candidateId })).conflict).toBe(false);
    await expect(repo.prepareCandidate({ scope, name, baseVersion: base, content: md('new').replace('Guidance', 'Change declaration') })).rejects.toThrow('frontmatter');
});

test('explicit apply uses complete-base CAS and response loss can reconcile desired version', async () => {
    const value = await candidate();
    await expect(repo.applyCandidate({ scope, name, candidateId: value.candidateId, expectedBaseVersion: 'f'.repeat(64) })).rejects.toMatchObject({ status: 409 });
    const result = await repo.applyCandidate({ scope, name, candidateId: value.candidateId, expectedBaseVersion: base });
    expect(result.version).toBe(value.version);
    expect((await repo.get(name, scope)).installedHash).toBe(value.version);
    repo = createSkillRepository(root);
    expect((await repo.applyCandidate({ scope, name, candidateId: value.candidateId, expectedBaseVersion: base })).alreadyApplied).toBe(true);
    expect((await read()).content).toBe(md('old instructions'));
});

test('an edit to any supporting file conflicts; check never overwrites user changes', async () => {
    const value = await candidate();
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'human edit' });
    expect((await repo.checkCandidate({ scope, name, candidateId: value.candidateId })).conflict).toBe(true);
    await expect(repo.applyCandidate({ scope, name, candidateId: value.candidateId, expectedBaseVersion: base })).rejects.toMatchObject({ status: 409 });
    expect((await repo.readFile({ scope, name, path: 'references/guide.txt' })).content).toBe('human edit');
});

test('two repository instances serialize concurrent candidate CAS at the same root', async () => {
    const first = await candidate();
    const second = await repo.prepareCandidate({ scope, name, baseVersion: base, content: md('other candidate') });
    const other = createSkillRepository(root);
    const results = await Promise.allSettled([
        repo.applyCandidate({ scope, name, candidateId: first.candidateId, expectedBaseVersion: base }),
        other.applyCandidate({ scope, name, candidateId: second.candidateId, expectedBaseVersion: base }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409);
    expect((await repo.get(name, scope)).installedHash).toBe(first.version);
});

test('whole-skill install CAS detects changed files and rejects competing replacement', async () => {
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'human' });
    await expect(repo.install({ scope, payload: { files: [{ path: 'SKILL.md', content: md('replacement') }] }, conflictStrategy: 'replace', expectedInstalledHash: base })).rejects.toMatchObject({ status: 409 });
    expect((await repo.readFile({ scope, name, path: 'references/guide.txt' })).content).toBe('human');
});

test('failed snapshot persistence leaves installed content unchanged', async () => {
    const rename = fs.rename.bind(fs);
    jest.spyOn(fs, 'rename').mockImplementation((from, to) => String(to).includes('.history') ? Promise.reject(new Error('injected snapshot failure')) : rename(from, to));
    await expect(candidate()).rejects.toThrow('injected snapshot failure');
    expect((await repo.get(name, scope)).installedHash).toBe(base);
});

test('failed candidate file switch preserves old version and cleans staging', async () => {
    const value = await candidate();
    const rename = fs.rename.bind(fs);
    jest.spyOn(fs, 'rename').mockImplementation((from, to) => to === join(root, 'skills/global/guide/SKILL.md') ? Promise.reject(new Error('injected switch failure')) : rename(from, to));
    await expect(repo.applyCandidate({ scope, name, candidateId: value.candidateId, expectedBaseVersion: base })).rejects.toThrow('switch failure');
    expect((await repo.get(name, scope)).installedHash).toBe(base);
    expect((await repo.pin({ scope, name })).version).toBe(base);
});

test('failed replacement directory switch restores original directory', async () => {
    const rename = fs.rename.bind(fs);
    jest.spyOn(fs, 'rename').mockImplementation((from, to) => String(from).includes('.staging-') && !String(from).endsWith('-backup') && to === join(root, 'skills/global/guide')
        ? Promise.reject(new Error('injected install failure')) : rename(from, to));
    await expect(repo.install({ scope, payload: { files: [{ path: 'SKILL.md', content: md('replacement') }] }, conflictStrategy: 'replace' })).rejects.toThrow('install failure');
    expect((await repo.get(name, scope)).installedHash).toBe(base);
    expect((await read()).content).toBe(md('old instructions'));
});

test.each(['schema', 'hash'])('unknown/corrupt %s fails closed, while deletion can still purge history', async field => {
    const path = join(root, 'skills/.history/global/guide', base + '.json');
    const saved = JSON.parse(await fs.readFile(path, 'utf8'));
    if (field === 'schema') saved.schema = 'future';
    else saved.files[0].sha256 = 'f'.repeat(64);
    await fs.writeFile(path, JSON.stringify(saved));
    await expect(read()).rejects.toThrow(/schema|integrity/);
    await repo.delete(name, scope);
    await expect(fs.stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('history capacity blocks new pins and writes instead of evicting an accepted version', async () => {
    for (let index = 1; index < 64; index++) {
        await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('version ' + index) });
        await repo.pin({ scope, name });
    }
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('version 64') });
    await expect(repo.pin({ scope, name })).rejects.toMatchObject({ status: 413 });
    await expect(repo.writeFile({ scope, name, path: 'SKILL.md', content: md('version 65') })).rejects.toMatchObject({ status: 413 });
    expect((await read()).content).toBe(md('old instructions'));
    await repo.delete(name, scope);
}, 30000);

test('delete revokes pins, clears candidates, and same-name reinstall does not revive history', async () => {
    const value = await candidate();
    await repo.delete(name, scope);
    await expect(read()).rejects.toMatchObject({ status: 404 });
    await repo.install({ scope, payload: { files: [{ path: 'SKILL.md', content: md('fresh install') }] } });
    await expect(read()).rejects.toMatchObject({ status: 404 });
    await expect(repo.checkCandidate({ scope, name, candidateId: value.candidateId })).rejects.toMatchObject({ status: 404 });
});

test('move preserves exact history at new scope and invalidates old scope and candidate identity', async () => {
    const value = await candidate();
    const target = { kind: 'project', projectId: 'project_a' };
    await repo.moveScope({ name, fromScope: scope, toScope: target });
    await expect(read()).rejects.toMatchObject({ status: 404 });
    expect((await repo.readFile({ scope: target, name, version: base })).content).toBe(md('old instructions'));
    await expect(repo.checkCandidate({ scope: target, name, candidateId: value.candidateId })).rejects.toThrow('integrity');
    await repo.deleteScope(target);
    await expect(repo.readFile({ scope: target, name, version: base })).rejects.toMatchObject({ status: 404 });
});

test('scope copy/rename preserve versions; name rename starts a new declared identity', async () => {
    const from = { kind: 'preset', name: 'old' }, to = { kind: 'preset', name: 'copy' };
    await repo.moveScope({ name, fromScope: scope, toScope: from });
    await repo.copyScope(from, to);
    await repo.renameScope(to, 'renamed');
    const renamed = { kind: 'preset', name: 'renamed' };
    expect((await repo.readFile({ scope: renamed, name, version: base })).content).toBe(md('old instructions'));
    await repo.rename({ scope: renamed, fromName: name, toName: 'new-name' });
    expect((await repo.history({ scope: renamed, name: 'new-name' })).versions).toEqual([]);
    await expect(repo.readFile({ scope: renamed, name, version: base })).rejects.toMatchObject({ status: 404 });
    expect((await repo.readFile({ scope: from, name, version: base })).content).toBe(md('old instructions'));
});

test('Package installation can create exact originals; replacement, candidate and edit are forbidden', async () => {
    const packageScope = { kind: 'package', packageId: 'package_a', packageVersionId: 'version_a' };
    await repo.install({ scope: packageScope, payload: { files: [{ path: 'SKILL.md', content: md('package') }] } });
    const version = (await repo.pin({ scope: packageScope, name })).version;
    expect((await repo.readFile({ scope: packageScope, name, version })).content).toBe(md('package'));
    await expect(repo.writeFile({ scope: packageScope, name, path: 'SKILL.md', content: md('changed') })).rejects.toMatchObject({ status: 403 });
    await expect(repo.install({ scope: packageScope, payload: { files: [{ path: 'SKILL.md', content: md('changed') }] }, conflictStrategy: 'replace' })).rejects.toMatchObject({ status: 403 });
    await expect(repo.prepareCandidate({ scope: packageScope, name, baseVersion: version, content: md('changed') })).rejects.toMatchObject({ status: 403 });
});

test('snapshot refuses symlinks and duplicate/canonical alias payload paths', async () => {
    await fs.symlink(join(root, 'skills/global/guide/SKILL.md'), join(root, 'skills/global/guide/alias'));
    await expect(repo.pin({ scope, name })).rejects.toThrow('symlink');
    await fs.unlink(join(root, 'skills/global/guide/alias'));
    for (const paths of [['SKILL.md', 'SKILL.md'], ['SKILL.md', 'references//alias'], ['SKILL.md', 'references/file.staging-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']]) {
        await expect(repo.install({ scope, payload: { files: paths.map(path => ({ path, content: md('bad') })) }, conflictStrategy: 'replace' })).rejects.toThrow(/duplicate|noncanonical/);
    }
});

test('Native narrative always and supporting reads retain old accepted bytes; next preparation observes edit', async () => {
    const entry = await repo.get(name, scope);
    const settings = { skills: { [JSON.stringify([scope, name])]: {} } };
    // Use metadata default for on-demand, then explicit always setting via the actual entry key.
    const { skillEntryKey } = await import('../../public/shared/extension-contract.js');
    settings.skills[skillEntryKey(entry)] = { paths: { narrative: 'always' } };
    const skills = await prepareNarrativeSkills({ repository: repo, settings, context: {} });
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('new instructions') });
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'new reference' });
    expect(skills.items[0].content).toContain('old instructions');
    expect(skills.items[0].content).toContain(base);
    expect((await skills.read({ name: 'atri_skill_read', args: { name, path: 'references/guide.txt' } })).content).toContain('old reference');
    expect((await skills.read({ name: 'atri_skill_files', args: { name } })).files).toContainEqual({ path: 'assets/image.bin', size: 3, isBinary: true });
    const next = await prepareNarrativeSkills({ repository: repo, settings, context: {} });
    expect(next.items[0].content).toContain('new instructions');
    await repo.delete(name, scope);
    await expect(skills.read({ name: 'atri_skill_read', args: { name } })).rejects.toMatchObject({ status: 404 });
});

test('HTTP pin/history/candidate/apply/read use injected owner and preserve exact versions across requests', async () => {
    const foreignRoot = await fs.mkdtemp(join(tmpdir(), 'atri-s07-owner-'));
    try {
        const foreign = createSkillRepository(foreignRoot);
        const app = express(); app.use(express.json());
        app.use('/api/skills', createSkillsRouter({ getRepository: req => req.headers['x-test-owner'] === 'other' ? foreign : repo }));
        const path = '/api/skills/global/guide';
        expect((await request(app).post(path + '/pin').send({ expectedHash: base })).body.version).toBe(base);
        expect((await request(app).post(path + '/pin').send({})).status).toBe(400);
        const saved = await request(app).post(path + '/candidates').send({ baseVersion: base, content: md('new instructions'), scope: { kind: 'project', projectId: 'foreign' }, owner: 'other' });
        expect(saved.status).toBe(200); expect(saved.headers['cache-control']).toBe('no-store');
        const apply = path + '/candidates/' + saved.body.candidateId + '/apply';
        expect((await request(app).post(apply).send({ expectedBaseVersion: base })).status).toBe(200);
        const file = await request(app).get(path + '/file?version=' + base);
        expect(file.body.content).toBe(md('old instructions')); expect(file.body.version).toBe(base);
        expect((await request(app).get(path + '/files?version=' + base)).body.files).toHaveLength(4);
        expect((await request(app).get(path + '/search?version=' + base + '&q=old')).body.hits).toHaveLength(1);
        expect((await request(app).get(path + '/history')).body.versions).toHaveLength(2);
        expect((await request(app).get(path + '/file?version=' + base).set('x-test-owner', 'other')).status).toBe(404);
        expect((await request(app).post(path + '/pin').send({ expectedHash: base })).status).toBe(409);
        expect((await request(app).post(apply).send({ expectedBaseVersion: base })).body.alreadyApplied).toBe(true);
    } finally { await fs.rm(foreignRoot, { recursive: true, force: true }); }
});


test('read-only mode can consume existing pins and check conflicts but cannot persist new versions or mutate', async () => {
    const value = await candidate();
    setReadOnly(true);
    expect((await read()).content).toContain('old instructions');
    expect((await repo.pin({ scope, name, expectedHash: base })).version).toBe(base);
    expect((await repo.checkCandidate({ scope, name, candidateId: value.candidateId })).conflict).toBe(false);
    await expect(repo.applyCandidate({ scope, name, candidateId: value.candidateId, expectedBaseVersion: base })).rejects.toMatchObject({ name: 'StorageReadOnlyError' });
    await expect(repo.writeFile({ scope, name, path: 'SKILL.md', content: md('mutation') })).rejects.toMatchObject({ name: 'StorageReadOnlyError' });
    await expect(repo.prepareCandidate({ scope, name, baseVersion: base, content: md('new') })).rejects.toMatchObject({ name: 'StorageReadOnlyError' });
    await fs.writeFile(join(root, 'skills/global/guide/SKILL.md'), md('external edit'));
    await expect(repo.pin({ scope, name })).rejects.toMatchObject({ name: 'StorageReadOnlyError' });
    const app = express(); app.use(express.json()); app.use('/api/skills', createSkillsRouter({ getRepository: () => repo }));
    expect((await request(app).post('/api/skills/global/guide/candidates').send({ baseVersion: base, content: md('new') })).status).toBe(503);
});


test('legacy malformed manifest remains repairable without inventing a valid version', async () => {
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: 'broken YAML' });
    await expect(repo.pin({ scope, name })).rejects.toThrow();
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('repaired') });
    expect((await repo.pin({ scope, name })).version).toBe((await repo.get(name, scope)).installedHash);
    expect((await read()).content).toBe(md('old instructions'));
    expect((await repo.history({ scope, name })).versions).toHaveLength(2);
});
