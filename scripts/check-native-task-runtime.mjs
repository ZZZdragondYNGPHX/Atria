import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertTurnEnvelope } from '../public/shared/native-message-contract.js';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../public/shared/native-experience-contract.js';

for (const id of ['turn-contract', 'narrative-outcome', 'model-task', 'auxiliary-task']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, [1]);
for (const id of ['session-application', 'temporal', 'workflow', 'runtime-automation']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[id].supported, []);
assert.throws(() => assertTurnEnvelope({ schemaVersion: 1, narrative: '', outcomes: [{ requestId: 'test', interpretation: { decision: 'event', confidence: 1, eventType: 'Change', patch: { hp: 1 } } }], diagnostics: [] }));
for (const path of ['public/shared/native-task-contract.js', 'src/native/task-scheduler.js', 'src/native/task-authority.js', 'public/scripts/native/task-client.js']) {
    const source = readFileSync(path, 'utf8');
    assert(!/\beval\s*\(|new\s+Function\s*\(|\blocalStorage\b|\bindexedDB\b|\b(?:putMutable|putImmutable|writeFile)\s*\(|new\s+SessionCore\s*\(/.test(source), path);
}
const core = readFileSync('src/native/session-core.js', 'utf8');
assert(core.includes('prepareTaskAuthority') && core.includes('validateTaskRecords') && core.includes('taskRecord'));
const host = readFileSync('src/native/adapters/generation-host.js', 'utf8');
assert(host.includes('taskPlan.variant.prompt') && host.includes('taskPlan.variant.generation') && host.includes('nativeTaskScheduler.submit'));
const runtime = readFileSync('public/scripts/native/session-runtime.js', 'utf8');
assert(runtime.includes('if (this.generation?.provisionalTurn) return true;'));
console.log('P3 runtime guard passed: typed outcomes, split delivery/authority, shared authority, provisional barrier, P4 reserved');
