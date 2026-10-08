import { expect, test } from '@jest/globals';
import { evolutionFixture, runEvolution, skillMd } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

test('the original worker completes only a missing development case and rejects filtered promotion', async () => {
    let sends = 0;
    const fetchImpl = async (_url, options) => {
        sends++;
        const body = JSON.parse(options.body), content = body.messages.at(-1).content;
        let message;
        if (content.includes('allowedDeclaration')) message = { content: JSON.stringify({ value: skillMd('Scoped candidate'), rationale: 'Synthetic wiring' }) };
        else if (body.tools?.length) message = { content: '', tool_calls: [{ id: 'w', type: 'function', function: { name: 'write_message', arguments: JSON.stringify({ text: 'NPC waits.', mode: 'replace' }) } },
            { id: 'f', type: 'function', function: { name: 'finalize', arguments: '{}' } }] };
        else { const input = JSON.parse(content); message = { content: JSON.stringify({ preference: 'tie', deltas: Object.fromEntries(input.dimensions.map(d => [d, 0])), rationale: 'Synthetic tie' }) }; }
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    };
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, fetchImpl });
    try {
        const compare = f.evaluator.compare.bind(f.evaluator);
        f.evaluator.compare = (handle, job, configs, settings, signal, fresh) => compare(handle, job, configs, settings, signal, fresh, undefined, undefined,
            { split: 'development', repetitions: 1, caseIds: ['rp_variant_d1'] });
        const { candidate } = await runEvolution(f);
        expect(candidate.report.pairs.map(p => p.case.caseId)).toEqual(['rp_variant_d1']);
        expect(candidate.report.pairs[0].baseline.checks.stale_completion).toBe(true);
        expect(candidate.report.pairs[0].candidate.checks.variant_identity).toBe(true);
        expect(sends).toBe(4);
        await expect(compare(null, { domain: 'rp' }, null, null, null, null, undefined, undefined,
            { split: 'promotion', repetitions: 3, caseIds: ['rp_agency_p1'] })).rejects.toThrow('Invalid development case selection');
        expect(sends).toBe(4);
    } finally { f.h.cleanup(); }
}, 30000);
