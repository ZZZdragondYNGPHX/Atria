import { randomUUID } from 'node:crypto';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { runFixture } from './helpers/run-fixture.js';
import { services } from './helpers/session-fixture.js';
import { inspectAtriaSaveContainer } from '../../src/native/index.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { assertRunContinuation } from '../../public/shared/native-run-contract.js';

const limits = { maxRequests: 2, maxTokens: 32000, localWork: { maxJobs: 2, maxItems: 10, maxInputBytes: 4096 } };
const attempt = () => ({ attemptId: randomUUID(), requestId: 'late:' + randomUUID(), targetFingerprint: 'a'.repeat(64), estimatedTokens: 100 });
const anchor = base => ({ branchId: base.revision.branchId, revisionId: base.revision.revisionId });
const localUsage = { wallMs: 2, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'cancelled' };
test('G05 retired work portable observations reject unknown zero upper and contradictory estimated inputs', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin(), model = attempt();
        const local = { ...attempt(), kind: 'index_query', estimatedItems: 1, estimatedInputBytes: 20 }; delete local.estimatedTokens;
        const sent = await f.core.runs.chargeCompute(h.handle, base, anchor(base), limits, model), job = await f.core.runs.chargeLocalWork(h.handle, base, anchor(base), limits, local);
        await f.core.runs.settleCompute(h.handle, base.session.sessionId, sent.operation, model.attemptId, { inputTokens: 12, outputTokens: 8 });
        await f.core.runs.settleLocalWork(h.handle, base.session.sessionId, job.operation, local.attemptId, localUsage);
        await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Close original cost scope' });
        const control = await f.core.runs.status(h.handle, base.session.sessionId);
        const portable = { operations: control.operations, background: control.background, highWaterTurn: control.highWaterTurn, retiredCompute: control.retiredCompute };
        expect(assertRunContinuation(portable)).toEqual(portable);
        for (const update of [row => row.unknownUpperTokens = 0, row => row.localEstimatedItems = 0, row => row.localEstimatedInputBytes = 0,
            row => { row.modelAttempts = 0; row.unknownAttempts = 0; row.unknownUpperTokens = 0; }]) {
            const invalid = structuredClone(portable); update(invalid.retiredCompute); expect(() => assertRunContinuation(invalid)).toThrow();
        }
    } finally { await h.cleanup(); }
});
for (const mode of ['ordinary', 'ironman']) {
    test(`G05 retired work original ${mode} death permits only existing receipt costs after world writes are blocked`, async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await runFixture(h, 'http://127.0.0.1:1/unused');
            const base = await f.core.appendTimeline(h.handle, (await f.begin(mode)).session.sessionId, { role: 'user', content: 'An authored fatal action' });
            const model = attempt(), local = { ...attempt(), kind: 'index_query', estimatedItems: 1, estimatedInputBytes: 20 }; delete local.estimatedTokens;
            const sent = await f.core.runs.chargeCompute(h.handle, base, anchor(base), limits, model);
            const job = await f.core.runs.chargeLocalWork(h.handle, base, anchor(base), limits, local);
            const selection = { ...f.selection, input: { ...f.selection.input, amount: 8 } }, prepared = await f.core.prepareAuthorityTurn(h.handle, base, selection);
            await f.core.finalizeTurn(h.handle, base.session.sessionId, { invocationId: 'fatal-cost', authorityProof: prepared.proof,
                envelope: { schemaVersion: 1, narrative: 'An authored fatal consequence.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: base.revision.revisionId });
            const status = mode === 'ironman' ? 'terminal' : 'dead';
            expect((await f.core.runs.status(h.handle, base.session.sessionId)).status).toBe(status);
            await expect(f.core.runs.chargeCompute(h.handle, base, anchor(base), limits, attempt())).rejects.toMatchObject({ code: 'native_run_' + status });
            await expect(f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Cannot write after death' })).rejects.toMatchObject({ code: 'native_run_' + status });
            setReadOnly(true);
            await expect(f.core.runs.settleCompute(h.handle, base.session.sessionId, sent.operation, model.attemptId, { totalTokens: 20 })).rejects.toMatchObject({ code: 'storage_read_only' });
            setReadOnly(false);
            await f.core.runs.settleCompute(h.handle, base.session.sessionId, sent.operation, model.attemptId, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
            await f.core.runs.settleLocalWork(h.handle, base.session.sessionId, job.operation, local.attemptId, localUsage);
            expect(await f.core.runs.status(h.handle, base.session.sessionId)).toMatchObject({ status, operations: {},
                retiredCompute: { modelAttempts: 1, knownTotalTokens: 20, localJobs: 1, localCancelledJobs: 1 } });
            await expect(f.core.runs.settleCompute(h.handle, base.session.sessionId, sent.operation, 'invented', { totalTokens: 0 })).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        } finally { setReadOnly(false); await h.cleanup(); }
    });
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 retired work ${kind} original resume export and fresh import preserve cumulative unknown observations`, async () => {
        const h = await make(), target = await make();
        try {
            const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin('ironman'), model = attempt();
            const receipt = await f.core.runs.chargeCompute(h.handle, base, anchor(base), limits, model);
            await f.core.runs.settleCompute(h.handle, base.session.sessionId, receipt.operation, model.attemptId, { inputTokens: 12, outputTokens: 8 });
            const next = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Continue after an unknown observation' });
            const control = await f.core.runs.status(h.handle, base.session.sessionId), exported = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
            const save = inspectAtriaSaveContainer(exported.archive).save;
            expect(save.resume.control.retiredCompute).toEqual(control.retiredCompute);
            expect(control.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 0, unknownAttempts: 1, unknownUpperTokens: 100, reportedInputTokens: 12, reportedOutputTokens: 8 });
            const svc = services(target); await svc.packageInstaller.install(target.handle, f.archive);
            const imported = await svc.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.timeline).toEqual(next.timeline); expect((await svc.core.runs.status(target.handle, imported.session.sessionId)).retiredCompute).toEqual(control.retiredCompute);
            const after = await svc.saveSystem.exportSession(target.handle, imported.session.sessionId);
            expect(inspectAtriaSaveContainer(after.archive).save.resume.control.retiredCompute).toEqual(control.retiredCompute);
            expect((await f.saveSystem.importSave(h.handle, exported.archive)).revision).toEqual(next.revision);
            expect((await f.core.runs.status(h.handle, base.session.sessionId)).retiredCompute).toEqual(control.retiredCompute);
        } finally { await target.cleanup(); await h.cleanup(); }
    });
}
