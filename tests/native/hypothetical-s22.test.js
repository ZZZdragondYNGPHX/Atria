import { expect, jest, test } from '@jest/globals';
import { prepareHypothetical, hypotheticalCurrent } from '../../src/native/hypothetical-authority.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { simulationTaskFixture } from './helpers/simulation-task-fixture.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

function transactionFixture(change = () => {}) {
    return authorityCandidateFixture(({ contract, logic }) => {
        logic.transactions[0].effects = logic.transactions[0].effects.filter(effect => !['clock.advance', 'workflow.transition'].includes(effect.kind));
        change({ contract, logic });
    });
}
const request = (f, extra = {}) => ({ kind: 'transaction', viewId: 'player.notes', anchor: projectInformation(f.base, 'player.notes').anchor,
    transactionId: f.request.transactionId, input: f.request.input, ...extra });

test('S22 deterministic transaction returns only hypothetical authorized delta and leaves every original state untouched', async () => {
    const f = transactionFixture(), before = structuredClone(f.base);
    const artifact = await prepareHypothetical(f.base, f.installed, request(f));
    expect(artifact).toMatchObject({ kind: 'hypothetical', mode: 'deterministic', operation: 'transaction', uncertainty: { modelPrediction: 'not_used', realOutcome: 'not_observed' } });
    expect(artifact.delta[0].after.data).toEqual({ text: 'visible new note' });
    expect(JSON.stringify(artifact)).not.toContain('PRIVATE SENTINEL'); expect(artifact.candidate).toBeUndefined(); expect(artifact.receipt).toBeUndefined(); expect(artifact.proof).toBeUndefined();
    expect(f.base).toEqual(before); expect(Object.isFrozen(artifact.delta)).toBe(true);
    expect(hypotheticalCurrent(f.base, f.installed, artifact)).toBe(true);
    expect(await prepareHypothetical(f.base, f.installed, request(f))).toEqual(artifact);
});

test('S22 exact revision, scope, declaration, and pinned source changes invalidate hypothetical artifacts', async () => {
    const f = transactionFixture(), artifact = await prepareHypothetical(f.base, f.installed, request(f));
    for (const alter of [
        base => { base.revision.revisionId = 'rev_' + 'f'.repeat(32); },
        base => { base.states.atri_lifecycle.scopes.session.epoch++; },
        base => { base.states.atri_lifecycle.scopes.session.status = 'suspended'; },
        base => { base.states.atri_lifecycle.domains.notes.records[0].value.text = 'new private state'; },
        base => { base.manifest.actors[0].displayName = 'Revised'; },
        base => { base.timeline[0].content = 'Changed timeline without a new revision'; },
    ]) { const changed = structuredClone(f.base); alter(changed); expect(hypotheticalCurrent(changed, f.installed, artifact)).toBe(false); }
    const installed = { ...f.installed, sourceFiles: new Map(f.installed.sourceFiles) };
    installed.sourceFiles.set('logic.json', Buffer.from('{}')); expect(hypotheticalCurrent(f.base, installed, artifact)).toBe(false);
    const changedAssets = { ...f.installed, assets: new Map(f.installed.assets) };
    changedAssets.assets.set('data.changed', Buffer.from('changed')); expect(hypotheticalCurrent(f.base, changedAssets, artifact)).toBe(false);
    await expect(prepareHypothetical(f.base, f.installed, request(f, { anchor: { ...artifact.baseAnchor, revisionId: 'rev_' + 'f'.repeat(32) } }))).rejects.toThrow(/stale/);
    const suspended = structuredClone(f.base); suspended.states.atri_lifecycle.scopes.session.status = 'suspended';
    await expect(prepareHypothetical(suspended, f.installed, { ...request(f), anchor: { ...artifact.baseAnchor, scopeEpochs: {} } })).rejects.toThrow(/scope unavailable/);
});

test('S22 hidden or context-only views, unsupported operations and scheduling effects are rejected', async () => {
    for (const alter of [
        ({ logic }) => { logic.transactions[0].resolution = { kind: 'bounded_fortune', sides: 6, cases: [], fallback: 'success' }; },
        ({ logic }) => { logic.transactions[0].intent.expose = false; },
        ({ logic }) => { logic.transactions[0].effects.push({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }); },
        ({ logic }) => { logic.transactions[0].effects.push({ kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'begin' }); },
    ]) {
        const f = transactionFixture(alter); await expect(prepareHypothetical(f.base, f.installed, request(f))).rejects.toThrow(/unsupported/);
    }
    const f = transactionFixture();
    for (const extra of [{ viewId: 'missing' }, { kind: 'provider' }, { viewId: 'private' }]) await expect(prepareHypothetical(f.base, f.installed, request(f, extra))).rejects.toThrow();
    const privateView = { ...f.contract.informationRuntime.views[0], id: 'private', audience: 'task', taskId: 'task', exposure: ['context'] };
    f.contract.informationRuntime.views.push(privateView);
    await expect(prepareHypothetical(f.base, f.installed, request(f, { viewId: 'private' }))).rejects.toThrow(/view denied/);
});

test('S22 candidate-only automatic task dispatch is rejected without mutating the source', async () => {
    const f = transactionFixture(({ contract }) => {
        contract.taskRuntime = lifecycleFixture().taskRuntime;
        contract.lifecycleRuntime.automations = [{ id: 'candidate-task', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1,
            action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} } }];
    });
    const before = structuredClone(f.base);
    await expect(prepareHypothetical(f.base, f.installed, request(f))).rejects.toThrow(/Task scheduling unsupported/);
    expect(f.base).toEqual(before); expect(f.base.states.atri_lifecycle.outbox).toEqual([]);
});

test('S22 authority effect budgets, validators and input schemas remain enforced', async () => {
    const f = transactionFixture(({ contract }) => { contract.authorityRuntime.policy.maxWorldEvents = 1; });
    f.logic.transactions[0].effects.push({ kind: 'world.event', type: 'NoteChanged', payload: { amount: 1 } }); f.sync();
    await expect(prepareHypothetical(f.base, f.installed, request(f))).rejects.toThrow(/limit/);
    const locked = transactionFixture(); locked.base.states.atri_lifecycle.domains.notes.records[0].value.text = 'locked';
    await expect(prepareHypothetical(locked.base, locked.installed, request(locked))).rejects.toThrow();
    const invalid = transactionFixture(); await expect(prepareHypothetical(invalid.base, invalid.installed, request(invalid, { input: { target: 'main', text: 'changed', amount: 99 } }))).rejects.toThrow();
});

test('S22 declared clock rehearsal catches up privately without admitting an autonomous model Task', async () => {
    const f = simulationTaskFixture(), before = structuredClone(f.base);
    const input = { kind: 'clock.advance', commandId: 'advance', ticks: 4320, viewId: 'player.notes', anchor: projectInformation(f.base, 'player.notes').anchor };
    const artifact = await prepareHypothetical(f.base, f.installed, input);
    expect(artifact.projection.items[0].data).toEqual({ text: 'advanced' }); expect(artifact.work.clockAdvances).toBe(1);
    expect(artifact.work.worldEvents).toBe(3); expect(f.base).toEqual(before); expect(f.base.states.atri_lifecycle.outbox).toEqual([]);
    for (const ticks of [0, -1, 4321, Number.MAX_SAFE_INTEGER]) await expect(prepareHypothetical(f.base, f.installed, { ...input, ticks })).rejects.toThrow();
});

test('S22 Clock rehearsal rejects fortune Transactions and retains original World and Task state', async () => {
    const f = simulationTaskFixture();
    f.logic.transactions.find(tx => tx.id === 'calendar.advance').resolution = { kind: 'bounded_fortune', sides: 6, cases: [], fallback: 'advanced' };
    f.sync();
    const before = structuredClone(f.base);
    await expect(prepareHypothetical(f.base, f.installed, { kind: 'clock.advance', commandId: 'advance', ticks: 4320,
        viewId: 'player.notes', anchor: projectInformation(f.base, 'player.notes').anchor })).rejects.toThrow(/deterministic simulation unsupported/);
    expect(f.base).toEqual(before);
});

test('S22 Clock rehearsal enforces bounded simulation work and Package pins before producing an artifact', async () => {
    const f = simulationTaskFixture(), input = { kind: 'clock.advance', commandId: 'advance', ticks: 4320,
        viewId: 'player.notes', anchor: projectInformation(f.base, 'player.notes').anchor };
    f.contract.simulationRuntime.policy.maxSteps = 1;
    const before = structuredClone(f.base);
    await expect(prepareHypothetical(f.base, f.installed, input)).rejects.toThrow(/work limit/);
    expect(f.base).toEqual(before);
    const installed = { ...f.installed, manifest: structuredClone(f.installed.manifest) };
    installed.manifest.actors[0].displayName = 'Unpinned Actor';
    await expect(prepareHypothetical(f.base, installed, input)).rejects.toThrow(/pin mismatch/);
    expect(f.base).toEqual(before);
});

test('S22 an actual installed Session keeps Clock, World, pending Task, fees and persistent HEAD unchanged', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = simulationTaskFixture(), svc = services(h);
        const variant = f.contract.taskRuntime.tasks[0].variants[0];
        f.base.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: variant.prompt.revision, displayName: 'Hypothetical task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: variant.generation.revision, displayName: 'Hypothetical generation', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
        const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, archive);
        let base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        for (const action of [{ kind: 'experience.ready' }, { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'seed' } }]) {
            base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'setup-' + base.revision.revisionId, action }, { expectedRevisionId: base.revision.revisionId });
        }
        const bank = await svc.core.runs.status(h.handle, base.session.sessionId);
        const commit = jest.spyOn(svc.sessionRepo, 'commitSnapshot'), charge = jest.spyOn(svc.core.runs, 'chargeLocalWork');
        const installed = await svc.core._openPackage(h.handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        const artifact = await prepareHypothetical(base, installed, { kind: 'clock.advance', commandId: 'advance', ticks: 4320, viewId: 'player.notes', anchor: projectInformation(base, 'player.notes').anchor });
        expect(artifact.projection.items[0].data.text).toBe('advanced'); expect(commit).not.toHaveBeenCalled(); expect(charge).not.toHaveBeenCalled();
        expect(await svc.core.load(h.handle, base.session.sessionId)).toEqual(base); expect(await svc.core.runs.status(h.handle, base.session.sessionId)).toEqual(bank);
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'actual-advance',
            action: { kind: 'clock.advance', commandId: 'advance', ticks: 4320 } }, { expectedRevisionId: base.revision.revisionId });
        expect(base.states.atri_lifecycle.outbox).toHaveLength(1);
        commit.mockClear(); charge.mockClear();
        const pendingBank = await svc.core.runs.status(h.handle, base.session.sessionId);
        await prepareHypothetical(base, installed, { kind: 'clock.advance', commandId: 'advance', ticks: 1, viewId: 'player.notes', anchor: projectInformation(base, 'player.notes').anchor });
        expect(commit).not.toHaveBeenCalled(); expect(charge).not.toHaveBeenCalled();
        expect(await svc.core.load(h.handle, base.session.sessionId)).toEqual(base);
        expect(await svc.core.runs.status(h.handle, base.session.sessionId)).toEqual(pendingBank);
    } finally { await h.cleanup(); }
}, 30000);
