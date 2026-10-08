import { expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution, skillMd } from './evolution-fixture.js';

test('a failed candidate send preserves the completed baseline and its original authority checks', async () => {
    let sends = 0;
    const trials = [];
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body); sends++;
        if (sends === 3) throw new Error('Synthetic candidate transport failure');
        const message = body.messages.at(-1).content.includes('allowedDeclaration')
            ? { content: JSON.stringify({ value: skillMd('Candidate guidance'), rationale: 'Synthetic wiring check' }) }
            : { content: '', tool_calls: [
                { id: 'write', type: 'function', function: { name: 'write_message', arguments: JSON.stringify({ text: 'The NPC waits for your decision.', mode: 'replace' }) } },
                { id: 'finalize', type: 'function', function: { name: 'finalize', arguments: '{}' } },
            ] };
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    const compare = f.evaluator.compare.bind(f.evaluator);
    f.evaluator.compare = (...args) => compare(...args, async () => {}, async event => { trials.push(event); });
    try {
        const { candidate } = await runEvolution(f);
        expect(candidate.report.origin).toBe('unavailable');
        expect(sends).toBe(3);
        expect(trials).toHaveLength(2);
        expect(trials[0]).toMatchObject({ arm: 'baseline', repetition: 1, trial: { error: null, checks: { isolation: true, target_consumed: true } } });
        expect(trials[0].trial.output).toContain('waits');
        expect(trials[1]).toMatchObject({ arm: 'candidate', trial: { error: 'evaluation_runtime_failed' } });
        const owner = await f.repository.owner(f.h.handle);
        expect(owner.attempts).toHaveLength(3);
        expect(owner.attempts[2].status).toBe('unknown');
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications).toEqual([]);
    } finally { f.h.cleanup(); }
}, 15000);
