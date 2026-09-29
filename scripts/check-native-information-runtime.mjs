import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../public/shared/native-experience-contract.js';
import { projectInformation, queryInformationGraph } from '../public/shared/native-information-runtime.js';
import { informationSnapshot } from '../tests/native/helpers/information-fixture.js';

for (const id of ['data-projection', 'perspective']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, [1]);
for (const id of ['experience-health']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, id === 'studio-authoring' ? [2] : [1]);
const snapshot = informationSnapshot();
const before = JSON.stringify(snapshot);
const projection = projectInformation(snapshot, 'pov');
assert.doesNotMatch(JSON.stringify(projection), /OTHER BELIEF|OTHER THREAD|WORLD SECRET|PRIVATE RAW HISTORY/);
assert(projection.items.some(item => item.semantic === 'belief' && item.epistemicStatus === 'believed'));
assert(projection.items.some(item => item.semantic === 'open_loop'));
assert.throws(() => projectInformation(snapshot, 'player', { purpose: 'context' }), /denied/);
assert.equal(queryInformationGraph(snapshot, 'relations', 'a').nodes.length, 2);
assert.equal(JSON.stringify(snapshot), before);
const read = path => readFileSync(path, 'utf8');
for (const path of ['public/shared/native-information-contract.js', 'public/shared/native-information-runtime.js', 'src/native/information-authority.js']) {
    assert.doesNotMatch(read(path), /\beval\s*\(|new\s+Function\s*\(|\binnerHTML\b|\blocalStorage\b|\bindexedDB\b|\b(?:putMutable|putImmutable|writeFile)\s*\(|new\s+SessionCore\s*\(/, path);
}
assert.match(read('src/native/lifecycle-authority.js'), /prepareInformationRollup\(candidate, action\)/);
assert.match(read('src/native/session-core.js'), /Information derived state requires typed lifecycle publication/);
assert.match(read('public/scripts/native/context-compiler.js'), /informationContext\(snapshot, target/);
assert.match(read('src/native/adapters/generation-host.js'), /native_information_unscoped_messages/);
assert.match(read('public/scripts/native/lifecycle-client.js'), /getInformationProjection/);
console.log('P6 information guard passed: scoped projections, bounded graph, Truth/Belief separation, typed derived rollups, one Context/renderer/Session, P9 Host capabilities integrated');
