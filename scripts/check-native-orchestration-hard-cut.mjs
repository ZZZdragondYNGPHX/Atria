import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const retired = ['public/scripts/agents/orchestrator/', 'public/scripts/lib/agent-runtime/',
    'public/scripts/lib/orchestration-engine/', 'public/scripts/lib/agent-workspace/'];
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))];
const errors = [];
for (const directory of retired) if (fs.existsSync(directory)) errors.push('Retired runtime still exists: ' + directory);
for (const file of files) {
    if (!/\.(?:m?js|cjs)$/.test(file) || !fs.existsSync(file) || file.startsWith('node_modules/')) continue;
    const source = fs.readFileSync(file, 'utf8'), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const visit = node => {
        if (ts.isStringLiteral(node) && node.text.startsWith('.')) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), node.text));
            if (retired.some(root => target.startsWith(root))) errors.push(file + ': retired dependency ' + node.text);
        }
        if (!file.startsWith('tests/') && ts.isCallExpression(node) && /getCapabilityApi|registerCapabilityApi/.test(node.expression.getText(tree))
            && node.arguments.some(arg => ts.isStringLiteral(arg) && arg.text === 'orchestrator')) errors.push(file + ': retired capability registration/access');
        ts.forEachChild(node, visit);
    };
    visit(tree);
}
if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write('Native orchestration hard cut: no retired runtime roots, imports or capability access.\n');
