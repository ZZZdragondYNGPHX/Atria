import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import writeFileAtomic from 'write-file-atomic';
import { createLiveBridge } from './live-bridge.js';
import { EvaluationBudget } from './budget.js';
import { runBaseline } from './runner.js';
import { runModelJudge } from './judge.js';
import { runComparison } from './comparison.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

// Explicit local evaluator, never invoked by a production endpoint or timer.
const root = fileURLToPath(new URL('../../', import.meta.url));
let lock = null; let fixture = null; const descriptors = [];
try {
    const args = process.argv.slice(2), options = {};
    const allowed = new Set(['--connection', '--ledger', '--output', '--phase', '--candidate', '--split', '--repetitions', '--baseline', '--trial-suffix', '--comparison']);
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index], value = args[index + 1];
        if (!allowed.has(key) || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error('invalid_arguments');
        options[key] = value;
    }
    if (!['pilot', 'comparison', 'judge'].includes(options['--phase']) || !options['--connection'] || !options['--ledger'] || !options['--output']) throw new Error('explicit_connection_ledger_output_phase_required');
    const comparison = options['--phase'] === 'comparison'; const judging = options['--phase'] === 'judge';
    if (comparison && (!options['--candidate'] || !options['--split'] || !options['--baseline'])
        || !comparison && ['--candidate', '--split', '--repetitions', '--baseline'].some(key => options[key])) throw new Error('invalid_phase_arguments');
    if (judging !== Boolean(options['--comparison'])) throw new Error('explicit_judge_comparison_required');
    if (options['--trial-suffix'] && !/^:[a-zA-Z0-9_-]{1,64}$/.test(options['--trial-suffix'])) throw new Error('invalid_trial_suffix');
    for (const key of ['--connection', '--ledger', '--output', '--baseline']) {
        if (!options[key]) continue;
        const target = path.resolve(options[key]);
        const parent = fs.realpathSync(path.dirname(target));
        if (target === root || target.startsWith(root) || parent === root || parent.startsWith(root)) throw new Error('local_artifacts_must_be_outside_repository');
    }
    const { apiKey, ...config } = JSON.parse(fs.readFileSync(options['--connection'], 'utf8'));
    if (typeof apiKey !== 'string' || !apiKey) throw new Error('explicit_api_key_required');
    const ledgerPath = path.resolve(options['--ledger']);
    // Exclusive writer ownership; a crashed writer leaves a visible lock.
    const lockPath = ledgerPath + '.lock'; const lockFd = fs.openSync(lockPath, 'wx', 0o600);
    lock = lockPath; descriptors.push(lockFd);
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid }));
    const outputFd = fs.openSync(options['--output'], 'wx', 0o600); descriptors.push(outputFd);
    const progressFd = fs.openSync(options['--output'] + '.progress.jsonl', 'wx', 0o600); descriptors.push(progressFd);
    const baselineFd = comparison ? fs.openSync(options['--baseline'], 'wx', 0o600) : null;
    if (baselineFd !== null) descriptors.push(baselineFd);
    const budget = new EvaluationBudget(config, { snapshot: fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : null,
        onChange: snapshot => writeFileAtomic.sync(ledgerPath, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 }) });
    const candidate = comparison ? JSON.parse(fs.readFileSync(options['--candidate'], 'utf8')) : null;
    fixture = await makeTempFsEngine();
    const bridge = await createLiveBridge({ engine: fixture.engine, handle: fixture.handle, config, budget,
        secretPort: { resolveSecret: async () => apiKey }, fetchImpl: globalThis.fetch });
    const onTrial = trial => {
        fs.writeSync(progressFd, JSON.stringify({ trial, observations: bridge.observations().filter(item => item.trialId === trial.trialId) }) + '\n');
        fs.fsyncSync(progressFd);
        console.log(JSON.stringify({ trial: trial.trialId, execution: trial.executionStatus, authority: trial.authorityStatus, sends: trial.usage.externalProviderCalls }));
    };
    const report = judging ? await runModelJudge(JSON.parse(fs.readFileSync(options['--comparison'], 'utf8')), bridge, { onPair: item => {
        fs.writeSync(progressFd, JSON.stringify({ pair: item, observations: bridge.observations().filter(event => event.trialId === item.trialId) }) + '\n'); fs.fsyncSync(progressFd);
        console.log(JSON.stringify({ pair: item.pairId, judge: item.status }));
    } }) : comparison ? await runComparison({ candidate, split: options['--split'], repetitions: Number(options['--repetitions'] || 1), mode: 'model',
        maxRequests: Math.min(216, config.maxRequests), bridge, onTrial,
        onBaseline: value => { fs.writeFileSync(baselineFd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(baselineFd); } })
        : (await runBaseline({ mode: 'model', bridge, onTrial, trialSuffix: options['--trial-suffix'] || '' })).report;
    fs.writeFileSync(outputFd, JSON.stringify(report, null, 2) + '\n'); fs.fsyncSync(outputFd);
    console.log(JSON.stringify({ summary: report.summary, empiricalReady: report.empiricalReady ?? false,
        cumulativeBudget: { requests: budget.snapshot().requests, tokens: budget.snapshot().tokens, breached: budget.snapshot().breached } }));
    const trials = report.trials || (judging ? [] : report.pairs.flatMap(pair => [pair.baseline.trial, pair.candidate.trial]));
    if (trials.some(trial => trial.executionStatus === 'failed' || trial.authorityStatus === 'failed')
        || judging && (report.summary.failed > 0 || report.summary.invalid_response > 0)) process.exitCode = 1;
} catch (error) {
    // Provider/JSON diagnostics may contain credential-bearing input. Print no body.
    console.error('Live evaluation failed:', /^[a-z_]{1,100}$/.test(error.message) ? error.message : 'inspect_local_progress_and_ledger');
    process.exitCode = 1;
} finally {
    fixture?.cleanup();
    for (const fd of descriptors) fs.closeSync(fd);
    if (lock) fs.unlinkSync(lock);
}
