import { expect, test } from '@jest/globals';
import { evolutionFixture, runEvolution, testConfig } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { m1EvaluationConfiguration, sendM1Evaluation } from './m1-grader.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { validateQualityReport } from '../../src/native/agent-intelligence/evaluation/quality.js';

test.each([false, true])('the original worker completes only a missing development case and rejects filtered promotion, bounded=%s', async bounded => {
    let sends = 0;
    const fetchImpl = async (_url, options) => {
        sends++;
        const body = JSON.parse(options.body), content = body.messages.at(-1).content;
        expect(body.max_tokens).toBe(bounded ? 8000 : testConfig.maxOutputTokens);
        let message;
        if (content.includes('allowedDeclaration')) message = { content: JSON.stringify({ edits: [{ before: '', after: '\nScoped candidate' }], rationale: 'Synthetic wiring' }) };
        else if (body.tools?.length) message = { content: '', tool_calls: [{ id: 'w', type: 'function', function: { name: 'write_message', arguments: JSON.stringify({ text: 'NPC waits.', mode: 'replace' }) } },
            { id: 'f', type: 'function', function: { name: 'finalize', arguments: '{}' } }] };
        else { const input = JSON.parse(content); message = { content: JSON.stringify({ preference: 'tie', deltas: Object.fromEntries(input.dimensions.map(d => [d, 0])), rationale: 'Synthetic tie' }) }; }
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    };
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, fetchImpl, confirmedPrice: null,
        ...(bounded ? { connectionConfig: { ...testConfig, maxOutputTokens: 8000, contextTokens: 32000 },
            configureEvaluator: evaluator => { evaluator.configuration = (handle, routeId, promptRef) => m1EvaluationConfiguration(evaluator.host, handle, routeId, promptRef); } } : {}) });
    try {
        const [nativeConfig] = await Promise.allSettled([EvolutionEvaluator.prototype.configuration.call(f.evaluator, f.h.handle, f.route.runtimeRouteId)]);
        expect(nativeConfig.status).toBe(bounded ? 'rejected' : 'fulfilled');
        if (bounded) {
            f.evaluator.configuration = (handle, routeId, promptRef) => m1EvaluationConfiguration(f.host, handle, routeId, promptRef);
            f.evaluator.send = (handle, job, config, packet, signal, fresh) => sendM1Evaluation(f.evaluator, handle,
                { ...job, m1Envelope: 'cycle-output-8000-v1' }, config, packet, signal, fresh);
        }
        const compare = f.evaluator.compare.bind(f.evaluator);
        f.evaluator.compare = (handle, job, configs, settings, signal, fresh) => compare(handle, job, configs, settings, signal, fresh, undefined, undefined,
            { split: 'development', repetitions: 1, caseIds: ['rp_variant_d1'] });
        const { candidate } = await runEvolution(f);
        expect(candidate.report.schemaVersion).toBe(2);
        expect(validateQualityReport(candidate.report).cases).toMatchObject([{ caseId: 'rp_variant_d1', provenance: { origin: 'historical_synthetic', independence: 'not_established' } }]);
        expect(candidate.report.pairs.map(p => p.case.caseId)).toEqual(['rp_variant_d1']);
        expect(candidate.report.pairs[0].baseline.checks.stale_completion).toBe(true);
        expect(candidate.report.pairs[0].candidate.checks.variant_identity).toBe(true);
        expect(sends).toBe(4);
        expect(candidate.diff.after).toBe(candidate.diff.before + '\nScoped candidate');
        expect((await f.repository.owner(f.h.handle)).attempts.map(a => a.kind)).toEqual(['extraction', 'baseline', 'candidate', 'judge']);
        await expect(compare(null, { domain: 'rp' }, null, null, null, null, undefined, undefined,
            { split: 'promotion', repetitions: 3, caseIds: ['rp_agency_p1'] })).rejects.toThrow('Invalid development case selection');
        expect(sends).toBe(4);
    } finally { f.h.cleanup(); }
}, 30000);

test('an injected stale challenge leaves all six paid Director rounds available and keeps authority checks', async () => {
    let activeArm, calls = 0;
    const rounds = { baseline: 0, candidate: 0 };
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl: async (_url, options) => {
        calls++;
        const body = JSON.parse(options.body), content = body.messages.at(-1).content;
        let message;
        if (activeArm === 'extraction') message = { content: JSON.stringify({ edits: [{ before: '', after: '\nScoped candidate' }], rationale: 'Synthetic wiring' }) };
        else if (activeArm === 'judge') { const input = JSON.parse(content); message = { content: JSON.stringify({ preference: 'tie', deltas: Object.fromEntries(input.dimensions.map(d => [d, 0])), rationale: 'Synthetic tie' }) }; }
        else {
            const round = ++rounds[activeArm], name = round < 5 ? 'get_draft' : round === 5 ? 'write_message' : 'finalize';
            message = { content: '', tool_calls: [{ id: 'round-' + round, type: 'function', function: { name, arguments: JSON.stringify(name === 'write_message' ? { text: 'NPC waits.', mode: 'replace' } : {}) } }] };
        }
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }], usage: { total_tokens: 10 } }) };
    } });
    try {
        const send = f.evaluator.send.bind(f.evaluator);
        f.evaluator.send = (...args) => { activeArm = args[3].arm; return send(...args); };
        const compare = f.evaluator.compare.bind(f.evaluator);
        f.evaluator.compare = (handle, job, configs, settings, signal, fresh) => compare(handle, job, configs, settings, signal, fresh, undefined, undefined,
            { split: 'development', repetitions: 1, caseIds: ['rp_variant_d1'] });
        const { candidate } = await runEvolution(f), pair = candidate.report.pairs[0];
        expect(rounds).toEqual({ baseline: 6, candidate: 6 }); expect(calls).toBe(14);
        expect(pair.case.limits.maxRequests).toBe(6); expect(pair.case.requestLimitUnit).toBe('actual_provider_send');
        expect(pair.baseline.refs.requestIds).toHaveLength(7); expect(pair.candidate.refs.requestIds).toHaveLength(7);
        expect(pair.baseline.checks.stale_completion).toBe(true); expect(pair.candidate.checks.variant_identity).toBe(true);
        expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(14);
    } finally { f.h.cleanup(); }
}, 30000);
