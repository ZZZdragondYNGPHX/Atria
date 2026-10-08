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
import { M1ApiQuota, M1AdvisoryRepository } from './m1-quota.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';
import { completeM1Response, m1BodyFailure } from './m1-response.js';
import { projectActivationMatches } from './m1-resume.js';
import { createM1SecretPort } from './m1-secrets.js';
import { m1TransportKey } from './m1-transport-key.js';
import { m1GraderConfiguration, sendM1Grader } from './m1-grader.js';
import { assertM1PrivateAccess } from './m1-private-access.js';

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
    const temporarySecondary = option.length === 4 && option[3] === '--temporary-secondary';
    if (temporarySecondary) option.pop();
    const prepareOnly = option.length === 3 && option[2] === '--prepare';
    const resumeName = option.length === 3 && option[2].startsWith('--resume-project=') ? option[2].slice('--resume-project='.length) : null;
    const gradeName = option.length === 3 && option[2].startsWith('--grade-only=') ? option[2].slice('--grade-only='.length) : null;
    const diagnoseOnly = option.length === 3 && option[2] === '--diagnose-secondary';
    const cycleBaselineProject = option.length === 3 && option[2].startsWith('--cycle-baseline-project=') ? option[2].slice('--cycle-baseline-project='.length) : null;
    const cycleBaseline = option.length === 3 && option[2] === '--cycle-baseline' || Boolean(cycleBaselineProject);
    const cycleOptimize = option.length === 3 && option[2].startsWith('--cycle-optimize=') ? option[2].slice('--cycle-optimize='.length) : null;
    const cycleAcceptance = option.length === 3 && option[2].startsWith('--cycle-acceptance=') ? option[2].slice('--cycle-acceptance='.length) : null;
    const cycle = cycleBaseline || cycleOptimize || cycleAcceptance;
    const development = cycleBaseline || Boolean(cycleOptimize);
    if (temporarySecondary && !gradeName) throw new Error('temporary_secondary_grading_only');
    if (!(option.length === 2 || prepareOnly || diagnoseOnly || option[2] === '--cycle-baseline' || (resumeName || gradeName || cycleOptimize || cycleAcceptance || cycleBaselineProject) && /^run-[0-9]+-[a-f0-9]{8}$/.test(resumeName || gradeName || cycleOptimize || cycleAcceptance || cycleBaselineProject)) || option[0] !== '--directory') throw new Error('explicit_private_directory_required');
    const directory = fs.realpathSync(option[1]);
    assertM1PrivateAccess(directory, 0o700);
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
    const quotaPath = path.join(directory, 'm1-api-quota.json');
    if (!fs.existsSync(quotaPath)) writeFileAtomic.sync(quotaPath, JSON.stringify({ schemaVersion: 1, carry: { requests: snapshot.requests, at: Date.now() }, admissions: [] }, null, 2) + '\n', { mode: 0o600 });
    const quota = new M1ApiQuota(read('m1-api-quota.json'), next => writeFileAtomic.sync(quotaPath, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 }));
    let admitted = snapshot.requests;
    const persistedIds = new Set(Object.keys(snapshot.entries));
    const warned = new Set(Object.entries(snapshot.entries).filter(([, e]) => e.tokens > e.upperBound).map(([id]) => 'reservation_overrun_' + id));
    const warning = (code, detail) => { if (!warned.has(code)) { warned.add(code); console.log(JSON.stringify({ advisoryWarning: code, ...detail })); } };
    const budget = new EvaluationBudget(limits, { snapshot, advisory: true, onChange: next => {
        if (next.requests > admitted) {
            const delay = Math.max(0, lastAdmissionAt + 3150 - Date.now());
            if (delay > 60000) throw new Error('invalid_rate_clock');
            if (delay) globalThis.Atomics.wait(new Int32Array(new globalThis.SharedArrayBuffer(4)), 0, 0, delay);
            const ids = Object.keys(next.entries).filter(id => !persistedIds.has(id));
            if (ids.length !== 1) throw new Error('quota_reservation_mismatch');
            quota.admit(ids[0]); persistedIds.add(ids[0]);
            lastAdmissionAt = Date.now(); admitted = next.requests;
            writeFileAtomic.sync(ratePath, JSON.stringify({ lastAdmissionAt }) + '\n', { mode: 0o600 });
        }
        writeFileAtomic.sync(ledgerPath, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        const over = Object.entries(next.entries).filter(([, e]) => e.tokens > e.upperBound);
        for (const [id, e] of over) warning('reservation_overrun_' + id, { tokens: e.tokens, suggestedReservation: e.upperBound });
        if (next.tokens > limits.maxTotalTokens) warning('suggested_total_tokens_exceeded', { tokens: next.tokens, suggestion: limits.maxTotalTokens });
        if (next.requests > limits.maxRequests) warning('suggested_total_requests_exceeded', { requests: next.requests, suggestion: limits.maxRequests });
    } });
    if (budget.breached) warning('historical_advisory_breach_preserved', { requests: snapshot.requests, tokens: snapshot.tokens });
    const output = path.join(directory, 'm1-reports', 'run-' + Date.now() + '-' + randomUUID().slice(0, 8));
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    const store = (name, value) => writeFileAtomic.sync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    const connections = ['api-primary.json', temporarySecondary ? 'api-minimax-temporary.json' : 'api-secondary.json'].map(name => {
        const file = path.join(directory, name);
        assertM1PrivateAccess(file, 0o600);
        const { apiKey, ...config } = read(name);
        if (!apiKey) throw new Error('explicit_key_required');
        return { apiKey, config };
    });
    if (connections[0].config.model === connections[1].config.model) throw new Error('different_model_identifier_required');
    const testedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const sourceFiles = ['budget.js', 'm1-live.mjs', 'm1-acceptance.js', 'm1-retry.js', 'm1-quota.js', 'm1-response.js', 'm1-resume.js', 'm1-secrets.js', 'm1-transport-key.js', 'm1-grader.js', 'm1-private-access.js', 'evolution-fixture.js', 'live-bridge.js'];
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...sourceFiles.map(f => 'tests/agent-intelligence/' + f)], { cwd: repo });
    const summary = { schemaVersion: 1, origin: 'm1_local_automated_acceptance', testedHead, evaluatorRevision: evolutionEvaluatorRevision(),
        runnerRevision: hash(sourceFiles.map(f => [f, fs.readFileSync(new URL(f, import.meta.url), 'utf8')])),
        policy: 'm1-advisory-tokens-2026-10-08', apiHardLimits: { rollingDayRequests: 2000, requestsPerMinute: 20 }, tokensAdvisory: true, historicalRecords: 'unavailable', historicalCarry: snapshot.historicalCarry,
        initialAccounting: { requests: snapshot.requests, tokens: snapshot.tokens }, limits, entries: [], humanPreference: 'not_observed', productionPromotion: 'original_gate_unchanged', temporarySecondary };
    store('summary.json', summary);
    if (cycle) summary.mode = development ? cycleBaseline ? 'cycle_baseline_development' : 'cycle_optimized_development' : 'cycle_frozen_acceptance';
    if (cycleBaselineProject) {
        const previous = path.join(directory, 'm1-reports', cycleBaselineProject);
        const source = JSON.parse(fs.readFileSync(path.join(previous, 'summary.json'), 'utf8'));
        const rp = source.entries.find(e => e.kind === 'rp-skill'), project = source.entries.find(e => e.kind === 'project-prompt');
        if (source.mode !== 'cycle_baseline_development' || rp?.status !== 'development_observed' || rp.independent.length !== 3
            || project?.reason !== 'generation_provider_timeout' || project.acceptance) throw new Error('cycle_continuation_invalid');
        summary.continuationSource = { summaryHash: hash(source), testedHead: source.testedHead, reason: project.reason };
        summary.entries.push({ ...rp, performedThisRun: false, sourceTestedHead: source.testedHead });
        for (const file of ['rp-skill-job.json', 'rp-skill-independent.json', 'development-feedback.json']) fs.copyFileSync(path.join(previous, file), path.join(output, file));
    }
    let cycleSource;
    if (cycleOptimize || cycleAcceptance) {
        const previous = path.join(directory, 'm1-reports', cycleOptimize || cycleAcceptance);
        const source = JSON.parse(fs.readFileSync(path.join(previous, 'summary.json'), 'utf8'));
        const diagnosedPartial = cycleOptimize && source.continuationSource && source.entries.find(e => e.kind === 'rp-skill')?.independent.length === 3
            && source.entries.find(e => e.kind === 'project-prompt')?.reason === 'generation_execution_failed'
            && ['project_authoring_d1', 'project_conflict_d1'].every(id => {
                const observed = JSON.parse(fs.readFileSync(path.join(previous, 'project-prompt-pair-' + id + '-1.json'), 'utf8'));
                return observed.pair.case.split === 'development' && observed.pair.case.caseId === id;
            });
        if (source.mode !== (cycleOptimize ? 'cycle_baseline_development' : 'cycle_optimized_development') || source.entries.length !== 2
            || source.entries.some(e => !e.candidateValueHash || !diagnosedPartial && (e.independent.length !== 3 || e.independent.some(o => !o.chargeId || !o.preference)))) throw new Error('cycle_development_incomplete');
        summary.baselineDevelopmentPartial = Boolean(diagnosedPartial);
        cycleSource = { previous, source };
        summary.developmentSource = { summaryHash: hash(source), testedHead: source.testedHead };
    }
    let gradeSource;
    if (gradeName) {
        const previous = path.join(directory, 'm1-reports', gradeName);
        const priorSummary = JSON.parse(fs.readFileSync(path.join(previous, 'summary.json'), 'utf8'));
        if (priorSummary.evaluatorRevision !== summary.evaluatorRevision) throw new Error('grading_evaluator_changed');
        const results = {};
        for (const kind of ['rp-skill', 'project-prompt']) {
            const result = JSON.parse(fs.readFileSync(path.join(previous, kind + '-job.json'), 'utf8'));
            if (result.candidate?.report?.pairs?.length !== 9) throw new Error('grading_comparison_incomplete');
            results[kind] = result;
        }
        gradeSource = { previous, results };
        summary.mode = 'independent_grading_only';
        summary.comparisonSource = { testedHead: priorSummary.testedHead, runnerRevision: priorSummary.runnerRevision, summaryHash: hash(priorSummary),
            reportHashes: Object.fromEntries(Object.entries(results).map(([kind, r]) => [kind, hash(r.candidate.report)])) };
    }
    let resumed;
    if (resumeName) {
        const previous = path.join(directory, 'm1-reports', resumeName);
        const priorSummary = JSON.parse(fs.readFileSync(path.join(previous, 'summary.json'), 'utf8'));
        const priorEntry = priorSummary.entries.find(e => e.kind === 'project-prompt');
        const result = JSON.parse(fs.readFileSync(path.join(previous, 'project-prompt-job.json'), 'utf8'));
        if (priorSummary.evaluatorRevision !== summary.evaluatorRevision || priorEntry?.reason !== 'native_generation_route_ambiguous'
            || !priorEntry.lifecycle?.current || result.candidate.report.pairs.length !== 9) throw new Error('resume_comparison_unavailable');
        resumed = { result, previous, lifecycle: priorEntry.lifecycle };
        summary.comparisonSource = { testedHead: priorSummary.testedHead, runnerRevision: priorSummary.runnerRevision, summaryHash: hash(priorSummary), reportHash: hash(result.candidate.report) };
    }
    dispatcher = new Agent({ connectTimeout: 30000, headersTimeout: 300000, bodyTimeout: 300000 });
    const transportCheckpoint = path.join(directory, 'm1-transport-state.json');
    const transportEpochs = fs.existsSync(path.join(directory, 'm1-transport-epochs.json')) ? read('m1-transport-epochs.json') : {};
    summary.transportEpochs = transportEpochs;
    const retryPolicy = new M1RetryPolicy({ snapshot: fs.existsSync(transportCheckpoint) ? read('m1-transport-state.json') : {},
        onChange: state => writeFileAtomic.sync(transportCheckpoint, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }) });
    const transport = async (url, options) => {
        const model = JSON.parse(options.body).model, key = m1TransportKey(url, model, transportEpochs);
        if (!diagnoseOnly) retryPolicy.assertAvailable(key);
        try {
            // Three funded attempts plus backoff must fit inside the original
            // Route deadline. This signal also bounds response body consumption.
            const connection = connections.find(c => c.config.model === model);
            const attemptTimeout = Math.min(80000, Math.max(1000, Math.floor(connection.config.timeoutMs / 4)));
            const response = await httpFetch(url, { ...options, dispatcher, signal: AbortSignal.any([options.signal, overall.signal, AbortSignal.timeout(attemptTimeout)]) });
            if (!response.ok) {
                const code = 'm1_http_' + response.status;
                if (diagnoseOnly || temporarySecondary) {
                    let body;
                    try { body = await response.text(); } catch { body = 'error_body_unavailable'; }
                    store('secondary-http-error.json', { status: response.status, body, model, requestId: response.headers.get('x-request-id'), server: response.headers.get('server') });
                } else await response.body?.cancel();
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
    // Reuse the already paid RP proposal; do not learn from promotion outputs.
    let frozenRp;
    const reportRoot = path.join(directory, 'm1-reports');
    for (const name of cycle ? [] : fs.readdirSync(reportRoot).filter(n => n.startsWith('run-')).sort().reverse()) {
        const prior = path.join(reportRoot, name), jobFile = path.join(prior, 'rp-skill-job.json');
        if (!fs.existsSync(jobFile)) continue;
        const source = JSON.parse(fs.readFileSync(path.join(prior, 'summary.json'), 'utf8'));
        if (source.evaluatorRevision !== evolutionEvaluatorRevision()) continue;
        const original = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
        if (!original.candidate?.diff?.after) continue;
        for (const responseFile of fs.readdirSync(prior).filter(n => n.startsWith('rp-skill-response-'))) {
            const paid = JSON.parse(fs.readFileSync(path.join(prior, responseFile), 'utf8'));
            if (paid.charge.kind !== 'extraction' || !snapshot.entries[paid.charge.id] || snapshot.entries[paid.charge.id].tokens !== paid.charge.tokens) continue;
            const proposal = parseEvaluationJson(paid.raw.choices[0].message.content);
            if (hash(proposal.value) !== hash(original.candidate.diff.after) || proposal.rationale !== original.candidate.rationale) throw new Error('frozen_proposal_changed');
            frozenRp = { proposal, base: original.candidate.diff.before, target: original.job.target,
                source: { origin: 'previous_paid_proposal', testedHead: source.testedHead, jobId: original.job.id, chargeId: paid.charge.id,
                    valueHash: hash(proposal.value), baseHash: hash(original.candidate.diff.before) } };
            break;
        }
        if (frozenRp) break;
    }
    const { evolutionFixture, runEvolution, restoreEvolutionFixture } = await import('./evolution-fixture.js');
    const { makeTempFsEngineHarness } = await import('../storage/harness/contract-harness.js');
    const { createLiveBridge } = await import('./live-bridge.js');
    const { createFrozenEvaluationBridge } = await import('../../src/native/agent-intelligence/evaluation/worker-bridge.js');
    const { NativeGenerationHost } = await import('../../src/native/adapters/generation-host.js');
    const { runRp } = await import('../../src/native/agent-intelligence/evaluation/adapters.js');
    const { selectCases, loadFixture, canonical } = await import('../../src/native/agent-intelligence/evaluation/cases.js');
    for (const [index, kind] of ['rp-skill', 'project-prompt'].entries()) {
        if (cycleBaselineProject && index === 0) continue;
        if (diagnoseOnly && index !== 0) continue;
        if (resumed && index === 0) continue;
        const entry = { kind, status: 'preparing', independent: [], lifecycle: null };
        summary.entries.push(entry); store('summary.json', summary);
        try {
            const primary = connections[0];
            const f = gradeSource ? await restoreEvolutionFixture(makeTempFsEngineHarness, path.join(gradeSource.previous, kind + '-private-fixture'), gradeSource.results[kind],
                { fetchImpl: transport, repositoryClass: M1AdvisoryRepository, requireCurrentPublication: false }) : resumed ? await restoreEvolutionFixture(makeTempFsEngineHarness, path.join(resumed.previous, 'project-prompt-private-fixture'), resumed.result,
                { fetchImpl: transport, repositoryClass: M1AdvisoryRepository }) : await evolutionFixture(makeTempFsEngineHarness, kind, { realEvaluator: true, fetchImpl: transport,
                connectionConfig: primary.config, policyMode: 'review', confirmedPrice: null, repositoryClass: M1AdvisoryRepository }); scratch = f.h;
            if (cycleBaseline || cycleAcceptance) {
                const previous = cycleBaseline ? path.join(reportRoot, 'run-1791467157643-006f217f') : cycleSource.previous;
                // Read only immutable proposals here, never old promotion outputs.
                const original = JSON.parse(fs.readFileSync(path.join(previous, kind + '-job.json'), 'utf8'));
                const value = original.candidate.diff.after;
                if (cycleAcceptance && hash(value) !== cycleSource.source.entries.find(e => e.kind === kind).candidateValueHash) throw new Error('cycle_frozen_candidate_changed');
                entry.proposalSource = { reportFileHash: hash(original), valueHash: hash(value), origin: cycleBaseline ? 'historical_candidate' : 'frozen_development_candidate' };
                f.evaluator.extract = async (_handle, _job, _config, signal, fresh, input) => {
                    await fresh(); signal.throwIfAborted();
                    if (hash(input.base) !== hash(original.candidate.diff.before)) throw new Error('cycle_frozen_base_changed');
                    return { value, rationale: original.candidate.rationale };
                };
            }
            if (cycleOptimize) {
                const notes = JSON.parse(fs.readFileSync(path.join(cycleSource.previous, 'development-feedback.json'), 'utf8'));
                const note = notes[kind];
                if (!note?.rationale || !note.note) throw new Error('cycle_feedback_required');
                const before = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
                await f.service.experience.correct(f.h.handle, { scope: f.scope, subject: f.subject, id: before.feedback[0].id, expectedSequence: before.sequence,
                    feedback: { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: note.note } });
                const batch = await f.service.experience.reflection(f.h.handle, { scope: f.scope, subject: f.subject });
                const current = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
                await f.service.experience.diagnose(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: current.sequence, batchHash: batch.batchHash,
                    rationale: note.rationale, conditions: note.conditions, counterexamples: note.counterexamples, direction: kind === 'rp-skill' ? 'skill' : 'prompt' });
                // Feedback correction intentionally pauses its original policy.
                // Revalidate the same private target through the original API.
                const policy = await f.repository.get(f.h.handle, f.scope, f.subject);
                await f.service.configure(f.h.handle, { scope: f.scope, subject: f.subject, target: f.target, mode: 'review', routeId: f.route.runtimeRouteId,
                    price: null, expectedSequence: policy.sequence });
                entry.feedbackHash = hash(note);
            }
            if (!gradeSource && kind === 'rp-skill' && frozenRp) {
                if (hash(f.target) !== hash(frozenRp.target)) throw new Error('frozen_proposal_target_changed');
                entry.proposalSource = frozenRp.source;
                f.evaluator.extract = async (_handle, _job, _config, signal, fresh, input) => {
                    await fresh(); signal.throwIfAborted();
                    if (hash(input.base) !== hash(frozenRp.base) || input.diagnosis !== null
                        || hash(input.feedback) !== hash([{ kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Preserve user decisions and authority.' }])) throw new Error('frozen_proposal_input_changed');
                    return structuredClone(frozenRp.proposal);
                };
            }
            const owner = await f.repository.owner(f.h.handle);
            await f.service.budget(f.h.handle, { expectedSequence: owner.sequence, limits: { maxRequests: 260, maxTokens: 699536, minIntervalMs: 3150 } });
            const secondary = connections[1];
            if (!resumed) await createLiveBridge({ engine: f.h.engine, handle: f.h.handle, config: secondary.config,
                secretPort: { resolveSecret: async () => 'seed_only' }, fetchImpl: async () => { throw new Error('seed_send_forbidden'); } });
            const routes = await f.host.persistence.listRuntimeRoutes(f.h.handle);
            const secondaryRoutes = [];
            for (const route of routes.filter(r => r.role === 'role.orchestrator')) {
                const model = await f.host.persistence.getModelProfile(f.h.handle, route.modelProfileRef.modelProfileId);
                if (model.remoteModelId === secondary.config.model) secondaryRoutes.push(route);
            }
            if (secondaryRoutes.length !== 1) throw new Error('secondary_route_identity_ambiguous');
            const secondaryRoute = secondaryRoutes[0];
            const extendedGrader = (gradeSource || cycle) && secondary.config.maxOutputTokens > 1024;
            const secondaryConfig = extendedGrader ? await m1GraderConfiguration(f.host, f.h.handle, secondaryRoute.runtimeRouteId)
                : await f.evaluator.configuration(f.h.handle, secondaryRoute.runtimeRouteId);
            entry.secondaryConfigurationHash = hash(secondaryConfig);
            entry.secondaryOutputTokens = secondaryConfig.generation.output.maxTokens;
            const secrets = createM1SecretPort(primary, secondary);
            f.host.secretPort = secrets.port;
            const reserve = f.evaluator.repository.reserve.bind(f.evaluator.repository), settle = f.evaluator.repository.settle.bind(f.evaluator.repository);
            let packet = null;
            f.evaluator.repository.reserve = async (handle, attempt) => {
                if (!packet || attempt.upperBound !== packet.inputTokens + packet.outputTokens) throw new Error('send_reservation_mismatch');
                quota.assertAvailable();
                if (budget.reserve({ requestId: attempt.id, trialId: attempt.trialId, inputTokens: packet.inputTokens,
                    reservedOutput: packet.outputTokens, kind: packet.retryAttempt ? 'retry' : attempt.kind === 'judge' ? 'grader' : 'model' }).status !== 'passed') throw new Error('recovered_budget_blocked');
                return reserve(handle, attempt);
            };
            f.evaluator.repository.settle = async (handle, id, tokens, metadata) => {
                try { return await settle(handle, id, tokens, metadata); } finally { if (budget.entries.has(id) && !budget.entries.get(id).settled) budget.settle(id, tokens); }
            };
            const send = f.evaluator.send.bind(f.evaluator);
            f.evaluator.send = async (handle, job, config, payload, signal, fresh) => {
                const transportKey = m1TransportKey(payload.rendered.endpoint, payload.rendered.body.model, transportEpochs);
                const fundedAttempt = async retryAttempt => {
                    if (overall.signal.aborted) throw new Error('m1_duration_blocked');
                    if (job.id.endsWith(':activation') && [...budget.entries.values()].filter(e => e.trialId === payload.trialId).length >= (kind === 'rp-skill' ? 5 : 1)) warning('activation_send_suggestion_exceeded_' + job.id, {});
                    packet = { ...payload, retryAttempt };
                    const restoreSecret = secrets.select(config.model.remoteModelId);
                    try {
                        const result = extendedGrader && job.id.endsWith(':independent') && config.model.remoteModelId === secondary.config.model
                            ? await sendM1Grader(f.evaluator, handle, job, config, payload, signal, fresh) : await send(handle, job, config, payload, signal, fresh);
                        store(kind + '-response-' + result.charge.id + '.json', result);
                        if (!diagnoseOnly && !completeM1Response(result.raw, payload)) {
                            retryPolicy.incomplete(transportKey);
                            console.log(JSON.stringify({ kind, incompleteResponse: true, retryAttempt }));
                            throw Object.assign(new Error('m1_response_incomplete'), { code: 'm1_response_incomplete' });
                        }
                        return result;
                    }
                    catch (error) {
                        // A successful header is not a complete response. Count
                        // body transport/JSON failure once, preserving its charge.
                        if (m1BodyFailure(error) && !signal.aborted && !overall.signal.aborted && retryPolicy.state(transportKey).recent.at(-1) === false) {
                            retryPolicy.incomplete(transportKey);
                            throw Object.assign(new Error('m1_response_incomplete'), { code: 'm1_response_incomplete' });
                        }
                        throw error;
                    }
                    finally { restoreSecret(); packet = null;
                        const s = budget.snapshot(); console.log(JSON.stringify({ kind, retryAttempt, accountingRequests: s.requests, accountingTokens: s.tokens, freshSends: s.requests - 252 })); }
                };
                return diagnoseOnly ? fundedAttempt(0) : retryPolicy.send(transportKey, fundedAttempt, AbortSignal.any([signal, overall.signal]));
            };
            const compare = f.evaluator.compare.bind(f.evaluator);
            f.evaluator.compare = (handle, job, configs, settings, signal, fresh) => compare(handle, job, configs, settings, signal, fresh,
                async pair => { store(kind + '-pair-' + pair.case.caseId + '-' + pair.repetition + '.json', { pair, observedAt: Date.now() }); console.log(JSON.stringify({ kind, case: pair.case.caseId, repetition: pair.repetition, primaryPreference: pair.judge.preference })); },
                async trial => { store(kind + '-trial-' + trial.caseId + '-' + trial.repetition + '-' + trial.arm + '.json', trial); },
                development ? { split: 'development', repetitions: 1 } : { split: 'promotion', repetitions: 3 });
            if (prepareOnly) { entry.status = 'prepared'; entry.targetPin = (await f.repository.get(f.h.handle, f.scope, f.subject)).policy.targetPin; entry.primaryConfigurationHash = hash(await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId)); entry.secondaryConfigurationHash = hash(secondaryConfig); continue; }
            if (diagnoseOnly) {
                summary.mode = 'one_request_secondary_diagnostic';
                const doc = await f.repository.get(f.h.handle, f.scope, f.subject), job = { id: 'm1-secondary-diagnostic-' + randomUUID(), scopeId: doc.scopeId, price: null };
                const bridge = await createFrozenEvaluationBridge(secondaryConfig, async payload => (await f.evaluator.send(f.h.handle, job, secondaryConfig,
                    { ...payload, arm: 'judge' }, overall.signal, async () => {})).raw);
                try {
                    const result = await bridge.rp({ requestId: randomUUID(), trialId: job.id, fixtureHash: hash('one_request_secondary_diagnostic'),
                        messages: [{ role: 'user', content: 'Return JSON only: {"ok":true}' }], tools: [], kind: 'grader' });
                    store('secondary-diagnostic-response.json', result); entry.status = 'diagnostic_response_received';
                } finally { bridge.cleanup(); }
                continue;
            }
            entry.status = 'evaluating'; store('summary.json', summary);
            const result = gradeSource ? gradeSource.results[kind] : resumed ? resumed.result : await runEvolution(f), { job, candidate } = result;
            entry.jobId = job.id; entry.status = job.status;
            store(kind + '-job.json', result);
            if (cycle && candidate) entry.candidateValueHash = hash(candidate.diff.after);
            if (!candidate?.report?.pairs?.length) throw new Error(candidate?.report?.reason || job.reason || 'comparison_unavailable');
            if (gradeSource) {
                const check = automatedAcceptance(candidate.report, [], await f.repository.owner(f.h.handle), job.id, { tokensAdvisory: true });
                if (check.reasons.some(r => ['evaluation_identity_changed', 'independent_cases_incomplete', 'durable_charge_mismatch', 'pair_identity_or_human_changed',
                    'primary_model_observation_unfunded', 'authority_or_execution_incomplete', 'usage_or_durable_charge_missing'].includes(r))) throw new Error('grading_source_evidence_invalid');
            }
            for (const pair of candidate.report.pairs) {
                const flipped = parseInt(hash(['independent', pair.pairHash]).slice(0, 2), 16) % 2 === 1;
                let charge;
                const bridge = await createFrozenEvaluationBridge(secondaryConfig, async payload => {
                    const paid = await f.evaluator.send(f.h.handle, { ...job, id: job.id + ':independent', scopeId: result.doc.scopeId, price: null }, secondaryConfig,
                        { ...payload, arm: 'judge' }, new AbortController().signal, async () => {}); charge = paid.charge; return paid.raw;
                });
                try {
                    const response = await bridge.rp({ requestId: randomUUID(), trialId: job.id + ':independent:' + pair.pairHash, fixtureHash: pair.case.fixtureHash,
                        messages: [{ role: 'system', content: 'Blindly compare the two outputs against the task and dimensions. Return JSON only: {"preference":"left|right|tie|uncertain","deltas":{dimension:integer from -4 to 4},"rationale":"concise public explanation"}. Delta means right minus left. Do not guess missing evidence.' },
                            { role: 'user', content: JSON.stringify({ ...pair.scenario, dimensions: pair.case.behaviorDimensions, left: pair[flipped ? 'candidate' : 'baseline'].output, right: pair[flipped ? 'baseline' : 'candidate'].output }) }], tools: [], kind: 'grader' });
                    entry.independent.push({ origin: 'independent_model', pairHash: pair.pairHash, model: secondary.config.model, primaryModel: primary.config.model,
                        configurationHash: hash(secondaryConfig), chargeId: charge.id, requestHash: charge.requestHash, snapshotHash: charge.snapshotHash,
                        ...parseBlindGrade(response.response.assistantText || response.response.text, pair, flipped) });
                    console.log(JSON.stringify({ kind, independentObservation: entry.independent.length, preference: entry.independent.at(-1).preference }));
                } catch (error) { entry.independent.push({ origin: 'independent_model', pairHash: pair.pairHash, status: 'unavailable', reason: safeReason(error) }); break; }
                finally { bridge.cleanup(); store(kind + '-independent.json', entry.independent); }
            }
            entry.acceptance = automatedAcceptance(candidate.report, entry.independent, await f.repository.owner(f.h.handle), job.id, { tokensAdvisory: true });
            if (development) { entry.status = 'development_observed'; entry.lifecycle = { performedThisRun: false }; continue; }
            if (gradeSource) {
                entry.status = entry.independent.length === 9 && entry.independent.every(o => o.chargeId && o.preference) ? 'independently_graded' : 'independent_grading_incomplete';
                entry.lifecycle = { origin: 'previously_verified_separate_lifecycle', performedThisRun: false }; continue;
            }
            // Explicit delegated review is confined to this private fixture. No
            // human labels or automatic publication eligibility are invented.
            const published = resumed ? resumed.lifecycle.receipt : await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId,
                expectedReportHash: hash(candidate.report), review: true });
            const doc = await f.repository.get(f.h.handle, f.scope, f.subject), publication = resumed ? f.publication : doc.publications[0];
            entry.lifecycle = { delegatedFixtureReview: true, automaticPromotion: false, receipt: published, current: await f.service.targets.publicationCurrent(f.h.handle, f.scope, f.subject, publication) };
            const nextSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
            const nextConfig = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, nextSettings.projectPromptRef || null);
            const activationMatches = index === 1 ? projectActivationMatches(nextConfig, nextSettings, publication, candidate)
                : hash(nextConfig) === candidate.report.configurations.candidate && hash(nextSettings) === candidate.report.settings.candidate;
            if (!activationMatches) throw new Error('activation_configuration_changed');
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
                    try {
                        const paid = await f.evaluator.send(f.h.handle, activationJob, nextConfig, prepared, boundary.signal, current);
                        return { headers: { get: () => 'application/json' }, json: async () => paid.raw };
                    } catch (error) { store(kind + '-activation-error.json', { name: error.name, message: error.message, stack: error.stack }); throw error; }
                } };
                const host = new NativeGenerationHost({ ...f.host, providers: { ...f.host.providers, 'provider.openai-compatible': provider } });
                const project = await f.host.studio.getProject(f.h.handle, f.subject);
                const next = await host.execute(f.h.handle, { role: 'studio', routeRef: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId }, projectId: f.subject, revision: project.revision.revision,
                    requestId: randomUUID(), messages: [{ role: 'user', content: 'Briefly acknowledge that this Project is ready for review. Do not perform any operation.' }], tools: [] });
                entry.lifecycle.nextSnapshotHash = hash(next.snapshot);
                entry.lifecycle.nextExactProgram = next.snapshot.promptProgramRef;
                entry.lifecycle.nextConfigurationMatchesCandidate = activationMatches;
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
