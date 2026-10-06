import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
    AgentEvidenceService, assertEvidenceSet, ProjectStore, StudioService, ProjectAgentService,
    WorldRepo, KnowledgeRepo, AssetStore, StudioPreviewHost, createNativeId,
} from '../../src/native/index.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { createGitClient } from '../../src/git/client.js';
import { createResult } from '../../public/scripts/lib/orchestration-engine/results.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { artifactFixture } from '../native/helpers/task-artifact-fixture.js';

const budget = { maxSources: 8, maxBytes: 32768, maxScanMessages: 128 };
const chatScope = { domain: 'rp_chat', charDir: 'Fictional', name: 'sources', isGroup: false, groupId: '' };
const selector = { kind: 'message', messageId: 'persisted-1', floor: 0 };
const message = () => ({ memory_os_source_id: 'persisted-1', mes: 'A visible promise.', name: 'Actor', is_user: false, swipe_id: 0 });
function resign(set) { const { integrity: _old, ...content } = set; return { ...content, integrity: hashNativeDocument(content) }; }

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s RP source authority', (_mode, harness) => {
    let h, chat, service, set;
    const save = messages => chat.save(h.handle, chatScope.charDir, chatScope.name, {}, messages, null);
    const evaluate = (input = set, limits = budget, options = { expand: true }) => service.evaluate(h.handle, chatScope, input, limits, options);
    beforeEach(async () => {
        h = await harness(); chat = new ChatRepo({ engine: h.engine });
        service = new AgentEvidenceService({ chatRepo: chat });
        await save([message()]);
        set = await service.capture(h.handle, chatScope, [selector], budget);
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });

    test('references survive JSON transport; metadata has no body and expansion uses real saved content', async () => {
        expect(assertEvidenceSet(JSON.parse(JSON.stringify(set)))).toEqual(set);
        expect(set).not.toHaveProperty('content');
        const metadata = await evaluate(set, budget, { expand: false });
        expect(metadata).toMatchObject({ schemaVersion: 1, status: 'current', usage: { expandedBytes: 0, scannedMessages: 2 } });
        expect(metadata).not.toHaveProperty('content');
        const expanded = await evaluate();
        expect(expanded.status).toBe('current');
        expect(expanded.content[0].sourceContent).toContain('A visible promise.');
        expect(expanded.usage.expandedBytes).toBeGreaterThan(0);
    });

    test.each(['text', 'variant', 'floor', 'duplicate', 'deleted', 'chat-deleted'])('%s invalidates current evidence', async kind => {
        const item = message();
        if (kind === 'text') item.mes = 'Human revision';
        if (kind === 'variant') item.swipe_id = 1;
        if (kind === 'chat-deleted') await chat.delete(h.handle, chatScope.charDir, chatScope.name);
        else await save(kind === 'floor' ? [{ mes: 'Inserted' }, item] : kind === 'duplicate' ? [item, item] : kind === 'deleted' ? [] : [item]);
        const result = await evaluate();
        expect(result.status).toBe('incomplete');
        expect(result.checks[0].status).toBe(kind.includes('deleted') ? 'missing' : kind === 'duplicate' ? 'denied' : 'stale');
        expect(result).not.toHaveProperty('content');
    });

    test('wrong owner / expected scope fail before reading any source', async () => {
        const spy = jest.spyOn(chat, 'get');
        await expect(service.evaluate('other-owner', chatScope, set, budget)).rejects.toMatchObject({ status: 'denied' });
        await expect(service.evaluate(h.handle, { ...chatScope, name: 'other-chat' }, set, budget)).rejects.toMatchObject({ status: 'denied' });
        expect(spy).not.toHaveBeenCalled();
    });

    test('rehashed invented source / content cannot make a claim current', async () => {
        for (const alter of [ref => { ref.contentHash = 'a'.repeat(64); }, ref => { ref.selector.messageId = 'invented'; }, ref => { ref.anchor.variantId = 2; }]) {
            const forged = structuredClone(set); alter(forged.references[0]);
            expect((await evaluate(resign(forged))).status).toBe('incomplete');
        }
        await expect(evaluate(createResult({ runId: 'run', nodeId: 'node', agentId: 'agent', value: 'success' }))).rejects.toThrow();
    });

    test('finite source, scan and UTF-8 expansion budgets never truncate success', async () => {
        expect((await evaluate(set, { ...budget, maxBytes: 1 })).checks[0]).toMatchObject({ status: 'budget_blocked', code: 'evidence_expansion_budget' });
        expect((await evaluate(set, { ...budget, maxScanMessages: 1 })).checks[0]).toMatchObject({ status: 'budget_blocked', code: 'evidence_scan_budget' });
        await expect(service.capture(h.handle, chatScope, [selector], { ...budget, maxBytes: 1 })).rejects.toMatchObject({ status: 'budget_blocked' });
        await expect(evaluate(set, { ...budget, maxBytes: Infinity })).rejects.toThrow();
        await expect(evaluate(set, undefined, { expand: 'yes' })).rejects.toThrow();
    });

    test('change during a later read prevents returning the earlier text', async () => {
        await save([message(), { ...message(), memory_os_source_id: 'persisted-2', mes: 'Second' }]);
        set = await service.capture(h.handle, chatScope, [selector, { ...selector, messageId: 'persisted-2', floor: 1 }], budget);
        await expect(evaluate(set, { ...budget, maxSources: 1 })).rejects.toMatchObject({ status: 'budget_blocked', code: 'evidence_source_budget' });
        const realGet = chat.get.bind(chat); let reads = 0;
        jest.spyOn(chat, 'get').mockImplementation(async (...args) => {
            if (++reads === 2) await save([{ ...message(), mes: 'Changed during read' }, { ...message(), memory_os_source_id: 'persisted-2', mes: 'Second' }]);
            return realGet(...args);
        });
        const result = await evaluate();
        expect(result.checks[0]).toMatchObject({ status: 'stale', code: 'evidence_changed_during_read' });
        expect(result.checks).toHaveLength(2);
        expect(result).not.toHaveProperty('content');
    });

    test('missing identity and mirrored Native message are not fabricated as ordinary chat evidence', async () => {
        await save([{ mes: 'Legacy without stable ID' }]);
        await expect(service.capture(h.handle, chatScope, [selector], budget)).rejects.toMatchObject({ status: 'missing' });
        const id = createNativeId('message');
        await save([{ ...message(), atri_native: { messageId: id } }]);
        await expect(service.capture(h.handle, chatScope, [{ ...selector, messageId: id }], budget)).rejects.toMatchObject({ status: 'denied' });
    });

    test('group chat uses its own storage identity', async () => {
        const scope = { domain: 'rp_chat', charDir: '', name: 'group-test', isGroup: true, groupId: 'group-test' };
        await chat.save(h.handle, '', scope.name, {}, [message()], null, { isGroup: true, groupId: scope.groupId });
        const groupSet = await service.capture(h.handle, scope, [selector], budget);
        expect((await service.evaluate(h.handle, scope, groupSet, budget)).status).toBe('current');
    });

    test('Native Session uses its real current HEAD and active message variant', async () => {
        const fixture = await installFixture(h);
        const initial = await fixture.core.create(h.handle, fixture.start);
        service = new AgentEvidenceService({ sessionCore: fixture.core });
        const scope = { domain: 'rp_session', sessionId: initial.session.sessionId };
        const selected = { kind: 'message', messageId: initial.timeline[0].messageId };
        const nativeSet = await service.capture(h.handle, scope, [selected], budget);
        expect(nativeSet.references[0].anchor).toMatchObject({ revisionId: initial.revision.revisionId, variantId: initial.timeline[0].activeVariantId });
        expect((await service.evaluate(h.handle, scope, nativeSet, budget, { expand: true })).content[0].content).toBe('Opening');
        const wrongBranch = structuredClone(nativeSet); wrongBranch.references[0].anchor.branchId = createNativeId('branch');
        expect((await service.evaluate(h.handle, scope, resign(wrongBranch), budget)).checks[0].status).toBe('stale');
        await fixture.core.forkBranch(h.handle, scope.sessionId, { revisionId: initial.revision.revisionId, expectedRevisionId: initial.revision.revisionId });
        expect((await service.evaluate(h.handle, scope, nativeSet, budget)).checks[0].status).toBe('stale');
        const fresh = await service.capture(h.handle, scope, [selected], budget);
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource({ kind: 'atri_session', handle: h.handle, sessionId: scope.sessionId }));
        expect((await service.evaluate(h.handle, scope, fresh, budget)).checks[0].status).toBe('missing');
    });

    test('Native source corruption fails closed through SessionCore integrity checks', async () => {
        const fixture = await installFixture(h);
        const initial = await fixture.core.create(h.handle, fixture.start);
        service = new AgentEvidenceService({ sessionCore: fixture.core });
        const scope = { domain: 'rp_session', sessionId: initial.session.sessionId };
        const nativeSet = await service.capture(h.handle, scope, [{ kind: 'message', messageId: initial.timeline[0].messageId }], budget);
        const key = { kind: 'atri_timeline_variant', handle: h.handle, sessionId: scope.sessionId,
            messageId: initial.timeline[0].messageId, variantId: initial.timeline[0].activeVariantId };
        await h.engine.withTransaction(h.handle, async tx => { const record = await tx.getResource(key); record.doc.content = 'Corrupt'; await tx.putResource(key, record); });
        expect((await service.evaluate(h.handle, scope, nativeSet, budget)).checks[0].status).toBe('unavailable');
    });
});

describe('Native Artifact EvidenceSet consumer', () => {
    const selected = f => ({ kind: 'artifact', invocationId: 'npc-1', grant: { taskId: f.task.id, variantId: 'default', usageId: 'summary' } });
    test.each(['valid', 'branch', 'hash', 'dependency', 'epoch', 'deleted', 'operation-grant'])('%s keeps original task artifact authority', async kind => {
        const f = artifactFixture('reusable');
        // Isolated authority fixture only; real SessionCore storage is covered above.
        const core = { load: async () => f.base };
        const service = new AgentEvidenceService({ sessionCore: core });
        const scope = { domain: 'rp_session', sessionId: f.base.session.sessionId };
        const set = await service.capture('owner', scope, [selected(f)], budget);
        const before = structuredClone(f.base);
        if (kind === 'branch') f.base.revision.branchId = createNativeId('branch');
        if (kind === 'hash') f.record.payload.quantity = 3;
        if (kind === 'dependency') f.base.states.atri_lifecycle.domains.public_notes.records[0].value.text = 'Changed';
        if (kind === 'epoch') f.base.states.atri_lifecycle.scopes.session.epoch++;
        if (kind === 'deleted') f.base.states.atri_task_results.records = [];
        if (kind === 'operation-grant') {
            const forged = structuredClone(set); forged.references[0].selector.grant.usageId = 'trade';
            expect((await service.evaluate('owner', scope, resign(forged), budget)).status).toBe('incomplete');
            return;
        }
        const result = await service.evaluate('owner', scope, set, budget, { expand: true });
        if (kind === 'valid') {
            expect(result.content).toEqual([{ quantity: 2 }]);
            expect(f.base).toEqual(before);
            expect(f.record).not.toHaveProperty('consumptions');
        } else {
            expect(result.status).toBe('incomplete');
            expect(result).not.toHaveProperty('content');
        }
    });
});

function projectSource() {
    return { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId: createNativeId('package'), displayName: 'Fictional', createdAt: 10, updatedAt: 10 },
        package: { name: 'Sources', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Start', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [] };
}

describe('Project evidence through real Studio / ProjectAgentService', () => {
    let h, studio, agent, service, source, scope, task, selected;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness();
        const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
        studio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }),
            knowledgeRepo: new KnowledgeRepo({ engine: h.engine }), assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
            gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost(), simulationRunner: async () => ({ mode: 'dry-run' }) });
        agent = new ProjectAgentService({ studio }); service = new AgentEvidenceService({ studio, agent });
        source = projectSource(); const created = await studio.createProject(h.handle, source);
        scope = { domain: 'project', projectId: source.project.projectId };
        task = await agent.createTask(h.handle, scope.projectId, { intent: 'Rename fictional Project', baseRevision: created.revision.revision });
        task = agent.setPlan(h.handle, scope.projectId, task.taskId, { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
        selected = { kind: 'task', taskId: task.taskId };
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });
    const capture = () => service.capture(h.handle, scope, [selected], budget);
    const evaluate = set => service.evaluate(h.handle, scope, set, budget, { expand: true });

    test('Review and formal commit remain distinct, with fresh exact source refs after commit', async () => {
        const next = structuredClone(source); next.project.displayName = 'Renamed';
        await agent.executeTool(h.handle, scope.projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: next, stepId: 'rename' } });
        await agent.prepareReview(h.handle, scope.projectId, task.taskId);
        const reviewSet = await capture(); const review = await evaluate(reviewSet);
        expect(review.content[0]).toMatchObject({ status: 'review', validation: { status: 'passed' }, receipts: [] });
        const committed = await agent.commit(h.handle, scope.projectId, task.taskId);
        expect((await evaluate(reviewSet)).status).toBe('incomplete');
        const commitSet = await capture(); const result = await evaluate(commitSet);
        expect(result.content[0]).toMatchObject({ status: 'completed', receipts: [{ resultingRevision: committed.changeSets[0].resultingRevision }] });
        expect(commitSet.references[0].anchor.revision).toBe(committed.changeSets[0].resultingRevision);
        expect(agent.getTask(h.handle, scope.projectId, task.taskId)).toEqual(committed);
    });

    test('human revision makes the pinned task stale without rewriting its state', async () => {
        const set = await capture(); const before = agent.getTask(h.handle, scope.projectId, task.taskId);
        const next = structuredClone(source); next.project.displayName = 'Human edit';
        await studio.saveProjectSource(h.handle, scope.projectId, { source: next, baseRevision: task.baseRevision, origin: { kind: 'human', id: 'source-test' } });
        expect((await evaluate(set)).checks[0]).toMatchObject({ status: 'stale', code: 'project_revision_changed' });
        expect(agent.getTask(h.handle, scope.projectId, task.taskId)).toEqual(before);
    });

    test('task update, takeover and restart all invalidate old references', async () => {
        const set = await capture();
        agent.setPlan(h.handle, scope.projectId, task.taskId, { summary: 'Human changed plan', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
        expect((await evaluate(set)).status).toBe('incomplete');
        const updated = await capture(); agent.takeOver(h.handle, scope.projectId, task.taskId);
        expect((await evaluate(updated)).checks[0].status).toBe('stale');
        service = new AgentEvidenceService({ studio, agent: new ProjectAgentService({ studio }) });
        expect((await evaluate(updated)).checks[0].status).toBe('missing');
    });

    test('wrong project task identity and project deletion cannot supply current evidence', async () => {
        const set = await capture(); const other = await studio.createProject(h.handle, projectSource());
        await expect(service.capture(h.handle, { domain: 'project', projectId: other.source.project.projectId }, [selected], budget)).rejects.toThrow();
        await studio.deleteProject(h.handle, scope.projectId, task.baseRevision);
        expect((await evaluate(set)).checks[0].status).toBe('missing');
    });

    test('multiple tasks share one coherent revision read; a task edited during an await releases no body', async () => {
        const second = await agent.createTask(h.handle, scope.projectId, { intent: 'Other task', baseRevision: task.baseRevision });
        const set = await service.capture(h.handle, scope, [selected, { kind: 'task', taskId: second.taskId }], budget);
        const realRevision = studio.getRevision.bind(studio); let reads = 0;
        jest.spyOn(studio, 'getRevision').mockImplementation(async (...args) => {
            const revision = await realRevision(...args);
            if (++reads === 2) agent.setPlan(h.handle, scope.projectId, task.taskId, { summary: 'Changed during read', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
            return revision;
        });
        const result = await evaluate(set);
        expect(result.checks).toHaveLength(2);
        expect(result.checks[0]).toMatchObject({ status: 'stale', code: 'project_source_changed_during_read' });
        expect(result.checks[1].status).toBe('current');
        expect(result).not.toHaveProperty('content');
    });
});

describe('strict source contract and unavailable authorities', () => {
    test('unknown schemas, extra authority fields, duplicates and unsafe scope are rejected', async () => {
        const f = artifactFixture();
        const service = new AgentEvidenceService({ sessionCore: { load: async () => f.base } });
        const scope = { domain: 'rp_session', sessionId: f.base.session.sessionId };
        const selector = { kind: 'artifact', invocationId: 'npc-1', grant: { taskId: f.task.id, variantId: 'default', usageId: 'summary' } };
        const set = await service.capture('owner', scope, [selector], budget);
        for (const mutate of [value => { value.schemaVersion = 2; }, value => { value.current = true; }, value => { value.references.push(value.references[0]); }, value => { value.references[0].trusted = true; }, value => { value.scope.revisionId = createNativeId('revision'); }]) {
            const forged = structuredClone(set); mutate(forged);
            expect(() => assertEvidenceSet(resign(forged))).toThrow();
        }
        expect(() => assertEvidenceSet({ ...set, integrity: '0'.repeat(64) })).toThrow();
        await expect(service.capture('owner', { ...chatScope, name: '../escape' }, [selector], budget)).rejects.toThrow();
        const absent = new AgentEvidenceService();
        expect((await absent.evaluate('owner', scope, set, budget)).checks[0]).toMatchObject({ status: 'unavailable' });
        await expect(service.capture('owner', scope, [selector, selector], budget)).rejects.toThrow('Duplicate');
    });
});
