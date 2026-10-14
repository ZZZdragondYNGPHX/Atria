import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { AgentExperienceService } from '../../src/native/agent-intelligence/experience-service.js';
import { AgentEvolutionService } from '../../src/native/agent-intelligence/evolution-service.js';
import { createPreviewSkillRepository } from '../../src/native/model-prompt-runtime/preview-skills.js';
import { createNativeId } from '../../src/native/identity.js';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); });

test('real Native compile preview makes zero persistent writes, Secret resolutions or provider sends', async () => {
    const h = await makeTempFsEngine(); cleanup.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://fixture.invalid/v1/chat/completions' });
    const projectId = createNativeId('project');
    const project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const fetchImpl = jest.fn(async () => { throw new Error('Network prohibited in preview'); });
    const secretPort = { resolveSecret: jest.fn(async () => { throw new Error('Secret prohibited in preview'); }) };
    const provider = { ...createHttpGenerationProvider({ fetchImpl }) };
    provider.withRuntimeCheckpointStore = jest.fn(() => { throw new Error('Checkpoint attachment prohibited in preview'); });
    const agent = { observeContext: jest.fn(async () => ({ task: { executionFingerprint: 'a'.repeat(64), conversation: [], baseRevision: 'r1', status: 'planned' }, tools: [] })),
        getContext: jest.fn(() => { throw new Error('Mutable task context prohibited in preview'); }) };
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project }, agent, providers: { 'provider.openai-compatible': provider }, secretPort });
    const transaction = h.engine.withTransaction.bind(h.engine); let writes = 0;
    jest.spyOn(h.engine, 'withTransaction').mockImplementation((owner, operation, ...args) => transaction(owner, tx => operation(new Proxy(tx, {
        get(target, property) {
            const value = target[property];
            if (['putResource', 'putResourceIfMatch', 'deleteResource'].includes(property)) return (...values) => { writes++; return value.apply(target, values); };
            return typeof value === 'function' ? value.bind(target) : value;
        },
    })), ...args));
    const result = await host.execute(h.handle, { role: 'narrator', projectId, taskId: 'task-preview', revision: 'r1', requestId: 'pure-preview', messages: [{ role: 'user', content: 'Compile only' }] }, undefined, undefined, { preview: true });
    expect(result.preview).toBe(true); expect(result.snapshot.requestId).toBe('pure-preview');
    expect(writes).toBe(0); expect(fetchImpl).not.toHaveBeenCalled(); expect(secretPort.resolveSecret).not.toHaveBeenCalled();
    expect(provider.withRuntimeCheckpointStore).not.toHaveBeenCalled();
    expect(agent.observeContext).toHaveBeenCalled(); expect(agent.getContext).not.toHaveBeenCalled();
});

test('preview Skill reads keep exact hashes without creating durable versions and reject concurrent changes', async () => {
    const version = 'a'.repeat(64), scope = { kind: 'global' };
    const repository = { get: jest.fn(async () => ({ installedHash: version })), pin: jest.fn(() => { throw new Error('No durable pin'); }),
        readFile: jest.fn(async () => ({ content: 'Untrusted Skill instructions' })) };
    const view = createPreviewSkillRepository(repository);
    expect(await view.pin({ scope, name: 'guide', expectedHash: version })).toEqual({ scope, name: 'guide', version });
    await view.readFile({ scope, name: 'guide', version, path: 'SKILL.md' });
    expect(repository.pin).not.toHaveBeenCalled();
    expect(repository.readFile).toHaveBeenCalledWith({ scope, name: 'guide', path: 'SKILL.md' });
    repository.get.mockResolvedValueOnce({ installedHash: version }).mockResolvedValueOnce({ installedHash: 'b'.repeat(64) });
    await expect(view.readFile({ scope, name: 'guide', version, path: 'SKILL.md' })).rejects.toMatchObject({ code: 'native_generation_preview_skill_stale' });
});

test('Experience and Evolution observations never reconcile or claim current validity', async () => {
    const h = await makeTempFsEngine(); cleanup.push(h.cleanup);
    const experience = new AgentExperienceService({ engine: h.engine });
    experience.repository.get = jest.fn(async () => ({ sequence: 7, feedback: [{ status: 'active' }] }));
    experience._reconcile = jest.fn(() => { throw new Error('Reconciliation prohibited'); });
    const scope = { domain: 'project', projectId: createNativeId('project') }, input = { scope, subject: 'fixture' };
    const view = await experience.observe(h.handle, input);
    expect(view.validity).toBe('not_reconciled'); expect(view.document.sequence).toBe(7); expect(experience._reconcile).not.toHaveBeenCalled();
    const evolution = new AgentEvolutionService({ host: { persistence: { _engine: h.engine } }, observationOnly: true });
    evolution.repository.get = jest.fn(async () => ({ sequence: 8, publications: [{ id: 'p1' }] }));
    evolution.repository.owner = jest.fn(async () => null);
    evolution.reconcile = jest.fn(() => { throw new Error('Publication/rollback prohibited'); });
    evolution.targets.publicationCurrent = jest.fn(() => { throw new Error('Reconciliation prohibited'); });
    const state = await evolution.observe(h.handle, input);
    expect(state.bindingStates).toEqual([{ publicationId: 'p1', current: null, validity: 'not_reconciled' }]);
    expect(evolution.reconcile).not.toHaveBeenCalled(); expect(evolution.targets.publicationCurrent).not.toHaveBeenCalled();
});

test('native observation routes authenticate owner, reject caller handles and avoid mutation dispatch', async () => {
    const h = await makeTempFsEngine(); cleanup.push(h.cleanup);
    const host = { persistence: { _engine: h.engine } }, app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use('/generation', createNativeGenerationRouter(() => host, () => null));
    const scope = { domain: 'project', projectId: createNativeId('project') }, input = { scope, subject: 'fixture' };
    for (const domain of ['experience', 'evolution']) {
        await supertest(app).post(`/generation/${domain}/observe`).send(input).expect(401);
        const result = await supertest(app).post(`/generation/${domain}/observe`).set('x-user', h.handle).send(input).expect(200);
        expect(result.body.validity).toBe('not_reconciled'); expect(result.headers['cache-control']).toBe('private, no-store');
        await supertest(app).post(`/generation/${domain}/observe`).set('x-user', h.handle).send({ ...input, handle: 'foreign' }).expect(400);
    }
});
