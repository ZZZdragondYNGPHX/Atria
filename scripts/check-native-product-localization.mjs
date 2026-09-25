import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from 'eslint';
import { SHELL_TEXT_KEYS } from '../public/scripts/atria-shell/localization.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const technical = new Set(['AI', 'JSON', 'JSON Lines', 'URL', 'CSS', 'HTML', 'JavaScript', 'UTF-8', 'Anthropic Messages', 'Gemini GenerateContent']);
const locales = ['zh-cn', 'zh-tw'].map(lang => JSON.parse(fs.readFileSync(path.join(root, 'public/locales', lang + '.json'), 'utf8')));
const linter = new eslint.Linter();
const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
const leaves = node => node?.type === 'ConditionalExpression' ? [...leaves(node.consequent), ...leaves(node.alternate)] : [node];
const visible = value => /[A-Za-z]/.test(value || '') && !technical.has(value);
const placeholders = value => [...String(value).matchAll(/\$\{(\d+)\}/g)].map(match => match[1]).sort().join(',');

export function auditProductSource(source, filename, catalogs = locales) {
    const findings = [];
    const missing = (node, text, key) => {
        if (!visible(text)) return;
        const id = key || SHELL_TEXT_KEYS[text] || text;
        for (let index = 0; index < catalogs.length; index++) {
            if (!catalogs[index][id]) findings.push({ line: node.loc.start.line, text, locale: index, reason: 'missing translation' });
            else if (placeholders(text) !== placeholders(catalogs[index][id])) findings.push({ line: node.loc.start.line, text, locale: index, reason: 'placeholder mismatch' });
        }
    };
    linter.defineRule('product-copy', { create() {
        return {
            CallExpression(node) {
                const name = node.callee.name;
                let index = ['tl', 't', 'translateShellText', 'fmt', 'formatShellText', 'formatProductText', 'i18n', 'i18nFormat'].includes(name) ? 0 : null;
                if (name === 'node' && filename.endsWith('runtime-workspace.js') || name === 'node' && filename.endsWith('retrieval-workspace.js')) index = 1;
                if (['button', 'notice'].includes(name) && /(?:runtime|retrieval)-workspace.js$/.test(filename)) index = 0;
                if (['action', 'field', 'disclosure'].includes(name) && source.includes('from \'./library-ui.js\'')) index = 2;
                if (['button', 'heading', 'field'].includes(name) && filename.endsWith('studio-workspace.js')) index = 1;
                if (filename.includes('/orchestrator/workspace/') && !filename.endsWith('/shell.js') && ['el', 'button'].includes(name)) index = 1;
                if (index !== null) {
                    const explicitKey = ['fmt', 'formatShellText', 'formatProductText'].includes(name) ? literal(node.arguments[3]) : null;
                    for (const leaf of leaves(node.arguments[index])) {
                        const text = literal(leaf);
                        if (text !== null) missing(leaf, text, filename.includes('/native/') || filename.includes('/atria-shell/') ? explicitKey : text);
                        else if (leaf?.type === 'TemplateLiteral' && leaf.quasis.some(q => /[A-Za-z]{2,}/.test(q.value.cooked))) findings.push({ line: leaf.loc.start.line, reason: 'format dynamic UI copy before translation', text: source.slice(leaf.start, leaf.end) });
                        else if (['tl', 't', 'translateShellText'].includes(name) && leaf?.type === 'BinaryExpression' && /[A-Za-z]{2,}/.test(source.slice(leaf.start, leaf.end))) findings.push({ line: leaf.loc.start.line, reason: 'concatenated translation lookup', text: source.slice(leaf.start, leaf.end) });
                    }
                }
                if (node.callee.property?.name === 'setAttribute' && ['aria-label', 'title', 'placeholder'].includes(literal(node.arguments[0]))) {
                    const text = literal(node.arguments[1]);
                    if (visible(text)) findings.push({ line: node.loc.start.line, reason: 'raw accessibility label', text });
                }
            },
            TaggedTemplateExpression(node) {
                if (node.tag.name !== 't') return;
                const text = node.quasi.quasis.map((part, index) => part.value.cooked + (index < node.quasi.expressions.length ? '${' + index + '}' : '')).join('');
                missing(node, text, text);
            },
            AssignmentExpression(node) {
                if (!['textContent', 'placeholder', 'title'].includes(node.left.property?.name)) return;
                const text = literal(node.right);
                if (visible(text)) findings.push({ line: node.loc.start.line, reason: 'raw UI copy', text });
            },
        };
    } });
    const parseErrors = linter.verify(source, { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { 'product-copy': 'error' } });
    for (const error of parseErrors.filter(item => item.fatal)) findings.push({ line: error.line, reason: error.message });
    return findings;
}

function capabilityCatalogs() {
    const catalogs = locales.map(locale => ({ ...locale }));
    const readObject = (node, lang) => {
        if (node?.type !== 'ObjectExpression') return;
        for (const property of node.properties) {
            const key = literal(property.key), value = literal(property.value);
            if (key && value) catalogs[lang === 'zh-cn' ? 0 : 1][key] = value;
        }
    };
    linter.defineRule('product-catalog', { create() {
        return {
            CallExpression(node) { if (['zh-cn', 'zh-tw'].includes(literal(node.arguments[0]))) readObject(node.arguments[1], literal(node.arguments[0])); },
            Property(node) { if (['zh-cn', 'zh-tw'].includes(literal(node.key))) readObject(node.value, literal(node.key)); },
        };
    } });
    for (const file of ['agents/orchestrator/i18n.js', 'agents/memory/i18n.js', 'skills/i18n.js', 'extensions/search-tools/main.js']) {
        linter.verify(fs.readFileSync(path.join(root, 'public/scripts', file), 'utf8'), { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { 'product-catalog': 'error' } });
    }
    return catalogs;
}

function sourceFiles(directory) {
    return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? sourceFiles(directory + '/' + entry.name) : entry.name.endsWith('.js') && !entry.name.endsWith('i18n.js') ? [directory + '/' + entry.name] : []);
}

export function auditProductLocalization() {
    const findings = [];
    for (const directory of ['public/scripts/native', 'public/scripts/atria-shell']) {
        for (const name of fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.js'))) {
            if (name === 'localization.js') continue;
            const filename = directory + '/' + name;
            const source = fs.readFileSync(path.join(root, filename), 'utf8');
            for (const issue of auditProductSource(source, filename)) findings.push({ filename, ...issue });
        }
    }
    const catalogs = capabilityCatalogs();
    for (const directory of ['public/scripts/agents/orchestrator/workspace', 'public/scripts/agents/memory', 'public/scripts/skills', 'public/scripts/extensions/search-tools', 'public/scripts/extensions/regex']) {
        for (const filename of sourceFiles(directory)) {
            const source = fs.readFileSync(path.join(root, filename), 'utf8');
            for (const issue of auditProductSource(source, filename, catalogs)) findings.push({ filename, ...issue });
        }
    }
    const regexDirectory = 'public/scripts/extensions/regex';
    for (const name of fs.readdirSync(path.join(root, regexDirectory)).filter(file => file.endsWith('.html'))) {
        const filename = regexDirectory + '/' + name;
        const source = fs.readFileSync(path.join(root, filename), 'utf8');
        for (const match of source.matchAll(/data-i18n="([^"]+)"/g)) for (const raw of match[1].split(';')) {
            const key = raw.replace(/^\[[^\]]+\]/, '');
            for (let index = 0; index < catalogs.length; index++) if (!catalogs[index][key]) findings.push({ filename, key, locale: index, reason: 'missing template translation' });
        }
    }
    for (const [text, key] of Object.entries(SHELL_TEXT_KEYS)) {
        for (let index = 0; index < locales.length; index++) {
            if (!locales[index][key] || placeholders(text) !== placeholders(locales[index][key])) findings.push({ filename: 'public/locales/' + ['zh-cn', 'zh-tw'][index] + '.json', text, reason: 'catalog key or placeholders incomplete', key });
        }
    }
    return findings;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const findings = auditProductLocalization();
    if (findings.length) { console.error(JSON.stringify(findings, null, 2)); process.exitCode = 1; } else console.log('Native product localization coverage passed (zh-CN / zh-TW).');
}
