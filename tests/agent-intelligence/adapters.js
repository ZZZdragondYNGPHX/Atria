import fs from 'node:fs';
import path from 'node:path';
import { createGitClient } from '../../src/git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo, createNativeId } from '../../src/native/index.js';
import { runMainAgentLoop } from '../../public/scripts/agents/orchestrator/director-runtime.js';
import { createMessageEditorHandle } from '../../public/scripts/message-takeover.js';
import { clearCurrentRun, getCurrentRun, startRun } from '../../public/scripts/agents/orchestrator/run-state/store.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { getRuntimeEvidence, rememberRuntimeEvidence } from '../../public/scripts/native/runtime-client.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { deferred } from '../agent-runtime/fakes.js';
import { hash, canonical } from './cases.js';

const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const call = (id, name, args = {}) => ({ id, name, args });
const completion = toolCalls => ({ assistantText: '', toolCalls, usage: null });

export async function runRp(entry, fixture, capture) {
    const player = { mes: fixture.input, is_user: true };
    const playerBefore = hash(player);
    const chat = [player, { mes: '', extra: { reasoning: '' }, is_user: false }];
    const profile = { mode: 'director', director: { mainAgent: { systemPrompt: 'Express only the NPC response. Preserve the player choice and use the revised visible promise.' }, subAgents: [], maxRounds: 6,
        tools: { message: { write_message: true, apply_message_patches: true } } } };
    const payload = { messages: [{ role: 'system', content: canonical(fixture.memory.visible) }, { role: 'user', content: fixture.input }] };
    const requestTexts = [];
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
                if (capture.refs.requestIds.length >= entry.limits.maxRequests) throw Object.assign(new Error('Script request budget'), { code: 'script_request_budget' });
                const requestId = `${capture.trialId}:script-request-${capture.refs.requestIds.length + 1}`;
                capture.refs.requestIds.push(requestId); variant.requestIds.push(requestId);
                requestTexts.push(canonical(request.taskMessages));
                capture.prompts.push(request.taskMessages);
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
            await entered.promise;
            controller.abort();
            // Observe terminal abort before regeneration; transport result arrives late.
            try { await old.promise; } catch (error) { if (error.name !== 'AbortError') throw error; }
            const next = await run('v2', () => completion([call('write-new', 'write_message', { text: fixture.reply, mode: 'replace' }), call('final-new', 'finalize')]));
            await next.promise;
            late.resolve(completion([call('late-write', 'write_message', { text: 'STALE COMPLETION', mode: 'replace' }), call('late-final', 'finalize')]));
            await Promise.resolve();
            let rejected = false;
            try { old.handle.setText('STALE EDIT'); } catch (error) { rejected = error.code === 'editor_aborted'; }
            capture.observe('stale_completion', { rejected, text: chat[1].mes, oldStatus: (await old.handle.complete).status }, { rejected: true, text: fixture.reply, oldStatus: 'aborted' });
            capture.observe('variant_identity', { runs: new Set(capture.refs.runIds).size, requests: new Set(capture.refs.requestIds).size, newStatus: (await next.handle.complete).status }, { runs: 2, requests: 2, newStatus: 'committed' });
        } else {
            const main = await run('v1', () => completion([
                call('write', 'write_message', { text: fixture.reply, mode: 'replace', messageId: 0, owner: 'player' }), call('final', 'finalize'),
            ]));
            await main.promise;
            const outcome = await main.handle.complete;
            if (entry.caseId.startsWith('rp_agency')) {
                capture.observe('player_ownership', { player: hash(player), npc: chat[1].mes }, { player: playerBefore, npc: fixture.reply });
                capture.observe('single_completion', outcome.status, 'committed');
            } else {
                capture.observe('request_exposure', { visible: requestTexts.every(text => fixture.memory.visible.every(item => text.includes(item.text))), private: requestTexts.some(text => text.includes(fixture.memory.private.text)) }, { visible: true, private: false });
                capture.observe('revision_reference', requestTexts.every(text => text.includes('revision') && text.includes('Revision: meet')), true);
                capture.completeness.push('production_memory_resolution', 'memory_behavior_application');
            }
        }
        capture.finalTextStatus = 'passed';
        capture.reviewStatus = 'not_run';
        capture.observe('isolation', hash(player), playerBefore);
        capture.completeness.push('skill_preset_exact_pinning', 'durable_trace');
    } finally { clearCurrentRun(); }
}

function projectSource(name) {
    return {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId: createNativeId('package'), displayName: name, createdAt: 10, updatedAt: 10 },
        package: { name: 'Synthetic S01 Work', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [],
    };
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

export async function runProject(entry, fixture, capture) {
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
    let task; let canaryRoot; let before; let source; let originalRevision; let conflictRevision;
    try {
        source = projectSource(fixture.projectName);
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
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options = {}) => {
            const route = String(url); const body = options.body ? JSON.parse(options.body) : null;
            if (route === '/api/skills?scope=all') return response([]);
            if (route === '/api/native/extensions/settings') return response({ value: { skills: {} } });
            const base = `/api/native/studio/projects/${source.project.projectId}`;
            const taskPath = `${base}/agent/tasks/${task.taskId}`;
            if (route === `${taskPath}/context`) return response(await agent.getContext(h.handle, source.project.projectId, task.taskId));
            if (route === `${taskPath}/resume`) return response(await agent.resumeTask(h.handle, source.project.projectId, task.taskId));
            if (route === `${taskPath}/generation/begin`) return response(await agent.beginGeneration(h.handle, source.project.projectId, task.taskId, body));
            if (route === `${taskPath}/generation/finish`) return response(await agent.finishGeneration(h.handle, source.project.projectId, task.taskId, body));
            if (route === taskPath) return response(await agent.getTask(h.handle, source.project.projectId, task.taskId));
            if (route === `${base}/preflight`) return response(await studio.preflightProject(h.handle, source.project.projectId, body));
            if (route === '/api/native/generation/execute') {
                if (body.projectId !== source.project.projectId || body.taskId !== task.taskId || body.revision !== originalRevision) throw new Error('Project request identity drift');
                if (capture.refs.requestIds.length >= entry.limits.maxRequests) throw Object.assign(new Error('Script request budget'), { code: 'script_request_budget' });
                capture.refs.requestIds.push(body.requestId); capture.prompts.push(body.messages);
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
                    task = await agent.executeTool(h.handle, source.project.projectId, task.taskId, body);
                    if (body.name === 'atri_agent_prepare_review') validations.push({ status: task.status, round: task.repairRound, validation: task.validation.status });
                    return response(task);
                } catch (error) {
                    return response({ error: error.code, details: error.details }, error.name === 'ConflictError' ? 409 : 400);
                }
            }
            // No fallback to the process's real fetch, including commit.
            throw new Error('Unrecognized isolated fixture request');
        };
        let modelError = null;
        try {
            await runNativeStudioAgentTask({ projectId: source.project.projectId, taskId: task.taskId, messages: [{ role: 'user', content: fixture.input }], maxModelRounds: 6 });
        } catch (error) { modelError = error; }
        task = await agent.getTask(h.handle, source.project.projectId, task.taskId);
        const beforeReviewRevision = (await studio.getRevision(h.handle, source.project.projectId)).revision;
        const modelChangesets = task.changeSets.length;
        if (conflict) {
            capture.observe('human_revision', { revision: beforeReviewRevision, name: (await studio.getProject(h.handle, source.project.projectId)).source.project.displayName }, { revision: conflictRevision, name: 'Fixture human revision' });
            capture.observe('no_silent_rebase', { status: task.status, baseRevision: task.baseRevision, writes: modelChangesets, error: modelError?.code || null }, { status: 'conflict', baseRevision: originalRevision, writes: 0, error: 'project_revision_conflict' });
            capture.reviewStatus = 'unavailable'; capture.completeness.push('review');
        } else {
            if (modelError) throw modelError;
            capture.observe('review_gate', { revision: beforeReviewRevision, modelWrites: modelChangesets, status: task.status, validation: task.validation?.status }, { revision: originalRevision, modelWrites: 0, validation: repairing && fixture.assumptions.repair === 'block_after_two_errors' ? 'failed' : 'passed', status: repairing && fixture.assumptions.repair === 'block_after_two_errors' ? 'blocked' : 'review' });
            if (repairing) {
                capture.observe('validation_error', validations[0], { status: 'repair', round: 1, validation: 'failed' });
                capture.observe('repair_bound', { statuses: validations.map(item => item.status), round: task.repairRound },
                    { statuses: ['repair', fixture.assumptions.repair === 'block_after_two_errors' ? 'blocked' : 'review'], round: fixture.assumptions.repair === 'block_after_two_errors' ? 2 : 1 });
                if (task.status === 'blocked') {
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
                if (repairing) {
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
    } finally {
        globalThis.fetch = oldFetch;
        if (oldAtria === undefined) delete globalThis.Atria; else globalThis.Atria = oldAtria;
        rememberRuntimeEvidence(oldEvidence);
        if (task?.preview?.previewId) studio.closePreview(h.handle, task.preview.previewId);
        if (fs.realpathSync(h.dataRoot) !== root || fs.readFileSync(marker, 'utf8') !== capture.trialId) throw new Error('Fixture cleanup ownership mismatch');
        h.cleanup();
    }
}
