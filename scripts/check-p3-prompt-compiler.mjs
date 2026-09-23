import { readFileSync } from 'node:fs';
import { checkP2Source } from './check-p2-generation-core.mjs';

export function checkP3Source(path, source) {
    const violations = checkP2Source(path, source);
    if (/\b(?:eval|Function|execute|send|commit|save|setState|resolveSecret|compileNativeKnowledgePlan)\s*\(/.test(source)) {
        violations.push('P3 compilation must not execute scripts, models, writes, secret lookup or fact selection');
    }
    if (/\b(?:PromptStore|ResourceGraph|NativeLibraryService)\s*\(/.test(source)) violations.push('P3 must not create a parallel authority');
    return violations;
}

const root = 'src/native/model-prompt-runtime/';
for (const path of ['prompt-compiler.js', 'prompt-values.js', 'context-providers.js', 'prompt-renderers.js'].map(name => root + name)
    .concat('src/native/adapters/native-session-context.js')) {
    const violations = checkP3Source(path, readFileSync(path, 'utf8'));
    if (violations.length) throw new Error(path + ': ' + violations.join('; '));
}
const compiler = readFileSync(root + 'prompt-compiler.js', 'utf8');
const context = readFileSync(root + 'context-providers.js', 'utf8');
for (const marker of ['assertExactResourceRef', 'derive_cycle', 'artifact_scope', 'exclusive_target_conflict', 'readVariable', 'assertPromptIR']) {
    if (!compiler.includes(marker)) throw new Error('P3 missing invariant: ' + marker);
}
if (!context.includes('plan.included.map') || !context.includes('context_revision')) throw new Error('P3 must consume selected exact context');
for (const violation of ['eval(body)', 'provider.send(request)', 'session.commit(value)', 'port.resolveSecret(ref)', 'compileNativeKnowledgePlan(snapshot)',
    'new PromptStore()', 'const x = oai_settings;', "import x from '../../../public/scripts/st-context.js';"]) {
    if (!checkP3Source(root + 'prompt-compiler.js', violation).length) throw new Error('P3 negative self-test missed ' + violation);
}
if (checkP3Source(root + 'prompt-compiler.js', 'const value = assertPromptIR(ir);').length) throw new Error('P3 positive self-test failed');
const bridge = "import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';";
if (checkP3Source(root + 'prompt-compiler.js', bridge).length === 0
    || checkP3Source('src/native/adapters/native-session-context.js', bridge).length !== 0) throw new Error('P3 adapter exception leaked into Core');
console.log('P3 Prompt Compiler architecture guard and mutation self-tests passed.');
