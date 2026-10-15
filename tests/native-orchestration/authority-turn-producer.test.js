import { modelPortFixture } from './helpers/model-port-fixture.js';
import { jest } from '@jest/globals';
import { runFixture } from '../native/helpers/run-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { assertNativeNarratorQuota } from '../../src/native/orchestration/native-turn-quota.js';
import { authorityTurnProof } from '../../src/native/authority-turn.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';

// Allow original SQL scope revalidation in this integration test harness.
// Provider timeout, Scheduler lifetime and production budgets remain original.
if (process.env.ATRIA_TEST_CANDIDATE_SQL === '1') jest.setTimeout(60000);

const setup = (make, { configureSource = () => {}, ...options } = {}) => modelPortFixture(make, { ...options, createSource: async h => {
    const f = await runFixture(h, 'http://127.0.0.1:1/unused', fixture => {
        fixture.contract.generationBudget.narratorAttempts = 1;
        configureSource(fixture);
    });
    const snapshot = await f.begin();
    return { ...f, snapshot, transaction: f.selection };
} });
const operation = async f => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[hash({ lane: 'turn',
    anchor: { branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId } })];

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_CANDIDATE_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original Authority candidate narrator', ({ make }) => {
    test('narrates real candidate and receipt, spends original quota once and only original finalizer commits', async () => {
        const f = await setup(make);
        let atSend, generated;
        const execute = f.authority.executeNarrator.bind(f.authority);
        try {
            f.authority.executeNarrator = async args => { generated = await execute(args); return generated; };
            f.onResponse(async () => { atSend = await f.core.observe(f.h.handle, f.base.session.sessionId); });
            const result = await f.start();
            expect(atSend.revision).toEqual(f.base.revision);
            expect(atSend.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('Ada');
            expect(result.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('updated');
            expect(result.states.atri_world_state).not.toEqual(f.base.states.atri_world_state);
            const wire = JSON.stringify(f.requests[0]);
            expect(wire).toContain('updated');
            expect(wire).toContain('Narrate only the frozen authority result');
            expect(wire).toContain('Note action resolved.');
            expect(wire).not.toContain('PRIVATE SENTINEL');
            expect(wire).not.toContain('other changed');
            const op = await operation(f);
            expect(op.total).toBe(1); expect(op.attempts).toMatchObject({ narrator: 1 });
            expect(op.compute.attempts).toHaveLength(1);
            expect(op.compute.attempts[0].generationQuotaRef).toMatchObject({ role: 'narrator', background: false });
            expect(op.compute.localWork.filter(row => row.kind === 'context_build')).toHaveLength(1);
            expect(op.compute.localWork[0]).toMatchObject({ kind: 'context_build', status: 'settled', orchestration: { ordinal: 0 }, usage: { outcome: 'completed' } });
            expect(op.compute.localWork.map(row => row.orchestration.ordinal)).toEqual(op.compute.localWork.map((_row, index) => index));
            expect(generated.routing.compute.localWork).toEqual(op.compute.localWork);
            expect(await f.observe()).toMatchObject({ outcome: 'confirmed' });
            expect((await f.start()).revision).toEqual(result.revision);
            expect(await operation(f)).toEqual(op); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['json-authority', 'foreign-core', 'candidate', 'receipt', 'role', 'json-quota'])('%s refuses before compilation, quota or HTTP', async fault => {
        const f = await setup(make), original = f.authority.executeNarrator.bind(f.authority);
        try {
            f.authority.executeNarrator = args => {
                if (fault === 'json-authority') args = { ...args, authorityTurn: structuredClone(args.authorityTurn) };
                if (fault === 'foreign-core') authorityTurnProof(Object.create(f.core), f.h.handle, args.base, args.authorityTurn.proof);
                if (fault === 'candidate') args = { ...args, lanePlan: { ...args.lanePlan, authorityContext: { ...args.lanePlan.authorityContext,
                    snapshot: { ...args.base } } } };
                if (fault === 'receipt') args = { ...args, lanePlan: { ...args.lanePlan, authorityContext: { ...args.lanePlan.authorityContext, receipt: { fake: true } } } };
                if (fault === 'role' || fault === 'json-quota') assertNativeNarratorQuota(fault === 'json-quota' ? structuredClone(args.quotaProof) : args.quotaProof,
                    { host: args.host, handle: f.h.handle, sessionId: f.base.session.sessionId, requestId: f.input.invocationId,
                        role: fault === 'role' ? 'intent_resolver' : 'narrator' });
                return original(args);
            };
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
            const stored = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(Object.values(stored?.operations ?? {}).filter(item => item.compute)).toEqual([]);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
        } finally { await f.cleanup(); }
    });

    test('an omitted generation maxTokens uses the original effective output reserve', async () => {
        const f = await setup(make, { generationWithoutMaxTokens: true });
        try {
            await f.start(); expect(f.requests).toHaveLength(1);
            expect(f.requests[0].max_output_tokens).toBe(f.seeded.model.limits.outputTokens);
            expect((await operation(f)).total).toBe(1);
        } finally { await f.cleanup(); }
    });

    test('actual candidate input bytes exhaust the original local cap before the compiler or HTTP runs', async () => {
        const f = await setup(make, { changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
            computeBudget: { ...route.executionPolicy.computeBudget, localWork: { ...route.executionPolicy.computeBudget.localWork, maxInputBytes: 8192 } } } }) });
        const compile = ContextPort.prototype.compile;
        let compilations = 0;
        try {
            ContextPort.prototype.compile = function (...args) { compilations++; return compile.apply(this, args); };
            expect(Buffer.byteLength(JSON.stringify(f.base))).toBeGreaterThan(8192);
            await expect(f.start()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(compilations).toBe(0); expect(f.requests).toHaveLength(0);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(Object.values(control?.operations ?? {}).filter(item => item.compute)).toEqual([]);
        } finally { ContextPort.prototype.compile = compile; await f.cleanup(); }
    });

    test('missing original local-work bounds refuses before authority preparation or Scheduler work', async () => {
        const f = await setup(make, { changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
            computeBudget: { maxRequests: 4, maxTokens: 32000 } } }) });
        const prepare = f.core.prepareAuthorityTurn.bind(f.core); let preparations = 0;
        try {
            f.core.prepareAuthorityTurn = (...args) => { preparations++; return prepare(...args); };
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_context_budget_unavailable' });
            expect(preparations).toBe(0); expect(f.requests).toHaveLength(0);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
        } finally { f.core.prepareAuthorityTurn = prepare; await f.cleanup(); }
    });

    test('the original Package derivation sees candidate projection; context processors cannot rewrite current facts', async () => {
        const f = await setup(make, { configureSource: fixture => {
            fixture.contract.capabilities.push({ id: 'context-derivation', version: 1, required: true }, { id: 'processing', version: 1, required: true });
            fixture.contract.contextRuntime = { schemaVersion: 1, derivations: [{ id: 'candidate.scene', source: 'context/scene.ts', viewId: 'narrator.notes',
                target: { kind: 'context', priority: 1 }, artifacts: [] }] };
            fixture.installed.sourceFiles.set('context/scene.ts', Buffer.from('export default {derive({projection}) {return {text:"Scene candidate: "+projection.items.map(item=>item.data.text).join(",")};}}'));
            fixture.contract.processingRuntime = { schemaVersion: 1, processors: [{ id: 'history-only', stage: 'context', kind: 'script', source: 'context/history.ts' }] };
            fixture.installed.sourceFiles.set('context/history.ts', Buffer.from('export default {transform(){throw Error("Current facts must never be Processor inputs");}}'));
        } });
        try {
            const result = await f.start();
            expect(JSON.stringify(f.requests[0])).toContain('Scene candidate: updated');
            expect(result.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('updated');
            expect((await operation(f)).compute.localWork.filter(row => row.kind === 'context_build')).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a completed original Scheduler attempt cannot reuse its producer proof even with a nonaborted signal', async () => {
        const f = await setup(make), execute = f.authority.executeNarrator.bind(f.authority);
        let proof;
        try {
            f.authority.executeNarrator = args => { proof = args.quotaProof; return execute(args); };
            await f.start();
            const op = await operation(f);
            expect(() => assertNativeNarratorQuota(proof, { host: f.host, sessionCore: f.core, handle: f.h.handle,
                sessionId: f.base.session.sessionId, requestId: f.input.invocationId, role: 'narrator' })).toThrow('operation_boundary_denied');
            expect(await operation(f)).toEqual(op); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('source revocation after compile admission retains failed local work, never runs a model or spends quota', async () => {
        const f = await setup(make), charge = f.core.runs.chargeLocalWork.bind(f.core.runs);
        try {
            f.core.runs.chargeLocalWork = async (...args) => {
                const receipt = await charge(...args);
                await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Revoke candidate anchor.' });
                return receipt;
            };
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
            const op = await operation(f);
            expect(op.total ?? 0).toBe(0); expect(op.compute.attempts).toEqual([]);
            expect(op.compute.localWork).toHaveLength(1);
            expect(op.compute.localWork[0]).toMatchObject({ kind: 'context_build', status: 'settled', usage: { outcome: 'failed' } });
        } finally { f.core.runs.chargeLocalWork = charge; await f.cleanup(); }
    });

    test('unknown actual model admission keeps original quota and candidate unpublished without retrying', async () => {
        const f = await setup(make), admit = f.core.runs.admitCompute.bind(f.core.runs); let admissions = 0;
        try {
            f.core.runs.admitCompute = async (...args) => { admissions++; await admit(...args); throw new StorageCommitUnknownError(new Error('Synthetic original quota ACK loss')); };
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_budget_reconcile_required' });
            const op = await operation(f);
            expect(op.total).toBe(1); expect(op.attempts).toMatchObject({ narrator: 1 });
            expect(op.compute.attempts[0]).toMatchObject({ status: 'charged', generationQuotaRef: { role: 'narrator', background: false } });
            expect(f.requests).toHaveLength(0); expect(admissions).toBe(1);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
            await expect(f.start()).rejects.toThrow(); expect(admissions).toBe(1); expect(f.requests).toHaveLength(0);
            expect(await operation(f)).toEqual(op);
        } finally { f.core.runs.admitCompute = admit; await f.cleanup(); }
    });

    test('actual provider retry cannot exceed the original narrator quota or publish its candidate', async () => {
        const f = await setup(make, { failure: true, changeRoute: route => ({ ...route, policy: { ...route.policy, maxRetries: 1 } }) });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(f.requests).toHaveLength(1);
            const op = await operation(f);
            expect(op.total).toBe(1); expect(op.attempts).toMatchObject({ narrator: 1 });
            expect(op.compute.attempts).toHaveLength(1);
            expect(op.compute.attempts[0]).toMatchObject({ status: 'unknown', generationQuotaRef: { role: 'narrator', background: false } });
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
        } finally { await f.cleanup(); }
    });
});
