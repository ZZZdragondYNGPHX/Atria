#!/usr/bin/env node
import { analyzeLearningFiles } from '../src/native/agent-intelligence/learning-trajectory.js';

const paths = process.argv.slice(2);
const usage = 'Usage: node scripts/analyze-learning.js [--] <export.json> [export.json ...]\n'
    + 'Reads 1-32 local metadata exports (256 KiB each) and writes one JSON analysis to stdout.\n'
    + 'Offline only: no model calls, training, promotion or source content expansion.\n';

if (paths.length === 1 && ['--help', '-h'].includes(paths[0])) {
    process.stdout.write(usage);
} else {
    if (paths[0] === '--') paths.shift();
    else if (paths.some(path => path.startsWith('-'))) {
        process.stderr.write(usage);
        process.exitCode = 2;
    }
    if (!process.exitCode) {
        if (!paths.length || paths.length > 32) {
            process.stderr.write(usage);
            process.exitCode = 2;
        } else {
            try {
                const result = await analyzeLearningFiles(paths);
                process.stdout.write(JSON.stringify(result, null, 2) + '\n');
            } catch {
                // Parser and filesystem errors can contain private input or paths.
                process.stderr.write('Learning analysis failed: a local export is unreadable, changed, exceeds limits or has invalid metadata.\n');
                process.exitCode = 1;
            }
        }
    }
}
