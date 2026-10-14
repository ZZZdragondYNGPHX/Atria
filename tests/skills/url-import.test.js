import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { importFromUrl } from '../../src/skills/url-import.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('url-import (validation paths)', () => {
    let tmpRoot, repo;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(join(tmpdir(), 'skill-url-'));
        repo = createSkillRepository(tmpRoot);
    });

    afterEach(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });

    test('rejects non-https URL', async () => {
        await expect(importFromUrl({
            url: 'http://example.com/SKILL.md',
            targetScope: { kind: 'global' },
            repository: repo,
        })).rejects.toThrow(/https/i);
        await expect(importFromUrl({
            url: 'file:///etc/passwd',
            targetScope: { kind: 'global' },
            repository: repo,
        })).rejects.toThrow(/https/i);
    });

    test('rejects non-string URL', async () => {
        await expect(importFromUrl({
            url: null,
            targetScope: { kind: 'global' },
            repository: repo,
        })).rejects.toThrow(/https/i);
    });
});

// Real-fetch (HTTPS network) testing is intentionally out of scope here. The
// HTTPS-only check makes a unit test fixture awkward (would require a local
// HTTPS server with a self-signed cert), so happy-path coverage is provided
// by the integration smoke and manual testing.

describe('url-import (bounded public-target reader)', () => {
    let tmpRoot, repo;
    beforeEach(async () => { tmpRoot = await fs.mkdtemp(join(tmpdir(), 'skill-url-stub-')); repo = createSkillRepository(tmpRoot); });
    afterEach(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });
    const invoke = (text, extra = {}) => importFromUrl({ url: 'https://example.com/SKILL.md', targetScope: { kind: 'global' }, repository: repo,
        readText: async () => ({ text, contentType: 'text/plain' }), ...extra });
    test('rejects absent frontmatter, oversized UTF-8 bytes and HTML content type', async () => {
        await expect(invoke('<html>not a Skill</html>')).rejects.toThrow(/frontmatter/);
        await expect(invoke('---\nname: x\ndescription: y\n---\n' + '中'.repeat(180000))).rejects.toThrow(/exceeds/);
        await expect(invoke('---\nname: x\ndescription: y\n---\n', { readText: async () => ({ text: '---\n', contentType: 'text/html' }) })).rejects.toThrow(/content type/);
    });
    test('installs exact content through native repository and rejects changed reviewed hash', async () => {
        const text = '---\nname: from-url\ndescription: imported\n---\nbody\n';
        await expect(invoke(text, { expectedContentHash: '0'.repeat(64) })).rejects.toThrow(/changed/);
        const result = await invoke(text, { expectedInstalledHash: null });
        expect(result).toMatchObject({ name: 'from-url', conflict: 'new' }); expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(await repo.get('from-url', { kind: 'global' })).toBeTruthy();
    });
});
