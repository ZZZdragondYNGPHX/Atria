import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../public/shared/native-experience-contract.js';
import { assertPresentationRuntime, assertSceneCueIR } from '../public/shared/native-presentation-contract.js';
import { compileUiDocument } from '../public/scripts/native/experience/ui/v2-document.js';

for (const id of ['activity', 'media-scene', 'asset-pack', 'safe-presentation', 'host-presentation-input']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, [1]);
for (const id of ['addon', 'player-continuity', 'shared-realm']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, []);
const definition = assertPresentationRuntime({ schemaVersion: 1, activities: [], scenes: [], assetPacks: [], voices: [], host: [] });
assert(Object.isFrozen(definition));
assert.throws(() => assertSceneCueIR({ schemaVersion: 1, cues: [{ id: 'scene', kind: 'caption', text: 'caption', html: '<script></script>' }] }, definition));
assert.throws(() => compileUiDocument({ schemaVersion: 2, stateVersion: 1, localState: {}, preferences: {}, actions: {},
    views: [{ id: 'main', surface: 'chat.footer', mount: 'always', root: { id: 'media', type: 'media-cue', props: { cue: {} } } }] }, { mode: 'component' }), /Host-owned/);
const read = path => readFileSync(path, 'utf8');
for (const path of ['public/shared/native-presentation-contract.js', 'public/scripts/native/presentation-client.js', 'src/native/activity-authority.js']) {
    assert.doesNotMatch(read(path), /\beval\s*\(|new\s+Function\s*\(|\binnerHTML\b|\blocalStorage\b|\bindexedDB\b|\b(?:putMutable|putImmutable|writeFile)\s*\(|new\s+SessionCore\s*\(/, path);
}
const client = read('public/scripts/native/presentation-client.js');
assert.match(client, /mountUiDocument\(definition/);
assert.match(client, /lifecycle\.command\(pending\)/);
assert.match(client, /assertSceneCueIR\(ir/);
assert.match(client, /getActivityProjection/);
assert.match(client, /releaseSceneInteraction/);
assert.match(read('public/scripts/native/experience/index.js'), /getActivityElapsed: \(\) => presentationClient\.getActivityProjection\(\)/);
const authority = read('src/native/activity-authority.js');
assert.match(authority, /await apply\(/);
assert.match(authority, /committedRevisionId: null/);
assert.match(authority, /queued\.input = copy\(assertTaskValue/);
assert.match(read('src/native/session-core.js'), /publishActivities\(\{ \.\.\.base, states \}, revisionId, branchId, taskRecord\)/);
assert.match(read('src/native/adapters/generation-host.js'), /activity\.narrator\.variantId/);
assert.match(read('src/native/asset-delivery.js'), /assets\.openDelivery/);
assert.match(read('src/native/repositories/asset-store.js'), /file\.createReadStream\(\{ start, end, autoClose: false \}\)/);
console.log('P5 presentation guard passed: five capabilities, inert Cue IR, one renderer/authority, committed handoff, exact streaming, Host cleanup, P7+ reserved');
