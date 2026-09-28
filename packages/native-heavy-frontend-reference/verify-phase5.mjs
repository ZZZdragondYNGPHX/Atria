import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    AssetStore,
    KnowledgeRepo,
    ProjectStore,
    WorldRepo,
    assertAtriaProjectSource,
    buildProjectPackage,
} from '../../src/native/index.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { displayInformation } from '../../public/shared/native-information-runtime.js';
import { initialLifecycle } from '../../src/native/lifecycle-authority.js';
import { assertStudioScenario, runStudioArchiveScenario } from '../../src/native/studio-scenario.js';
import { makeTempFsEngine } from '../../tests/storage/harness/fs-harness.js';

const here = new URL('.', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, here), 'utf8'));
const projectRaw = await readJson('project/atria.project.json');
const uiRaw = await readJson('project/ui/main.json');
const logicRaw = await readJson('project/logic/world.json');
const scenarioRaw = await readJson('scenarios/communication.json');

const project = assertAtriaProjectSource(projectRaw);
const ui = compileUiDocument(uiRaw, { mode: 'hybrid' });
const scenario = assertStudioScenario(scenarioRaw);
const contract = project.package.runtime.experienceContract;
const lifecycle = contract.lifecycleRuntime;
const information = contract.informationRuntime;
const tasks = new Map(contract.taskRuntime.tasks.map(task => [task.id, task]));

assert.equal(project.package.version, '0.5.0-phase5');
assert.equal(project.assetFiles.length, 0);
assert.equal(contract.presentationRuntime, undefined);

for (const id of ['sms-threads', 'social', 'mail']) {
    assert.ok(lifecycle.domains.some(domain => domain.id === id), 'Missing communication domain ' + id);
}
const sms = lifecycle.domains.find(domain => domain.id === 'sms-threads');
const social = lifecycle.domains.find(domain => domain.id === 'social');
const mail = lifecycle.domains.find(domain => domain.id === 'mail');
assert.notDeepEqual(sms.recordSchema, social.recordSchema);
assert.notDeepEqual(sms.recordSchema, mail.recordSchema);
assert.notDeepEqual(social.recordSchema, mail.recordSchema);
assert.ok(sms.commands.some(command => command.id === 'send-player'));
assert.ok(social.commands.some(command => command.id === 'publish-player'));
assert.ok(mail.commands.some(command => command.id === 'send-player'));
assert.ok([sms, social, mail].every(domain => domain.commands.some(command => command.id === 'mark-read')));

const events = lifecycle.domains.find(domain => domain.id === 'events');
assert.ok(events.recordSchema.properties.kind.enum.includes('communication'));
assert.ok(events.commands.find(command => command.id === 'open').argsSchema.properties.kind.enum.includes('communication'));

const socialTask = tasks.get('social');
assert.ok(socialTask);
assert.equal(socialTask.executionClass, 'background');
assert.deepEqual(socialTask.resultPolicy, { resultClass: 'declared_app_command', sink: 'app_command' });
assert.equal(socialTask.queuePolicy, 'fifo');
assert.equal(socialTask.context.includes('history'), false, 'Social must not read the whole main Timeline by default');
const variants = new Map(socialTask.variants.map(variant => [variant.id, variant]));
assert.deepEqual(variants.get('sms-reply').resultBinding, {
    kind: 'app.command', domainId: 'sms-threads', commandId: 'deliver', recordId: 'caretaker-check-in',
});
assert.deepEqual(variants.get('social-reply').resultBinding, { kind: 'app.command', domainId: 'social', commandId: 'deliver' });
assert.deepEqual(variants.get('mail-compose').resultBinding, { kind: 'app.command', domainId: 'mail', commandId: 'deliver' });
assert.deepEqual(variants.get('mail-delayed').resultBinding, { kind: 'interaction.schedule', interactionId: 'mail-delivery' });

assert.ok(lifecycle.interactions.some(item => item.id === 'mail-delivery' && item.taskId === 'social' && item.domainId === 'mail'));
assert.ok(lifecycle.automations.some(item => item.id === 'welcome-mail' && item.trigger.kind === 'experience.ready'
    && item.action.taskId === 'social' && item.action.variantId === 'mail-delayed'));
assert.ok(lifecycle.automations.some(item => item.id === 'caretaker-check-in' && item.trigger.kind === 'world.schedule'
    && item.trigger.clockId === 'game-clock' && item.trigger.at === 540
    && item.action.taskId === 'social' && item.action.variantId === 'sms-reply'));

for (const id of ['sms-source', 'social-source', 'mail-source']) assert.ok(information.sources.some(source => source.id === id));
const phoneView = information.views.find(view => view.id === 'phone');
assert.deepEqual(phoneView.sources, ['sms-source', 'social-source', 'mail-source']);
assert.deepEqual(phoneView.exposure, ['display']);
const communicationContext = information.views.find(view => view.id === 'communication_context');
assert.equal(communicationContext.taskId, 'social');
assert.ok(communicationContext.sources.includes('sms-source'));
assert.ok(communicationContext.sources.includes('social-source'));
assert.ok(communicationContext.sources.includes('mail-source'));
const narratorContext = information.views.find(view => view.taskId === 'narrator');
for (const source of ['sms-source', 'social-source', 'mail-source']) {
    assert.equal(narratorContext.sources.includes(source), false, 'Phone history leaked into default Narrator context: ' + source);
}

assert.equal(ui.stateVersion, 2);
assert.equal(ui.localState.phone_section.default, 'messages');
assert.deepEqual(ui.localState.phone_section.enum, ['messages', 'social', 'mail']);
for (const id of ['send_sms', 'publish_social', 'send_mail', 'mark_sms_read', 'mark_social_read', 'mark_mail_read', 'open_sms_event']) {
    const action = ui.actions[id];
    assert.ok(action, 'Missing Phone action ' + id);
    assert.equal(action.steps.filter(step => step.op === 'application.command').length, 1);
    assert.equal(action.steps.some(step => step.op.startsWith('composer.')), false, 'Phone action must not use Story Composer');
}
assert.deepEqual(ui.actions.send_sms.steps[0], {
    op: 'application.command', domainId: 'sms-threads', commandId: 'send-player',
    args: ui.actions.send_sms.steps[0].args, when: null, value: null,
});
assert.equal(ui.actions.open_sms_event.steps[0].domainId, 'events');
assert.equal(ui.actions.open_sms_event.steps[0].commandId, 'open');

const roots = ui.views.map(view => view.root);
const flat = [];
while (roots.length) {
    const node = roots.pop();
    flat.push(node);
    roots.push(...node.children);
}
const byId = new Map(flat.map(node => [node.id, node]));
for (const id of ['phone_page', 'phone_nav', 'phone_messages_panel', 'sms_thread', 'sms_form', 'phone_social_panel', 'social_feed', 'social_form', 'phone_mail_panel', 'mail_list', 'mail_form']) {
    assert.ok(byId.has(id), 'Missing Phase 5 Phone UI node ' + id);
}
assert.equal(byId.get('conversation_slot').props.component, 'conversation');
assert.equal(byId.get('composer_slot').props.component, 'composer');

const world = project.worlds[0];
const state = initialLifecycle(lifecycle);
state.domains['sms-threads'].records.push({
    id: 'sms-one', scopeId: 'session', status: 'active', pinned: false, createdLogicalTime: 1, updatedLogicalTime: 1,
    value: { channel: 'sms', thread_id: 'caretaker', participants: ['actor_b48a53176eb663a1af411fb6f8638d66'],
        sender_id: 'actor_b48a53176eb663a1af411fb6f8638d66', body: 'Preview SMS', sent_at: 540, unread: true, delivery_state: 'delivered', provenance: 'model' },
});
state.domains.social.records.push({
    id: 'social-one', scopeId: 'session', status: 'active', pinned: false, createdLogicalTime: 1, updatedLogicalTime: 1,
    value: { channel: 'social', kind: 'post', author_id: 'player', parent_id: '', body: 'Preview post', posted_at: 520, unread: false, provenance: 'player' },
});
state.domains.mail.records.push({
    id: 'mail-one', scopeId: 'session', status: 'active', pinned: false, createdLogicalTime: 1, updatedLogicalTime: 1,
    value: { channel: 'mail', from_id: 'district-foundation', to_id: 'player', subject: 'Preview mail', body: 'Preview body',
        delivered_at: 530, unread: true, delivery_state: 'delivered', provenance: 'template', reference_kind: 'opportunity', reference_id: 'starter-sponsor' },
});
const snapshot = {
    session: { sessionId: 'phase5-preview', packageVersionId: 'phase5-preview' },
    revision: { revisionId: 'phase5-preview', branchId: 'phase5-preview' },
    manifest: { actors: project.package.actors, worlds: project.worlds, runtime: { experienceContract: contract } },
    timeline: [],
    states: {
        atri_lifecycle: state,
        atri_world_state: { primaryWorldId: world.world.worldId, worlds: { [world.world.worldId]: { state: structuredClone(world.revision.baseline) } } },
    },
};
const projection = displayInformation(snapshot);
assert.equal(projection.phone.items.length, 3);
assert.deepEqual(new Set(projection.phone.items.map(item => item.data.channel)), new Set(['sms', 'social', 'mail']));

const h = await makeTempFsEngine();
try {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const recordedProjectRaw = structuredClone(projectRaw);
    recordedProjectRaw.package.permissions = recordedProjectRaw.package.permissions.map(item => item.permission === 'generation' ? { ...item, required: false } : item);
    await projectStore.create(h.handle, recordedProjectRaw, {
        files: new Map([
            ['ui/main.json', Buffer.from(JSON.stringify(uiRaw, null, 2) + '\n')],
            ['logic/world.json', Buffer.from(JSON.stringify(logicRaw, null, 2) + '\n')],
        ]),
    });
    const built = await buildProjectPackage({
        handle: h.handle, projectId: project.project.projectId, projectStore,
        worldRepo: new WorldRepo({ engine: h.engine }),
        knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
    });
    const result = await runStudioArchiveScenario(built.archive, scenario);
    assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
    assert.equal(result.providerCalls, 0);
    assert.equal(result.persisted, false);
    assert.equal(result.steps.length, scenario.steps.length);
    assert.equal(result.evidence.timelineEntries, 1);
} finally {
    await h.cleanup();
}

const serialized = JSON.stringify({ project: projectRaw, ui: uiRaw, logic: logicRaw, scenario: scenarioRaw }).toLowerCase();
for (const forbidden of [
    'next_action', 'quick_choice', 'curator', 'story compression', 'day compression',
    'package memory store', 'package memory task', 'asset-pack', 'media-scene', 'gal runtime', 'full experience', '<script', 'regex html',
]) assert.equal(serialized.includes(forbidden), false, 'Phase 5 forbidden content leaked: ' + forbidden);

console.log('Phase 5 Phone / Communication targeted validation: PASS');
console.log('SMS Thread + Social + Mail + Phone input + unread notifications: PASS');
console.log('G2 background Task → App Command / scheduled delivery: PASS');
console.log('Communication → Event → canonical Timeline Scenario: PASS');
console.log('providerCalls=0');
