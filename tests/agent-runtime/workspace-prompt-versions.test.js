import { afterEach, expect, test } from '@jest/globals';
import { emptyPresetLibrary, updatePresetLibrary, validatePresetLibrary, normalizeWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';
import { updateWorkspacePromptVersions, checkWorkspacePromptCandidate } from '../../public/scripts/lib/agent-workspace/prompt-versions.js';
import { createWorkspaceFactoryPreset, resolveWorkspaceProfile } from '../../public/scripts/agents/orchestrator/workspace/host-presets.js';
import { createMessageEditorHandle } from '../../public/scripts/message-takeover.js';
import { runMainAgentLoop } from '../../public/scripts/agents/orchestrator/director-runtime.js';
import { startRun, clearCurrentRun } from '../../public/scripts/agents/orchestrator/run-state/store.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';

afterEach(() => clearCurrentRun());
function fixture(mode = 'director') {
    const preset = normalizeWorkspacePreset(createWorkspaceFactoryPreset(mode, 'user-preset'));
    let library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: preset.id });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: preset.id });
    const agentId = preset.planTemplate.agents[0].id;
    library = updateWorkspacePromptVersions(library, { type: 'declare', presetId: preset.id, expectedPreset: preset, agentIds: [agentId] });
    const prepare = (current, body = 'Frozen candidate guidance') => updateWorkspacePromptVersions(current, { type: 'prepare', presetId: preset.id, agentId, body, scope: 'conversation', subjectId: 'chat', expectedBindings: current.bindings });
    return { preset, library, agentId, prepare };
}

test.each(['loop', 'spec', 'agenda', 'director'])('%s uses exact candidate on one binding, existing profile stays frozen and new preparation observes chosen version', mode => {
    const f = fixture(mode); const settings = { agentWorkspace: f.library };
    const accepted = resolveWorkspaceProfile(settings, { conversation: 'chat' });
    const pending = f.prepare(settings.agentWorkspace), c = pending.promptVersions.candidates[0];
    expect(pending.presets.find(p => p.id === f.preset.id)).toEqual(f.preset);
    settings.agentWorkspace = updateWorkspacePromptVersions(pending, { type: 'apply', candidateId: c.candidateId });
    const active = resolveWorkspaceProfile(settings, { conversation: 'chat' });
    expect(active.promptVersionId).toBe(c.candidateId);
    expect(active.orchestrationPlan.metadata.promptVersionId).toBe(c.candidateId);
    expect(active.orchestrationPlan.agents.find(a => a.id === f.agentId).instructions).toBe(c.diff.after);
    expect(accepted.orchestrationPlan.agents.find(a => a.id === f.agentId).instructions).toBe(c.diff.before);
    expect(resolveWorkspaceProfile(settings, { conversation: 'other' }).orchestrationPlan.agents.find(a => a.id === f.agentId).instructions).toBe(c.diff.before);
    const reopened = JSON.parse(JSON.stringify(settings));
    expect(resolveWorkspaceProfile(reopened, { conversation: 'chat' })).toEqual(active);
    expect(checkWorkspacePromptCandidate(reopened.agentWorkspace, c.candidateId).alreadyApplied).toBe(true);
});

test.each(['tools', 'budgets', 'binding', 'redeclare'])('%s changes conflict with activation instead of overwriting user authority', change => {
    const f = fixture(); let library = f.prepare(f.library); const c = library.promptVersions.candidates[0];
    if (['tools', 'budgets'].includes(change)) {
        const edited = structuredClone(f.preset);
        if (change === 'tools') edited.planTemplate.agents[0].tools = [];
        else edited.planTemplate.budgets.maxSteps += 1;
        library = updatePresetLibrary(library, { type: 'save', preset: edited });
    } else if (change === 'binding') library = updatePresetLibrary(library, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: null });
    else library = updateWorkspacePromptVersions(library, { type: 'declare', presetId: f.preset.id, expectedPreset: f.preset, agentIds: [] });
    expect(() => updateWorkspacePromptVersions(library, { type: 'apply', candidateId: c.candidateId })).toThrow('conflict');
});

test('exact content identity rejects tampering, missing versions, malformed schemas and unknown fields', () => {
    const f = fixture(); const library = f.prepare(f.library), c = library.promptVersions.candidates[0];
    const malformed = structuredClone(library); malformed.promptVersions.candidates[0].desired.planTemplate.agents[0].tools = [];
    expect(() => validatePresetLibrary(malformed)).toThrow('protected');
    const alteredBody = structuredClone(library);
    alteredBody.promptVersions.candidates[0].diff.after = 'Rewritten under the same version';
    alteredBody.promptVersions.candidates[0].desired.planTemplate.agents[0].instructions = 'Rewritten under the same version';
    expect(() => validatePresetLibrary(alteredBody)).toThrow('identity');
    malformed.promptVersions.candidates[0] = { ...c, schemaVersion: 8 };
    expect(() => validatePresetLibrary(malformed)).toThrow('candidate');
    const active = updateWorkspacePromptVersions(library, { type: 'apply', candidateId: c.candidateId });
    active.promptVersions.candidates = [];
    expect(() => resolveWorkspaceProfile({ agentWorkspace: active }, { conversation: 'chat' })).toThrow('missing');
    expect(() => f.prepare(f.library, 'x'.repeat(65537))).toThrow('64 KiB');
    expect(() => f.prepare(f.library, '')).toThrow('nonempty');
    expect(() => updateWorkspacePromptVersions(f.library, { type: 'prepare', tools: [] })).toThrow('fields');
});

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original SettingsRepo persists exact Workspace definitions and binding across reload', async (_name, make) => {
    const h = await make();
    try {
        const f = fixture(); let library = f.prepare(f.library); const c = library.promptVersions.candidates[0];
        library = updateWorkspacePromptVersions(library, { type: 'apply', candidateId: c.candidateId });
        await new SettingsRepo({ engine: h.engine }).save(h.handle, { agentWorkspace: library });
        const reloaded = await new SettingsRepo({ engine: h.engine }).get(h.handle);
        expect(resolveWorkspaceProfile(reloaded, { conversation: 'chat' }).mainAgent.systemPrompt).toBe(c.diff.after);
        expect(checkWorkspacePromptCandidate(reloaded.agentWorkspace, c.candidateId).alreadyApplied).toBe(true);
    } finally { await h.cleanup(); }
});

test('default/global, factory and undeclared targets cannot be candidates; per-owner library deletion clears exact metadata', () => {
    const f = fixture();
    const action = { type: 'prepare', presetId: f.preset.id, agentId: f.agentId, body: 'changed', scope: 'default', subjectId: 'chat', expectedBindings: f.library.bindings };
    expect(() => updateWorkspacePromptVersions(f.library, action)).toThrow();
    expect(() => updateWorkspacePromptVersions(f.library, { ...action, scope: 'conversation', agentId: 'unknown' })).toThrow('conflict');
    const factory = normalizeWorkspacePreset(createWorkspaceFactoryPreset('loop', 'builtin-loop'));
    const library = updatePresetLibrary(f.library, { type: 'save', preset: factory });
    expect(() => updateWorkspacePromptVersions(library, { type: 'declare', presetId: factory.id, expectedPreset: factory, agentIds: ['owner'] })).toThrow('user');
    const prepared = f.prepare(f.library), c = prepared.promptVersions.candidates[0];
    const active = updateWorkspacePromptVersions(prepared, { type: 'apply', candidateId: c.candidateId });
    const deleted = updatePresetLibrary(active, { type: 'delete', id: f.preset.id, replacementId: null });
    expect(deleted.promptVersions.candidates).toEqual([]);
    expect(deleted.promptVersions.declarations).toEqual([]);
    expect(deleted.bindings.entries).toEqual([]);
    expect(() => checkWorkspacePromptCandidate({ ...deleted, promptVersions: undefined }, c.candidateId)).toThrow('missing');
});

test('capacity rejects new candidate and explicit unpin returns original version', () => {
    const f = fixture(); let library = f.library;
    for (let i = 0; i < 16; i++) library = f.prepare(library, 'candidate-' + i);
    expect(() => f.prepare(library, '17')).toThrow('capacity');
    const c = library.promptVersions.candidates[0];
    const active = updateWorkspacePromptVersions(library, { type: 'apply', candidateId: c.candidateId });
    const unpinned = updatePresetLibrary(active, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: f.preset.id });
    const profile = resolveWorkspaceProfile({ agentWorkspace: unpinned }, { conversation: 'chat' });
    expect(profile.promptVersionId).toBeUndefined();
    expect(profile.mainAgent.systemPrompt).toBe(c.diff.before);
});

test('actual RP Director consumes pinned candidate across rounds while a newer binding is selected', async () => {
    const f = fixture(); let library = f.prepare(f.library); const c = library.promptVersions.candidates[0];
    library = updateWorkspacePromptVersions(library, { type: 'apply', candidateId: c.candidateId });
    const settings = { agentWorkspace: library }, profile = resolveWorkspaceProfile(settings, { conversation: 'chat' });
    const chat = [{ mes: '', is_user: false, extra: {} }], controller = new AbortController();
    const handle = createMessageEditorHandle({ generationType: 'normal', flushIntervalMs: 0, owner: 'fixture', abortSignal: controller.signal });
    handle.setOnUpdate(text => { chat[0].mes = text; });
    const runId = startRun({ mode: 'director', chatKey: 's08-fixture' }); let round = 0;
    await runMainAgentLoop({ handle, profile: { mode: 'director', director: profile }, eventData: { abortSignal: controller.signal, placeholderMessageId: 0 },
        deps: { chat, runId, contextForNotes: {}, getContentPayload: () => ({ messages: [] }), generateTaskStreamForMainAgent: async request => {
            expect(JSON.stringify(request.taskMessages)).toContain(c.diff.after);
            if (round++ === 0) {
                settings.agentWorkspace = updatePresetLibrary(settings.agentWorkspace, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: f.preset.id });
                return { assistantText: '', toolCalls: [{ id: 'write', name: 'write_message', args: { text: 'fixture response', mode: 'replace' } }] };
            }
            return { assistantText: '', toolCalls: [{ id: 'finalize', name: 'finalize', args: {} }] };
        } },
    });
    expect(chat[0].mes).toBe('fixture response'); expect(round).toBe(2);
    expect(resolveWorkspaceProfile(settings, { conversation: 'chat' }).mainAgent.systemPrompt).toBe(c.diff.before);
});
