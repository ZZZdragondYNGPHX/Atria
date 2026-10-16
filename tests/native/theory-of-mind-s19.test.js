import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installTomFixture, tomCandidate } from './helpers/tom-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { services } from './helpers/session-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { appraisalCandidate } from './helpers/appraisal-fixture.js';
import { informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { appraisalEventCurrent } from '../../src/native/appraisal-authority.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';

async function runtime(h, f, payload = tomCandidate(f), fetchHook = null, responseSchemaMode = 'full') {
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/s19-local-stub' });
    if (responseSchemaMode !== 'full') await seeded.persistence.saveConnectionProfile(h.handle, { ...seeded.connection, options: { responseSchemaMode } });
    for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 64000, localWork: { maxJobs: 32, maxItems: 4096, maxInputBytes: 16777216 } } } });
    const fetchImpl = jest.fn(async () => { await fetchHook?.(); return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200, headers: { 'content-type': 'application/json' } }); });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller, secretPort: { resolveSecret: async () => 's19-synthetic-secret-value' },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) } });
    const input = snapshot => ({ sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
        slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
    return { host, fetchImpl, seeded, input };
}
async function write(h, f, domainId, recordId, args) {
    const current = await f.core.load(h.handle, f.current().session.sessionId);
    return f.core.applyLifecycleCommand(h.handle, current.session.sessionId, { type: 'lifecycle', invocationId: 's19-write-' + current.revision.revisionId,
        action: { kind: 'app.command', domainId, recordId, commandId: 'save', args } }, { expectedRevisionId: current.revision.revisionId });
}
function authored(base, key = 'author-node') {
    const domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === 'hypotheses');
    const view = projectInformation(base, 'actor', { purpose: 'context', includeRollups: false }), event = view.items.find(item => item.id === 'events:contact');
    return { ...domain.initial, key, text: '阿岚猜测沈墨或许愿意继续说明；这仍未证实。', confidence: 50,
        basis: { viewId: view.viewId, anchor: view.anchor, sourceRefs: [{ itemId: event.id, fingerprint: informationItemFingerprint(event) }] },
        appraisal: { ...domain.initial.appraisal, previousHash: hashNativeDocument(domain.initial) } };
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S19 ${kind} installed one-order consumer adopts own hypothesis with sealed provenance and original costs`, async () => {
        const h = await make();
        try {
            const f = await installTomFixture(h, { publicHypotheses: true }); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
            const result = await r.host.executeLifecycle(h.handle, r.input(queued));
            expect(r.fetchImpl).toHaveBeenCalledTimes(1); expect(result.results[0].authorityReceipt.applied).toBe(1);
            const value = result.snapshot.states.atri_lifecycle.domains.hypotheses.records[0].value;
            expect(value).toMatchObject({ actor: f.actorId, target: f.otherActorId, perspective: [f.otherActorId], confidence: 60, status: 'active', appraisal: { origin: 'model', modelProfileId: r.seeded.model.modelProfileId } });
            expect(result.snapshot.states.atri_world_state).toEqual(queued.states.atri_world_state); expect(result.snapshot.timeline).toEqual(queued.timeline); expect(result.snapshot.manifest).toEqual(queued.manifest);
            const restored = await services(h).core.load(h.handle, queued.session.sessionId);
            expect(restored.states.atri_lifecycle.domains.hypotheses).toEqual(result.snapshot.states.atri_lifecycle.domains.hypotheses);
            expect(projectInformation(restored, 'other-actor', { purpose: 'context' }).items.some(item => item.semantic === 'theory_of_mind')).toBe(false);
            const display = projectInformation(restored, 'player', { purpose: 'display' });
            expect(display.items.find(item => item.sourceId === 'public-hypotheses').data).toEqual({ text: value.text });
            expect(JSON.stringify(display)).not.toContain('confidence'); expect(JSON.stringify(display)).not.toContain('modelProfileHash');
            expect((await f.core.runs.status(h.handle, queued.session.sessionId)).retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 150, localJobs: 8 });
            expect((await r.host.executeLifecycle(h.handle, r.input(restored))).results).toEqual([]); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        } finally { await h.cleanup(); }
    }, 30000);
}

test('S19 one-order policy rejects second-order and private source components without blocking the valid hypothesis', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h); await f.ready(); const queued = await f.queue(), payload = tomCandidate(f, 2);
        payload.hypotheses.push({ ...payload.hypotheses[0], key: 'private', sourceItemIds: ['beliefs:other'] });
        payload.hypotheses.push({ ...payload.hypotheses[0], key: 'recursive', sourceItemIds: ['hypotheses:share-next'] });
        const r = await runtime(h, f, payload), result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.results[0].authorityReceipt.decisions.map(item => item.status)).toEqual(['applied', 'rejected', 'rejected', 'rejected']);
        expect(result.snapshot.states.atri_lifecycle.domains.hypotheses.records).toHaveLength(1);
        expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test('S19 authored second-order shares the original pass with first-order, emotion and relationship without reading the target mind', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { maxDepth: 2 }); await f.ready(); const queued = await f.queue(), payload = tomCandidate(f, 2);
        payload.updates = appraisalCandidate(f).updates;
        const r = await runtime(h, f, payload), result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.results[0].authorityReceipt.applied).toBe(4); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const states = result.snapshot.states.atri_lifecycle.domains;
        expect(states.hypotheses.records[1].value.perspective).toEqual([f.otherActorId, f.actorId]);
        expect(states.hypotheses.records.every(record => record.value.actor === f.actorId)).toBe(true);
        expect(states.beliefs).toEqual(queued.states.atri_lifecycle.domains.beliefs); expect(result.snapshot.manifest.actors).toEqual(queued.manifest.actors);
        const delivered = r.fetchImpl.mock.calls[0]; expect(delivered[1].body).not.toContain('沈墨怀疑有人跟踪自己');
        const task = queued.manifest.runtime.experienceContract.taskRuntime.tasks[0], variant = task.variants[0];
        const preview = await r.host.execute(h.handle, { role: 'narrator', sessionId: result.snapshot.session.sessionId, revisionId: result.snapshot.revision.revisionId, requestId: 's19-task-context',
            outputContract: { name: 'atria_task', schema: variant.outputSchema } }, undefined, undefined, { preview: true, taskPlan: { task, variant, slot: queued.manifest.runtime.experienceContract.taskRuntime.slots[0], payload: { eventItemId: 'events:contact' } } });
        expect(JSON.stringify(preview.snapshot.contextPlan)).not.toContain('沈墨怀疑有人跟踪自己');
        expect(JSON.stringify(preview.snapshot.contextPlan)).toContain('Theory of Mind belongs only');
        expect((await r.host.executeLifecycle(h.handle, r.input(result.snapshot))).results).toEqual([]); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test.each(['nodes', 'updates'])('S19 %s policy bounds separately adopted nodes in the same shared result', async limit => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { maxDepth: 2, maxNodes: limit === 'nodes' ? 1 : 4, maxUpdates: limit === 'updates' ? 1 : 4 });
        await f.ready(); const queued = await f.queue(), r = await runtime(h, f, tomCandidate(f, 2));
        const result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.results[0].authorityReceipt.decisions.map(item => item.status)).toEqual(['applied', 'rejected']);
        expect(result.snapshot.states.atri_lifecycle.domains.hypotheses.records).toHaveLength(1); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test('S19 real authorized behavior challenges the forecast in a bounded read without rewriting raw state or scheduling another call', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { publicHypotheses: true }); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
        const result = await r.host.executeLifecycle(h.handle, r.input(queued)), raw = structuredClone(result.snapshot.states.atri_lifecycle.domains.hypotheses.records[0].value);
        const behavior = result.snapshot.states.atri_lifecycle.domains.behaviors.records[0].value;
        const read = snapshot => projectInformation(snapshot, 'actor', { purpose: 'context' }).items.find(item => item.sourceId === 'hypotheses');
        expect(read(result.snapshot).cognition.prediction).toBe('unknown');
        const unknown = await write(h, f, 'behaviors', 'next', { ...behavior, observed: false, action: 'withhold' });
        expect(read(unknown).cognition).toMatchObject({ status: 'active', prediction: 'unknown' });
        const matched = await write(h, f, 'behaviors', 'next', { ...behavior, observed: true, action: 'share', text: '沈墨继续澄清。' });
        expect(read(matched).cognition).toMatchObject({ status: 'active', prediction: 'matched' });
        const contradicted = await write(h, f, 'behaviors', 'next', { ...behavior, observed: true, action: 'withhold', text: '沈墨没有继续补充说明，阿岚观察到了这一行为。' });
        expect(read(contradicted).cognition).toMatchObject({ status: 'contradicted', sourceCurrent: true, prediction: 'contradicted' }); expect(read(contradicted).data.confidence).toBe(0);
        expect(contradicted.states.atri_lifecycle.domains.hypotheses.records[0].value).toEqual(raw);
        expect((await r.host.executeLifecycle(h.handle, r.input(contradicted))).results).toEqual([]); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const display = projectInformation(contradicted, 'player', { purpose: 'display' }).items.find(item => item.semantic === 'theory_of_mind');
        expect(display.data).toEqual({ text: raw.text }); expect(display.cognition.status).toBe('contradicted');
    } finally { await h.cleanup(); }
});

test('S19 private behavior cannot leak a contradiction or private confidence through a text-only disclosure', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { publicHypotheses: true, publicBehavior: false }); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
        const result = await r.host.executeLifecycle(h.handle, r.input(queued));
        const behavior = result.snapshot.states.atri_lifecycle.domains.behaviors.records[0].value;
        const current = await write(h, f, 'behaviors', 'next', { ...behavior, observed: true, action: 'withhold', text: 'Private observed behavior' });
        const actor = projectInformation(current, 'actor', { purpose: 'context' }).items.find(item => item.sourceId === 'hypotheses');
        const publicItem = projectInformation(current, 'player', { purpose: 'display' }).items.find(item => item.semantic === 'theory_of_mind');
        expect(actor.cognition.status).toBe('contradicted'); expect(publicItem.cognition).toMatchObject({ status: 'active', prediction: 'unknown' });
        expect(publicItem.data).toEqual({ text: actor.data.text }); expect(JSON.stringify(publicItem)).not.toContain('confidence'); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test('S19 ToM declaration closes policy, behavior authority and flat schemas while leaving old schema optional', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h), valid = f.current().manifest.runtime.experienceContract;
        expect(() => assertNativeExperienceContract(valid)).not.toThrow();
        for (const alter of [
            c => { c.informationRuntime.sources.find(source => source.id === 'hypotheses').hypothesisPolicy.maxDepth = 3; },
            c => { c.informationRuntime.sources.find(source => source.id === 'hypotheses').hypothesisPolicy.maxNodes = 17; },
            c => { c.informationRuntime.sources.find(source => source.id === 'hypotheses').hypothesisPolicy.maxUpdates = 9; },
            c => { c.informationRuntime.sources.find(source => source.id === 'public-hypotheses').hypothesisPolicy = { ...c.informationRuntime.sources.find(source => source.id === 'public-hypotheses').hypothesisPolicy, revision: 'v2' }; },
            c => { c.informationRuntime.sources.find(source => source.id === 'hypotheses').hypothesisPolicy.behaviorSourceIds = ['beliefs']; },
            c => { c.taskRuntime.tasks[0].variants[0].outputSchema.properties.hypotheses.items.properties.perspective.maxItems = 3; },
        ]) { const c = structuredClone(valid); alter(c); expect(() => assertNativeExperienceContract(c)).toThrow(); }
    } finally { await h.cleanup(); }
});

test('S19 author adoption rejects foreign/self/model provenance and mutable perspective, with an exact-view positive control', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { maxDepth: 2 }), base = f.current();
        const value = authored(base);
        for (const bad of [
            { ...value, target: 'actor_' + 'f'.repeat(32), perspective: ['actor_' + 'f'.repeat(32)] },
            { ...value, target: f.actorId, perspective: [f.actorId] },
            { ...value, appraisal: { ...value.appraisal, origin: 'model' } },
            { ...value, policy: { ...value.policy, revision: 'v2' } },
        ]) await expect(write(h, f, 'hypotheses', 'author-node', bad)).rejects.toThrow();
        expect((await f.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
        const accepted = await write(h, f, 'hypotheses', 'author-node', value);
        const updated = authored(accepted), previous = accepted.states.atri_lifecycle.domains.hypotheses.records[0].value;
        updated.appraisal.previousHash = hashNativeDocument(previous); updated.perspective = [f.otherActorId, f.actorId];
        await expect(write(h, f, 'hypotheses', 'author-node', updated)).rejects.toThrow(/subject is immutable/);
        const changed = { ...updated, perspective: [f.otherActorId], confidence: 30 };
        const next = await write(h, f, 'hypotheses', 'author-node', changed);
        expect(next.states.atri_lifecycle.domains.hypotheses.records[0].value.confidence).toBe(30);
        expect(next.states.atri_world_state).toEqual(base.states.atri_world_state);
    } finally { await h.cleanup(); }
});

test('S19 withdrawn nodes still occupy capacity; original Save restoration preserves authored values and rebases authorized source support', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { maxNodes: 1 }); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
        const result = await r.host.executeLifecycle(h.handle, r.input(queued)), base = result.snapshot, raw = structuredClone(base.states.atri_lifecycle.domains.hypotheses.records[0]);
        const save = await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId });
        const revised = await write(h, f, 'events', 'contact', { ...base.states.atri_lifecycle.domains.events.records[0].value, text: '原澄清记录已被修订。' });
        expect(projectInformation(revised, 'actor', { purpose: 'context' }).items.find(item => item.sourceId === 'hypotheses').cognition.status).toBe('stale');
        const withdrawn = await write(h, f, 'hypotheses', raw.id, { ...raw.value, status: 'withdrawn' });
        expect(projectInformation(withdrawn, 'actor', { purpose: 'context' }).items.find(item => item.sourceId === 'hypotheses').cognition.status).toBe('withdrawn');
        await expect(write(h, f, 'hypotheses', 'next-node', authored(withdrawn, 'next-node'))).rejects.toThrow(/node capacity/);
        const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: withdrawn.revision.revisionId });
        expect(restored.states.atri_lifecycle.domains.hypotheses.records[0]).toEqual({ ...raw, value: { ...raw.value,
            basis: { ...raw.value.basis, anchor: { ...raw.value.basis.anchor, branchId: restored.revision.branchId, revisionId: restored.revision.revisionId } } } });
        expect(projectInformation(restored, 'actor', { purpose: 'context' }).items.find(item => item.sourceId === 'hypotheses').cognition.status).toBe('active');
        expect((await services(h).core.runs.status(h.handle, base.session.sessionId)).retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 150 });
        expect((await r.host.executeLifecycle(h.handle, r.input(restored))).results).toEqual([]); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test('S19 behavior proof changes before send keep the original intent pending; a late change rejects adoption but retains the paid attempt', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
        const behavior = queued.states.atri_lifecycle.domains.behaviors.records[0].value;
        const changed = await write(h, f, 'behaviors', 'next', { ...behavior, observed: true, action: 'withhold' });
        const result = await r.host.executeLifecycle(h.handle, r.input(changed));
        expect(result.pending.reason).toBe('appraisal_event_or_state_stale'); expect(r.fetchImpl).not.toHaveBeenCalled();
        const task = queued.manifest.runtime.experienceContract.taskRuntime.tasks[0], variant = task.variants[0], revised = structuredClone(queued);
        revised.manifest.runtime.experienceContract.informationRuntime.sources.find(source => source.id === 'hypotheses').hypothesisPolicy.revision = 'v2';
        expect(appraisalEventCurrent(revised, queued.states.atri_lifecycle.outbox[0], task, variant).status).toBe('pending');
    } finally { await h.cleanup(); }
    const late = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(late); await f.ready(); const queued = await f.queue();
        const r = await runtime(late, f, tomCandidate(f), async () => { await write(late, f, 'behaviors', 'next', { ...queued.states.atri_lifecycle.domains.behaviors.records[0].value, observed: true, action: 'withhold' }); });
        await expect(r.host.executeLifecycle(late.handle, r.input(queued))).rejects.toThrow(); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const current = await f.core.load(late.handle, queued.session.sessionId), bank = await services(late).core.runs.status(late.handle, queued.session.sessionId);
        expect(current.states.atri_lifecycle.domains.hypotheses.records).toEqual([]);
        expect(Object.values(bank.operations).find(op => op.compute?.attempts.length).compute.attempts).toHaveLength(1);
        expect((await r.host.executeLifecycle(late.handle, r.input(current))).pending).toBeDefined(); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await late.cleanup(); }
});

test('S19 first-pass empty-state Task receives mandatory interpretation/limits and cannot drop it to fit a tiny budget', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { maxDepth: 2 }); await f.ready(); const queued = await f.queue(), r = await runtime(h, f);
        const task = queued.manifest.runtime.experienceContract.taskRuntime.tasks[0], variant = task.variants[0];
        const preview = await r.host.execute(h.handle, { role: 'narrator', sessionId: queued.session.sessionId, revisionId: queued.revision.revisionId, requestId: 's19-empty-state',
            outputContract: { name: 'atria_task', schema: variant.outputSchema } }, undefined, undefined, { preview: true, taskPlan: { task, variant, slot: queued.manifest.runtime.experienceContract.taskRuntime.slots[0], payload: { eventItemId: 'events:contact' } } });
        const policy = preview.snapshot.contextPlan.items.find(item => item.id === 'projection:policy:cognition');
        expect(policy.content).toContain('Theory of Mind belongs only'); expect(policy.content).toContain('"maxDepth":2');
        expect(JSON.stringify(preview.snapshot.contextPlan)).not.toContain('沈墨怀疑有人跟踪自己'); expect(r.fetchImpl).not.toHaveBeenCalled();
        await expect(compileNativeContextPlan(queued, { modelContextLimit: 16000, responseReserve: 512, laneCaps: { current_state_event: 1 } })).rejects.toMatchObject({ code: 'native_context_hard_reserve_overflow' });
    } finally { await h.cleanup(); }
});

test('S19 invalid behavioral predictions, self/foreign subjects and duplicate keys cannot widen a shared pass', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h, { maxUpdates: 8 }); await f.ready(); const queued = await f.queue(), payload = tomCandidate(f), good = payload.hypotheses[0];
        payload.hypotheses = [
            { ...good, prediction: { itemId: 'behaviors:next', expected: 'teleport' } },
            good,
            { ...good, key: 'peer', prediction: { itemId: 'hypotheses:share-next', expected: 'share' } },
            { ...good, key: 'self', perspective: [f.actorId] },
            { ...good, key: 'foreign', perspective: ['actor_' + 'f'.repeat(32)] },
            good,
        ];
        const r = await runtime(h, f, payload), result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.results[0].authorityReceipt.decisions.map(item => item.status)).toEqual(['rejected', 'applied', 'rejected', 'rejected', 'rejected', 'rejected']);
        expect(result.snapshot.states.atri_lifecycle.domains.hypotheses.records).toHaveLength(1); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
});

test('S19 explicitly simplified wire schema retains original strict Task validation and settled fees for a bad confidence', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installTomFixture(h); await f.ready(); const queued = await f.queue(), payload = tomCandidate(f); payload.hypotheses[0].confidence = 101;
        const r = await runtime(h, f, payload, null, 'shape-only');
        await expect(r.host.executeLifecycle(h.handle, r.input(queued))).rejects.toThrow(); expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const wire = JSON.parse(r.fetchImpl.mock.calls[0][1].body).response_format.json_schema.schema;
        expect(wire.properties.hypotheses.items.properties.confidence).toEqual({ type: 'integer' });
        expect(wire.properties.hypotheses.items.additionalProperties).toBe(false);
        expect(queued.manifest.runtime.experienceContract.taskRuntime.tasks[0].variants[0].outputSchema.properties.hypotheses.items.properties.confidence.maximum).toBe(100);
        const current = await f.core.load(h.handle, queued.session.sessionId), bank = await f.core.runs.status(h.handle, queued.session.sessionId);
        expect(current.states.atri_lifecycle.domains.hypotheses.records).toEqual([]); expect(current.revision.revisionId).toBe(queued.revision.revisionId);
        expect(Object.values(bank.operations).find(op => op.compute?.attempts.length).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 150 } });
    } finally { await h.cleanup(); }
});
