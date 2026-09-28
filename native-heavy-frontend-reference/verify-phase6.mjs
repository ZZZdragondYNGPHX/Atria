import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    AssetStore,
    KnowledgeRepo,
    PackageInstaller,
    PackageRepo,
    ProjectAgentService,
    ProjectStore,
    SavePointRepo,
    SessionCore,
    SessionRepo,
    StudioPreviewHost,
    StudioService,
    WorldRepo,
    assertAtriaProjectSource,
} from '../../src/native/index.js';
import { createGitClient } from '../../src/git/client.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { displayInformation } from '../../public/shared/native-information-runtime.js';
import { initialLifecycle } from '../../src/native/lifecycle-authority.js';
import { inspectExperienceHealth } from '../../src/native/experience-health.js';
import { assertStudioScenario, runStudioScenario } from '../../src/native/studio-scenario.js';
import { makeTempFsEngine } from '../../tests/storage/harness/fs-harness.js';

const here = new URL('.', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, here), 'utf8'));
const projectRaw = await readJson('project/atria.project.json');
const uiRaw = await readJson('project/ui/main.json');
const logicRaw = await readJson('project/logic/world.json');
const phonePreview = await readJson('previews/phase6-phone-unread.json');
const scenarioEntries = await Promise.all([
    ['church-day-cycle', readJson('scenarios/church-day-cycle.json')],
    ['story-turn', readJson('scenarios/story-turn.json')],
    ['communication', readJson('scenarios/communication.json')],
    ['branch-restore', readJson('scenarios/branch-restore.json')],
].map(async ([name, pending]) => [name, await pending]));
const scenarios = new Map(scenarioEntries.map(([name, raw]) => [name, { raw, compiled: assertStudioScenario(raw) }]));

const project = assertAtriaProjectSource(projectRaw);
const ui = compileUiDocument(uiRaw, { mode: 'hybrid' });
const contract = project.package.runtime.experienceContract;
const world = project.worlds[0];

assert.equal(project.package.version, '0.6.0-phase6');
assert.equal(project.assetFiles.length, 0);
assert.deepEqual([...scenarios.keys()], ['church-day-cycle', 'story-turn', 'communication', 'branch-restore']);

const branchScenario = scenarios.get('branch-restore').compiled;
assert.ok(branchScenario.steps.some(step => step.kind === 'checkpoint' && step.input === 'day-root'));
assert.ok(branchScenario.steps.some(step => step.kind === 'restore' && step.input === 'day-root'));
assert.ok(branchScenario.steps.some(step => step.kind === 'turn'));
assert.ok(branchScenario.steps.some(step => step.kind === 'lifecycle' && step.input?.kind === 'app.command' && step.input.domainId === 'sms-threads'));
assert.ok(branchScenario.steps.some(step => step.kind === 'lifecycle' && step.input?.kind === 'clock.advance'));
assert.ok(branchScenario.steps.some(step => step.kind === 'assert' && step.input.path === 'timeline.length' && step.input.equals === 0));

const roots = ui.views.map(view => view.root);
const flat = [];
while (roots.length) {
    const node = roots.pop();
    flat.push(node);
    roots.push(...node.children);
}
const byId = new Map(flat.map(node => [node.id, node]));
for (const id of ['story_page', 'church_page', 'schedule_page', 'phone_page', 'people_page', 'phone_messages_panel', 'phone_social_panel', 'phone_mail_panel']) {
    assert.ok(byId.has(id), 'Missing final Preview surface ' + id);
}
function previewFixture(fixture) {
    const lifecycle = initialLifecycle(contract.lifecycleRuntime);
    lifecycle.clocks['game-clock'] = fixture.clockTick;
    for (const [domainId, records] of Object.entries(fixture.records)) lifecycle.domains[domainId].records.push(...structuredClone(records));
    const snapshot = {
        session: { sessionId: 'phase6-preview', packageVersionId: 'phase6-preview' },
        revision: { revisionId: 'phase6-preview', branchId: 'phase6-preview' },
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
        prefs: {}, data: {}, projection: displayInformation(snapshot),
        temporal: { world: [{ clockId: 'game-clock', tick: fixture.clockTick }], logical: { revisionId: snapshot.revision.revisionId, sequence: 0 }, wall: { epochMs: 0 }, activity: null },
        shared: {}, realm: {}, continuity: {}, selectors: {}, env: fixture.environment, form: {}, item: {}, index: 0, event: {},
    };
    for (const [id, selector] of Object.entries(ui.selectors)) ctx.selectors[id] = selector.read(ctx);
    return ctx;
}
function withUi(ctx, patch) {
    const next = { ...ctx, ui: { ...ctx.ui, ...patch }, selectors: {} };
    for (const [id, selector] of Object.entries(ui.selectors)) next.selectors[id] = selector.read(next);
    return next;
}
const hidden = (id, ctx) => byId.get(id).bindings.hidden?.read(ctx) === true;
const phoneCtx = previewFixture(phonePreview);
assert.equal(phonePreview.environment.device, 'mobile');
assert.equal(phonePreview.environment.width, 390);
assert.equal(phoneCtx.projection.phone.items.length, 3);
assert.deepEqual(new Set(phoneCtx.projection.phone.items.map(item => item.data.channel)), new Set(['sms', 'social', 'mail']));
assert.equal(phoneCtx.projection.phone.items.filter(item => item.data.unread === true).length, 3);
assert.equal(hidden('phone_page', phoneCtx), false);
assert.equal(hidden('phone_messages_panel', phoneCtx), false);
assert.equal(hidden('phone_social_panel', phoneCtx), true);
assert.equal(hidden('phone_mail_panel', phoneCtx), true);
assert.equal(hidden('phone_social_panel', withUi(phoneCtx, { phone_section: 'social' })), false);
assert.equal(hidden('phone_mail_panel', withUi(phoneCtx, { phone_section: 'mail' })), false);

const files = () => new Map([
    ['ui/main.json', Buffer.from(JSON.stringify(uiRaw, null, 2) + '\n')],
    ['logic/world.json', Buffer.from(JSON.stringify(logicRaw, null, 2) + '\n')],
]);

const exact = await makeTempFsEngine();
try {
    const projectStore = new ProjectStore({ directoriesByHandle: () => exact.dirs });
    const worldRepo = new WorldRepo({ engine: exact.engine });
    const knowledgeRepo = new KnowledgeRepo({ engine: exact.engine });
    const assetStore = new AssetStore({ engine: exact.engine, directoriesByHandle: () => exact.dirs });
    const studio = new StudioService({ projectStore, worldRepo, knowledgeRepo, assetStore, gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
    const created = await studio.createProject(exact.handle, structuredClone(projectRaw), { files: files() });
    const baseRevision = created.revision.revision;
    const validation = await studio.validateProject(exact.handle, project.project.projectId);
    assert.equal(validation.status, 'passed', JSON.stringify(validation, null, 2));

    const preflight = await studio.preflightProject(exact.handle, project.project.projectId, { baseRevision });
    assert.equal(preflight.projectId, project.project.projectId);
    assert.equal(preflight.manifest.packageId, project.project.packageId);
    assert.equal(preflight.manifest.version, '0.6.0-phase6');
    assert.ok(preflight.packageVersion.packageVersionId);
    assert.ok(preflight.preflight);

    const previewed = await studio.previewProject(exact.handle, project.project.projectId, { baseRevision, entryPointId: branchScenario.entryPointId });
    assert.equal(previewed.preview.persisted, false);
    assert.equal(previewed.preview.experience.mode, 'hybrid');
    assert.deepEqual(studio.getPreviewUi(exact.handle, previewed.preview.previewId).model, uiRaw);
    assert.equal(studio.closePreview(exact.handle, previewed.preview.previewId), true);

    const built = await studio.buildProject(exact.handle, project.project.projectId, { baseRevision });
    assert.ok(Buffer.isBuffer(built.built.archive));
    assert.equal(built.built.manifest.packageId, project.project.packageId);
    assert.equal(built.built.manifest.version, '0.6.0-phase6');

    const installer = new PackageInstaller({ packageRepo: new PackageRepo({ engine: exact.engine }), assetStore });
    const installed = await installer.install(exact.handle, built.built.archive, { grantedPermissions: built.built.preflight.requiredPermissions });
    const core = new SessionCore({ sessionRepo: new SessionRepo({ engine: exact.engine }), savePointRepo: new SavePointRepo({ engine: exact.engine }), packageInstaller: installer, knowledgeRepo });
    let snapshot = await core.create(exact.handle, { packageId: installed.manifest.packageId, packageVersionId: installed.manifest.packageVersionId, entryPointId: branchScenario.entryPointId });
    snapshot = await core.applyLifecycleCommand(exact.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'phase6-health-ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: snapshot.revision.revisionId });
    const health = await inspectExperienceHealth(core, exact.handle, snapshot.session.sessionId);
    assert.equal(health.status, 'healthy', JSON.stringify(health, null, 2));
    assert.equal(health.migration.status, 'exact-version-pinned');
    assert.equal(health.migration.automatic, false);
    assert.equal(health.anchor.packageVersionId, snapshot.session.packageVersionId);
    assert.ok(health.domains.some(domain => domain.id === 'sms-threads'));
    assert.ok(health.domains.some(domain => domain.id === 'schedule'));
    assert.ok(health.tasks.pending.every(item => item.taskId === 'social'));
    assert.equal(health.diagnostics.some(item => item.severity === 'error'), false);
} finally {
    await exact.cleanup();
}

const recorded = await makeTempFsEngine();
try {
    const recordedProject = structuredClone(projectRaw);
    recordedProject.package.permissions = recordedProject.package.permissions.map(item => item.permission === 'generation' ? { ...item, required: false } : item);
    const projectStore = new ProjectStore({ directoriesByHandle: () => recorded.dirs });
    const worldRepo = new WorldRepo({ engine: recorded.engine });
    const knowledgeRepo = new KnowledgeRepo({ engine: recorded.engine });
    const assetStore = new AssetStore({ engine: recorded.engine, directoriesByHandle: () => recorded.dirs });
    const studio = new StudioService({ projectStore, worldRepo, knowledgeRepo, assetStore, gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost(), simulationRunner: runStudioScenario });
    const created = await studio.createProject(recorded.handle, recordedProject, { files: files() });
    const baseRevision = created.revision.revision;

    for (const [name, value] of scenarios) {
        const simulated = await studio.simulateProject(recorded.handle, project.project.projectId, { baseRevision, scenario: value.raw });
        assert.equal(simulated.status, 'completed', name + ' Studio simulation unavailable');
        assert.equal(simulated.result.status, 'passed', name + ': ' + JSON.stringify(simulated.result, null, 2));
        assert.equal(simulated.result.providerCalls, 0, name + ' must not call a provider');
        assert.equal(simulated.result.persisted, false, name + ' must not persist');
        assert.equal(simulated.result.steps.length, value.compiled.steps.length, name + ' did not run every step');
    }

    const agent = new ProjectAgentService({ studio });
    let task = await agent.createTask(recorded.handle, project.project.projectId, {
        intent: 'Phase 6 verify the Studio prepare_review, human Review gate, commit and Build path without changing Package authority.',
        baseRevision,
    });
    task = await agent.executeTool(recorded.handle, project.project.projectId, task.taskId, {
        name: 'atri_agent_set_plan',
        args: { summary: 'Exercise one bounded source proposal through the real Studio review gate.', steps: [{ id: 'review-gate', title: 'Review a bounded source-only marker', impact: 'low' }] },
    });
    task = await agent.executeTool(recorded.handle, project.project.projectId, task.taskId, {
        name: 'atri_agent_source_write',
        args: { path: 'phase6-review-marker.txt', content: 'Phase 6 ephemeral prepare_review marker. No runtime authority.\n', encoding: 'utf8', stepId: 'review-gate' },
    });
    task = await agent.executeTool(recorded.handle, project.project.projectId, task.taskId, {
        name: 'atri_agent_prepare_review',
        args: { entryPointId: branchScenario.entryPointId, simulationOptions: { scenario: scenarios.get('branch-restore').raw } },
    });
    assert.equal(task.status, 'review', JSON.stringify(task.validation, null, 2));
    assert.deepEqual(task.validation, { status: 'passed', diagnostics: [] });
    assert.equal(task.review.required, true);
    assert.equal(task.review.highImpact, false);
    assert.equal(task.preview.persisted, false);
    assert.equal(task.simulation.status, 'completed');
    assert.equal(task.simulation.result.status, 'passed');
    assert.equal(task.simulation.result.providerCalls, 0);
    assert.equal(task.operations.length, 1);
    assert.equal(task.operations[0].operation.target.path, 'phase6-review-marker.txt');

    task = await agent.commit(recorded.handle, project.project.projectId, task.taskId);
    assert.equal(task.status, 'completed');
    assert.equal(task.changeSets.length, 1);
    const reviewedRevision = task.changeSets[0].resultingRevision;
    assert.ok(reviewedRevision && reviewedRevision !== baseRevision);
    const reviewedBuild = await studio.buildProject(recorded.handle, project.project.projectId, { baseRevision: reviewedRevision });
    assert.ok(Buffer.isBuffer(reviewedBuild.built.archive));
} finally {
    await recorded.cleanup();
}

const serialized = JSON.stringify({ project: projectRaw, ui: uiRaw, logic: logicRaw, scenarios: [...scenarios.values()].map(item => item.raw), preview: phonePreview }).toLowerCase();
for (const forbidden of [
    'next_action', 'quick_choice', 'curator', 'story compression', 'day compression',
    'package memory store', 'package memory task', 'asset-pack', 'media-scene',
    'gal runtime', 'full experience', '<script', 'regex html',
]) assert.equal(serialized.includes(forbidden), false, 'Phase 6 forbidden content leaked: ' + forbidden);

console.log('Phase 6 Branch / Regression / Build targeted validation: PASS');
console.log('branch-restore + four recorded/mock Scenarios: PASS');
console.log('Experience Health + Preview coverage + Studio preflight: PASS');
console.log('prepare_review + explicit Review gate + Commit + Build: PASS');
console.log('providerCalls=0');
