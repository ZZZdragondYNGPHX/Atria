import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureSourceIdentity } from '../../src/logging/source-identity.js';
import { getRuntimeIdentity } from '../../src/logging/runtime-identity.js';
import { serverBootId } from '../../src/logging/startup-store.js';

let root;
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'atria-source-identity-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src/main.js'), 'export const value = 1;\n');
    await writeFile(path.join(root, '.gitignore'), 'src/ignored.js\n');
    git('init', '--quiet'); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
});
afterEach(async () => {
    if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('atria-source-identity-')) throw new Error('Unsafe cleanup');
    await rm(root, { recursive: true, force: true });
});

test('full revision and tracked raw content distinguish clean, dirty, staged and deleted source', async () => {
    const clean = await captureSourceIdentity(root);
    expect(clean.revision).toHaveLength(40); expect(clean.reasons).toEqual([]);
    expect((await captureSourceIdentity(root)).fingerprint).toBe(clean.fingerprint);
    await writeFile(path.join(root, 'src/main.js'), 'export const value = 2;\n');
    const dirty = await captureSourceIdentity(root);
    expect(dirty.fingerprint).not.toBe(clean.fingerprint); expect(dirty.revision).toBe(clean.revision);
    git('add', '.'); expect((await captureSourceIdentity(root)).fingerprint).toBe(dirty.fingerprint);
    await rm(path.join(root, 'src/main.js'));
    const deleted = await captureSourceIdentity(root);
    expect(deleted.reasons).toEqual([]); expect(deleted.fingerprint).not.toBe(dirty.fingerprint);
});

test('non-ignored and ignored runtime extras are uncertainty, not false exactness', async () => {
    await writeFile(path.join(root, 'src/extra.js'), 'extra');
    expect((await captureSourceIdentity(root)).reasons).toContain('runtime_relevant_untracked');
    await rm(path.join(root, 'src/extra.js'));
    await writeFile(path.join(root, 'src/ignored.js'), 'ignored');
    expect((await captureSourceIdentity(root)).reasons).toContain('runtime_relevant_untracked');
});

test('junction source and non-Git installs fail closed without leaking paths', async () => {
    await mkdir(path.join(root, 'outside'));
    await writeFile(path.join(root, 'outside/main.js'), 'private');
    await rm(path.join(root, 'src'), { recursive: true });
    await symlink(path.join(root, 'outside'), path.join(root, 'src'), 'junction');
    const result = await captureSourceIdentity(root);
    expect(result.fingerprint).toBeNull(); expect(JSON.stringify(result)).not.toContain(root);
    expect((await captureSourceIdentity(path.join(root, 'outside'))).reasons.length).toBeGreaterThan(0);
});

test('fallback reuses canonical boot identity and launcher captures before server-main', async () => {
    const identity = getRuntimeIdentity();
    expect(identity.serverBootId).toBe(serverBootId); expect(identity.processStartedAt).toBeGreaterThan(0);
    expect(identity.source.reasons).toContain('startup_identity_not_captured');
    identity.source.reasons.length = 0;
    expect(getRuntimeIdentity().source.reasons).toContain('startup_identity_not_captured');
    const launcher = await readFile(new URL('../../server.js', import.meta.url), 'utf8');
    expect(launcher.indexOf('await initializeRuntimeIdentity()')).toBeLessThan(launcher.indexOf("await import('./src/server-main.js')"));
});
