import { nodePromptProgramPin } from '../../../public/shared/native-orchestration-contracts.js';
import { PromptCandidateStore } from '../model-prompt-runtime/prompt-candidates.js';
import { projectStrategyBase } from './project-strategy.js';
import { ProjectTaskRepository } from './project-task-repository.js';
import { assertEvidenceScope } from './contracts.js';
import { evolutionFields as fields, evolutionHash as hash, sameEvolutionValue as same, evolutionText as text } from './evolution-repository.js';

import { skillInvocationMode } from '../../../public/shared/extension-contract.js';
import { resolveSkillInvocation } from '../../../public/shared/skill-invocation.js';
import { ExtensionsStore } from '../extensions-store.js';
import { ConflictError } from '../../storage/errors.js';
import { createHostRouteResolver } from '../model-prompt-runtime/prompt-controls.js';
import { createOrchestrationAuthoringService } from '../orchestration/authoring-service.js';
import { assertPlanEvolutionTarget, EVOLVABLE_PLAN_LIMITS, planNodeRouteChoices } from '../orchestration/plan-evolution-contracts.js';

const conflict = () => { throw new ConflictError('agent_evolution_target_conflict'); };

const localCharacter = (scope, subject) => scope.domain === 'rp_chat' && !scope.isGroup && subject === scope.charDir;

// All writes below go through the original single-Host target queues and CAS.
// No configuration pointer is read from the Evolution journal at run time.
export class EvolutionTargets {
    constructor({ host }) {
        this.host = host;
        this.prompts = new PromptCandidateStore({ engine: host.library?._engine || host.persistence._engine });
        this.tasks = new ProjectTaskRepository({ engine: host.persistence._engine });
    }

    nativePlans() {
        return this.planStore ??= createOrchestrationAuthoringService(this.host.persistence._engine, {
            sessionCore: this.host.sessionCore, studio: this.host.studio, projectAgent: this.host.agent, rpControl: this.host.turnOrchestration?.rpControl,
            modelResolver: createHostRouteResolver(this.host) }).plans;
    }
    async planSource(handle, scope, subject, target, candidateId = null, options = {}) {
        this.authorize(scope, subject, target);
        const plans = this.nativePlans(), captured = options.authorityOnly ? { base: await plans.evolutionBinding(handle, target) }
            : candidateId ? await plans.checkEvolution(handle, target, candidateId, options) : await plans.captureEvolution(handle, target);
        const source = captured.base.sourceSelector;
        if (scope.domain === 'project') {
            if (source.domain !== 'project' || source.projectId !== scope.projectId || subject !== scope.projectId) conflict();
        } else {
            if (source.domain !== 'rp_chat') conflict();
            const original = await this.host.turnOrchestration.rpControl.status(handle, source.controlId);
            if (original.locator.charDir !== scope.charDir || original.locator.name !== scope.name || original.locator.isGroup !== scope.isGroup) conflict();
        }
        return captured;
    }
    async nativeBindings(handle, scope, subject) {
        if (!this.host.turnOrchestration) return [];
        const selectors = [];
        if (scope.domain === 'project' && subject === scope.projectId) {
            selectors.push({ domain: 'project', projectId: subject, taskId: null });
            for (const task of await this.host.agent.observeTasks(handle, subject)) selectors.push({ domain: 'project', projectId: subject, taskId: task.taskId });
        } else if (localCharacter(scope, subject)) {
            const control = this.host.turnOrchestration?.rpControl;
            if (!control) return [];
            const chat = await control._chatRepo.get(handle, scope.charDir, scope.name);
            const controlId = chat?.header?.chat_metadata?.nativeControlId;
            if (controlId) selectors.push({ domain: 'rp_chat', controlId });
        }
        if (!selectors.length) return [];
        const bindings = [];
        for (const selector of selectors) {
            const binding = await this.nativePlans().getBinding(handle, selector);
            if (binding) bindings.push(binding);
        }
        return bindings;
    }
    async planChoices(handle, bindings) {
        const plans = this.nativePlans(), choices = [];
        for (const binding of bindings) {
            const revision = await plans.getRevision(handle, binding.planRef);
            for (const node of revision.definition.nodes.filter(node => planNodeRouteChoices(revision.definition, revision.dependencyPins, node.nodeId).length > 1)) {
                const target = { kind: 'plan-strategy', bindingId: binding.bindingId, expectedBindingVersion: binding.version,
                    planRef: binding.planRef, nodeId: node.nodeId, fieldPath: 'routeRef' };
                choices.push({ label: 'Native Plan · ' + node.label + ' · routeRef', target, baseHash: hash(await plans.captureEvolution(handle, target)) });
            }
            for (const node of revision.definition.nodes.filter(node => node.kind === 'agent' && node.capabilities.includes('generation.send'))) {
                const pin = revision.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId);
                if (pin?.resourceRef.scope !== 'player') continue;
                const route = await this.host.persistence.getRuntimeRoute(handle, pin.resourceRef.runtimeRouteId);
                const list = await this.prompts.presets.list(handle);
                const programRef = nodePromptProgramPin(node, revision.dependencyPins)?.resourceRef ?? route.promptProgramRef;
                if (!list.some(item => item.presetId === programRef.resourceId)) continue;
                const preset = await this.prompts.presets.get(handle, programRef.resourceId);
                for (const ref of preset.refs.filter(ref => ref.resourceType === 'core.prompt-module'
                    && preset.entries.some(entry => entry.resource.promptModuleId === ref.resourceId && entry.resource.target === 'system.style'))) {
                    const target = { kind: 'plan-prompt', bindingId: binding.bindingId, expectedBindingVersion: binding.version, planRef: binding.planRef,
                        nodeId: node.nodeId, promptModuleRef: ref };
                    choices.push({ label: 'Native Plan · ' + node.label + ' · style', target, baseHash: hash(await plans.captureEvolution(handle, target)) });
                }
            }
            for (const field of EVOLVABLE_PLAN_LIMITS) {
                if (revision.definition.limits[field] <= (['maxSteps', 'maxAttempts', 'deadlineMs'].includes(field) ? 1 : 0)) continue;
                const target = { kind: 'plan-strategy', bindingId: binding.bindingId, expectedBindingVersion: binding.version,
                    planRef: binding.planRef, nodeId: revision.definition.outputContract.ownerNodeId, fieldPath: 'limits.' + field };
                choices.push({ label: 'Native Plan · ' + field, target, baseHash: hash(await plans.captureEvolution(handle, target)) });
            }
            for (const node of revision.definition.nodes.filter(node => node.kind === 'review' && node.policy.maxRounds > 1)) {
                const target = { kind: 'plan-strategy', bindingId: binding.bindingId, expectedBindingVersion: binding.version,
                    planRef: binding.planRef, nodeId: node.nodeId, fieldPath: 'reviewPolicy.maxRounds' };
                choices.push({ label: 'Native Plan · ' + node.label + ' · maxRounds', target, baseHash: hash(await plans.captureEvolution(handle, target)) });
            }
        }
        return choices;
    }
    authorize(scope, subject, target) {
        if (['plan-strategy', 'plan-prompt'].includes(target?.kind)) {
            assertEvidenceScope(scope); text(subject); assertPlanEvolutionTarget(target);
            if (scope.domain === 'project' && subject === scope.projectId || localCharacter(scope, subject)) return;
            throw new TypeError('Native Plan target is outside this exact subject');
        }
        assertEvidenceScope(scope); text(subject); fields(target, ['kind', 'scope', 'name', 'presetId', 'field', 'runtimeRouteId', 'moduleRef', 'taskId']);
        if (target.kind === 'skill') {
            fields(target, ['kind', 'scope', 'name']); text(target.name, 128);
            if (scope.domain === 'project' && subject === scope.projectId && target.scope?.kind === 'project' && target.scope.projectId === subject) return;
            if (localCharacter(scope, subject) && target.scope?.kind === 'character' && target.scope.characterFile === subject + '.png') return;
        } else if (target.kind === 'project-prompt') {
            fields(target, ['kind', 'presetId', 'runtimeRouteId', 'moduleRef']);
            if (scope.domain === 'project' && subject === scope.projectId) return;
        } else if (target.kind === 'project-strategy') {
            fields(target, ['kind', 'taskId', 'field']);
            if (scope.domain === 'project' && subject === scope.projectId && target.field === 'maxRepairRounds') return;
        }
        throw new TypeError('Evolution target is outside this exact local subject');
    }

    async skillEnvironment(handle, scope, subject, target) {
        if (!this.host.skillRepository && target.kind !== 'skill') return { invocationRevision: null };
        const repo = this.host.skillRepository(handle), extensions = this.host.extensions || new ExtensionsStore({ engine: this.host.persistence._engine });
        const invocation = await extensions.settings(handle), path = scope.domain === 'project' ? 'studio' : 'narrative';
        const entries = await repo.list({ scope: 'all' });
        const context = scope.domain === 'rp_chat' ? { characterFile: subject + '.png' } : { projectId: subject };
        const visible = resolveSkillInvocation(entries, { context, settings: invocation.value, path, legacy: scope.domain === 'rp_chat' });
        const selected = target.kind === 'skill' ? visible.find(e => e.name === target.name && same(e.scope, target.scope)) : null;
        if (target.kind === 'skill' && (!selected || skillInvocationMode(selected, invocation.value, path) !== 'always')) throw new TypeError('Declare an already visible always-invoked local Skill');
        if (visible.some(e => !selected || !same(e.scope, selected.scope) || e.name !== selected.name)) throw new TypeError('Combined Skill environments require a new combined evaluator; choose review');
        return { invocationRevision: invocation.revision, ...(scope.domain === 'rp_chat' ? { nativeBindings: await this.nativeBindings(handle, scope, subject) } : {}) };
    }
    async catalog(handle, scope, subject) {
        const nativeBindings = await this.nativeBindings(handle, scope, subject);
        // A declared Native binding never falls back to a historical preset
        // evaluator, including when no remaining limit can be tightened.
        const choices = nativeBindings.length ? await this.planChoices(handle, nativeBindings) : [];
        const skillScope = scope.domain === 'project' ? { kind: 'project', projectId: subject } : { kind: 'character', characterFile: subject + '.png' };
        if (scope.domain === 'project') await this.host.studio.getProject(handle, subject);
        else if (!localCharacter(scope, subject)) return choices;
        for (const e of this.host.skillRepository ? await this.host.skillRepository(handle).list({ scope: skillScope }) : []) choices.push({ label: 'Skill · ' + e.name, target: { kind: 'skill', scope: e.scope, name: e.name }, baseHash: e.installedHash });
        if (scope.domain === 'project' && !nativeBindings.length) {
            for (const task of await this.host.agent.listTasks(handle, subject)) {
                const raw = await this.tasks.get(handle, subject, task.taskId);
                if (raw.status === 'planning' && !raw.attempts.length && !raw.conversation.length) choices.push({ label: 'Task repair limit · ' + task.intent, target: { kind: 'project-strategy', taskId: task.taskId, field: 'maxRepairRounds' }, baseHash: hash(projectStrategyBase(raw)) });
            }
            for (const route of (await this.host.persistence.listRuntimeRoutes(handle)).filter(r => r.role === 'role.studio' && !r.projectPromptBindings?.some(b => b.projectId === subject))) {
                for (const item of await this.prompts.presets.list(handle)) {
                    const preset = await this.prompts.presets.get(handle, item.presetId);
                    if (!same(route.promptProgramRef, preset.refs.find(r => r.resourceId === preset.programId))) continue;
                    for (const ref of preset.refs.filter(r => r.resourceType === 'core.prompt-module' && preset.entries.some(e => e.resource.promptModuleId === r.resourceId && e.resource.target === 'system.style'))) choices.push({ label: item.displayName + ' · module ' + ref.resourceId, target: { kind: 'project-prompt', presetId: item.presetId, runtimeRouteId: route.runtimeRouteId, moduleRef: ref }, baseHash: hash(preset) });
                }
            }
        }
        return choices.slice(0, 128);
    }
    async declare(handle, scope, subject, target, expectedBaseHash) {
        this.authorize(scope, subject, target);
        const choice = (await this.catalog(handle, scope, subject)).find(c => same(c.target, target));
        if (!choice || choice.baseHash !== expectedBaseHash) conflict();
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) {
            await this.planSource(handle, scope, subject, target); return this.nativePlans().declareEvolution(handle, target);
        }
        if (target.kind === 'skill') return this.capture(handle, scope, subject, target);

        if (target.kind === 'project-strategy') {
            const task = await this.host.agent.getTask(handle, subject, target.taskId);
            return this.host.agent.strategyCandidates(handle, subject, target.taskId, { type: 'declare', expectedSequence: task.sequence, allowedFields: [target.field] });
        }
        const preset = await this.prompts.presets.get(handle, target.presetId);
        return this.prompts.declare(handle, target.presetId, { expectedRevision: preset.revision, moduleRefs: [target.moduleRef] });
    }
    async capture(handle, scope, subject, target) {
        this.authorize(scope, subject, target);
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) return this.planSource(handle, scope, subject, target);
        if (target.kind !== 'skill' && (await this.nativeBindings(handle, scope, subject)).length) throw new TypeError('native_orchestration_evolution_target_unavailable');
        if (scope.domain === 'project') await this.host.studio.getProject(handle, scope.projectId);
        if (target.kind === 'skill') {
            const repo = this.host.skillRepository(handle), pin = await repo.pin({ scope: target.scope, name: target.name });
            const body = (await repo.listFiles(pin)).find(f => f.path === 'SKILL.md').buffer.toString('utf8');
            return { environment: await this.skillEnvironment(handle, scope, subject, target), base: pin.version, declaration: { scope: target.scope, name: target.name, header: body.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] }, body, field: 'SKILL.md' };
        }

        if (target.kind === 'project-strategy') {
            await this.host.agent.getTask(handle, scope.projectId, target.taskId);
            const task = await this.tasks.get(handle, scope.projectId, target.taskId);
            const declaration = (await this.host.agent.strategyCandidates(handle, scope.projectId, target.taskId, { type: 'inspect' })).declaration;
            if (!declaration?.allowedFields.includes(target.field) || !same(declaration.base, projectStrategyBase(task))) conflict();
            return { environment: await this.skillEnvironment(handle, scope, subject, target), base: projectStrategyBase(task), declaration, body: task.maxRepairRounds, field: target.field };
        }
        const preset = await this.prompts.presets.get(handle, target.presetId), metadata = await this.prompts.inspect(handle, target.presetId);
        const route = await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId);
        if (route.role !== 'role.studio' || route.projectPromptBindings?.some(b => b.projectId === subject) || !metadata.declaration?.moduleRefs.some(r => same(r, target.moduleRef))
            || !same(route.promptProgramRef, preset.refs.find(r => r.resourceId === preset.programId))) conflict();
        const module = preset.entries.find(e => e.resource.promptModuleId === target.moduleRef.resourceId);
        if (!module || module.resource.target !== 'system.style') conflict();
        return { environment: await this.skillEnvironment(handle, scope, subject, target), base: route, declaration: { presetFingerprint: hash(preset), declaration: metadata.declaration }, body: module.resource.body, field: 'body' };
    }
    async prepare(handle, scope, subject, target, expected, value) {
        const actual = await this.capture(handle, scope, subject, target);
        if (!same(expected, actual)) conflict();
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) return this.nativePlans().prepareEvolution(handle, target, value);
        if (target.kind === 'skill') return this.host.skillRepository(handle).prepareCandidate({ scope: target.scope, name: target.name, baseVersion: actual.base, content: value });

        if (target.kind === 'project-strategy') {
            const task = await this.host.agent.getTask(handle, scope.projectId, target.taskId);
            await this.host.agent.strategyCandidates(handle, scope.projectId, target.taskId, { type: 'prepare', expectedSequence: task.sequence, field: target.field, value });
            const result = await this.host.agent.strategyCandidates(handle, scope.projectId, target.taskId, { type: 'inspect' });
            return result.candidates.find(c => c.diff.after === value);
        }
        return this.prompts.prepare(handle, target.presetId, { runtimeRouteId: target.runtimeRouteId, expectedRouteFingerprint: hash(actual.base), moduleRef: target.moduleRef, body: value });
    }
    async check(handle, scope, subject, target, candidateId, { rollback = false, publication = null } = {}) {
        this.authorize(scope, subject, target);
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) return this.planSource(handle, scope, subject, target, candidateId, { rollback });
        if (target.kind === 'skill') {
            const c = await this.host.skillRepository(handle).checkCandidate({ scope: target.scope, name: target.name, candidateId });
            if (![c.baseVersion, c.version].includes(c.currentVersion)) conflict();
            return { candidate: c, base: c.baseVersion, desired: c.version, previous: c.baseVersion, actual: c.currentVersion };
        }

        if (target.kind === 'project-strategy') {
            const result = await this.host.agent.strategyCandidates(handle, scope.projectId, target.taskId, { type: 'check', candidateId, ...(rollback ? { rollback: true } : {}) });
            return { candidate: result.candidate, base: result.candidate.base, desired: result.candidate.desired, previous: result.candidate.base,
                actual: result.alreadyApplied ? result.candidate.desired : result.candidate.base };
        }
        if (rollback && publication) {
            const actual = await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId);
            const base = publication.previous, desired = publication.desired;
            if (!same(base, publication.base) || ![hash(base), hash(desired)].includes(hash(actual))) conflict();
            await this.validatePreviousRoute(handle, base);
            return { base, desired, previous: base, actual };
        }
        const result = await this.prompts.project(handle, target.presetId, candidateId, subject, rollback ? 'checkRollback' : 'check');
        if (result.candidate.baseRoute.runtimeRouteId !== target.runtimeRouteId || !same(result.candidate.moduleRef, target.moduleRef)) conflict();
        return { candidate: result.candidate, base: result.candidate.baseRoute, desired: result.desiredRoute, previous: result.candidate.baseRoute,
            actual: result.alreadyApplied ? result.desiredRoute : result.candidate.baseRoute };
    }
    async write(handle, scope, subject, target, candidateId, rollback = false, publication = null, beforeCommit = async () => {}) {
        this.authorize(scope, subject, target);
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) {
            await this.planSource(handle, scope, subject, target, candidateId, { rollback });
            return this.nativePlans().writeEvolution(handle, target, candidateId, { rollback, beforeCommit });
        }
        if (target.kind !== 'skill' && !rollback && (await this.nativeBindings(handle, scope, subject)).length) throw new TypeError('native_orchestration_evolution_target_unavailable');
        if (target.kind === 'skill') {
            const repo = this.host.skillRepository(handle), c = await repo.checkCandidate({ scope: target.scope, name: target.name, candidateId });
            return rollback ? repo.rollbackCandidate({ scope: target.scope, name: target.name, candidateId, expectedVersion: c.version, beforeCommit })
                : repo.applyCandidate({ scope: target.scope, name: target.name, candidateId, expectedBaseVersion: c.baseVersion, beforeCommit });
        }

        if (target.kind === 'project-strategy') return this.host.agent.strategyCandidates(handle, scope.projectId, target.taskId, { type: rollback ? 'rollback' : 'apply', candidateId }, { beforeCommit });
        if (rollback && publication) {
            const actual = await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId);
            if (same(actual, publication.base)) { await this.validatePreviousRoute(handle, publication.previous); return actual; }
            if (!same(actual, publication.desired)) conflict();
            return this.host.persistence.saveRuntimeRoute(handle, publication.previous, { expectedFingerprint: hash(publication.desired), validate: async route => { await this.validatePreviousRoute(handle, route); await beforeCommit(); } });
        }
        return this.prompts.project(handle, target.presetId, candidateId, subject, rollback ? 'rollback' : 'apply', { beforeCommit });
    }
    async discard(handle, scope, subject, target, candidateId) {
        this.authorize(scope, subject, target);
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) {
            await this.planSource(handle, scope, subject, target, null, { authorityOnly: true }); return this.nativePlans().discardEvolution(handle, target, candidateId);
        }
        if (target.kind === 'skill') return this.host.skillRepository(handle).discardCandidate({ scope: target.scope, name: target.name, candidateId });

        if (target.kind === 'project-strategy') return this.host.agent.strategyCandidates(handle, subject, target.taskId, { type: 'discard', candidateId });
        return this.prompts.discard(handle, target.presetId, candidateId);
    }
    async publicationCurrent(handle, scope, subject, publication) {
        const p = publication, target = p.target;
        this.authorize(scope, subject, target);
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) return same((await this.planSource(handle, scope, subject, target, p.candidateId, { rollback: true })).actual, p.desired);
        if (target.kind !== 'skill' && (await this.nativeBindings(handle, scope, subject)).length) return false;
        if (target.kind === 'skill') return (await this.host.skillRepository(handle).get(target.name, target.scope)).installedHash === p.desired;
        if (target.kind === 'project-strategy') {
            const task = await this.host.agent.getTask(handle, subject, target.taskId);
            return task.strategyVersionId === p.candidateId && task.maxRepairRounds === p.desired.maxRepairRounds;
        }

        return same(await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId), p.desired);
    }
    async validatePreviousRoute(handle, route) {
        const persistence = Object.create(this.host.persistence);
        persistence.getRuntimeRoute = async (_owner, id) => id === route.runtimeRouteId ? route : this.host.persistence.getRuntimeRoute(handle, id);
        for (const ref of [route.promptProgramRef, ...(route.projectPromptBindings || []).map(b => b.promptProgramRef)]) {
            const selected = { ...route, promptProgramRef: ref };
            persistence.getRuntimeRoute = async (_owner, id) => id === route.runtimeRouteId ? selected : this.host.persistence.getRuntimeRoute(handle, id);
            await createHostRouteResolver({ ...this.host, persistence }).resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, role: route.role });
        }
    }
    async evaluationSettings(handle, scope, subject, target, candidateId = null) {
        if (['plan-strategy', 'plan-prompt'].includes(target.kind)) {
            await this.skillEnvironment(handle, scope, subject, target);
            const captured = await this.planSource(handle, scope, subject, target, candidateId);
            const planRef = candidateId ? captured.desired.planRef : captured.base.planRef;
            const revision = await this.nativePlans().getRevision(handle, planRef);
            const agents = revision.definition.nodes.filter(node => node.kind === 'agent' && node.capabilities.includes('generation.send'));
            const terminal = agents.filter(node => revision.definition.edges.some(edge => edge.from.nodeId === node.nodeId && edge.to.nodeId === revision.definition.outputContract.ownerNodeId));
            const node = terminal.length === 1 ? terminal[0] : agents.length === 1 ? agents[0] : null;
            const pin = revision.dependencyPins.find(pin => pin.resourceRef.scope === 'player' && pin.pinId === node?.policy.agentPinId);
            const original = candidateId && target.kind === 'plan-prompt' ? await this.prompts.check(handle, captured.candidate.promptCandidateRef.presetId, captured.candidate.promptCandidateRef.candidateId) : null;
            return { nativePlan: { planRef, revision, sourceSelector: captured.base.sourceSelector, ...(original ? { routeOverride: original.desiredRoute } : {}) },
                ...(pin ? { runtimeRouteId: pin.resourceRef.runtimeRouteId } : {}), ...(original && original.desiredRoute.runtimeRouteId === pin?.resourceRef.runtimeRouteId ? { projectPromptRef: original.desiredProgramRef ?? original.desiredRoute.promptProgramRef } : {}),
                version: candidateId ?? hash(captured.base) };
        }
        const c = candidateId ? (await this.check(handle, scope, subject, target, candidateId)).candidate : null;
        if (target.kind === 'skill') {
            const repo = this.host.skillRepository(handle), version = c?.version || (await repo.pin({ scope: target.scope, name: target.name })).version;
            const files = await repo.listFiles({ scope: target.scope, name: target.name, version });
            await this.skillEnvironment(handle, scope, subject, target);
            let native = {};
            if (scope.domain === 'rp_chat') {
                const bindings = await this.nativeBindings(handle, scope, subject);
                if (bindings.length !== 1) throw new TypeError('native_orchestration_evaluation_unavailable');
                const binding = bindings[0], revision = await this.nativePlans().getRevision(handle, binding.planRef);
                const agents = revision.definition.nodes.filter(node => node.kind === 'agent' && node.capabilities.includes('generation.send'));
                const terminal = agents.filter(node => revision.definition.edges.some(edge => edge.from.nodeId === node.nodeId && edge.to.nodeId === revision.definition.outputContract.ownerNodeId));
                if (terminal.length !== 1) throw new TypeError('native_orchestration_evaluation_unavailable');
                const pin = revision.dependencyPins.find(pin => pin.pinId === terminal[0].policy.agentPinId && pin.resourceRef.scope === 'player');
                if (!pin) throw new TypeError('native_orchestration_evaluation_unavailable');
                native = { nativePlan: { planRef: binding.planRef, revision, sourceSelector: binding.sourceSelector }, runtimeRouteId: pin.resourceRef.runtimeRouteId };
            }
            return { ...native, skill: { name: target.name, files: files.map(f => ({ path: f.path, content: f.buffer.toString('base64') })) }, version };
        }

        if (target.kind === 'project-strategy') return { maxRepairRounds: c?.diff.after || (await this.host.agent.getTask(handle, scope.projectId, target.taskId)).maxRepairRounds,
            version: c?.candidateId || hash(projectStrategyBase(await this.tasks.get(handle, scope.projectId, target.taskId))) };
        const route = c ? (await this.prompts.project(handle, target.presetId, candidateId, subject)).desiredRoute : await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId);
        return { projectPromptRef: route.projectPromptBindings?.find(b => b.projectId === subject)?.promptProgramRef || route.promptProgramRef, version: c?.candidateId || hash(route) };
    }
}
