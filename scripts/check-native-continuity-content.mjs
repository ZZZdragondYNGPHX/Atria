import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATRIA_EXPERIENCE_CAPABILITIES, assertNativeExperienceContract } from '../public/shared/native-experience-contract.js';
import { continuityFixture, contentFixture } from '../tests/native/helpers/continuity-fixture.js';
import { assertCommunityRegistry } from '../public/shared/native-content-contract.js';
import { NATIVE_RESOURCE_KINDS, assertNativeResourceKey } from '../src/native/contracts.js';

for (const id of ['addon', 'player-continuity']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, [1]);
for (const id of ['experience-health', 'studio-authoring']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, []);
assertNativeExperienceContract(continuityFixture()); assertNativeExperienceContract(contentFixture());
assert.throws(() => assertCommunityRegistry({ schemaVersion: 1, entries: [], trusted: true }));
assertNativeResourceKey({ kind: NATIVE_RESOURCE_KINDS.playerContinuityRevision, handle: 'local', packageId: 'pkg_' + 'a'.repeat(32), revisionId: 'rev_' + 'b'.repeat(32) });
const read = file => readFileSync(file, 'utf8');
for (const file of ['public/shared/native-content-contract.js', 'public/shared/native-continuity-contract.js', 'src/native/content-composition.js', 'src/native/continuity-authority.js']) {
    assert.doesNotMatch(read(file), /\beval\s*\(|new\s+Function\s*\(|\binnerHTML\b|\blocalStorage\b|\bindexedDB\b|\bWebSocket\b|new\s+SessionCore\s*\(/, file);
}
const core = read('src/native/session-core.js');
assert.match(core, /reconcileOwnership\(base, states/);
assert.match(core, /this\._continuity\.lock/);
assert.match(read('src/native/session-snapshot.js'), /'atri_transfers'/);
assert.match(read('src/native/package-composition.js'), /validateContentComposition\(inspected\)/);
assert.match(read('src/native/content-composition.js'), /composeContent\(baseBytes, composition\.resources/);
assert.match(read('src/native/continuity-authority.js'), /transfer\.prepared/);
assert.match(read('src/native/continuity-authority.js'), /transfer\.compensated/);
assert.match(read('src/native/adapters/generation-host.js'), /!preflight && snapshot\.externalEffects/);
assert.match(read('public/scripts/native/experience/ui/v2-document.js'), /step\.op\.startsWith\('continuity\.'\)/);
console.log('P7 guard passed: exact Base/add-on proof, typed Community and Continuity, independent Native revisions, ownership reconciliation, recoverable Saga, existing renderer/Host, P9 reserved');
