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
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { assertValidWorldState } from '../../public/scripts/native/experience/world/schema.js';
import { displayInformation } from '../../public/shared/native-information-runtime.js';
import { initialLifecycle } from '../../src/native/lifecycle-authority.js';
import { assertStudioScenario, runStudioArchiveScenario } from '../../src/native/studio-scenario.js';
import { makeTempFsEngine } from '../../tests/storage/harness/fs-harness.js';

const here = new URL('.', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, here), 'utf8'));
const projectRaw = await readJson('project/atria.project.json');
const uiRaw = await readJson('project/ui/main.json');
const logicRaw = await readJson('project/logic/world.json');
const scenarioRaw = await readJson('scenarios/church-day-cycle.json');

const project = assertAtriaProjectSource(projectRaw);
const ui = compileUiDocument(uiRaw, { mode: 'hybrid' });
const logic = compileDeclarativeLogic(logicRaw);
const scenario = assertStudioScenario(scenarioRaw);

assert.equal(project.package.version, '0.2.0-phase2');
assert.equal(project.assetFiles.length, 0);
assert.equal(project.worlds.length, 1);
assert.equal(project.package.runtime.experienceContract.taskRuntime, undefined);
assert.equal(project.package.runtime.experienceContract.presentationRuntime, undefined);
assert.equal(project.package.runtime.experienceContract.dataResources.length, 0);
assert.equal(logic.interpretations.length, 0);
assert.ok(logic.commands.some(command => command.id === 'church.settle-worked-day'));
assert.ok(logic.commands.some(command => command.id === 'church.settle-idle-day'));

const world = project.worlds[0];
assertValidWorldState(world.revision.baseline, world.revision.schema);
const contract = project.package.runtime.experienceContract;
assert.deepEqual(contract.lifecycleRuntime.domains.map(domain => domain.id), ['events', 'schedule', 'church-operations', 'church-projects', 'opportunities']);
assert.deepEqual(contract.lifecycleRuntime.clocks, [{ id: 'game-clock', unit: 'minute', initialTick: 480 }]);
assert.ok(contract.lifecycleRuntime.workflows.some(flow => flow.id === 'church-day-cycle'));
assert.equal(contract.lifecycleRuntime.automations.length, 0);
assert.equal(contract.lifecycleRuntime.interactions.length, 0);

const snapshot = {
    session: { sessionId: 'phase2-preview', packageVersionId: 'phase2-preview' },
    revision: { revisionId: 'phase2-preview', branchId: 'phase2-preview' },
    manifest: { actors: project.package.actors, worlds: project.worlds, runtime: { experienceContract: contract } },
    timeline: [],
    states: {
        atri_lifecycle: initialLifecycle(contract.lifecycleRuntime),
        atri_world_state: { primaryWorldId: world.world.worldId, worlds: { [world.world.worldId]: { state: structuredClone(world.revision.baseline) } } },
    },
};
snapshot.states.atri_lifecycle.domains.schedule.records.push({
    id: 'preview-outreach', scopeId: 'session', status: 'active', pinned: false,
    value: { actorId: 'actor_b48a53176eb663a1af411fb6f8638d66', title: 'Preview outreach', startTick: 540, endTick: 720, policy: 'background', operationKind: 'outreach', location: 'market', status: 'planned' },
});
snapshot.states.atri_lifecycle.domains['church-operations'].records.push({
    id: 'current-day', scopeId: 'session', status: 'active', pinned: false,
    value: { dayIndex: 1, outreachCount: 1, projectWorkCount: 0, expectedMoneyDelta: 35, expectedFollowerDelta: 2, expectedReputationDelta: 1, settlementStatus: 'open' },
});
const projection = displayInformation(snapshot);
assert.equal(projection.schedule.items.length, 1);
assert.equal(projection.church.items.length, 1);

const findNode = id => {
    const stack = ui.views.map(view => view.root);
    while (stack.length) {
        const node = stack.pop();
        if (node.id === id) return node;
        stack.push(...node.children);
    }
    throw new Error('Missing UI node ' + id);
};
const uiContext = {
    world: world.revision.baseline, projection,
    ui: { player_name: 'Caretaker', section: 'church' }, prefs: {}, data: {}, selectors: {},
    env: { device: 'desktop', orientation: 'landscape', touch: false, keyboard: true, reducedMotion: false, width: 1440, height: 900 },
    shared: {}, realm: {}, continuity: {}, form: {}, item: {}, index: 0, event: {},
};
assert.equal(findNode('church_money').bindings.text.read(uiContext), 'Money 120');
assert.equal(findNode('church_status').bindings.text.read(uiContext), 'Authority records 1');
assert.equal(findNode('schedule_status').bindings.text.read(uiContext), 'Scheduled records 1');

const h = await makeTempFsEngine();
try {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    await projectStore.create(h.handle, projectRaw, {
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
} finally {
    await h.cleanup();
}

const serialized = JSON.stringify({ project: projectRaw, ui: uiRaw, logic: logicRaw, scenario: scenarioRaw });
for (const forbidden of [
    'next_action', 'Curator', 'Story Compression', 'Day Compression', 'asset-pack', 'media-scene',
    'GAL Runtime', 'Full Experience', 'interpreterTaskId', 'promptProgramId', 'knowledgeBaseId',
]) assert.equal(serialized.includes(forbidden), false, 'Phase 2 forbidden content leaked: ' + forbidden);

console.log('Phase 2 authority/lifecycle contract, display-only Preview fixture, and church-day-cycle recorded Scenario passed.');
