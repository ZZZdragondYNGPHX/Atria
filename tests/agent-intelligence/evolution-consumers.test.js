import { afterEach, expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution, labelAll, skillMd } from './evolution-fixture.js';
import { selectCases } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { projectFixtureSource } from '../../src/native/agent-intelligence/evaluation/fixture-source.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { AgentEvidenceRepository } from '../../src/native/agent-intelligence/evidence-repository.js';
import { observeEvolutionRp } from '../../src/native/agent-intelligence/evolution-observer.js';
import { createWorkspaceHostRefresh } from '../../public/scripts/agents/orchestrator/workspace/host-refresh.js';
import { workspaceHostProfile } from '../../public/scripts/agents/orchestrator/workspace/host-profile.js';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); });
const json = value => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => value });
const wireCall = (name, args, i) => ({ id: 'call-' + i, type: 'function', function: { name, arguments: JSON.stringify(args) } });
function syntheticProvider(kind, sends) {
    return async (_url, options) => {
        const body = JSON.parse(options.body); sends.push(body);
        const content = body.messages.at(-1)?.content;
        let message;
        if (content?.includes('allowedDeclaration')) message = { content: JSON.stringify({ value: kind === 'rp-skill' ? skillMd('Candidate guidance') : 'Candidate style', rationale: 'Synthetic wiring check only' }) };
        else if (!body.tools?.length) {
            const input = JSON.parse(content);
            message = { content: JSON.stringify({ preference: 'tie', deltas: Object.fromEntries(input.dimensions.map(d => [d, 0])), rationale: 'Synthetic tie, no quality claim' }) };
        } else if (body.tools.some(t => t.function.name === 'write_message')) message = { content: '', tool_calls: [wireCall('write_message', { text: 'NPC waits for your decision.', mode: 'replace' }, 1), wireCall('finalize', {}, 2)] };
        else {
            const text = JSON.stringify(body.messages);
            const entry = selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(e => e.entrance === 'project').find(e => text.includes(projectFixtureSource('Tidal Archive', e.fixtureHash).project.projectId));
            if (!entry) throw new Error('Missing exact private Project fixture');
            const source = projectFixtureSource('Tidal Archive', entry.fixtureHash); source.project.displayName = 'Sea Lantern'; source.project.updatedAt = 20;
            message = { content: '', tool_calls: [wireCall('atri_agent_reset_operations', {}, 1), wireCall('atri_agent_set_plan', { summary: 'Synthetic rename', steps: [{ id: 'metadata', title: 'Rename metadata', impact: 'low' }] }, 2), wireCall('atri_agent_project_save', { source, stepId: 'metadata' }, 3), wireCall('atri_agent_prepare_review', {}, 4)] };
        }
        return json({ choices: [{ message }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } });
    };
}

test.each(['rp-skill', 'project-prompt'])('production isolated worker uses original %s consumers, compiler, provider and durable ledger', async kind => {
    const sends = [], f = await evolutionFixture(makeTempFsEngineHarness, kind, { realEvaluator: true, fetchImpl: syntheticProvider(kind, sends) }); cleanup.push(f.h.cleanup);
    const { job, candidate } = await runEvolution(f);
    if (candidate.report.origin === 'unavailable') throw new Error(JSON.stringify(candidate.report));
    expect(job.status).toBe('awaiting_review'); expect(candidate.report).toMatchObject({ origin: 'host_evaluator' });
    expect(candidate.report.pairs).toHaveLength(9); expect(candidate.report.charges).toHaveLength(27);
    for (const pair of candidate.report.pairs) for (const arm of ['baseline', 'candidate']) {
        expect(pair[arm].error).toBeNull(); expect(pair[arm].checks.target_consumed).toBe(true);
        expect(Object.values(pair[arm].checks).every(Boolean)).toBe(true);
    }
    expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(28); expect(sends).toHaveLength(28);
    expect(candidate.decision.eligible).toBe(false); expect(candidate.decision.reasons).toContain('preference_missing_or_disagreement');
    expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications).toEqual([]);
    expect(JSON.stringify(candidate.report)).not.toContain('fixture-secret-never-in-report');
    const untouched = await f.host.studio.getProject(f.h.handle, f.subject === 'Actor' ? f.source.project.projectId : f.subject);
    expect(untouched.source.project.displayName).toBe(f.source.project.displayName);
}, 120000);

test('two browser snapshots reject stale local drafts and refresh the next accepted original Workspace profile', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'workspace-prompt'); cleanup.push(f.h.cleanup);
    const old = await f.service.workspace(f.h.handle, {}), first = { agentWorkspace: structuredClone(old.library), agentWorkspaceRevision: old.revision }, second = structuredClone(first);
    const read = () => f.service.workspace(f.h.handle, {}), refreshFirst = createWorkspaceHostRefresh(first, read), refreshSecond = createWorkspaceHostRefresh(second, read);
    const oldProfile = workspaceHostProfile(first.agentWorkspace.presets[0]);
    const { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    second.agentWorkspace.presets[0].name = 'Unsaved browser change';
    await expect(refreshSecond()).rejects.toThrow('changed locally'); await refreshFirst();
    const pin = first.agentWorkspace.bindings.entries[0].promptVersionId;
    expect(pin).toBe(candidate.candidateId); expect(oldProfile.mainAgent.systemPrompt).not.toBe(candidate.diff.after);
    const version = first.agentWorkspace.promptVersions.candidates.find(c => c.candidateId === pin);
    expect(workspaceHostProfile(version.desired, 'character', pin).mainAgent.systemPrompt).toBe(candidate.diff.after);
});

test('RP activation requires a matching new completed original evidence trace and preserves client provenance', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'workspace-prompt'); cleanup.push(f.h.cleanup);
    const { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const evidence = new AgentEvidenceRepository({ engine: f.h.engine });
    const previous = (await f.service.experience.repository.get(f.h.handle, f.scope, f.subject)).feedback[0].source.id;
    const source = await evidence.get(f.h.handle, previous), begun = await evidence.begin(f.h.handle, { scope: f.scope, rootRunId: 'actual-next-run', origin: 'client_observation', sources: source.sources });
    const trace = { schemaVersion: 1, missing: 0, reasons: [], events: [{ type: 'version.consumed', eventId: 'accepted-version', runId: 'actual-next-run', targetKind: 'workspace-prompt', presetId: f.target.presetId, versionId: candidate.candidateId }] };
    await evidence.update(f.h.handle, begun.evidenceId, { sequence: 1, status: 'completed', trace, outputRef: source.outputRef }, 'client_observation');
    await observeEvolutionRp(f.h.engine, f.h.handle, begun.evidenceId);
    expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].activation).toMatchObject({ origin: 'client_observation', evidenceId: begun.evidenceId, runId: 'actual-next-run' });
});

test('the original next Project request consumes its local Prompt pin while another Project keeps the shared Route default', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt'); cleanup.push(f.h.cleanup);
    const old = await f.host.persistence.getRuntimeRoute(f.h.handle, f.target.runtimeRouteId), { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const host = new NativeGenerationHost({ ...f.host, providers: { ...f.host.providers,
        'provider.openai-compatible': { ...f.host.providers['provider.openai-compatible'], send: async () => json({ choices: [{ message: { content: 'Synthetic next request' } }] }) } } });
    const project = await f.host.studio.getProject(f.h.handle, f.subject);
    const result = await host.execute(f.h.handle, { role: 'studio', projectId: f.subject, revision: project.revision.revision, requestId: 'next-original-project', messages: [{ role: 'user', content: 'Preview this project' }], tools: [] });
    expect(result.snapshot.promptProgramRef).not.toEqual(old.promptProgramRef); expect(result.snapshot.promptIr.directives).toContain('Candidate guidance');
    expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].activation).toMatchObject({ origin: 'host', requestId: 'next-original-project' });
    const otherSource = structuredClone(f.source); otherSource.project.projectId = (await import('../../src/native/identity.js')).createNativeId('project');
    const other = await f.host.studio.createProject(f.h.handle, otherSource);
    const unchanged = await host.execute(f.h.handle, { role: 'studio', projectId: otherSource.project.projectId, revision: other.revision.revision, requestId: 'other-original-project', messages: [{ role: 'user', content: 'Preview another project' }], tools: [] });
    expect(unchanged.snapshot.promptProgramRef).toEqual(old.promptProgramRef);
});

test('the original next Task snapshot observes its exact repair strategy and the saved Studio system prompt carries the version', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-strategy'); cleanup.push(f.h.cleanup);
    const { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const context = await f.host.agent.getContext(f.h.handle, f.subject, f.target.taskId);
    const { buildNativeProjectAgentSystemPrompt } = await import('../../public/scripts/native/studio-agent.js');
    const system = buildNativeProjectAgentSystemPrompt(context);
    const host = new NativeGenerationHost({ ...f.host, providers: { ...f.host.providers, 'provider.openai-compatible': { ...f.host.providers['provider.openai-compatible'], send: async () => json({ choices: [{ message: { content: 'Synthetic next Task request' } }] }) } } });
    await host.execute(f.h.handle, { role: 'studio', projectId: f.subject, taskId: f.target.taskId, revision: context.task.baseRevision, requestId: 'next-strategy-task', messages: [{ role: 'system', content: system }, { role: 'user', content: 'Continue' }], tools: context.tools });
    expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].activation).toMatchObject({ origin: 'host', requestId: 'next-strategy-task' });
});
