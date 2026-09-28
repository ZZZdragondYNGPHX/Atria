import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { simple, ancestor } from 'acorn-walk';

const exec = promisify(execFile);
const parseSource = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
const sourcePath = path => /^(?:src|public|scripts|tests)\//.test(path)
    && ['.js', '.mjs', '.ts', '.css', '.html', '.json', '.md'].includes(extname(path))
    && !/(?:^|\/)(?:node_modules|data|cache|\.env)(?:\/|$)/i.test(path);
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function strings(node, bindings = {}) {
    if (node?.type === 'Literal' && typeof node.value === 'string') return [node.value];
    if (node?.type === 'Identifier') return Object.hasOwn(bindings, node.name) ? bindings[node.name] : [];
    if (node?.type === 'TemplateLiteral') {
        let results = [node.quasis[0].value.cooked];
        for (let i = 0; i < node.expressions.length; i++) {
            results = results.flatMap(prefix => strings(node.expressions[i], bindings)
                .map(value => prefix + value + node.quasis[i + 1].value.cooked));
        }
        return results;
    }
    if (node?.type === 'ArrayExpression') return node.elements.flatMap(item => strings(item, bindings));
    if (node?.type === 'BinaryExpression' && node.operator === '+') {
        return strings(node.left, bindings).flatMap(left => strings(node.right, bindings).map(right => left + right));
    }
    return [];
}

function memberPath(node) {
    if (node?.type === 'ChainExpression') return memberPath(node.expression);
    if (node?.type === 'Identifier') return [node.name];
    if (node?.type !== 'MemberExpression') return [];
    const key = node.computed ? node.property.value : node.property.name;
    return typeof key === 'string' ? [...memberPath(node.object), key] : [];
}

function hints(node) {
    const result = { body: new Set(), query: new Set(), params: new Set() };
    simple(node, {
        MemberExpression(item) {
            const [owner, area, ...path] = memberPath(item);
            if (['req', 'request'].includes(owner) && Object.hasOwn(result, area) && path.length) result[area].add(path.join('.'));
        },
        VariableDeclarator(item) {
            const [owner, area] = memberPath(item.init);
            if (['req', 'request'].includes(owner) && Object.hasOwn(result, area) && item.id.type === 'ObjectPattern') {
                for (const property of item.id.properties) if (property.key?.name) result[area].add(property.key.name);
            }
        },
    });
    return Object.fromEntries(Object.entries(result).map(([key, set]) => [key, [...set].sort()]));
}

export class SourceCatalog {
    constructor(root) { this.root = root; }

    async init() {
        this.root = await realpath(this.root);
        const { stdout } = await exec('git', ['-C', this.root, 'rev-parse', '--show-toplevel']);
        if (!samePath(await realpath(stdout.trim()), this.root)) throw new Error('ATRIA_REPO must be the product repository root.');
        await this.refreshFiles();
        await this.readRaw('src/server-startup.js');
        await this.readRaw('src/endpoints/native-studio.js');
        return this;
    }

    async refreshFiles() {
        const { stdout } = await exec('git', ['-C', this.root, 'ls-files', '-z'], { maxBuffer: 8 * 1024 * 1024 });
        this.files = new Set(stdout.split('\0').filter(sourcePath));
    }

    async readRaw(path) {
        if (!this.files.has(path) || path.includes('\\') || path.split('/').includes('..')) throw new Error('Only tracked source files in the configured Atria repository can be read.');
        const target = resolve(this.root, path);
        const real = await realpath(target);
        const rel = relative(this.root, real);
        if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep) || !samePath(target, real)) throw new Error('Symlink or out-of-repository source access is blocked.');
        if ((await stat(real)).size > 2 * 1024 * 1024) throw new Error('Source file exceeds the 2 MiB limit.');
        const content = await readFile(real, 'utf8');
        if (content.includes('\0')) throw new Error('Binary source files are not supported.');
        return content;
    }

    async read(path, startLine = 1, lineCount = 120) {
        await this.refreshFiles();
        const source = await this.readRaw(path);
        const lines = source.split(/\r?\n/);
        const selected = lines.slice(startLine - 1, startLine - 1 + lineCount);
        const output = [];
        let used = 0;
        let truncatedLine = false;
        for (let i = 0; i < selected.length; i++) {
            const line = `${startLine + i}: ${selected[i]}`;
            if (used + line.length + 1 > 30000) {
                if (!output.length) {
                    output.push(line.slice(0, 29800) + ' [line truncated; inspect the full line with local coding tools]');
                    truncatedLine = true;
                }
                break;
            }
            output.push(line);
            used += line.length + 1;
        }
        const nextLine = startLine + output.length;
        return { path, startLine, totalLines: lines.length,
            sha256: createHash('sha256').update(source).digest('hex'),
            content: output.join('\n'), returnedLines: output.length,
            truncated: truncatedLine || output.length < selected.length,
            nextLine: nextLine <= lines.length ? nextLine : null };
    }

    async search(query, prefix = '', limit = 30) {
        await this.refreshFiles();
        const matches = [];
        const skipped = [];
        for (const path of [...this.files].sort().filter(path => path.startsWith(prefix))) {
            let source;
            try { source = await this.readRaw(path); } catch { skipped.push(path); continue; }
            const lines = source.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].toLowerCase().includes(query.toLowerCase())) continue;
                matches.push({ path, line: i + 1, text: lines[i].slice(0, 500) });
                if (matches.length >= limit) return { matches, limited: true, skipped };
            }
        }
        return { matches, limited: false, skipped };
    }

    async status() {
        const [{ stdout: head }, { stdout: dirty }] = await Promise.all([
            exec('git', ['-C', this.root, 'rev-parse', 'HEAD']),
            exec('git', ['-C', this.root, 'status', '--porcelain', '--untracked-files=no']),
        ]);
        return { root: this.root, head: head.trim(), trackedWorkingTreeDirty: Boolean(dirty.trim()) };
    }

    async routes() {
        await this.refreshFiles();
        const startup = parseSource(await this.readRaw('src/server-startup.js'));
        const imports = new Map();
        for (const item of startup.body) if (item.type === 'ImportDeclaration') {
            for (const spec of item.specifiers) imports.set(spec.local.name, item.source.value);
        }
        const mounts = [];
        simple(startup, { CallExpression(node) {
            if (memberPath(node.callee).join('.') !== 'app.use') return;
            const [prefix] = strings(node.arguments[0]);
            const imported = imports.get(node.arguments[1]?.name);
            if (prefix?.startsWith('/api/native/') && imported?.startsWith('./endpoints/')) {
                mounts.push({ prefix, path: 'src/' + imported.slice(2) });
            }
        } });
        const routes = [];
        const unsupported = [];
        for (const { prefix, path } of mounts) {
            const content = await this.readRaw(path);
            const tree = parseSource(content);
            ancestor(tree, { CallExpression(node, ancestors) {
                const [owner, verb] = memberPath(node.callee);
                if (owner !== 'router' || !['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(verb)) return;
                const bindings = {};
                for (const parent of ancestors) if (parent.type === 'ForOfStatement') {
                    const id = parent.left.declarations?.[0]?.id;
                    if (id?.name) bindings[id.name] = strings(parent.right);
                    if (id?.type === 'ArrayPattern' && parent.right.type === 'ArrayExpression') {
                        id.elements.forEach((item, index) => {
                            if (item?.name) bindings[item.name] = parent.right.elements.flatMap(row => strings(row?.elements?.[index]));
                        });
                    }
                }
                const paths = strings(node.arguments[0], bindings);
                if (!paths.length) { unsupported.push({ source: path, line: node.loc.start.line, reason: 'Dynamic route cannot be resolved statically.' }); return; }
                for (const suffix of paths) routes.push({
                    id: `${verb.toUpperCase()} ${prefix}${suffix}`, method: verb.toUpperCase(), path: prefix + suffix,
                    domain: prefix.split('/').at(-1), source: path, line: node.loc.start.line, endLine: node.loc.end.line,
                    requestHints: hints(node), blocked: /(?:^|\/)secrets?(?:\/|$)/i.test(suffix),
                });
            } });
        }
        return {
            basis: 'Current tracked product working tree; not a runtime/OpenAPI guarantee. Request hints are incomplete source evidence, not schemas. Read handler and authoring contracts before calls.',
            routes: routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)), unsupported,
        };
    }
}
