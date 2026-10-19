import { RunControl } from '../../src/native/run-control.js';
import { SessionRepo } from '../../src/native/repositories/session-repo.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { admitComputeAttempt, assertComputeLedger } from '../../public/shared/native-compute-budget.js';
import { createNativeId } from '../../src/native/identity.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { services } from '../native/helpers/session-fixture.js';
import { lifecycleFixture } from '../native/helpers/lifecycle-fixture.js';
import { cancelSessionMaintenance } from '../../src/native/session-maintenance.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

// Direct internal inputs exercise real original Session/Engine writes, not a
// trusted Turn producer, actual Provider send or a product permission grant.
const limits = { maxRequests: 8, maxTokens: 800 };
const anchorOf = base => ({ branchId: base.revision.branchId, revisionId: base.revision.revisionId });
const operationOf = (anchor, background = false) => hashNativeDocument({ lane: background ? 'background' : 'turn', anchor });
const quota = (base, role = 'narrator', invocationId = null) => ({ policy: base.manifest.runtime.experienceContract.generationBudget,
    request: { role, background: invocationId !== null, anchor: invocationId === null ? anchorOf(base) : { invocationId } } });
const attempt = (ordinal = 0, effectId = createNativeId('orchestrationEffect')) => ({
    attemptId: sendAttemptId(effectId, ordinal), requestId: 'quota-' + effectId, targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 100,
    orchestration: { kind: 'provider_send', effectId, ordinal },
});

test('original bank validates, clones and immutably compares every generation quota reference field', () => {
    const generationQuotaRef = { operationId: 'c'.repeat(64), role: 'narrator', background: false, policyDigest: 'd'.repeat(64), anchorDigest: 'e'.repeat(64) };
    const row = { ...attempt(), generationQuotaRef }, holder = {};
    admitComputeAttempt(holder, limits, row);
    generationQuotaRef.role = 'intent_resolver';
    expect(holder.compute.attempts[0].generationQuotaRef.role).toBe('narrator');
    const authentic = structuredClone(holder.compute.attempts[0].generationQuotaRef);
    const replay = { ...row, generationQuotaRef: authentic };
    expect(admitComputeAttempt(holder, limits, replay).replayed).toBe(true);
    for (const [field, value] of [['operationId', 'f'.repeat(64)], ['role', 'intent_resolver'], ['background', true], ['policyDigest', 'f'.repeat(64)], ['anchorDigest', 'f'.repeat(64)]]) {
        expect(() => admitComputeAttempt(holder, limits, { ...replay, generationQuotaRef: { ...authentic, [field]: value } })).toThrow('native_generation_attempt_conflict');
    }
    const { generationQuotaRef: _reference, ...naked } = replay;
    expect(() => admitComputeAttempt(holder, limits, naked)).toThrow('native_generation_attempt_conflict');
    const unbound = {}; admitComputeAttempt(unbound, limits, naked);
    expect(() => admitComputeAttempt(unbound, limits, replay)).toThrow('native_generation_attempt_conflict');
    for (const corrupt of [null, { ...authentic, background: 1 }, { ...authentic, role: 'studio' }, { ...authentic, operationId: 'bad' }, { ...authentic, policyDigest: null }, { ...authentic, anchorDigest: null }, { ...authentic, approved: true }]) {
        const ledger = structuredClone(holder.compute); ledger.attempts[0].generationQuotaRef = corrupt;
        expect(() => assertComputeLedger(ledger)).toThrow();
    }
});

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_QUOTA_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original atomic generation quota', ({ make }) => {
    let h, f, base;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = await runFixture(h, 'http://127.0.0.1:1/not-sent', fixture => {
            fixture.contract.generationBudget = { ...fixture.contract.generationBudget, narratorAttempts: 1, resolverAttempts: 1, turnAttempts: 2, backgroundAttempts: 2, backgroundPeriodAttempts: 3 };
            // Keep original background counter operations alive with genuine
            // authored pending outbox intents, never synthetic control rows.
            Object.assign(fixture.contract.taskRuntime, lifecycleFixture().taskRuntime);
            fixture.contract.lifecycleRuntime.automations = [{ id: 'quota-background', scopeId: 'session', trigger: { kind: 'world.schedule', clockId: 'world', at: 1, every: 1, catchUp: 'latest' },
                action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} }, maxCatchUp: 1 }];
            const variant = fixture.contract.taskRuntime.tasks[0].variants[0];
            fixture.base.manifest.resources = [
                { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Quota task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
                { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Quota task', output: { maxTokens: 128 } } },
            ].map(item => ({ ...item, origin: { scope: 'package', packageId: fixture.base.session.packageId, packageVersionId: fixture.base.session.packageVersionId } }));
        });
        base = await f.begin();
    });
    afterEach(async () => { if (f && base) cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId); await h?.engine.close(); await h?.cleanup(); });
    const stored = async () => (await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: K.runControl, handle: h.handle, sessionId: base.session.sessionId }))).doc;
    const admit = (row, q = quota(base), budget = limits, options = {}) => f.core.runs.admitCompute(h.handle, base, anchorOf(base), budget, row, options, q);
    const progress = async value => {
        while (base.states.atri_lifecycle.domains.progress.records[0].value.effectiveTurns < value) {
            base = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Advance the original turn counter.' });
            const prepared = await f.core.prepareAuthorityTurn(h.handle, base, f.selection);
            const next = base.states.atri_lifecycle.domains.progress.records[0].value.effectiveTurns + 1;
            base = await f.core.finalizeTurn(h.handle, base.session.sessionId, { invocationId: 'progress-' + next, authorityProof: prepared.proof,
                envelope: { schemaVersion: 1, narrative: 'Advance the original turn.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: base.revision.revisionId });
        }
    };

    test('original charge keeps role/turn counters and rejected quota changes no stored record', async () => {
        const policy = quota(base).policy, anchor = anchorOf(base), bank = f.core.runs;
        expect(await bank.charge(h.handle, base, { role: 'narrator', anchor }, policy)).toMatchObject({ operation: operationOf(anchor), attempt: 1 });
        const before = await stored();
        await expect(bank.charge(h.handle, base, { role: 'narrator', anchor }, policy)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await stored()).toEqual(before);
        expect(await bank.charge(h.handle, base, { role: 'intent_resolver', anchor }, policy)).toMatchObject({ attempt: 2 });
        expect((await stored()).operations[operationOf(anchor)]).toMatchObject({ total: 2, attempts: { narrator: 1, intent_resolver: 1 } });
    });

    test('stable replay spends quota once; changed actual input and refused quota publish no row', async () => {
        const row = attempt(), first = await admit(row);
        expect(first.replayed).toBe(false); expect((await admit(row)).replayed).toBe(true);
        expect(first.quotaOperation).toBe(first.operation);
        const before = await stored();
        await expect(admit({ ...row, inputFingerprint: 'c'.repeat(64) })).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        await expect(admit(attempt())).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await stored()).toEqual(before);
        expect(before.operations[first.operation]).toMatchObject({ total: 1, attempts: { narrator: 1 } });
        expect(before.operations[first.operation].compute.attempts).toHaveLength(1);
    });

    test('compute refusal cannot consume the other role quota or publish partial counters', async () => {
        const budget = { maxRequests: 1, maxTokens: 100 }, first = await admit(attempt(), quota(base), budget), before = await stored();
        await expect(admit(attempt(), quota(base, 'intent_resolver'), budget)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await stored()).toEqual(before); expect(before.operations[first.operation].attempts).toEqual({ narrator: 1 });
    });

    test('the original shared turn ceiling still rejects a role with unused individual quota', async () => {
        f = await runFixture(h, 'http://127.0.0.1:1/not-sent', fixture => { fixture.contract.generationBudget.turnAttempts = 1; });
        base = await f.begin();
        await admit(attempt()); const before = await stored();
        await expect(admit(attempt(), quota(base, 'intent_resolver'))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await stored()).toEqual(before);
    });

    test('siblings share root quota and refuse the losing reservation candidate atomically', async () => {
        const budget = { maxRequests: 2, maxTokens: 200 }, anchor = anchorOf(base);
        for (const id of ['child-A', 'child-B']) await f.core.runs.reserveComputeChild(h.handle, base, anchor, budget,
            { reservationId: id, parentReservationId: null, consumerId: id, limits: { maxRequests: 1, maxTokens: 100 } });
        const results = await Promise.allSettled(['child-A', 'child-B'].map(reservationId => admit(attempt(), quota(base), budget, { reservationId })));
        expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(row => row.status === 'rejected').map(row => row.reason.code)).toEqual(['native_generation_budget_exhausted']);
        const op = (await stored()).operations[operationOf(anchor)];
        expect(op.total).toBe(1); expect(op.compute.attempts).toHaveLength(1); expect(op.compute.reservations).toHaveLength(2);
    });

    test('background invocation counters share window/period ceilings while compute uses only root turn banks', async () => {
        await progress(4);
        const [a, b, c] = base.states.atri_lifecycle.outbox;
        const q = quota(base, 'narrator', a.invocationId), first = await admit(attempt(), q);
        await admit(attempt(), q);
        let control = await stored();
        expect(first.operation).toBe(operationOf(anchorOf(base)));
        expect(first.quotaOperation).toBe(operationOf(q.request.anchor, true));
        expect(control.operations[operationOf(q.request.anchor, true)]).toMatchObject({ lane: 'background', total: 2, attempts: { background: 2 } });
        expect(control.operations[operationOf(q.request.anchor, true)].compute).toBeUndefined();
        expect(control.operations[first.operation].compute.attempts).toHaveLength(2);
        expect(control.operations[first.operation].total).toBe(0);
        const before = control;
        await expect(admit(attempt(), quota(base, 'narrator', b.invocationId))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await stored()).toEqual(before);
        await progress(8); await admit(attempt(), quota(base, 'narrator', b.invocationId));
        control = await stored(); expect(control.background['1'].count + control.background['2'].count).toBe(3);
        const blocked = await stored();
        await expect(admit(attempt(), quota(base, 'narrator', b.invocationId))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await stored()).toEqual(blocked);
        await progress(20); await admit(attempt(), quota(base, 'narrator', c.invocationId));
        expect((await stored()).background).toMatchObject({ 5: { count: 1, period: 1 } });
        expect(Object.keys((await stored()).background)).toEqual(['5']);
    });

    test('not-due background and invalid lane/source/policy cannot initialize compute or quota', async () => {
        const before = await stored();
        await expect(admit(attempt(), quota(base, 'narrator', 'not-due'))).rejects.toMatchObject({ code: 'native_generation_background_not_due' });
        const wrongAnchor = quota(base); wrongAnchor.request.anchor.revisionId = createNativeId('revision');
        await expect(admit(attempt(), wrongAnchor)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        const wrongPolicy = structuredClone(quota(base)); wrongPolicy.policy.narratorAttempts++;
        await expect(admit(attempt(), wrongPolicy)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        await expect(admit(attempt(), quota(base, 'studio'))).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        expect(await stored()).toEqual(before);
    });

    test('quota has a closed schema on fresh admissions and replays', async () => {
        const row = attempt(); await admit(row);
        const before = await stored();
        const invalid = [false, { ...quota(base), allow: true },
            { ...quota(base), request: { ...quota(base).request, approved: true } },
            { ...quota(base), request: { ...quota(base).request, background: 1 } },
            { ...quota(base), request: { ...quota(base).request, role: 'studio' } },
            { ...quota(base), request: { ...quota(base).request, anchor: { ...anchorOf(base), invocationId: 'mixed' } } },
            { ...quota(base), request: { role: 'narrator', background: true, anchor: { invocationId: 'background', ...anchorOf(base) } } },
            { ...quota(base), request: { role: 'narrator', background: true, anchor: {} } },
            { ...quota(base), request: { role: 'narrator', background: true, anchor: { invocationId: 'bad\nanchor' } } },
            { ...quota(base), policy: { ...quota(base).policy, narratorAttempts: 100 } },
            { ...quota(base), policy: { ...quota(base).policy, approved: true } }];
        for (const value of invalid) {
            await expect(admit(row, value)).rejects.toThrow();
            await expect(admit(attempt(), value)).rejects.toThrow();
        }
        expect(await stored()).toEqual(before);
    });

    test('stable compute identity cannot change role, background anchor, policy or remove/add quota', async () => {
        await progress(4);
        const row = attempt(); await admit(row); const foreground = await stored();
        await expect(admit(row, quota(base, 'intent_resolver'))).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        const [a, b] = base.states.atri_lifecycle.outbox;
        await expect(admit(row, quota(base, 'narrator', a.invocationId))).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        await expect(admit(row, null)).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        expect(await stored()).toEqual(foreground);
        const backgroundRow = attempt(), background = quota(base, 'narrator', a.invocationId);
        await admit(backgroundRow, background); const before = await stored();
        await expect(admit(backgroundRow, quota(base, 'narrator', b.invocationId))).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        const changedPolicy = structuredClone(background); changedPolicy.policy.backgroundAttempts = 3;
        await expect(admit(backgroundRow, changedPolicy)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        expect(await stored()).toEqual(before);
        const unbound = attempt(); await admit(unbound, null); const old = await stored();
        await expect(admit(unbound, quota(base, 'intent_resolver'))).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        expect(await stored()).toEqual(old);
    });

    test('unknown ACK and cold Engine keep one stable charge and old source still refuses admission', async () => {
        const row = attempt(), original = h.engine.withTransaction.bind(h.engine);
        let armed = true;
        h.engine.withTransaction = async (...args) => {
            const result = await original(...args);
            if (armed) { armed = false; throw Object.assign(new Error('Synthetic lost ACK after actual Engine commit'), { code: 'storage_commit_unknown' }); }
            return result;
        };
        try { await expect(admit(row)).rejects.toMatchObject({ code: 'storage_commit_unknown' }); }
        finally { h.engine.withTransaction = original; }
        const operation = operationOf(anchorOf(base));
        expect((await f.core.runs.observeCompute(h.handle, base.session.sessionId, operation, row.attemptId)).compute.status).toBe('charged');
        await f.core.runs.settleCompute(h.handle, base.session.sessionId, operation, row.attemptId, null);
        const before = await stored(), Engine = h.engine.constructor;
        cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId);
        await h.engine.close(); h.engine = new Engine({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => h.dirs });
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const bank = new RunControl(new SessionRepo({ engine: h.engine }));
        expect(await bank.admitCompute(h.handle, base, anchorOf(base), limits, row, {}, quota(base))).toMatchObject({ replayed: true, compute: { status: 'unknown' } });
        expect(await stored()).toEqual(before);
        await expect(bank.admitCompute(h.handle, base, anchorOf(base), limits, attempt(), {}, quota(base))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        await bank.settleCompute(h.handle, base.session.sessionId, operation, row.attemptId, { totalTokens: 60 });
        await bank.settleCompute(h.handle, base.session.sessionId, operation, row.attemptId, { totalTokens: 60 });
        expect((await stored()).operations[operation]).toMatchObject({ total: 1, compute: { attempts: [{ status: 'settled', usage: { totalTokens: 60 } }] } });
        const reopened = services(h), current = await reopened.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Move the quota source' });
        cancelSessionMaintenance(reopened.sessionRepo, h.handle, base.session.sessionId);
        expect(current.revision.revisionId).not.toBe(base.revision.revisionId);
        await expect(bank.admitCompute(h.handle, base, anchorOf(base), limits, row, {}, quota(base))).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    });

    test('original model and local usage settlement compares semantic fields across durable JSON ordering', async () => {
        const row = attempt(), first = await admit(row), bank = f.core.runs, sessionId = base.session.sessionId;
        await bank.settleCompute(h.handle, sessionId, first.operation, row.attemptId, { totalTokens: 60, inputTokens: 40, outputTokens: 20 });
        await bank.settleCompute(h.handle, sessionId, first.operation, row.attemptId, { outputTokens: 20, totalTokens: 60, inputTokens: 40 });
        const before = await stored();
        await expect(bank.settleCompute(h.handle, sessionId, first.operation, row.attemptId, { totalTokens: 61, inputTokens: 40, outputTokens: 21 }))
            .rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        expect(await stored()).toEqual(before);
        const localId = 'd'.repeat(64), withLocal = { ...limits, localWork: { maxJobs: 1, maxItems: 1, maxInputBytes: 10 } };
        await bank.chargeLocalWork(h.handle, base, anchorOf(base), withLocal,
            { attemptId: localId, requestId: 'local-settle-order', targetFingerprint: 'e'.repeat(64), kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10 });
        const usage = { wallMs: 1.5, cpuUserMicros: 2, cpuSystemMicros: 3, cpuScope: 'process', outcome: 'completed' };
        await bank.settleLocalWork(h.handle, sessionId, first.operation, localId, usage);
        await bank.settleLocalWork(h.handle, sessionId, first.operation, localId,
            { outcome: 'completed', cpuScope: 'process', cpuSystemMicros: 3, cpuUserMicros: 2, wallMs: 1.5 });
        const settled = await stored();
        await expect(bank.settleLocalWork(h.handle, sessionId, first.operation, localId, { ...usage, outcome: 'failed' }))
            .rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
        expect(await stored()).toEqual(settled);
    });
});
