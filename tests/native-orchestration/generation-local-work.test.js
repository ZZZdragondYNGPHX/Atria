import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { BudgetPort, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { compileNativeContextMetered, assertContextCompilation, runGenerationLocalWork } from '../../src/native/orchestration/generation-local-work.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { installCognitionFixture } from '../native/helpers/cognition-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const id = kind => createNativeId('orchestration' + kind);
const limits = { maxRequests: 4, maxTokens: 32000, localWork: { maxJobs: 5, maxItems: 5, maxInputBytes: 16777216 } };
const usage = { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' };

// Accounting-only fixture: actual FS/SQL, SourcePort, original Session bank,
// Run and compiler. Context-grant and empty Plan validation callbacks are
// controlled test authorities; this does not issue a Native Turn send grant.
async function fixture(make, maxInputBytes = limits.localWork.maxInputBytes) {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const cognition = await installCognitionFixture(h, 'limited');
        const base = await cognition.core.appendTimeline(h.handle, cognition.snapshot.session.sessionId, { role: 'user', content: 'Real compiler byte-budget sentinel '.repeat(500) });
        const budgetPort = new BudgetPort({ sessionCore: cognition.core });
        const sourcePort = new SourcePort({ budgetPort, sessionCore: cognition.core });
        const runs = new RunRepository({ engine: h.engine, authorize: async () => {},
            assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx), admit: ({ handle, sourceRequest, tx }) => sourcePort.capture(handle, sourceRequest, { tx }) });
        const plans = new PlanRepository({ engine: h.engine, authorize: async () => {}, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const draft = await plans.create(h.handle, id('Command'), planFixture());
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected), { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'accounting-test' } });
        const effectId = id('Effect'), grantDigest = hash({ accountingOnly: true }); let current = true;
        const assertCurrent = async () => { if (!current) throw Object.assign(new Error('Controlled grant revoked'), { code: 'native_orchestration_test_grant_revoked' }); await sourcePort.revalidate(h.handle, root.sourceBinding); };
        const bank = budgetPort.sendBank(h.handle, { authorityRef: root.budgetAuthorityRef, reservationId: null, limits, effectId, firstOrdinal: 0, assertCurrent });
        const request = { ownerRef: { handle: h.handle }, sourceBinding: root.sourceBinding, audience: { kind: 'narrator' }, taskPurpose: 'accounting-test', grantDigest,
            inputRefs: [], tokenBudget: { modelContextLimit: 32768, responseReserve: 128 } };
        const port = new ContextPort({ sessionCore: cognition.core, authorizeContext: async () => { await assertCurrent(); return { allowed: true, grantDigest }; } });
        const args = { handle: h.handle, port, request, bank, budgetPort, root, effectId,
            limits: { ...limits, localWork: { ...limits.localWork, maxInputBytes } }, workDescriptor: { requestId: 'actual-context', pathFingerprint: hash({ originalPath: true }), snapshotHash: 'caller-metadata-only' }, assertCurrent };
        const row = ordinal => budgetPort.observeAttempt(h.handle, { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId,
            localWorkOrdinal: ordinal, attemptId: localWorkAttemptId(effectId, ordinal), reservationId: null });
        return { ...h, base, root, bank, budgetPort, port, request, args, effectId, row, revoke: () => { current = false; },
            ledger: async () => (await cognition.core.runs.status(h.handle, base.session.sessionId))?.operations[root.budgetAuthorityRef.operationId]?.compute,
            cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_LOCAL_WORK_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name actual Context metering', ({ make }) => {
    test('one actual original compile yields an exact private accounting proof; copies and other identities cannot reuse it', async () => {
        const f = await fixture(make);
        try {
            const { compiled, proof } = await compileNativeContextMetered(f.args), expected = { proof, handle: f.handle, port: f.port, compiled, bank: f.bank, root: f.root };
            const verified = await assertContextCompilation(expected), row = await f.row(0);
            expect(verified.localWork).toEqual(row); expect(row).toMatchObject({ status: 'settled', kind: 'context_build', usage: { outcome: 'completed' } });
            expect(row.estimatedInputBytes).toBeGreaterThan(Buffer.byteLength(JSON.stringify(f.base)));
            expect((await f.ledger()).localWork).toHaveLength(1); expect(JSON.stringify(row)).not.toContain('byte-budget sentinel');
            await expect(assertContextCompilation({ ...expected, proof: JSON.parse(JSON.stringify(proof)) })).rejects.toThrow(/compile_proof_invalid/);
            await expect(assertContextCompilation({ ...expected, compiled: structuredClone(compiled) })).rejects.toThrow(/compile_proof_invalid/);
            await expect(assertContextCompilation({ ...expected, bank: { ...f.bank } })).rejects.toThrow(/compile_proof_invalid/);
            await expect(assertContextCompilation({ ...expected, root: { ...f.root, runId: id('Run') } })).rejects.toThrow(/compile_proof_invalid/);
            await expect(assertContextCompilation({ ...expected, intent: { runId: f.root.runId, effectId: id('Effect'), sourceBindingDigest: f.root.sourceBinding.bindingDigest,
                grantDigest: f.request.grantDigest } })).rejects.toThrow(/compile_proof_invalid/);
            // Accounting observation remains valid after permission is revoked;
            // this cannot substitute for a send/consume currentness decision.
            f.revoke(); await expect(assertContextCompilation(expected)).resolves.toMatchObject({ status: 'settled' });
        } finally { await f.cleanup(); }
    });

    test('actual snapshot bytes cannot be replaced by a tiny caller hash to pass original maxInputBytes', async () => {
        const f = await fixture(make, 4096); let compiled = 0;
        const original = ContextPort.prototype.compile;
        try {
            ContextPort.prototype.compile = async function (...args) { compiled++; return original.apply(this, args); };
            await expect(compileNativeContextMetered(f.args)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(compiled).toBe(0); expect(await f.ledger()).toBeUndefined();
        } finally { ContextPort.prototype.compile = original; await f.cleanup(); }
    });

    test('a copied bank cannot mint a compilation proof or spend the original bank', async () => {
        const f = await fixture(make);
        try {
            await expect(compileNativeContextMetered({ ...f.args, bank: { ...f.bank } })).rejects.toMatchObject({ code: 'native_orchestration_budget_bank_invalid' });
            expect(await f.ledger()).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test('revoked permission with an un-aborted signal spends zero new original local work', async () => {
        const f = await fixture(make), controller = new AbortController(); let admitted = 0, operated = 0;
        try {
            f.revoke();
            await expect(compileNativeContextMetered({ ...f.args, signal: controller.signal })).rejects.toThrow(/grant revoked/);
            await expect(runGenerationLocalWork({ signal: controller.signal, attempt: {}, assertCurrent: f.args.assertCurrent,
                admit: () => { admitted++; }, settle: () => { throw new Error('No settlement without admission'); } }, () => { operated++; })).rejects.toThrow(/grant revoked/);
            expect(controller.signal.aborted).toBe(false); expect(admitted).toBe(0); expect(operated).toBe(0); expect(await f.ledger()).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test('unknown admission ACK never compiles again; original observe and late settlement remain available after abort', async () => {
        const f = await fixture(make), controller = new AbortController(); let compiled = 0;
        const originalCharge = f.budgetPort.chargeLocalWork.bind(f.budgetPort), originalCompile = ContextPort.prototype.compile;
        try {
            f.budgetPort.chargeLocalWork = async (...args) => { await originalCharge(...args); throw new StorageCommitUnknownError(new Error('Synthetic original bank admission ACK loss')); };
            ContextPort.prototype.compile = async function (...args) { compiled++; return originalCompile.apply(this, args); };
            await expect(compileNativeContextMetered({ ...f.args, signal: controller.signal })).rejects.toMatchObject({ code: 'native_orchestration_budget_reconcile_required' });
            expect(compiled).toBe(0); expect((await f.row(0)).status).toBe('charged');
            controller.abort(); f.revoke();
            await f.budgetPort.settleLocalWork(f.handle, f.root.budgetAuthorityRef, localWorkAttemptId(f.effectId, 0), usage);
            expect((await f.row(0)).status).toBe('settled'); expect((await f.ledger()).localWork).toHaveLength(1);
        } finally { ContextPort.prototype.compile = originalCompile; await f.cleanup(); }
    });
});

test('settlement failure discards the admitted private result and never returns it to a consumer', async () => {
    const result = { privateLease: 'test-only' }; let discarded, operated = 0;
    await expect(runGenerationLocalWork({ attempt: {}, admit: async () => ({ status: 'charged' }), assertCurrent: async () => {},
        settle: async () => { throw Object.assign(new Error('Synthetic settlement failure'), { code: 'storage_commit_unknown' }); },
        discardResult: async value => { discarded = value; } }, () => { operated++; return result; })).rejects.toMatchObject({ code: 'generation_execution_failed' });
    expect(operated).toBe(1); expect(discarded).toBe(result);
});

// A controlled original quality denial keeps its protocol reason after paid
// local-work settlement. An arbitrary code or private error text never does.
test.each([
    ['native_orchestration_review_limit_exhausted', 'native_orchestration_review_limit_exhausted'],
    ['native_orchestration_review_rerun_budget_unavailable', 'native_orchestration_review_rerun_budget_unavailable'],
    ['native_orchestration_private_secret_denial', 'generation_execution_failed'],
    ['native_orchestration_attempt_superseded', 'generation_execution_failed'],
])('metered local work preserves only the controlled quality reason %s', async (code, expected) => {
    const privateMessage = 'synthetic-secret-from-original-authority';
    const settlements = []; let operated = 0, rejected;
    try {
        await runGenerationLocalWork({ attempt: {}, assertCurrent: async () => {},
            admit: async () => ({ status: 'charged' }), settle: async ({ usage }) => { settlements.push(usage); return { status: 'settled', usage }; } },
        () => { operated++; throw Object.assign(new Error(privateMessage), { code, privateValue: privateMessage }); });
    } catch (error) { rejected = error; }
    expect(rejected).toMatchObject({ name: 'GenerationError', code: expected, message: expected });
    expect(operated).toBe(1); expect(settlements).toHaveLength(1); expect(settlements[0].outcome).toBe('failed');
    expect(JSON.stringify(rejected)).not.toContain(privateMessage); expect(rejected.cause).toBeUndefined();
});
