import { fork } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { GenerationService } from '../model-prompt-runtime/generation-service.js';
import { PromptCompiler } from '../model-prompt-runtime/prompt-compiler.js';
import { observedGenerationUsage } from '../adapters/generation-usage.js';
import { CASE_SET_REVISION, PILOT_CASE_SET_REVISION, selectCases, publicCaseScenario } from './evaluation/cases.js';
import { parseEvaluationJson, applyEvolutionProposal } from './evaluation/json.js';
import { EVOLUTION_RULE, evolutionFields as fields, evolutionHash as hash, evolutionInteger as integer, evolutionText as text, sameEvolutionValue as same } from './evolution-repository.js';
import { createNativeId } from '../identity.js';
import { qualityEnvelope, validateQualityReport, qualityProfile, requirePilotSources } from './evaluation/quality.js';

export function evolutionEvaluatorRevision() {
    return hash(['evolution-evaluator.js', 'evaluation/worker.js', 'evaluation/sealed-sources.js', 'evaluation/json.js', 'evaluation/worker-bridge.js', 'evaluation/adapters.js', 'evaluation/cases.js', 'evaluation/store.js',
        'evaluation/libraries.js', 'evaluation/loader.js', 'evaluation/quality.js', 'evaluation/pilot-sources.js', 'evaluation/pilot-renewal-sources.js', 'evaluation/pilot-renewal-correction-sources.js', 'evaluation/pilot-continuation-sources.js', 'experience-repository.js', 'experience-service.js', 'evolution-service.js', 'evolution-targets.js', 'evolution-repository.js',
        '../adapters/generation-host.js', '../adapters/http-generation-provider.js', '../project-agent.js',
        '../model-prompt-runtime/prompt-compiler.js', '../model-prompt-runtime/route-resolver.js', '../model-prompt-runtime/generation-service.js',
        '../model-prompt-runtime/contracts.js', '../model-prompt-runtime/resources.js', '../../skills/repository.js', '../../skills/versions.js',
        '../../../public/scripts/agents/orchestrator/director-runtime.js', '../../../public/scripts/agents/orchestrator/skill-resolution.js',
        '../../../public/scripts/message-takeover.js', '../../../public/scripts/native/studio-agent.js', '../../../public/shared/skill-invocation.js']
        .map(name => [name, readFileSync(new URL(name, import.meta.url), 'utf8')]));
}
export function assertEvolutionPrice(value) {
    if (value === null) return null;
    fields(value, ['source', 'currency', 'inputPerMillion', 'outputPerMillion', 'confirmedAt']);
    text(value.source, 512); text(value.currency, 8); integer(value.confirmedAt, 1, Number.MAX_SAFE_INTEGER);
    for (const k of ['inputPerMillion', 'outputPerMillion']) if (!Number.isFinite(value[k]) || value[k] < 0 || value[k] > 1000000) throw new TypeError('Invalid confirmed price');
    return structuredClone(value);
}
function usageCost(usage, price) {
    return price && usage?.inputTokens !== undefined && usage?.outputTokens !== undefined
        ? (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1000000 : null;
}
export function promotionDecision(report, { policyFingerprint, targetPin, budgetBreached = false, ledger = null, jobId = null } = {}) {
    const reasons = [];
    if (!report || report.origin !== 'host_evaluator' || ![1, 2].includes(report.schemaVersion) || report.evaluatorRevision !== evolutionEvaluatorRevision()
        || report.caseSetRevision !== CASE_SET_REVISION || !same(report.rule, EVOLUTION_RULE) || report.policyFingerprint !== policyFingerprint
        || report.targetPin !== targetPin) return { eligible: false, reasons: ['evaluation_identity_missing_or_changed'] };
    const entries = selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(c => c.entrance === report.domain);
    if (report.schemaVersion === 2) {
        try {
            validateQualityReport(report);
            if (!same(report.quality, qualityEnvelope(report.domain, entries, 'promotion'))) reasons.push('quality_envelope_changed');
            if (report.quality.cases.some(c => c.provenance.independence !== 'established')) reasons.push('source_unready');
        } catch { reasons.push('quality_ungraded_or_changed'); }
    }
    const required = entries.flatMap(entry => [1, 2, 3].map(r => entry.caseId + ':' + r));
    if (report.pairs.length !== 9 || required.some(id => report.pairs.filter(p => p.case.caseId + ':' + p.repetition === id).length !== 1)) reasons.push('independent_cases_incomplete');
    let wins = 0, baselineTokens = 0, candidateTokens = 0, baselineCost = 0, candidateCost = 0;
    for (const pair of report.pairs) {
        const entry = entries.find(e => same(e, pair.case));
        const { pairHash, human, ...identity } = pair;
        if (!entry || !same(pair.scenario, publicCaseScenario(entry)) || pairHash !== hash({ ...identity, human: null })) { reasons.push('pair_identity_changed'); continue; }
        if (human?.pairHash !== pairHash || !['candidate', 'tie'].includes(human.preference) || pair.judge?.preference !== human.preference) reasons.push('preference_missing_or_disagreement');
        if (human?.preference === 'candidate') wins++;
        for (const name of entry.behaviorDimensions) {
            if (!Number.isInteger(human?.deltas?.[name]) || human.deltas[name] < 0 || !Number.isInteger(pair.judge?.deltas?.[name]) || pair.judge.deltas[name] < 0) reasons.push('behavior_regression_or_ungraded');
        }
        for (const arm of ['baseline', 'candidate']) {
            const trial = pair[arm];
            if (trial.error || !trial.output || !trial.requestHashes.length || [...entry.expectedInvariants, 'isolation', 'target_consumed'].some(k => trial.checks[k] !== true)) reasons.push('authority_or_execution_incomplete');
            if (!trial.charges?.length || trial.charges.some(c => c.status !== 'reported' || c.cost === null)) reasons.push('usage_or_price_unavailable');
            const tokens = trial.charges?.reduce((n, c) => n + c.tokens, 0) || 0, cost = trial.charges?.reduce((n, c) => n + (c.cost || 0), 0) || 0;
            if (arm === 'baseline') { baselineTokens += tokens; baselineCost += cost; } else { candidateTokens += tokens; candidateCost += cost; }
        }
    }
    if (wins < EVOLUTION_RULE.candidateWins) reasons.push('improvement_threshold_not_met');
    if (budgetBreached || candidateTokens > baselineTokens || candidateCost > baselineCost) reasons.push('resource_regression_or_budget_breach');
    if (!report.price || report.charges.some(c => c.status !== 'reported')) reasons.push('unsettled_cost');
    if (ledger) {
        const attempts = ledger.attempts.filter(a => a.jobId === jobId);
        const ids = new Set();
        for (const charge of report.charges) {
            const paid = attempts.find(a => a.id === charge.id);
            if (ids.has(charge.id) || !paid || !['trialId', 'kind', 'requestHash', 'snapshotHash', 'status', 'tokens', 'usage', 'cost'].every(k => same(paid[k], charge[k]))) reasons.push('durable_charge_mismatch');
            ids.add(charge.id);
        }
        if (!attempts.length || attempts.some(a => a.status !== 'reported' || a.cost === null || a.kind !== 'extraction' && !ids.has(a.id))) reasons.push('job_cost_unsettled');
        for (const pair of report.pairs) if (!pair.judge?.chargeIds?.length || pair.judge.chargeIds.some(id => !report.charges.some(c => c.id === id && c.kind === 'judge'))) reasons.push('independent_observation_unfunded');
        for (const pair of report.pairs) for (const arm of ['baseline', 'candidate']) if (pair[arm].charges?.some(c => c.kind !== arm || c.trialId !== pair[arm].trialId || !report.charges.some(p => same(c, p)))) reasons.push('trial_charge_mismatch');
    }
    const controller = ledger?.attempts.filter(a => a.jobId === jobId && ['extraction', 'judge', 'retry'].includes(a.kind)) || [];
    return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], wins, baselineTokens, candidateTokens, baselineCost, candidateCost,
        controllerTokens: controller.reduce((n, a) => n + a.tokens, 0), controllerCost: controller.some(a => a.cost === null) ? null : controller.reduce((n, a) => n + a.cost, 0),
        totalJobTokens: ledger?.attempts.filter(a => a.jobId === jobId).reduce((n, a) => n + a.tokens, 0) ?? null };
}

// Paid work occurs only in the parent Host. The child receives immutable public
// configuration/fixtures, never credentials, production stores or writer ports.
export class EvolutionEvaluator {
    constructor({ host, repository }) { this.host = host; this.repository = repository; }
    async configuration(handle, routeId, projectPromptRef = null) {
        const original = await this.host.persistence.getRuntimeRoute(handle, routeId);
        const route = projectPromptRef ? { ...original, promptProgramRef: projectPromptRef } : original;
        const persistence = Object.create(this.host.persistence);
        persistence.getRuntimeRoute = async (owner, id) => id === routeId ? route : this.host.persistence.getRuntimeRoute(owner, id);
        const resolver = new RouteResolver({ persistence, library: this.host.library, providers: this.host.providers });
        const resolved = await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: routeId }, role: route.role, requirements: ['generation.tools'] });
        if (resolved.connection.providerAdapter !== 'provider.openai-compatible' || resolved.resources.some(r => r.ref.scope !== 'library')
            || resolved.generation.output.maxTokens > 1024 || resolved.generation.streaming.enabled) throw new TypeError('Evaluation requires a supported exact bounded nonstreaming user Route');
        return structuredClone({ route: resolved.route, connection: resolved.connection, model: resolved.model, generation: resolved.generation,
            resources: resolved.resources.map(({ ref, resource }) => ({ ref, resource })) });
    }
    async send(handle, job, config, payload, signal, fresh) {
        await fresh();
        integer(payload.inputTokens, 1, config.model.limits.contextTokens); integer(payload.outputTokens, 1, 1024);
        if (payload.rendered.endpoint !== config.connection.endpoint || payload.rendered.body.model !== config.model.remoteModelId
            || payload.outputTokens > config.generation.output.maxTokens || hash(payload.rendered) !== payload.requestHash) throw new TypeError('Evaluation transport fingerprint changed');
        const id = randomUUID(), kind = payload.arm === 'judge' ? 'judge' : payload.arm === 'extraction' ? 'extraction' : payload.arm;
        if (!['baseline', 'candidate', 'judge', 'extraction'].includes(kind)) throw new TypeError('Unknown evaluation arm');
        const reservation = await this.repository.reserve(handle, { id, scopeId: job.scopeId, jobId: job.id, kind, upperBound: payload.inputTokens + payload.outputTokens,
            trialId: payload.trialId, requestHash: payload.requestHash, snapshotHash: payload.snapshotHash });
        // Reservation is durable before Secret resolution/provider send. A
        // cancellation or response-consumption failure retains its upper bound.
        const provider = this.host.providers[config.connection.providerAdapter];
        let usage = null, raw;
        try {
            const delay = reservation.createdAt - Date.now();
            if (delay > 0) await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, delay);
                const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new Error('evolution_cancelled')); };
                signal.addEventListener('abort', cancel, { once: true });
                if (signal.aborted) cancel();
            });
            await fresh(); if (signal.aborted) throw new Error('evolution_cancelled');
            const secret = await this.host.secretPort.resolveSecret(config.connection.secretRef, { handle });
            const response = await provider.send(payload.rendered, { secret, signal });
            raw = await provider.parseStream(response);
            usage = observedGenerationUsage(raw?.usage, { inputTokens: 'prompt_tokens', outputTokens: 'completion_tokens', totalTokens: 'total_tokens' });
            return { raw, charge: { id, trialId: payload.trialId, kind, requestHash: payload.requestHash, snapshotHash: payload.snapshotHash,
                status: usage?.totalTokens !== undefined ? 'reported' : 'unknown', tokens: usage?.totalTokens ?? payload.inputTokens + payload.outputTokens,
                usage: usage || null, cost: usageCost(usage, job.price) } };
        } finally { await this.repository.settle(handle, id, usage?.totalTokens ?? null, { usage: usage || null, cost: usageCost(usage, job.price) }); }
    }
    async extract(handle, job, config, signal, fresh, publicInput) {
        let prepared, lastCharge;
        const assessment = publicInput.kind === 'quality_assessment';
        if (assessment) qualityProfile(publicInput.profile, job.domain);
        const provider = this.host.providers[config.connection.providerAdapter], evaluator = this;
        const wrapped = { ...provider,
            renderRequest(input) {
                const rendered = provider.renderRequest(input);
                prepared = { arm: 'extraction', trialId: job.id + ':extract', inputTokens: input.snapshot.diagnostics.inputTokens,
                    outputTokens: input.snapshot.contextPlan.budget.reservedOutputTokens, rendered, requestHash: hash(rendered), snapshotHash: hash(input.snapshot) };
                return rendered;
            },
            async send(_rendered, boundary) {
                const result = await evaluator.send(handle, job, config, prepared, boundary.signal, fresh);
                lastCharge = result.charge;
                return { headers: { get: () => 'application/json' }, json: async () => result.raw };
            },
        };
        const persistence = Object.create(this.host.persistence);
        persistence.getRuntimeRoute = async () => config.route; persistence.getModelProfile = async () => config.model; persistence.getConnectionProfile = async () => config.connection;
        const library = { getExact: async (_owner, ref) => {
            const found = config.resources.find(r => same(r.ref, ref)); return found && { snapshot: found.resource, origin: { scope: 'library' } };
        } };
        const resolver = new RouteResolver({ persistence, library, providers: { 'provider.openai-compatible': wrapped } });
        const contextProvider = { buildRequestContextPlan: async () => ({ schemaVersion: 1, requestId: job.id,
            source: { kind: 'task', projectId: createNativeId('project', () => '00000000000000000000000000000000'), revision: hash(publicInput), taskId: job.id },
            items: [{ kind: 'context.history', id: 'evolution-extraction', content: { role: 'user', content: JSON.stringify(publicInput) }, provenance: [{ source: 'experience.public' }] }], provenance: [],
            budget: { maxTokens: config.model.limits.contextTokens - config.generation.output.maxTokens, reservedOutputTokens: config.generation.output.maxTokens } }) };
        const compiler = new PromptCompiler(), service = new GenerationService({ resolver, contextProvider, preparePrompt: compiler.preparePrompt,
            secretPort: { resolveSecret: async () => 'parent-port' }, providerFor: () => wrapped });
        const result = await service.execute({ requestId: job.id, handle, role: config.route.role, routeRef: { scope: 'player', runtimeRouteId: config.route.runtimeRouteId },
            tools: [], prompt: {}, fallbackMode: 'disabled', signal });
        const response = parseEvaluationJson(result.response.assistantText || result.response.text);
        if (assessment) {
            fields(response, ['signal', 'claims', 'rationale']); text(response.rationale, 1024);
            return { ...response, producer: { modelId: config.model.remoteModelId, configurationHash: hash(config), requestHash: lastCharge.requestHash,
                snapshotHash: lastCharge.snapshotHash, chargeId: lastCharge.id } };
        }
        const parsed = applyEvolutionProposal(response, publicInput.base);
        fields(parsed, ['value', 'rationale']); text(parsed.rationale, 1024);
        return parsed;
    }
    async compare(handle, job, configs, settings, signal, fresh, onPair = async () => {}, onTrial = async () => {}, selection = { split: 'promotion', repetitions: 3 }) {
        if (selection.profileId) requirePilotSources(selection.profileId);
        if (selection.mode) throw new TypeError('Invalid comparison purpose');
        return this._evaluate(handle, job, configs, settings, signal, fresh, onPair, onTrial, selection);
    }
    // F2 probes exercise only the unmodified baseline through the same fixed
    // worker. They never extract, judge a pair, publish or acquire eligibility.
    async probe(handle, job, config, settings, signal, fresh, onPair = async () => {}, onTrial = async () => {}, selection = {}) {
        if (!['rp.m1.information', 'project.m1.related'].includes(selection.profileId) || selection.split !== 'development'
            || selection.repetitions !== 1 || selection.mode !== 'source_probe'
            || selectCases({ purpose: 'evaluation', split: selection.split, profileId: selection.profileId, caseSetRevision: selection.caseSetRevision }).some(c => c.entrance !== job.domain)) throw new TypeError('Invalid source probe');
        return this._evaluate(handle, job, { baseline: config }, { baseline: settings }, signal, fresh, onPair, onTrial, selection);
    }
    // Explicit engineering observation port, not an automatic promotion path.
    // Both arms are freshly executed; grading is separately calibrated by the
    // private M1 consumer. No HTTP input or production job calls this port.
    async observePairs(handle, job, configs, settings, signal, fresh, onPair = async () => {}, onTrial = async () => {}, selection = {}) {
        if (!['rp.m1.information', 'project.m1.related'].includes(selection.profileId) || selection.split !== 'promotion'
            || !Number.isSafeInteger(selection.repetitions) || selection.repetitions < 1 || selection.mode !== 'sealed_pair_probe' || selection.caseIds
            || typeof selection.sealedDirectory !== 'string' || !isAbsolute(selection.sealedDirectory)
            || selectCases({ purpose: 'evaluation', split: selection.split, profileId: selection.profileId, caseSetRevision: selection.caseSetRevision }).some(c => c.entrance !== job.domain)) throw new TypeError('Invalid sealed pair observation');
        return this._evaluate(handle, job, configs, settings, signal, fresh, onPair, onTrial, selection);
    }
    async _evaluate(handle, job, configs, settings, signal, fresh, onPair, onTrial, selection) {
        const sourceProbe = selection.mode === 'source_probe', pairedProbe = selection.mode === 'sealed_pair_probe';
        if (!['development', 'promotion'].includes(selection.split) || (pairedProbe
            ? !Number.isSafeInteger(selection.repetitions) || selection.repetitions < 1
            : selection.repetitions !== (selection.split === 'promotion' ? 3 : 1))) throw new TypeError('Invalid finite evaluation selection');
        if (selection.caseIds && (selection.split !== 'development' || !Array.isArray(selection.caseIds) || !selection.caseIds.length
            || new Set(selection.caseIds).size !== selection.caseIds.length || selection.caseIds.some(id => !selectCases({ purpose: 'evaluation', split: 'development', profileId: selection.profileId, caseSetRevision: selection.caseSetRevision }).some(c => c.caseId === id && c.entrance === job.domain)))) throw new TypeError('Invalid development case selection');
        const charges = [], evaluatorRevision = evolutionEvaluatorRevision();
        const child = fork(fileURLToPath(new URL('./evaluation/worker.js', import.meta.url)), [], {
            execArgv: ['--experimental-loader', new URL('./evaluation/loader.js', import.meta.url).href], env: { PATH: process.env.PATH || '', NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced',
        });
        let settled = false, sending = false;
        const abort = () => child.kill();
        signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(abort, 60 * 60 * 1000);
        try {
            const pairs = await new Promise((resolve, reject) => {
                child.on('error', reject); child.on('exit', () => { if (!settled) reject(new Error('evaluation_worker_stopped')); });
                child.on('message', async message => {
                    try {
                        if (message.type === 'send') {
                            if (sending || settled) throw new Error('evaluation_serial_send_required'); sending = true;
                            const config = configs[message.payload.arm === 'candidate' ? 'candidate' : 'baseline'];
                            try {
                                const result = await this.send(handle, job, config, message.payload, signal, fresh); charges.push(result.charge);
                                if (child.connected) child.send({ type: 'response', id: message.id, raw: result.raw });
                            } catch (error) { if (child.connected) child.send({ type: 'response', id: message.id, error: error.code || 'evaluation_send_failed' }); } finally { sending = false; }
                        } else if (message.type === 'trial') await onTrial(message);
                        else if (message.type === 'pair') await onPair(message.pair);
                        else if (message.type === 'complete') { await fresh(); settled = true; resolve(message.pairs); } else if (message.type === 'failed') { settled = true; reject(new Error(message.code)); }
                    } catch (error) { settled = true; reject(error); child.kill(); }
                });
                child.send({ type: 'run', jobId: job.id, domain: job.domain, configs, settings, selection });
            });
            for (const pair of pairs) {
                for (const arm of sourceProbe ? ['baseline'] : ['baseline', 'candidate']) pair[arm].charges = charges.filter(c => c.trialId === pair[arm].trialId);
                if (!sourceProbe && !pairedProbe) pair.judge.chargeIds = charges.filter(c => c.trialId === job.id + ':judge:' + pairs.indexOf(pair)).map(c => c.id);
                const { pairHash: _oldHash, ...identity } = pair; pair.pairHash = hash(identity);
            }
            return { schemaVersion: 2, origin: sourceProbe ? 'host_source_probe' : pairedProbe ? 'host_pair_probe' : 'host_evaluator', evaluatorRevision, caseSetRevision: sourceProbe || pairedProbe ? selection.caseSetRevision ?? PILOT_CASE_SET_REVISION : CASE_SET_REVISION, rule: EVOLUTION_RULE,
                ...(sourceProbe ? { purpose: 'source_probe' } : {}),
                quality: qualityEnvelope(job.domain, selectCases({ purpose: 'evaluation', split: selection.split, profileId: selection.profileId, caseSetRevision: selection.caseSetRevision }).filter(c => c.entrance === job.domain && (!selection.caseIds || selection.caseIds.includes(c.caseId))), selection.split),
                domain: job.domain, policyFingerprint: job.policyFingerprint, targetPin: job.targetPin, price: job.price,
                configurations: sourceProbe ? { baseline: hash(configs.baseline) } : { baseline: hash(configs.baseline), candidate: hash(configs.candidate) }, settings: sourceProbe ? { baseline: hash(settings.baseline) } : { baseline: hash(settings.baseline), candidate: hash(settings.candidate) },
                pairs, charges, createdAt: Date.now() };
        } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); child.kill(); }
    }
}
