import { afterEach, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evolutionFixture, restoreEvolutionFixture, runEvolution, testConfig } from './evolution-fixture.js';
import { createLiveBridge } from './live-bridge.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { projectActivationMatches } from './m1-resume.js';
import { createM1SecretPort } from './m1-secrets.js';

const cleanup = [];
afterEach(() => { jest.restoreAllMocks(); for (const fn of cleanup.splice(0)) fn(); });

test('model selection works through a frozen secret port and rejects unknown references', async () => {
    const secrets = createM1SecretPort({ config: { model: 'primary' }, apiKey: 'fixture-primary' }, { config: { model: 'secondary' }, apiKey: 'fixture-secondary' });
    Object.freeze(secrets.port);
    const restore = secrets.select('secondary');
    expect(await secrets.port.resolveSecret({ secretId: 's06-test-key' })).toBe('fixture-secondary');
    restore(); expect(await secrets.port.resolveSecret({ secretId: 's06-test-key' })).toBe('fixture-primary');
    await expect(secrets.port.resolveSecret({ secretId: 'unknown' })).rejects.toThrow('unknown_secret_reference');
    expect(() => secrets.select('unknown')).toThrow('unknown_test_model');
});

test.each(['rp-skill', 'project-prompt'])('grading-only restore preserves %s comparison after rollback', async kind => {
    const f = await evolutionFixture(makeTempFsEngineHarness, kind, { policyMode: 'review' }); cleanup.push(f.h.cleanup);
    const result = await runEvolution(f);
    await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: result.job.id, candidateId: result.candidate.candidateId,
        expectedReportHash: hash(result.candidate.report), review: true });
    const published = await f.repository.get(f.h.handle, f.scope, f.subject);
    await f.service.rollback(f.h.handle, { scope: f.scope, subject: f.subject, publicationId: published.publications[0].id });
    const saved = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-m1-grading-')); cleanup.push(() => fs.rmSync(saved, { recursive: true, force: true }));
    fs.cpSync(f.h.dataRoot, saved, { recursive: true });
    await expect(restoreEvolutionFixture(makeTempFsEngineHarness, saved, result)).rejects.toThrow('resume_publication_changed');
    const restored = await restoreEvolutionFixture(makeTempFsEngineHarness, saved, result, { requireCurrentPublication: false }); cleanup.push(restored.h.cleanup);
    const doc = await restored.repository.get(restored.h.handle, restored.scope, restored.subject);
    expect(doc.jobs[0].candidates[0].report).toEqual(result.candidate.report);
    expect(doc.publications[0].status).toBe('rolled_back');
    expect(restored.route.runtimeRouteId).toBe(result.doc.policy.routeId);
    expect(await restored.repository.owner(restored.h.handle)).toEqual(await f.repository.owner(f.h.handle));
});

test('saved Project publication resumes on its exact Route with two models and rolls back without rerunning comparison', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { policyMode: 'review' }); cleanup.push(f.h.cleanup);
    await createLiveBridge({ engine: f.h.engine, handle: f.h.handle, config: { ...testConfig, model: 'secondary-fixture-model' },
        secretPort: { resolveSecret: async () => 'seed_only' }, fetchImpl: async () => { throw new Error('seed_send_forbidden'); } });
    const result = await runEvolution(f);
    await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: result.job.id, candidateId: result.candidate.candidateId,
        expectedReportHash: hash(result.candidate.report), review: true });
    const saved = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-m1-resume-')); cleanup.push(() => fs.rmSync(saved, { recursive: true, force: true }));
    fs.cpSync(f.h.dataRoot, saved, { recursive: true });
    const altered = structuredClone(result); altered.candidate.report.pairs[0].candidate.output = 'Altered';
    await expect(restoreEvolutionFixture(makeTempFsEngineHarness, saved, altered, {})).rejects.toThrow('resume_publication_changed');
    let sends = 0;
    const restored = await restoreEvolutionFixture(makeTempFsEngineHarness, saved, result, { fetchImpl: async () => {
        sends++; return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: 'Synthetic activation' } }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } }); cleanup.push(restored.h.cleanup);
    restored.host.secretPort.resolveSecret = async () => 'fixture_secret';
    // Synthetic comparison reserved without waiting; advance its fixture clock
    // beyond those queued timestamps before exercising the actual funded send.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60000);
    const settings = await restored.service.targets.evaluationSettings(restored.h.handle, restored.scope, restored.subject, restored.target);
    const config = await restored.evaluator.configuration(restored.h.handle, restored.route.runtimeRouteId, settings.projectPromptRef);
    expect(projectActivationMatches(config, settings, restored.publication, result.candidate)).toBe(true);
    expect(projectActivationMatches({ ...config, model: { ...config.model, remoteModelId: 'changed' } }, settings, restored.publication, result.candidate)).toBe(false);
    expect(projectActivationMatches(config, { ...settings, projectPromptRef: restored.publication.previous.promptProgramRef }, restored.publication, result.candidate)).toBe(false);
    let prepared, boundaryFailure;
    const base = restored.host.providers['provider.openai-compatible'];
    const provider = { ...base, renderRequest(input) {
        const rendered = base.renderRequest(input);
        prepared = { arm: 'candidate', trialId: result.job.id + ':activation', rendered, inputTokens: input.snapshot.diagnostics.inputTokens,
            outputTokens: input.snapshot.contextPlan.budget.reservedOutputTokens, requestHash: hash(rendered), snapshotHash: hash(input.snapshot) };
        return rendered;
    }, async send(_rendered, boundary) {
        try {
            const paid = await restored.evaluator.send(restored.h.handle, { ...result.job, id: result.job.id + ':activation', scopeId: result.doc.scopeId, price: null }, config, prepared, boundary.signal, async () => {});
            return { headers: { get: () => 'application/json' }, json: async () => paid.raw };
        } catch (error) { boundaryFailure = error; throw error; }
    } };
    const host = new NativeGenerationHost({ ...restored.host, providers: { ...restored.host.providers, 'provider.openai-compatible': provider } }), project = await restored.host.studio.getProject(restored.h.handle, restored.subject);
    const input = { role: 'studio', projectId: restored.subject, revision: project.revision.revision, requestId: 'resumed-project-activation', messages: [{ role: 'user', content: 'Acknowledge readiness' }], tools: [] };
    await expect(host.execute(restored.h.handle, input)).rejects.toMatchObject({ code: 'native_generation_route_ambiguous' }); expect(sends).toBe(0);
    let next;
    try { next = await host.execute(restored.h.handle, { ...input, routeRef: { scope: 'player', runtimeRouteId: restored.route.runtimeRouteId } }); }
    catch (error) { throw boundaryFailure || error; }
    expect(sends).toBe(1); expect(next.snapshot.promptIr.directives).toContain(result.candidate.diff.after);
    const doc = await restored.repository.get(restored.h.handle, restored.scope, restored.subject);
    expect(doc.publications[0].activation).toMatchObject({ origin: 'host', requestId: input.requestId });
    expect(doc.jobs[0].candidates[0].report).toEqual(result.candidate.report);
    await restored.service.rollback(restored.h.handle, { scope: restored.scope, subject: restored.subject, publicationId: restored.publication.id });
    expect(hash(await restored.service.targets.evaluationSettings(restored.h.handle, restored.scope, restored.subject, restored.target))).toBe(result.candidate.report.settings.baseline);
});
