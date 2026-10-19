import fs from 'node:fs';
import path from 'node:path';
import { prepareRetrievalCompute } from '../../src/native/retrieval-compute.js';
import { executeProjectSkillWork } from '../../src/native/skill-invocation.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { createGitClient } from '../../src/git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo } from '../../src/native/index.js';


import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { getRuntimeEvidence, rememberRuntimeEvidence } from '../../public/scripts/native/runtime-client.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { hash, canonical } from './cases.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { boundedSkillReadOptions } from '../../public/shared/skill-invocation.js';
import { projectFixtureSource as projectSource } from './evaluation-settings.js';

const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const call = (id, name, args = {}) => ({ id, name, args });
const completion = toolCalls => ({ assistantText: '', toolCalls, usage: null });
function verifyOwnedRoot(dataRoot, root, marker, token) {
    if (fs.realpathSync(dataRoot) !== root || fs.readFileSync(marker, 'utf8') !== token) throw new Error('Fixture cleanup ownership mismatch');
}

export { runRp } from './native-rp-adapter.js';

function treeHash(root) {
    const files = [];
    function walk(dir, prefix = '') {
        for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(dir, item.name); const relative = prefix + item.name;
            if (item.isSymbolicLink()) throw new Error('Unexpected fixture symlink');
            if (item.isDirectory()) walk(file, relative + '/');
            else files.push([relative, fs.readFileSync(file).toString('base64')]);
        }
    }
    walk(root); return hash(files);
}

export async function runProject(entry, fixture, capture, evaluation = null) {
    const h = await makeTempFsEngine();
    const root = fs.realpathSync(h.dataRoot);
    const marker = path.join(root, '.s01-owned');
    fs.writeFileSync(marker, capture.trialId);
    const oldFetch = globalThis.fetch; const oldAtria = globalThis.Atria; const oldEvidence = getRuntimeEvidence();
    const projectStore = new ProjectStore({ directoriesByHandle: handle => {
        if (handle !== h.handle) throw new Error('Foreign fixture owner'); return h.dirs;
    } });
    const studio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost(),
        simulationRunner: async ({ source }) => ({ displayName: source.project.displayName, mode: 'dry-run' }),
    });
    const agent = new ProjectAgentService({ studio, maxRepairRounds: 2 });
    const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], endpoint: 'http://fixture.invalid' });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 6, maxTokens: 64000,
            localWork: { maxJobs: 64, maxItems: 100, maxInputBytes: 16777216 } } } });
    let task; let canaryRoot; let before; let source; let originalRevision; let conflictRevision;
    try {
        source = projectSource(fixture.projectName, evaluation ? entry.fixtureHash : null);
        const created = await studio.createProject(h.handle, source);
        originalRevision = created.revision.revision;
        const canary = projectSource('Unrelated synthetic Project');
        await studio.createProject(h.handle, canary);
        canaryRoot = path.join(h.dirs.projects, canary.project.projectId); before = treeHash(canaryRoot);
        task = await agent.createTask(h.handle, source.project.projectId, { intent: fixture.input, baseRevision: originalRevision });
        capture.refs.taskIds.push(task.taskId);
        let foreignRejected = false;
        try { await agent.getTask('foreign_owner', source.project.projectId, task.taskId); } catch (error) { foreignRejected = error.name === 'NotFoundError' || error.message === 'Foreign fixture owner'; }
        capture.observe('ownership', foreignRejected, true);
        const proposed = structuredClone(source); proposed.project.displayName = fixture.proposedName; proposed.project.updatedAt = 20;
        const invalid = structuredClone(proposed); invalid.project.projectId = 'invalid-project-id';
        const plan = call('plan', 'atri_agent_set_plan', { summary: fixture.input, steps: [{ id: 'metadata', title: 'Rename metadata', impact: 'low' }] });
        const save = value => call('save', 'atri_agent_project_save', { source: value, stepId: 'metadata' });
        const review = call('review', 'atri_agent_prepare_review');
        const repairing = entry.caseId.startsWith('project_repair');
        const conflict = entry.caseId.startsWith('project_conflict');
        const script = repairing
            ? [[plan, save(invalid), review], [call('reset', 'atri_agent_reset_operations'), save(fixture.assumptions.repair === 'recover_after_one_error' ? proposed : invalid), review]]
            : [[plan], [save(proposed)], [review]];
        const validations = [];
        if (evaluation?.bridge && repairing) {
            for (const tool of [plan, save(invalid), review]) {
                const taskId = task.taskId;
                await agent.executeTool(h.handle, source.project.projectId, taskId, { name: tool.name, args: tool.args });
                task = await agent.getTask(h.handle, source.project.projectId, taskId); capture.toolCalls++;
            }
            validations.push({ status: task.status, round: task.repairRound, validation: task.validation.status });
        }
        const skillRepo = createSkillRepository(root);
        const skillScope = { kind: 'project', projectId: source.project.projectId };
        if (evaluation) await skillRepo.install({ scope: skillScope, payload: { files: [{ path: 'SKILL.md', content:
            '---\nname: evaluation-fixture\ndescription: Isolated evaluation instructions\n---\n' + evaluation.settings.projectSkill }] } });
        const skill = evaluation ? await skillRepo.get('evaluation-fixture', skillScope) : { name: 'evaluation-fixture', scope: skillScope };
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options = {}) => {
            const route = String(url); const body = options.body ? JSON.parse(options.body) : null;
            const method = options.method || 'GET';
            if (method === 'POST' && route === '/api/native/generation/skill-work') {
                const compute = await prepareRetrievalCompute({ handle: h.handle, context: body.computeContext,
                    profile: { mode: 'embed', purpose: 'studio.skill.v1' }, persistence: seeded.persistence, agent, studio });
                return response(await executeProjectSkillWork({ ...body, compute, repository: skillRepo, projectId: source.project.projectId,
                    settings: body.operation === 'list' ? { skills: evaluation ? { [skillEntryKey(skill)]: { paths: { studio: 'always' } } } : {} } : undefined }));
            }
            if (method === 'GET' && route === '/api/native/generation/configuration') return response({ routes: seeded.routes });
            if (method === 'GET' && route === '/api/skills?scope=all') return response(evaluation ? [skill] : []);
            if (method === 'GET' && route === '/api/native/extensions/settings') return response({ value: { skills: evaluation ? { [skillEntryKey(skill)]: { paths: { studio: 'always' } } } : {} } });
            const skillBase = `/api/skills/${encodeURIComponent('project/' + source.project.projectId)}/${skill.name}`;
            if (evaluation && method === 'POST' && route === skillBase + '/pin') return response(await skillRepo.pin({ scope: skillScope, name: skill.name, expectedHash: body?.expectedHash }));
            if (evaluation && method === 'GET' && route.startsWith(skillBase + '/files?')) {
                const query = new URLSearchParams(route.slice((skillBase + '/files?').length));
                if ([...query.keys()].some(key => key !== 'version')) throw new Error('skill_read_invalid');
                const files = await skillRepo.listFiles({ scope: skillScope, name: skill.name, version: query.get('version') });
                return response({ files: files.map(file => ({ path: file.path, size: file.buffer.length, isBinary: file.isBinary })) });
            }
            if (evaluation && method === 'GET' && route.startsWith(skillBase + '/file?')) {
                const query = new URLSearchParams(route.slice((skillBase + '/file?').length));
                if ([...query.keys()].some(key => !['path', 'offset', 'limit', 'version'].includes(key)) || [...query.keys()].length !== new Set(query.keys()).size) throw new Error('skill_read_invalid');
                const options = boundedSkillReadOptions({ path: query.get('path') ?? 'SKILL.md', offset: query.has('offset') ? Number(query.get('offset')) : 1,
                    limit: query.has('limit') ? Number(query.get('limit')) : 200 });
                if (options.path !== 'SKILL.md') throw new Error('skill_read_invalid');
                return response(await skillRepo.readFile({ scope: skillScope, name: skill.name, version: query.get('version'), path: options.path,
                    ...(query.has('offset') || query.has('limit') ? { offset: options.offset, limit: options.limit } : {}) }));
            }
            const base = `/api/native/studio/projects/${source.project.projectId}`;
            const taskPath = `${base}/agent/tasks/${task.taskId}`;
            if (method === 'GET' && route === `${taskPath}/context`) return response(await agent.getContext(h.handle, source.project.projectId, task.taskId));
            if (method === 'POST' && route === `${taskPath}/resume`) return response(await agent.resumeTask(h.handle, source.project.projectId, task.taskId));
            if (method === 'POST' && route === `${taskPath}/generation/begin`) return response(await agent.beginGeneration(h.handle, source.project.projectId, task.taskId, body));
            if (method === 'POST' && route === `${taskPath}/generation/finish`) return response(await agent.finishGeneration(h.handle, source.project.projectId, task.taskId, body));
            if (method === 'GET' && route === taskPath) return response(await agent.getTask(h.handle, source.project.projectId, task.taskId));
            if (method === 'POST' && route === `${base}/preflight`) return response(await studio.preflightProject(h.handle, source.project.projectId, body));
            if (method === 'POST' && route === '/api/native/generation/execute') {
                if (body.projectId !== source.project.projectId || body.taskId !== task.taskId || body.revision !== originalRevision) throw new Error('Project request identity drift');
                if (capture.refs.requestIds.length >= entry.limits.maxRequests) throw Object.assign(new Error('Script request budget'), { code: 'script_request_budget' });
                evaluation?.beforeSend(body.requestId);
                capture.refs.requestIds.push(body.requestId); capture.prompts.push(body.messages);
                if (evaluation?.bridge) {
                    return response(await evaluation.bridge.project({ studio, agent, input: body, trialId: capture.trialId, signal: options.signal }));
                }
                const next = script.shift(); if (!next) throw new Error('Script exhausted');
                return response({ response: completion(next), snapshot: null });
            }
            if (route === `${taskPath}/tool` && options.method === 'POST') {
                capture.toolCalls++;
                if (conflict && body.name === 'atri_agent_prepare_review') {
                    const human = structuredClone(source); human.project.displayName = 'Fixture human revision';
                    const saved = await studio.saveProjectSource(h.handle, source.project.projectId, { source: human, baseRevision: originalRevision, origin: { kind: 'human', id: 'fixture_reviewer' } });
                    conflictRevision = saved.changeSet.resultingRevision;
                }
                try {
                    const taskId = task.taskId;
                    const toolResult = await agent.executeTool(h.handle, source.project.projectId, taskId, body);
                    // Read tools return Project/resource data, not the task authority.
                    task = await agent.getTask(h.handle, source.project.projectId, taskId);
                    if (body.name === 'atri_agent_prepare_review') validations.push({ status: task.status, round: task.repairRound, validation: task.validation.status });
                    return response(toolResult);
                } catch (error) {
                    return response({ error: error.code, details: error.details }, error.name === 'ConflictError' ? 409 : 400);
                }
            }
            // No fallback to the process's real fetch, including commit.
            throw Object.assign(new Error('isolated_route_denied'), { code: 'isolated_route_denied' });
        };
        let modelError = null;
        try {
            await evaluation?.probe?.({ projectId: source.project.projectId, taskId: task.taskId });
            await runNativeStudioAgentTask({ projectId: source.project.projectId, taskId: task.taskId, messages: [{ role: 'user', content: fixture.input }], maxModelRounds: evaluation?.settings.roundLimit ?? 6 });
        } catch (error) { modelError = error; }
        if (capture.budgetBlocked) throw modelError || new Error('comparison_budget_blocked');
        task = await agent.getTask(h.handle, source.project.projectId, task.taskId);
        const beforeReviewRevision = (await studio.getRevision(h.handle, source.project.projectId)).revision;
        const modelChangesets = task.changeSets.length;
        if (conflict) {
            capture.observe('human_revision', { revision: beforeReviewRevision, name: (await studio.getProject(h.handle, source.project.projectId)).source.project.displayName }, { revision: conflictRevision ?? null, name: 'Fixture human revision' });
            capture.observe('no_silent_rebase', { status: task.status, baseRevision: task.baseRevision, writes: modelChangesets, error: modelError?.code || null }, { status: 'conflict', baseRevision: originalRevision, writes: 0, error: evaluation?.bridge ? modelError?.code || null : 'project_revision_conflict' });
            capture.reviewStatus = 'unavailable'; capture.completeness.push('review');
        } else {
            if (modelError) throw modelError;
            const shouldBlock = repairing && !evaluation?.bridge && fixture.assumptions.repair === 'block_after_two_errors';
            capture.observe('review_gate', { revision: beforeReviewRevision, modelWrites: modelChangesets, status: task.status, validation: task.validation?.status ?? null }, { revision: originalRevision, modelWrites: 0, validation: shouldBlock ? 'failed' : 'passed', status: shouldBlock ? 'blocked' : 'review' });
            if (repairing) {
                capture.observe('validation_error', validations[0], { status: 'repair', round: 1, validation: 'failed' });
                if (evaluation?.bridge) capture.observe('repair_bound', task.repairRound <= 2, true);
                else capture.observe('repair_bound', { statuses: validations.map(item => item.status), round: task.repairRound },
                    { statuses: ['repair', fixture.assumptions.repair === 'block_after_two_errors' ? 'blocked' : 'review'], round: fixture.assumptions.repair === 'block_after_two_errors' ? 2 : 1 });
                if (task.status === 'blocked' && !evaluation?.bridge) {
                    let closed = false;
                    try { await agent.executeTool(h.handle, source.project.projectId, task.taskId, { name: 'atri_agent_validate_current' }); } catch (error) { closed = error.code === 'project_agent_repair_limit'; }
                    capture.observe('repair_bound', { ...capture.evidence.find(item => item.evidenceId.endsWith(':repair_bound')).value.observed, closed, writes: task.changeSets.length },
                        { statuses: ['repair', 'blocked'], round: 2, closed: true, writes: 0 });
                }
            }
            if (task.status === 'review') {
                // Explicit fixture reviewer, after the model loop has stopped.
                task = await agent.commit(h.handle, source.project.projectId, task.taskId);
                capture.refs.effectIds.push(...task.changeSets.map(item => item.changeSetId));
                const replayed = await agent.commit(h.handle, source.project.projectId, task.taskId);
                const receiptReplayed = replayed.changeSets.length === 1 && replayed.changeSets[0].changeSetId === task.changeSets[0].changeSetId;
                if (!repairing) capture.observe('single_changeset', { count: task.changeSets.length, receiptReplayed, name: (await studio.getProject(h.handle, source.project.projectId)).source.project.displayName }, { count: 1, receiptReplayed: true, name: fixture.proposedName });
                if (repairing && !evaluation?.bridge) {
                    const item = capture.evidence.find(item => item.evidenceId.endsWith(':repair_bound')).value;
                    capture.observe('repair_bound', { ...item.observed, formalWrites: task.changeSets.length, receiptReplayed }, { ...item.expected, formalWrites: 1, receiptReplayed: true });
                }
                capture.reviewStatus = 'passed';
            } else { capture.reviewStatus = 'unavailable'; capture.completeness.push('review'); }
        }
        capture.repairCount = task.repairRound;
        capture.finalTextStatus = 'not_run';
        capture.completeness.push('final_text', 'durable_task', 'exact_generation_config');
        capture.observe('isolation', treeHash(canaryRoot), before);
        if (evaluation) {
            const current = (await studio.getProject(h.handle, source.project.projectId)).source;
            capture.artifact = { domain: 'project', output: canonical(current), status: task.status, sourceHash: hash(source),
                outcomeHash: hash(current), requestHashes: capture.prompts.map(hash),
                targetConsumed: capture.prompts.every(messages => canonical(messages).includes(JSON.stringify(evaluation.settings.projectSkill).slice(1, -1))) };
        }
    } finally {
        globalThis.fetch = oldFetch;
        if (oldAtria === undefined) delete globalThis.Atria; else globalThis.Atria = oldAtria;
        rememberRuntimeEvidence(oldEvidence);
        if (task?.preview?.previewId) studio.closePreview(h.handle, task.preview.previewId);
        verifyOwnedRoot(h.dataRoot, root, marker, capture.trialId);
        h.cleanup();
    }
}
