import { beforeAll, expect, test } from '@jest/globals';
import { createLiveBridge } from './live-bridge.js';
import { EvaluationBudget } from './budget.js';
import { runComparison } from './comparison.js';
import { runModelJudge, validateJudgeReport } from './judge.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const config = { endpoint: 'https://example.invalid/v1/chat/completions', model: 'fixture-judge', tokenizer: 'cl100k_base',
    contextTokens: 32000, maxOutputTokens: 1024, maxRequests: 80, maxTotalTokens: 200000, timeoutMs: 1000 };
const json = message => new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { 'content-type': 'application/json' } });
const secretPort = { resolveSecret: async () => 'synthetic-private-key' };
let comparison;
beforeAll(async () => {
    const h = await makeTempFsEngine();
    try {
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config, secretPort, fetchImpl: async (_url, options) => {
            const body = JSON.parse(options.body);
            return json(body.tools.some(tool => tool.function.name === 'write_message') ? { content: '', tool_calls: [
                { id: 'write', type: 'function', function: { name: 'write_message', arguments: '{"text":"NPC waits for your answer.","mode":"replace"}' } },
                { id: 'final', type: 'function', function: { name: 'finalize', arguments: '{}' } },
            ] } : { content: 'No proposal ready.' });
        } });
        comparison = await runComparison({ candidate: { target: 'roundLimit', value: 5 }, split: 'promotion', mode: 'model', bridge });
    } finally { h.cleanup(); }
}, 30000);

async function judge(fetchImpl, prepare = () => {}) {
    const h = await makeTempFsEngine();
    try {
        const budget = new EvaluationBudget(config); prepare(budget);
        const port = { maxRequests: budget.maxRequests, maxTotalTokens: budget.maxTotalTokens,
            reserve: request => budget.reserve({ ...request, kind: 'grader' }), settle: budget.settle.bind(budget), snapshot: budget.snapshot.bind(budget) };
        const bridge = await createLiveBridge({ engine: h.engine, handle: h.handle, config, secretPort, budget: port, fetchImpl });
        return await runModelJudge(comparison, bridge);
    } finally { h.cleanup(); }
}
test('model judge sees blinded public outputs and formal outcomes; its typed observations bind the whole comparison and retain failed authority', async () => {
    const seen = [];
    const report = await judge(async (_url, options) => {
        const input = JSON.parse(JSON.parse(options.body).messages.at(-1).content); seen.push(input);
        const scores = Object.fromEntries(input.dimensions.map(dimension => [dimension, 2]));
        return json({ content: JSON.stringify({ preference: 'tie', confidence: 0.5, scores: { left: scores, right: scores }, rationale: 'Both outputs need further review.' }) });
    });
    expect(report.summary).toMatchObject({ observed: 6, requests: 6, tokens: 90, usageStatus: 'provider_reported', promotion: 'ineligible' });
    expect(JSON.stringify(seen)).not.toContain('PRIVATE:');
    expect(seen.every(input => !Object.hasOwn(input, 'candidate') && !Object.hasOwn(input, 'baseline'))).toBe(true);
    expect(seen.some(input => input.left.outcome.authority === 'failed')).toBe(true);
    expect(validateJudgeReport(JSON.parse(JSON.stringify(report)), comparison)).toEqual(report);
    for (const mutate of [value => { value.comparisonHash = 'a'.repeat(64); },
        value => { value.pairs.pop(); }, value => { value.pairs[1] = value.pairs[0]; },
        value => { value.pairs[0].binding = 'a'.repeat(64); },
        value => { value.pairs[0].grade.preference = 'left'; },
        value => { value.observations[0].usage.totalTokens += 1; },
        value => { value.summary.promotion = 'eligible'; },
        value => { value.observations[0].secret = 'forged'; }]) {
        const forged = structuredClone(report); mutate(forged); expect(() => validateJudgeReport(forged, comparison)).toThrow();
    }
}, 30000);

test('malformed model ratings retain every pair and charge actual usage without a fake score or repair call', async () => {
    const report = await judge(async () => json({ content: '{"preference":"left"}' }));
    expect(report.summary).toMatchObject({ invalid_response: 6, requests: 6, tokens: 90, promotion: 'ineligible' });
    expect(report.pairs.every(pair => pair.grade === null && pair.gradeHash === null)).toBe(true);
});

test('partial grader counters retain the reserved total and reject unknown counter fields', async () => {
    const report = await judge(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"preference":"left"}' } }], usage: { prompt_tokens: 10 } }), { headers: { 'content-type': 'application/json' } }));
    expect(report.summary).toMatchObject({ invalid_response: 6, requests: 6, usageStatus: 'reserved_upper_bound' });
    expect(report.summary.tokens).toBeGreaterThan(60);
    const forged = structuredClone(report); forged.observations[0].usage.unexpected = 1;
    expect(() => validateJudgeReport(forged, comparison)).toThrow('counters');
});

test('exhausted shared budget blocks every grader before fetch and retains all pair slots', async () => {
    const report = await judge(async () => { throw new Error('Must not send'); }, budget => {
        for (let index = 0; index < config.maxRequests; index++) {
            budget.reserve({ requestId: 'old-' + index, trialId: 'old-trial-' + index, inputTokens: 1, reservedOutput: 1 }); budget.settle('old-' + index, 1);
        }
    });
    expect(report.summary).toMatchObject({ budget_blocked: 6, requests: 0, tokens: 0, usageStatus: 'unavailable' });
});
