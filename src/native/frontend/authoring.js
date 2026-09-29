import { assertFrontendSourceIndex, resourcePath, FRONTEND_LIMITS, fields, frontendFeatureAvailability } from '../../../public/shared/native-frontend-contract.js';
import { validateFrontendCapabilities } from '../experience-validation.js';
import { mediaOrigins } from '../../../public/shared/native-frontend-media.js';
import { parseAui } from './aui-parser.js';
import { compileFrontend } from './compiler.js';
import { hash } from './bridge.js';
import { editJson, editNode, replaceSpan } from './source-edits.js';

export function frontendOwners(source) {
    return [{ id: 'package', value: source.package }, ...(source.package?.entryPoints || []).map(value => ({ id: value.entryPointId, value }))]
        .filter(({ value }) => value?.runtime?.experience?.frontend?.version === 3)
        .map(({ id, value }) => ({ id, ...value.runtime.experience }));
}
function read(files, path) {
    resourcePath(path);
    const bytes = files.get(path);
    if (!bytes || bytes.length > FRONTEND_LIMITS.bytes) throw new TypeError('Missing or oversized Frontend source: ' + path);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
function location(file, text, start = 0, end = start) {
    const lines = text.slice(0, start).split('\n');
    return { file, start, end, line: lines.length, column: lines.at(-1).length + 1 };
}
function diagnostic(error, fallback, files) {
    let cause = error;
    while (!cause.source && cause.cause) cause = cause.cause;
    const source = { ...(cause.source || { file: fallback, start: 0, end: 0 }) };
    if (source.start === undefined && source.line) {
        const lines = (files.get(source.file)?.toString('utf8') || '').split('\n');
        source.start = lines.slice(0, source.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + (source.column || 1) - 1;
        source.end = source.start;
    }
    return { severity: 'error', code: cause.code || 'frontend_source_invalid', message: error.message,
        source: { ...location(source.file, files.get(source.file)?.toString('utf8') || '', source.start, source.end), ...source }, path: source.file };
}

// A read-only source projection, never an editable IR or another runtime.
export function inspectFrontend({ source, files, ownerId = 'package' }) {
    const owner = frontendOwners(source).find(item => item.id === ownerId);
    if (!owner) throw new TypeError('Unknown Native Frontend owner');
    const path = owner.frontend.source, entries = [], diagnostics = [];
    let remoteOrigins = [];
    const add = (kind, id, file, extra = {}) => entries.push({ kind, id, file, ...extra });
    try {
        const index = assertFrontendSourceIndex(JSON.parse(read(files, path)));
        const base = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
        const resolve = file => resourcePath(base + file);
        add('index', 'index', path);
        index.views.forEach(view => add('view', view.id, path, { value: view, root: view.root }));
        for (const component of index.components) {
            const file = resolve(component.source);
            add('component', component.id, file);
            try {
                const parsed = parseAui(read(files, file), file);
                entries.at(-1).value = JSON.parse(parsed.cst.blocks.find(block => block.kind === 'contract')?.content || '{}');
                entries.at(-1).uses = parsed.ast.uses;
                const contract = entries.at(-1).value;
                for (const kind of ['state', 'interaction']) for (const [id, value] of Object.entries(contract[kind === 'state' ? 'state' : 'interactions'] || {})) add(kind, id, file, { componentId: component.id, value });
                const nodes = new Map();
                const visit = node => { if (typeof node === 'string') return; nodes.set(node.id, node); node.children.forEach(visit); }; visit(parsed.ast.root);
                for (const span of parsed.spans.filter(span => span.kind === 'node')) {
                    const node = nodes.get(span.id);
                    add('node', span.id, file, { componentId: component.id, value: { tag: node.tag, text: node.children.filter(child => typeof child === 'string').join(''), attributes: node.attributes }, source: location(file, parsed.cst.source, span.start, span.end) });
                }
                if (parsed.style) add('style', component.id, file, { componentId: component.id, value: parsed.style.content });
                if (parsed.ast.controller) add('controller', component.id, resolve(parsed.ast.controller.source));
            } catch (error) { diagnostics.push(diagnostic(error, file, files)); }
        }
        index.styles.forEach(style => add('style', style.id, resolve(style.source), { value: read(files, resolve(style.source)) }));
        for (const kind of ['bridge', 'localization', 'media']) if (index[kind]) add(kind, kind, resolve(index[kind]));
        index.assets.forEach(asset => add('asset', asset.id, resolve(asset.source), { readOnly: true }));
        if (index.bridge) {
            const file = resolve(index.bridge);
            for (const binding of JSON.parse(read(files, file)).bindings || []) add('binding', binding.id, file, { value: binding });
        }
        if (index.localization) {
            const file = resolve(index.localization), catalogs = JSON.parse(read(files, file)).catalogs || {};
            for (const [locale, catalog] of Object.entries(catalogs)) for (const key of Object.keys(catalog.messages || {})) add('message', key, file, { locale, value: catalog.messages[key] });
        }
    } catch (error) { diagnostics.push(diagnostic(error, path, files)); }
    if (!entries.length) add('index', 'index', path);
    try {
        const compiled = compileFrontend({ source: path, files, mode: owner.mode, experienceContract: source.package.runtime?.experienceContract });
        const index = JSON.parse(compiled.files.get(compiled.entry));
        validateFrontendCapabilities(owner, index, compiled.files, source.package.permissions);
        const get = kind => JSON.parse(compiled.files.get(index.resources.find(ref => ref.kind === kind).path));
        if (index.resources.some(ref => ref.kind === 'media')) remoteOrigins = mediaOrigins(get('media'));
        const spans = get('provenance').spans;
        for (const item of get('provenance').sources) if (!entries.some(entry => entry.file === item.file)) add('module', item.file, item.file);
        for (const item of get('diagnostics')) {
            const span = spans.find(span => span.kind === 'node' && span.componentId + ':' + span.id === item.sourceId)
                || spans.find(span => span.id === item.sourceId || span.kind + ':' + span.id === item.sourceId);
            const locale = entries.find(entry => entry.kind === 'message' && entry.locale + ':' + entry.id === item.sourceId)
                || entries.find(entry => entry.kind === 'localization');
            const file = span?.file || locale?.file || path;
            diagnostics.push({ ...item, severity: 'warning', code: item.reasonCode, message: item.reasonCode, path: file,
                source: location(file, read(files, file), span?.start, span?.end) });
        }
    } catch (error) {
        const item = diagnostic(error, path, files);
        if (!diagnostics.some(existing => existing.message === item.message)) diagnostics.push(item);
    }
    for (const item of diagnostics) if (files.has(item.source.file) && !entries.some(entry => entry.file === item.source.file)) add('source', item.source.file, item.source.file);
    for (const entry of entries) entry.contentHash = files.has(entry.file) ? hash(files.get(entry.file)) : null;
    return { ownerId, previewEntryPointId: ownerId === 'package' ? source.package.entryPoints?.find(entry => !entry.runtime?.experience)?.entryPointId ?? null : ownerId,
        owners: frontendOwners(source).map(({ id, mode, frontend }) => ({ id, mode, source: frontend.source })), entries, diagnostics, remoteOrigins,
        features: (owner.features || []).map(feature => { try { return frontendFeatureAvailability([{ ...feature, required: false }]).map(item => ({ ...item, required: feature.required }))[0]; } catch { return { ...feature, status: 'unavailable', reasonCode: 'frontend_feature_invalid' }; } }),
        permissions: source.package.permissions || [], status: diagnostics.some(item => item.severity === 'error') ? 'failed' : 'passed' };
}

// Edits resolve semantic IDs against the current source snapshot. Project revision
// guards and transactional validation belong to the existing Studio Workspace.
export function planFrontendPatch(snapshot, input) {
    fields(input, ['ownerId', 'kind', 'id', 'componentId', 'locale', 'field', 'path', 'value', 'contentHash']);
    if (!Object.hasOwn(input, 'value')) throw new TypeError('Semantic patch requires a value');
    const graph = inspectFrontend({ ...snapshot, ownerId: input.ownerId });
    const candidates = graph.entries.filter(entry => entry.kind === input.kind && entry.id === input.id
        && (entry.componentId || undefined) === input.componentId && (entry.locale || undefined) === input.locale);
    if (candidates.length !== 1 || candidates[0].readOnly) throw new TypeError('Unknown or ambiguous semantic target');
    const entry = candidates[0], before = read(snapshot.files, entry.file);
    const baselineBytes = snapshot.baseFiles?.get(entry.file);
    if (input.contentHash !== (baselineBytes ? hash(baselineBytes) : entry.contentHash)) {
        const error = new TypeError('Frontend source content conflict');
        error.code = 'frontend_source_conflict'; error.details = { path: entry.file };
        throw error;
    }
    let after;
    const jsonPath = input.path ?? [];
    if (!Array.isArray(jsonPath) || jsonPath.length > 32 || jsonPath.some(key => typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))) throw new TypeError('Invalid semantic field path');
    if (entry.kind === 'node') after = editNode(before, entry.source, input);
    else if (['component', 'state', 'interaction'].includes(entry.kind) || entry.kind === 'style' && entry.componentId) {
        const parsed = parseAui(before, entry.file), kind = entry.kind === 'style' ? 'style' : 'contract';
        const block = parsed.cst.blocks.find(block => block.kind === kind);
        const targetPath = ['state', 'interaction'].includes(entry.kind) ? [entry.kind === 'state' ? 'state' : 'interactions', entry.id, ...jsonPath] : jsonPath;
        const content = kind === 'contract' ? editJson(block?.content || '{}', targetPath, input.value) : String(input.value);
        after = block ? replaceSpan(before, block.contentStart, block.contentStart + block.content.length, content)
            : before + (before.includes('\r\n') ? '\r\n' : '\n') + '<' + kind + '>' + content + '</' + kind + '>';
    } else if (entry.kind === 'style') after = String(input.value);
    else if (entry.kind === 'binding' || entry.kind === 'view') {
        const group = entry.kind === 'binding' ? 'bindings' : 'views';
        const index = JSON.parse(before)[group].findIndex(value => value.id === entry.id);
        if (jsonPath[0] === 'id' || !jsonPath.length && input.value?.id !== entry.id) throw new TypeError('Semantic identity is immutable');
        after = editJson(before, [group, String(index), ...jsonPath], input.value);
    } else if (entry.kind === 'message') after = editJson(before, ['catalogs', entry.locale, 'messages', entry.id, ...jsonPath], input.value);
    else throw new TypeError('Use source editing for this resource');
    if (Buffer.byteLength(after) > FRONTEND_LIMITS.bytes) throw new TypeError('Frontend source exceeds budget');
    return { path: entry.file, before: Buffer.from(before), after: Buffer.from(after) };
}
