import express from 'express';
import request from 'supertest';
import { test, expect } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installedPredictionFixture } from './helpers/prediction-fixture.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { actionReceipts } from '../../src/native/action-receipts.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { createAuthoringOperation } from '../../public/scripts/native/studio-authoring.js';

const appFor = (handle, host) => {
    const app = express(); app.use(express.json());
    if (handle) app.use((req, _res, next) => { req.user = { profile: { handle } }; next(); });
    app.use(createNativeGenerationRouter(() => ({ ...host }))); return app;
};

test('S24 Native HTTP shares server tokens across requests and verifies an original formal receipt without accepting caller evidence', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installedPredictionFixture(h, 'unused', value => { value.contract.taskRuntime.turn = { policy: 'authority-first', stages: [] }; });
        const host = { sessionCore: f.core }, app = appFor(h.handle, host);
        const body = { sessionId: f.body.sessionId, revisionId: f.body.revisionId, request: { viewId: 'player.notes', anchor: f.body.request.anchor,
            requestId: 'http-comparison', candidates: [{ id: 'chosen', action: f.body.request.action }],
            goals: [{ itemId: 'public.notes:main', path: ['text'], equals: f.body.request.action.input.text }] } };
        const proposed = await request(app).post('/comparison/prepare').send(body);
        expect(proposed.status).toBe(200); expect(proposed.headers['cache-control']).toBe('private, no-store');
        expect(proposed.body.selected.candidateId).toBe('chosen'); expect(JSON.stringify(proposed.body)).not.toContain('PRIVATE');
        const token = { sessionId: body.sessionId, comparisonId: proposed.body.comparisonId };
        expect((await request(app).post('/comparison/current').send(token)).body).toEqual({ current: true });
        expect((await request(app).post('/comparison/feedback').send({ ...token, receiptId: 'invented', receipt: {} })).status).toBe(400);
        const action = proposed.body.selected.action;
        const prepared = await f.core.prepareAuthorityTurn(h.handle, f.base, { transactionId: action.transactionId, input: action.input });
        const actual = await f.core.finalizeTurn(h.handle, body.sessionId, { invocationId: 'http-real-action', authorityProof: prepared.proof,
            envelope: { schemaVersion: 1, narrative: 'A formal action.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: body.revisionId });
        const feedback = await request(app).post('/comparison/feedback').send({ ...token, receiptId: actionReceipts(actual).at(-1).receiptId });
        expect(feedback.status).toBe(200); expect(feedback.body.deterministicPredictionError).toEqual({ publicScalarDifferences: 0, exactMatch: true });
        expect(feedback.body.modelPredictionError).toBe('not_measurable');
        expect(await f.core.load(h.handle, body.sessionId)).toEqual(actual);
        expect((await request(app).post('/comparison/current').send(token)).body).toEqual({ current: false });
        expect((await request(appFor(null, host)).post('/comparison/prepare').send(body)).status).toBe(401);
        expect((await request(appFor('foreign', host)).post('/comparison/current').send(token)).body).toEqual({ error: 'native_comparison_unknown' });
    } finally { await h.cleanup(); }
});

test('S24 Project HTTP returns a validation proposal while keeping Task review authority and source unchanged', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const host = services(h), source = projectSource();
        const created = await host.studio.createProject(h.handle, source, { files: new Map([['note.txt', Buffer.from('Original')]]) });
        let task = await host.agent.createTask(h.handle, source.project.projectId, { intent: 'Compare an explicit edit.', baseRevision: created.revision.revision });
        const attempt = { attemptId: 'existing-local-budget', requestId: task.taskId, kind: 'context_build', estimatedItems: 1,
            estimatedInputBytes: 1, targetFingerprint: 'a'.repeat(64) };
        await host.agent.chargeLocalWork(h.handle, source.project.projectId, task.taskId, task.baseRevision,
            { maxRequests: 2, maxTokens: 32000, localWork: { maxJobs: 8, maxItems: 20, maxInputBytes: 16777216 } }, attempt, task.executionFingerprint);
        await host.agent.settleLocalWork(h.handle, source.project.projectId, task.taskId, attempt.attemptId,
            { wallMs: 0, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' });
        task = await host.agent.getTask(h.handle, source.project.projectId, task.taskId);
        const before = await host.studio.getProject(h.handle, source.project.projectId), app = appFor(h.handle, host);
        const body = { projectId: source.project.projectId, taskId: task.taskId, expectedSequence: task.sequence,
            candidates: [{ id: 'edit', operations: [createAuthoringOperation({ operationType: 'source.write', target: { path: 'note.txt' },
                input: { content: 'Proposed', encoding: 'utf8' } })] }] };
        const proposed = await request(app).post('/project-comparison/prepare').send(body);
        expect(proposed.status).toBe(200); expect(proposed.headers['cache-control']).toBe('private, no-store');
        expect(proposed.body.selected.candidateId).toBe('edit');
        expect(await host.studio.getProject(h.handle, source.project.projectId)).toEqual(before);
        const unchanged = await host.agent.getTask(h.handle, source.project.projectId, task.taskId);
        expect(unchanged.status).toBe('planning'); expect(unchanged.operations).toEqual([]); expect(unchanged.changeSets).toEqual([]);
        const token = { comparisonId: proposed.body.comparisonId };
        expect((await request(app).post('/project-comparison/current').send(token)).body).toMatchObject({ current: true });
        expect((await request(app).post('/project-comparison/outcome').send(token)).body).toEqual({ status: 'pending', predictionError: 'not_measurable' });
        expect((await request(app).post('/project-comparison/outcome').send({ ...token, receipt: {} })).status).toBe(400);
        expect((await request(appFor(null, host)).post('/project-comparison/current').send(token)).status).toBe(401);
    } finally { await h.cleanup(); }
});
