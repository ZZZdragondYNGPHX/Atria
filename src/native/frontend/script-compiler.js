import { createRequire } from 'node:module';
import { parse as parseJavaScript, getLineInfo } from 'acorn';
import { initSync, parse } from 'es-module-lexer';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertScriptArtifact, SCRIPT_LIMITS } from '../../../public/shared/native-frontend-script.js';

const forbidden = new Set(['eval', 'Function', 'AsyncFunction', 'GeneratorFunction', 'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'WebAssembly', 'SharedArrayBuffer', 'Atomics', 'process', 'global', 'globalThis', 'self', 'importScripts']);
const require = createRequire(import.meta.url);
const invalidScript = (file, position, message) => Object.assign(new TypeError(file + ':' + position.line + ': ' + message), {
    code: 'frontend_script_invalid', source: { file, line: position.line, column: position.column + 1 },
});
function inspectJavaScript(code, file, compiled, synchronous) {
    let tree; const imports = [];
    const fail = (node, message) => { throw invalidScript(file, getLineInfo(code, node.start), message); };
    try { tree = parseJavaScript(code, { ecmaVersion: 'latest', sourceType: compiled ? 'script' : 'module' }); } catch (error) { throw invalidScript(file, error.loc, 'Invalid script syntax'); }
    const visit = (node, parent) => {
        if (synchronous && (node.async || node.type === 'AwaitExpression' || node.type === 'ForOfStatement' && node.await
            || node.type === 'Identifier' && node.name === 'Promise')) fail(node, 'World computation must be synchronous');
        if (node.type === 'Identifier' && forbidden.has(node.name)) fail(node, 'Forbidden Script global: ' + node.name);
        if (node.type === 'ImportExpression') fail(node, 'Dynamic import denied');
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) imports.push(node.source.value);
        if (node.type === 'Identifier' && node.name === 'require') {
            if (!compiled || parent?.type !== 'CallExpression' || parent.callee !== node || parent.arguments.length !== 1
                || parent.arguments[0].type !== 'Literal' || typeof parent.arguments[0].value !== 'string') fail(node, 'Runtime require denied');
            imports.push(parent.arguments[0].value);
        }
        for (const key of Object.keys(node)) {
            const child = node[key];
            if (Array.isArray(child)) { for (const item of child) if (item?.type) visit(item, node); } else if (child?.type) visit(child, node);
        }
    };
    visit(tree); return [...new Set(imports)];
}
function inspect(code, file, compiled = false, synchronous = false, capture = false) {
    if (capture && file.endsWith('.js')) {
        initSync();
        return parse(code, file)[0].filter(item => item.d === -1).map(item => item.n);
    }
    if (compiled || file.endsWith('.js')) return inspectJavaScript(code, file, compiled, synchronous);
    const ts = require('typescript');
    const tree = ts.createSourceFile(file, code, ts.ScriptTarget.ES2020, !capture, compiled || file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS), imports = [];
    const fail = (node, message) => { const position = tree.getLineAndCharacterOfPosition(node.getStart(tree)); const error = new TypeError(file + ':' + (position.line + 1) + ': ' + message); error.code = 'frontend_script_invalid'; error.source = { file, line: position.line + 1, column: position.character + 1 }; throw error; };
    if (tree.parseDiagnostics.length) fail(tree, 'Invalid script syntax');
    const visit = node => {
        if (capture) {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
            ts.forEachChild(node, visit); return;
        }
        if (synchronous && (node.kind === ts.SyntaxKind.AsyncKeyword || node.kind === ts.SyntaxKind.AwaitKeyword
            || ts.isIdentifier(node) && node.text === 'Promise')) fail(node, 'World computation must be synchronous');
        if (ts.isIdentifier(node) && forbidden.has(node.text)) fail(node, 'Forbidden Script global: ' + node.text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) fail(node, 'Dynamic import denied');
        if (ts.isImportEqualsDeclaration(node)) fail(node, 'Use static ES imports');
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            if (node.moduleSpecifier) { if (!ts.isStringLiteral(node.moduleSpecifier)) fail(node, 'Static import required'); imports.push(node.moduleSpecifier.text); }
        }
        if (ts.isIdentifier(node) && node.text === 'require') {
            const parent = node.parent;
            if (!compiled || !ts.isCallExpression(parent) || parent.expression !== node || parent.arguments.length !== 1 || !ts.isStringLiteral(parent.arguments[0])) fail(node, 'Runtime require denied');
            imports.push(parent.arguments[0].text);
        }
        ts.forEachChild(node, visit);
    };
    visit(tree); return [...new Set(imports)];
}

export function collectControllerSources(entry, readText, limits = SCRIPT_LIMITS) {
    return collectSources(entry, readText, limits, false);
}
// Capture exact reachable bytes without parent links or policy traversal. This
// is not admission: the compiler worker runs the full source/artifact checks.
export function captureControllerSources(entry, readText, limits = SCRIPT_LIMITS) {
    return collectSources(entry, readText, limits, true);
}
function collectSources(entry, readText, limits, capture) {
    const modules = new Map(), visiting = new Set(); let bytes = 0;
    const visit = file => {
        if (modules.has(file)) return;
        if (visiting.has(file)) throw new TypeError('Cyclic Script module graph');
        if (modules.size + visiting.size >= limits.modules) throw new TypeError('script_module_budget');
        visiting.add(file);
        const source = readText(file); bytes += Buffer.byteLength(source);
        if (bytes > limits.moduleBytes) throw new TypeError('script_module_budget');
        const imports = {};
        for (const name of inspect(source, file, false, limits.synchronous, capture)) {
            if (!/^\.\.?\//.test(name) || !/\.(js|ts)$/.test(name) || name.includes('\\')) throw new TypeError('Script requires exact package-local JS/TS imports');
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
            if (target.startsWith('../') || path.posix.isAbsolute(target)) throw new TypeError('Script import escapes Package');
            imports[name] = target; visit(target);
        }
        modules.set(file, { id: file, source, imports }); visiting.delete(file);
    };
    visit(entry);
    return [...modules.values()];
}

export function compileController(entry, readText, limits = SCRIPT_LIMITS) {
    const ts = require('typescript');
    const modules = collectControllerSources(entry, readText, limits).map(({ id: file, source, imports }) => {
        const output = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: {
            target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, sourceMap: true, inlineSources: false, alwaysStrict: true,
        } });
        if (output.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new TypeError('Controller transpile failed: ' + file);
        const map = JSON.parse(output.sourceMapText); map.sources = [file]; delete map.sourceRoot;
        const code = output.outputText.replace(/\/\/# sourceMappingURL=.*$/m, '');
        return { id: file, code, imports, map, sourceHash: createHash('sha256').update(source).digest('hex') };
    });
    return validateScriptArtifact({ format: 'atria-script', version: 1, entry, modules: modules.sort((a, b) => a.id.localeCompare(b.id)) }, limits);
}

export function validateScriptArtifact(value, limits = SCRIPT_LIMITS) {
    assertScriptArtifact(value, limits);
    const visited = new Set(), visiting = new Set();
    const visit = id => {
        if (visiting.has(id)) throw new TypeError('Cyclic Script module graph');
        if (visited.has(id)) return;
        visiting.add(id); const module = value.modules.find(item => item.id === id);
        for (const name of inspect(module.code, id, true, limits.synchronous)) if (!Object.hasOwn(module.imports, name)) throw new TypeError('Unlinked Script import');
        Object.values(module.imports).forEach(visit); visiting.delete(id); visited.add(id);
    };
    visit(value.entry);
    if (visited.size !== value.modules.length) throw new TypeError('Unreachable Script module');
    return value;
}
