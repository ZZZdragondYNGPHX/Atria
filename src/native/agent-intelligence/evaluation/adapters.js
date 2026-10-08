import fs from 'node:fs';
import path from 'node:path';
import { createSkillRepository } from '../../../skills/repository.js';
import { createGitClient } from '../../../git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo } from '../../../native/index.js';
import { runMainAgentLoop } from '../../../../public/scripts/agents/orchestrator/director-runtime.js';
import { createMessageEditorHandle } from '../../../../public/scripts/message-takeover.js';
import { clearCurrentRun, getCurrentRun, startRun } from '../../../../public/scripts/agents/orchestrator/run-state/store.js';
import { runNativeStudioAgentTask } from '../../../../public/scripts/native/studio-agent.js';
import { getRuntimeEvidence, rememberRuntimeEvidence } from '../../../../public/scripts/native/runtime-client.js';
import { createEvaluationStore as makeTempFsEngine } from './store.js';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
import { hash, canonical } from './cases.js';
import { skillEntryKey } from '../../../../public/shared/extension-contract.js';
import { boundedSkillReadOptions } from '../../../../public/shared/skill-invocation.js';
import { projectFixtureSource as projectSource } from './fixture-source.js';

const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const call = (id, name, args = {}) => ({ id, name, args });
const completion = toolCalls => ({ assistantText: '', toolCalls, usage: null });
function verifyOwnedRoot(dataRoot, root, marker, token) {
    if (fs.realpathSync(dataRoot) !== root || fs.readFileSync(marker, 'utf8') !== token) throw new Error('Fixture cleanup ownership mismatch');
}

export async function runRp(entry, fixture, capture, evaluation = null) {
    const player = { mes: fixture.input, is_user: true };
    const playerBefore = hash(player);
    const chat = [player, { mes: '', extra: { reasoning: '' }, is_user: false }];
    let profile = { mode: 'director', director: { mainAgent: { systemPrompt: 'Express only the NPC response. Preserve the player choice and use the revised visible promise.' }, subAgents: [], maxRounds: 6,
        tools: { message: { write_message: true, apply_message_patches: true } } } };
    if (evaluation) {
        if (evaluation.settings.rpProfile) profile = { mode: 'director', director: structuredClone(evaluation.settings.rpProfile) };
        else profile.director.mainAgent.systemPrompt = evaluation.settings.rpPrompt;
        profile.director.maxRounds = evaluation.settings.rpProfile?.maxRounds || evaluation.settings.roundLimit;
    }
    const oldAtria = globalThis.Atria;
    let rpStore;
    if (evaluation?.settings.skill) {
        rpStore = await makeTempFsEngine();
        const repo = createSkillRepository(rpStore.dataRoot), scope = { kind: 'global' };
        const skill = evaluation.settings.skill;
        await repo.install({ scope, payload: { files: skill.files.map(f => ({ path: f.path, content: f.content, encoding: 'base64' })) } });
        globalThis.Atria = { getContext: () => ({ skills: { list: opts => repo.list(opts), pin: opts => repo.pin(opts), readFile: opts => repo.readFile(opts),
            invocationSettings: async () => ({ skills: { [skillEntryKey({ scope, name: skill.name })]: { paths: { agents: 'always' } } } }) } }) };
    }
    const payload = { messages: [{ role: 'system', content: canonical(fixture.memory.visible) }, { role: 'user', content: fixture.input }] };
    const requestTexts = [];
    let modelRequests = 0;
    const run = async (variantId, generate, controller = new AbortController()) => {
        clearCurrentRun();
        const runId = startRun({ mode: 'director', chatKey: entry.caseId });
        capture.refs.runIds.push(runId);
        const variant = { messageId: `${entry.caseId}:npc`, variantId, runId, requestIds: [] };
        capture.refs.messageVariants.push(variant);
        const handle = createMessageEditorHandle({ generationType: variantId === 'v1' ? 'normal' : 'regenerate', flushIntervalMs: 0, owner: fixture.actor, abortSignal: controller.signal });
        handle.setOnUpdate((text, reasoning) => { chat[1].mes = text; chat[1].extra.reasoning = reasoning; });
        const promise = runMainAgentLoop({ handle, profile, eventData: { abortSignal: controller.signal, placeholderMessageId: 1 }, deps: {
            chat, runId, getContentPayload: () => payload, contextForNotes: {},
            generateTaskStreamForMainAgent: async request => {
                const injectedStaleChallenge = evaluation?.bridge && entry.caseId.startsWith('rp_variant') && variantId === 'v1';
                if (!injectedStaleChallenge && modelRequests >= entry.limits.maxRequests) throw Object.assign(new Error('Script request budget'), { code: 'script_request_budget' });
                if (!injectedStaleChallenge) modelRequests++;
                const requestId = `${capture.trialId}:${evaluation?.bridge ? 'model' : 'script'}-request-${capture.refs.requestIds.length + 1}`;
                evaluation?.beforeSend(requestId);
                capture.refs.requestIds.push(requestId); variant.requestIds.push(requestId);
                requestTexts.push(canonical(request.taskMessages));
                capture.prompts.push(request.taskMessages);
                if (evaluation?.bridge) {
                    // Stale delivery is an injected authority challenge. Its
                    // pending value never sends a paid request; v2 behavior
                    // still uses the original model loop and provider.
                    if (injectedStaleChallenge) return generate(request);
                    const result = await evaluation.bridge.rp({ requestId, trialId: capture.trialId, fixtureHash: entry.fixtureHash,
                        messages: request.taskMessages, tools: request.tools, signal: request.abortSignal,
                        onSend: () => { if (entry.caseId.startsWith('rp_variant') && variantId === 'v1') generate(request); } });
                    return result.response;
                }
                return generate(request);
            },
        } }).finally(() => {
            const state = getCurrentRun();
            if (state?.runId === runId) capture.toolCalls += state.rounds.flatMap(round => round.sections).filter(section => section.kind === 'tool_result').length;
        });
        return { promise, handle, runId };
    };
    try {
        if (entry.caseId.startsWith('rp_variant')) {
            const entered = deferred(); const late = deferred(); const controller = new AbortController();
            const old = await run('v1', () => { entered.resolve(); return late.promise; }, controller);
            // A rejected send must also release this waiter (e.g. a shared budget).
            await Promise.race([entered.promise, old.promise]);
            controller.abort();
            // Observe terminal abort before regeneration; transport result arrives late.
            try { await old.promise; } catch (error) { if (error.name !== 'AbortError' && !(evaluation?.bridge && error.code === 'generation_cancelled')) throw error; }
            const next = await run('v2', () => completion([call('write-new', 'write_message', { text: fixture.reply, mode: 'replace' }), call('final-new', 'finalize')]));
            await next.promise;
            const committedText = evaluation?.bridge ? chat[1].mes : fixture.reply;
            late.resolve(completion([call('late-write', 'write_message', { text: 'STALE COMPLETION', mode: 'replace' }), call('late-final', 'finalize')]));
            await Promise.resolve();
            let rejected = false;
            try { old.handle.setText('STALE EDIT'); } catch (error) { rejected = error.code === 'editor_aborted'; }
            capture.observe('stale_completion', { rejected, text: chat[1].mes, oldStatus: (await old.handle.complete).status }, { rejected: true, text: committedText, oldStatus: 'aborted' });
            capture.observe('variant_identity', { runs: new Set(capture.refs.runIds).size, requestsDistinct: new Set(capture.refs.requestIds).size === capture.refs.requestIds.length, newStatus: (await next.handle.complete).status }, { runs: 2, requestsDistinct: true, newStatus: 'committed' });
        } else {
            const main = await run('v1', () => completion([
                call('write', 'write_message', { text: fixture.reply, mode: 'replace', messageId: 0, owner: 'player' }), call('final', 'finalize'),
            ]));
            await main.promise;
            const outcome = await main.handle.complete;
            if (entry.caseId.startsWith('rp_agency')) {
                if (evaluation?.bridge) capture.observe('player_ownership', hash(player), playerBefore);
                else capture.observe('player_ownership', { player: hash(player), npc: chat[1].mes }, { player: playerBefore, npc: fixture.reply });
                capture.observe('single_completion', outcome.status, 'committed');
            } else {
                capture.observe('request_exposure', { visible: requestTexts.every(text => fixture.memory.visible.every(item => text.includes(item.text))), private: requestTexts.some(text => text.includes(fixture.memory.private.text)) }, { visible: true, private: false });
                capture.observe('revision_reference', requestTexts.every(text => text.includes('revision') && text.includes('Revision: meet')), true);
                capture.completeness.push('production_memory_resolution', 'memory_behavior_application');
            }
        }
        capture.finalTextStatus = chat[1].mes ? 'passed' : 'unavailable';
        capture.reviewStatus = 'not_run';
        capture.observe('isolation', hash(player), playerBefore);
        capture.completeness.push('skill_preset_exact_pinning', 'durable_trace');
        if (evaluation) capture.artifact = { domain: 'rp_chat', output: chat[1].mes, status: 'observed',
            sourceHash: hash(fixture), outcomeHash: hash(chat[1]), requestHashes: capture.prompts.map(hash),
            targetConsumed: capture.prompts.length > 0 && (evaluation.settings.skill ? capture.prompts.some(messages => canonical(messages).includes(evaluation.settings.version)) : evaluation.settings.rpProfile ? profile.director.maxRounds === evaluation.settings.rpProfile.maxRounds && capture.prompts.every(messages => canonical(messages).includes(JSON.stringify(profile.director.mainAgent.systemPrompt).slice(1, -1))) : capture.prompts.every(messages => canonical(messages).includes(JSON.stringify(evaluation.settings.rpPrompt).slice(1, -1)))) };
    } finally { clearCurrentRun(); globalThis.Atria = oldAtria; rpStore?.cleanup(); }
}

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
    const marker = path.join(root, '.atri-evaluation-owned');
    fs.writeFileSync(marker, capture.trialId);
    const oldFetch = globalThis.fetch; const oldAtria = globalThis.Atria; const oldEvidence = getRuntimeEvidence();
    const projectStore = new ProjectStore({ directoriesByHandle: handle => {
        if (handle !== h.handle) throw new Error('Foreign fixture owner'); return h.dirs;
    } });
    const studio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost(),
        simulationRunner: async ({ source }) => ({ displayName: source.project.displayName, mode: 'dry-run' }),
    });
    const agent = new ProjectAgentService({ studio, maxRepairRounds: 10 });
    let task; let canaryRoot; let before; let source; let originalRevision; let conflictRevision;
    try {
        source = projectSource(fixture.projectName, evaluation ? entry.fixtureHash : null);
        const created = await studio.createProject(h.handle, source);
        originalRevision = created.revision.revision;
        const canary = projectSource('Unrelated synthetic Project');
        await studio.createProject(h.handle, canary);
        canaryRoot = path.join(h.dirs.projects, canary.project.projectId); before = treeHash(canaryRoot);
        task = await agent.createTask(h.handle, source.project.projectId, { intent: fixture.input, baseRevision: originalRevision, maxRepairRounds: evaluation?.settings.maxRepairRounds || 2 });
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
        const validations = [], publicTools = [];
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
        if (evaluation) {
            const skill = evaluation.settings.skill;
            await skillRepo.install({ scope: skillScope, payload: { files: skill ? skill.files.map(f => ({ path: f.path, content: f.content, encoding: 'base64' })) : [{ path: 'SKILL.md', content:
                '---\nname: evaluation-fixture\ndescription: Isolated evaluation instructions\n---\n' + evaluation.settings.projectSkill }] } });
        }
        const skill = evaluation ? await skillRepo.get(evaluation.settings.skill?.name || 'evaluation-fixture', skillScope) : { name: 'evaluation-fixture', scope: skillScope };
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options = {}) => {
            const route = String(url); const body = options.body ? JSON.parse(options.body) : null;
            const method = options.method || 'GET';
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
                    publicTools.push({ name: body.name, status: 'returned' });
                    // Read tools return Project/resource data, not the task authority.
                    task = await agent.getTask(h.handle, source.project.projectId, taskId);
                    if (body.name === 'atri_agent_prepare_review') validations.push({ status: task.status, round: task.repairRound, validation: task.validation.status });
                    return response(toolResult);
                } catch (error) {
                    publicTools.push({ name: body.name, status: 'error', code: error.code || 'unavailable' });
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
            capture.artifact = { domain: 'project', output: canonical({ source: current, plan: task.plan, status: task.status,
                validation: task.validation, repairRounds: task.repairRound, tools: publicTools,
                conversation: task.conversation.filter(m => m.role === 'assistant').map(m => ({ content: m.content,
                    tools: (m.tool_calls || []).map(t => t.function?.name) })) }), status: task.status, sourceHash: hash(source),
            outcomeHash: hash(current), requestHashes: capture.prompts.map(hash),
            targetConsumed: capture.prompts.length > 0 && (evaluation.settings.skill ? capture.prompts.some(messages => canonical(messages).includes(evaluation.settings.version)) : evaluation.settings.maxRepairRounds !== undefined ? task.maxRepairRounds === evaluation.settings.maxRepairRounds : Boolean(evaluation.settings.projectPromptRef)) };
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
