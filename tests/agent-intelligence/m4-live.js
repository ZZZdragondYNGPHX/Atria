// Real, disposable deterministic M4 comparison. No provider implementation or
// API credential is loaded; --local commits only these synthetic authorities.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { USER_DIRECTORY_TEMPLATE } from '../../src/constants.js';
import { setConfigFilePath } from '../../src/util.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { createGitClient } from '../../src/git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo, buildAtriaPackageContainer } from '../../src/native/index.js';
import { runStudioScenario } from '../../src/native/studio-scenario.js';
import { CandidateComparisonService } from '../../src/native/candidate-comparison.js';
import { ProjectComparisonService } from '../../src/native/project-comparison.js';
import { actionReceipts } from '../../src/native/action-receipts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { createAuthoringOperation } from '../../public/scripts/native/studio-authoring.js';
import { predictionFixture } from '../native/helpers/prediction-fixture.js';
import { services as sessionServices } from '../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { projectSource } from './project-fixture.js';

setConfigFilePath(fileURLToPath(new URL('../../default/config.yaml', import.meta.url)));
assert(process.argv.slice(2).every(flag => ['--local', '--preflight'].includes(flag)), 'Supported modes: --local or --preflight');
const execute = process.argv.includes('--local') && !process.argv.includes('--preflight');
const OLD = 'Opening hours: 09:00.', TARGET = 'Opening hours: 10:00.', SECONDARY = 'General notice: welcome.';
const limits = { maxRequests: 2, maxTokens: 32000, localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } };
const summary = { stage: 'M4/S24', mode: 'real_deterministic_authorities', status: 'started', apiRequests: 0,
    baseline: 'Predeclared legal broad update; no model selected either arm.',
    qualityFloor: ['Exact requested hours reached', 'Original transaction or package validation passed', 'Formal original receipt verified'],
    limitations: ['Two finite synthetic tasks, not general decision-quality or model benefit',
        'The fixed comparator explicitly minimizes public changes; the baseline is not an independently sampled agent decision',
        'Recorded process CPU and wall time are observations, not hard limits or statistically established latency gains',
        'Formal authority/Studio work is included in observed arm time but not all is represented in the localWork ledger',
        'S25 slow-path semantic/latency benefit and S26 real rerank quality-cost remain unmeasured',
        'No currency spending or provider tokens; no claim of zero CPU', 'Synthetic fixtures are discarded'],
    domains: {}, failures: [] };

function harness(root, domain, arm) {
    const handle = 'm4', directory = path.join(root, domain, arm);
    const dirs = Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([key, relative]) => [key, path.join(directory, handle, relative)]));
    for (const key of ['root', 'assets', 'files', 'characters', 'chats', 'user', 'worlds']) fs.mkdirSync(dirs[key], { recursive: true });
    return { handle, dirs, engine: new FsEngine({ directoriesByHandle: owner => { assert.equal(owner, handle); return dirs; } }) };
}
async function measure(operation) {
    const started = performance.now(), cpu = process.cpuUsage();
    const observation = () => {
        const used = process.cpuUsage(cpu);
        return { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process' };
    };
    try { return { value: await operation(), observation: observation() }; }
    catch (error) { error.observations ??= []; error.observations.push(observation()); throw error; }
}
function costs(control) {
    const retired = control?.retiredCompute ?? {}, ledgers = control?.compute ? [control.compute] : Object.values(control?.operations ?? {}).flatMap(op => op.compute ? [op.compute] : []);
    const attempts = ledgers.flatMap(ledger => ledger.attempts), work = ledgers.flatMap(ledger => ledger.localWork ?? []);
    return { modelAttempts: (retired.modelAttempts ?? 0) + attempts.length,
        knownTokens: (retired.knownTotalTokens ?? 0) + attempts.reduce((sum, row) => sum + (row.usage?.totalTokens ?? 0), 0),
        unknownAttempts: (retired.unknownAttempts ?? 0) + attempts.filter(row => row.usage?.totalTokens == null).length,
        localJobs: (retired.localJobs ?? 0) + work.length,
        localEstimatedItems: (retired.localEstimatedItems ?? 0) + work.reduce((sum, row) => sum + row.estimatedItems, 0),
        localEstimatedInputBytes: (retired.localEstimatedInputBytes ?? 0) + work.reduce((sum, row) => sum + row.estimatedInputBytes, 0),
        localWallMs: (retired.localWallMs ?? 0) + work.reduce((sum, row) => sum + (row.usage?.wallMs ?? 0), 0),
        localFailedJobs: (retired.localFailedJobs ?? 0) + work.filter(row => row.usage?.outcome === 'failed').length,
        unknownLocalJobs: (retired.localUnknownJobs ?? 0) + work.filter(row => !row.usage).length };
}
const itemText = (snapshot, sourceId) => projectInformation(snapshot, 'player.notes', { purpose: 'display', includeRollups: false }).items.find(item => item.sourceId === sourceId)?.data.text;
const publicState = snapshot => projectInformation(snapshot, 'player.notes', { purpose: 'display', includeRollups: false }).items.map(({ sourceId, data }) => ({ sourceId, data }));

function sessionTemplate() {
    return predictionFixture(({ contract, logic }) => {
        contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
        contract.informationRuntime.sources.push({ id: 'public.secondary', kind: 'application', semantic: 'truth', scopeId: 'session', domainId: 'other', fields: [['text']] });
        contract.informationRuntime.views[0].sources.push('public.secondary');
        const broad = logic.transactions[0];
        broad.effects = broad.effects.filter(effect => effect.kind !== 'world.event');
        const secondary = broad.effects.find(effect => effect.domainId === 'other'); secondary.args.text = 'General notice: opening hours updated.';
        const narrow = structuredClone(broad); narrow.id = 'note.update-minimal'; narrow.verb = 'update_note_minimal';
        narrow.effects = narrow.effects.filter(effect => effect.domainId !== 'other'); logic.transactions.push(narrow);
    });
}
async function sessionArm(root, arm, template) {
    const h = harness(root, 'session', arm), svc = sessionServices(h);
    let sessionId, result;
    try {
        const built = buildAtriaPackageContainer({ manifest: template.base.manifest, sourceFiles: template.installed.sourceFiles, assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, built.archive);
        let base = await svc.core.create(h.handle, { packageId: template.base.session.packageId, packageVersionId: template.base.session.packageVersionId, entryPointId: template.base.session.entryPointId });
        sessionId = base.session.sessionId;
        for (const action of [{ kind: 'experience.ready' }, ...[['notes', OLD], ['other', SECONDARY]].map(([domainId, text]) =>
            ({ kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text } }))]) {
            base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: randomUUID(), action }, { expectedRevisionId: base.revision.revisionId });
        }
        base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Set opening hours to 10:00.' });
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-used' });
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits } });
        const host = { ...seeded, sessionCore: svc.core }, service = new CandidateComparisonService({ host });
        const actions = [{ id: 'broad', action: { kind: 'transaction', transactionId: 'note.update', input: { target: 'main', text: TARGET, amount: 1 } } },
            { id: 'minimal', action: { kind: 'transaction', transactionId: 'note.update-minimal', input: { target: 'main', text: TARGET, amount: 1 } } }];
        const view = projectInformation(base, 'player.notes'), initial = publicState(base), initialHash = hash({ states: base.states, timeline: base.timeline });
        const goal = { itemId: view.items.find(item => item.sourceId === 'public.notes').id, path: ['text'], equals: TARGET };
        result = { basePublicHash: hash(initial), exactPackageVersion: base.session.packageVersionId, configuredBudget: limits, comparison: null, receipt: null };
        summary.domains.session[arm] = result;
        if (!execute) return { ...result, preflight: true, cost: costs(await svc.core.runs.status(h.handle, base.session.sessionId)) };
        const execution = await measure(async () => {
            let selected = actions[0];
            if (arm === 'comparison') {
                const comparison = await service.prepare(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
                    request: { viewId: 'player.notes', anchor: view.anchor, requestId: 'm4-session', candidates: actions, goals: [goal] } });
                assert(comparison.candidates.every(candidate => candidate.goalsSatisfied === 1), 'Both real candidate previews must satisfy the same goal');
                assert.equal(comparison.selected.candidateId, 'minimal');
                const current = await svc.core.load(h.handle, base.session.sessionId);
                assert.equal(hash({ states: current.states, timeline: current.timeline }), initialHash);
                result.comparison = { comparisonId: comparison.comparisonId, candidates: comparison.candidates.map(({ id, goalsSatisfied, publicChanges }) => ({ id, goalsSatisfied, publicChanges })) };
                selected = actions.find(action => action.id === comparison.selected.candidateId);
            }
            const prepared = await svc.core.prepareAuthorityTurn(h.handle, base, { transactionId: selected.action.transactionId, input: selected.action.input });
            const actual = await svc.core.finalizeTurn(h.handle, base.session.sessionId, { invocationId: 'm4-formal-' + arm, authorityProof: prepared.proof,
                envelope: { schemaVersion: 1, narrative: 'Opening hours updated to 10:00.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: base.revision.revisionId });
            const receipt = actionReceipts(actual).at(-1); assert.equal(receipt.status, 'committed'); assert.equal(itemText(actual, 'public.notes'), TARGET);
            result.receipt = { receiptId: receipt.receiptId, status: receipt.status, authorityId: receipt.authorityId, committedRevisionId: receipt.committedRevisionId };
            const after = publicState(actual);
            result.goalPassed = itemText(actual, 'public.notes') === TARGET;
            result.publicChanges = after.filter(item => hash(item.data) !== hash(initial.find(before => before.sourceId === item.sourceId)?.data)).length;
            result.secondaryPreserved = itemText(actual, 'public.secondary') === SECONDARY;
            result.selected = selected.id;
            if (result.comparison) {
                const feedback = await service.feedback(h.handle, { sessionId: base.session.sessionId, comparisonId: result.comparison.comparisonId, receiptId: receipt.receiptId });
                assert.equal(feedback.deterministicPredictionError.exactMatch, true);
                result.comparison.observation = { deterministicPredictionError: feedback.deterministicPredictionError, modelPredictionError: feedback.modelPredictionError };
            }
        });
        result.observedArm = execution.observation;
        result.cost = costs(await svc.core.runs.status(h.handle, base.session.sessionId));
        assert.equal(result.cost.modelAttempts, 0); assert.equal(result.cost.localFailedJobs, 0);
        return result;
    } catch (error) {
        if (result && sessionId) {
            result.observedFailedArm = error.observations?.[0] ?? null;
            try { result.cost = costs(await svc.core.runs.status(h.handle, sessionId)); }
            catch (costError) { result.costUnavailable = costError.code ?? costError.name; }
        }
        throw error;
    } finally { await h.engine.close(); }
}

const write = (file, content) => createAuthoringOperation({ operationType: 'source.write', target: { path: file }, input: { content, encoding: 'utf8' } });
async function projectArm(root, arm, source) {
    const h = harness(root, 'project', arm), projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const studio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }),
        previewHost: new StudioPreviewHost(), simulationRunner: runStudioScenario });
    const agent = new ProjectAgentService({ studio, collectExperience: false }), projectId = source.project.projectId;
    let taskId, result;
    try {
        const files = new Map([['hours.md', Buffer.from(OLD)], ['notice.md', Buffer.from(SECONDARY)]]);
        const created = await studio.createProject(h.handle, source, { files });
        let task = await agent.createTask(h.handle, projectId, { intent: 'Set opening hours to 10:00.', baseRevision: created.revision.revision });
        taskId = task.taskId;
        // The normal original Task ledger needs configured limits before a
        // comparison. Account for this real source inventory in both arms.
        const inventory = { attemptId: randomUUID(), requestId: task.taskId, kind: 'context_build', estimatedItems: files.size + 1,
            estimatedInputBytes: Buffer.byteLength(JSON.stringify(source)) + [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0), targetFingerprint: hash(source) };
        const chargedAt = performance.now(), cpu = process.cpuUsage();
        await agent.chargeLocalWork(h.handle, projectId, task.taskId, task.baseRevision, limits, inventory, task.executionFingerprint);
        for (const [file, expected] of files) assert.deepEqual(await projectStore.readFile(h.handle, projectId, file), expected);
        const used = process.cpuUsage(cpu);
        await agent.settleLocalWork(h.handle, projectId, task.taskId, inventory.attemptId,
            { wallMs: performance.now() - chargedAt, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome: 'completed' });
        task = await agent.getTask(h.handle, projectId, task.taskId);
        const service = new ProjectComparisonService({ host: { studio, agent } });
        const candidates = [{ id: 'broad', operations: [write('hours.md', TARGET), write('notice.md', 'General notice: opening hours updated.')] },
            { id: 'minimal', operations: [write('hours.md', TARGET)] }];
        result = { baseSourceHash: hash(source), configuredBudget: limits, comparison: null, receipt: null };
        summary.domains.project[arm] = result;
        if (!execute) return { ...result, preflight: true, cost: costs(task) };
        const execution = await measure(async () => {
            let selected = candidates[0];
            if (arm === 'comparison') {
                const artifact = await service.prepare(h.handle, { projectId, taskId: task.taskId, expectedSequence: task.sequence, candidates });
                assert(artifact.candidates.every(candidate => candidate.validation.status === 'passed'), 'Both actual candidate validations must pass');
                assert.equal(artifact.selected.candidateId, 'minimal');
                result.comparison = { comparisonId: artifact.comparisonId, candidates: artifact.candidates.map(candidate =>
                    ({ id: candidate.candidateId, changedFiles: candidate.changes.length, validation: candidate.validation.status })) };
                selected = candidates.find(candidate => candidate.id === artifact.selected.candidateId);
                for (const [file, expected] of files) assert.deepEqual(await projectStore.readFile(h.handle, projectId, file), expected);
            }
            await agent.setPlan(h.handle, projectId, task.taskId, { summary: 'Update the opening hours', steps: [{ id: 'edit', title: 'Apply selected source update', impact: 'low' }] });
            for (const operation of selected.operations) await agent.executeTool(h.handle, projectId, task.taskId,
                { name: 'atri_agent_source_write', args: { path: operation.target.path, content: operation.input.content, stepId: 'edit' } });
            const review = await agent.prepareReview(h.handle, projectId, task.taskId, { simulationOptions: {
                scenario: { schemaVersion: 1, steps: [{ kind: 'assert', input: { path: 'timeline', equals: [] } }] } } });
            assert.equal(review.status, 'review'); assert.equal(review.validation.status, 'passed');
            assert.equal(review.simulation.result.status, 'passed'); assert.equal(review.simulation.result.providerCalls, 0);
            result.simulation = { status: review.simulation.result.status, steps: review.simulation.result.steps.length, providerCalls: review.simulation.result.providerCalls };
            task = await agent.commit(h.handle, projectId, task.taskId); assert.equal(task.status, 'completed');
            assert.equal((await projectStore.readFile(h.handle, projectId, 'hours.md')).toString(), TARGET);
            const receipt = await studio.inspectWorkspaceReceipt(h.handle, task.workspace, task.changeSets[0].changeSetId);
            assert(receipt?.resultingRevision); assert.equal(receipt.validation.status, 'passed');
            result.receipt = { changeSetId: receipt.changeSetId, resultingRevision: receipt.resultingRevision, validation: receipt.validation.status };
            result.goalPassed = true; result.selected = selected.id; result.changedFiles = 0;
            for (const [file, before] of files) if (!before.equals(await projectStore.readFile(h.handle, projectId, file))) result.changedFiles++;
            const semanticOperation = ({ operationType, target, input }) => ({ operationType, target, input });
            assert.deepEqual(receipt.operations.map(semanticOperation), selected.operations.map(semanticOperation));
            result.secondaryPreserved = (await projectStore.readFile(h.handle, projectId, 'notice.md')).toString() === SECONDARY;
            if (result.comparison) {
                const outcome = await service.outcome(h.handle, { comparisonId: result.comparison.comparisonId });
                assert.equal(outcome.status, 'observed'); assert.equal(outcome.receipt.resultingRevision, receipt.resultingRevision);
                result.comparison.outcome = { status: outcome.status, predictionError: outcome.predictionError, quality: outcome.quality };
            }
            if (review.preview?.previewId) studio.closePreview(h.handle, review.preview.previewId);
        });
        result.observedArm = execution.observation; result.cost = costs(await agent.getTask(h.handle, projectId, task.taskId));
        assert.equal(result.cost.modelAttempts, 0); assert.equal(result.cost.localFailedJobs, 0);
        return result;
    } catch (error) {
        if (result && taskId) {
            result.observedFailedArm = error.observations?.[0] ?? null;
            try { result.cost = costs(await agent.getTask(h.handle, projectId, taskId)); }
            catch (costError) { result.costUnavailable = costError.code ?? costError.name; }
        }
        throw error;
    } finally { await h.engine.close(); }
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-m4-comparison-'));
try {
    const all = await measure(async () => {
        const template = sessionTemplate(), source = projectSource();
        for (const arm of ['direct', 'comparison']) {
            summary.domains.session ??= {}; summary.domains.project ??= {};
            summary.phase = 'session:' + arm; summary.domains.session[arm] = await sessionArm(directory, arm, template);
            summary.phase = 'project:' + arm; summary.domains.project[arm] = await projectArm(directory, arm, source);
        }
        assert.equal(summary.domains.session.direct.basePublicHash, summary.domains.session.comparison.basePublicHash);
        assert.equal(summary.domains.session.direct.exactPackageVersion, summary.domains.session.comparison.exactPackageVersion);
        assert.equal(summary.domains.project.direct.baseSourceHash, summary.domains.project.comparison.baseSourceHash);
        if (execute) for (const [domain, rows] of Object.entries(summary.domains)) {
            assert(rows.direct.goalPassed && rows.comparison.goalPassed);
            const key = domain === 'session' ? 'publicChanges' : 'changedFiles';
            assert(rows.comparison[key] < rows.direct[key]);
            rows.finiteEffect = { directChanges: rows.direct[key], comparisonChanges: rows.comparison[key],
                extraLocalJobs: rows.comparison.cost.localJobs - rows.direct.cost.localJobs,
                conclusion: 'Same explicit goal and formal validation; fewer changes, additional local comparison cost' };
        }
    });
    summary.observedWholeRunIncludingSetup = all.observation;
    summary.status = execute ? 'finite_deterministic_comparison_passed' : 'zero_send_preflight_passed'; delete summary.phase;
} catch (error) {
    summary.observedWholeRunIncludingSetup = error.observations?.at(-1) ?? null;
    summary.status = 'failed'; summary.failures.push({ phase: summary.phase, code: error.code ?? error.name, message: String(error.message).slice(0, 300) }); process.exitCode = 1;
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
    console.log(JSON.stringify(summary));
}
