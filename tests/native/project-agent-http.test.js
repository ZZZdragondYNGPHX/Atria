import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';

import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { ConflictError } from '../../src/storage/errors.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

function appFor(agent) {
    const app = express();
    app.use(express.json({ limit: '4mb' }));
    app.use((req, _res, next) => {
        req.user = { profile: { handle: 'u' } };
        next();
    });
    app.use(createNativeStudioRouter(() => ({ studio: {}, agent })));
    return app;
}

function makeAgent() {
    return {
        listTasks: jest.fn(() => [{ taskId: 'agenttask_test', projectId: 'project_test' }]),
        createTask: jest.fn(async (_handle, projectId, body) => ({
            taskId: 'agenttask_test',
            projectId,
            intent: body.intent,
            baseRevision: body.baseRevision,
            status: 'planning',
        })),
        getTask: jest.fn((_handle, projectId, taskId) => ({ projectId, taskId, status: 'review' })),
        getContext: jest.fn(async (_handle, projectId, taskId) => ({
            task: { projectId, taskId, status: 'planned' },
            tools: [{ type: 'function', function: { name: 'atri_agent_set_plan' } }],
        })),
        executeTool: jest.fn(async (_handle, projectId, taskId, body) => ({
            projectId,
            taskId,
            status: body.name === 'atri_agent_prepare_review' ? 'review' : 'working',
        })),
        commit: jest.fn(async (_handle, projectId, taskId) => ({
            projectId,
            taskId,
            status: 'completed',
        })),
        takeOver: jest.fn((_handle, projectId, taskId) => ({
            projectId,
            taskId,
            status: 'taken_over',
        })),
    };
}

describe('A8 Project Agent HTTP boundary', () => {
    test('routes Project Tasks and tool execution through ProjectAgentService', async () => {
        const agent = makeAgent();
        const app = appFor(agent);

        expect((await request(app).get('/projects/project_test/agent/tasks')).status).toBe(200);
        expect(agent.listTasks).toHaveBeenCalledWith('u', 'project_test');

        const created = await request(app)
            .post('/projects/project_test/agent/tasks')
            .send({
                intent: 'Update the project',
                baseRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            });
        expect(created.status).toBe(200);
        expect(agent.createTask).toHaveBeenCalledWith(
            'u',
            'project_test',
            expect.objectContaining({
                intent: 'Update the project',
                baseRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            }),
        );

        const context = await request(app)
            .get('/projects/project_test/agent/tasks/agenttask_test/context');
        expect(context.status).toBe(200);
        expect(agent.getContext).toHaveBeenCalledWith('u', 'project_test', 'agenttask_test');

        const tool = await request(app)
            .post('/projects/project_test/agent/tasks/agenttask_test/tool')
            .send({ name: 'atri_agent_prepare_review', args: {} });
        expect(tool.status).toBe(200);
        expect(tool.body.status).toBe('review');
        expect(agent.executeTool).toHaveBeenCalledWith(
            'u',
            'project_test',
            'agenttask_test',
            { name: 'atri_agent_prepare_review', args: {} },
        );
    });

    test('keeps Commit and Human Takeover explicit HTTP actions', async () => {
        const agent = makeAgent();
        const app = appFor(agent);

        const commit = await request(app)
            .post('/projects/project_test/agent/tasks/agenttask_test/commit')
            .send({});
        expect(commit.status).toBe(200);
        expect(commit.body.status).toBe('completed');
        expect(agent.commit).toHaveBeenCalledWith('u', 'project_test', 'agenttask_test');

        const takeover = await request(app)
            .post('/projects/project_test/agent/tasks/agenttask_test/takeover')
            .send({});
        expect(takeover.status).toBe(200);
        expect(takeover.body.status).toBe('taken_over');
        expect(agent.takeOver).toHaveBeenCalledWith('u', 'project_test', 'agenttask_test');
    });

    test('surfaces revision conflicts as 409 without replacing the Task baseRevision', async () => {
        const agent = makeAgent();
        const app = appFor(agent);
        agent.executeTool.mockRejectedValue(new ConflictError('project_revision_conflict', {
            code: 'project_revision_conflict',
            projectId: 'project_test',
            expectedRevision: 'rev_agent',
            actualRevision: 'rev_human',
        }));
        const response = await request(app)
            .post('/projects/project_test/agent/tasks/agenttask_test/tool')
            .send({ name: 'atri_agent_prepare_review', args: {} });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'project_revision_conflict',
            details: {
                code: 'project_revision_conflict',
                projectId: 'project_test',
                expectedRevision: 'rev_agent',
                actualRevision: 'rev_human',
            },
        });
    });
});

test('authenticated HTTP recovers durable tasks and conversation after Host restart', async () => {
    const h = await makeTempSqliteEngineHarness();
    try {
        let current = services(h); const source = projectSource(), projectId = source.project.projectId;
        const created = await current.studio.createProject(h.handle, source);
        const app = express(); app.use(express.json({ limit: '4mb' }));
        app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeStudioRouter(() => current));
        const base = '/projects/' + projectId + '/agent/tasks';
        const spoofed = await request(app).post(base).send({ owner: 'foreign', intent: 'No', baseRevision: created.revision.revision });
        expect(spoofed.status).toBe(400);
        const task = (await request(app).post(base).send({ intent: 'HTTP recovery', baseRevision: created.revision.revision })).body;
        const path = base + '/' + task.taskId;
        const begun = await request(app).post(path + '/generation/begin').send({ expectedSequence: task.sequence });
        expect(begun.status).toBe(200);
        const attemptId = begun.body.attempts.at(-1).attemptId;
        const finish = await request(app).post(path + '/generation/finish').send({ attemptId, status: 'completed', conversation: [...task.conversation, { role: 'assistant', content: 'Saved public conversation' }] });
        expect(finish.status).toBe(200);
        current = services(h);
        const restored = await request(app).get(path);
        expect(restored.status).toBe(200); expect(restored.headers['cache-control']).toBe('no-store');
        expect(restored.body.conversation.at(-1).content).toBe('Saved public conversation');
        const list = await request(app).get(base); expect(list.body).toHaveLength(1);
        const corrupt = await request(app).post(path + '/generation/finish').send({ attemptId, status: 'completed', conversation: finish.body.conversation, origin: 'host' });
        expect(corrupt.status).toBe(400);
        expect((await request(app).delete('/projects/' + projectId).send({ baseRevision: task.baseRevision })).body.deleted).toBe(true);
        expect((await request(app).get(path)).status).toBe(404);
        expect(await current.repository.list(h.handle, projectId)).toEqual([]);
    } finally { await h.cleanup(); }
});
