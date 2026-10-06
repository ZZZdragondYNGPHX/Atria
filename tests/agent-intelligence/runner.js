import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CASES, hash, loadFixture } from './cases.js';
import { createReport, observation, missingCheck, validateMeasurements } from './report.js';
import { PilotBudget } from './budget.js';
import { getConfigFilePath, setConfigFilePath } from '../../src/util.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const adapterRevision = hash(['adapters.js', 'runner.js', 'cases.js', 'report.js', 'budget.js'].map(name => fs.readFileSync(new URL(name, import.meta.url), 'utf8')));
let running = false;
function captureFor(entry, trialId) {
    return {
        trialId, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
        prompts: [], evidence: [], checks: {}, completeness: ['usage', 'provider_identity', 'price', 'behavior_grader', 'exact_configuration'],
        toolCalls: 0, repairCount: 0, finalTextStatus: 'unavailable', reviewStatus: 'unavailable',
        observe(name, observed, expected) {
            const result = observation(trialId, name, observed, expected);
            this.evidence = this.evidence.filter(item => item.evidenceId !== result.evidence.evidenceId);
            this.evidence.push(result.evidence); this.checks[name] = result.check;
        },
    };
}
function finishTrial(entry, capture, { mode, testedProductHead, executionStatus, started, reasonCode }) {
    for (const name of [...entry.expectedInvariants, 'isolation']) {
        if (!capture.checks[name]) { capture.checks[name] = missingCheck(reasonCode); capture.completeness.push(name); }
    }
    const allPassed = Object.values(capture.checks).every(check => check.status === 'passed');
    if (capture.checks.isolation.status === 'failed') executionStatus = 'failed';
    if (capture.finalTextStatus === 'unavailable') capture.completeness.push('final_text');
    if (capture.reviewStatus === 'unavailable') capture.completeness.push('review');
    const configuration = { inputHash: entry.inputHash, promptHash: capture.prompts.length ? hash(capture.prompts[0]) : null, skillHash: null, presetHash: null, pinningStatus: 'unavailable' };
    configuration.fingerprint = hash(configuration);
    return {
        schemaVersion: 1, caseId: entry.caseId, caseRevision: entry.caseRevision, trialId: capture.trialId,
        executionMode: mode, adapterId: `s01-${entry.entrance}`, adapterRevision, testedProductHead, configuration, refs: capture.refs,
        executionStatus, finalTextStatus: capture.finalTextStatus, authorityStatus: allPassed ? 'passed' : Object.values(capture.checks).some(check => check.status === 'failed') ? 'failed' : 'unavailable',
        reviewStatus: capture.reviewStatus, checks: capture.checks, completeness: [...new Set(capture.completeness)],
        usage: { status: 'unavailable', totalTokens: null, externalProviderCalls: 0, priceStatus: 'unavailable', upstreamStatus: 'unavailable' },
        metrics: { generationCalls: capture.refs.requestIds.length, toolCalls: capture.toolCalls, retryCount: 0, repairCount: capture.repairCount, latencyMs: Date.now() - started },
        behavior: Object.fromEntries(entry.behaviorDimensions.map(name => [name, { status: 'not_run', score: null, judgeSource: null, disagreements: [], humanPreference: null }])), evidence: capture.evidence,
    };
}

export async function runBaseline({ mode = 'scripted', pilot = null } = {}) {
    if (running) throw new Error('Baseline runner requires serial global isolation');
    if (!['scripted', 'model'].includes(mode)) throw new Error('Unknown baseline mode');
    running = true;
    const oldConfig = getConfigFilePath(); const oldAtria = globalThis.Atria; const oldFetch = globalThis.fetch;
    // Fixed repository default, never the user's runtime config or credentials.
    if (!oldConfig) setConfigFilePath(path.join(root, 'default/config.yaml'));
    // The util API cannot unset CONFIG_PATH. This CLI/test-only process retains
    // the repository default when it started without a config.
    globalThis.Atria = { getContext: () => ({ skills: { list: async () => [], invocationSettings: async () => ({ skills: {} }) } }) };
    globalThis.fetch = async () => { throw new Error('Network forbidden in isolated baseline'); };
    try {
        const testedProductHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        const trials = [];
        let reasonCode = 'scripted_only_no_empirical_evidence';
        if (mode === 'model') {
            const budget = new PilotBudget(pilot);
            reasonCode = budget.blocked ? 'finite_pilot_missing' : 'configured_generation_bridge_unavailable';
            // No standalone live route is supplied in S01. Keep all six pilot
            // slots in the denominator; never silently replace them with fakes.
            for (const entry of CASES.filter(entry => ['rp_agency_d1', 'project_authoring_d1'].includes(entry.caseId))) {
                for (let attempt = 1; attempt <= 3; attempt++) {
                    const capture = captureFor(entry, `${entry.caseId}:model:${attempt}`);
                    capture.completeness.push('exact_configuration', 'live_generation_bridge');
                    trials.push(finishTrial(entry, capture, { mode, testedProductHead, executionStatus: budget.blocked ? 'budget_blocked' : 'unavailable', started: Date.now(), reasonCode }));
                }
            }
        } else {
            const { runRp, runProject } = await import('./adapters.js');
            for (const entry of CASES) {
                const capture = captureFor(entry, `${entry.caseId}:scripted:1`);
                const started = Date.now(); let executionStatus = 'passed';
                try { await (entry.entrance === 'rp' ? runRp : runProject)(entry, loadFixture(entry, { purpose: 'evaluation' }), capture); }
                catch (error) {
                    executionStatus = 'failed';
                    // Do not serialize stack, local paths, raw provider responses or
                    // exception messages. A failed adapter remains in the report.
                    capture.completeness.push('adapter_execution');
                    capture.errorCode = typeof error.code === 'string' ? error.code : error.name;
                    console.error(`[S01] ${entry.caseId}: ${capture.errorCode}`);
                }
                trials.push(finishTrial(entry, capture, { mode, testedProductHead, executionStatus, started, reasonCode: capture.errorCode || 'capture_unavailable' }));
            }
        }
        const report = createReport(trials, mode, reasonCode);
        const sidecar = validateMeasurements({ schemaVersion: 1, reportRevision: hash(report), trials: trials.map(trial => ({
            trialId: trial.trialId, availability: mode === 'scripted' ? 'scripted_observation' : 'unavailable',
            callGraph: trial.refs.requestIds.map((requestId, index) => ({ requestId, entry: trial.caseId.startsWith('rp_') ? 'director' : 'studio', callIndex: index + 1, foreground: true })),
            missing: ['target', 'adapter_identity', 'upstream_snapshot', 'root_child_attempt_identity', 'TTFT', 'input_cached_output_reasoning_tokens', 'price'],
        })) }, report);
        return { report, sidecar };
    } finally {
        if (oldAtria === undefined) delete globalThis.Atria; else globalThis.Atria = oldAtria;
        globalThis.fetch = oldFetch; running = false;
    }
}
