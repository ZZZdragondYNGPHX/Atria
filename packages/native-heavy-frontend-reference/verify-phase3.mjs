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
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { compileNativeKnowledgePlan } from '../../public/scripts/native/knowledge-runtime.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { initialLifecycle } from '../../src/native/lifecycle-authority.js';
import { assertStudioScenario, runStudioArchiveScenario } from '../../src/native/studio-scenario.js';
import { makeTempFsEngine } from '../../tests/storage/harness/fs-harness.js';

const here = new URL('.', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, here), 'utf8'));
const projectRaw = await readJson('project/atria.project.json');
const uiRaw = await readJson('project/ui/main.json');
const logicRaw = await readJson('project/logic/world.json');
const storyRaw = await readJson('scenarios/story-turn.json');
const churchRaw = await readJson('scenarios/church-day-cycle.json');

const project = assertAtriaProjectSource(projectRaw);
const logic = compileDeclarativeLogic(logicRaw);
const story = assertStudioScenario(storyRaw);
const church = assertStudioScenario(churchRaw);
const contract = project.package.runtime.experienceContract;

assert.equal(project.package.version, '0.3.0-phase3');
assert.ok(project.package.capabilities.includes('knowledge'));
assert.ok(project.package.capabilities.includes('memory'));
assert.equal(project.package.memory, undefined);
for (const id of ['turn-contract','turn-envelope','narrative-outcome','model-task','auxiliary-task','perspective']) {
    assert.ok(contract.capabilities.some(item => item.id === id && item.required && item.version === 1), 'missing capability ' + id);
}
assert.equal(contract.taskRuntime.turn.policy, 'narrative-outcome');
assert.equal(contract.taskRuntime.turn.narratorTaskId, 'narrator');
assert.equal(contract.taskRuntime.turn.interpreterTaskId, 'interpreter');
assert.deepEqual(contract.taskRuntime.turn.stages, []);
const tasks = new Map(contract.taskRuntime.tasks.map(task => [task.id, task]));
assert.equal(tasks.get('narrator').resultPolicy.resultClass, 'presentation');
assert.equal(tasks.get('interpreter').resultPolicy.resultClass, 'world_outcome_proposal');
assert.equal(tasks.get('planner').resultPolicy.sink, 'proposal');
assert.equal(tasks.get('planner').resultPolicy.applyCommand, undefined);
assert.equal(tasks.get('world-feedback').resultPolicy.sink, 'artifact');
assert.equal(tasks.get('world-feedback').resultPolicy.applyCommand, undefined);
assert.deepEqual(tasks.get('interpreter').interpretation.allowedEventTypes, [
    'story.beat.narrative','story.beat.activity','story.beat.task','story.beat.transition',
]);
assert.equal(logic.interpretations.length, 4);
for (const eventType of tasks.get('interpreter').interpretation.allowedEventTypes) {
    assert.ok(logic.interpretations.some(mapping => mapping.eventType === eventType), 'missing interpretation mapping ' + eventType);
}

assert.equal(project.knowledge.length, 1);
assert.equal(project.knowledgeBindings.length, 1);
assert.deepEqual(project.package.entryPoints[0].knowledgeBindingIds, [project.knowledgeBindings[0].knowledgeBindingId]);
const narratorView = contract.informationRuntime.views.find(view => view.taskId === 'narrator');
assert.equal(narratorView.knowledge, true);
assert.equal(narratorView.memory, true);
assert.ok(narratorView.sources.includes('event-context'));
assert.ok(narratorView.sources.includes('timeline-context'));

const world = project.worlds[0];
const timelineMessageId = 'msg_00000000000000000000000000000071';
const branchId = 'br_00000000000000000000000000000072';
const revisionId = 'rev_00000000000000000000000000000073';
const lifecycle = initialLifecycle(contract.lifecycleRuntime);
lifecycle.domains.events.records.push({
    id:'story-current', scopeId:'session', status:'active', pinned:false,
    value:{kind:'system',origin:'composer',participants:['actor_b48a53176eb663a1af411fb6f8638d66'],location:'sanctuary',status:'active',
      premise:'A visitor arrives.',goal:'Advance the encounter.',current_beat:'narrative',resolved_beats:0,started_at:480,
      outcome_receipt_refs:[],narrative_refs:[]},
});
const snapshot = {
    session:{sessionId:'ses_00000000000000000000000000000070',packageVersionId:'pkgv_00000000000000000000000000000070'},
    revision:{revisionId,branchId},
    manifest:null,
    knowledge:null,
    timeline:[{messageId:timelineMessageId,variantId:'var_00000000000000000000000000000074',sequence:0,role:'assistant',
      actorId:'actor_b48a53176eb663a1af411fb6f8638d66',content:'The caretaker remembers a prior visitor.'}],
    states:{
      atri_lifecycle:lifecycle,
      atri_world_state:{primaryWorldId:'world_0f47cf3a197b4af1a416084443678d9c',worlds:{'world_0f47cf3a197b4af1a416084443678d9c':{state:structuredClone(world.revision.baseline)}}},
    },
};

const h = await makeTempFsEngine();
try {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    await projectStore.create(h.handle, projectRaw, {
        files:new Map([
            ['ui/main.json',Buffer.from(JSON.stringify(uiRaw,null,2)+'\n')],
            ['logic/world.json',Buffer.from(JSON.stringify(logicRaw,null,2)+'\n')],
        ]),
    });
    const built = await buildProjectPackage({
        handle:h.handle,projectId:project.project.projectId,projectStore,
        worldRepo:new WorldRepo({engine:h.engine}),
        knowledgeRepo:new KnowledgeRepo({engine:h.engine}),
        assetStore:new AssetStore({engine:h.engine,directoriesByHandle:()=>h.dirs}),
    });
    snapshot.manifest = built.manifest;
    snapshot.knowledge = {bindings:built.manifest.knowledgeBindings,snapshots:[]};

    const knowledgePlan = compileNativeKnowledgePlan(snapshot,{target:'narrator'});
    assert.equal(knowledgePlan.included.length,2);
    assert.ok(knowledgePlan.included.every(item => item.authority === 'package_knowledge'));

    const projected = projectInformation(snapshot,'narrator-context',{purpose:'context'});
    assert.ok(projected.items.some(item => item.sourceId === 'event-context' && item.data.current_beat === 'narrative'));

    const contextPlan = await compileNativeContextPlan(snapshot,{
        modelContextLimit:16000,responseReserve:1000,informationTaskId:'narrator',
        memoryEvidence:[{memoryId:'native-memory-1',content:'A recalled visitor once asked for shelter.',
          sourceRefs:[{kind:'timeline',messageId:timelineMessageId,branchId,revisionId}]}],
    });
    assert.ok(contextPlan.included.some(item => item.lane === 'knowledge'));
    assert.ok(contextPlan.included.some(item => item.lane === 'memory' && item.metadata?.memoryId === 'native-memory-1'));
    assert.ok(contextPlan.included.some(item => item.lane === 'current_state_event' && item.content.includes('current_beat')));

    const storyResult = await runStudioArchiveScenario(built.archive, story);
    assert.equal(storyResult.status,'passed',JSON.stringify(storyResult,null,2));
    assert.equal(storyResult.providerCalls,0);
    assert.equal(storyResult.persisted,false);
    assert.equal(storyResult.evidence.timelineEntries,1);

    const churchResult = await runStudioArchiveScenario(built.archive, church);
    assert.equal(churchResult.status,'passed',JSON.stringify(churchResult,null,2));
    assert.equal(churchResult.providerCalls,0);
} finally {
    await h.cleanup();
}

const serialized = JSON.stringify({project:projectRaw,logic:logicRaw,story:storyRaw});
for (const forbidden of [
    'next_action','Curator','Story Compression','Day Compression','asset-pack','media-scene',
    'GAL Runtime','Full Experience','atri_custom_memory','save-slot','<script','regex html',
]) assert.equal(serialized.includes(forbidden),false,'Phase 3 forbidden content leaked: '+forbidden);

console.log('Phase 3 Narrative Runtime + Knowledge targeted validation: PASS');
console.log('story-turn: recorded Native narrative-outcome -> G1 App outcome -> Event Beat -> Timeline; providerCalls=0');
