import { assertNativeExperienceContract, assertExperienceDataClosure, ATRIA_EXPERIENCE_CAPABILITIES } from '../../public/shared/native-experience-contract.js';
import { assertSceneCueIR, assertPresentationRuntime } from '../../public/shared/native-presentation-contract.js';
import { activityFixture } from './helpers/activity-fixture.js';
const asset = { assetId: 'asset_' + 'a'.repeat(32), contentHash: 'b'.repeat(64), size: 4, mediaType: 'image/png', logicalName: 'image' };
const ref = () => ({ assetId: asset.assetId, contentHash: asset.contentHash });
function fixture() {
    const value = activityFixture();
    value.presentationRuntime.assetPacks = [{ id: 'art', assets: [ref()], delivery: 'eager', required: true, maxBytes: 100 }];
    value.presentationRuntime.voices = [{ id: 'actor', actorId: 'actor_' + 'c'.repeat(32), lang: 'en-US' }];
    value.presentationRuntime.scenes = [{ id: 'stage', scopeId: 'session', cues: [{ id: 'background', kind: 'image', asset: ref(), alt: 'Scene', fit: 'cover', motion: 'fade' }] }];
    value.presentationRuntime.activities[0].sceneId = 'stage';
    return { schemaVersion: 1, capabilities: [], dataResources: [], ...value };
}
test('strict frozen P5 contract uses one optional version boundary and only enables five capabilities', () => {
    const normalized = assertNativeExperienceContract(fixture()); expect(Object.isFrozen(normalized.presentationRuntime.scenes[0].cues)).toBe(true);
    for (const id of ['activity', 'media-scene', 'asset-pack', 'safe-presentation', 'host-presentation-input']) expect(ATRIA_EXPERIENCE_CAPABILITIES[id].supported).toEqual([1]);
    for (const id of ['data-projection', 'perspective', 'shared-realm', 'addon']) expect(ATRIA_EXPERIENCE_CAPABILITIES[id].supported).toEqual([]);
});
test.each(['html', 'css', 'js', 'url', 'patch', '__proto__', 'provider', 'secret'])('rejects executable/unknown field %s at nested Scene boundary', field => {
    const value = fixture(); Object.defineProperty(value.presentationRuntime.scenes[0].cues[0], field, { enumerable: true, value: 'arbitrary' });
    expect(() => assertNativeExperienceContract(value)).toThrow();
});
test.each([
    value => { value.presentationRuntime.schemaVersion = 2; },
    value => { value.presentationRuntime.activities[0].scopeId = 'unknown'; },
    value => { value.presentationRuntime.activities[0].settlement.domainId = 'unknown'; },
    value => { value.presentationRuntime.activities[0].settlement.recordId = '__proto__'; },
    value => { value.presentationRuntime.activities[0].sceneId = 'unknown'; },
    value => { value.presentationRuntime.activities[0].narrator.variantId = 'missing'; },
    value => { value.taskRuntime.tasks[0].context = []; },
    value => { value.taskRuntime.tasks[0].variants[0].outputSchema = { type: 'object', properties: {}, required: [], additionalProperties: false }; },
    value => { value.presentationRuntime.host = [{ id: 'arbitrary-network', required: true }]; },
    value => { value.presentationRuntime.host = [{ id: 'fullscreen', required: 'yes' }]; },
    value => { value.presentationRuntime.assetPacks[0].assets.push(ref()); },
    value => { value.presentationRuntime.assetPacks[0].assets[0].contentHash = 'latest'; },
    value => { value.presentationRuntime.assetPacks[0].maxBytes = 536870913; },
    value => { value.presentationRuntime.scenes[0].cues[0].volume = 0.5; },
    value => { value.presentationRuntime.scenes[0].cues[0].fit = 'arbitrary-css'; },
    value => { value.presentationRuntime.scenes[0].cues[0].motion = 'javascript'; },
    value => { value.presentationRuntime.scenes[0].cues[0].asset.contentHash = 'd'.repeat(64); },
    value => { value.presentationRuntime.voices[0].rate = 3; },
])('rejects invalid declaration %#', mutate => { const value = fixture(); mutate(value); expect(() => assertNativeExperienceContract(value)).toThrow(); });
test('accessors are rejected without execution and scene arrays stay dense', () => {
    const value = fixture(); let called = false; Object.defineProperty(value.presentationRuntime, 'host', { get() { called = true; return []; }, enumerable: true });
    expect(() => assertNativeExperienceContract(value)).toThrow(); expect(called).toBe(false);
    const sparse = fixture(); delete sparse.presentationRuntime.scenes[0].cues[0]; expect(() => assertNativeExperienceContract(sparse)).toThrow();
});
test('closure rejects wrong digest, executable media and wrong cue MIME or pack/eager budget', () => {
    expect(assertExperienceDataClosure(fixture(), [asset]).presentationRuntime.scenes).toHaveLength(1);
    for (const changed of [{ ...asset, contentHash: 'c'.repeat(64) }, { ...asset, mediaType: 'image/svg+xml' }, { ...asset, mediaType: 'audio/mpeg' }, { ...asset, size: 101 }]) expect(() => assertExperienceDataClosure(fixture(), [changed])).toThrow();
    const value = fixture(); value.presentationRuntime.assetPacks[0].maxBytes = 100000000;
    expect(() => assertExperienceDataClosure(value, [{ ...asset, size: 67108865 }])).toThrow('Eager');
});
test('model Scene Cue IR can only select closed media primitives/exact package refs or selected attachments', () => {
    const value = fixture(); const definition = assertPresentationRuntime(value.presentationRuntime, value.lifecycleRuntime, value.taskRuntime);
    const ir = cues => ({ schemaVersion: 1, cues });
    expect(assertSceneCueIR(ir([{ id: 'line', kind: 'caption', text: '<script>inert text</script>' }, { id: 'voice', kind: 'speech', voiceId: 'actor', text: 'Hello' }]), definition).cues).toHaveLength(2);
    expect(() => assertSceneCueIR(ir([{ id: 'foreign', kind: 'image', attachment: ref() }]), definition)).toThrow();
    expect(assertSceneCueIR(ir([{ id: 'attached', kind: 'image', attachment: ref() }]), definition, { attachments: [asset] }).cues).toHaveLength(1);
    expect(() => assertSceneCueIR(ir([{ id: 'bad', kind: 'iframe', url: 'remote' }]), definition)).toThrow();
    expect(() => assertSceneCueIR(ir(Array.from({ length: 65 }, (_, i) => ({ id: 'cue' + i, kind: 'clear' }))), definition)).toThrow();
});
