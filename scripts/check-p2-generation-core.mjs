import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findArchitectureViolations } from './check-p0-model-prompt-runtime-architecture.mjs';

export function checkP2Source(path, source) {
    const violations = findArchitectureViolations(source);
    if (/\b(?:getCurrent|saveConnectionProfile|saveModelProfile|saveRuntimeRoute|putMutable|putImmutable)\s*\(/.test(source)) {
        violations.push('P2 execution must only read exact existing authorities');
    }
    if (/resolveSecret\s*\(/.test(source) && !path.endsWith('/generation-service.js')) {
        violations.push('Only GenerationService send boundary may dereference secrets');
    }
    return violations;
}

function requirePattern(source, pattern, label) {
    if (!pattern.test(source)) throw new Error('P2 missing invariant: ' + label);
}

function run() {
    const core = 'src/native/model-prompt-runtime/';
    const paths = ['execution-utils.js', 'route-resolver.js', 'generation-service.js'].map(name => core + name);
    paths.push(...readdirSync('src/native/adapters').filter(name => name.endsWith('.js')).map(name => 'src/native/adapters/' + name));
    for (const path of paths) {
        const violations = checkP2Source(path, readFileSync(path, 'utf8'));
        if (violations.length) throw new Error(path + ': ' + violations.join('; '));
    }
    const service = readFileSync(core + 'generation-service.js', 'utf8');
    const resolver = readFileSync(core + 'route-resolver.js', 'utf8');
    requirePattern(service, /error instanceof ProviderFailure/, 'typed send failure fallback');
    requirePattern(service, /checkCancellation\(signal\)/, 'cancellation stops fallback');
    requirePattern(service, /immutable\(assertEffectiveRequestSnapshot/, 'deep immutable snapshot');
    requirePattern(service, /this\.resolver\.resolve\(/, 'complete route resolution on each attempt');
    requirePattern(service, /async _send\([\s\S]*resolveSecret\(/, 'send boundary secret lookup');
    if ((service.match(/resolveSecret\(/g) || []).length !== 1) throw new Error('P2 must have one secret dereference site');
    requirePattern(resolver, /library\.getExact\(/, 'P1 exact Library seam');
    requirePattern(resolver, /generation_capability_unsupported/, 'unsupported fail closed');
    requirePattern(resolver, /generation_capability_unknown/, 'unknown fail closed');
    requirePattern(resolver, /user-override/, 'explicit override provenance');
    for (const fixture of ['settings = oai_settings;', 'library.getCurrent(ref);', 'secrets.resolveSecret(ref);', 'store.saveRuntimeRoute(value);']) {
        if (!checkP2Source(core + 'route-resolver.js', fixture).length) throw new Error('P2 negative self-test failed');
    }
    if (checkP2Source(core + 'route-resolver.js', 'library.getExact(handle, ref);').length) throw new Error('P2 positive self-test failed');
    console.log('P2 Generation Core architecture guard and mutation self-tests passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
