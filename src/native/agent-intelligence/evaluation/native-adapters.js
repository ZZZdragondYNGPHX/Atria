import { NativeMemoryAuthority } from '../../memory-authority.js';
import { ExtensionsStore } from '../../extensions-store.js';
import { skillEntryKey } from '../../../../public/shared/extension-contract.js';
import { SettingsRepo } from '../../../storage/repositories/settings-repo.js';
import { PROVENANCE_NAMESPACE } from '../../../../public/scripts/agents/memory/source-lifecycle.js';
import { emptyProvenance, captureEpisodes } from '../../../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations } from '../../../../public/scripts/agents/memory/atomic-facts.js';
import { randomUUID } from 'node:crypto';
import { createGitClient } from '../../../git/client.js';
import { ProjectStore, StudioService, StudioPreviewHost, WorldRepo, ProjectAgentService } from '../../index.js';
import { ProjectTaskRepository } from '../project-task-repository.js';
import { NativeProjectAgentExecutor } from '../../project-agent-executor.js';
import { createSkillRepository } from '../../../skills/repository.js';
import { projectFixtureSource, seedProjectPilot } from './fixture-source.js';
import { projectPreservationEvidence } from './project-preservation.js';
import { NativeGenerationHost } from '../../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from '../../orchestration/native-turn-orchestration.js';
import { RunObservationService } from '../../orchestration/run-observation-service.js';
import { createOrchestrationAuthoringService } from '../../orchestration/authoring-service.js';
import { readPlanRevision } from '../../orchestration/plan-repository.js';
import { ChatRepo } from '../../../storage/repositories/chat-repo.js';
import { RpRunControl } from '../../rp-run-control.js';
import { SessionCore } from '../../session-core.js';
import { SessionRepo } from '../../repositories/session-repo.js';
import { SavePointRepo } from '../../repositories/save-point-repo.js';
import { PackageRepo } from '../../repositories/package-repo.js';
import { KnowledgeRepo } from '../../repositories/knowledge-repo.js';
import { PackageInstaller } from '../../package-composition.js';
import { AssetStore } from '../../repositories/asset-store.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../contracts.js';
import { createNativeId } from '../../identity.js';
import { putImmutable } from '../../repositories/common.js';
import { nativeTaskScheduler } from '../../task-scheduler.js';
import { hash, canonical } from './cases.js';

const containsSkill = (value, text) => typeof value === 'string' ? value.includes(JSON.stringify(text)) : value && typeof value === 'object' && Object.values(value).some(item => containsSkill(item, text));
const unavailable = () => { throw Object.assign(new TypeError('native_orchestration_evaluation_unavailable'), { code: 'native_orchestration_evaluation_unavailable' }); };
function sessionCore(store) {
    const { engine, dirs } = store;
    return new SessionCore({ sessionRepo: new SessionRepo({ engine }), savePointRepo: new SavePointRepo({ engine }), knowledgeRepo: new KnowledgeRepo({ engine }),
        packageInstaller: new PackageInstaller({ packageRepo: new PackageRepo({ engine }), assetStore: new AssetStore({ engine, directoriesByHandle: () => dirs }) }) });
}

// This process has only its private fixture store. Exact Plan/Prompt definitions
// are copied from the authenticated parent's frozen read, without a live source
// grant, production writer or Secret. The real Host creates all trial scopes.
export async function runRp(entry, fixture, capture, evaluation) {
    const { bridge, settings } = evaluation, frozen = settings.nativePlan, n = bridge.native;
    if (!n || !frozen || frozen.revision.definition.outputContract.kind !== 'rp_narration'
        || frozen.revision.definition.nodes.some(node => node.capabilities.includes('agent.delegate'))) unavailable();
    const { engine, handle } = n.store, chats = new ChatRepo({ engine }), control = new RpRunControl({ engine, chatRepo: chats });
    const locator = { charDir: fixture.actor, name: 'native-evaluation', isGroup: false, groupId: null };
    const player = { name: 'Player', mes: fixture.input, is_user: true, memory_os_source_id: 'eval-player' };
    const history = { name: fixture.actor, mes: canonical(fixture.memory.visible), is_user: false, memory_os_source_id: 'eval-visible' };
    const original = hash(player), pending = [];
    await chats.save(handle, locator.charDir, locator.name, {}, [history, player], null);
    const { controlId } = await control.bind(handle, locator);
    const memorySettings = bridge.memorySettings;
    if (memorySettings) {
        await new SettingsRepo({ engine }).save(handle, { atri_capabilities: { memory_graph: memorySettings } });
        const state = emptyProvenance(); state.scopeId = 'rp:' + controlId;
        const episodeIds = captureEpisodes(state, [history, player], [0], state.scopeId); let serial = 0;
        const written = applyFactOperations(state, fixture.memory.visible.map(item => ({ action: 'create', type: 'inferred', text: item.text,
            evidence: [{ episodeId: episodeIds[0], excerpt: history.mes }] })), { scopeId: state.scopeId, episodeIds }, [history, player], () => 'eval-memory-' + ++serial, 1000);
        await chats.setState(handle, locator.charDir, locator.name, PROVENANCE_NAMESPACE, written.state);
    }
    const repository = createSkillRepository(n.store.dirs.root), extensions = new ExtensionsStore({ engine });
    let skillText = null;
    if (settings.skill) {
        const scope = { kind: 'character', characterFile: locator.charDir + '.png' };
        await repository.install({ scope, payload: { files: settings.skill.files.map(file => ({ path: file.path, content: Buffer.from(file.content, 'base64') })) } });
        const before = await extensions.settings(handle);
        await extensions.saveSettings(handle, { ...before.value, skills: { [skillEntryKey({ scope, name: settings.skill.name })]: { paths: { narrative: 'always' } } } }, before.revision);
        skillText = Buffer.from(settings.skill.files.find(file => file.path === 'SKILL.md').content, 'base64').toString('utf8');
    }
    const host = new NativeGenerationHost({ persistence: n.persistence, library: n.library, providers: n.providers, secretPort: n.secretPort,
        sessionCore: sessionCore(n.store), skillRepository: () => repository, extensions });
    const { plans } = createOrchestrationAuthoringService(engine, { rpControl: control, modelResolver: n.resolver });
    await engine.withTransaction(handle, async tx => {
        const ref = frozen.planRef;
        await putImmutable(tx, { kind: K.orchestrationRevision, handle, planId: ref.planId, planRevisionId: ref.planRevisionId }, frozen.revision);
        await readPlanRevision(tx, handle, ref);
    });
    await plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: { domain: 'rp_chat', controlId }, planRef: frozen.planRef, expectedVersion: null });
    const authority = new NativeNarratorOrchestrationAuthority({ engine, sessionCore: host.sessionCore, rpControl: control, plans, modelResolver: n.resolver, retrievalTransport: n.retrievalTransport,
        memoryAuthority: memorySettings ? new NativeMemoryAuthority({ core: host.sessionCore, settingsRepo: new SettingsRepo({ engine }) }) : null });
    host.turnOrchestration = authority;
    const preparedEffects = [], prepare = authority.execution.effects.prepare.bind(authority.execution.effects);
    authority.execution.effects.prepare = async (...args) => { const saved = await prepare(...args); preparedEffects.push({ runId: args[1].runId, effectId: args[1].effectId }); return saved; };
    const prepareRetrieval = authority.execution.effects.prepareContextRetrieval.bind(authority.execution.effects);
    authority.execution.effects.prepareContextRetrieval = async (...args) => { const saved = await prepareRetrieval(...args); preparedEffects.push({ runId: args[1].runId, effectId: args[1].effectId }); return saved; };
    const roots = [], variant = entry.caseId.startsWith('rp_variant');
    let enter, deliverLate, injected = false, stale = null;
    const entered = new Promise(resolve => { enter = resolve; });
    const beforeSend = variant ? async () => {
        if (injected) return null;
        injected = true; enter();
        return new Promise(resolve => {
            deliverLate = () => resolve({ choices: [{ message: { role: 'assistant', content: 'STALE COMPLETION' }, finish_reason: 'stop' }],
                usage: { total_tokens: 20, prompt_tokens: 12, completion_tokens: 8 } });
        });
    } : null;
    const run = async (requestId, options = {}) => {
        const operation = await host.startRp(handle, { controlId, floor: 1, requestId,
            routeRef: { scope: 'player', runtimeRouteId: settings.runtimeRouteId } }, options);
        capture.refs.requestIds.push(requestId);
        pending.push(operation.result);
        const result = await operation.result;
        const root = await authority.execution.runs.get(handle, result.runId);
        roots.push(root);
        return result;
    };
    try {
        const result = await bridge.nativeTransport({ trialId: capture.trialId, onRendered: rendered => capture.prompts.push(structuredClone(rendered)), beforeSend }, async () => {
            const requestId = 'evaluation:' + hash(capture.trialId);
            if (!variant) return run(requestId);
            const controller = new AbortController(), old = run(requestId + ':old', { signal: controller.signal });
            old.catch(() => {});
            try {
                await Promise.race([entered, old]); controller.abort();
                let cancelled = false;
                try { await old; } catch (error) { if (error.code !== 'operation_cancelled') throw error; cancelled = true; }
                const current = run(requestId + ':current'); current.catch(() => {});
                deliverLate(); const value = await current;
                const prior = await authority.execution.runs.get(handle, preparedEffects[0].runId);
                stale = { cancelled, oldClaims: prior.outputClaims.length, priorRunId: prior.runId };
                return value;
            } finally { deliverLate?.(); }
        });
        const chat = await chats.get(handle, locator.charDir, locator.name), root = roots.at(-1), output = chat.body.at(-1);
        capture.observe('player_ownership', hash(chat.body[1]), original);
        capture.observe('isolation', hash(chat.body[1]), original);
        capture.observe('single_completion', { completed: root.status, assistants: chat.body.length - 2, claim: root.outputClaims.length === 1, output: result.output?.runStatus },
            { completed: 'completed', assistants: 1, claim: true, output: 'completed' });
        const requests = capture.prompts.map(canonical);
        capture.observe('request_exposure', { visible: requests.length > 0 && requests.every(text => fixture.memory.visible.every(item => text.includes(item.text))),
            private: requests.some(text => text.includes(fixture.memory.private.text)) }, { visible: true, private: false });
        capture.observe('revision_reference', requests.length > 0 && requests.every(text => fixture.memory.visible.every(item => text.includes(item.text))), true);
        capture.refs.runIds.push(...new Set(preparedEffects.map(effect => effect.runId)));
        capture.refs.effectIds.push(...preparedEffects.map(effect => effect.effectId));
        if (variant) {
            capture.observe('stale_completion', { cancelled: stale.cancelled, oldClaims: stale.oldClaims, staleOutput: output.mes.includes('STALE COMPLETION'), assistants: chat.body.length - 2 },
                { cancelled: true, oldClaims: 0, staleOutput: false, assistants: 1 });
            capture.observe('variant_identity', { runs: new Set(capture.refs.runIds).size, requests: new Set(capture.refs.requestIds).size, different: stale.priorRunId !== root.runId, completed: root.status },
                { runs: 2, requests: 2, different: true, completed: 'completed' });
            capture.completeness.push('native_cancelled_late_delivery');
        }
        capture.evidence.push({ name: 'native_plan_execution', observed: { planRef: root.planRef, sourceBindingDigest: root.sourceBinding.bindingDigest,
            epoch: root.epoch, outputClaimRefs: root.outputClaims, effectCount: preparedEffects.length }, expected: { planRef: frozen.planRef } });
        capture.artifact = { output: output.mes, targetConsumed: hash(root.planRef) === hash(frozen.planRef) && capture.prompts.length > 0 && root.status === 'completed'
            && (!skillText || capture.prompts.every(prompt => containsSkill(prompt, skillText))) };
    } finally {
        for (const operation of nativeTaskScheduler.operations.values()) if (operation.owner === handle && operation.view.anchor?.controlId === controlId)
            nativeTaskScheduler.cancel(handle, operation.view.operationId);
        await Promise.allSettled(pending);
    }
}

export async function runProject(entry, fixture, capture, evaluation) {
    const { bridge, settings } = evaluation, frozen = settings.nativePlan, n = bridge.native;
    if (!n || !frozen || frozen.sourceSelector.domain !== 'project' || frozen.revision.definition.outputContract.kind !== 'project_review') unavailable();
    const { engine, handle, dirs } = n.store, projectId = frozen.sourceSelector.projectId;
    const exactTasks = new Set(frozen.revision.dependencyPins.filter(pin => pin.port === 'tool').map(pin => pin.resourceRef.taskId));
    if (exactTasks.size > 1 || exactTasks.size && frozen.sourceSelector.taskId !== null && !exactTasks.has(frozen.sourceSelector.taskId)) unavailable();
    const taskId = frozen.sourceSelector.taskId ?? [...exactTasks][0] ?? null;
    const studio = new StudioService({ projectStore: new ProjectStore({ directoriesByHandle: owner => {
        if (owner !== handle) throw new Error('evaluation_owner_mismatch'); return dirs;
    } }), worldRepo: new WorldRepo({ engine }), knowledgeRepo: new KnowledgeRepo({ engine }), assetStore: new AssetStore({ engine, directoriesByHandle: () => dirs }),
    gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost(), simulationRunner: async () => ({ mode: 'dry-run' }) });
    const repository = new ProjectTaskRepository({ engine });
    let named = false;
    const agent = new ProjectAgentService({ studio, repository, maxRepairRounds: entry.limits.maxRepairRounds,
        idFactory: () => { if (taskId && !named) { named = true; return taskId.slice('agenttask_'.length); } return randomUUID(); } });
    let source = projectFixtureSource(fixture.projectName, entry.fixtureHash); source.project.projectId = projectId;
    const resources = fixture.pilot ? await seedProjectPilot({ engine, handle, fixture, fixtureHash: entry.fixtureHash, source }) : null;
    const created = await studio.createProject(handle, source); let baseRevision = created.revision.revision, prior = null;
    if (fixture.pilot) source = (await studio.getProject(handle, projectId)).source;
    if (fixture.pilot || entry.caseId.startsWith('project_conflict')) {
        const earlier = new ProjectAgentService({ studio, repository, maxRepairRounds: entry.limits.maxRepairRounds });
        prior = await earlier.createTask(handle, projectId, { intent: 'Prior reviewed proposal', baseRevision });
        await earlier.setPlan(handle, projectId, prior.taskId, { summary: 'Prior proposal', steps: [{ id: 'previous', title: 'Preserve Project', impact: 'low' }] });
        await earlier.executeTool(handle, projectId, prior.taskId, { name: 'atri_agent_project_save', args: { source, stepId: 'previous' } });
        await earlier.prepareReview(handle, projectId, prior.taskId);
        const human = structuredClone(source); human.project.displayName += ' (human revision)'; human.project.updatedAt++;
        await studio.saveProjectSource(handle, projectId, { source: human, baseRevision, origin: { kind: 'human', id: 'evaluation-fixture-reviewer' } });
        try { await earlier.commit(handle, projectId, prior.taskId); } catch (error) { if (error.name !== 'ConflictError') throw error; }
        const observed = await earlier.getTask(handle, projectId, prior.taskId);
        capture.observe('no_silent_rebase', { baseRevision: observed.baseRevision, status: observed.status, commits: observed.changeSets.length },
            { baseRevision, status: 'conflict', commits: 0 });
        baseRevision = (await studio.getRevision(handle, projectId)).revision;
    }
    const conflictTask = prior ? await agent.getTask(handle, projectId, prior.taskId) : null;
    const conflictEvidence = conflictTask ? '\nPublic original authority evidence: ' + canonical({ taskId: prior.taskId, status: conflictTask.status,
        baseRevision: conflictTask.baseRevision, actualRevision: baseRevision, review: conflictTask.review, changeSets: conflictTask.changeSets }) : '';
    const task = await agent.createTask(handle, projectId, { intent: fixture.input + conflictEvidence, baseRevision });
    if (taskId && task.taskId !== taskId) throw new Error('evaluation_task_identity_mismatch');
    capture.refs.taskIds.push(task.taskId);
    const repairing = entry.caseId.startsWith('project_repair');
    if (repairing) {
        await agent.setPlan(handle, projectId, task.taskId, { summary: 'Repair metadata proposal', steps: [{ id: 'repair', title: 'Repair bounded metadata', impact: 'low' }] });
        const invalid = structuredClone((await studio.getProject(handle, projectId)).source); invalid.project.projectId = 'invalid-project-id';
        if (fixture.pilot) {
            invalid.project.projectId = projectId;
            invalid.package.entryPoints[0].knowledgeBindingIds = [createNativeId('knowledgeBinding', () => hash(entry.fixtureHash).slice(0, 32))];
        }
        await agent.executeTool(handle, projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: invalid, stepId: 'repair' } });
        const failed = await agent.prepareReview(handle, projectId, task.taskId);
        capture.observe('validation_error', { status: failed.status, validation: failed.validation.status, round: failed.repairRound },
            { status: 'repair', validation: 'failed', round: 1 });
    }
    const currentSource = (await studio.getProject(handle, projectId)).source, before = hash(currentSource);
    const host = new NativeGenerationHost({ persistence: n.persistence, library: n.library, providers: n.providers, secretPort: n.secretPort,
        sessionCore: sessionCore(n.store), studio, agent, skillRepository: () => createSkillRepository(dirs.root), extensions: { settings: async () => ({ value: {} }) } });
    const { plans } = createOrchestrationAuthoringService(engine, { studio, projectAgent: agent, sessionCore: host.sessionCore, modelResolver: n.resolver });
    await engine.withTransaction(handle, async tx => {
        await putImmutable(tx, { kind: K.orchestrationRevision, handle, planId: frozen.planRef.planId, planRevisionId: frozen.planRef.planRevisionId }, frozen.revision);
        await readPlanRevision(tx, handle, frozen.planRef);
    });
    await plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: frozen.sourceSelector, planRef: frozen.planRef, expectedVersion: null });
    const authority = new NativeNarratorOrchestrationAuthority({ engine, sessionCore: host.sessionCore, projectAgent: agent, projectRepository: repository, plans, modelResolver: n.resolver });
    host.turnOrchestration = authority;
    const effects = [], prepare = authority.execution.effects.prepare.bind(authority.execution.effects);
    authority.execution.effects.prepare = async (...args) => { const saved = await prepare(...args); effects.push({ runId: args[1].runId, effectId: args[1].effectId, requestId: args[1].proposal.inputRef.requestId ?? null }); return saved; };
    const executor = new NativeProjectAgentExecutor({ host, scheduler: nativeTaskScheduler });
    const loop = frozen.revision.definition.edges.find(edge => edge.loopBack);
    const input = { runtimeRouteId: settings.runtimeRouteId, maxModelRounds: loop ? loop.maxVisits + 1 : 1 };
    let operation, result;
    try {
        const view = await executor.preflight(handle, projectId, task.taskId, input);
        result = await bridge.nativeTransport({ trialId: capture.trialId, onRendered: rendered => capture.prompts.push(structuredClone(rendered)) }, async () => {
            operation = await executor.start(handle, projectId, task.taskId, { ...input, requestId: 'evaluation:' + hash(capture.trialId), expectedPreflightFingerprint: hash(view) });
            return nativeTaskScheduler.operations.get(operation.operationId).handle.result;
        });
        const reviewed = await agent.getTask(handle, projectId, task.taskId), root = await authority.execution.runs.get(handle, effects[0].runId);
        capture.refs.runIds.push(root.runId); capture.refs.effectIds.push(...effects.map(effect => effect.effectId));
        capture.refs.requestIds.push(...effects.map(effect => effect.requestId).filter(Boolean));
        capture.observe('isolation', hash((await studio.getProject(handle, projectId)).source), before);
        capture.observe('review_gate', { status: reviewed.status, commits: reviewed.changeSets.length, run: root.status }, { status: 'review', commits: 0, run: 'completed' });
        let rejected = false;
        try { await agent.observeTask('foreign-evaluation-owner', projectId, task.taskId); } catch { rejected = true; }
        capture.observe('ownership', rejected, true);
        if (repairing) capture.observe('repair_bound', reviewed.repairRound <= entry.limits.maxRepairRounds, true);
        if (prior) capture.observe('human_revision', (await studio.getRevision(handle, projectId)).revision, baseRevision);
        if (fixture.pilot) {
            const proposed = structuredClone(currentSource);
            for (const edit of fixture.projectEdits) {
                const item = proposed.package.entryPoints[edit.index];
                if (edit.worldIndex !== undefined) { item.worldIds = [resources.worldRefs[edit.worldIndex].worldId]; item.primaryWorldId = resources.worldRefs[edit.worldIndex].worldId; }
                if (edit.bindingIndices) item.knowledgeBindingIds = edit.bindingIndices.map(index => resources.bindingIds[index]);
            }
            const validated = reviewed.operations.find(item => item.operation.operationType === 'project.save')?.operation.input.source;
            capture.observe('related_proposal', hash(validated ?? null), hash(proposed));
            const preservation = projectPreservationEvidence(currentSource, validated, fixture.projectEdits);
            capture.observe('preservation', preservation.observed, preservation.expected);
            const previous = await agent.getTask(handle, projectId, prior.taskId);
            capture.observe('no_silent_rebase', { status: previous.status, base: previous.baseRevision, commits: previous.changeSets.length, freshBase: reviewed.baseRevision },
                { status: 'conflict', base: conflictTask.baseRevision, commits: 0, freshBase: baseRevision });
            capture.evidence.push({ name: 'native_project_pilot', observed: { originalSource: currentSource, validatedProposal: validated ?? null,
                validation: reviewed.validation, priorTask: { taskId: prior.taskId, status: previous.status, baseRevision: previous.baseRevision },
                currentTask: { taskId: task.taskId, status: reviewed.status, baseRevision: reviewed.baseRevision, commits: reviewed.changeSets.length } }, expected: { proposed } });
            capture.completeness.push('native_project_related_review');
        }
        // Only this explicit fixture reviewer may commit, after the Native
        // model workflow has ended at Review. No Model/Tool has this writer.
        if (entry.caseId.startsWith('project_authoring') && reviewed.status === 'review') {
            const committed = await agent.commit(handle, projectId, task.taskId);
            capture.observe('single_changeset', committed.changeSets.length, 1);
        }
        capture.evidence.push({ name: 'native_plan_execution', observed: { planRef: root.planRef, sourceBindingDigest: root.sourceBinding.bindingDigest,
            outputClaimRefs: root.outputClaims, effectCount: effects.length }, expected: { planRef: frozen.planRef } });
        capture.artifact = { output: canonical({ status: reviewed.status, plan: reviewed.plan, operations: reviewed.operations, review: reviewed.review,
            validation: reviewed.validation, conversation: result.task.conversation }),
        targetConsumed: hash(root.planRef) === hash(frozen.planRef) && capture.prompts.length > 0 && root.status === 'completed' };
    } catch (error) {
        // Preserve the original failure and fees. A bounded owner projection
        // explains the failure without provider input, output or Task bodies.
        let observed = { status: 'unavailable' };
        if (effects.length) {
            try {
                const runId = effects[0].runId;
                const view = await new RunObservationService({ engine, projectAgent: agent, studio, pollMs: 0 })
                    .observe(handle, { runId, cursor: null, limit: 20 });
                const current = await agent.observeTask(handle, projectId, task.taskId);
                observed = { status: 'available', projection: view.payload, task: { status: current.status,
                    validationStatus: current.validation?.status ?? null, diagnosticCount: current.validation?.diagnostics?.length ?? 0 } };
                if (!capture.refs.runIds.includes(runId)) capture.refs.runIds.push(runId);
            } catch { /* A revoked inspection is unavailable, never a bypass. */ }
        }
        capture.observe('native_execution', false, true);
        capture.evidence.push({ name: 'native_project_execution_failure', observed, expected: { completed: true } });
        throw error;
    } finally {
        if (operation) nativeTaskScheduler.cancel(handle, operation.operationId);
        if (operation) await Promise.allSettled([nativeTaskScheduler.operations.get(operation.operationId)?.handle?.result]);
    }
}
