import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { projectSource, services } from './project-fixture.js';
import { ProjectTaskRepository, assertProjectTask } from '../../src/native/agent-intelligence/project-task-repository.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { MysqlTransaction } from '../../src/storage/engines/mysql-engine-transaction.js';
import { PgTransaction } from '../../src/storage/engines/postgres-engine-transaction.js';
import { encodeNativeResourceKey, decodeNativeResourceKey } from '../../src/storage/engines/native-resource-key.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s Project durable recovery', (_name, make) => {
    let h, studio, agent, repository, source, projectId, task, reopened;
    beforeEach(async () => {
        h = await make(); ({ studio, agent, repository } = services(h)); source = projectSource(); projectId = source.project.projectId;
        const created = await studio.createProject(h.handle, source);
        task = await agent.createTask(h.handle, projectId, { intent: 'Rename this synthetic project', baseRevision: created.revision.revision });
        task = await agent.setPlan(h.handle, projectId, task.taskId, { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
    });
    afterEach(async () => { setReadOnly(false); jest.restoreAllMocks(); reopened?.close?.(); reopened = null; await h.cleanup(); });
    const tool = input => agent.executeTool(h.handle, projectId, task.taskId, input);
    const propose = async (next = { ...source, project: { ...source.project, displayName: 'Renamed' } }) => {
        task = await tool({ name: 'atri_agent_project_save', args: { source: next, stepId: 'rename' } });
        return task;
    };
    const review = async () => { await propose(); task = await agent.prepareReview(h.handle, projectId, task.taskId); return task; };
    const restart = () => {
        h.engine.close?.();
        reopened = new (h.kind === 'sqlite' ? SqliteEngine : FsEngine)({ directoriesByHandle: handle => {
            if (handle !== h.handle) throw new Error('unknown handle'); return h.dirs;
        } });
        h.engine = reopened;
        ({ studio, agent, repository } = services(h));
    };

    test('real engine reopen restores Review, exact Workspace, validation and attempts', async () => {
        const before = await review(); restart();
        expect(await agent.getTask(h.handle, projectId, task.taskId)).toEqual(before);
        expect(await agent.listTasks(h.handle, projectId)).toEqual([before]);
        const done = await agent.commit(h.handle, projectId, task.taskId);
        expect(done.status).toBe('completed'); expect(done.attempts.map(item => [item.kind, item.status])).toEqual([['evaluation', 'completed'], ['commit', 'completed']]);
        restart(); expect(await agent.commit(h.handle, projectId, task.taskId)).toEqual(done);
        expect((await studio.getProject(h.handle, projectId)).source.project.displayName).toBe('Renamed');
    });

    test('formal commit followed by failed task save reconciles once even after a human edit', async () => {
        await review(); const execute = jest.spyOn(studio, 'executeWorkspace');
        const save = repository.save.bind(repository);
        jest.spyOn(repository, 'save').mockImplementation((handle, value, expected) => {
            if (value.status === 'completed') throw new Error('Injected task save failure');
            return save(handle, value, expected);
        });
        await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toThrow('Injected task save');
        expect(execute).toHaveBeenCalledTimes(1);
        const pending = await repository.get(h.handle, projectId, task.taskId); expect(pending.status).toBe('committing');
        const receipt = await studio.inspectWorkspaceReceipt(h.handle, pending.workspace, pending.commitIntent.changeSetId);
        const current = await studio.getProject(h.handle, projectId);
        await studio.saveProjectSource(h.handle, projectId, { source: { ...current.source, project: { ...current.source.project, displayName: 'Human after commit' } }, baseRevision: current.revision.revision });
        restart(); const replay = jest.spyOn(studio, 'executeWorkspace');
        const recovered = await agent.commit(h.handle, projectId, task.taskId);
        expect(recovered).toMatchObject({ status: 'completed', recovery: { code: 'formal_receipt_reconciled' }, changeSets: [receipt] });
        expect(replay).not.toHaveBeenCalled();
        expect((await studio.getProject(h.handle, projectId)).source.project.displayName).toBe('Human after commit');
        expect(await agent.commit(h.handle, projectId, task.taskId)).toEqual(recovered);
    });

    test('lost Studio response and concurrent Commit share one formal receipt', async () => {
        await review(); const execute = studio.executeWorkspace.bind(studio);
        const spy = jest.spyOn(studio, 'executeWorkspace').mockImplementation(async (...args) => { await execute(...args); throw new Error('Lost response'); });
        const results = await Promise.all([agent.commit(h.handle, projectId, task.taskId), new ProjectAgentService({ studio }).commit(h.handle, projectId, task.taskId)]);
        expect(results[0].changeSets).toEqual(results[1].changeSets); expect(results[0].status).toBe('completed'); expect(spy).toHaveBeenCalledTimes(1);
        expect((await studio.history(h.handle, projectId)).filter(item => item.message.startsWith('Atria Studio ChangeSet'))).toHaveLength(1);
    });

    test('intent persistence failure prevents Studio effect; no receipt recovers to explicit Review', async () => {
        await review(); const execute = jest.spyOn(studio, 'executeWorkspace'); const save = repository.save.bind(repository);
        jest.spyOn(repository, 'save').mockImplementation((handle, value, expected) => {
            if (value.status === 'committing') throw new Error('Intent failed'); return save(handle, value, expected);
        });
        await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toThrow('Intent failed'); expect(execute).not.toHaveBeenCalled();
        jest.restoreAllMocks();
        const previous = await repository.get(h.handle, projectId, task.taskId);
        await repository.save(h.handle, { ...previous, sequence: previous.sequence + 1, status: 'committing',
            commitIntent: { changeSetId: 'changeset_pending', workspaceHash: hashNativeDocument(previous.workspace) } }, hashNativeDocument(previous));
        restart(); const recovered = await agent.getTask(h.handle, projectId, task.taskId);
        expect(recovered).toMatchObject({ status: 'review', recovery: { status: 'awaiting_review' } });
        expect((await studio.getRevision(h.handle, projectId)).revision).toBe(task.baseRevision);
        expect((await agent.commit(h.handle, projectId, task.taskId)).status).toBe('completed');
    });

    test('no-op commit has a durable receipt on the actual Git backend', async () => {
        await propose(source); task = await agent.prepareReview(h.handle, projectId, task.taskId);
        const done = await agent.commit(h.handle, projectId, task.taskId);
        expect(done.changeSets[0].resultingRevision).not.toBe(task.baseRevision);
        const stored = await repository.get(h.handle, projectId, task.taskId);
        expect(await studio.inspectWorkspaceReceipt(h.handle, stored.workspace, stored.commitIntent.changeSetId)).toEqual(done.changeSets[0]);
    });

    test('final receipt capacity is checked before the formal write and restores the dry-run source', async () => {
        await tool({ name: 'atri_agent_source_write', args: { path: 'large.txt', content: 'x'.repeat(64 * 1024), stepId: 'rename' } });
        task = await agent.prepareReview(h.handle, projectId, task.taskId);
        expect(task.status).toBe('review');
        const previous = await repository.get(h.handle, projectId, task.taskId);
        const nearCapacity = { ...previous, sequence: previous.sequence + 1 };
        nearCapacity.intent += 'x'.repeat(2 * 1024 * 1024 - 8 * 1024 - Buffer.byteLength(JSON.stringify(nearCapacity)));
        await repository.save(h.handle, nearCapacity, hashNativeDocument(previous));
        await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toThrow('byte limit');
        expect((await studio.getRevision(h.handle, projectId)).revision).toBe(task.baseRevision);
        await expect(studio.readSource(h.handle, projectId, 'large.txt')).rejects.toMatchObject({ name: 'NotFoundError' });
        expect((await agent.getTask(h.handle, projectId, task.taskId)).status).toBe('review');
        expect((await studio.history(h.handle, projectId)).filter(item => item.message.startsWith('Atria Studio ChangeSet'))).toHaveLength(0);
    });

    test('a human edit after the formal Git write cannot replace its resultingRevision', async () => {
        await review(); const commit = studio._git.commitIfChanged.bind(studio._git);
        jest.spyOn(studio._git, 'commitIfChanged').mockImplementation(async (...args) => {
            const result = await commit(...args);
            if (args[1].startsWith('Atria Studio ChangeSet')) await studio._projects.save(h.handle, { ...source, project: { ...source.project, displayName: 'Human after Git write' } });
            return result;
        });
        const done = await agent.commit(h.handle, projectId, task.taskId);
        const current = await studio.getProject(h.handle, projectId);
        expect(current.source.project.displayName).toBe('Human after Git write');
        expect(done.changeSets[0].resultingRevision).not.toBe(current.revision.revision);
        const stored = await repository.get(h.handle, projectId, task.taskId);
        expect(await studio.inspectWorkspaceReceipt(h.handle, stored.workspace, stored.commitIntent.changeSetId)).toEqual(done.changeSets[0]);
    });

    test('stale base enters durable conflict and cannot overwrite a human revision', async () => {
        await review(); await studio.saveProjectSource(h.handle, projectId, { source: { ...source, project: { ...source.project, displayName: 'Human' } }, baseRevision: task.baseRevision });
        restart(); expect(await agent.getTask(h.handle, projectId, task.taskId)).toMatchObject({ status: 'conflict', baseRevision: task.baseRevision });
        await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toMatchObject({ code: 'project_revision_conflict' });
        expect((await studio.getProject(h.handle, projectId)).source.project.displayName).toBe('Human');
    });

    test('unverifiable formal receipt recovers to conflict without replay', async () => {
        await review(); const save = repository.save.bind(repository);
        jest.spyOn(repository, 'save').mockImplementation((handle, value, expected) => {
            if (value.status === 'completed') throw new Error('Lost result'); return save(handle, value, expected);
        });
        await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toThrow('Lost result');
        restart(); const read = studio._git.readCommit.bind(studio._git);
        jest.spyOn(studio._git, 'readCommit').mockImplementation(async (...args) => ({ ...await read(...args), parents: ['wrong-base'] }));
        expect(await agent.getTask(h.handle, projectId, task.taskId)).toMatchObject({ status: 'conflict', recovery: { code: 'receipt_unverifiable' } });
        const execute = jest.spyOn(studio, 'executeWorkspace');
        await expect(agent.commit(h.handle, projectId, task.taskId)).rejects.toMatchObject({ code: 'project_revision_conflict' });
        expect(execute).not.toHaveBeenCalled();
    });

    test('actual Generation Host links provider sends and direct usage to the durable attempt', async () => {
        const profiles = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: 'http://127.0.0.1:1/fixture', roles: ['studio'] });
        await profiles.persistence.saveRuntimeRoute(h.handle, { ...profiles.routes[0], policy: { ...profiles.routes[0].policy, maxRetries: 1 } });
        let sends = 0;
        const provider = createHttpGenerationProvider({ fetchImpl: async () => {
            sends++;
            if (sends === 1) return new Response('{}', { status: 503 });
            return new Response(JSON.stringify({ choices: [{ message: { content: 'Public reply' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }), { headers: { 'content-type': 'application/json' } });
        } });
        const host = new NativeGenerationHost({ ...profiles, studio, agent, providers: { 'provider.openai-compatible': provider }, secretPort: { resolveSecret: async () => 'synthetic-only' } });
        const started = await agent.beginGeneration(h.handle, projectId, task.taskId, { expectedSequence: task.sequence });
        const input = { projectId, taskId: task.taskId, revision: task.baseRevision, role: 'studio', messages: started.conversation, tools: [], requestId: 'project-observed', projectAttemptId: started.attempts.at(-1).attemptId };
        const result = await host.execute(h.handle, input, new AbortController().signal);
        expect(result.routing.projectTaskCapture.status).toBe('captured'); expect(sends).toBe(2);
        const record = await agent.getTask(h.handle, projectId, task.taskId);
        expect(record.attempts.at(-1)).toMatchObject({ requestId: input.requestId, observation: { origin: 'host', snapshotHash: hashNativeDocument(result.snapshot), usage: { inputTokens: 7, outputTokens: 3, totalTokens: null } } });
        expect(record.attempts.at(-1).observation.attempts.map(item => item.status)).toEqual(['failed', 'success']);
        expect(JSON.stringify(record)).not.toContain('synthetic-only');
        await expect(host.execute(h.handle, { ...input, projectAttemptId: 'attempt_unknown', requestId: 'other' }, new AbortController().signal)).rejects.toMatchObject({ code: 'project_agent_attempt_conflict' });
        expect(sends).toBe(2);
    });

    test('Host observation save failure returns a separate failed capture without sending twice', async () => {
        const profiles = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: 'http://127.0.0.1:1/fixture', roles: ['studio'] });
        let sends = 0;
        const host = new NativeGenerationHost({ ...profiles, studio, agent, providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: async () => {
            sends++; return new Response(JSON.stringify({ choices: [{ message: { content: 'Public reply' } }] }), { headers: { 'content-type': 'application/json' } });
        } }) }, secretPort: { resolveSecret: async () => 'synthetic-only' } });
        const started = await agent.beginGeneration(h.handle, projectId, task.taskId, { expectedSequence: task.sequence });
        const save = repository.save.bind(repository);
        jest.spyOn(repository, 'save').mockImplementation((handle, value, expected) => {
            if (value.attempts.some(item => item.observation !== null)) throw new Error('Observation failed'); return save(handle, value, expected);
        });
        const result = await host.execute(h.handle, { projectId, taskId: task.taskId, revision: task.baseRevision, role: 'studio', messages: started.conversation, tools: [],
            requestId: 'observation-failure', projectAttemptId: started.attempts.at(-1).attemptId }, new AbortController().signal);
        expect(result.routing.projectTaskCapture.status).toBe('failed'); expect(result.response.assistantText).toBe('Public reply'); expect(sends).toBe(1);
        expect((await agent.getTask(h.handle, projectId, task.taskId)).attempts.at(-1).observation).toBeNull();
    });

    test('interrupted evaluation is persisted as repair and its Preview is unavailable', async () => {
        await propose(); const save = repository.save.bind(repository);
        jest.spyOn(repository, 'save').mockImplementation((handle, value, expected) => {
            if (value.status === 'review') throw new Error('Evaluation result lost'); return save(handle, value, expected);
        });
        await expect(agent.prepareReview(h.handle, projectId, task.taskId)).rejects.toThrow('Evaluation result lost');
        restart(); const recovered = await agent.getTask(h.handle, projectId, task.taskId);
        expect(recovered).toMatchObject({ status: 'repair', repairRound: 1, preview: null, recovery: { code: 'evaluation_interrupted' } });
        expect(recovered.attempts[0].status).toBe('interrupted');
        expect((await agent.prepareReview(h.handle, projectId, task.taskId)).status).toBe('review');
    });

    test('generation marker, complete public conversation and tool-call idempotency survive restart', async () => {
        const started = await agent.beginGeneration(h.handle, projectId, task.taskId, { expectedSequence: task.sequence });
        const attemptId = started.attempts.at(-1).attemptId;
        const input = { name: 'atri_agent_source_write', args: { path: 'note.txt', content: 'Public fixture', stepId: 'rename' }, attemptId, callId: 'write' };
        await tool(input); await tool(input);
        expect((await agent.getTask(h.handle, projectId, task.taskId)).operations).toHaveLength(1);
        await expect(tool({ ...input, args: { ...input.args, content: 'Changed' } })).rejects.toMatchObject({ code: 'project_agent_call_conflict' });
        const conversation = [...started.conversation, { role: 'assistant', content: 'Proposed note' }];
        const done = await agent.finishGeneration(h.handle, projectId, task.taskId, { attemptId, status: 'completed', conversation });
        expect(await agent.finishGeneration(h.handle, projectId, task.taskId, { attemptId, status: 'completed', conversation })).toEqual(done);
        restart(); expect((await agent.getTask(h.handle, projectId, task.taskId)).conversation).toEqual(conversation);
        const next = await agent.beginGeneration(h.handle, projectId, task.taskId, { expectedSequence: done.sequence });
        restart(); const resumed = await agent.resumeTask(h.handle, projectId, task.taskId);
        expect(resumed.attempts.at(-1).status).toBe('interrupted'); expect(resumed.operations).toHaveLength(1);
        await expect(agent.finishGeneration(h.handle, projectId, task.taskId, { attemptId: next.attempts.at(-1).attemptId, status: 'completed', conversation })).rejects.toMatchObject({ code: 'project_agent_attempt_conflict' });
    });

    test('CAS, unknown schemas, corruption, private message fields and read-only fail closed', async () => {
        const previous = await repository.get(h.handle, projectId, task.taskId);
        await expect(repository.save(h.handle, previous, '0'.repeat(64))).rejects.toMatchObject({ code: 'native_write_conflict' });
        expect(() => assertProjectTask({ ...previous, schemaVersion: 2 })).toThrow();
        expect(() => assertProjectTask({ ...previous, owner: h.handle })).toThrow();
        expect(() => assertProjectTask({ ...previous, timeline: Array.from({ length: 1025 }, (_, index) => ({ eventId: String(index), type: 'test', at: 1 })) })).toThrow('limit');
        expect(() => assertProjectTask({ ...previous, intent: 'x'.repeat(2 * 1024 * 1024) })).toThrow('byte limit');
        expect(() => assertProjectTask({ ...previous, conversation: [{ role: 'assistant', content: '', providerState: { thinking: 'PRIVATE' } }] })).toThrow();
        setReadOnly(true); await expect(agent.setPlan(h.handle, projectId, task.taskId, { summary: 'No', steps: [{ title: 'No' }] })).rejects.toThrow();
        expect(await agent.getTask(h.handle, projectId, task.taskId)).toEqual(task);
        setReadOnly(false); const key = { kind: K.projectAgentTask, handle: h.handle, projectId, taskId: task.taskId };
        await h.engine.withTransaction(h.handle, async tx => { const record = await tx.getResource(key); record.doc.status = 'completed'; await tx.putResource(key, record); });
        await expect(agent.getTask(h.handle, projectId, task.taskId)).rejects.toThrow('integrity');
        await agent.deleteTask(h.handle, projectId, task.taskId); expect(await repository.get(h.handle, projectId, task.taskId)).toBeNull();
    });

    test('Project/owner isolation, missing legacy tasks, deletion and engine backup paths', async () => {
        const other = await studio.createProject(h.handle, projectSource());
        await expect(agent.getTask(h.handle, other.source.project.projectId, task.taskId)).rejects.toMatchObject({ name: 'NotFoundError' });
        await expect(agent.getTask(h.handle, projectId, 'agenttask_legacy')).rejects.toMatchObject({ name: 'NotFoundError' });
        await expect(agent.getTask('foreign', projectId, task.taskId)).rejects.toThrow();
        const dump = await h.engine.dumpUser(h.handle);
        if (h.kind === 'sqlite') { await h.engine.restoreUser(h.handle, dump); expect(await repository.get(h.handle, projectId, task.taskId)).toBeDefined(); }
        else expect(dump).toBeNull();
        await studio.deleteProject(h.handle, projectId, task.baseRevision);
        await expect(agent.getTask(h.handle, projectId, task.taskId)).rejects.toMatchObject({ name: 'NotFoundError' });
        await agent.deleteProjectTasks(h.handle, projectId); expect(await repository.list(h.handle, projectId)).toEqual([]);
    });
});

test('task kind roundtrip and external SQL generic handler contract', async () => {
    const h = await makeTempFsEngineHarness(), sql = await makeTempSqliteEngineHarness();
    try {
        const { studio, agent } = services(h); const source = projectSource(); const projectId = source.project.projectId;
        const created = await studio.createProject(h.handle, source);
        const task = await agent.createTask(h.handle, projectId, { intent: 'Roundtrip', baseRevision: created.revision.revision });
        const key = { kind: K.projectAgentTask, handle: h.handle, projectId, taskId: task.taskId };
        expect(decodeNativeResourceKey(key.kind, h.handle, encodeNativeResourceKey(key))).toEqual(key);
        const stored = await h.engine.withTransaction(h.handle, tx => tx.getResource(key));
        await sql.engine.withTransaction(sql.handle, tx => tx.putResource(key, stored));
        const back = await sql.engine.withTransaction(sql.handle, tx => tx.getResource(key));
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource(key));
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, back));
        expect(await new ProjectTaskRepository({ engine: h.engine }).get(h.handle, projectId, task.taskId)).toEqual(stored.doc);
        for (const tx of [new MysqlTransaction({ conn: {}, handle: h.handle }), new PgTransaction({ client: {}, handle: h.handle })]) expect(tx._handlers.has(K.projectAgentTask)).toBe(true);
    } finally { await h.cleanup(); await sql.cleanup(); }
});

test('system Git keeps an empty formal receipt and a post-commit failure cannot restore source', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const { studio, agent, repository } = services(h, undefined, 'system'); const source = projectSource(); const projectId = source.project.projectId;
        const created = await studio.createProject(h.handle, source);
        let task = await agent.createTask(h.handle, projectId, { intent: 'No-op', baseRevision: created.revision.revision });
        await agent.setPlan(h.handle, projectId, task.taskId, { summary: 'Same', steps: [{ title: 'Same' }] });
        await agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_project_save', args: { source } });
        await agent.prepareReview(h.handle, projectId, task.taskId);
        const commit = studio._git.commitIfChanged.bind(studio._git);
        jest.spyOn(studio._git, 'commitIfChanged').mockImplementation(async (...args) => { const result = await commit(...args); if (args[1].startsWith('Atria Studio ChangeSet')) throw new Error('After Git commit'); return result; });
        task = await agent.commit(h.handle, projectId, task.taskId);
        expect(task.status).toBe('completed');
        const stored = await repository.get(h.handle, projectId, task.taskId);
        expect(await studio.inspectWorkspaceReceipt(h.handle, stored.workspace, stored.commitIntent.changeSetId)).toEqual(task.changeSets[0]);
    } finally { jest.restoreAllMocks(); await h.cleanup(); }
});

test('browser runner restores a durable conversation after interrupted tools and never auto-commits', async () => {
    const h = await makeTempFsEngineHarness(); const oldFetch = globalThis.fetch;
    try {
        let { studio, agent } = services(h); const source = projectSource(); const projectId = source.project.projectId;
        const created = await studio.createProject(h.handle, source);
        const task = await agent.createTask(h.handle, projectId, { intent: 'Resume safely', baseRevision: created.revision.revision });
        let round = 0; const requests = [];
        globalThis.fetch = async (url, options = {}) => {
            const body = options.body ? JSON.parse(options.body) : {}; let value;
            if (url === '/api/skills?scope=all') value = [];
            else if (url === '/api/native/extensions/settings') value = { value: { skills: {} } };
            else if (url === '/api/native/generation/execute') {
                requests.push(body); round++;
                if (round === 1) value = { response: { assistantText: 'Public plan', providerState: { thinking: 'PRIVATE' }, toolCalls: [{ id: 'plan', name: 'atri_agent_set_plan', args: { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename' }] } }] } };
                else if (round === 2) throw new Error('Browser disconnected');
                else value = { response: { assistantText: 'Resumed public reply', toolCalls: [] } };
            } else if (url.endsWith('/context')) value = await agent.getContext(h.handle, projectId, task.taskId);
            else if (url.endsWith('/resume')) value = await agent.resumeTask(h.handle, projectId, task.taskId);
            else if (url.endsWith('/generation/begin')) value = await agent.beginGeneration(h.handle, projectId, task.taskId, body);
            else if (url.endsWith('/generation/finish')) value = await agent.finishGeneration(h.handle, projectId, task.taskId, body);
            else if (url.endsWith('/tool')) value = await agent.executeTool(h.handle, projectId, task.taskId, body);
            else if (url.endsWith('/preflight')) value = await studio.preflightProject(h.handle, projectId, body);
            else if (url.endsWith('/' + task.taskId)) value = await agent.getTask(h.handle, projectId, task.taskId);
            else throw new Error('Unexpected fixture request ' + url);
            return { ok: true, json: async () => value };
        };
        await expect(runNativeStudioAgentTask({ projectId, taskId: task.taskId })).rejects.toThrow('Browser disconnected');
        ({ studio, agent } = services(h));
        const stored = await agent.getTask(h.handle, projectId, task.taskId); expect(stored.attempts.map(item => item.status)).toEqual(['completed', 'failed']);
        expect(JSON.stringify(stored.conversation)).not.toContain('PRIVATE');
        const result = await runNativeStudioAgentTask({ projectId, taskId: task.taskId });
        expect(result.messages.at(-1).content).toBe('Resumed public reply'); expect(requests[2].messages[0].content).toContain('Current authoritative Task state');
        expect(requests[2].messages.some(message => message.content === 'Public plan')).toBe(true);
        expect(requests[2].messages.some(message => message.role === 'tool' || message.providerState || message.tool_calls)).toBe(false);
        expect((await studio.getRevision(h.handle, projectId)).revision).toBe(task.baseRevision);
    } finally { globalThis.fetch = oldFetch; await h.cleanup(); }
});
