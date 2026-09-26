import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertMessageProjection, assertTurnEnvelope, assertConversationThread } from '../public/shared/native-message-contract.js';
import { compileUiDocument } from '../public/scripts/native/experience/ui/v2-document.js';
import { validateMessageBlocks } from '../public/scripts/native/experience/ui/message-templates.js';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../public/shared/native-experience-contract.js';

const fixture = JSON.parse(readFileSync('tests/native/fixtures/message-projection-v2.json', 'utf8'));
const definition = compileUiDocument(fixture.document, { mode: 'component' });
const narrative = fixture.projection.flow.filter(node => node.kind === 'prose').map(node => node.text).join('');
const projection = assertMessageProjection(fixture.projection, narrative);
validateMessageBlocks(definition, projection);
assert(Object.isFrozen(projection.flow));
assert.throws(() => assertMessageProjection(fixture.projection, narrative + 'changed'));
assert.throws(() => assertTurnEnvelope({ schemaVersion: 1, narrative, outcomes: [{ patch: {} }], diagnostics: [] }));
assert.throws(() => assertConversationThread({ schemaVersion: 1, threadId: 'mail', scope: { kind: 'session' }, participants: [], messages: [], persistence: 'custom' }));
for (const name of ['message-projection', 'turn-envelope', 'reply-variant', 'conversation-presentation']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[name].supported, [1]);
for (const name of ['turn-contract', 'model-task', 'auxiliary-task', 'narrative-outcome']) assert.deepEqual(ATRIA_EXPERIENCE_CAPABILITIES[name].supported, []);
for (const path of ['public/scripts/native/message-presentation.js', 'public/scripts/native/reply-variants.js', 'public/shared/native-message-contract.js']) {
    const source = readFileSync(path, 'utf8');
    assert(!/\blocalStorage\b|\bindexedDB\b|\beval\s*\(|new\s+Function\s*\(|\/api\/card-app\/|\bswipe_id\b/.test(source), path);
}
const host = readFileSync('public/scripts/native/message-presentation.js', 'utf8');
assert(host.includes('mountUiDocument(') && host.includes("kind: 'render'"));
assert(!/statePatch|putImmutable|putMutable|writeFile/.test(host));
const core = readFileSync('src/native/session-core.js', 'utf8');
assert(core.includes('_validateProjections') && core.includes('validateMessageBlocks'));
console.log('P2 message presentation guard passed: immutable projection, pinned templates, one renderer, split receipts, P3 reserved');
