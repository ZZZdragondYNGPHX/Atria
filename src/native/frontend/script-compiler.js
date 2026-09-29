import ts from 'typescript';
import path from 'node:path';
import { hash } from './bridge.js';
import { assertScriptArtifact, SCRIPT_LIMITS } from '../../../public/shared/native-frontend-script.js';

const forbidden = new Set(['eval', 'Function', 'AsyncFunction', 'GeneratorFunction', 'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'WebAssembly', 'SharedArrayBuffer', 'Atomics', 'process', 'global', 'globalThis', 'self', 'importScripts']);
function inspect(code, file, compiled = false) {
    const tree = ts.createSourceFile(file, code, ts.ScriptTarget.ES2020, true, compiled || file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS), imports = [];
    const fail = (node, message) => { const position = tree.getLineAndCharacterOfPosition(node.getStart(tree)); const error = new TypeError(file + ':' + (position.line + 1) + ': ' + message); error.code = 'frontend_script_invalid'; error.source = { file, line: position.line + 1, column: position.character + 1 }; throw error; };
    if (tree.parseDiagnostics.length) fail(tree, 'Invalid script syntax');
    const visit = node => {
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

export function compileController(entry, readText) {
    const modules = new Map(), visiting = new Set(); let bytes = 0;
    const visit = file => {
        if (modules.has(file)) return;
        if (visiting.has(file)) throw new TypeError('Cyclic Script module graph');
        if (modules.size + visiting.size >= SCRIPT_LIMITS.modules) throw new TypeError('script_module_budget');
        visiting.add(file);
        const source = readText(file); bytes += Buffer.byteLength(source);
        if (bytes > SCRIPT_LIMITS.moduleBytes) throw new TypeError('script_module_budget');
        const imports = {};
        for (const name of inspect(source, file)) {
            if (!/^\.\.?\//.test(name) || !/\.(js|ts)$/.test(name) || name.includes('\\')) throw new TypeError('Script requires exact package-local JS/TS imports');
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
            if (target.startsWith('../') || path.posix.isAbsolute(target)) throw new TypeError('Script import escapes Package');
            imports[name] = target; visit(target);
        }
        const output = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: {
            target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, sourceMap: true, inlineSources: false, alwaysStrict: true,
        } });
        if (output.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new TypeError('Controller transpile failed: ' + file);
        const map = JSON.parse(output.sourceMapText); map.sources = [file]; delete map.sourceRoot;
        const code = output.outputText.replace(/\/\/# sourceMappingURL=.*$/m, '');
        modules.set(file, { id: file, code, imports, map, sourceHash: hash(Buffer.from(source)) }); visiting.delete(file);
    };
    visit(entry);
    return validateScriptArtifact({ format: 'atria-script', version: 1, entry, modules: [...modules.values()].sort((a, b) => a.id.localeCompare(b.id)) });
}

export function validateScriptArtifact(value) {
    assertScriptArtifact(value);
    const visited = new Set(), visiting = new Set();
    const visit = id => {
        if (visiting.has(id)) throw new TypeError('Cyclic Script module graph');
        if (visited.has(id)) return;
        visiting.add(id); const module = value.modules.find(item => item.id === id);
        for (const name of inspect(module.code, id, true)) if (!Object.hasOwn(module.imports, name)) throw new TypeError('Unlinked Script import');
        Object.values(module.imports).forEach(visit); visiting.delete(id); visited.add(id);
    };
    visit(value.entry);
    if (visited.size !== value.modules.length) throw new TypeError('Unreachable Script module');
    return value;
}
