import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installAppraisalFixture, appraisalCandidate as candidate } from './helpers/appraisal-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { services } from './helpers/session-fixture.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { appraisalEventCurrent } from '../../src/native/appraisal-authority.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';

async function command(h, f, action) {
    const current = await f.core.load(h.handle, f.current().session.sessionId);
    return f.core.applyLifecycleCommand(h.handle, current.session.sessionId, { type: 'lifecycle', invocationId: 's18-change-' + current.revision.revisionId, action }, { expectedRevisionId: current.revision.revisionId });
}
const write = (h, f, domainId, recordId, args) => command(h, f, { kind: 'app.command', domainId, commandId: 'save', recordId, args });
function authorEmotion(base) {
    const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === 'emotions');
    const view = projectInformation(base, 'actor', { purpose: 'context', includeRollups: false }), event = view.items.find(item => item.id === 'events:contact');
    return { ...domain.initial, text: '阿岚仍有担忧。', basis: { viewId: 'actor', anchor: view.anchor, sourceRefs: [{ itemId: event.id, fingerprint: informationItemFingerprint(event) }] },
        appraisal: { ...domain.initial.appraisal, previousHash: hashNativeDocument(domain.initial) } };
}

async function runtime(h, f, response = candidate(f), fetchHook = null) {
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/local-stub' });
    for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 64000, localWork: { maxJobs: 32, maxItems: 4096, maxInputBytes: 16777216 } } } });
    const fetchImpl = jest.fn(async () => { await fetchHook?.(); return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200, headers: { 'content-type': 'application/json' } }); });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller, secretPort: { resolveSecret: async () => 's18-synthetic-secret-value' },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) } });
    const input = snapshot => ({ sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
        slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
    return { host, fetchImpl, seeded, input };
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S18 ${kind} one real Host pass separately adopts directional emotion/relationship with sealed provenance and original costs`, async () => {
        const h = await make();
        try {
            const f = await installAppraisalFixture(h, { publicAppraisal: true }); await f.ready(); const queued = await f.queue();
            const before = structuredClone(queued), r = await runtime(h, f);
            const adopt = f.core.recordTaskResult.bind(f.core); let admitted;
            jest.spyOn(f.core, 'recordTaskResult').mockImplementation(async (...args) => {
                admitted = await f.core.runs.status(h.handle, queued.session.sessionId);
                return adopt(...args);
            });
            const result = await r.host.executeLifecycle(h.handle, r.input(queued));
            expect(r.fetchImpl).toHaveBeenCalledTimes(1); expect(result.results[0].authorityReceipt.applied).toBe(2);
            const state = result.snapshot.states.atri_lifecycle.domains;
            expect(state.emotions.records[0].value.level).toBe(30); expect(state.relations.records[0].value.level).toBe(-5);
            expect(state.relations.records[0].value.actor).toBe(f.actorId); expect(state.relations.records[0].value.target).toBe(f.otherActorId);
            expect(state.emotions.records[0].value.appraisal.origin).toBe('model');
            expect(state.emotions.records[0].value.appraisal.modelProfileId).toBe(r.seeded.model.modelProfileId);
            expect(result.snapshot.states.atri_world_state).toEqual(before.states.atri_world_state); expect(result.snapshot.manifest.actors).toEqual(before.manifest.actors);
            expect(result.snapshot.timeline).toEqual(before.timeline);
            const restored = await services(h).core.load(h.handle, queued.session.sessionId);
            expect(restored.states.atri_lifecycle.domains).toEqual(state);
            const display = projectInformation(restored, 'player', { purpose: 'display' });
            expect(display.items.find(item => item.sourceId === 'public-emotions').data).toEqual({ text: '阿岚对这段传闻的担忧有所减轻。' });
            expect(JSON.stringify(display)).not.toContain('"level"'); expect(JSON.stringify(display)).not.toContain('modelProfileHash');
            expect(projectInformation(restored, 'other-actor', { purpose: 'context' }).items.some(item => item.semantic === 'relationship')).toBe(false);
            const bank = await f.core.runs.status(h.handle, queued.session.sessionId);
            const op = Object.values(admitted.operations).find(op => op.compute?.attempts.length);
            expect(op.compute.attempts).toHaveLength(1); expect(op.compute.attempts[0].status).toBe('settled');
            expect(op.compute.localWork.map(work => work.kind)).toEqual(expect.arrayContaining(['appraisal_gate', 'appraisal_parse', 'appraisal_adopt']));
            expect(op.lane).toBe('background'); expect(op.anchor.invocationId).toBe(queued.states.atri_lifecycle.outbox[0].invocationId);
            expect(bank.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 150, unknownAttempts: 0 });
            const retry = await r.host.executeLifecycle(h.handle, r.input(restored)); expect(retry.results).toEqual([]); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        } finally { await h.cleanup(); }
    }, 30000);
}

test('S18 a low-information event is skipped before sending; reading state never schedules an appraisal', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h, { importance: 'low' }); const ready = await f.ready(), r = await runtime(h, f);
        expect((await r.host.executeLifecycle(h.handle, r.input(ready))).results).toEqual([]);
        const queued = await f.queue(), result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.results[0].status).toBe('skipped'); expect(r.fetchImpl).not.toHaveBeenCalled();
        expect(result.snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
        expect(result.snapshot.states.atri_lifecycle.domains.relations.records).toEqual([]);
    } finally { await h.cleanup(); }
});

test('S18 bad components retain decisions without widening source/target or blocking the valid component', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const queued = await f.queue(), payload = candidate(f);
        payload.updates.push({ ...payload.updates[1], dimension: 'affinity', sourceItemIds: ['beliefs:other'] });
        payload.updates.push({ ...payload.updates[1], dimension: 'affinity', target: f.actorId });
        payload.updates.push({ ...payload.updates[0], dimension: 'relief', delta: 90 });
        payload.updates.unshift({ ...payload.updates[0], delta: 90 });
        const r = await runtime(h, f, payload), result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.results[0].authorityReceipt.decisions.map(row => row.status)).toEqual(['rejected', 'applied', 'applied', 'rejected', 'rejected', 'rejected']);
        expect(result.snapshot.states.atri_lifecycle.domains.emotions.records).toHaveLength(1); expect(result.snapshot.states.atri_lifecycle.domains.relations.records).toHaveLength(1);
        expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test.each(['source', 'actor', 'state'])('S18 changed %s before invocation keeps the original intent pending with zero sends', async change => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
        let current;
        if (change === 'source') current = await write(h, f, 'events', 'contact', { ...queued.states.atri_lifecycle.domains.events.records[0].value, text: 'A corrected event' });
        if (change === 'actor') current = await write(h, f, 'availability', 'main', { ...queued.states.atri_lifecycle.domains.availability.records[0].value, available: false });
        if (change === 'state') current = await write(h, f, 'emotions', 'author', authorEmotion(queued));
        const result = await r.host.executeLifecycle(h.handle, r.input(current));
        expect(result.pending).toBeDefined(); expect(r.fetchImpl).not.toHaveBeenCalled();
        expect(result.snapshot.states.atri_lifecycle.outbox[0].status).toBe('pending');
        expect(result.snapshot.states.atri_lifecycle.domains.relations.records).toEqual([]);
    } finally { await h.cleanup(); }
});

test('S18 epoch, Actor/profile, branch, Package and missing evidence cannot reuse a pinned event; invalid declarations fail closed', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const queued = await f.queue();
        const task = queued.manifest.runtime.experienceContract.taskRuntime.tasks[0], variant = task.variants[0], intent = queued.states.atri_lifecycle.outbox[0];
        expect(appraisalEventCurrent(queued, intent, task, variant).status).toBe('current');
        const altered = structuredClone(queued); altered.states.atri_lifecycle.scopes.session.epoch++;
        expect(appraisalEventCurrent(altered, intent, task, variant).status).toBe('pending');
        altered.states.atri_lifecycle.scopes.session.epoch--; altered.manifest.actors[0].displayName = 'Revised Actor';
        expect(appraisalEventCurrent(altered, intent, task, variant).status).toBe('pending');
        for (const key of ['branchId', 'packageVersionId']) {
            const base = structuredClone(queued); (key === 'branchId' ? base.revision : base.session)[key] += 'changed';
            expect(appraisalEventCurrent(base, intent, task, variant).status).toBe('pending');
        }
        const revisedTask = structuredClone(task); revisedTask.variants[0].resultBinding.profile.revision = 'v2';
        expect(appraisalEventCurrent(queued, intent, revisedTask, revisedTask.variants[0]).status).toBe('pending');
        expect(appraisalEventCurrent(queued, { ...intent, appraisalEvent: null }, task, variant).status).toBe('pending');
        const valid = queued.manifest.runtime.experienceContract;
        expect(() => assertNativeExperienceContract(valid)).not.toThrow();
        for (const alter of [
            c => { c.taskRuntime.tasks[0].variants[0].resultBinding.viewId = 'actor'; },
            c => { c.taskRuntime.tasks[0].variants[0].resultBinding.eventSourceIds = ['memories']; },
            c => { c.taskRuntime.tasks[0].variants[0].resultBinding.relationship.domainId = 'emotions'; },
            c => { c.taskRuntime.tasks[0].variants[0].resultBinding.profile.maxDelta = 101; },
            c => { c.taskRuntime.tasks[0].variants[0].outputSchema.properties.updates.maxItems = 100; },
        ]) { const c = structuredClone(valid); alter(c); expect(() => assertNativeExperienceContract(c)).toThrow(); }
    } finally { await h.cleanup(); }
});

test('S18 caller JSON cannot forge Host provenance or direct model adoption', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const base = await f.queue(), queued = base.states.atri_lifecycle.outbox[0];
        const record = { invocationId: queued.invocationId, taskId: queued.taskId, variantId: queued.variantId, payload: candidate(f),
            deliveryReceipt: { kind: 'model_delivery' }, appraisalEvidence: { origin: 'model', modelProfileId: 'forged' } };
        await expect(f.core.recordTaskResult(h.handle, base.session.sessionId, record, { expectedRevisionId: base.revision.revisionId, appraisalProof: {} })).rejects.toThrow(/Host delivery proof/);
        const value = authorEmotion(base); value.appraisal.origin = 'model';
        await expect(write(h, f, 'emotions', 'forged', value)).rejects.toThrow(/provenance/);
        expect((await f.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
    } finally { await h.cleanup(); }
});

test('S18 withdrawal and original Save restoration preserve authored state and rebase current-source interpretation', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h, { publicAppraisal: true }); await f.ready(); const base = await f.queue(), r = await runtime(h, f);
        const result = await r.host.executeLifecycle(h.handle, r.input(base)), active = result.snapshot;
        const old = structuredClone(active.states.atri_lifecycle.domains.emotions.records[0]);
        const save = await f.core.createSavePoint(h.handle, active.session.sessionId, { expectedRevisionId: active.revision.revisionId });
        await write(h, f, 'events', 'contact', { ...active.states.atri_lifecycle.domains.events.records[0].value, text: 'The event was corrected.' });
        const stale = await f.core.load(h.handle, active.session.sessionId);
        expect(projectInformation(stale, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'emotion').cognition.status).toBe('stale');
        const withdrawn = await write(h, f, 'emotions', old.id, { ...old.value, status: 'withdrawn' });
        expect(projectInformation(withdrawn, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'emotion').cognition.status).toBe('withdrawn');
        const restored = await f.core.restoreSavePoint(h.handle, active.session.sessionId, save.saveId, { expectedRevisionId: withdrawn.revision.revisionId });
        expect(restored.states.atri_lifecycle.domains.emotions.records[0]).toEqual({ ...old, value: { ...old.value, basis: { ...old.value.basis,
            anchor: { ...old.value.basis.anchor, branchId: restored.revision.branchId, revisionId: restored.revision.revisionId } } } });
        expect(projectInformation(restored, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'emotion').cognition.status).toBe('active');
        expect((await r.host.executeLifecycle(h.handle, r.input(restored))).results).toEqual([]); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        expect((await services(h).core.runs.status(h.handle, active.session.sessionId)).retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 150 });
    } finally { await h.cleanup(); }
});

test('S18 invalid structured output remains charged; reopened retries cannot obtain a fresh allowance', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const base = await f.queue(), r = await runtime(h, f, { bad: 'candidate' });
        const route = await r.seeded.persistence.getRuntimeRoute(h.handle, r.seeded.routes[0].runtimeRouteId);
        await r.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 1 } } });
        await expect(r.host.executeLifecycle(h.handle, r.input(base))).rejects.toThrow(); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const bank = await services(h).core.runs.status(h.handle, base.session.sessionId), op = Object.values(bank.operations).find(op => op.compute?.attempts.length);
        expect(op.compute.attempts).toHaveLength(1); expect(op.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 150 } });
        const reopened = new NativeGenerationHost({ ...r.host, sessionCore: services(h).core });
        expect((await reopened.executeLifecycle(h.handle, r.input(base))).pending.reason).toBe('native_generation_budget_exhausted'); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const after = await f.core.load(h.handle, base.session.sessionId);
        expect(after.revision.revisionId).toBe(base.revision.revisionId); expect(after.states.atri_lifecycle.domains.relations.records).toEqual([]);
    } finally { await h.cleanup(); }
});

test('S18 author relationship targets must belong to the current Package too', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const base = await f.queue();
        const relation = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === 'relations');
        const value = { ...authorEmotion(base), target: 'actor_' + 'f'.repeat(32), dimension: 'trust', level: 0,
            appraisal: { ...relation.initial.appraisal, previousHash: hashNativeDocument(relation.initial) } };
        await expect(write(h, f, 'relations', 'foreign', value)).rejects.toThrow(/outside this Package/);
        expect((await f.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
    } finally { await h.cleanup(); }
});

test.each(['source', 'cancel'])('S18 late %s rejects adoption and preserves the actual send across reopen/Save restore', async change => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const base = await f.queue();
        const save = await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId });
        const r = await runtime(h, f, candidate(f), async () => {
            if (change === 'source') await write(h, f, 'events', 'contact', { ...base.states.atri_lifecycle.domains.events.records[0].value, text: 'Revised while running' });
            else await command(h, f, { kind: 'scheduled.cancel', invocationId: base.states.atri_lifecycle.outbox[0].invocationId });
        });
        await expect(r.host.executeLifecycle(h.handle, r.input(base))).rejects.toThrow(); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const current = await f.core.load(h.handle, base.session.sessionId), cost = await services(h).core.runs.status(h.handle, base.session.sessionId);
        expect(current.states.atri_lifecycle.domains.emotions.records).toEqual([]); expect(current.states.atri_lifecycle.domains.relations.records).toEqual([]);
        const count = (cost.retiredCompute?.modelAttempts ?? 0) + Object.values(cost.operations).reduce((n, op) => n + (op.compute?.attempts.length ?? 0), 0);
        expect(count).toBe(1);
        const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: current.revision.revisionId });
        const again = await r.host.executeLifecycle(h.handle, r.input(restored));
        expect(again.pending).toBeDefined(); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const after = await services(h).core.runs.status(h.handle, base.session.sessionId);
        expect((after.retiredCompute?.modelAttempts ?? 0) + Object.values(after.operations).reduce((n, op) => n + (op.compute?.attempts.length ?? 0), 0)).toBe(1);
    } finally { await h.cleanup(); }
});

test('S18 no-change result writes only the receipt and missing/local exhausted budgets send nothing', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(h); await f.ready(); const base = await f.queue(), r = await runtime(h, f, { significance: 'none', rationale: 'No sufficient change.', updates: [] });
        const route = r.seeded.routes[0];
        await r.seeded.persistence.saveRuntimeRoute(h.handle, route);
        expect((await r.host.executeLifecycle(h.handle, r.input(base))).pending.reason).toBe('appraisal_budget_unavailable'); expect(r.fetchImpl).not.toHaveBeenCalled();
        const executionPolicy = { schemaVersion: 1, allowedModelProfileIds: [r.seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 64000, localWork: { maxJobs: 1, maxItems: 4096, maxInputBytes: 16777216 } } };
        await r.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy });
        expect((await r.host.executeLifecycle(h.handle, r.input(base))).pending.reason).toBe('native_generation_budget_exhausted'); expect(r.fetchImpl).not.toHaveBeenCalled();
        const bank = await f.core.runs.status(h.handle, base.session.sessionId);
        expect(Object.values(bank.operations).find(op => op.compute).compute.localWork).toHaveLength(1);
    } finally { await h.cleanup(); }
    const next = await makeTempFsEngineHarness();
    try {
        const f = await installAppraisalFixture(next); await f.ready(); const base = await f.queue(), r = await runtime(next, f, { significance: 'none', rationale: 'No sufficient change.', updates: [] });
        const result = await r.host.executeLifecycle(next.handle, r.input(base));
        expect(result.results[0].authorityReceipt).toMatchObject({ significance: 'none', applied: 0, decisions: [] });
        expect(result.snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]); expect(result.snapshot.states.atri_lifecycle.domains.relations.records).toEqual([]);
        expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await next.cleanup(); }
});
