import express from 'express';
import request from 'supertest';
import path from 'node:path';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createNativeId } from '../../src/native/identity.js';
import { projectCommitFixture } from './helpers/project-commit-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { prepareControllerOwnerRoot } from './fixtures.js';

const projectId = createNativeId('project'), taskId = 'agenttask_http_commit';
const pathFor = (project = projectId, task = taskId) => '/projects/' + project + '/agent/tasks/' + task + '/commit';
const prepareBody = () => ({ commandId: createNativeId('orchestrationCommand'),
    planRef: { planId: createNativeId('orchestrationPlan'), planRevisionId: createNativeId('orchestrationRevision'), definitionHash: 'a'.repeat(64) },
    expectedSequence: 0, expectedReviewHash: 'b'.repeat(64),
    computeBudget: { maxRequests: 1, maxTokens: 100, localWork: { maxJobs: 8, maxItems: 20, maxInputBytes: 65536 } } });
const effectBody = () => ({ runId: createNativeId('orchestrationRun'), effectId: createNativeId('orchestrationEffect') });

function appFor(host, { services = {}, handle = 'u' } = {}) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (handle) req.user = { profile: { handle } }; next(); });
    app.use(createNativeStudioRouter(() => services, undefined, () => host));
    return app;
}

async function makeOwners(make) {
    const h = await make();
    h.directoriesByHandle = handle => handle === h.handle ? h.dirs : Object.fromEntries(Object.entries(h.dirs)
        .map(([key, value]) => [key, path.join(h.dataRoot, handle, path.relative(h.dirs.root, value))]));
    h.engine._directoriesByHandle = h.directoriesByHandle;
    await prepareControllerOwnerRoot(h.directoriesByHandle('foreign-commit-user').root);
    return h;
}

describe('Project Commit HTTP authority admission', () => {
    test('the actual Host refuses all three operations when its original commit authority is absent', async () => {
        const host = new NativeGenerationHost({}), app = appFor(host);
        for (const [method, body] of [['prepare', prepareBody()], ['dispatch', effectBody()], ['observe', effectBody()]]) {
            const response = await request(app).post(pathFor() + '/' + method).send(body);
            expect(response.status).toBe(503); expect(response.headers['cache-control']).toBe('no-store');
            expect(response.body).toEqual({ error: 'native_orchestration_project_commit_unavailable' });
        }
    });

    test('the HTTP boundary rejects unknown and missing fields before a Host authority can run', async () => {
        const host = new NativeGenerationHost({}), app = appFor(host);
        for (const [method, body] of [['prepare', prepareBody()], ['dispatch', effectBody()], ['observe', effectBody()]]) {
            for (const extra of [{ projectId: createNativeId('project') }, { taskId: 'caller-task' }, { handle: 'foreign' }, { approved: true }]) {
                const response = await request(app).post(pathFor() + '/' + method).send({ ...body, ...extra });
                expect(response.status).toBe(400); expect(response.headers['cache-control']).toBe('no-store');
                expect(response.body).toEqual({ error: 'native_studio_invalid_request' });
            }
            for (const field of Object.keys(body)) {
                const missing = { ...body }; delete missing[field];
                const response = await request(app).post(pathFor() + '/' + method).send(missing);
                expect(response.status).toBe(400); expect(response.headers['cache-control']).toBe('no-store');
                expect(response.body).toEqual({ error: 'native_studio_invalid_request' });
            }
        }
    });

    test('an unauthenticated request cannot enter prepare, dispatch or observation', async () => {
        const app = appFor(new NativeGenerationHost({}), { handle: null });
        for (const [method, body] of [['prepare', prepareBody()], ['dispatch', effectBody()], ['observe', effectBody()]]) {
            expect((await request(app).post(pathFor() + '/' + method).send(body)).status).toBe(401);
        }
    });
});

describe.each(CONTRACT_HARNESSES)('$name original Project Commit HTTP', ({ make }) => {
    test('prepare uses the authenticated user and path source; an unapproved dispatch cannot execute the original commit', async () => {
        const f = await projectCommitFixture(make);
        try {
            const host = new NativeGenerationHost({ projectCommitAuthority: f.authority }), app = appFor(host, { services: f, handle: f.h.handle });
            const base = pathFor(f.projectId, f.taskId), body = { ...f.input }; delete body.projectId; delete body.taskId;
            const taskResponse = await request(app).get(base.replace('/commit', ''));
            expect(taskResponse.status).toBe(200);
            expect(taskResponse.body.reviewHash).toBe(body.expectedReviewHash);
            expect(taskResponse.body.sequence).toBe(body.expectedSequence);
            body.expectedReviewHash = taskResponse.body.reviewHash;

            const response = await request(app).post(base + '/prepare').send(body);
            expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
            expect(response.body.status).toBe('waiting_approval');
            const prepared = response.body, effect = { runId: prepared.runId, effectId: prepared.effectId };
            const root = await f.authority.execution.runs.get(f.h.handle, prepared.runId);
            expect(root.ownerRef.handle).toBe(f.h.handle);
            expect(root.sourceBinding.sourceRequest).toMatchObject({ domain: 'project', purpose: 'formal_commit', projectId: f.projectId, taskId: f.taskId });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.taskId);
            const rejected = await request(app).post(base + '/dispatch').send(effect);
            expect(rejected.status).toBe(409); expect(rejected.headers['cache-control']).toBe('no-store');
            expect(await f.agent.observeTask(f.h.handle, f.projectId, f.taskId)).toEqual(task);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
            const observed = await request(app).post(base + '/observe').send(effect);
            expect(observed.status).toBe(200); expect(observed.headers['cache-control']).toBe('no-store');
            expect(observed.body).toMatchObject({ ...effect, domainReceiptRef: null, claimRef: null });
            expect(task.compute.attempts).toEqual([]); expect(task.changeSets).toEqual([]);
        } finally { await f.cleanup(); }
    }, 180000);

    test('only the approved exact HTTP source commits once; foreign owner, Project and Task paths cannot consume that authority', async () => {
        const f = await projectCommitFixture(() => makeOwners(make));
        try {
            const host = new NativeGenerationHost({ projectCommitAuthority: f.authority }), app = appFor(host, { services: f, handle: f.h.handle });
            const base = pathFor(f.projectId, f.taskId), body = { ...f.input }; delete body.projectId; delete body.taskId;
            const taskResponse = await request(app).get(base.replace('/commit', ''));
            expect(taskResponse.status).toBe(200);
            expect(taskResponse.body.reviewHash).toBe(body.expectedReviewHash);
            expect(taskResponse.body.sequence).toBe(body.expectedSequence);
            body.expectedReviewHash = taskResponse.body.reviewHash;

            const preparedResponse = await request(app).post(base + '/prepare').send(body);
            expect(preparedResponse.status).toBe(200);
            const prepared = preparedResponse.body, effect = { runId: prepared.runId, effectId: prepared.effectId };
            await f.approve(prepared);
            const before = await f.agent.observeTask(f.h.handle, f.projectId, f.taskId);
            for (const path of [pathFor(createNativeId('project'), f.taskId), pathFor(f.projectId, 'agenttask_foreign_commit')]) {
                for (const operation of ['dispatch', 'observe']) {
                    const response = await request(app).post(path + '/' + operation).send(effect);
                    expect(response.status).toBe(409); expect(response.headers['cache-control']).toBe('no-store');
                    expect(response.body).toEqual({ error: 'native_orchestration_project_commit_stale' });
                }
            }
            const foreign = appFor(host, { services: f, handle: 'foreign-commit-user' });
            for (const operation of ['dispatch', 'observe']) {
                const response = await request(foreign).post(base + '/' + operation).send(effect);
                expect(response.status).toBe(404); expect(response.headers['cache-control']).toBe('no-store');
                expect(response.body).toEqual({ error: 'native_studio_not_found' });
                expect(JSON.stringify(response.body)).not.toContain(f.proposed.project.displayName);
            }
            expect(await f.agent.observeTask(f.h.handle, f.projectId, f.taskId)).toEqual(before);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
            const committed = await request(app).post(base + '/dispatch').send(effect);
            expect(committed.status).toBe(200); expect(committed.headers['cache-control']).toBe('no-store');
            expect(committed.body.domainReceiptRef).toMatchObject({ kind: 'native_project_commit', projectId: f.projectId, taskId: f.taskId, baseRevision: f.task.baseRevision });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.taskId), project = await f.studio.observeProject(f.h.handle, f.projectId);
            expect(task.status).toBe('completed'); expect(task.changeSets).toHaveLength(1);
            expect(project.source.project.displayName).toBe(f.proposed.project.displayName);
            expect(project.revision.revision).toBe(committed.body.domainReceiptRef.resultingRevision);
            for (const operation of ['dispatch', 'observe']) {
                const repeated = await request(app).post(base + '/' + operation).send(effect);
                expect(repeated.status).toBe(200); expect(repeated.headers['cache-control']).toBe('no-store');
                expect(repeated.body).toEqual(committed.body);
            }
            expect(await f.agent.observeTask(f.h.handle, f.projectId, f.taskId)).toEqual(task);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(project.revision.revision);
            expect(task.compute.attempts).toEqual([]); expect(task.compute.localWork.every(row => row.status === 'settled')).toBe(true);
        } finally { await f.cleanup(); }
    }, 180000);
});
