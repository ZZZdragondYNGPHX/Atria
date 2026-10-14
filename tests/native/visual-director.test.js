import { jest } from '@jest/globals';
import { VisualDirector, scoreVisualShot, detectVisualFrame } from '../../src/native/visual-director.js';
import { VisualContinuity, visualDisclosure } from '../../src/native/visual-continuity.js';
import { informationSnapshot } from './helpers/information-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { setupVisual, visualPng } from './helpers/visual-fixture.js';

test('explainable default weights/thresholds remain soft; dream/flashback frames are distinct', () => {
    const all = { importance: 100, clarity: 100, novelty: 100, continuity: 100, coverage: 100 };
    expect(scoreVisualShot(all).score).toBe(100); expect(scoreVisualShot(all, { penalty: 30 }).score).toBe(70);
    expect(scoreVisualShot(all).weights).toEqual({ importance: .30, clarity: .25, novelty: .20, continuity: .15, coverage: .10 });
    expect(detectVisualFrame('在梦境中战斗')).toBe('dream'); expect(detectVisualFrame('多年以前的回忆')).toBe('flashback');
    const projection = visualDisclosure(informationSnapshot()); expect(JSON.stringify(projection)).not.toContain('WORLD SECRET'); expect(JSON.stringify(projection)).not.toContain('OTHER BELIEF');
});
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('visual Director %s', (_, harness) => {
    let h, x, provider;
    beforeEach(async () => { h = await harness(); provider = { generate: jest.fn(async () => ({ bytes: visualPng, width: 1, height: 1 })) }; x = await setupVisual(h, { provider }); });
    afterEach(async () => h.cleanup());
    test('all formal commit paths produce durable discovery; repeated scans/restart do not send or duplicate shots', async () => {
        const director = new VisualDirector({ host: x.host });
        const first = await director.scan(h.handle, x.view.session.sessionId); expect(first).toHaveLength(1); expect(provider.generate).not.toHaveBeenCalled();
        const next = await x.f.core.appendTimeline(h.handle, x.view.session.sessionId, { role: 'assistant', content: 'Location: harbor\nThe group arrives at the harbor, where a battle erupts and a tower falls.' });
        const shots = await director.scan(h.handle, x.view.session.sessionId); expect(shots).toHaveLength(2);
        expect(await director.store.list(h.handle, 'commit')).toHaveLength(2);
        expect((await new VisualDirector({ host: x.host }).scan(h.handle, next.session.sessionId)).map(s => s.shotId)).toEqual(shots.map(s => s.shotId));
        expect(provider.generate).not.toHaveBeenCalled(); expect((await x.f.core.load(h.handle, next.session.sessionId)).revision).toEqual(next.revision);
    });
    test('future and sibling state changes do not project; confidence and same names are not identity authority', async () => {
        const p = await x.prepare(), continuity = new VisualContinuity({ host: x.host }), source = p.source;
        const character = { id: 'alice', name: 'Alice', aliases: [], fixedPrompt: 'red hair', defaultClothing: 'coat', enabled: true, storyActorId: '' };
        const draft = { ...x.annotation.draft, characters: [{ character, dynamicPrompt: '', clothing: 'coat' }] };
        const proposed = await continuity.propose(h.handle, { source, identity: source.sessionId + ':alice', field: 'clothing', value: 'dress', start: 0, end: 7, quote: 'Opening', confidence: 1, persistent: true });
        expect(proposed.value.status).toBe('awaiting_review'); expect((await continuity.project(h.handle, source, draft)).participants[0].state).toBe('coat');
        await expect(continuity.propose(h.handle, { ...proposed.value, end: 99 })).rejects.toThrow();
        const projection = await continuity.project(h.handle, source, draft); expect(projection.participants[0].provisionalId).toBe(source.sessionId + ':alice');
        draft.characters[0].character.storyActorId = 'actor_' + 'b'.repeat(32); await expect(continuity.project(h.handle, source, draft)).rejects.toThrow('actor_unavailable');
    });
    test('cloud automatic authorization fails closed without spending; NovelAI human initiation remains required', async () => {
        const p = await x.prepare(); expect(() => x.images.authorize({ ...(null), targetFingerprint: p.targetFingerprint, evidence: { requestHash: p.requestHash, capabilities: p.capabilities, constraints: p.constraints }, connection: x.connection }, x.approval(p), 'automatic')).toThrow('human_initiation_required');
        const settings = structuredClone(x.settings); settings.director.mode = 'automatic';
        await x.host.extensions.saveIllustrationSettings(h.handle, settings, (await x.host.extensions.illustrationSettings(h.handle)).revision);
        await x.f.core.appendTimeline(h.handle, x.view.session.sessionId, { role: 'assistant', content: 'Location: tower\nA battle erupts as the group arrives at the tower, and the enemy reveals the bright glowing gate.' });
        const shots = await new VisualDirector({ host: x.host }).scan(h.handle, x.view.session.sessionId);
        expect(shots.some(shot => shot.status === 'blocked')).toBe(true); expect(provider.generate).not.toHaveBeenCalled();
    });
});
