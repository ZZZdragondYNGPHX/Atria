import { SettingsRepo } from '../../storage/repositories/settings-repo.js';
import { PromptCandidateStore } from '../model-prompt-runtime/prompt-candidates.js';
import { projectStrategyBase } from './project-strategy.js';
import { ProjectTaskRepository } from './project-task-repository.js';
import { assertEvidenceScope } from './contracts.js';
import { evolutionFields as fields, evolutionHash as hash, sameEvolutionValue as same, evolutionText as text } from './evolution-repository.js';
import { checkWorkspacePromptCandidate, updateWorkspacePromptVersions } from '../../../public/scripts/lib/agent-workspace/prompt-versions.js';
import { checkWorkspaceStrategyCandidate, updateWorkspaceStrategyVersions } from '../../../public/scripts/lib/agent-workspace/strategy-versions.js';
import { validatePresetLibrary } from '../../../public/scripts/lib/agent-workspace/presets.js';
import { workspaceHostProfile } from '../../../public/scripts/agents/orchestrator/workspace/host-profile.js';
import { skillInvocationMode } from '../../../public/shared/extension-contract.js';
import { resolveSkillInvocation } from '../../../public/shared/skill-invocation.js';
import { ExtensionsStore } from '../extensions-store.js';
import { ConflictError } from '../../storage/errors.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';

const conflict = () => { throw new ConflictError('agent_evolution_target_conflict'); };
const candidateFields = kind => kind === 'workspace-prompt' ? 'promptVersions' : 'strategyVersions';
const workspaceUpdate = kind => kind === 'workspace-prompt' ? updateWorkspacePromptVersions : updateWorkspaceStrategyVersions;
const localCharacter = (scope, subject) => scope.domain === 'rp_chat' && !scope.isGroup && subject === scope.charDir;

// All writes below go through the original single-Host target queues and CAS.
// No configuration pointer is read from the Evolution journal at run time.
export class EvolutionTargets {
    constructor({ host }) {
        this.host = host;
        this.settings = new SettingsRepo({ engine: host.persistence._engine });
        this.prompts = new PromptCandidateStore({ engine: host.library?._engine || host.persistence._engine });
        this.tasks = new ProjectTaskRepository({ engine: host.persistence._engine });
    }
    async library(handle) {
        const settings = await this.settings.get(handle);
        return validatePresetLibrary(settings?.atri_capabilities?.orchestrator?.agentWorkspace);
    }
    authorize(scope, subject, target) {
        assertEvidenceScope(scope); text(subject); fields(target, ['kind', 'scope', 'name', 'presetId', 'agentId', 'field', 'bindingSubject', 'runtimeRouteId', 'moduleRef', 'taskId']);
        if (target.kind === 'skill') {
            fields(target, ['kind', 'scope', 'name']); text(target.name, 128);
            if (scope.domain === 'project' && subject === scope.projectId && target.scope?.kind === 'project' && target.scope.projectId === subject) return;
            if (localCharacter(scope, subject) && target.scope?.kind === 'character' && target.scope.characterFile === subject + '.png') return;
        } else if (['workspace-prompt', 'workspace-strategy'].includes(target.kind)) {
            fields(target, target.kind === 'workspace-prompt' ? ['kind', 'presetId', 'agentId', 'bindingSubject'] : ['kind', 'presetId', 'field', 'bindingSubject']);
            if (localCharacter(scope, subject) && target.bindingSubject === subject + '.png' && !target.presetId?.startsWith('builtin-')) return;
        } else if (target.kind === 'project-prompt') {
            fields(target, ['kind', 'presetId', 'runtimeRouteId', 'moduleRef']);
            if (scope.domain === 'project' && subject === scope.projectId) return;
        } else if (target.kind === 'project-strategy') {
            fields(target, ['kind', 'taskId', 'field']);
            if (scope.domain === 'project' && subject === scope.projectId && target.field === 'maxRepairRounds') return;
        }
        throw new TypeError('Evolution target is outside this exact local subject');
    }
    async rpPreset(handle, scope, subject) {
        if (!localCharacter(scope, subject)) throw new TypeError('Only an ordinary character RP scope is supported');
        const library = await this.library(handle);
        // A stronger conversation override would hide the declared character target.
        if (library.bindings.entries.some(b => b.scope === 'conversation' && b.subjectId === scope.name)) conflict();
        const binding = library.bindings.entries.find(b => b.scope === 'character' && b.subjectId === subject + '.png');
        const preset = library.presets.find(p => p.id === binding?.presetId);
        if (!preset || binding.promptVersionId || binding.strategyVersionId) conflict();
        return { preset, binding };
    }
    boundedDirector(preset) {
        if (preset.mode !== 'director' || preset.planTemplate.budgets.maxSteps > 6 || preset.planTemplate.nodes.some(n => n.nodeId !== 'owner')) throw new TypeError('Evaluation supports a bounded single-owner Director only');
        return workspaceHostProfile(preset);
    }
    async skillEnvironment(handle, scope, subject, target) {
        const repo = this.host.skillRepository(handle), extensions = this.host.extensions || new ExtensionsStore({ engine: this.host.persistence._engine });
        const invocation = await extensions.settings(handle), path = scope.domain === 'project' ? 'studio' : 'agents';
        const entries = await repo.list({ scope: 'all' });
        const rp = scope.domain === 'rp_chat' ? await this.rpPreset(handle, scope, subject) : null;
        const profile = rp ? this.boundedDirector(rp.preset) : null;
        const context = rp ? { characterFile: rp.binding.subjectId, orchPreset: { mode: 'director', name: rp.preset.name } } : { projectId: subject };
        const visible = resolveSkillInvocation(entries, { context, settings: invocation.value, path, legacy: Boolean(rp), modeProfile: profile, agentConfig: profile?.mainAgent });
        const selected = target.kind === 'skill' ? visible.find(e => e.name === target.name && same(e.scope, target.scope)) : null;
        if (target.kind === 'skill' && (!selected || skillInvocationMode(selected, invocation.value, path) !== 'always')) throw new TypeError('Declare an already visible always-invoked local Skill');
        if (visible.some(e => !selected || !same(e.scope, selected.scope) || e.name !== selected.name)) throw new TypeError('Combined Skill environments require a new combined evaluator; choose review');
        return { invocationRevision: invocation.revision, ...(rp ? { rpPreset: rp.preset, rpBinding: rp.binding } : {}) };
    }
    async catalog(handle, scope, subject) {
        const choices = [];
        const skillScope = scope.domain === 'project' ? { kind: 'project', projectId: subject } : { kind: 'character', characterFile: subject + '.png' };
        if (scope.domain === 'project') await this.host.studio.getProject(handle, subject);
        else if (!localCharacter(scope, subject)) return choices;
        for (const e of await this.host.skillRepository(handle).list({ scope: skillScope })) choices.push({ label: 'Skill · ' + e.name, target: { kind: 'skill', scope: e.scope, name: e.name }, baseHash: e.installedHash });
        if (scope.domain === 'project') {
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
        } else {
            const { preset, binding } = await this.rpPreset(handle, scope, subject);
            if (!preset.id.startsWith('builtin-')) {
                for (const agent of preset.planTemplate.agents) choices.push({ label: preset.name + ' · ' + agent.id, target: { kind: 'workspace-prompt', presetId: preset.id, agentId: agent.id, bindingSubject: binding.subjectId }, baseHash: hash(preset) });
                if (preset.mode === 'director') choices.push({ label: preset.name + ' · maxSteps', target: { kind: 'workspace-strategy', presetId: preset.id, field: 'budgets.maxSteps', bindingSubject: binding.subjectId }, baseHash: hash(preset) });
            }
        }
        return choices.slice(0, 128);
    }
    async declare(handle, scope, subject, target, expectedBaseHash) {
        this.authorize(scope, subject, target);
        const choice = (await this.catalog(handle, scope, subject)).find(c => same(c.target, target));
        if (!choice || choice.baseHash !== expectedBaseHash) conflict();
        if (target.kind === 'skill') return this.capture(handle, scope, subject, target);
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle), preset = library.presets.find(p => p.id === target.presetId);
            return this.settings.updateWorkspace(handle, library, current => workspaceUpdate(target.kind)(current, { type: 'declare', presetId: target.presetId, expectedPreset: preset,
                ...(target.kind === 'workspace-prompt' ? { agentIds: [target.agentId] } : { allowedFields: [target.field] }) }));
        }
        if (target.kind === 'project-strategy') {
            const task = await this.host.agent.getTask(handle, subject, target.taskId);
            return this.host.agent.strategyCandidates(handle, subject, target.taskId, { type: 'declare', expectedSequence: task.sequence, allowedFields: [target.field] });
        }
        const preset = await this.prompts.presets.get(handle, target.presetId);
        return this.prompts.declare(handle, target.presetId, { expectedRevision: preset.revision, moduleRefs: [target.moduleRef] });
    }
    async capture(handle, scope, subject, target) {
        this.authorize(scope, subject, target);
        if (scope.domain === 'project') await this.host.studio.getProject(handle, scope.projectId);
        if (target.kind === 'skill') {
            const repo = this.host.skillRepository(handle), pin = await repo.pin({ scope: target.scope, name: target.name });
            const body = (await repo.listFiles(pin)).find(f => f.path === 'SKILL.md').buffer.toString('utf8');
            return { environment: await this.skillEnvironment(handle, scope, subject, target), base: pin.version, declaration: { scope: target.scope, name: target.name, header: body.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] }, body, field: 'SKILL.md' };
        }
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle), preset = library.presets.find(p => p.id === target.presetId);
            const declaration = library[candidateFields(target.kind)]?.declarations.find(d => d.presetId === target.presetId);
            const binding = library.bindings.entries.find(b => b.scope === 'character' && b.subjectId === target.bindingSubject);
            if (!preset || !declaration || !same(declaration.base, preset) || binding?.presetId !== preset.id || binding.promptVersionId || binding.strategyVersionId) conflict();
            const field = target.kind === 'workspace-prompt' ? target.agentId : target.field;
            if (!(target.kind === 'workspace-prompt' ? declaration.agentIds : declaration.allowedFields).includes(field)) conflict();
            const body = target.kind === 'workspace-prompt' ? preset.planTemplate.agents.find(a => a.id === target.agentId).instructions : target.field.split('.').reduce((v, k) => v?.[k], preset.planTemplate);
            await this.rpPreset(handle, scope, subject);
            return { environment: await this.skillEnvironment(handle, scope, subject, target), base: { preset, bindings: library.bindings }, declaration, body, field };
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
        if (target.kind === 'skill') return this.host.skillRepository(handle).prepareCandidate({ scope: target.scope, name: target.name, baseVersion: actual.base, content: value });
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle), before = new Set(library[candidateFields(target.kind)].candidates.map(c => c.candidateId));
            const action = { type: 'prepare', presetId: target.presetId, scope: 'character', subjectId: target.bindingSubject, expectedBindings: actual.base.bindings,
                ...(target.kind === 'workspace-prompt' ? { agentId: target.agentId, body: value } : { field: target.field, value }) };
            const result = await this.settings.updateWorkspace(handle, library, current => workspaceUpdate(target.kind)(current, action));
            const candidates = result.library[candidateFields(target.kind)].candidates;
            return candidates.find(c => !before.has(c.candidateId)) || candidates.find(c => c.diff.after === value);
        }
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
        if (target.kind === 'skill') {
            const c = await this.host.skillRepository(handle).checkCandidate({ scope: target.scope, name: target.name, candidateId });
            if (![c.baseVersion, c.version].includes(c.currentVersion)) conflict();
            return { candidate: c, base: c.baseVersion, desired: c.version, previous: c.baseVersion, actual: c.currentVersion };
        }
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle);
            // Explicit rollback can survive revoking a declaration, but never
            // a deleted/corrupted previous definition or changed whole binding.
            const result = target.kind === 'workspace-prompt' ? checkWorkspacePromptCandidate(library, candidateId, { rollback })
                : rollback ? (() => { const next = updateWorkspaceStrategyVersions(library, { type: 'rollback', candidateId }); const c = library.strategyVersions.candidates.find(c => c.candidateId === candidateId); return { candidate: c, desiredBindings: library.bindings, alreadyApplied: !same(next.bindings, library.bindings) }; })()
                    : checkWorkspaceStrategyCandidate(library, candidateId);
            const c = result.candidate;
            if (c.presetId !== target.presetId || c.scope !== 'character' || c.subjectId !== target.bindingSubject
                || (target.kind === 'workspace-prompt' ? c.agentId !== target.agentId : c.diff.field !== target.field)) conflict();
            const desiredBindings = structuredClone(c.baseBindings);
            desiredBindings.entries.find(b => b.scope === c.scope && b.subjectId === c.subjectId)[target.kind === 'workspace-prompt' ? 'promptVersionId' : 'strategyVersionId'] = candidateId;
            const base = { preset: c.base, bindings: c.baseBindings }, desired = { preset: c.desired, bindings: desiredBindings };
            return { candidate: c, base, desired, previous: base, actual: same(library.bindings, desiredBindings) ? desired : base };
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
        if (target.kind === 'skill') {
            const repo = this.host.skillRepository(handle), c = await repo.checkCandidate({ scope: target.scope, name: target.name, candidateId });
            return rollback ? repo.rollbackCandidate({ scope: target.scope, name: target.name, candidateId, expectedVersion: c.version, beforeCommit })
                : repo.applyCandidate({ scope: target.scope, name: target.name, candidateId, expectedBaseVersion: c.baseVersion, beforeCommit });
        }
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle);
            return this.settings.updateWorkspace(handle, library, async current => {
                const desired = workspaceUpdate(target.kind)(current, { type: rollback ? 'rollback' : 'apply', candidateId });
                await beforeCommit(); return desired;
            });
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
        if (target.kind === 'skill') return this.host.skillRepository(handle).discardCandidate({ scope: target.scope, name: target.name, candidateId });
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle);
            return this.settings.updateWorkspace(handle, library, current => {
                if (current.bindings.entries.some(b => b.promptVersionId === candidateId || b.strategyVersionId === candidateId)) conflict();
                current[candidateFields(target.kind)].candidates = current[candidateFields(target.kind)].candidates.filter(c => c.candidateId !== candidateId);
                return current;
            });
        }
        if (target.kind === 'project-strategy') return this.host.agent.strategyCandidates(handle, subject, target.taskId, { type: 'discard', candidateId });
        return this.prompts.discard(handle, target.presetId, candidateId);
    }
    async publicationCurrent(handle, scope, subject, publication) {
        const p = publication, target = p.target;
        this.authorize(scope, subject, target);
        if (target.kind === 'skill') return (await this.host.skillRepository(handle).get(target.name, target.scope)).installedHash === p.desired;
        if (target.kind === 'project-strategy') {
            const task = await this.host.agent.getTask(handle, subject, target.taskId);
            return task.strategyVersionId === p.candidateId && task.maxRepairRounds === p.desired.maxRepairRounds;
        }
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle);
            const c = library[candidateFields(target.kind)]?.candidates.find(c => c.candidateId === p.candidateId);
            return Boolean(c && same(c.desired, p.desired.preset) && same(library.bindings, p.desired.bindings));
        }
        return same(await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId), p.desired);
    }
    async validatePreviousRoute(handle, route) {
        const persistence = Object.create(this.host.persistence);
        persistence.getRuntimeRoute = async (_owner, id) => id === route.runtimeRouteId ? route : this.host.persistence.getRuntimeRoute(handle, id);
        for (const ref of [route.promptProgramRef, ...(route.projectPromptBindings || []).map(b => b.promptProgramRef)]) {
            const selected = { ...route, promptProgramRef: ref };
            persistence.getRuntimeRoute = async (_owner, id) => id === route.runtimeRouteId ? selected : this.host.persistence.getRuntimeRoute(handle, id);
            await new RouteResolver({ persistence, library: this.host.library, providers: this.host.providers }).resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, role: route.role });
        }
    }
    async evaluationSettings(handle, scope, subject, target, candidateId = null) {
        const c = candidateId ? (await this.check(handle, scope, subject, target, candidateId)).candidate : null;
        if (target.kind === 'skill') {
            const repo = this.host.skillRepository(handle), version = c?.version || (await repo.pin({ scope: target.scope, name: target.name })).version;
            const files = await repo.listFiles({ scope: target.scope, name: target.name, version });
            const environment = await this.skillEnvironment(handle, scope, subject, target);
            return { ...(environment.rpPreset ? { rpProfile: this.boundedDirector(environment.rpPreset) } : {}), skill: { name: target.name, files: files.map(f => ({ path: f.path, content: f.buffer.toString('base64') })) }, version };
        }
        if (target.kind.startsWith('workspace-')) {
            const library = await this.library(handle), preset = c?.desired || library.presets.find(p => p.id === target.presetId);
            const profile = this.boundedDirector(preset);
            return { rpProfile: profile, version: hash(preset) };
        }
        if (target.kind === 'project-strategy') return { maxRepairRounds: c?.diff.after || (await this.host.agent.getTask(handle, scope.projectId, target.taskId)).maxRepairRounds,
            version: c?.candidateId || hash(projectStrategyBase(await this.tasks.get(handle, scope.projectId, target.taskId))) };
        const route = c ? (await this.prompts.project(handle, target.presetId, candidateId, subject)).desiredRoute : await this.host.persistence.getRuntimeRoute(handle, target.runtimeRouteId);
        return { projectPromptRef: route.projectPromptBindings?.find(b => b.projectId === subject)?.promptProgramRef || route.promptProgramRef, version: c?.candidateId || hash(route) };
    }
}
