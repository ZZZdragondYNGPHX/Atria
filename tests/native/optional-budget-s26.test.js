import { optionalComputeOptions } from '../../public/shared/native-compute-budget.js';
import { expect, test } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { projectSource, services as projectServices } from '../agent-intelligence/project-fixture.js';
import { prepareRetrievalCompute } from '../../src/native/retrieval-compute.js';
import { assertExecutionPolicy } from '../../src/native/model-prompt-runtime/contracts.js';
import { createNativeId } from '../../src/native/identity.js';

const attempt = tokens => ({ attemptId: randomUUID(), requestId: randomUUID(), targetFingerprint: 'a'.repeat(64), estimatedTokens: tokens });
const required = { maxRequests: 1, maxTokens: 40 };
async function fixture(make, lane, { maxRequests = 2, maxTokens = 100, optionalWork = { mode: 'preserve_required', requiredCompute: required } } = {}) {
    const h = await make();
    try {
        const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/never-sent', roles: ['narrator', 'studio'] });
        const limits = { maxRequests, maxTokens, localWork: { maxJobs: 4, maxItems: 16, maxInputBytes: 4096 } };
        for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits, ...(optionalWork ? { optionalWork } : {}) } });
        const svc = projectServices(h);
        let context = { kind: 'session', sessionId: base.session.sessionId, revisionId: base.revision.revisionId }, task;
        if (lane === 'project') {
            const source = projectSource(), project = await svc.studio.createProject(h.handle, source);
            task = await svc.agent.createTask(h.handle, source.project.projectId, { intent: 'Preserve required work', baseRevision: project.revision.revision });
            context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        }
        const args = { handle: h.handle, context, persistence: seeded.persistence, core: installed.core, ...svc };
        const compute = await prepareRetrievalCompute({ ...args, profile: { mode: 'rerank' } });
        const bank = async () => lane === 'session'
            ? Object.values((await installed.core.runs.status(h.handle, base.session.sessionId))?.operations ?? {}).find(op => op.compute)?.compute
            : (await svc.agent.getTask(h.handle, context.projectId, context.taskId)).compute;
        const mandatory = async (tokens, options) => lane === 'session'
            ? installed.core.runs.chargeCompute(h.handle, base, { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, limits, attempt(tokens), options)
            : svc.agent.chargeGeneration(h.handle, context.projectId, context.taskId, context.revision, limits, attempt(tokens), task.executionFingerprint, options);
        return { ...h, ...args, base, compute, bank, mandatory, limits };
    } catch (error) { await h.cleanup(); throw error; }
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['session', 'project'])(`S26 ${kind} %s concurrent optional requests preserve configured required allowance in the original bank`, async lane => {
        const f = await fixture(make, lane);
        try {
            const results = await Promise.allSettled([f.compute.beforeSend({ payload: 'x' }), f.compute.beforeSend({ payload: 'x' })]);
            expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter(row => row.status === 'rejected').map(row => row.reason.code)).toEqual(['native_generation_required_budget_reserved']);
            expect((await f.bank()).attempts).toHaveLength(1);
            await f.mandatory(required.maxTokens);
            const bank = await f.bank();
            expect(bank.attempts).toHaveLength(2); expect(bank.limits).toEqual(f.limits);
            expect(bank.attempts.map(row => row.estimatedTokens)).toEqual([15, 40]);
            expect((await f.core.load(f.handle, f.base.session.sessionId)).states).toEqual(f.base.states);
        } finally { await f.cleanup(); }
    });
}

test.each(['session', 'project'])('S26 %s unknown prior usage occupies its upper bound; settled optional usage releases only real spare tokens', async lane => {
    const f = await fixture(makeTempFsEngineHarness, lane, { maxRequests: 4, maxTokens: 75 });
    try {
        const ticket = await f.compute.beforeSend({ payload: 'x' });
        const unknown = await f.compute.beforeSend({ payload: 'x' });
        await f.compute.settle(null, unknown);
        expect((await f.bank()).attempts[1]).toMatchObject({ status: 'unknown', estimatedTokens: 15 });
        await expect(f.compute.beforeSend({ payload: 'x' })).rejects.toMatchObject({ code: 'native_generation_required_budget_reserved' });
        await f.compute.settle({ inputTokens: 2, outputTokens: 3, totalTokens: 5 }, ticket);
        await expect(f.compute.beforeSend({ payload: 'x' })).resolves.toBeDefined();
        await f.mandatory(40);
        const bank = await f.bank();
        expect(bank.attempts).toHaveLength(4); expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 5 } });
        expect(bank.limits).toEqual(f.limits);
    } finally { await f.cleanup(); }
});

test.each(['session', 'project'])('S26 %s unknown required allowance refuses only optional rerank; fixed and embedding paths remain compatible', async lane => {
    const f = await fixture(makeTempFsEngineHarness, lane, { optionalWork: { mode: 'preserve_required' } });
    try {
        await expect(f.compute.beforeSend({ payload: 'x' })).rejects.toMatchObject({ code: 'native_generation_required_budget_unknown' });
        expect(await f.bank()).toBeUndefined();
        const local = await f.compute.beforeLocalWork({ items: 1, inputBytes: 8, indexPath: 'legal-base', kind: 'memory_corpus' });
        await f.compute.settleLocalWork(local, null);
        expect((await f.bank()).localWork[0]).toMatchObject({ kind: 'memory_corpus', status: 'unknown' });
        const embed = await prepareRetrievalCompute({ ...f, profile: { mode: 'embed' } });
        await embed.beforeSend({ payload: 'x' });
        await f.mandatory(40);
        expect((await f.bank()).attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
    const fixed = await fixture(makeTempFsEngineHarness, lane, { maxRequests: 1, optionalWork: null });
    try {
        await fixed.compute.beforeSend({ payload: 'x' });
        expect((await fixed.bank()).attempts).toHaveLength(1);
        await expect(fixed.mandatory(40)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
    } finally { await fixed.cleanup(); }
});

test('S26 stored Route owns allocation; forged client reserve/remaining balance and stale context are refused', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'session');
    try {
        for (const extra of [{ optionalWork: { mode: 'preserve_required', requiredCompute: required } }, { remainingTokens: 99999 }, { reserve: required }]) {
            await expect(prepareRetrievalCompute({ ...f, context: { ...f.context, ...extra }, profile: { mode: 'rerank' } })).rejects.toThrow();
        }
        await f.core.appendTimeline(f.handle, f.context.sessionId, { role: 'user', content: 'Changed revision' });
        await expect(f.compute.beforeSend({ payload: 'x' })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
        expect(await f.bank()).toBeUndefined();
    } finally { await f.cleanup(); }
});

test('S26 Route schema retains opt-in unknown and validates finite required request/token allowance', () => {
    const policy = { schemaVersion: 1, allowedModelProfileIds: [createNativeId('modelProfile')] };
    expect(assertExecutionPolicy(policy).optionalWork).toBeUndefined();
    expect(assertExecutionPolicy({ ...policy, optionalWork: { mode: 'preserve_required' } }).optionalWork).toEqual({ mode: 'preserve_required' });
    expect(assertExecutionPolicy({ ...policy, optionalWork: { mode: 'preserve_required', requiredCompute: required } }).optionalWork.requiredCompute).toEqual(required);
    for (const optionalWork of [{ mode: 'learned' }, { mode: 'preserve_required', requiredCompute: { maxRequests: 0, maxTokens: 40 } },
        { mode: 'preserve_required', requiredCompute: { maxRequests: 1 } }, { mode: 'preserve_required', requiredCompute: { ...required, localWork: {} } }]) {
        expect(() => assertExecutionPolicy({ ...policy, optionalWork })).toThrow();
    }
});

test('optional role declaration rejects necessary narration, duplicates and unknown classes', () => {
    const base = { schemaVersion: 1, allowedModelProfileIds: [createNativeId('modelProfile')], optionalWork: { mode: 'preserve_required', requiredCompute: required } };
    expect(assertExecutionPolicy({ ...base, optionalWork: { ...base.optionalWork, roles: ['rerank', 'model_task', 'background'] } }).optionalWork.roles).toEqual(['rerank', 'model_task', 'background']);
    for (const roles of [['narrator'], ['model_task', 'model_task'], ['unknown'], []]) expect(() => assertExecutionPolicy({ ...base, optionalWork: { ...base.optionalWork, roles } })).toThrow();
});

test.each(['session', 'project'])('opt-in %s model tasks share required allowance with mandatory work in the original writer', async lane => {
    const f = await fixture(makeTempSqliteEngineHarness, lane, { optionalWork: { mode: 'preserve_required', roles: ['model_task', 'background'], requiredCompute: required } });
    try {
        const route = (await f.persistence.listRuntimeRoutes(f.handle)).find(item => item.role === (lane === 'session' ? 'role.narrator' : 'role.studio'));
        const options = optionalComputeOptions(route.executionPolicy, 'model_task');
        const admitted = await f.mandatory(40, options);
        expect(admitted.compute.status).toBe('charged');
        await expect(f.mandatory(40, options)).rejects.toMatchObject({ code: 'native_generation_required_budget_reserved' });
        expect((await f.bank()).attempts).toHaveLength(1);
        await f.mandatory(40);
        expect((await f.bank()).attempts).toHaveLength(2);
        expect(optionalComputeOptions(route.executionPolicy, 'narrator')).toEqual({});
    } finally { await f.cleanup(); }
});
