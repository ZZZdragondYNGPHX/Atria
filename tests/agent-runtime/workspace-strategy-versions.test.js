import { afterEach, expect, test } from '@jest/globals';
import { emptyPresetLibrary, updatePresetLibrary, validatePresetLibrary, normalizeWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';
import { updateWorkspaceStrategyVersions as update, checkWorkspaceStrategyCandidate as check } from '../../public/scripts/lib/agent-workspace/strategy-versions.js';
import { updateWorkspacePromptVersions } from '../../public/scripts/lib/agent-workspace/prompt-versions.js';
import { createWorkspaceFactoryPreset, resolveWorkspaceProfile } from '../../public/scripts/agents/orchestrator/workspace/host-presets.js';
import { createMessageEditorHandle } from '../../public/scripts/message-takeover.js';
import { runMainAgentLoop } from '../../public/scripts/agents/orchestrator/director-runtime.js';
import { startRun, clearCurrentRun } from '../../public/scripts/agents/orchestrator/run-state/store.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { createPolicyController, initialPolicyState } from '../../public/scripts/lib/orchestration-engine/policy-controller.js';
import { runAgendaEngine } from '../../public/scripts/agents/orchestrator/engine-v2/agenda-adapter.js';
import { DurableCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';

afterEach(() => clearCurrentRun());
function fixture(mode = 'director', field = 'budgets.maxSteps') {
    const preset = normalizeWorkspacePreset(createWorkspaceFactoryPreset(mode, 'user-strategy'));
    let library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: preset.id });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: preset.id });
    library = update(library, { type: 'declare', presetId: preset.id, expectedPreset: preset, allowedFields: [field] });
    const prepare = (current = library, value = 1) => update(current, { type: 'prepare', presetId: preset.id, field, value,
        scope: 'conversation', subjectId: 'chat', expectedBindings: current.bindings });
    return { preset, library, prepare, field };
}

test.each([
    ['loop', 'budgets.maxSteps', 'max_rounds'], ['director', 'budgets.maxSteps', 'maxRounds'],
    ['director', 'budgets.maxConcurrency', 'maxConcurrentSubagents'], ['spec', 'budgets.maxConcurrency', null],
    ['agenda', 'budgets.maxConcurrency', 'maxConcurrentAgents'], ['agenda', 'scheduler.maxPlannerRounds', 'plannerMaxRounds'],
    ['agenda', 'scheduler.maxTotalRuns', 'maxTotalRuns'],
])('%s %s reaches original host/Plan and one local exact binding', (mode, field, hostField) => {
    const f = fixture(mode, field), settings = { agentWorkspace: f.library };
    const old = resolveWorkspaceProfile(settings, { conversation: 'chat' });
    const [group, key] = field.split('.'), before = old.orchestrationPlan[group][key], after = before === 1 ? 2 : 1;
    const prepared = f.prepare(f.library, after), c = prepared.strategyVersions.candidates[0];
    expect(prepared.presets[0]).toEqual(f.preset);
    expect(f.prepare(prepared, after).strategyVersions.candidates).toHaveLength(1);
    settings.agentWorkspace = update(prepared, { type: 'apply', candidateId: c.candidateId });
    const active = resolveWorkspaceProfile(settings, { conversation: 'chat' });
    expect(active.orchestrationPlan[group][key]).toBe(after);
    expect(active.orchestrationPlan.metadata.strategyVersionId).toBe(c.candidateId);
    expect(active.strategyVersionId).toBe(c.candidateId);
    expect(hostField ? (mode === 'agenda' ? active.limits[hostField] : active[hostField]) : after).toBe(after);
    expect(old.orchestrationPlan[group][key]).toBe(before);
    expect(resolveWorkspaceProfile(settings, { conversation: 'other' }).orchestrationPlan[group][key]).toBe(before);
    expect(check(settings.agentWorkspace, c.candidateId).alreadyApplied).toBe(true);
    settings.agentWorkspace = update(settings.agentWorkspace, { type: 'rollback', candidateId: c.candidateId });
    expect(settings.agentWorkspace.bindings).toEqual(f.library.bindings);
    expect(update(settings.agentWorkspace, { type: 'rollback', candidateId: c.candidateId })).toEqual(settings.agentWorkspace);
});

test.each(['capability', 'output', 'guard', 'bindings', 'redeclare'])('%s edit conflicts with pending activation and protects user choices', change => {
    const f = fixture(), prepared = f.prepare(), c = prepared.strategyVersions.candidates[0]; let current = prepared;
    if (['capability', 'output', 'guard'].includes(change)) {
        const edited = structuredClone(f.preset);
        if (change === 'capability') edited.planTemplate.agents[0].tools = [];
        else if (change === 'output') edited.planTemplate.output.extra = 'user';
        else edited.planTemplate.agents[0].instructions += ' user guard';
        current = updatePresetLibrary(current, { type: 'save', preset: edited });
    } else if (change === 'bindings') current = updatePresetLibrary(current, { type: 'bind', scope: 'character', subjectId: 'other', presetId: f.preset.id });
    else current = update(current, { type: 'declare', presetId: f.preset.id, expectedPreset: f.preset, allowedFields: [] });
    expect(() => update(current, { type: 'apply', candidateId: c.candidateId })).toThrow('conflict');
});

test('rollback after revocation restores exact base; subsequent user binding edit conflicts; save retains already chosen snapshot', () => {
    const f = fixture(), prepared = f.prepare(), c = prepared.strategyVersions.candidates[0];
    const active = update(prepared, { type: 'apply', candidateId: c.candidateId });
    const revoked = update(active, { type: 'declare', presetId: f.preset.id, expectedPreset: f.preset, allowedFields: [] });
    expect(() => check(revoked, c.candidateId)).toThrow('conflict');
    expect(update(revoked, { type: 'rollback', candidateId: c.candidateId }).bindings).toEqual(f.library.bindings);
    const edited = updatePresetLibrary(active, { type: 'save', preset: { ...f.preset, name: 'Edited' } });
    expect(resolveWorkspaceProfile({ agentWorkspace: edited }, { conversation: 'chat' }).maxRounds).toBe(1);
    expect(() => update(edited, { type: 'rollback', candidateId: c.candidateId })).toThrow('conflict');
    const rebound = updatePresetLibrary(active, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: null });
    expect(() => update(rebound, { type: 'rollback', candidateId: c.candidateId })).toThrow('conflict');
});

test('unknown schema, content identity, protected changes, missing versions and finite capacity fail closed', () => {
    const f = fixture(), prepared = f.prepare(), c = prepared.strategyVersions.candidates[0];
    for (const mutation of [v => { v.schemaVersion = 2; }, v => { v.candidates[0].desired.planTemplate.agents[0].tools = []; },
        v => { v.candidates[0].diff.after = 2; v.candidates[0].desired.planTemplate.budgets.maxSteps = 2; }, v => { v.unrecognized = true; }]) {
        const bad = structuredClone(prepared); mutation(bad.strategyVersions); expect(() => validatePresetLibrary(bad)).toThrow();
    }
    const missing = update(prepared, { type: 'apply', candidateId: c.candidateId }); missing.strategyVersions.candidates = [];
    expect(() => resolveWorkspaceProfile({ agentWorkspace: missing }, { conversation: 'chat' })).toThrow('missing');
    let full = f.library;
    for (let value = 1; full.strategyVersions.candidates.length < 16; value++) {
        if (value !== f.preset.planTemplate.budgets.maxSteps) full = f.prepare(full, value);
    }
    expect(() => f.prepare(full, 63)).toThrow('capacity');
    expect(() => f.prepare(f.library, 0)).toThrow('bounds');
    expect(() => f.prepare(f.library, 65)).toThrow('bounds');
    expect(() => f.prepare(f.library, 1.5)).toThrow('bounds');
});

test('undeclared, ignored, global, factory and combined Prompt/strategy targets cannot be activated', () => {
    const f = fixture();
    for (const field of ['budgets.maxTasks', 'scheduler.failurePolicy', 'output.ownerNodeId', '__proto__.x']) {
        expect(() => update(f.library, { type: 'declare', presetId: f.preset.id, expectedPreset: f.preset, allowedFields: [field] })).toThrow();
    }
    const action = { type: 'prepare', presetId: f.preset.id, field: f.field, value: 1, scope: 'default', subjectId: 'chat', expectedBindings: f.library.bindings };
    expect(() => update(f.library, action)).toThrow();
    const factory = normalizeWorkspacePreset(createWorkspaceFactoryPreset('director', 'builtin-director'));
    const library = updatePresetLibrary(f.library, { type: 'save', preset: factory });
    expect(() => update(library, { type: 'declare', presetId: factory.id, expectedPreset: factory, allowedFields: [f.field] })).toThrow('user');
    let prompt = updateWorkspacePromptVersions(f.library, { type: 'declare', presetId: f.preset.id, expectedPreset: f.preset, agentIds: [f.preset.planTemplate.agents[0].id] });
    prompt = updateWorkspacePromptVersions(prompt, { type: 'prepare', presetId: f.preset.id, agentId: f.preset.planTemplate.agents[0].id, body: 'New body', scope: 'conversation', subjectId: 'chat', expectedBindings: prompt.bindings });
    prompt = updateWorkspacePromptVersions(prompt, { type: 'apply', candidateId: prompt.promptVersions.candidates[0].candidateId });
    expect(() => f.prepare(prompt)).toThrow('base binding');
    const prepared = f.prepare(), active = update(prepared, { type: 'apply', candidateId: prepared.strategyVersions.candidates[0].candidateId });
    prompt = updateWorkspacePromptVersions(active, { type: 'declare', presetId: f.preset.id, expectedPreset: f.preset, agentIds: [f.preset.planTemplate.agents[0].id] });
    expect(() => updateWorkspacePromptVersions(prompt, { type: 'prepare', presetId: f.preset.id, agentId: f.preset.planTemplate.agents[0].id,
        body: 'New body', scope: 'conversation', subjectId: 'chat', expectedBindings: prompt.bindings })).toThrow('base binding');
    const deleted = updatePresetLibrary(active, { type: 'delete', id: f.preset.id, replacementId: null });
    expect(deleted.strategyVersions.candidates).toEqual([]); expect(deleted.strategyVersions.declarations).toEqual([]);
    expect(deleted.bindings.entries).toEqual([]);
});

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original settings reload preserves exact strategy choice and rollback', async (_name, make) => {
    const h = await make();
    try {
        const f = fixture(), p = f.prepare(), c = p.strategyVersions.candidates[0], repo = new SettingsRepo({ engine: h.engine });
        await repo.save(h.handle, { agentWorkspace: update(p, { type: 'apply', candidateId: c.candidateId }) });
        const settings = await repo.get(h.handle);
        expect(resolveWorkspaceProfile(settings, { conversation: 'chat' }).maxRounds).toBe(1);
        expect(update(settings.agentWorkspace, { type: 'rollback', candidateId: c.candidateId }).bindings).toEqual(f.library.bindings);
    } finally { await h.cleanup(); }
});

test('original Engine policy enforces candidate concurrency and exhausted step budget without admitting more work', () => {
    const f = fixture('spec', 'budgets.maxConcurrency'), p = f.prepare(), c = p.strategyVersions.candidates[0];
    const plan = resolveWorkspaceProfile({ agentWorkspace: update(p, { type: 'apply', candidateId: c.candidateId }) }, { conversation: 'chat' }).orchestrationPlan;
    const controller = createPolicyController(plan), state = initialPolicyState(plan), runSnapshot = { runId: 'fixture' };
    const next = controller.advance({ policyState: state, runSnapshot });
    expect(next.intent.type).toBe('fanout'); expect(next.intent.concurrency).toBe(1); expect(next.intent.branches).toHaveLength(1);
    state.budgets.steps = plan.budgets.maxSteps;
    const stopped = controller.advance({ policyState: state, runSnapshot });
    expect(stopped.intent.type).toBe('complete'); expect(stopped.intent.output.status).toBe('budget_exhausted');
});

test('actual RP Director stops at pinned candidate round limit; binding rollback during send only affects next preparation', async () => {
    const f = fixture(), p = f.prepare(), c = p.strategyVersions.candidates[0];
    const settings = { agentWorkspace: update(p, { type: 'apply', candidateId: c.candidateId }) };
    const profile = resolveWorkspaceProfile(settings, { conversation: 'chat' });
    const chat = [{ mes: '', is_user: false, extra: {} }], controller = new AbortController();
    const handle = createMessageEditorHandle({ generationType: 'normal', flushIntervalMs: 0, owner: 'fixture', abortSignal: controller.signal });
    handle.setOnUpdate(text => { chat[0].mes = text; });
    const runId = startRun({ mode: 'director', chatKey: 's09-fixture' }); let calls = 0;
    await runMainAgentLoop({ handle, profile: { mode: 'director', director: profile }, eventData: { abortSignal: controller.signal, placeholderMessageId: 0 },
        deps: { chat, runId, contextForNotes: {}, getContentPayload: () => ({ messages: [] }), generateTaskStreamForMainAgent: async () => {
            calls++; settings.agentWorkspace = update(settings.agentWorkspace, { type: 'rollback', candidateId: c.candidateId });
            return { assistantText: '', toolCalls: [{ id: 'write', name: 'write_message', args: { text: 'bounded response', mode: 'replace' } }] };
        } } });
    expect(calls).toBe(1); expect(chat[0].mes).toBe('bounded response');
    expect(profile.maxRounds).toBe(1);
    expect(resolveWorkspaceProfile(settings, { conversation: 'chat' }).maxRounds).toBe(f.preset.planTemplate.budgets.maxSteps);
});

test.each(['scheduler.maxPlannerRounds', 'scheduler.maxTotalRuns'])('actual Agenda Engine obeys %s candidate and retains required finalizer', async field => {
    const f = fixture('agenda', field), p = f.prepare(), c = p.strategyVersions.candidates[0];
    const profile = resolveWorkspaceProfile({ agentWorkspace: update(p, { type: 'apply', candidateId: c.candidateId }) }, { conversation: 'chat' });
    const panelRunId = startRun({ mode: 'agenda', quiet: true }), runId = panelRunId + '/engine';
    let saved = null;
    const store = await DurableCheckpointStore.open({ runId, backend: {
        load: async () => saved,
        compareAndSet: async (state, version) => {
            if ((saved?.checkpointVersion || 0) !== version) throw new Error('conflict'); saved = structuredClone(state);
        },
    } });
    let plannerCalls = 0; const kinds = [];
    const worker = Object.keys(profile.agents).find(id => id !== profile.finalAgentId);
    const result = await runAgendaEngine({ context: {}, payload: { engineStore: store, engineRunId: runId, signal: new AbortController().signal },
        messages: [], profile, settings: {}, runId: panelRunId, trace: {},
        runAgendaPlannerStep: async () => { plannerCalls++; return { plannerStep: { dispatches: [{ agent: worker }] } }; },
        runAgendaTextAgent: async (_context, _payload, _messages, _profile, _agenda, _dispatch, options) => {
            kinds.push(options.kind); return { runId: 'result-' + kinds.length, outputText: 'guidance' };
        },
        applyAgendaPlannerOps: () => {}, normalizeAgendaDispatches: () => [{ todoId: 'main', agent: worker, taskBrief: 'bounded work', inputRunIds: [] }],
        syncTrace: () => {}, finalizeTrace: () => {},
    });
    expect(plannerCalls).toBe(1); expect(kinds).toEqual(['agent', 'final']);
    expect(result.agendaState.budgetReason).toBe(field === 'scheduler.maxPlannerRounds' ? 'plannerMaxRounds' : 'maxTotalRuns');
    expect(result.agendaState.finalGuidance).toBe('guidance');
    expect(saved.policyState.planFingerprint).toContain(c.candidateId);
});
