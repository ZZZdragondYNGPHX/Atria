import { describe, expect, test, jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createServer } from 'node:http';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services as projectServices } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

import {
    createNativeId,
    resolveNativeSkillEntries,
    toNativeSkillScope,
} from '../../src/native/index.js';

describe('A5 Native Skill scopes', () => {
    test('resolves global -> project -> exact package with later scopes winning by skill name', () => {
        const projectId = createNativeId('project');
        const packageId = createNativeId('package');
        const packageVersionId = createNativeId('packageVersion');
        const entries = [
            { name: 'guide', scope: { kind: 'global' }, description: 'global' },
            { name: 'guide', scope: { kind: 'project', projectId }, description: 'project' },
            {
                name: 'guide',
                scope: { kind: 'package', packageId, packageVersionId },
                description: 'package',
            },
            { name: 'global-only', scope: { kind: 'global' } },
            { name: 'legacy-char', scope: { kind: 'character', characterFile: 'a.png' } },
        ];
        const resolved = resolveNativeSkillEntries(entries, {
            projectId,
            packageId,
            packageVersionId,
            skillIds: ['guide'],
        });
        expect(resolved.map(item => [item.name, item.description]))
            .toEqual([['global-only', undefined], ['guide', 'package']]);
        expect(resolved.some(item => item.name === 'legacy-char')).toBe(false);
    });

    test('converts only global/project/package repository scopes into Native contract scopes', () => {
        const projectId = createNativeId('project');
        expect(toNativeSkillScope({
            name: 'workflow',
            scope: { kind: 'project', projectId },
        })).toEqual({
            skillId: 'workflow',
            scope: 'project',
            projectId,
        });
        expect(() => toNativeSkillScope({
            name: 'card-skill',
            scope: { kind: 'character', characterFile: 'a.png' },
        })).toThrow(/does not use a Native/);
    });
});

async function projectSkillFixture(make, maxJobs = 11, maxInputBytes = 1048576) {
    const h = await make(), seen = [], server = createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; seen.push(JSON.parse(raw));
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Read pinned guidance.' } }],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const services = projectServices(h), source = projectSource(), project = await services.studio.createProject(h.handle, source);
    const task = await services.agent.createTask(h.handle, source.project.projectId, { intent: 'Read pinned guidance', baseRevision: project.revision.revision });
    const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
        computeBudget: { maxRequests: 2, maxTokens: 64000, ...(maxJobs ? { localWork: { maxJobs, maxItems: maxJobs, maxInputBytes } } : {}) } } });
    const repo = createSkillRepository(h.dirs.root), scope = { kind: 'project', projectId: source.project.projectId };
    await repo.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: guide\ndescription: Pinned guidance\n---\nOriginal guidance.' },
        { path: 'ref.md', encoding: 'utf8', content: 'Original supporting reference.' }] } });
    const host = new NativeGenerationHost({ ...seeded, ...services, providers: { 'provider.openai-compatible': createHttpGenerationProvider() },
        skillRepository: () => repo, extensions: { settings: async () => ({ value: {} }) }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeGenerationRouter(() => host));
    // Own this server explicitly: an aborted Supertest request may skip the
    // callback that otherwise closes its implicitly created listening server.
    const apiServer = createServer(app); await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
    const computeContext = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
    const request = (operation, input) => supertest(apiServer).post('/skill-work').send({ operation, input, computeContext });
    return { ...h, ...seeded, ...services, host, repo, scope, seen, task, computeContext, request,
        bank: async () => (await services.agent.getTask(h.handle, computeContext.projectId, task.taskId)).compute,
        async cleanup() { apiServer.closeAllConnections(); await new Promise(resolve => apiServer.close(resolve)); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 Studio Skill ${kind} actual list pin reads and catalog share original Task with generation`, async () => {
        const f = await projectSkillFixture(make);
        try {
            const list = await f.request('list', { context: {} }).expect(200), entry = list.body[0];
            const pin = await f.request('pin', { scope: f.scope, name: 'guide', expectedHash: entry.installedHash }).expect(200);
            const input = { scope: f.scope, name: 'guide', version: pin.body.version };
            expect((await f.request('read', { ...input, path: 'SKILL.md', full: true }).expect(200)).body.content).toContain('Original guidance');
            await f.repo.writeFile({ scope: f.scope, name: 'guide', path: 'ref.md', content: 'Changed live file.' });
            expect((await f.request('read', { ...input, path: 'ref.md', offset: 1, limit: 10 }).expect(200)).body.content).toBe('Original supporting reference.');
            expect((await f.request('files', input).expect(200)).body.files.map(file => file.path)).toContain('ref.md');
            await f.request('catalog', { names: ['guide'] }).expect(200);
            await f.host.execute(f.handle, { ...f.computeContext, role: 'studio', requestId: 'same-task-generation', revision: f.computeContext.revision });
            const bank = await f.bank();
            expect(bank.localWork.map(row => row.kind)).toEqual(['skill_inventory', 'skill_pin', 'skill_load', 'skill_read', 'skill_read', 'skill_inventory',
                'route_resolve', 'context_build', 'prompt_compile', 'generation_count', 'generation_render']);
            expect(bank.localWork.filter(row => row.status === 'unknown')).toHaveLength(1);
            expect(bank.localWork.filter(row => row.status === 'settled').every(row => row.usage.cpuScope === 'process' && row.usage.outcome === 'completed')).toBe(true);
            expect(bank.attempts[0].usage.totalTokens).toBe(20); expect(f.seen).toHaveLength(1);
            await f.persistence.saveRuntimeRoute(f.handle, { ...f.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
            const before = structuredClone(bank), scan = jest.spyOn(f.repo, 'list');
            expect((await f.request('list', { context: {} }).expect(400)).body.error).toBe('native_generation_budget_exhausted');
            expect(scan).not.toHaveBeenCalled(); expect(await f.bank()).toEqual(before); scan.mockRestore();
        } finally { await f.cleanup(); }
    });
}
test.each(['bytes', 'pin_quota', 'pin_failure', 'taken_over', 'late_task', 'after_settle', 'unbounded_taken_over', 'unbounded_readonly'])('G05 Studio Skill %s respects original Task and retains actual work', async scenario => {
    const f = await projectSkillFixture(makeTempFsEngineHarness, scenario.startsWith('unbounded') ? null : scenario === 'pin_quota' ? 1 : 10, scenario === 'bytes' ? 1 : 1048576);
    let spy;
    try {
        const before = await f.agent.getTask(f.handle, f.computeContext.projectId, f.task.taskId);
        if (scenario.includes('taken_over')) await f.agent.takeOver(f.handle, f.computeContext.projectId, f.task.taskId);
        if (scenario === 'unbounded_readonly') setReadOnly(true);
        if (scenario === 'late_task') {
            const original = f.repo.list.bind(f.repo);
            spy = jest.spyOn(f.repo, 'list').mockImplementation(async (...args) => { const result = await original(...args); await f.agent.takeOver(f.handle, f.computeContext.projectId, f.task.taskId); return result; });
        }
        if (scenario === 'after_settle') {
            const original = f.agent.settleLocalWork.bind(f.agent);
            spy = jest.spyOn(f.agent, 'settleLocalWork').mockImplementation(async (...args) => { const result = await original(...args); await f.agent.takeOver(f.handle, f.computeContext.projectId, f.task.taskId); return result; });
        }
        const list = await f.request('list', { context: {} });
        expect(list.status).toBe(['pin_quota', 'pin_failure', 'unbounded_readonly'].includes(scenario) ? 200 : 400);
        let pinStatus = null;
        if (['pin_quota', 'pin_failure'].includes(scenario)) {
            const pin = await f.request('pin', { scope: f.scope, name: 'guide', expectedHash: scenario === 'pin_failure' ? 'f'.repeat(64) : list.body[0].installedHash });
            pinStatus = pin.status;
        }
        expect(pinStatus).toBe(['pin_quota', 'pin_failure'].includes(scenario) ? 400 : null);
        const bank = await f.bank();
        expect(bank?.localWork.map(row => row.usage?.outcome ?? row.status) ?? []).toEqual(scenario === 'pin_quota' ? ['completed'] : scenario === 'pin_failure' ? ['completed', 'failed']
            : scenario === 'late_task' ? ['failed'] : scenario === 'after_settle' ? ['completed'] : []);
        expect(f.seen).toEqual([]);
        expect(scenario === 'unbounded_readonly' ? await f.agent.getTask(f.handle, f.computeContext.projectId, f.task.taskId) : before).toEqual(before);
    } finally { spy?.mockRestore(); setReadOnly(false); await f.cleanup(); }
});
test('G05 Studio Skill client cancellation retains its admitted server read until worker settlement', async () => {
    const f = await projectSkillFixture(makeTempFsEngineHarness); let release, reading;
    const entered = new Promise(resolve => { reading = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const original = f.repo.list.bind(f.repo), scan = jest.spyOn(f.repo, 'list').mockImplementation(async (...args) => { reading(); await gate; return original(...args); });
    try {
        const request = f.request('list', { context: {} }), result = request.then(value => ({ value }), error => ({ error }));
        await entered; request.abort(); await new Promise(resolve => setTimeout(resolve, 20)); release(); await result;
        let bank;
        for (let n = 0; n < 50; n++) {
            bank = await f.bank(); if (bank?.localWork[0]?.status === 'settled') break;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(bank.localWork).toHaveLength(1); expect(bank.localWork[0]).toMatchObject({ kind: 'skill_inventory', status: 'settled', usage: { outcome: 'cancelled', cpuScope: 'process' } });
        expect(bank.attempts).toEqual([]); expect(f.seen).toEqual([]);
    } finally { release(); scan.mockRestore(); await f.cleanup(); }
});
