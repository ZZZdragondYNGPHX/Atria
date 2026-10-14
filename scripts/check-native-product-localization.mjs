import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from 'eslint';
import { SHELL_TEXT_KEYS } from '../public/scripts/atria-shell/localization.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const technical = new Set(['AI', 'JSON', 'JSON Lines', 'URL', 'CSS', 'HTML', 'JavaScript', 'UTF-8', 'Anthropic Messages', 'Gemini GenerateContent']);
const localeIds = JSON.parse(fs.readFileSync(path.join(root, 'public/locales/lang.json'), 'utf8')).map(item => item.lang).filter(lang => lang !== 'en');
const locales = localeIds.map(lang => JSON.parse(fs.readFileSync(path.join(root, 'public/locales', lang + '.json'), 'utf8')));
const linter = new eslint.Linter();
const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
const leaves = node => node?.type === 'ConditionalExpression' ? [...leaves(node.consequent), ...leaves(node.alternate)] : [node];
const visible = value => /[A-Za-z\u4e00-\u9fff]/.test(value || '') && !technical.has(value);
const placeholders = value => [...String(value).matchAll(/\$\{\d+\}|%(?:\d+\$)?[sd]/g)].map(match => match[0]).sort().join(',');

export function auditProductSource(source, filename, catalogs = locales) {
    const findings = [];
    const missing = (node, text, key) => {
        if (!visible(text)) return;
        if (/[\u4e00-\u9fff]/.test(text)) findings.push({ line: node.loc.start.line, text, reason: 'English fallback required' });
        const id = key || SHELL_TEXT_KEYS[text] || text;
        for (let index = 0; index < catalogs.length; index++) {
            if (!catalogs[index][id]) findings.push({ line: node.loc.start.line, text, locale: index, reason: 'missing translation' });
            else if (placeholders(text) !== placeholders(catalogs[index][id])) findings.push({ line: node.loc.start.line, text, locale: index, reason: 'placeholder mismatch' });
        }
    };
    linter.defineRule('product-copy', { create(context) {
        return {
            VariableDeclarator(node) {
                if (filename.endsWith('/native/studio-agent.js') && ['statusLabels', 'impactLabels'].includes(node.id?.name)) {
                    for (const property of node.init?.properties || []) { const text = literal(property.value); if (text) missing(property, text); }
                }
            },
            NewExpression(node) {
                if (/\/(?:login|entry-localization)\.js$/.test(filename) && node.callee.name === 'Error') {
                    const text = literal(node.arguments[0]); if (text) missing(node, text);
                }
            },
            Property(node) {
                if (filename.endsWith('/login.js') && node.key?.type === 'Identifier' && /^oauth_|unsupported_provider|provider_not_configured|discord_guild_check_failed/.test(node.key.name)) {
                    const text = literal(node.value); if (text) missing(node, text);
                }
                if (filename.endsWith('/native/runtime-client.js') && node.value?.type === 'ArrayExpression') {
                    const text = literal(node.value.elements[0]);
                    if (text) missing(node, text);
                }
            },
            CallExpression(node) {
                const name = node.callee.name;
                let index = ['tl', 't', 'translate', 'translateShellText', 'fmt', 'formatShellText', 'formatProductText', 'i18n', 'i18nFormat'].includes(name) ? 0 : null;
                if (filename.endsWith('/login.js') && name === 'displayError') index = 0;
                if (filename.endsWith('/login.js') && name === 'setEntryText') index = 1;
                if (name === 'node' && filename.endsWith('runtime-workspace.js') || name === 'node' && filename.endsWith('retrieval-workspace.js')) index = 1;
                if (['button', 'notice'].includes(name) && /(?:runtime|retrieval)-workspace.js$/.test(filename)) index = 0;
                if (['action', 'field', 'disclosure'].includes(name) && source.includes('from \'./library-ui.js\'')) index = 2;
                if (source.includes('from \'./illustration-ui.js\'')) {
                    if (name === 'node') index = 3;
                    if (['button', 'field', 'select'].includes(name)) index = 2;
                }
                if (['button', 'heading', 'field'].includes(name) && filename.endsWith('studio-workspace.js')) index = 1;
                if (['textInput', 'selectInput'].includes(name) && filename.endsWith('studio-workspace.js')) index = 3;
                if (filename.includes('/orchestrator/workspace/') && !filename.endsWith('/shell.js') && ['el', 'button'].includes(name)) index = 1;
                if (index !== null) {
                    const explicitKey = name === 'translate' ? literal(node.arguments[1]) || literal(node.arguments[0])
                        : ['fmt', 'formatShellText', 'formatProductText'].includes(name) ? literal(node.arguments[3]) : null;
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
                // Shadow-root style text is CSS, not visible interface copy.
                if (node.left.property.name === 'textContent' && node.left.object.type === 'Identifier') {
                    let scope = context.getSourceCode().getScope(node);
                    while (scope && !scope.set.has(node.left.object.name)) scope = scope.upper;
                    const init = scope?.set.get(node.left.object.name)?.defs?.[0]?.node?.init;
                    if (init?.type === 'CallExpression' && init.callee.property?.name === 'createElement' && literal(init.arguments[0]) === 'style') return;
                }
                for (const leaf of leaves(node.right)) {
                    const text = literal(leaf);
                    if (visible(text)) findings.push({ line: node.loc.start.line, reason: 'raw UI copy', text });
                }
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
            if (key && value) catalogs[localeIds.indexOf(lang)][key] = value;
        }
    };
    linter.defineRule('product-catalog', { create() {
        return {
            CallExpression(node) { if (localeIds.includes(literal(node.arguments[0]))) readObject(node.arguments[1], literal(node.arguments[0])); },
            Property(node) { if (localeIds.includes(literal(node.key))) readObject(node.value, literal(node.key)); },
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
    for (const filename of ['public/scripts/login.js', 'public/scripts/entry-localization.js', 'public/scripts/user.js', 'public/scripts/popup.js', 'public/scripts/backup-sync-center.js', 'public/scripts/storage-management.js', 'public/scripts/storage-inspector.js', 'public/scripts/browser-storage-inspector.js', 'public/scripts/lan-sync.js', 'public/scripts/logging/workspace.js']) {
        for (const issue of auditProductSource(fs.readFileSync(path.join(root, filename), 'utf8'), filename)) findings.push({ filename, ...issue });
    }
    const entryHtml = fs.readFileSync(path.join(root, 'public/login.html'), 'utf8');
    for (const match of entryHtml.matchAll(/data-entry-(?:text|label|description)="([^"]+)"/g)) {
        const text = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
        const key = SHELL_TEXT_KEYS[text] || text;
        for (let index = 0; index < locales.length; index++) if (!locales[index][key]) findings.push({ filename: 'public/login.html', key, locale: index, reason: 'missing entry translation' });
    }
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
        for (const match of source.matchAll(/data-i18n="([^"]+)"/g)) for (const raw of match[1].replaceAll('&amp;', '&').replaceAll('&quot;', '"').split(';')) {
            const key = raw.replace(/^\[[^\]]+\]/, '');
            for (let index = 0; index < catalogs.length; index++) if (!catalogs[index][key]) findings.push({ filename, key, locale: index, reason: 'missing template translation' });
        }
    }
    for (const name of ['backupSyncCenter.html', 'storageManagement.html', 'storageInspector.html', 'userProfile.html', 'snapshotsView.html', 'changePassword.html', 'changeName.html', 'userLanSync.html']) {
        const filename = 'public/scripts/templates/' + name;
        const source = fs.readFileSync(path.join(root, filename), 'utf8');
        for (const match of source.matchAll(/data-i18n="([^"]+)"/g)) for (const raw of match[1].replaceAll('&amp;', '&').replaceAll('&quot;', '"').split(';')) {
            const text = raw.replace(/^\[[^\]]+\]/, '');
            const key = text;
            for (let index = 0; index < locales.length; index++) if (!locales[index][key]) findings.push({ filename, key, locale: index, reason: 'missing template translation' });
        }
    }
    for (const [text, key] of Object.entries(SHELL_TEXT_KEYS)) {
        for (let index = 0; index < locales.length; index++) {
            if (!locales[index][key] || placeholders(text) !== placeholders(locales[index][key])) findings.push({ filename: 'public/locales/' + localeIds[index] + '.json', text, reason: 'catalog key or placeholders incomplete', key });
        }
    }
    return findings;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const findings = auditProductLocalization();
    if (findings.length) { console.error(JSON.stringify(findings, null, 2)); process.exitCode = 1; } else console.log('Native product localization coverage passed (English source / ' + localeIds.join(', ') + ').');
}
