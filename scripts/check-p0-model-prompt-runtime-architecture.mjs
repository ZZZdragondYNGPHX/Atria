import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const CORE_ROOT = 'src/native/model-prompt-runtime';

const FORBIDDEN = Object.freeze([
    {
        pattern: /(?:from\s+|import\s*\()['"][^'"]*(?:public\/scripts|PromptManager|st-context|atria-dispatch)[^'"]*['"]/i,
        message: 'P0 Native Core must depend on ports, not SillyTavern/browser/direct sender modules',
    },
    {
        pattern: /\bAtria\.getContext\s*\(|\bgenerateTask\s*\(|\bgetPresetManager\s*\(|\bPromptManager\b/,
        message: 'P0 Native Core must not use SillyTavern generation/preset facades',
    },
    {
        pattern: /\b(?:extension_settings|extensionSettings|power_user|oai_settings)\b/,
        message: 'P0 Native Core must not read SillyTavern settings globals',
    },
    {
        pattern: /\b(?:document|window)\s*\.|\b(?:localStorage|sessionStorage|indexedDB)\b|\$\s*\(\s*['"]#/,
        message: 'P0 Native Core must not depend on host DOM/browser persistence',
    },
    {
        pattern: /\bpackage\.presets\b|\[['"]presets['"]\]/,
        message: 'P0 Native Core must not promote package.presets into runtime authority',
    },
]);

function posix(path) {
    return path.split(sep).join('/');
}

function walk(path) {
    const absolute = resolve(ROOT, path);
    if (!existsSync(absolute)) return [];
    if (statSync(absolute).isFile()) return [path];
    const files = [];
    for (const name of readdirSync(absolute)) {
        const child = resolve(absolute, name);
        const rel = posix(relative(ROOT, child));
        if (statSync(child).isDirectory()) files.push(...walk(rel));
        else if (/\.js$/i.test(name)) files.push(rel);
    }
    return files;
}

export function findArchitectureViolations(source) {
    const violations = [];
    for (const rule of FORBIDDEN) {
        if (rule.pattern.test(source)) violations.push(rule.message);
    }
    return violations;
}

function assertSource(path, source) {
    const violations = findArchitectureViolations(source);
    if (violations.length) {
        throw new Error(violations.map(message => message + ' (' + path + ')').join('\n'));
    }
}

function runSelfTest() {
    const badFixtures = [
        'const ctx = Atria.getContext();',
        "getPresetManager('openai');",
        'const x = extensionSettings.connectionManager;',
        "document.querySelector('#rm_api_block');",
        'const presets = package.presets;',
        "import { generateTask } from '../../../public/scripts/st-context.js';",
        "import sender from '../../atria-dispatch/runner.js';",
    ];
    for (const fixture of badFixtures) {
        if (findArchitectureViolations(fixture).length === 0) {
            throw new Error('P0 architecture guard self-test failed to detect: ' + fixture);
        }
    }
    const safeFixture = [
        "import { assertProviderPort } from './ports.js';",
        "const request = { connectionProfileId: 'conn_example' };",
    ].join('\n');
    if (findArchitectureViolations(safeFixture).length !== 0) {
        throw new Error('P0 architecture guard self-test rejected a safe Port-oriented fixture');
    }
    console.log('P0 model/prompt/runtime architecture guard self-test passed.');
}

function runRepositoryGuard() {
    const files = walk(CORE_ROOT);
    if (files.length === 0) throw new Error('P0 Native Core contract directory is missing');
    for (const path of files) assertSource(path, readFileSync(resolve(ROOT, path), 'utf8'));

    const packageContracts = readFileSync(resolve(ROOT, 'src/native/contracts.js'), 'utf8');
    if (!/runtime\.modelPrompt|modelPrompt/.test(packageContracts)) {
        throw new Error('P0 Package contract must validate runtime.modelPrompt');
    }

    const a6 = readFileSync(resolve(ROOT, 'scripts/check-a6-native-product-frontend.mjs'), 'utf8');
    if (!/atriaRuntimeConnectionAdvanced/.test(a6) || !/Capabilities route/.test(a6)) {
        throw new Error('P0 must not prematurely remove A6 compatibility/capabilities replacement gates');
    }
    const a8 = readFileSync(resolve(ROOT, 'scripts/check-a8-project-agent.mjs'), 'utf8');
    if (!/generateTask/.test(a8)) {
        throw new Error('P0 must not prematurely remove the A8 generateTask replacement gate');
    }

    console.log('P0 model/prompt/runtime architecture guard passed (' + files.length + ' core files scanned).');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.includes('--self-test')) runSelfTest();
    else runRepositoryGuard();
}
