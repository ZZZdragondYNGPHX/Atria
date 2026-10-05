import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import { createNativeId } from '../../src/native/identity.js';

describe('EntryPoints source JSON and real Session startup boundary (FS)', () => {
    let h;
    beforeEach(async () => { h = await makeTempFsEngineHarness(); });
    afterEach(async () => { await h.cleanup(); });
    test('world-less nested state and initial message metadata remain exact through startup and reload', async () => {
        const fixture = sessionFixture(), entry = fixture.manifest.entryPoints[0];
        entry.worldIds = []; delete entry.primaryWorldId;
        entry.initialStateOverlay = { nested: { values: [null, false, 3] } };
        entry.initialTimeline[0].metadata = { opaque: { values: [null, true, 4] } };
        const f = await installFixture(h, fixture); const view = await f.core.create(h.handle, f.start);
        expect(view.states.atri_world_state).toEqual({ primaryWorldId: null, worlds: {}, initialState: entry.initialStateOverlay });
        expect(view.timeline[0]).toMatchObject({ content: 'Opening', metadata: entry.initialTimeline[0].metadata });
        expect((await f.core.load(h.handle, view.session.sessionId)).timeline).toEqual(view.timeline);
    });
    test('single World fallback and multi-World primary/shallow overlay preserve original consumers', async () => {
        const fixture = sessionFixture(), entry = fixture.manifest.entryPoints[0];
        delete entry.primaryWorldId;
        const single = await installFixture(h, fixture), one = await single.core.create(h.handle, single.start);
        expect(one.states.atri_world_state.primaryWorldId).toBe(fixture.worldId);
        const next = sessionFixture(), first = next.manifest.worlds[0];
        const worldId = createNativeId('world'), worldRevisionId = createNativeId('worldRevision');
        next.manifest.worlds.push({ world: { worldId, displayName: 'Second', currentRevisionId: worldRevisionId }, revision: { ...first.revision, worldId, worldRevisionId, baseline: { hp: 12, nested: { old: true } } } });
        const e = next.manifest.entryPoints[0]; e.worldIds.push(worldId); delete e.primaryWorldId; e.initialStateOverlay = { nested: { replaced: true } };
        const invalid = await installFixture(h, next); await expect(invalid.core.create(h.handle, invalid.start)).rejects.toThrow(/multi-World/);
        next.manifest.packageId = createNativeId('package'); next.manifest.packageVersionId = createNativeId('packageVersion'); e.primaryWorldId = worldId;
        const valid = await installFixture(h, next), two = await valid.core.create(h.handle, valid.start);
        expect(two.states.atri_world_state.worlds[worldId].state).toEqual({ hp: 12, nested: { replaced: true } });
        expect(two.states.atri_world_state.worlds[first.world.worldId].state).toEqual(first.revision.baseline);
    });
    test('source-valid overlay/timeline shapes and protected metadata fail at startup instead of being silently repaired', async () => {
        for (const patch of [{ initialStateOverlay: [] }, { initialStateOverlay: false }, { initialTimeline: {} },
            { initialTimeline: [{ role: 'assistant', content: 'Bad identity', metadata: { atri_player_identity: {} } }] },
            { initialTimeline: [{ role: 'assistant', content: 'Bad diagnostics', metadata: { atri_turn_diagnostics: [] } }] }]) {
            const fixture = sessionFixture(); Object.assign(fixture.manifest.entryPoints[0], patch);
            const f = await installFixture(h, fixture); await expect(f.core.create(h.handle, f.start)).rejects.toThrow();
        }
        expect(await (await installFixture(h)).sessionRepo.list(h.handle)).toEqual([]);
    });
    test('null and missing optional startup values retain the original default behavior', async () => {
        for (const patch of [{ initialStateOverlay: null, initialTimeline: null }, {}]) {
            const fixture = sessionFixture(); const entry = fixture.manifest.entryPoints[0];
            delete entry.initialStateOverlay; delete entry.initialTimeline; Object.assign(entry, patch);
            const f = await installFixture(h, fixture), view = await f.core.create(h.handle, f.start);
            expect(view.timeline).toEqual([]); expect(view.states.atri_world_state.worlds[fixture.worldId].state).toEqual(fixture.manifest.worlds[0].revision.baseline);
        }
    });
});
