import { assertFrontendExperience, assertFrontendSourceIndex, FRONTEND_LIMITS, resourcePath } from '../../../public/shared/native-frontend-contract.js';
import { parseAui } from './aui-parser.js';
import { canonicalJson, compileBridge, hash } from './bridge.js';
import { validateStyle, compileStyle, linkStyle } from './styles.js';
import { validateFrontendGraph, componentDependencies } from './graph.js';

export function compileFrontend({ source, files, mode, namespace = 'package', experienceContract = {} }) {
    resourcePath(source); resourcePath(namespace);
    const consumed = new Set();
    let sourceBytes = 0;
    const read = path => {
        resourcePath(path);
        const bytes = files.get(path);
        if (!bytes || bytes.length > FRONTEND_LIMITS.bytes) throw new TypeError('Missing or oversized Frontend source: ' + path);
        if (!consumed.has(path)) sourceBytes += bytes.length;
        if (sourceBytes > FRONTEND_LIMITS.totalBytes) throw new TypeError('Frontend Source Graph exceeds byte budget');
        consumed.add(path);
        return Buffer.from(bytes);
    };
    const readText = path => new TextDecoder('utf-8', { fatal: true }).decode(read(path));
    const index = assertFrontendSourceIndex(JSON.parse(readText(source)));
    const base = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
    const resolve = path => resourcePath(base + path);
    const output = new Map(), resources = [], provenance = [], pendingStyles = [];
    const prefix = 'runtime/frontend/' + namespace;
    const emit = (id, kind, value, dependencies = [], mediaType = 'application/json') => {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(canonicalJson(value));
        const digest = hash(bytes);
        const path = prefix + '/resources/' + digest + (mediaType === 'application/json' ? '.json' : '.bin');
        output.set(path, bytes);
        resources.push({ id, kind, path, contentHash: digest, size: bytes.length, mediaType, dependencies: [...new Set(dependencies)].sort() });
    };
    const styleDependencies = (css, file, start = 0) => {
        try {
            return validateStyle(css).map(id => {
                if (!index.assets.some(asset => asset.id === id)) throw new TypeError('Unknown Style resource: ' + id);
                return 'asset:' + id;
            });
        } catch (cause) {
            const error = new TypeError(file + ':' + start + ': ' + cause.message, { cause });
            error.code = 'frontend_style_invalid';
            error.source = { file, start, end: start + css.length };
            throw error;
        }
    };
    const bridge = compileBridge(index.bridge ? JSON.parse(readText(resolve(index.bridge))) : undefined, experienceContract);
    emit('bridge', 'bridge', bridge);
    if (index.bridge) provenance.push({ kind: 'bridge', id: 'bridge', file: resolve(index.bridge), start: 0, end: readText(resolve(index.bridge)).length });
    for (const asset of index.assets) emit('asset:' + asset.id, 'asset', read(resolve(asset.source)), [], asset.mediaType);
    for (const style of index.styles) {
        const file = resolve(style.source), css = readText(file);
        pendingStyles.push({ id: 'style:' + style.id, css, dependencies: styleDependencies(css, file) });
        provenance.push({ kind: 'style', id: style.id, file, start: 0, end: css.length });
    }
    for (const component of index.components) {
        const file = resolve(component.source);
        let parsed;
        try { parsed = parseAui(readText(file), file); } catch (error) {
            throw new TypeError(file + ': ' + error.message, { cause: error });
        }
        const styles = [];
        if (parsed.style) {
            const id = 'style:component.' + component.id;
            const css = parsed.style.content;
            pendingStyles.push({ id, css, dependencies: styleDependencies(css, file, parsed.style.contentStart) });
            styles.push(id);
            provenance.push({ kind: 'style', id, file, start: parsed.style.contentStart, end: parsed.style.end });
        }
        const ir = { format: 'atria-component-ir', version: 3, id: component.id, root: parsed.ast.root, uses: parsed.ast.uses, styles, presentation: parsed.ast.presentation };
        // Declarative uses are inferred; explicit declarations may narrow future
        // controller handles but can never manufacture a registry entry.
        const inferred = new Set(ir.uses);
        const walk = node => {
            if (node.read) inferred.add(node.read);
            if (node.action) inferred.add(node.action);
            node.children.filter(child => typeof child !== 'string').forEach(walk);
        };
        for (const actions of Object.values(ir.presentation.interactions)) for (const action of actions) if (/^(read|action|operation)\./.test(action.kind)) inferred.add(action.target);
        walk(ir.root); ir.uses = [...inferred].sort();
        let dependencies;
        try { dependencies = componentDependencies(ir, bridge); } catch (cause) {
            const error = new TypeError(file + ': ' + cause.message, { cause });
            error.code = 'frontend_component_invalid';
            error.source = { file, start: 0, end: parsed.cst.source.length };
            throw error;
        }
        emit('component:' + component.id, 'component', ir, dependencies);
        provenance.push({ kind: 'component', id: component.id, file, start: 0, end: parsed.cst.source.length });
        provenance.push(...parsed.spans.map(span => ({ ...span, componentId: component.id })));
    }
    for (const view of index.views) {
        if (['hybrid', 'full'].includes(mode) && view.surface !== 'app.root') throw new TypeError('Stage View must use app.root');
        emit('view:' + view.id, 'view', { format: 'atria-view-ir', version: 3, ...view }, ['component:' + view.root]);
    }
    const fontNames = [...new Set(pendingStyles.flatMap(style => compileStyle(style.css).fonts.map(font => font.family)))].sort();
    for (const style of pendingStyles) emit(style.id, 'style', linkStyle(style.css, fontNames), style.dependencies);
    emit('provenance', 'provenance', { format: 'atria-frontend-provenance', version: 1, spans: provenance,
        sources: [...consumed].sort().map(file => ({ file, contentHash: hash(files.get(file)) })) });
    const compiled = { format: 'atria-frontend-index', version: 3, primaryView: 'view:' + index.primaryView, globalStyles: index.styles.map(style => 'style:' + style.id),
        resources: resources.sort((a, b) => a.id < b.id ? -1 : 1) };
    const entry = prefix + '/index.json';
    output.set(entry, Buffer.from(canonicalJson(compiled)));
    validateFrontendGraph({ entry, files: output, mode, experienceContract });
    return { entry, files: output, consumed };
}

// Called once by the formal Project Build path, also used by Studio Preview.
// Never called during install or activation.
export function compileProjectFrontends(packageSource, inputFiles) {
    const result = structuredClone(packageSource), files = new Map(inputFiles), consumed = new Set();
    const owners = [{ value: result, namespace: 'package' }, ...result.entryPoints.map(value => ({ value, namespace: value.entryPointId }))];
    for (const { value, namespace } of owners) {
        if (!value.runtime?.experience) continue;
        const experience = assertFrontendExperience(value.runtime.experience, { authoring: true });
        if (experience.mode === 'text') continue;
        const compiled = compileFrontend({ source: experience.frontend.source, files: inputFiles, mode: experience.mode, namespace,
            experienceContract: result.runtime?.experienceContract });
        for (const [path, bytes] of compiled.files) {
            if (files.has(path)) throw new TypeError('Author source collides with compiled artifact: ' + path);
            files.set(path, bytes);
        }
        compiled.consumed.forEach(path => consumed.add(path));
        value.runtime.experience = { ...experience, frontend: { kind: 'native', version: 3, entry: compiled.entry } };
    }
    consumed.forEach(path => files.delete(path));
    return { packageSource: result, files };
}
