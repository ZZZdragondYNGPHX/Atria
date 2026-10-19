import { beforeEach, afterEach, expect, test } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createSkillRepository } from '../../src/skills/repository.js';
import { pinSkillEntries, loadAlwaysSkills } from '../../public/shared/skill-invocation.js';
import { ensureShadowRepo, snapshotLiveToShadow, reconcileShadowToLive } from '../../src/sync/shadow.js';

let root, repo;
const scope = { kind: 'global' }, name = 'guide';
const md = text => `---\nname: guide\ndescription: Guide\n---\n${text}`;
beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'atri-s07-run-')); repo = createSkillRepository(root);
    await repo.install({ scope, payload: { files: [{ path: 'SKILL.md', content: md('old instructions') }, { path: 'references/guide.txt', content: 'old supporting content' }] } });
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

test('workers share accepted versions and pinned reads while the next run accepts fresh inventory', async () => {
    const accepted = new Map();
    const resolve = async cache => loadAlwaysSkills(await pinSkillEntries(
        (await repo.list({ scope })).map(entry => ({ ...entry, invocationMode: 'always' })),
        opts => repo.pin(opts), cache,
    ), opts => repo.readFile(opts));
    const main = await resolve(accepted);
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('new instructions') });
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'new supporting content' });
    const child = await resolve(accepted);
    expect(child[0].version).toBe(main[0].version);
    expect(child[0].alwaysContent).toContain('old instructions');
    const read = await repo.readFile({ scope, name, version: child[0].version, path: 'references/guide.txt' });
    expect(read.content).toBe('old supporting content');
    const search = await repo.search({ scope, name, version: child[0].version, query: 'old', path: 'references/guide.txt' });
    expect(JSON.stringify(search)).toContain('old supporting content');
    const next = await resolve(new Map());
    expect(next[0].version).not.toBe(main[0].version);
    expect(next[0].alwaysContent).toContain('new instructions');
    await expect(pinSkillEntries([{ scope, name }], opts => repo.pin(opts))).rejects.toThrow('version_missing');
});

test('Skill snapshots and candidates round-trip through original sync without becoming embedded content', async () => {
    const base = (await repo.pin({ scope, name })).version;
    const candidate = await repo.prepareCandidate({ scope, name, baseVersion: base, content: md('candidate') });
    const dirs = { root };
    const paths = await ensureShadowRepo({ userRoot: root, peerId: 's07' });
    await snapshotLiveToShadow({ userRoot: root, peerId: 's07', directories: dirs, enabledCategoryIds: ['skills'] });
    const historic = join(paths.workdir, 'skills/.history/global/guide', base + '.json');
    expect(JSON.parse(await fs.readFile(historic, 'utf8')).version).toBe(base);
    await fs.rm(join(root, 'skills'), { recursive: true });
    await reconcileShadowToLive({ userRoot: root, peerId: 's07', directories: dirs, enabledCategoryIds: ['skills'] });
    repo = createSkillRepository(root);
    expect((await repo.readFile({ scope, name, version: base })).content).toBe(md('old instructions'));
    expect((await repo.checkCandidate({ scope, name, candidateId: candidate.candidateId })).conflict).toBe(false);
    expect((await repo.listFiles({ scope, name })).map(file => file.path)).toEqual(['references/guide.txt', 'SKILL.md']);
});

test('a hash-valid synced candidate cannot expand supporting files or declarations', async () => {
    const base = (await repo.pin({ scope, name })).version;
    const value = await repo.prepareCandidate({ scope, name, baseVersion: base, content: md('candidate') });
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'malicious support replacement' });
    const malicious = (await repo.pin({ scope, name })).version;
    const saved = { schema: value.schema, scope, name, baseVersion: base, version: malicious,
        diff: { path: 'SKILL.md', before: md('old instructions'), after: md('old instructions') } };
    const raw = JSON.stringify(saved), candidateId = createHash('sha256').update(raw).digest('hex');
    await fs.writeFile(join(root, 'skills/.history/global/guide/candidates', candidateId + '.json'), raw);
    await expect(repo.checkCandidate({ scope, name, candidateId })).rejects.toThrow('supporting files');
});
