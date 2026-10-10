// Delegated private engineering acceptance. Production promotion stays gated.
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { hash, canonical, selectCases, loadFixture, CASE_SET_REVISION, PILOT_CASE_SET_REVISION, isPilotCaseSetRevision } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { evolutionEvaluatorRevision, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { runRp } from '../../src/native/agent-intelligence/evaluation/adapters.js';
import { comparisonCalibrationReady, gradeF3Report, f3JudgeLabels, pilotDevelopmentReadiness } from './m1-f3.js';
import { projectActivationMatches } from './m1-resume.js';

const equal = (a, b) => canonical(a) === canonical(b);
const chargeFields = ['id', 'trialId', 'kind', 'requestHash', 'snapshotHash', 'status', 'tokens', 'usage', 'cost'];
const matches = (charge, paid) => paid && chargeFields.every(key => equal(charge[key], paid[key]));

export function pilotPromotionAcceptance(report, independent, owner, jobId) {
    const reasons = [], profileId = report.domain === 'rp' ? 'rp.m1.information' : 'project.m1.related';
    const secondaryRequired = f3JudgeLabels(report.judgeMode).length === 2;
    const required = selectCases({ purpose: 'evaluation', split: 'promotion', profileId, caseSetRevision: report.caseSetRevision });
    if (report.origin !== 'm1_f3_promotion' || report.evaluatorRevision !== evolutionEvaluatorRevision()
        || !isPilotCaseSetRevision(report.caseSetRevision) || !equal(report.quality, qualityEnvelope(report.domain, required, 'promotion'))
        || !comparisonCalibrationReady(report, owner)) reasons.push('promotion_identity_or_calibration_changed');
    if (report.pairs.length !== 9 || required.some(c => [1, 2, 3].some(repetition =>
        report.pairs.filter(p => equal(p.case, c) && p.repetition === repetition).length !== 1))) reasons.push('independent_cases_incomplete');
    const ids = new Set();
    for (const charge of report.charges) {
        if (ids.has(charge.id) || !matches(charge, owner.attempts.find(a => a.id === charge.id && a.jobId === jobId))) reasons.push('durable_charge_mismatch');
        ids.add(charge.id);
    }
    let wins = 0;
    const trialIds = new Set();
    for (const pair of report.pairs) {
        const { pairHash, ...identity } = pair;
        if (pair.human !== null || pairHash !== hash(identity) || hash(pair.scenario.input) !== pair.case.inputHash) reasons.push('pair_or_source_changed');
        const observations = independent.filter(o => o.pairHash === pairHash), second = observations[0];
        if (secondaryRequired && (observations.length !== 1 || second?.origin !== 'independent_model' || second.model === second.primaryModel
            || !owner.attempts.some(a => a.id === second.chargeId && a.jobId === jobId + ':independent' && a.kind === 'judge'
                && ['reported', 'unknown'].includes(a.status) && a.requestHash === second.requestHash && a.snapshotHash === second.snapshotHash))) reasons.push('independent_model_observation_missing');
        if (!['candidate', 'tie'].includes(pair.judge?.preference) || secondaryRequired && second?.preference !== pair.judge?.preference) reasons.push('model_regression_uncertainty_or_disagreement');
        if (pair.judge?.preference === 'candidate' && (!secondaryRequired || second?.preference === 'candidate')) wins++;
        if (!pair.judge?.chargeIds?.length || pair.judge.chargeIds.some(id => !report.charges.some(c => c.id === id && c.kind === 'judge'))) reasons.push('primary_model_observation_unfunded');
        for (const dimension of pair.case.behaviorDimensions) if (!Number.isInteger(pair.judge?.deltas?.[dimension]) || pair.judge.deltas[dimension] < 0
            || secondaryRequired && (!Number.isInteger(second?.deltas?.[dimension]) || second.deltas[dimension] < 0)) reasons.push('behavior_regression_or_ungraded');
        for (const arm of ['baseline', 'candidate']) {
            const trial = pair[arm]; trialIds.add(trial.trialId);
            if (trial.error || !trial.output || !trial.requestHashes.length || trial.configurationHash !== report.configurations[arm]
                || trial.settingsHash !== report.settings[arm] || [...pair.case.expectedInvariants, 'isolation', 'target_consumed'].some(k => trial.checks[k] !== true)) reasons.push('authority_or_execution_incomplete');
            if (!trial.charges?.length || trial.charges.some(c => c.kind !== arm || c.trialId !== trial.trialId
                || !report.charges.some(p => equal(p, c)) || !['reported', 'unknown'].includes(c.status))) reasons.push('trial_usage_missing');
        }
    }
    if (trialIds.size !== 18) reasons.push('trial_identity_repeated');
    if (owner.attempts.some(a => a.jobId === jobId && trialIds.has(a.trialId) && (!ids.has(a.id) || a.status === 'reserved'))) reasons.push('trial_send_accounting_incomplete');
    if (secondaryRequired && independent.length !== 9 || !secondaryRequired && independent.length !== 0) reasons.push('independent_model_observation_missing');
    if (wins < 6) reasons.push('improvement_threshold_not_met');
    return { accepted: !reasons.length, reasons: [...new Set(reasons)], wins, judgeMode: report.judgeMode || 'dual', tokensAdvisory: true,
        humanPreference: 'not_observed', currencyCost: 'unavailable', productionPromotion: 'original_gate_unchanged' };
}

export async function publishConsumeRollback({ f, kind, job, candidate, report, entry, store, signal, fresh }) {
    // Exact configuration/target checks precede the original delegated review.
    for (const arm of ['baseline', 'candidate']) {
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target, arm === 'candidate' ? candidate.candidateId : undefined);
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, settings.projectPromptRef || null);
        if (hash(config) !== report.configurations[arm] || hash(settings) !== report.settings[arm]) throw new Error('f3_publication_configuration_changed');
    }
    await fresh();
    const storedCandidate = (await f.repository.get(f.h.handle, f.scope, f.subject)).jobs.find(j => j.id === job.id)?.candidates.find(c => c.candidateId === candidate.candidateId);
    if (!storedCandidate || hash(readF3StoredReport(storedCandidate.report)) !== hash(report)) throw new Error('f3_publication_report_changed');
    const receipt = await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id,
        candidateId: candidate.candidateId, expectedReportHash: hash(storedCandidate.report), review: true });
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const publication = doc.publications.find(p => p.jobId === job.id && p.candidateId === candidate.candidateId);
    entry.lifecycle = { delegatedFixtureReview: true, automaticPromotion: false, receipt,
        reportHash: hash(report), storedReportHash: hash(storedCandidate.report),
        current: await f.service.targets.publicationCurrent(f.h.handle, f.scope, f.subject, publication) };
    try {
        const nextSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const nextConfig = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, nextSettings.projectPromptRef || null);
        const selected = { ...candidate, report };
        const configMatches = kind === 'project-prompt' ? projectActivationMatches(nextConfig, nextSettings, publication, selected)
            : hash(nextConfig) === report.configurations.candidate && hash(nextSettings) === report.settings.candidate;
        if (!configMatches) throw new Error('f3_activation_configuration_changed');
        const activationJob = { ...job, id: job.id + ':activation', price: null };
        const current = async () => {
            signal.throwIfAborted();
            if (!await f.service.targets.publicationCurrent(f.h.handle, f.scope, f.subject, publication)) throw new Error('f3_activation_binding_changed');
        };
        if (kind === 'project-prompt') {
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
            const next = await host.execute(f.h.handle, { role: 'studio', routeRef: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId },
                projectId: f.subject, revision: project.revision.revision, requestId: randomUUID(), messages: [{ role: 'user',
                    content: 'Briefly acknowledge readiness for human review. Do not perform any operation.' }], tools: [] }, signal);
            entry.lifecycle.nextSnapshotHash = hash(next.snapshot);
            entry.lifecycle.nextExactProgram = next.snapshot.promptProgramRef;
            entry.lifecycle.activation = (await f.repository.get(f.h.handle, f.scope, f.subject)).publications.find(p => p.id === publication.id).activation;
            entry.lifecycle.nextRunConsumed = Boolean(entry.lifecycle.activation && configMatches);
        } else {
            const entryCase = selectCases({ purpose: 'evaluation', split: 'development', profileId: 'rp.m1.information',
                caseSetRevision: report.caseSetRevision === CASE_SET_REVISION ? PILOT_CASE_SET_REVISION : report.caseSetRevision })[0];
            const bridge = await createFrozenEvaluationBridge(nextConfig, async payload => (await f.evaluator.send(f.h.handle, activationJob, nextConfig,
                { ...payload, arm: 'candidate' }, signal, current)).raw);
            const capture = { trialId: activationJob.id, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
                prompts: [], evidence: [], checks: {}, completeness: [], toolCalls: 0, repairCount: 0,
                observe(name, observed, expected) { this.checks[name] = equal(observed, expected); this.evidence.push({ name, observed, expected }); } };
            const oldFetch = globalThis.fetch, oldAtria = globalThis.Atria;
            globalThis.fetch = async () => { throw new Error('f3_activation_unfunded_network_denied'); };
            try { await runRp(entryCase, loadFixture(entryCase, { purpose: 'evaluation' }), capture, { bridge, settings: { roundLimit: 6, ...nextSettings }, beforeSend: () => {} }); }
            finally { bridge.cleanup(); globalThis.fetch = oldFetch; globalThis.Atria = oldAtria; }
            entry.lifecycle.nextRunConsumed = capture.artifact?.targetConsumed === true && Object.values(capture.checks).every(Boolean);
            entry.lifecycle.activationOrigin = 'client_observation';
            store(kind + '-f3-next-run.json', capture);
        }
        entry.lifecycle.nextConfigurationMatchesCandidate = configMatches;
    } finally {
        await f.service.rollback(f.h.handle, { scope: f.scope, subject: f.subject, publicationId: publication.id });
        entry.lifecycle.baseRestored = hash(await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target)) === report.settings.baseline;
        store(kind + '-f3-lifecycle.json', entry.lifecycle);
    }
}

export async function finishF3Promotion({ f, kind, job, candidate, primaryConfig, secondaryConfig, baselineSettings, settings, config,
    scope, entry, store, signal, fresh, sealedDirectory, developmentReport }) {
    if (!entry.developmentReadiness?.accepted) throw new Error('f3_development_unqualified');
    const domain = kind === 'rp-skill' ? 'rp' : 'project';
    // Only the original isolated worker opens sealed contents. Extractor is
    // already finished; both arms execute anew, three independent cases x3.
    const report = await f.evaluator.observePairs(f.h.handle, job, { baseline: primaryConfig, candidate: config },
        { baseline: baselineSettings, candidate: settings }, signal, fresh,
        pair => store(kind + '-f3-promotion-pair-' + pair.case.caseId + '-' + pair.repetition + '.json', pair),
        trial => store(kind + '-f3-promotion-trial-' + trial.caseId + '-' + trial.repetition + '-' + trial.arm + '.json', trial),
        { mode: 'sealed_pair_probe', split: 'promotion', repetitions: 3, profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', sealedDirectory, caseSetRevision: developmentReport.caseSetRevision });
    const trialIds = new Set(report.pairs.flatMap(p => [p.baseline.trialId, p.candidate.trialId]));
    // Preserve all actual retry charges, including failed sends with unknown
    // usage; successful worker responses alone are not the complete fee list.
    const attempts = (await f.repository.owner(f.h.handle)).attempts.filter(a => a.jobId === job.id && trialIds.has(a.trialId));
    report.charges = attempts.map(a => Object.fromEntries(chargeFields.map(key => [key, a[key]])));
    for (const pair of report.pairs) for (const arm of ['baseline', 'candidate']) pair[arm].charges = report.charges.filter(c => c.trialId === pair[arm].trialId);
    report.origin = 'm1_f3_promotion'; report.judgeMode = developmentReport.judgeMode || 'dual'; report.gradeProtocolHash = developmentReport.gradeProtocolHash;
    report.comparisonCalibration = developmentReport.comparisonCalibration;
    entry.promotionIndependent = await gradeF3Report({ f, kind, report, primaryConfig, secondaryConfig, scope, entry, paidJob: job,
        fresh, signal, store, phase: 'promotion' });
    entry.acceptance = pilotPromotionAcceptance(report, entry.promotionIndependent, await f.repository.owner(f.h.handle), job.id);
    store(kind + '-f3-promotion-report.json', report);
    if (!entry.acceptance.accepted) {
        await recordRejectedF3Promotion({ f, kind, job, report, entry, store });
        return;
    }
    await f.repository.mutate(f.h.handle, f.scope, f.subject, doc => {
        const saved = doc.jobs.find(j => j.id === job.id);
        saved.status = 'awaiting_review'; saved.candidates[0].report = f3ReportForStorage(report); saved.candidates[0].decision = promotionDecision(report);
    });
    if (entry.acceptance.accepted) {
        await publishConsumeRollback({ f, kind, job, candidate, report, entry, store, signal, fresh });
        entry.status = 'f3_promotion_observed';
    } else entry.status = 'f3_promotion_unqualified';
    const final = await f.repository.get(f.h.handle, f.scope, f.subject), finalJob = final.jobs.find(j => j.id === job.id);
    store(kind + '-job.json', { doc: final, job: finalJob, candidate: finalJob.candidates[0] });
}

// Private engineering reports can contain repeated complete native histories.
// Keep every byte/observation and bind the delegated review to the native stored
// hash plus the decoded report hash. Production capacity and auto gates remain.
export function f3ReportForStorage(report) {
    const bytes = Buffer.from(JSON.stringify(report));
    if (bytes.length <= 1024 * 1024) return report;
    if (!['m1_f3_promotion', 'm1_f3_development'].includes(report.origin) || bytes.length > 128 * 1024 * 1024) throw new Error('f3_report_archive_changed');
    const stored = { origin: 'm1_f3_lossless_archive', schemaVersion: 1, encoding: 'gzip-base64',
        reportHash: hash(report), decodedBytes: bytes.length, payload: gzipSync(bytes).toString('base64') };
    if (hash(readF3StoredReport(stored)) !== hash(report)) throw new Error('f3_report_archive_changed');
    return stored;
}
export function readF3StoredReport(stored) {
    if (stored?.origin !== 'm1_f3_lossless_archive') return stored;
    if (stored.schemaVersion !== 1 || stored.encoding !== 'gzip-base64' || !Number.isSafeInteger(stored.decodedBytes)
        || stored.decodedBytes <= 1024 * 1024 || stored.decodedBytes > 128 * 1024 * 1024) throw new Error('f3_report_archive_changed');
    const bytes = gunzipSync(Buffer.from(stored.payload, 'base64'), { maxOutputLength: stored.decodedBytes });
    const report = JSON.parse(bytes);
    if (bytes.length !== stored.decodedBytes || hash(report) !== stored.reportHash) throw new Error('f3_report_archive_changed');
    return report;
}

export async function recordRejectedF3Promotion({ f, kind, job, report, entry, store }) {
    if (entry.acceptance?.accepted !== false) throw new Error('f3_rejection_unestablished');
    // Raw pairs, grades and the full report are already durable private files.
    // An ineligible batch has no review/publication consumer. Keep the existing
    // development record and fee ledger rather than embedding another large
    // authority transcript into the bounded production scope journal.
    const reportHash = hash(report);
    store(kind + '-f3-promotion-report.json', report);
    await f.repository.mutate(f.h.handle, f.scope, f.subject, doc => {
        const saved = doc.jobs.find(j => j.id === job.id);
        if (!saved || doc.publications.some(p => p.jobId === job.id)) throw new Error('f3_rejection_binding_changed');
        saved.status = 'failed'; saved.reason = 'm1_promotion_unqualified:' + reportHash;
        saved.candidates[0].decision = { eligible: false, reasons: [...entry.acceptance.reasons] };
    });
    entry.status = 'f3_promotion_unqualified'; entry.rejectedReportHash = reportHash;
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject), saved = doc.jobs.find(j => j.id === job.id);
    store(kind + '-job.json', { doc, job: saved, candidate: saved.candidates[0], rejectedReportHash: reportHash });
}

// An interrupted, ungraded batch is retained as history. Restart one complete
// nine-pair batch with a new job identity and the exact already frozen candidate;
// never regenerate the proposal or select favorable partial slots.
export async function continueF3Promotion({ f, kind, result, source, scope, entry, store, signal, ledger, sealedDirectory, primaryConfig }) {
    const candidate = result.candidate, report = readF3StoredReport(candidate.report);
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    if (hash(doc) !== hash(result.doc) || report.judgeMode !== 'primary_only' || scope.judgeMode !== 'primary_only'
        || report.evaluatorRevision !== evolutionEvaluatorRevision() || hash(candidate.diff.after) !== scope.frozenCandidateHash
        || hash(await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target)) !== result.job.targetPin) throw new Error('f3_frozen_continuation_changed');
    const checked = await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId);
    if (!equal(checked.base, candidate.base) || !equal(checked.desired, candidate.desired)) throw new Error('f3_frozen_continuation_changed');
    entry.judgeMode = 'primary_only'; entry.candidateValueHash = hash(candidate.diff.after);
    entry.developmentReadiness = pilotDevelopmentReadiness(report, [], await f.repository.owner(f.h.handle), result.job.id, source.report, ledger());
    if (!entry.developmentReadiness.accepted) throw new Error('f3_development_unqualified');
    const baselineSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId);
    const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, settings.projectPromptRef || null);
    if (hash(primaryConfig) !== report.configurations.baseline || hash(config) !== report.configurations.candidate
        || hash(baselineSettings) !== report.settings.baseline || hash(settings) !== report.settings.candidate) throw new Error('f3_continuation_configuration_changed');
    const job = { ...result.job, id: 'm1-f3-promotion-' + randomUUID(), status: 'evaluating', createdAt: Date.now(),
        candidates: [structuredClone(candidate)], operationId: null };
    await f.repository.mutate(f.h.handle, f.scope, f.subject, saved => { saved.jobs.push(job); });
    entry.jobId = job.id; entry.continuation = { originalJobId: result.job.id, candidateHash: hash(candidate),
        developmentReportHash: hash(report), storedDevelopmentReportHash: hash(candidate.report),
        partialBatch: scope.separatePromotionJob ? 'no_partial_batch; separate_development_and_promotion' : 'retained_ungraded_not_selected' };
    const paidJob = { ...job, scopeId: doc.scopeId, domain: report.domain, price: null };
    const fresh = async () => {
        signal.throwIfAborted(); await f.service._fresh(f.h.handle, f.scope, f.subject, job.id);
        if (hash(await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target)) !== job.targetPin) throw new Error('f3_base_changed');
    };
    await finishF3Promotion({ f, kind, job: paidJob, candidate, primaryConfig, secondaryConfig: null, baselineSettings, settings, config,
        scope, entry, store, signal, fresh, sealedDirectory, developmentReport: report });
}
