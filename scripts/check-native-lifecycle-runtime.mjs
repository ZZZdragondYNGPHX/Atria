import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertLifecycleRuntime, LIFECYCLE_STATE_NAMESPACE } from '../public/shared/native-lifecycle-contract.js';
import { assertNativeExperienceContract, ATRIA_EXPERIENCE_CAPABILITIES } from '../public/shared/native-experience-contract.js';
import { lifecycleFixture } from '../tests/native/helpers/lifecycle-fixture.js';

const { lifecycleRuntime, taskRuntime } = lifecycleFixture();
const normalized = assertLifecycleRuntime(lifecycleRuntime, taskRuntime);
assert.equal(LIFECYCLE_STATE_NAMESPACE, 'atri_lifecycle');
assert.deepEqual(normalized.interactions, []);
assert(Object.isFrozen(normalized.interactions));
assert.throws(() => assertLifecycleRuntime({ ...lifecycleRuntime, interactions: [{ id: 'undeclared' }] }, taskRuntime));
assert(Object.isFrozen(normalized.domains[0].commands[0].assign));
assert.deepEqual(assertNativeExperienceContract({ schemaVersion: 1, capabilities: [], dataResources: [], lifecycleRuntime, taskRuntime }).lifecycleRuntime, normalized);
for (const id of ['session-application', 'temporal', 'workflow', 'runtime-automation']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, [1]);
for (const id of ['addon', 'player-continuity', 'shared-realm']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, []);
assert.throws(() => assertLifecycleRuntime({ ...lifecycleRuntime, retention: { maxTaskResults: 1, maxReceipts: 4097 } }, taskRuntime));
assert.throws(() => assertLifecycleRuntime({ ...lifecycleRuntime, automations: [{ ...lifecycleRuntime.automations[0], trigger: { kind: 'session.loaded' } }] }, taskRuntime));
const source = readFileSync('public/shared/native-lifecycle-contract.js', 'utf8');
assert(source.includes('compileDataSchema') && source.includes('assertTaskValue') && source.includes('compileDeclarativeLogic'));
const paths = ['public/shared/native-lifecycle-contract.js', 'src/native/lifecycle-authority.js', 'public/scripts/native/lifecycle-client.js'];
for (const path of paths) {
    const code = readFileSync(path, 'utf8');
    assert(!/\beval\s*\(|new\s+Function\s*\(|\blocalStorage\b|\bindexedDB\b|\b(?:putMutable|putImmutable|writeFile)\s*\(|new\s+SessionCore\s*\(/.test(code), path);
}
const core = readFileSync('src/native/session-core.js', 'utf8');
assert(core.includes('lifecycle-authority.js') && core.includes('applyLifecycleCommand') && core.includes('lifecycleReceipt'), 'Lifecycle must reuse SessionCore authority');
assert(readFileSync('src/native/session-snapshot.js', 'utf8').includes('\'atri_lifecycle\''), 'Lifecycle state is reserved');
const host = readFileSync('src/native/adapters/generation-host.js', 'utf8');
assert(host.includes('executeLifecycle') && host.includes('this.executeTask') && host.includes('nativeTaskScheduler.submit'), 'No second Task scheduler');
const authority = readFileSync('src/native/lifecycle-authority.js', 'utf8');
assert(authority.includes('prepareTaskAuthority') && authority.includes('taskTombstones') && authority.includes('interaction.schedule'), 'World engine, replay tombstones, and deferred proposals remain distinct');
const client = readFileSync('public/scripts/native/lifecycle-client.js', 'utf8');
assert(client.includes('EXPERIENCE_READY') && client.includes('acceptOperationSnapshot') && client.includes('getActivityElapsed'), 'Ready barrier and four time domains');
console.log('P4 lifecycle contract guard passed: closed declarations, four capabilities, immutable data, bounded retention, shared authority');
