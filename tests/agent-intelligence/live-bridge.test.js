import { expect, test } from '@jest/globals';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { createLiveBridge } from './live-bridge.js';
import { EvaluationBudget } from './budget.js';
import { services, projectSource } from './project-fixture.js';
import { runComparison, validateComparison } from './comparison.js';
import { captureFor, withIsolatedRuntime } from './runner.js';
import { loadFixture, selectCases } from './cases.js';
import { runProject } from './adapters.js';
import { BASE_SETTINGS } from './evaluation-settings.js';

const config = { endpoint: 'https://example.invalid/v1/chat/completions', model: 'explicit-test-model', tokenizer: 'cl100k_base',
    contextTokens: 32000, maxOutputTokens: 1024, maxRequests: 3, maxTotalTokens: 20000, timeoutMs: 1000 };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const response = { choices: [{ message: { content: 'Observed model output' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };

test('RP bridge uses original resolver/compiler/provider, counts before send and captures reported usage without credentials', async () => {
    const h = await makeTempFsEngine(); const requests = [];
    try {
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config: { ...config, maxRequests: 1 },
            secretPort: { resolveSecret: async () => 'synthetic-private-key' }, fetchImpl: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return json(response); } });
        const input = { requestId: 'rp-live-1', trialId: 'trial', fixtureHash: 'fixture-r1', messages: [{ role: 'user', content: 'React briefly.' }], tools: [] };
        const result = await bridge.rp(input);
        expect(result.response.assistantText).toBe('Observed model output');
        expect(result.snapshot.diagnostics.inputTokens).toBeGreaterThan(0);
        expect(requests[0].body).toMatchObject({ model: config.model, max_tokens: 1024, stream: false });
        expect(bridge.budget.snapshot()).toMatchObject({ requests: 1, tokens: 15 });
        expect(bridge.observations()).toMatchObject([{ status: 'completed', usage: { totalTokens: 15 } }]);
        expect(JSON.stringify([bridge.identity, bridge.observations(), result.snapshot])).not.toContain('synthetic-private-key');
        await expect(bridge.rp({ ...input, requestId: 'rp-live-2' })).rejects.toMatchObject({ code: 'comparison_budget_blocked' });
        expect(requests).toHaveLength(1);
    } finally { h.cleanup(); }
});

test('Project bridge executes the actual Generation Host against the isolated original Studio task', async () => {
    const h = await makeTempFsEngine();
    try {
        const { studio, agent } = services(h);
        const source = projectSource(); const created = await studio.createProject(h.handle, source);
        const task = await agent.createTask(h.handle, source.project.projectId, { intent: 'Inspect the fixture', baseRevision: created.revision.revision });
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config,
            secretPort: { resolveSecret: async () => 'synthetic-private-key' }, fetchImpl: async () => json(response) });
        const result = await bridge.project({ studio, agent, trialId: 'project-trial', input: { role: 'studio', projectId: source.project.projectId,
            taskId: task.taskId, revision: task.baseRevision, requestId: 'project-live', messages: [{ role: 'user', content: 'Inspect metadata.' }], tools: [] } });
        expect(result.routing.attempts).toHaveLength(1);
        expect(result.snapshot.contextPlan.source.projectId).toBe(source.project.projectId);
        expect(result.response.usage.totalTokens).toBe(15);
        expect((await agent.getTask(h.handle, source.project.projectId, task.taskId)).changeSets).toEqual([]);
    } finally { h.cleanup(); }
});

test('RP multi-round lowering removes Director metadata/private reasoning and preserves exact public tool pairing', async () => {
    const h = await makeTempFsEngine(); let wire;
    try {
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config,
            secretPort: { resolveSecret: async () => 'synthetic-private-key' }, fetchImpl: async (_url, options) => { wire = JSON.parse(options.body); return json(response); } });
        await bridge.rp({ requestId: 'round-two', trialId: 'multi-round', fixtureHash: 'fixture-r1', tools: [], messages: [
            { role: 'assistant', content: null, reasoning: 'PRIVATE_NOT_FOR_WIRE', _round: 0,
                tool_calls: [{ id: 'call-one', type: 'function', source: 'internal', function: { name: 'write_message', arguments: '{}' } }] },
            { role: 'tool', tool_call_id: 'call-one', content: '{"ok":true}', _round: 0 },
        ] });
        expect(JSON.stringify(wire)).not.toContain('PRIVATE_NOT_FOR_WIRE');
        expect(wire.messages.at(-2).tool_calls[0]).toEqual({ id: 'call-one', type: 'function', function: { name: 'write_message', arguments: '{}' } });
        expect(wire.messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call-one', content: '{"ok":true}' });
    } finally { h.cleanup(); }
});

test('unknown/failed usage keeps reservations and provider overage blocks all subsequent sends', () => {
    const budget = new EvaluationBudget({ maxRequests: 3, maxTotalTokens: 100 });
    const reserve = requestId => budget.reserve({ requestId, trialId: 'trial', inputTokens: 10, reservedOutput: 20 });
    expect(reserve('first').status).toBe('passed'); budget.settle('first');
    expect(budget.snapshot().tokens).toBe(30);
    expect(reserve('second').status).toBe('passed'); budget.settle('second', 40);
    expect(budget.snapshot()).toMatchObject({ tokens: 70, breached: true });
    expect(reserve('third').status).toBe('budget_blocked');
    expect(() => budget.settle('first', 0)).toThrow();
});

test('restored budget retains crash reservations and persists before the first send; a breach cannot be reset', () => {
    const changes = [];
    const limits = { maxRequests: 2, maxTotalTokens: 100 };
    const budget = new EvaluationBudget(limits, { onChange: snapshot => changes.push(snapshot) });
    budget.reserve({ requestId: 'pending', trialId: 'trial', inputTokens: 5, reservedOutput: 10 });
    expect(changes[0]).toMatchObject({ requests: 1, tokens: 15, entries: { pending: { settled: false } } });
    const restored = new EvaluationBudget(limits, { snapshot: JSON.parse(JSON.stringify(changes[0])) });
    expect(restored.snapshot()).toEqual(budget.snapshot());
    expect(() => restored.reserve({ requestId: 'pending', trialId: 'trial', inputTokens: 5, reservedOutput: 10 })).toThrow();
    restored.settle('pending', 16);
    const forged = restored.snapshot(); forged.breached = false;
    expect(() => new EvaluationBudget(limits, { snapshot: forged })).toThrow('restore mismatch');
});

test('live comparison captures independent baseline before candidates and binds sends, usage, resources and failed slots', async () => {
    const h = await makeTempFsEngine(); const order = []; let baseline;
    try {
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config: { ...config, maxRequests: 6 },
            secretPort: { resolveSecret: async () => 'synthetic-private-key' }, fetchImpl: async (_url, options) => {
                const body = JSON.parse(options.body);
                const rp = body.tools.some(tool => tool.function.name === 'write_message');
                return json(rp ? { choices: [{ message: { content: '', tool_calls: [
                    { id: 'write', type: 'function', function: { name: 'write_message', arguments: JSON.stringify({ text: 'NPC waits for your decision.', mode: 'replace' }) } },
                    { id: 'final', type: 'function', function: { name: 'finalize', arguments: '{}' } },
                ] } }], usage: response.usage } : response);
            } });
        const report = await runComparison({ candidate: { target: 'roundLimit', value: 5 }, split: 'development', mode: 'model', bridge,
            onTrial: trial => order.push(trial.trialId), onBaseline: value => { baseline = value; expect(order).toHaveLength(6); } });
        expect(order.slice(0, 6).every(id => id.endsWith(':baseline'))).toBe(true);
        expect(order.slice(6).every(id => id.endsWith(':candidate'))).toBe(true);
        expect(report.baselineHash).toBe(baseline.integrity);
        expect(report.pairs).toHaveLength(6); expect(report.empiricalReady).toBe(false);
        expect(report.summary.externalProviderCalls).toBe(6);
        expect(validateComparison(JSON.parse(JSON.stringify(report)))).toEqual(report);
        for (const mutate of [value => { value.baselineHash = 'a'.repeat(64); },
            value => { value.observations[0].usage.totalTokens += 1; },
            value => { value.pairs[0].baseline.trial.configuration.promptHash = 'a'.repeat(64); },
            value => { value.ledger.entries[value.observations[0].attemptId].tokens = 0; }]) {
            const forged = structuredClone(report); mutate(forged); expect(() => validateComparison(forged)).toThrow();
        }
    } finally { h.cleanup(); }
}, 30000);

test.each(['project_authoring_d1', 'project_repair_p1'])('original Studio loop %s reaches Review through read/write tools and the live Host before fixture reviewer Commit', async caseId => {
    const h = await makeTempFsEngine(); let proposed; let step = 0;
    const entry = selectCases({ purpose: 'evaluation', split: caseId.endsWith('p1') ? 'promotion' : 'development' }).find(item => item.caseId === caseId);
    const fixture = loadFixture(entry, { purpose: 'evaluation' });
    const capture = captureFor(entry, 'project-loop-live');
    try {
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config: { ...config, maxRequests: 6 },
            secretPort: { resolveSecret: async () => 'synthetic-private-key' }, fetchImpl: async () => {
                const tools = [
                    { name: 'atri_agent_get_project', args: {} },
                    ...(caseId.includes('repair') ? [{ name: 'atri_agent_reset_operations', args: {} }] : []),
                    { name: 'atri_agent_set_plan', args: { summary: fixture.input, steps: [{ id: 'metadata', title: 'Rename metadata', impact: 'low' }] } },
                    { name: 'atri_agent_project_save', args: { source: proposed, stepId: 'metadata' } },
                    { name: 'atri_agent_prepare_review', args: {} },
                ];
                const tool = tools[step++];
                if (!tool) throw new Error('Unexpected fifth model request');
                return json({ choices: [{ message: { content: '', tool_calls: [{ id: 'call-' + step, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } }], usage: response.usage });
            } });
        await withIsolatedRuntime(() => runProject(entry, fixture, capture, { settings: BASE_SETTINGS, bridge, beforeSend: () => {},
            probe: async ({ projectId, taskId }) => {
                const context = await (await globalThis.fetch(`/api/native/studio/projects/${projectId}/agent/tasks/${taskId}/context`)).json();
                proposed = structuredClone(context.project.source); proposed.project.displayName = fixture.proposedName;
            } }));
        expect(capture.checks.review_gate.status).toBe('passed');
        expect((capture.checks.single_changeset || capture.checks.repair_bound).status).toBe('passed');
        expect(bridge.observations()).toHaveLength(caseId.includes('repair') ? 5 : 4);
    } finally { h.cleanup(); }
}, 30000);
