import assert from 'node:assert/strict';
import { MAX_INSTANT, stanceChoices } from './long-horizon-compile.mjs';

// Integration evidence only: no Package-side evaluator or fake save serialization.
export async function longHorizonChecks(h) {
    const { svc, fsHandle, manifest, archive, load, makeTempFsEngine, services } = h;
    assert.equal(manifest.version, '2.0.0-phase2');
    await h.fresh(); await h.create();
    let s = h.session(), serial = 0;
    const work = [];
    const value = (state, domain, id = 'main') => state.states.atri_lifecycle.domains[domain].records.find(r => r.id === id)?.value;
    const time = state => value(state, 'chronology');
    const inspect = state => {
        const c = time(state);
        assert.equal(c.tick, state.states.atri_lifecycle.clocks.world, 'single canonical clock');
        assert.equal(c.calendar.day, Math.floor(c.tick / 1440));
        assert.equal(value(state, 'world_matters').day, c.calendar.day);
        assert.equal(value(state, 'world_matters').rent, c.calendar.day * 10);
        assert.equal(c.calendar.season, Math.ceil(c.calendar.month / 3));
        assert.equal(c.calendar.week, Math.floor(c.calendar.day / 7) + 1);
    };
    const execute = async (service, handle, state, transactionId, input) => {
        state = await service.core.appendTimeline(handle, state.session.sessionId, { role: 'user', content: 'Phase 1 foundation: ' + transactionId });
        const p = await service.core.prepareAuthorityTurn(handle, state, { transactionId, input });
        assert.equal(p.prepared.receipt.result.outcome, 'automatic'); work.push(p.prepared.work);
        const next = await service.core.finalizeTurn(handle, state.session.sessionId, { invocationId: 'long-foundation-' + ++serial,
            authorityProof: p.proof, envelope: { schemaVersion: 1, narrative: 'The declared foundation change is recorded.', outcomes: [], diagnostics: [] } },
        { expectedRevisionId: state.revision.revisionId });
        inspect(next); return next;
    };
    const act = async (id, input) => s = await execute(svc, fsHandle, s, id, input);
    const wait = minutes => act('opening.wait', { minutes });
    const origin = structuredClone(value(s, 'continuity'));
    const anchor = structuredClone(value(s, 'entities', 'anchor'));
    assert.equal(anchor.persistent_id, origin.registry.anchor);
    assert.equal(anchor.provenance.stamp.tick, 0);
    assert.equal(anchor.provenance.stamp.sequence, 5);
    assert.equal(origin.public_identity_origin.stamp.sequence, 1);
    assert.equal(time(s).sequence, 6);

    await wait(31 * 1440);
    assert.equal(time(s).calendar.day, 31);
    assert.deepEqual([time(s).calendar.year, time(s).calendar.month, time(s).calendar.day_of_month], [1, 2, 1]);
    assert.equal(value(s, 'world_matters').anchor_missed, true, 'crossed opening deadline aggregated once');
    assert.equal(value(s, 'world_matters').convergence.locked, true);
    assert.equal(time(s).last_interval.steps, 1);
    await act('opening.family', { method: 'ask_with_consent' });
    const ada = structuredClone(value(s, 'entities', 'ada_rook'));
    await act('opening.family', { method: 'ask_with_consent' });
    assert.equal(value(s, 'entities', 'ada_rook').persistent_id, ada.persistent_id);
    assert.deepEqual(value(s, 'entities', 'ada_rook').provenance, ada.provenance, 'repeat contact must not rewrite origin');
    // Schema/API stances are stored, not simulated as family/economy/delegation.
    const stances = Object.fromEntries(Object.entries(stanceChoices).map(([k, choices]) => [k, choices.at(-1)]));
    const beforeStance = time(s).tick;
    await act('opening.wait', { minutes: 0, stances });
    assert.equal(time(s).tick, beforeStance);
    assert.equal(value(s, 'long_term_stance').revision, 1);
    assert.deepEqual(value(s, 'long_term_stance').policy, stances);

    const epoch = new Date(0); epoch.setUTCFullYear(1, 0, 1); epoch.setUTCHours(0, 0, 0, 0);
    const at = (year, month, day, hour = 0, minute = 0) => {
        const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, 0, 0);
        return (d.getTime() - epoch.getTime()) / 60000;
    };
    const dates = [[1, 12, 31, 23, 59], [2, 1, 1], [4, 2, 28], [4, 2, 29], [4, 3, 1], [100, 2, 28], [100, 3, 1], [400, 2, 29], [401, 1, 1]];
    for (const [year, month, day, hour = 0, minute = 0] of dates) {
        const delta = at(year, month, day, hour, minute) - time(s).tick;
        await wait(delta);
        if (delta >= 525600) assert.equal(time(s).last_interval.scale, 5);
        const c = time(s).calendar;
        assert.deepEqual([c.year, c.month, c.day_of_month, c.minute_of_day], [year, month, day, hour * 60 + minute]);
        assert.equal(time(s).last_interval.steps, 1, 'one interval, not daily replay');
    }
    assert.deepEqual(value(s, 'continuity'), origin);
    assert.deepEqual(value(s, 'entities', 'anchor'), anchor, 'no premature NPC aging');
    assert.deepEqual(value(s, 'long_term_stance').policy, stances);
    for (const input of [{ minutes: -1 }, { minutes: 0.5 }, { minutes: MAX_INSTANT + 1 }, { minutes: MAX_INSTANT },
        { minutes: 1, stances: { ...stances, career: 'invented' } }, { minutes: 1, stances: { career: 'maintain' } },
        { minutes: 1, world_id: 'forged' }]) {
        const before = await svc.core.load(fsHandle, s.session.sessionId);
        await assert.rejects(svc.core.prepareAuthorityTurn(fsHandle, s, { transactionId: 'opening.wait', input }));
        assert.deepEqual(await svc.core.load(fsHandle, s.session.sessionId), before, 'failed candidate is atomic');
    }
    await assert.rejects(svc.core.prepareAuthorityTurn(fsHandle, s, { transactionId: 'opening.day', input: { tick: 1, target: 1 } }));
    const save = await svc.saveSystem.manualSave(fsHandle, s.session.sessionId);
    const exported = await svc.saveSystem.exportSnapshot(fsHandle, s.session.sessionId, save.saveId);
    const { makeTempSqliteEngineHarness } = await load('tests/storage/harness/contract-harness.js');
    const restoredEngines = [];
    for (const [label, make] of [['FsEngine', makeTempFsEngine], ['SqliteEngine', makeTempSqliteEngineHarness]]) {
        const target = await make();
        try {
            const next = services(target);
            await next.packageInstaller.install(target.handle, archive, { grantedPermissions: ['generation'] });
            let restored = await next.saveSystem.importSave(target.handle, exported.archive);
            assert.equal(restored.session.sessionId, s.session.sessionId, 'immutable world namespace survives import');
            assert.deepEqual(restored.states, s.states, 'all authoritative namespaces survive real save-container import');
            assert.deepEqual(restored.timeline, s.timeline);
            inspect(restored);
            restored = await execute(next, target.handle, restored, 'opening.wait', { minutes: 5 * 365 * 1440 });
            assert.deepEqual(value(restored, 'continuity'), origin);
            assert.deepEqual(value(restored, 'long_term_stance').policy, stances);
            assert.equal(time(restored).last_interval.steps, 1);
            assert(time(restored).calendar.year >= 405);
            restoredEngines.push(label);
        } finally { await target.cleanup(); }
    }
    // A separate world gets a distinct Native namespace; authored local IDs are reusable templates.
    const priorSession = s.session.sessionId;
    await h.fresh(); await h.create();
    assert.notEqual(h.session().session.sessionId, priorSession);
    assert.equal(value(h.session(), 'continuity').protagonist_id, origin.protagonist_id);
    return { phase: 'Long-Lived World Phase 1', authoritativeTransactions: serial, restoredEngines,
        checks: ['Day 31 is valid', 'Gregorian year/month/leap/century rollover', 'single-step multi-century chronology (not a later release gate)',
            'stable entity/protagonist/public identity and first-introduction provenance', 'persistent stances without lifecycle simulation',
            'atomic invalid/overflow/forged-input refusal', 'full Native save-container equivalence and multi-year continuation'],
        maximumWork: Object.fromEntries(['readGrants', 'appCommands', 'effects'].map(k => [k, Math.max(...work.map(w => w[k]))])),
        gateA: 'foundation regression only; use --history-only for Phase 2 development evidence' };
}
