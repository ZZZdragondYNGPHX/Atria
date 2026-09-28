import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertAtriaProjectSource } from '../../src/native/project-source.js';
import { initialLifecycle } from '../../src/native/lifecycle-authority.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { displayInformation } from '../../public/shared/native-information-runtime.js';

const readJson = async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const raw = await readJson('project/ui/main.json');
const project = assertAtriaProjectSource(await readJson('project/atria.project.json'));
const fixture = await readJson('previews/phase6-phone-unread.json');
const ui = compileUiDocument(raw, { mode: 'hybrid' });
const nodes = new Map();
const walk = node => { nodes.set(node.id, node); node.children.forEach(walk); };
ui.views.forEach(view => walk(view.root));
const node = id => { assert.ok(nodes.has(id), id); return nodes.get(id); };
const contract = project.package.runtime.experienceContract;
const world = project.worlds[0];
const baseline = world.revision.baseline;
const lifecycle = initialLifecycle(contract.lifecycleRuntime);
lifecycle.clocks['game-clock'] = fixture.clockTick;
for (const [domain, records] of Object.entries(fixture.records)) lifecycle.domains[domain].records.push(...structuredClone(records));
const snapshot = {
    session: { sessionId: 'frontend-test', packageVersionId: 'frontend-test' },
    revision: { revisionId: 'frontend-test', branchId: 'frontend-test' },
    manifest: { actors: project.package.actors, worlds: project.worlds, runtime: { experienceContract: contract } },
    timeline: fixture.timeline,
    states: { atri_lifecycle: lifecycle, atri_world_state: { primaryWorldId: world.world.worldId, worlds: { [world.world.worldId]: { state: baseline } } } },
};
const ctx = {
    world: structuredClone(baseline), ui: structuredClone(fixture.ui), prefs: {},
    projection: displayInformation(snapshot), temporal: { world: [{ tick: fixture.clockTick }] },
    env: { device: 'desktop' }, selectors: {}, item: {},
};

assert.equal(ui.stateVersion, 2);
assert.equal(ui.localState.section.default, 'story');
assert.equal(ui.conversation.profile, 'novel');
assert.equal(ui.conversation.mode, 'reader');
assert.equal(project.assetFiles.length, 0);
assert.equal(nodes.size < 512, true);
assert.equal([...nodes.values()].filter(n => n.type === 'native-slot').length, 2);
assert.equal(node('conversation_slot').props.component, 'conversation');
assert.equal(node('composer_slot').props.component, 'composer');
assert.deepEqual(node('story_layout').children.map(n => n.id), ['story_stream']);
const order = node('story_page').children.map(n => n.id);
assert.equal(order.indexOf('composer_slot'), order.indexOf('story_layout') + 1);
assert.ok(order.indexOf('desktop_context') > order.indexOf('composer_slot'));
for (const id of ['desktop_context', 'compact_context', 'story_scene_details', 'mail_compose', 'mail_metadata', 'people_story_notes']) {
    assert.equal(node(id).type, 'details');
    assert.ok(node(id).props.label);
}

// Hidden fields must hide their visible label wrapper as well as the input.
for (const id of ['compact_nav', 'church_compact_nav', 'phone_compact_nav']) {
    const wrapper = node(id + '_wrapper');
    assert.equal(wrapper.bindings.hidden.read(ctx), true);
    assert.equal(wrapper.bindings.hidden.read({ ...ctx, env: { device: 'mobile' } }), false);
    assert.equal(wrapper.children[0].id, id);
}
for (const n of nodes.values()) if (n.type === 'button' && n.id.endsWith('_current')) {
    assert.equal(n.props.disabled, true);
    assert.ok(n.events.click, 'Native applies static disabled state through the action update path');
    assert.ok(n.bindings.ariaLabel);
}

// Each channel has its own display-only projection before native collection pagination.
assert.equal(contract.informationRuntime.views.length, 16);
for (const [viewId, sourceId, listId, channel] of [
    ['phone_messages', 'sms-source', 'sms_thread', 'sms'],
    ['phone_social', 'social-source', 'social_feed', 'social'],
    ['phone_mail', 'mail-source', 'mail_list', 'mail'],
]) {
    const view = contract.informationRuntime.views.find(v => v.id === viewId);
    assert.deepEqual(view.sources, [sourceId]);
    assert.deepEqual(view.exposure, ['display']);
    assert.equal(view.knowledge, false);
    assert.equal(view.audience, 'player');
    assert.equal(node(listId).source.read(ctx).length, 1);
    assert.equal(node(listId).source.read(ctx)[0].data.channel, channel);
    assert.equal(node(listId).pageSize, 8);
    assert.ok(node(listId).emptyText.length > 20);
    assert.equal(node(listId).children[0].bindings.hidden, undefined);
}
assert.equal(node('people_schedule').source.read(ctx), ctx.projection.schedule.items);
assert.equal(node('people_current').source.read(ctx), ctx.projection.story_event.items);
const socialOnly = structuredClone(snapshot);
socialOnly.states.atri_lifecycle.domains['sms-threads'].records = [];
socialOnly.states.atri_lifecycle.domains.mail.records = [];
const socialProjection = displayInformation(socialOnly);
assert.equal(socialProjection.phone_messages.items.length, 0);
assert.equal(socialProjection.phone_mail.items.length, 0);
assert.equal(socialProjection.phone_social.items.length, 1);
const crowded = structuredClone(snapshot);
const domain = crowded.states.atri_lifecycle.domains.social;
const sample = domain.records[0];
domain.records = Array.from({ length: 70 }, (_, index) => ({ ...structuredClone(sample), id: 'social-test-' + index }));
const crowdedProjection = displayInformation(crowded);
assert.equal(crowdedProjection.phone_social.items.length, 64);
assert.equal(crowdedProjection.phone_social.truncated, true);
assert.equal(node('phone_social_limit').bindings.hidden.read({ ...ctx, projection: crowdedProjection }), false);
assert.equal(node('phone_social_limit').bindings.hidden.read(ctx), true);
assert.equal(new Set(crowdedProjection.phone_social.items.map(item => item.id)).size, 64);
assert.equal(crowdedProjection.phone_mail.items.length, 1, 'Social cannot starve the Mail projection');
assert.equal(crowdedProjection.phone_messages.items.length, 1);

for (const tick of [0, 9, 59, 60, 599, 600, 1439, 1440, 2879]) {
    const time = String(Math.floor(tick % 1440 / 60)).padStart(2, '0') + ':' + String(tick % 60).padStart(2, '0');
    const clockCtx = { ...ctx, temporal: { world: [{ tick }] } };
    assert.equal(node('story_clock').bindings.text.read(clockCtx), 'Day 1 / ' + time);
    assert.equal(node('schedule_clock').bindings.text.read(clockCtx), 'Day 1 / ' + time);
}
const overnight = { ...ctx, item: { data: { start_tick: 1430, end_tick: 1470 } } };
assert.equal(node('schedule_record_time').bindings.text.read(overnight), 'Day 1 / 23:50 to Day 2 / 00:30');
ctx.world.church.money = 79;
assert.equal(node('facility_outreach_build').bindings.disabled.read(ctx), true);
assert.equal(node('facility_funds_hint').bindings.hidden.read(ctx), false);
assert.match(node('facility_funds_hint').bindings.text.read(ctx), /1 more money/);
ctx.world.church.money = 80;
assert.equal(node('facility_outreach_build').bindings.disabled.read(ctx), false);
assert.equal(node('facility_funds_hint').bindings.hidden.read(ctx), true);
assert.equal(node('project_progress').bindings.value.read({ ...ctx, item: { data: { progress: 1, target: 0 } } }), 100);
for (const actionId of ['send_sms', 'publish_social', 'send_mail', 'mark_sms_read', 'mark_social_read', 'mark_mail_read']) {
    assert.equal(ui.actions[actionId].steps.filter(step => step.op === 'application.command').length, 1);
    assert.equal(ui.actions[actionId].steps.some(step => step.op.startsWith('composer.')), false);
}
assert.equal(ui.actions.send_sms.steps.at(-1).op, 'ui.reset');
assert.equal(ui.actions.send_sms.steps[0].domainId, 'sms-threads');
assert.equal(ui.actions.build_outreach_desk.steps[0].op, 'command.dispatch');
for (const n of nodes.values()) if (n.type === 'repeat') assert.ok(n.pageSize <= 24);
console.log('Frontend refactor: native layout, labels, view budget, channel isolation, pagination, clock boundaries and authority contracts PASS');
console.log('providerCalls=0');
