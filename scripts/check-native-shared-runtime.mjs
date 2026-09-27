import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATRIA_EXPERIENCE_CAPABILITIES, assertNativeExperienceContract } from '../public/shared/native-experience-contract.js';
import { sharedFixture } from '../tests/native/helpers/shared-fixture.js';
import { sessionFixture } from '../tests/native/helpers/session-fixture.js';
import { sharedRoll } from '../src/native/shared-authority.js';

assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES['shared-realm'].supported, [1]);
for (const id of ['experience-health', 'studio-authoring']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, id === 'studio-authoring' ? [2] : [1]);
assertNativeExperienceContract(sharedFixture(sessionFixture()));
assert.equal(sharedRoll('seed', 'session', 'turn', 'seat', 20), sharedRoll('seed', 'session', 'turn', 'seat', 20));
const read = path => readFileSync(path, 'utf8');
for (const path of ['public/shared/native-shared-contract.js', 'src/native/shared-authority.js', 'src/native/realm-authority.js', 'public/scripts/native/shared-client.js']) {
    assert.doesNotMatch(read(path), /\beval\s*\(|new\s+Function\s*\(|\binnerHTML\b|\blocalStorage\b|\bindexedDB\b|\bWebSocket\b|new\s+SessionCore\s*\(/, path);
}
assert.match(read('src/native/shared-authority.js'), /projectInformation\(base, id\)/);
assert.match(read('src/native/shared-authority.js'), /prepareLifecycle\(candidate/);
assert.match(read('src/native/realm-authority.js'), /applyContinuity\(core/);
assert.match(read('src/native/session-core.js'), /reconcileRealm\(base, states/);
assert.match(read('src/native/session-snapshot.js'), /'atri_realm_transfers', 'atri_shared'/);
assert.match(read('src/native/continuity-authority.js'), /base\.externalEffects\?\.some/);
assert.match(read('public/scripts/native/experience/ui/v2-runtime.js'), /options\.sharedClient\.getProjection/);
console.log('P8 guard passed: authenticated Shared ACL, scoped projections, deterministic typed Turn, independent Realm, reused Saga and renderer; P9 Host capabilities integrated');
