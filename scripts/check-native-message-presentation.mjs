import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertMessageProjection, assertTurnEnvelope, assertConversationThread } from '../public/shared/native-message-contract.js';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../public/shared/native-experience-contract.js';

const fixture = { projection: { schemaVersion: 1, flow: [{ kind: 'prose', text: 'Safe prose' }] } };
const narrative = fixture.projection.flow.filter(node => node.kind === 'prose').map(node => node.text).join('');
const projection = assertMessageProjection(fixture.projection, narrative);
assert(Object.isFrozen(projection.flow));
assert.throws(() => assertMessageProjection(fixture.projection, narrative + 'changed'));
assert.throws(() => assertTurnEnvelope({ schemaVersion: 1, narrative, outcomes: [{ patch: {} }], diagnostics: [] }));
assert.throws(() => assertConversationThread({ schemaVersion: 1, threadId: 'mail', scope: { kind: 'session' }, participants: [], messages: [], persistence: 'custom' }));
for (const name of ['message-projection', 'turn-envelope', 'reply-variant', 'conversation-presentation']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[name].supported, [1]);
for (const name of ['turn-contract', 'model-task', 'auxiliary-task', 'narrative-outcome']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[name].supported, [1]);
for (const path of ['public/scripts/native/frontend/conversation.js', 'public/scripts/native/reply-variants.js', 'public/shared/native-message-contract.js']) {
    const source = readFileSync(path, 'utf8');
    assert(!/\blocalStorage\b|\bindexedDB\b|\beval\s*\(|new\s+Function\s*\(|\/api\/card-app\/|\bswipe_id\b/.test(source), path);
}
const host = readFileSync('public/scripts/native/frontend/conversation.js', 'utf8');
assert(host.includes('createHeadlessConversation'));
assert(!/statePatch|putImmutable|putMutable|writeFile/.test(host));
const core = readFileSync('src/native/session-core.js', 'utf8');
assert(core.includes('_validateProjections') && core.includes('graph.bridge.bindings'));
console.log('P2 message presentation guard passed: immutable projection, pinned Bridge schemas, one renderer, split receipts');
