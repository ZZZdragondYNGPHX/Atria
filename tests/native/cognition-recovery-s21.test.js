import { expect, jest, test } from '@jest/globals';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installMemoryFixture } from './helpers/memory-fixture.js';
import { services } from './helpers/session-fixture.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { buildAtriaSaveContainer, inspectAtriaSaveContainer, createNativeId } from '../../src/native/index.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const harnesses = [['fs', makeTempFsEngineHarness, FsEngine], ['sqlite', makeTempSqliteEngineHarness, SqliteEngine]];
const projection = snapshot => projectInformation(snapshot, 'actor', { purpose: 'context', includeRollups: false });
const item = (snapshot, id) => projection(snapshot).items.find(value => value.id === id);
const cost = control => {
    const retired = control?.retiredCompute ?? {}, total = {
        modelAttempts: retired.modelAttempts ?? 0, knownTotalTokens: retired.knownTotalTokens ?? 0,
        unknownAttempts: retired.unknownAttempts ?? 0, unknownUpperTokens: retired.unknownUpperTokens ?? 0,
        localJobs: retired.localJobs ?? 0, localWallMs: retired.localWallMs ?? 0,
    };
    for (const op of Object.values(control?.operations ?? {})) {
        for (const row of op.compute?.attempts ?? []) {
            total.modelAttempts++;
            if (row.status === 'settled') total.knownTotalTokens += row.usage.totalTokens;
            else { total.unknownAttempts++; total.unknownUpperTokens += row.estimatedTokens; }
        }
        for (const row of op.compute?.localWork ?? []) { total.localJobs++; total.localWallMs += row.usage?.wallMs ?? 0; }
    }
    return total;
};
async function chargeSyntheticWork(h, core, snapshot, suffix) {
    const anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId },
        limits = { maxRequests: 2, maxTokens: 32000, localWork: { maxJobs: 2, maxItems: 10, maxInputBytes: 4096 } },
        attempt = { attemptId: 's21-model-' + suffix, requestId: 's21-request-' + suffix, targetFingerprint: 'a'.repeat(64), estimatedTokens: 100 };
    const model = await core.runs.chargeCompute(h.handle, snapshot, anchor, limits, attempt);
    await core.runs.settleCompute(h.handle, snapshot.session.sessionId, model.operation, attempt.attemptId, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    const unknown = { ...attempt, attemptId: 's21-unknown-' + suffix, requestId: 's21-unknown-request-' + suffix };
    const pending = await core.runs.chargeCompute(h.handle, snapshot, anchor, limits, unknown);
    await core.runs.settleCompute(h.handle, snapshot.session.sessionId, pending.operation, unknown.attemptId, { inputTokens: 1, outputTokens: 1 });
    const local = { attemptId: 's21-local-' + suffix, requestId: 's21-local-request-' + suffix, targetFingerprint: 'a'.repeat(64), kind: 'memory_rank', estimatedItems: 2, estimatedInputBytes: 80 };
    const job = await core.runs.chargeLocalWork(h.handle, snapshot, anchor, limits, local);
    await core.runs.settleLocalWork(h.handle, snapshot.session.sessionId, job.operation, local.attemptId,
        { wallMs: 2, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' });
}
async function scenario(h, mode = 'light') {
    const f = await installMemoryFixture(h, { mode }); await f.ready();
    await f.appraise();
    const base = await f.load(), domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(value => value.id === 'relations');
    await f.write('relations', 'trust', { text: '阿岚对沈墨仍有保留，但愿意继续交往。', dimension: 'trust', level: -5, rationale: '直接澄清仍不足以排除误会。',
        basis: await f.basis(['events:contact']), appraisal: { ...domain.initial.appraisal, previousHash: hashNativeDocument(domain.initial) } });
    for (const role of ['identity', 'commitment', 'relationship', 'key_event']) await f.memory(role, { role });
    await f.memory('detail', mode === 'deep' ? { clarity: 'forgotten', use: 'unavailable' } : {});
    await f.write('intentions', 'return-book', { text: '阿岚准备在被问到时归还书。', commitmentIds: ['loops:promise'], basis: await f.basis(['experiences:commitment', 'loops:promise']) });
    await f.write('actions', 'acknowledge', { text: '阿岚确认这项承诺仍待履行。', basis: await f.basis(['intentions:return-book']) });
    return f;
}
async function advance(h, f, ticks = 3) {
    const base = await f.load();
    return f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 's21-tick-' + base.revision.revisionId,
        action: { kind: 'clock.advance', commandId: 'advance', ticks } }, { expectedRevisionId: base.revision.revisionId });
}
function assertPrivateBoundaries(snapshot) {
    const player = JSON.stringify(projectInformation(snapshot, 'player'));
    expect(player).not.toContain('阿岚私下曾犹豫是否履约。');
    expect(player).not.toContain('沈墨怀疑有人跟踪自己。');
    expect(player).not.toContain('recordedAt');
    expect(player).not.toContain('fingerprint');
    expect(item(snapshot, 'beliefs:rumor').epistemicStatus).toBe('suspected');
    expect(snapshot.states.atri_lifecycle.domains.loops.records.find(row => row.id === 'promise').value.status).toBe('open');
}
async function installExact(h, target, f, snapshot) {
    const svc = services(target), archive = await f.assetStore.readBlob(h.handle, snapshot.session.packageContentHash);
    await svc.packageInstaller.install(target.handle, archive);
    return svc;
}
function reopen(h, Engine) {
    h.engine.close?.();
    const engine = new Engine({ directoriesByHandle: handle => { if (handle !== h.handle) throw new Error('Unexpected handle'); return h.dirs; } });
    return { ...services(h, engine), engine };
}

test('S21 a legitimate long Session recovers its bounded visible memories without repeatedly exhausting the source scan budget', async () => {
    const h = await makeTempSqliteEngineHarness();
    try {
        const f = await installMemoryFixture(h, { configure: ({ fixture, contract, actorId }) => {
            fixture.manifest.entryPoints[0].initialTimeline.push(...Array.from({ length: 700 }, (_, i) => ({ role: 'assistant', actorId, content: '获准的历史记录 ' + i })));
            const actor = contract.informationRuntime.views.find(view => view.id === 'actor');
            actor.sources = ['experiences', ...actor.sources.filter(source => source !== 'experiences')];
        } });
        await f.ready();
        for (let i = 0; i < 24; i++) await f.memory('long-' + i, { role: 'commitment' });
        const base = await f.load();
        expect(projection(base).items.filter(value => value.sourceId === 'experiences' && value.memory.status === 'active')).toHaveLength(24);
        const recovered = await f.core.restoreSavePoint(h.handle, base.session.sessionId, (await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId })).saveId, { expectedRevisionId: base.revision.revisionId });
        expect(recovered.revision.branchId).not.toBe(base.revision.branchId);
        expect(projection(recovered).items.filter(value => value.sourceId === 'experiences' && value.memory.status === 'active')).toHaveLength(24);
        expect((await f.core.load(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId })).states).toEqual(base.states);
    } finally { await h.cleanup(); }
}, 30000);

test('S21 recovery preserves managed Memory exception evidence when an authorized causal source exposes its basis', async () => {
    const h = await makeTempSqliteEngineHarness();
    try {
        const f = await installMemoryFixture(h, { configure: ({ contract }) => {
            contract.informationRuntime.sources.find(source => source.id === 'actions').fields.push(['basis']);
        } });
        await f.ready();
        const ready = await f.load();
        await f.write('actions', 'acted', { text: '阿岚确认仍会履约。', basis: await f.basis(['history:' + ready.timeline[0].messageId]) });
        const basis = await f.basis(['actions:acted']);
        const base = await f.memory('conditional', { applicability: { goalId: '', until: 0, exceptionRefs: basis.sourceRefs } }, ['actions:acted']);
        expect(item(base, 'experiences:conditional').memory.applicability).toBe('applicable');
        const recovered = await f.core.restoreSavePoint(h.handle, base.session.sessionId, (await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId })).saveId, { expectedRevisionId: base.revision.revisionId });
        expect(item(recovered, 'experiences:conditional').memory).toMatchObject({ status: 'active', applicability: 'applicable' });
        expect(item(recovered, 'actions:acted').causality.sourceCurrent).toBe(true);
        expect((await f.core.load(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId })).states).toEqual(base.states);
    } finally { await h.cleanup(); }
});

test('S21 multiple Actor long views retain their own authorized memories within the original per-view scan limits', async () => {
    const h = await makeTempSqliteEngineHarness(); let actorViews;
    try {
        const f = await installMemoryFixture(h, { configure: ({ fixture, contract, actorId, otherActorId }) => {
            fixture.manifest.entryPoints[0].initialTimeline.push(...Array.from({ length: 2100 }, (_, i) => ({ role: 'assistant', actorId, content: '获准的共享历史记录 ' + i })));
            const info = contract.informationRuntime, actorView = info.views.find(view => view.id === 'actor');
            actorViews = [{ actorId, viewId: 'actor' }, { actorId: otherActorId, viewId: 'other-actor' }];
            for (let i = 0; i < 6; i++) {
                const id = createNativeId('actor'), viewId = 'long-actor-' + i;
                fixture.manifest.actors.push({ actorId: id, displayName: '长期角色 ' + i });
                fixture.manifest.entryPoints[0].actorIds.push(id);
                info.actors.push({ id, scopeId: 'session' });
                info.views.push({ ...structuredClone(actorView), id: viewId, actorId: id });
                actorViews.push({ actorId: id, viewId });
            }
            for (const view of info.views.filter(view => view.exposure.includes('context'))) view.sources = ['experiences', ...view.sources.filter(source => source !== 'experiences')];
        } });
        await f.ready();
        for (const [index, grant] of actorViews.entries()) {
            const current = await f.load(), selected = projectInformation(current, grant.viewId, { purpose: 'context', includeRollups: false }),
                history = selected.items.find(value => value.id === 'history:' + current.timeline[0].messageId);
            await f.write('experiences', 'actor-' + index, { actor: grant.actorId, text: '此角色独有的长期承诺 ' + index, role: 'commitment',
                basis: { viewId: grant.viewId, anchor: selected.anchor, sourceRefs: [{ itemId: history.id, fingerprint: informationItemFingerprint(history) }] } });
        }
        const base = await f.load(), recovered = await f.core.restoreSavePoint(h.handle, base.session.sessionId, (await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId })).saveId, { expectedRevisionId: base.revision.revisionId });
        for (const [index, grant] of actorViews.entries()) {
            const selected = projectInformation(recovered, grant.viewId, { purpose: 'context', includeRollups: false }), memories = selected.items.filter(value => value.sourceId === 'experiences');
            expect(memories).toHaveLength(1);
            expect(memories[0]).toMatchObject({ id: 'experiences:actor-' + index, actorId: grant.actorId, memory: { status: 'active', sourceCurrent: true, clarity: 'clear', use: 'willing' } });
        }
        expect((await f.core.load(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId })).states).toEqual(base.states);
    } finally { await h.cleanup(); }
}, 30000);

for (const faultKind of ['runControl', 'session']) test(`S21 FS portable import ${faultKind} write failure leaves no visible Session and retries with all original costs`, async () => {
    const h = await makeTempFsEngineHarness(), target = await makeTempFsEngineHarness();
    try {
        const f = await scenario(h), base = await f.load(), sessionId = base.session.sessionId;
        await chargeSyntheticWork(h, f.core, base, 'fs-fault-' + faultKind);
        const expectedCost = cost(await f.core.runs.status(h.handle, sessionId)), exported = await f.saveSystem.exportSession(h.handle, sessionId),
            svc = await installExact(h, target, f, base), original = target.engine.withTransaction.bind(target.engine);
        let injected = false;
        const fault = jest.spyOn(target.engine, 'withTransaction').mockImplementation((handle, operation) => original(handle, async originalTx => {
            const tx = Object.create(originalTx);
            const put = tx.putResourceIfMatch.bind(tx);
            tx.putResourceIfMatch = async (key, ...args) => {
                if (!injected && key.kind === K[faultKind] && key.sessionId === sessionId) {
                    injected = true; throw new Error('S21 injected portable ' + faultKind + ' write failure');
                }
                return put(key, ...args);
            };
            return operation(tx);
        }));
        await expect(svc.saveSystem.importSave(target.handle, exported.archive)).rejects.toThrow('S21 injected portable ' + faultKind + ' write failure');
        expect(injected).toBe(true);
        expect(await svc.sessionRepo.get(target.handle, sessionId)).toBeNull();
        fault.mockRestore();
        expect(cost(await svc.core.runs.status(target.handle, sessionId))).toEqual(cost(null));
        const imported = await svc.saveSystem.importSave(target.handle, exported.archive);
        expect(projection(imported)).toEqual(projection(base));
        expect(cost(await svc.core.runs.status(target.handle, sessionId))).toEqual(expectedCost);
    } finally { jest.restoreAllMocks(); await target.cleanup(); await h.cleanup(); }
});

for (const [kind, make, Engine] of harnesses) {
    test(`S21 ${kind} portable charged attempt stays unknown and an older archive cannot overwrite independent local costs`, async () => {
        const h = await make(), target = await make();
        try {
            const f = await scenario(h), base = await f.load(), sessionId = base.session.sessionId,
                anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, limits = { maxRequests: 1, maxTokens: 100 },
                attempt = { attemptId: 's21-interrupted', requestId: 's21-interrupted-request', targetFingerprint: 'a'.repeat(64), estimatedTokens: 100 };
            await f.core.runs.chargeCompute(h.handle, base, anchor, limits, attempt);
            const exported = await f.saveSystem.exportSession(h.handle, sessionId), svc = await installExact(h, target, f, base);
            const imported = await svc.saveSystem.importSave(target.handle, exported.archive);
            const importedControl = await svc.core.runs.status(target.handle, sessionId);
            expect(cost(importedControl)).toMatchObject({ modelAttempts: 1, knownTotalTokens: 0, unknownAttempts: 1, unknownUpperTokens: 100 });
            expect(Object.values(importedControl.operations).flatMap(op => op.compute?.attempts ?? [])).toContainEqual(expect.objectContaining({ attemptId: attempt.attemptId, status: 'charged', usage: null }));
            await expect(svc.core.runs.chargeCompute(target.handle, imported, anchor, limits, { ...attempt, attemptId: 's21-second' })).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            await f.core.runs.settleCompute(h.handle, sessionId, hashNativeDocument({ lane: 'turn', anchor }), attempt.attemptId, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
            const localBefore = await f.core.runs.status(h.handle, sessionId);
            await expect(f.saveSystem.importSave(h.handle, exported.archive)).rejects.toMatchObject({ code: 'native_run_continuation_conflict' });
            expect(await f.core.runs.status(h.handle, sessionId)).toEqual(localBefore);
            expect((await f.load()).revision.revisionId).toBe(base.revision.revisionId);
        } finally { await target.cleanup(); await h.cleanup(); }
    });

    test(`S21 ${kind} original schema 1 ordinary Save remains readable without manufacturing missing cost evidence`, async () => {
        const h = await make(), target = await make();
        try {
            const f = await scenario(h), base = await f.load(), exported = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
            const inspected = inspectAtriaSaveContainer(exported.archive), legacy = structuredClone(inspected.save);
            delete legacy.runContinuation; legacy.schemaVersion = 1;
            const archive = buildAtriaSaveContainer({ save: legacy, assetPayloads: inspected.assets }).archive;
            const svc = await installExact(h, target, f, base), imported = await svc.saveSystem.importSave(target.handle, archive);
            expect(projection(imported)).toEqual(projection(base));
            expect(inspectAtriaSaveContainer(archive).save.runContinuation).toBeUndefined();
            const control = await svc.core.runs.status(target.handle, imported.session.sessionId);
            expect(control?.retiredCompute).toBeUndefined();
            expect(Object.values(control?.operations ?? {}).some(op => op.compute)).toBe(false);
        } finally { await target.cleanup(); await h.cleanup(); }
    });

    test(`S21 ${kind} repeated original forks preserve current sources while stale withdrawal and foreign Actor grants stay closed`, async () => {
        const h = await make();
        try {
            const f = await scenario(h), initial = await f.load(), sessionId = initial.session.sessionId;
            for (let i = 0; i < 2; i++) {
                const base = await f.load(), forked = await f.core.restoreSavePoint(h.handle, sessionId, (await f.core.createSavePoint(h.handle, sessionId, { expectedRevisionId: base.revision.revisionId })).saveId, { expectedRevisionId: base.revision.revisionId });
                expect(item(forked, 'intentions:return-book').cognition).toMatchObject({ status: 'active', sourceCurrent: true, selection: 'current' });
                expect(item(forked, 'actions:acknowledge').causality.sourceCurrent).toBe(true);
                expect(item(forked, 'experiences:commitment').memory.status).toBe('active');
                assertPrivateBoundaries(forked);
            }
            const afterForks = await f.load();
            await expect(f.write('intentions', 'foreign', { actor: f.otherActorId, commitmentIds: [], basis: await f.basis(['experiences:commitment']) })).rejects.toThrow(/Actor|grant/);
            expect((await f.load()).revision.revisionId).toBe(afterForks.revision.revisionId);
            const relation = afterForks.states.atri_lifecycle.domains.relations.records.find(row => row.id === 'trust').value;
            await f.write('relations', 'trust', { ...relation, status: 'withdrawn' });
            const stale = await f.write('events', 'contact', { text: '作者修订旧证据使认知解释失效。', importance: 'high' }), save = await f.saveSystem.manualSave(h.handle, sessionId);
            const oldBasis = stale.states.atri_lifecycle.domains.emotions.records.find(row => row.id === 'relief').value.basis;
            await f.memory('later-detail');
            const future = await f.load(), restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId, { expectedRevisionId: future.revision.revisionId });
            expect(item(restored, 'emotions:relief').cognition.status).toBe('stale');
            expect(item(restored, 'relations:trust').cognition.status).toBe('withdrawn');
            expect(restored.states.atri_lifecycle.domains.emotions.records.find(row => row.id === 'relief').value.basis).toEqual(oldBasis);
            expect((await f.core.load(h.handle, sessionId, { revisionId: initial.revision.revisionId })).states).toEqual(initial.states);
            assertPrivateBoundaries(restored);
        } finally { await h.cleanup(); }
    });

    test(`S21 ${kind} original Save rollback retains sourced cognition and irreversible costs on a derived Branch`, async () => {
        const h = await make();
        try {
            const f = await scenario(h), saved = await f.load(), sessionId = saved.session.sessionId;
            const save = await f.saveSystem.manualSave(h.handle, sessionId);
            await chargeSyntheticWork(h, f.core, saved, 'rollback');
            const future = await f.write('events', 'contact', { text: '未来路线中作者修订了澄清证据。', importance: 'high' });
            expect(item(future, 'emotions:relief').cognition.status).toBe('stale');
            const beforeCost = cost(await f.core.runs.status(h.handle, sessionId));
            const restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId, { expectedRevisionId: future.revision.revisionId });
            expect(restored.revision.branchId).not.toBe(saved.revision.branchId);
            expect(item(restored, 'emotions:relief').cognition.status).toBe('active');
            expect(item(restored, 'relations:trust').cognition.status).toBe('active');
            expect(item(restored, 'intentions:return-book').cognition).toMatchObject({ status: 'active', selection: 'current' });
            expect(item(restored, 'actions:acknowledge').causality.sourceCurrent).toBe(true);
            expect(item(restored, 'experiences:commitment').memory).toMatchObject({ status: 'active', clarity: 'clear', use: 'willing' });
            expect(cost(await f.core.runs.status(h.handle, sessionId))).toEqual(beforeCost);
            expect((await f.core.load(h.handle, sessionId, { revisionId: future.revision.revisionId })).states).toEqual(future.states);
            expect((await f.core.load(h.handle, sessionId, { revisionId: saved.revision.revisionId })).states).toEqual(saved.states);
            await expect(f.core.restoreSavePoint(h.handle, sessionId, save.saveId, { expectedRevisionId: future.revision.revisionId })).rejects.toMatchObject({ code: 'native_session_head_conflict' });
            assertPrivateBoundaries(restored);
        } finally { await h.cleanup(); }
    });

    test(`S21 ${kind} actual engine restart retains deep forgetting and source withdrawal without resurrecting private details`, async () => {
        const h = await make(); let fresh;
        try {
            const f = await scenario(h, 'deep'); await advance(h, f);
            const base = await f.load(), relation = base.states.atri_lifecycle.domains.relations.records.find(row => row.id === 'trust').value;
            await f.write('relations', 'trust', { ...relation, status: 'withdrawn' });
            const before = await f.load(); fresh = reopen(h, Engine);
            const after = await fresh.core.load(h.handle, before.session.sessionId);
            expect(after.states).toEqual(before.states);
            expect(projection(after)).toEqual(projection(before));
            expect(item(after, 'experiences:detail').memory).toMatchObject({ clarity: 'forgotten', use: 'unavailable' });
            expect(item(after, 'relations:trust').cognition.status).toBe('withdrawn');
            for (const role of ['identity', 'commitment', 'relationship', 'key_event']) expect(item(after, 'experiences:' + role).memory).toMatchObject({ clarity: 'clear', use: 'willing' });
            assertPrivateBoundaries(after);
        } finally { fresh?.engine.close?.(); await h.cleanup(); }
    });

    for (const scope of ['snapshot', 'session']) test(`S21 ${kind} ${scope} portable export imports cognition and cumulative costs into the other actual engine`, async () => {
        const h = await make(), target = await (kind === 'fs' ? makeTempSqliteEngineHarness : makeTempFsEngineHarness)(); let fresh;
        try {
            const f = await scenario(h), aged = await advance(h, f), sessionId = aged.session.sessionId;
            const save = await f.saveSystem.quickSave(h.handle, sessionId);
            await chargeSyntheticWork(h, f.core, aged, 'portable-' + scope);
            const future = await f.write('events', 'contact', { text: '另一条未来路线改变了旧证据。', importance: 'high' });
            const expected = scope === 'snapshot' ? aged : future, beforeCost = cost(await f.core.runs.status(h.handle, sessionId));
            const exported = scope === 'snapshot' ? await f.saveSystem.exportSnapshot(h.handle, sessionId, save.saveId) : await f.saveSystem.exportSession(h.handle, sessionId);
            const svc = await installExact(h, target, f, expected), imported = await svc.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.timeline).toEqual(expected.timeline);
            expect(imported.states.atri_lifecycle).toEqual(expected.states.atri_lifecycle);
            expect(projection(imported)).toEqual(projection(expected));
            expect(cost(await svc.core.runs.status(target.handle, sessionId))).toEqual(beforeCost);
            assertPrivateBoundaries(imported);
            fresh = reopen(target, kind === 'fs' ? SqliteEngine : FsEngine);
            const restarted = await fresh.core.load(target.handle, sessionId);
            expect(projection(restarted)).toEqual(projection(imported));
            expect(cost(await fresh.core.runs.status(target.handle, sessionId))).toEqual(beforeCost);
            const another = await fresh.saveSystem.exportSession(target.handle, sessionId);
            expect(another.archive.length).toBeGreaterThan(0);
            expect(cost(await fresh.core.runs.status(target.handle, sessionId))).toEqual(beforeCost);
        } finally { fresh?.engine.close?.(); await target.cleanup(); await h.cleanup(); }
    });
}
