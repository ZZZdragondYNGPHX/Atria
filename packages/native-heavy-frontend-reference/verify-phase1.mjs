import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertAtriaProjectSource } from '../../src/native/project-source.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';

const projectPath = new URL('./project/atria.project.json', import.meta.url);
const uiPath = new URL('./project/ui/main.json', import.meta.url);

const rawProject = JSON.parse(await readFile(projectPath, 'utf8'));
const rawUi = JSON.parse(await readFile(uiPath, 'utf8'));

const project = assertAtriaProjectSource(rawProject);
assert.equal(project.format, 'atria-project-source');
assert.equal(project.schemaVersion, 1);
assert.equal(project.package.runtime.experience.mode, 'hybrid');
assert.equal(project.package.runtime.experience.componentModelVersion, 2);
assert.equal(project.package.runtime.experience.component, 'ui/main.json');
assert.deepEqual(project.assetFiles, []);
assert.equal(project.package.memory, undefined);

const contract = project.package.runtime.experienceContract;
assert.ok(contract);
assert.equal(contract.presentationRuntime, undefined);

const ui = compileUiDocument(rawUi, { mode: 'hybrid' });
assert.equal(ui.schemaVersion, 2);
assert.equal(ui.opening.initial, 'welcome');
assert.equal(ui.opening.confirmAction, 'finish_opening');
assert.equal(ui.localState.section.default, 'story');
assert.deepEqual(ui.localState.section.enum, ['story', 'church', 'schedule', 'phone', 'people']);
assert.equal(ui.conversation.mode, 'reader');
assert.equal(ui.conversation.profile, 'novel');

const rootViews = ui.views.filter(view => view.surface === 'app.root' && view.mount === 'always');
assert.equal(rootViews.length, 1);
const main = rootViews[0];

function flatten(node, out = []) {
    out.push(node);
    for (const child of node.children ?? []) flatten(child, out);
    return out;
}
const nodes = flatten(main.root);
const byId = new Map(nodes.map(node => [node.id, node]));
assert.equal(byId.get('conversation_slot').type, 'native-slot');
assert.equal(byId.get('conversation_slot').props.component, 'conversation');
assert.equal(byId.get('composer_slot').type, 'native-slot');
assert.equal(byId.get('composer_slot').props.component, 'composer');

for (const id of ['desktop_story', 'desktop_church', 'desktop_schedule', 'desktop_phone', 'desktop_people']) {
    assert.equal(byId.get(id).type, 'button');
}
assert.equal(byId.get('compact_nav').type, 'select');

function context(device, section = 'story') {
    const env = {
        device,
        orientation: device === 'desktop' ? 'landscape' : 'portrait',
        touch: device !== 'desktop',
        keyboard: true,
        reducedMotion: false,
        width: device === 'desktop' ? 1440 : 390,
        height: 900,
    };
    const ctx = {
        world: {}, ui: { player_name: 'Preview', section }, prefs: {}, data: {},
        projection: {}, shared: {}, realm: {}, continuity: {}, selectors: {}, env,
    };
    for (const [id, selector] of Object.entries(ui.selectors)) {
        ctx.selectors[id] = selector.read(ctx);
    }
    return ctx;
}
function hidden(nodeId, ctx) {
    const binding = byId.get(nodeId)?.bindings?.hidden;
    return binding ? binding.read(ctx) === true : false;
}

const desktop = context('desktop');
assert.equal(desktop.selectors.story_active, true);
assert.equal(hidden('story_page', desktop), false);
assert.equal(hidden('desktop_nav', desktop), false);
assert.equal(hidden('compact_nav', desktop), true);

const compact = context('mobile');
assert.equal(compact.selectors.story_active, true);
assert.equal(hidden('story_page', compact), false);
assert.equal(hidden('desktop_nav', compact), true);
assert.equal(hidden('compact_nav', compact), false);
assert.equal(hidden('desktop_context', compact), true);
assert.equal(hidden('compact_context', compact), false);

const serialized = JSON.stringify({ project: rawProject, ui: rawUi }).toLowerCase();
for (const forbidden of ['next_action', 'asset pack', 'gal runtime', 'story compression', 'day compression', 'curator']) {
    assert.equal(serialized.includes(forbidden), false, 'forbidden Phase 1 feature leaked: ' + forbidden);
}

console.log('Phase 1 targeted validation: PASS');
console.log('Project Source: atria-project-source@1');
console.log('Experience: Hybrid UI v2 with one app.root');
console.log('Opening: minimal Host lifecycle-backed flow');
console.log('Story: default with Native Conversation + Composer');
console.log('Desktop preview-state: Story visible; desktop nav visible; compact nav hidden');
console.log('Compact preview-state: Story visible; compact nav visible; Context Sheet path active');
console.log('Assets: assetFiles=[]; Phase 1 shell regression remains intact as later Authority phases are added');
