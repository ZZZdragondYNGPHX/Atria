import fs from 'node:fs';
import { runComparison, validateComparison } from './comparison.js';

const args = process.argv.slice(2);
try {
    const allowed = new Set(['--candidate', '--split', '--repetitions', '--mode', '--max-requests', '--pilot', '--output', '--validate']);
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index], value = args[index + 1];
        if (!allowed.has(key) || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error('Unknown/incomplete/duplicate comparison argument');
        options[key] = value;
    }
    if (options['--validate']) {
        if (Object.keys(options).length !== 1) throw new Error('Validation cannot execute trials');
        const report = validateComparison(JSON.parse(fs.readFileSync(options['--validate'], 'utf8')));
        console.log(JSON.stringify({ valid: true, summary: report.summary, empiricalReady: report.empiricalReady }));
    } else {
        if (!options['--candidate'] || !options['--split'] || !options['--output']) throw new Error('Explicit candidate, split and new output target required');
        // Check exclusive ownership before executing any fixture work.
        const fd = fs.openSync(options['--output'], 'wx');
        try {
            const report = await runComparison({ candidate: JSON.parse(fs.readFileSync(options['--candidate'], 'utf8')),
                split: options['--split'], mode: options['--mode'] || 'scripted',
                repetitions: options['--repetitions'] ? Number(options['--repetitions']) : 1,
                maxRequests: options['--max-requests'] ? Number(options['--max-requests']) : 216,
                pilot: options['--pilot'] ? JSON.parse(fs.readFileSync(options['--pilot'], 'utf8')) : null });
            fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n');
            console.log(JSON.stringify({ outputWritten: true, summary: report.summary, empiricalReady: false }));
            if (report.summary.status === 'failed') process.exitCode = 1;
        } finally { fs.closeSync(fd); }
    }
} catch (error) {
    console.error('Comparison failed:', error.message); process.exitCode = 1;
}
