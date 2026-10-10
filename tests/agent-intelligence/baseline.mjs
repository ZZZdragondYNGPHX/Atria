import fs from 'node:fs';
import { runBaseline } from './runner.js';
import { validateReport, validateMeasurements } from './report.js';

const args = process.argv.slice(2);
function option(name) {
    const index = args.indexOf(name);
    if (index < 0) return null;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Value required for ${name}`);
    return args[index + 1];
}
try {
    const allowed = new Set(['--mode', '--output', '--pilot', '--validate', '--measurements']);
    for (let index = 0; index < args.length; index += 2) if (!allowed.has(args[index]) || !args[index + 1]) throw new Error('Unknown/incomplete baseline arguments');
    if (new Set(args.filter((_, index) => index % 2 === 0)).size !== args.length / 2) throw new Error('Duplicate baseline arguments');
    if (option('--validate') && (option('--mode') || option('--pilot') || option('--output'))) throw new Error('Validation cannot run a baseline');
    if (!option('--validate') && option('--measurements') && !option('--output')) throw new Error('Measurements require an output target');
    if (option('--validate')) {
        const report = validateReport(JSON.parse(fs.readFileSync(option('--validate'), 'utf8')));
        if (option('--measurements')) validateMeasurements(JSON.parse(fs.readFileSync(option('--measurements'), 'utf8')), report);
        console.log(JSON.stringify({ valid: true, summary: report.summary, empiricalReady: report.empiricalReady }, null, 2));
    } else {
        const result = await runBaseline({ mode: option('--mode') || 'scripted', pilot: option('--pilot') ? JSON.parse(fs.readFileSync(option('--pilot'), 'utf8')) : null });
        if (option('--output')) {
            // Exclusive creation; no overwriting existing reports or user files.
            fs.writeFileSync(option('--output'), JSON.stringify(result.report, null, 2) + '\n', { flag: 'wx' });
            if (option('--measurements')) fs.writeFileSync(option('--measurements'), JSON.stringify(result.sidecar, null, 2) + '\n', { flag: 'wx' });
        } else console.log(JSON.stringify(result.report, null, 2));
        if (result.report.trials.some(trial => trial.executionStatus === 'failed' || trial.authorityStatus === 'failed')) process.exitCode = 1;
    }
} catch (error) {
    console.error('Baseline failed:', error.message); process.exitCode = 1;
}
