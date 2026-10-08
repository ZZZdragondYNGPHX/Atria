// Explicit local M1 acceptance. Production promotion gates are never changed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import writeFileAtomic from 'write-file-atomic';
import { fetch as httpFetch, Agent } from 'undici';
import { setConfigFilePath } from '../../src/util.js';
import { EvaluationBudget } from './budget.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { evolutionEvaluatorRevision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { parseBlindGrade, automatedAcceptance } from './m1-acceptance.js';
import { M1RetryPolicy } from './m1-retry.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
setConfigFilePath(path.join(repo, 'default/config.yaml'));
const emptySkills = { list: async () => [], invocationSettings: async () => ({ skills: {} }) };
const skillPort = new Proxy({}, { get(_target, key) { const current = globalThis.Atria?.getContext?.()?.skills; const api = !current || current === skillPort ? emptySkills : current; return typeof api[key] === 'function' ? api[key].bind(api) : api[key]; } });
const emptyContext = () => ({ constants: { promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, wiPosition: { before: 0, after: 1 } }, skills: skillPort });
globalThis.Atria = { getContext: emptyContext };
const option = process.argv.slice(2);
let lock, descriptor, dispatcher, scratch;
const overall = new AbortController();
const deadline = setTimeout(() => overall.abort(), 2 * 3600000);
const safeReason = error => /^[a-z_0-9]{1,100}$/.test(error?.code || error?.message || '') ? error.code || error.message : 'inspect_private_report';
try {
    const prepareOnly = option.length === 3 && option[2] === '--prepare';
    if (!(option.length === 2 || prepareOnly) || option[0] !== '--directory') throw new Error('explicit_private_directory_required');
    const directory = fs.realpathSync(option[1]);
    if ((fs.statSync(directory).mode & 0o777) !== 0o700) throw new Error('private_directory_permissions_required');
    const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    const limits = read('m1-limits.json');
    if (limits.maxRequests !== 512 || limits.maxTotalTokens !== 1699536) throw new Error('frozen_recovery_limits_required');
    const ledgerPath = path.join(directory, 'm1-ledger.json');
    const snapshot = read('m1-ledger.json');
    if (!snapshot.historicalCarry || snapshot.historicalCarry.evidenceHash !== read('m1-recovery.json').evidenceHash) throw new Error('historical_carry_changed');
    lock = ledgerPath + '.lock'; descriptor = fs.openSync(lock, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
    const ratePath = ledgerPath + '.rate.json';
    let lastAdmissionAt = fs.existsSync(ratePath) ? read('m1-ledger.json.rate.json').lastAdmissionAt : Date.now();
    if (!Number.isSafeInteger(lastAdmissionAt) || lastAdmissionAt < 0 || lastAdmissionAt > Date.now() + 60000) throw new Error('invalid_rate_checkpoint');
    lastAdmissionAt = Math.max(lastAdmissionAt, Date.now());
    let admitted = snapshot.requests;
    const budget = new EvaluationBudget(limits, { snapshot, onChange: next => {
        if (next.requests > admitted) {
            const delay = Math.max(0, lastAdmissionAt + 3150 - Date.now());
            if (delay > 60000) throw new Error('invalid_rate_clock');
            if (delay) globalThis.Atomics.wait(new Int32Array(new globalThis.SharedArrayBuffer(4)), 0, 0, delay);
            lastAdmissionAt = Date.now(); admitted = next.requests;
            writeFileAtomic.sync(ratePath, JSON.stringify({ lastAdmissionAt }) + '\n', { mode: 0o600 });
        }
        writeFileAtomic.sync(ledgerPath, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    } });
    const output = path.join(directory, 'm1-reports', 'run-' + Date.now() + '-' + randomUUID().slice(0, 8));
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    const store = (name, value) => writeFileAtomic.sync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    const connections = ['api-primary.json', 'api-secondary.json'].map(name => {
        const file = path.join(directory, name);
        if ((fs.statSync(file).mode & 0o777) !== 0o600) throw new Error('private_connection_permissions_required');
        const { apiKey, ...config } = read(name);
        if (!apiKey) throw new Error('explicit_key_required');
        return { apiKey, config };
    });
    if (connections[0].config.model === connections[1].config.model) throw new Error('different_model_identifier_required');
    const testedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const sourceFiles = ['budget.js', 'm1-live.mjs', 'm1-acceptance.js', 'm1-retry.js', 'evolution-fixture.js', 'live-bridge.js'];
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...sourceFiles.map(f => 'tests/agent-intelligence/' + f)], { cwd: repo });
    const summary = { schemaVersion: 1, origin: 'm1_local_automated_acceptance', testedHead, evaluatorRevision: evolutionEvaluatorRevision(),
        runnerRevision: hash(sourceFiles.map(f => [f, fs.readFileSync(new URL(f, import.meta.url), 'utf8')])),
        policy: 'm1-automated-acceptance-2026-10-07', historicalRecords: 'unavailable', historicalCarry: snapshot.historicalCarry,
        initialAccounting: { requests: snapshot.requests, tokens: snapshot.tokens }, limits, entries: [], humanPreference: 'not_observed', productionPromotion: 'original_gate_unchanged' };
    store('summary.json', summary);
    dispatcher = new Agent({ connectTimeout: 30000, headersTimeout: 300000, bodyTimeout: 300000 });
    const transportCheckpoint = path.join(directory, 'm1-transport-state.json');
    const retryPolicy = new M1RetryPolicy({ snapshot: fs.existsSync(transportCheckpoint) ? read('m1-transport-state.json') : {},
        onChange: state => writeFileAtomic.sync(transportCheckpoint, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }) });
    const transport = async (url, options) => {
        const model = JSON.parse(options.body).model, key = url + ':' + model;
        retryPolicy.assertAvailable(key);
        try {
            const response = await httpFetch(url, { ...options, dispatcher, signal: AbortSignal.any([options.signal, overall.signal, AbortSignal.timeout(300000)]) });
            if (!response.ok) {
                const code = 'm1_http_' + response.status;
                await response.body?.cancel();
                throw Object.assign(new Error(code), { code });
            }
            retryPolicy.observe(key);
            return response;
        } catch (error) {
            const code = error.code?.startsWith('m1_http_') ? error.code : options.signal.aborted || overall.signal.aborted ? 'm1_cancelled' : 'm1_transport_failed';
            retryPolicy.observe(key, code);
            throw Object.assign(new Error(code), { code });
        }
    };
    const { evolutionFixture, runEvolution } = await import('./evolution-fixture.js');
    const { makeTempFsEngineHarness } = await import('../storage/harness/contract-harness.js');
    const { createLiveBridge } = await import('./live-bridge.js');
    const { createFrozenEvaluationBridge } = await import('../../src/native/agent-intelligence/evaluation/worker-bridge.js');
    const { NativeGenerationHost } = await import('../../src/native/adapters/generation-host.js');
    const { runRp } = await import('../../src/native/agent-intelligence/evaluation/adapters.js');
    const { selectCases, loadFixture, canonical } = await import('../../src/native/agent-intelligence/evaluation/cases.js');
    for (const [index, kind] of ['rp-skill', 'project-prompt'].entries()) {
        const entry = { kind, status: 'preparing', independent: [], lifecycle: null };
        summary.entries.push(entry); store('summary.json', summary);
        try {
            const primary = connections[0];
            const f = await evolutionFixture(makeTempFsEngineHarness, kind, { realEvaluator: true, fetchImpl: transport,
                connectionConfig: primary.config, policyMode: 'review', confirmedPrice: null }); scratch = f.h;
            const owner = await f.repository.owner(f.h.handle);
            await f.service.budget(f.h.handle, { expectedSequence: owner.sequence, limits: { maxRequests: 260, maxTokens: 699536, minIntervalMs: 3150 } });
            const secondary = connections[1];
            await createLiveBridge({ engine: f.h.engine, handle: f.h.handle, config: secondary.config,
                secretPort: { resolveSecret: async () => 'seed_only' }, fetchImpl: async () => { throw new Error('seed_send_forbidden'); } });
            const routes = await f.host.persistence.listRuntimeRoutes(f.h.handle);
            const secondaryRoute = routes.find(r => r.role === 'role.orchestrator' && r.runtimeRouteId !== f.route.runtimeRouteId
                && r.modelProfileRef.modelProfileId !== f.route.modelProfileRef.modelProfileId);
            const secondaryConfig = await f.evaluator.configuration(f.h.handle, secondaryRoute.runtimeRouteId);
            f.host.secretPort.resolveSecret = async ref => {
                if (ref.secretId !== 's06-test-key') throw new Error('unknown_secret_reference');
                return primary.apiKey;
            };
            const reserve = f.evaluator.repository.reserve.bind(f.evaluator.repository), settle = f.evaluator.repository.settle.bind(f.evaluator.repository);
            let packet = null;
            f.evaluator.repository.reserve = async (handle, attempt) => {
                if (!packet || attempt.upperBound !== packet.inputTokens + packet.outputTokens) throw new Error('send_reservation_mismatch');
                if (budget.reserve({ requestId: attempt.id, trialId: attempt.trialId, inputTokens: packet.inputTokens,
                    reservedOutput: packet.outputTokens, kind: packet.retryAttempt ? 'retry' : attempt.kind === 'judge' ? 'grader' : 'model' }).status !== 'passed') throw new Error('recovered_budget_blocked');
                return reserve(handle, attempt);
            };
            f.evaluator.repository.settle = async (handle, id, tokens, metadata) => {
                try { return await settle(handle, id, tokens, metadata); } finally { if (budget.entries.has(id) && !budget.entries.get(id).settled) budget.settle(id, tokens); }
            };
            const send = f.evaluator.send.bind(f.evaluator);
            f.evaluator.send = async (handle, job, config, payload, signal, fresh) => {
                const transportKey = payload.rendered.endpoint + ':' + payload.rendered.body.model;
                return retryPolicy.send(transportKey, async retryAttempt => {
                    if (overall.signal.aborted) throw new Error('m1_duration_blocked');
                    if (job.id.endsWith(':activation') && [...budget.entries.values()].filter(e => e.trialId === payload.trialId).length >= (kind === 'rp-skill' ? 5 : 1)) throw new Error('m1_activation_budget_blocked');
                    packet = { ...payload, retryAttempt };
                    const originalSecret = f.host.secretPort.resolveSecret;
                    f.host.secretPort.resolveSecret = async () => config.model.remoteModelId === secondary.config.model ? secondary.apiKey : primary.apiKey;
                    try {
                        const result = await send(handle, job, config, payload, signal, fresh);
                        store(kind + '-response-' + result.charge.id + '.json', result);
                        return result;
                    }
                    finally { f.host.secretPort.resolveSecret = originalSecret; packet = null;
                        const s = budget.snapshot(); console.log(JSON.stringify({ kind, retryAttempt, accountingRequests: s.requests, accountingTokens: s.tokens, freshSends: s.requests - 252 })); }
                }, AbortSignal.any([signal, overall.signal]));
            };
            const compare = f.evaluator.compare.bind(f.evaluator);
            f.evaluator.compare = (handle, job, configs, settings, signal, fresh) => compare(handle, job, configs, settings, signal, fresh,
                async pair => { store(kind + '-pair-' + pair.case.caseId + '-' + pair.repetition + '.json', { pair, observedAt: Date.now() }); console.log(JSON.stringify({ kind, case: pair.case.caseId, repetition: pair.repetition, primaryPreference: pair.judge.preference })); },
                async trial => { store(kind + '-trial-' + trial.caseId + '-' + trial.repetition + '-' + trial.arm + '.json', trial); });
            if (prepareOnly) { entry.status = 'prepared'; entry.targetPin = (await f.repository.get(f.h.handle, f.scope, f.subject)).policy.targetPin; entry.primaryConfigurationHash = hash(await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId)); entry.secondaryConfigurationHash = hash(secondaryConfig); continue; }
            entry.status = 'evaluating'; store('summary.json', summary);
            const result = await runEvolution(f), { job, candidate } = result;
            entry.jobId = job.id; entry.status = job.status;
            store(kind + '-job.json', result);
            if (!candidate?.report?.pairs?.length) throw new Error(candidate?.report?.reason || job.reason || 'comparison_unavailable');
            for (const pair of candidate.report.pairs) {
                const flipped = parseInt(hash(['independent', pair.pairHash]).slice(0, 2), 16) % 2 === 1;
                let charge;
                const bridge = await createFrozenEvaluationBridge(secondaryConfig, async payload => {
                    const result = await f.evaluator.send(f.h.handle, { ...job, id: job.id + ':independent', scopeId: result.doc.scopeId, price: null }, secondaryConfig,
                        { ...payload, arm: 'judge' }, new AbortController().signal, async () => {}); charge = result.charge; return result.raw;
                });
                try {
                    const response = await bridge.rp({ requestId: randomUUID(), trialId: job.id + ':independent:' + pair.pairHash, fixtureHash: pair.case.fixtureHash,
                        messages: [{ role: 'system', content: 'Blindly compare the two outputs against the task and dimensions. Return JSON only: {"preference":"left|right|tie|uncertain","deltas":{dimension:integer from -4 to 4},"rationale":"concise public explanation"}. Delta means right minus left. Do not guess missing evidence.' },
                            { role: 'user', content: JSON.stringify({ ...pair.scenario, dimensions: pair.case.behaviorDimensions, left: pair[flipped ? 'candidate' : 'baseline'].output, right: pair[flipped ? 'baseline' : 'candidate'].output }) }], tools: [], kind: 'grader' });
                    entry.independent.push({ origin: 'independent_model', pairHash: pair.pairHash, model: secondary.config.model, primaryModel: primary.config.model,
                        configurationHash: hash(secondaryConfig), chargeId: charge.id, requestHash: charge.requestHash, snapshotHash: charge.snapshotHash,
                        ...parseBlindGrade(response.response.assistantText || response.response.text, pair, flipped) });
                } catch (error) { entry.independent.push({ origin: 'independent_model', pairHash: pair.pairHash, status: 'unavailable', reason: safeReason(error) }); break; }
                finally { bridge.cleanup(); store(kind + '-independent.json', entry.independent); }
            }
            entry.acceptance = automatedAcceptance(candidate.report, entry.independent, await f.repository.owner(f.h.handle), job.id);
            // Explicit delegated review is confined to this private fixture. No
            // human labels or automatic publication eligibility are invented.
            const published = await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId,
                expectedReportHash: hash(candidate.report), review: true });
            const doc = await f.repository.get(f.h.handle, f.scope, f.subject), publication = doc.publications[0];
            entry.lifecycle = { delegatedFixtureReview: true, automaticPromotion: false, receipt: published, current: await f.service.targets.publicationCurrent(f.h.handle, f.scope, f.subject, publication) };
            const nextSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
            const nextConfig = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, nextSettings.projectPromptRef || null);
            const activationJob = { ...job, id: job.id + ':activation', scopeId: result.doc.scopeId, price: null };
            const current = async () => { if (!await f.service.targets.publicationCurrent(f.h.handle, f.scope, f.subject, publication)) throw new Error('activation_binding_changed'); };
            if (index === 1) {
                let prepared;
                const base = f.host.providers['provider.openai-compatible'];
                const provider = { ...base, renderRequest(input) {
                    const rendered = base.renderRequest(input);
                    prepared = { arm: 'candidate', trialId: activationJob.id, rendered, inputTokens: input.snapshot.diagnostics.inputTokens,
                        outputTokens: input.snapshot.contextPlan.budget.reservedOutputTokens, requestHash: hash(rendered), snapshotHash: hash(input.snapshot) };
                    return rendered;
                }, async send(_rendered, boundary) {
                    const paid = await f.evaluator.send(f.h.handle, activationJob, nextConfig, prepared, boundary.signal, current);
                    return { headers: { get: () => 'application/json' }, json: async () => paid.raw };
                } };
                const host = new NativeGenerationHost({ ...f.host, providers: { ...f.host.providers, 'provider.openai-compatible': provider } });
                const project = await f.host.studio.getProject(f.h.handle, f.subject);
                const next = await host.execute(f.h.handle, { role: 'studio', projectId: f.subject, revision: project.revision.revision,
                    requestId: randomUUID(), messages: [{ role: 'user', content: 'Briefly acknowledge that this Project is ready for review. Do not perform any operation.' }], tools: [] });
                entry.lifecycle.nextSnapshotHash = hash(next.snapshot);
                entry.lifecycle.nextExactProgram = next.snapshot.promptProgramRef;
                entry.lifecycle.nextConfigurationMatchesCandidate = hash(nextConfig) === candidate.report.configurations.candidate;
                entry.lifecycle.activation = (await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].activation;
                entry.lifecycle.nextRunConsumed = Boolean(entry.lifecycle.activation && entry.lifecycle.nextConfigurationMatchesCandidate);
            } else {
                const fixtureCase = selectCases({ purpose: 'evaluation', split: 'development' }).find(c => c.entrance === 'rp');
                const bridge = await createFrozenEvaluationBridge(nextConfig, async payload => (await f.evaluator.send(f.h.handle, activationJob, nextConfig,
                    { ...payload, arm: 'candidate' }, new AbortController().signal, current)).raw);
                const capture = { trialId: activationJob.id, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
                    prompts: [], evidence: [], checks: {}, completeness: [], toolCalls: 0, repairCount: 0,
                    observe(name, observed, expected) { this.checks[name] = canonical(observed) === canonical(expected); this.evidence.push({ name, observed, expected }); } };
                const oldFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('activation_unbudgeted_network_denied'); };
                try { await runRp(fixtureCase, loadFixture(fixtureCase, { purpose: 'evaluation' }), capture, { bridge, settings: { roundLimit: 6, ...nextSettings }, beforeSend: () => {} }); }
                finally { bridge.cleanup(); globalThis.fetch = oldFetch; globalThis.Atria = { getContext: emptyContext }; }
                entry.lifecycle.nextRunConsumed = capture.artifact?.targetConsumed === true && Object.values(capture.checks).every(Boolean);
                entry.lifecycle.nextSettingsMatchesCandidate = hash(nextSettings) === candidate.report.settings.candidate;
                entry.lifecycle.activationOrigin = 'client_observation'; store(kind + '-next-run.json', capture);
            }
            await f.service.rollback(f.h.handle, { scope: f.scope, subject: f.subject, publicationId: publication.id });
            entry.lifecycle.baseRestored = hash(await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target)) === candidate.report.settings.baseline;
            entry.status = 'observed';
        } catch (error) {
            store(kind + '-error.json', { name: error.name, message: error.message, stack: error.stack });
            entry.status = 'unavailable'; entry.reason = safeReason(error); process.exitCode = 1;
        }
        finally {
            if (scratch) { fs.cpSync(scratch.dataRoot, path.join(output, kind + '-private-fixture'), { recursive: true }); scratch.cleanup(); scratch = null; }
            summary.transportFailures = [...new Set([...retryPolicy.connections.values()].map(s => s.stopped).filter(Boolean))];
            summary.transportObservations = [...retryPolicy.connections.values()].map(s => ({ consecutiveFailures: s.consecutive, recentSends: s.recent.length, recentFailures: s.recent.filter(Boolean).length, stopped: s.stopped }));
            summary.finalAccounting = { requests: budget.snapshot().requests, tokens: budget.snapshot().tokens, currentPeriodBreached: budget.snapshot().breached };
            summary.accepted = summary.entries.length === 2 && summary.entries.every(e => e.acceptance?.accepted && e.lifecycle?.nextRunConsumed && e.lifecycle?.baseRestored);
            store('summary.json', summary);
            console.log(JSON.stringify({ kind, status: entry.status, reason: entry.reason || null, acceptance: entry.acceptance || null }));
        }
        if ([...retryPolicy.connections.values()].some(s => s.stopped) && !entry.acceptance) break;
    }
    if (!prepareOnly && !summary.accepted) process.exitCode = 1;
    console.log(JSON.stringify({ accepted: summary.accepted, finalAccounting: summary.finalAccounting, humanPreference: summary.humanPreference }));
} catch (error) { console.error('M1 live acceptance:', safeReason(error)); process.exitCode = 1; }
finally {
    clearTimeout(deadline);
    scratch?.cleanup();
    if (descriptor !== undefined) { fs.closeSync(descriptor); fs.unlinkSync(lock); }
    await dispatcher?.close();
}
