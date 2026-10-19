import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createSkillsRouter } from '../../src/endpoints/skills.js';
import { createSkillRepository } from '../../src/skills/repository.js';

describe('POST /api/skills/rename-scope', () => {
    let app, tmpRoot, repo;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(join(tmpdir(), 'skill-endpoint-'));
        repo = createSkillRepository(tmpRoot);
        app = express();
        app.use(express.json());
        app.use('/api/skills', createSkillsRouter({
            getRepository: () => repo,
            getMemoryIndex: () => ({ invalidate: () => {} }),
        }));
    });

    afterEach(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });

    async function installCharacter(characterFile, skillName) {
        await repo.install({
            scope: { kind: 'character', characterFile },
            payload: { files: [{
                path: 'SKILL.md', encoding: 'utf8',
                content: '---\nname: ' + skillName + '\ndescription: x\n---\n',
            }] },
        });
    }

    test('204 on successful character scope rename', async () => {
        await installCharacter('old-preset', 'alpha');
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({
                scope: { kind: 'character', characterFile: 'old-preset' },
                newName: 'new-preset',
            });
        expect(res.status).toBe(204);

        const oldList = await repo.list({ scope: { kind: 'character', characterFile: 'old-preset' } });
        const newList = await repo.list({ scope: { kind: 'character', characterFile: 'new-preset' } });
        expect(oldList).toEqual([]);
        expect(newList.map(s => s.name)).toContain('alpha');
    });

    test('400 rejects the retired orchestration scope', async () => {
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({ scope: { kind: 'orch-preset', mode: 'spec', name: 'old' }, newName: 'new' });
        expect(res.status).toBe(400);
    });

    test('409 on rename to already-existing destination', async () => {
        await installCharacter('src', 'a');
        await installCharacter('dst', 'b');
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({
                scope: { kind: 'character', characterFile: 'src' },
                newName: 'dst',
            });
        expect(res.status).toBe(409);
    });

    test('404 on missing source scope', async () => {
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({
                scope: { kind: 'character', characterFile: 'nope' },
                newName: 'x',
            });
        expect(res.status).toBe(404);
    });

    test('400 on invalid scope shape', async () => {
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({ scope: null, newName: 'x' });
        expect(res.status).toBe(400);
    });

    test('400 on global scope rename attempt (nonsensical)', async () => {
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({ scope: { kind: 'global' }, newName: 'x' });
        expect(res.status).toBe(400);
    });

    test('rename preset scope (string newName) works for the OAI-preset kind too', async () => {
        await repo.install({
            scope: { kind: 'preset', name: 'oai-old' },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: p\ndescription: x\n---\n' }] },
        });
        const res = await request(app)
            .post('/api/skills/rename-scope')
            .send({ scope: { kind: 'preset', name: 'oai-old' }, newName: 'oai-new' });
        expect(res.status).toBe(204);
        const listed = await repo.list({ scope: { kind: 'preset', name: 'oai-new' } });
        expect(listed.map(s => s.name)).toContain('p');
    });
});

describe('POST /api/skills/copy-scope', () => {
    let app, tmpRoot, repo;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(join(tmpdir(), 'skill-endpoint-'));
        repo = createSkillRepository(tmpRoot);
        app = express();
        app.use(express.json());
        app.use('/api/skills', createSkillsRouter({
            getRepository: () => repo,
            getMemoryIndex: () => ({ invalidate: () => {} }),
        }));
    });

    afterEach(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });

    test('204 and copies skills to fresh destination', async () => {
        await repo.install({
            scope: { kind: 'character', characterFile: 'src' },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: alpha\ndescription: x\n---\n' }] },
        });
        const res = await request(app)
            .post('/api/skills/copy-scope')
            .send({
                fromScope: { kind: 'character', characterFile: 'src' },
                toScope: { kind: 'character', characterFile: 'copy' },
            });
        expect(res.status).toBe(204);
        const srcList = await repo.list({ scope: { kind: 'character', characterFile: 'src' } });
        const copyList = await repo.list({ scope: { kind: 'character', characterFile: 'copy' } });
        expect(srcList.map(s => s.name)).toEqual(['alpha']);
        expect(copyList.map(s => s.name)).toEqual(['alpha']);
    });

    test('409 on destination already exists', async () => {
        await repo.install({
            scope: { kind: 'character', characterFile: 'src' },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: a\ndescription: x\n---\n' }] },
        });
        await repo.install({
            scope: { kind: 'character', characterFile: 'dst' },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: b\ndescription: x\n---\n' }] },
        });
        const res = await request(app)
            .post('/api/skills/copy-scope')
            .send({
                fromScope: { kind: 'character', characterFile: 'src' },
                toScope: { kind: 'character', characterFile: 'dst' },
            });
        expect(res.status).toBe(409);
    });

    test('400 on cross-kind copy attempt', async () => {
        await repo.install({
            scope: { kind: 'character', characterFile: 'src' },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: a\ndescription: x\n---\n' }] },
        });
        const res = await request(app)
            .post('/api/skills/copy-scope')
            .send({
                fromScope: { kind: 'character', characterFile: 'src' },
                toScope: { kind: 'preset', name: 'xxx' },
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/kind/i);
    });

    test('404 on missing source scope', async () => {
        const res = await request(app)
            .post('/api/skills/copy-scope')
            .send({
                fromScope: { kind: 'character', characterFile: 'nope' },
                toScope: { kind: 'character', characterFile: 'x' },
            });
        expect(res.status).toBe(404);
    });
});

describe('DELETE /api/skills/:scope', () => {
    let app, tmpRoot, repo;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(join(tmpdir(), 'skill-endpoint-'));
        repo = createSkillRepository(tmpRoot);
        app = express();
        app.use(express.json());
        app.use('/api/skills', createSkillsRouter({
            getRepository: () => repo,
            getMemoryIndex: () => ({ invalidate: () => {} }),
        }));
    });

    afterEach(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });

    test('204 and removes whole character scope directory', async () => {
        await repo.install({
            scope: { kind: 'character', characterFile: 'to-delete' },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: x\ndescription: y\n---\n' }] },
        });
        const encoded = encodeURIComponent('character/to-delete');
        const res = await request(app).delete('/api/skills/' + encoded);
        expect(res.status).toBe(204);
        const dir = join(tmpRoot, 'skills', 'character', 'to-delete');
        await expect(fs.access(dir)).rejects.toThrow();
    });

    test('204 idempotent on missing scope', async () => {
        const encoded = encodeURIComponent('character/never-existed');
        const res = await request(app).delete('/api/skills/' + encoded);
        expect(res.status).toBe(204);
    });

    test('400 on global scope delete (nonsensical)', async () => {
        const res = await request(app).delete('/api/skills/global');
        expect(res.status).toBe(400);
    });

    test('400 on invalid scope encoding', async () => {
        const res = await request(app).delete('/api/skills/' + encodeURIComponent('invalid-kind/x'));
        expect(res.status).toBe(400);
    });
});
