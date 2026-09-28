import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertAtriaProjectSource } from '../../src/native/project-source.js';
import { initialLifecycle } from '../../src/native/lifecycle-authority.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { displayInformation } from '../../public/shared/native-information-runtime.js';
import { assertMessageProjection } from '../../public/shared/native-message-contract.js';
import { validateMessageBlocks } from '../../public/scripts/native/experience/ui/message-templates.js';

const here = new URL('.', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, here), 'utf8'));

const projectRaw = await readJson('project/atria.project.json');
const uiRaw = await readJson('project/ui/main.json');
const logicRaw = await readJson('project/logic/world.json');
const storyRaw = await readJson('scenarios/story-turn.json');
const desktopFixture = await readJson('previews/phase4-desktop.json');
const compactFixture = await readJson('previews/phase4-compact.json');

const project = assertAtriaProjectSource(projectRaw);
const ui = compileUiDocument(uiRaw, { mode: 'hybrid' });
const logic = compileDeclarativeLogic(logicRaw);
const contract = project.package.runtime.experienceContract;
const world = project.worlds[0];

assert.equal(project.package.version, '0.4.0-phase4');
assert.ok(contract.capabilities.some(item => item.id === 'message-projection' && item.version === 1 && item.required));
assert.equal(contract.presentationRuntime, undefined);
assert.equal(project.assetFiles.length, 0);

const eventDomain = contract.lifecycleRuntime.domains.find(item => item.id === 'events');
assert.ok(eventDomain.recordSchema.required.includes('title'));
assert.ok(eventDomain.commands.find(item => item.id === 'open').argsSchema.required.includes('title'));
assert.ok(logic.commands.some(command => command.id === 'church.enact-open-books'));

for (const id of ['church_operations', 'church_projects', 'church_opportunities', 'story_event', 'people_schedule', 'people_event', 'people_recent']) {
    const view = contract.informationRuntime.views.find(item => item.id === id);
    assert.ok(view, 'Missing Phase 4 Information View ' + id);
    assert.deepEqual(view.exposure, ['display']);
    assert.equal(view.knowledge, false);
}
assert.ok(contract.informationRuntime.sources.find(item => item.id === 'event-context').fields.some(path => path.join('.') === 'title'));
assert.ok(contract.informationRuntime.sources.find(item => item.id === 'world-context').fields.some(path => path.join('.') === 'people.caretaker.relationship'));

assert.equal(ui.localState.church_section.default, 'overview');
assert.deepEqual(ui.localState.church_section.enum, ['overview', 'facilities', 'decrees', 'projects', 'opportunities']);
for (const actionId of ['build_outreach_desk', 'enact_community_first', 'enact_open_books', 'promote_church']) {
    const action = ui.actions[actionId];
    assert.equal(action.steps.length, 1);
    assert.equal(action.steps[0].op, 'command.dispatch');
}
assert.equal(JSON.stringify(uiRaw).includes('app.command'), false, 'Package UI must not raw-dispatch Session Application authority');

const root = ui.views.find(view => view.id === 'main').root;
const flatten = (node, out = []) => {
    out.push(node);
    for (const child of node.children ?? []) flatten(child, out);
    return out;
};
const byId = new Map(flatten(root).map(node => [node.id, node]));
for (const id of [
    'story_header', 'story_event_header', 'desktop_context', 'compact_context', 'conversation_slot', 'composer_slot',
    'church_overview_panel', 'church_facilities_panel', 'church_decrees_panel', 'church_projects_panel', 'church_opportunities_panel',
    'schedule_clock', 'schedule_timeline', 'people_relationship', 'people_schedule', 'people_recent',
]) assert.ok(byId.has(id), 'Missing Phase 4 UI node ' + id);

assert.equal(byId.get('conversation_slot').props.component, 'conversation');
assert.equal(byId.get('composer_slot').props.component, 'composer');
assert.equal(byId.get('compact_context').type, 'details');
assert.equal(ui.conversation.mode, 'reader');
assert.equal(ui.conversation.profile, 'novel');

const turn = storyRaw.steps.find(step => step.kind === 'turn').input;
const messageProjection = assertMessageProjection(turn.projection, turn.narrative);
validateMessageBlocks(ui, messageProjection);
assert.equal(messageProjection.flow.filter(item => item.kind === 'block').length, 1);
assert.equal(messageProjection.flow.find(item => item.kind === 'block').type, 'scene_marker');
assert.equal(ui.messageBlocks.scene_marker.actionPolicy, 'ui-only');
assert.equal(Object.keys(ui.messageBlocks.scene_marker.document.actions).length, 0);

function preview(fixture) {
    const lifecycle = initialLifecycle(contract.lifecycleRuntime);
    lifecycle.clocks['game-clock'] = fixture.clockTick;
    for (const [domainId, records] of Object.entries(fixture.records)) {
        lifecycle.domains[domainId].records.push(...structuredClone(records));
    }
    const snapshot = {
        session: { sessionId: 'phase4-preview', packageVersionId: 'phase4-preview' },
        revision: { revisionId: 'phase4-preview', branchId: 'phase4-preview' },
        manifest: { actors: project.package.actors, worlds: project.worlds, runtime: { experienceContract: contract } },
        timeline: structuredClone(fixture.timeline),
        states: {
            atri_lifecycle: lifecycle,
            atri_world_state: {
                primaryWorldId: world.world.worldId,
                worlds: { [world.world.worldId]: { state: structuredClone(world.revision.baseline) } },
            },
        },
    };
    const ctx = {
        world: snapshot.states.atri_world_state.worlds[world.world.worldId].state,
        ui: structuredClone(fixture.ui),
        prefs: {},
        data: {},
        projection: displayInformation(snapshot),
        temporal: {
            world: [{ clockId: 'game-clock', tick: fixture.clockTick }],
            logical: { revisionId: snapshot.revision.revisionId, sequence: 0 },
            wall: { epochMs: 0 },
            activity: null,
        },
        shared: {},
        realm: {},
        continuity: {},
        selectors: {},
        env: fixture.environment,
        form: {},
        item: {},
        index: 0,
        event: {},
    };
    for (const [id, selector] of Object.entries(ui.selectors)) ctx.selectors[id] = selector.read(ctx);
    return { snapshot, ctx };
}

const hidden = (id, ctx) => byId.get(id).bindings.hidden?.read(ctx) === true;
const text = (id, ctx) => byId.get(id).bindings.text?.read(ctx) ?? byId.get(id).props.text;

for (const fixture of [desktopFixture, compactFixture]) {
    const { ctx } = preview(fixture);
    assert.equal(ctx.projection.story_event.items.length, 1);
    assert.equal(ctx.projection.schedule.items.length, 2);
    assert.equal(ctx.projection.church_projects.items.length, 1);
    assert.equal(ctx.projection.church_opportunities.items.length, 1);
    assert.equal(ctx.projection.people_recent.items.length, 1);

    assert.equal(text('story_clock', ctx), 'Day 1 · Game Clock minute ' + (fixture.clockTick % 1440));
    const eventCtx = { ...ctx, item: ctx.projection.story_event.items[0], index: 0 };
    assert.equal(text('story_event_title', eventCtx), 'Sanctuary Visitor');
    assert.equal(text('people_relationship', ctx), 'Relationship · acquainted');

    const scheduleCtx = { ...ctx, ui: { ...ctx.ui, section: 'schedule' }, selectors: {} };
    for (const [id, selector] of Object.entries(ui.selectors)) scheduleCtx.selectors[id] = selector.read(scheduleCtx);
    assert.equal(hidden('schedule_page', scheduleCtx), false);
    assert.equal(text('schedule_clock', scheduleCtx), 'Day 1 · Game Clock minute ' + (fixture.clockTick % 1440));
    const scheduleItemCtx = { ...scheduleCtx, item: scheduleCtx.projection.schedule.items[0], index: 0 };
    assert.match(text('schedule_record_time', scheduleItemCtx), /Day 1 · minute 540/);

    const churchCtx = { ...ctx, ui: { ...ctx.ui, section: 'church' }, selectors: {} };
    for (const [id, selector] of Object.entries(ui.selectors)) churchCtx.selectors[id] = selector.read(churchCtx);
    assert.equal(hidden('church_page', churchCtx), false);
    assert.equal(hidden('church_overview_panel', churchCtx), false);
    assert.equal(text('church_money', churchCtx), 'Money 120');

    const peopleCtx = { ...ctx, ui: { ...ctx.ui, section: 'people' }, selectors: {} };
    for (const [id, selector] of Object.entries(ui.selectors)) peopleCtx.selectors[id] = selector.read(peopleCtx);
    assert.equal(hidden('people_page', peopleCtx), false);
    assert.equal(text('people_relationship', peopleCtx), 'Relationship · acquainted');

    if (fixture.environment.device === 'desktop') {
        assert.equal(hidden('desktop_context', ctx), false);
        assert.equal(hidden('compact_context', ctx), true);
    } else {
        assert.equal(hidden('desktop_context', ctx), true);
        assert.equal(hidden('compact_context', ctx), false);
    }
}

const serialized = JSON.stringify({ project: projectRaw, ui: uiRaw, logic: logicRaw, story: storyRaw }).toLowerCase();
for (const forbidden of [
    'next_action', 'quick_choice', 'curator', 'story compression', 'day compression',
    'asset-pack', 'media-scene', 'gal runtime', 'full experience', '<script', 'regex html',
]) assert.equal(serialized.includes(forbidden), false, 'Phase 4 forbidden content leaked: ' + forbidden);
for (const id of [...Object.keys(ui.actions), ...byId.keys()]) {
    assert.equal(/(^|[-_])choice($|[-_])/.test(id), false, 'Narrative Choice UI leaked: ' + id);
}

assert.equal(world.revision.baseline.people.caretaker.relationship, 'acquainted');

console.log('Phase 4 Hybrid Application Completion targeted validation: PASS');
console.log('Church complete page + Schedule timeline + People + Story Header/Context Rail/Sheet: PASS');
console.log('Story/Scene text presentation + display-only Message Projection: PASS');
console.log('Desktop/compact Preview fixtures: PASS');
console.log('providerCalls=0');
