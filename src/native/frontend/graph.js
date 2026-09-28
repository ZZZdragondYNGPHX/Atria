import { fields, identifier, list, resourcePath, FRONTEND_LIMITS } from '../../../public/shared/native-frontend-contract.js';
import { assertNode } from './aui-parser.js';
import { canonicalJson, hash, validateCompiledBridge } from './bridge.js';
import { validateStyle } from './styles.js';

export function componentDependencies(ir, bridge) {
    fields(ir, ['format', 'version', 'id', 'root', 'uses', 'styles']);
    if (ir.format !== 'atria-component-ir' || ir.version !== 3) throw new TypeError('Invalid Component IR');
    identifier(ir.id);
    const uses = list(ir.uses, identifier, id => id);
    for (const id of uses) if (!bridge.bindings.some(binding => binding.id === id)) throw new TypeError('Unknown Component Binding: ' + id);
    const deps = new Set(['bridge']);
    for (const id of list(ir.styles, id => {
        if (typeof id !== 'string' || !id.startsWith('style:')) throw new TypeError('Invalid Component Style reference');
        identifier(id.slice(6)); return id;
    }, id => id)) deps.add(id);
    const ids = new Set();
    let count = 0;
    const walk = (node, depth) => {
        if (++count > FRONTEND_LIMITS.nodes || depth > FRONTEND_LIMITS.depth) throw new TypeError('Component tree exceeds limits');
        if (typeof node === 'string') {
            if (node.length > FRONTEND_LIMITS.bytes) throw new TypeError('Text exceeds limits');
            return;
        }
        assertNode(node);
        if (ids.has(node.id)) throw new TypeError('Duplicate Node identity');
        ids.add(node.id);
        for (const [key, kind] of [['read', 'read'], ['action', 'action']]) {
            if (node[key] && (!uses.includes(node[key]) || !bridge.bindings.some(binding => binding.id === node[key] && binding.kind === kind))) throw new TypeError('Invalid Node Binding kind or scope');
        }
        if (node.component) deps.add('component:' + node.component);
        if (node.asset) deps.add('asset:' + node.asset);
        node.children.forEach(child => walk(child, depth + 1));
    };
    if (!ir.root || typeof ir.root !== 'object') throw new TypeError('Component requires root element');
    walk(ir.root, 0);
    return [...deps].sort();
}

// Validate bytes and semantic closure again at the untrusted Package boundary.
// Hashes alone do not establish that an artifact is safe IR.
export function validateFrontendGraph({ entry, files, mode, experienceContract = {} }) {
    resourcePath(entry);
    const read = path => {
        const bytes = files.get(path);
        if (!bytes || bytes.length > FRONTEND_LIMITS.bytes) throw new TypeError('Missing or oversized compiled Frontend resource: ' + path);
        return Buffer.from(bytes);
    };
    const json = path => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read(path)));
    const index = json(entry);
    fields(index, ['format', 'version', 'primaryView', 'resources']);
    if (index.format !== 'atria-frontend-index' || index.version !== 3) throw new TypeError('Runtime requires compiled Frontend Index');
    const prefix = entry.slice(0, entry.lastIndexOf('/') + 1) + 'resources/';
    let totalBytes = 0;
    const resources = list(index.resources, ref => {
        fields(ref, ['id', 'kind', 'path', 'contentHash', 'size', 'mediaType', 'dependencies']);
        if (!['view', 'component', 'bridge', 'style', 'asset', 'provenance'].includes(ref.kind)) throw new TypeError('Invalid Frontend resource kind');
        if (['bridge', 'provenance'].includes(ref.kind) ? ref.id !== ref.kind : typeof ref.id !== 'string' || !ref.id.startsWith(ref.kind + ':')) throw new TypeError('Invalid resource identity');
        if (!['bridge', 'provenance'].includes(ref.kind)) identifier(ref.id.slice(ref.kind.length + 1));
        if (!/^[a-f0-9]{64}$/.test(ref.contentHash) || ref.path !== prefix + ref.contentHash + (ref.mediaType === 'application/json' ? '.json' : '.bin')) throw new TypeError('Invalid exact resource path');
        const bytes = read(ref.path);
        totalBytes += bytes.length;
        if (totalBytes > FRONTEND_LIMITS.totalBytes) throw new TypeError('Compiled Frontend graph exceeds byte budget');
        if (bytes.length !== ref.size || hash(bytes) !== ref.contentHash) throw new TypeError('Frontend resource integrity mismatch');
        list(ref.dependencies, id => { if (typeof id !== 'string') throw new TypeError('Invalid dependency'); return id; }, id => id);
        return ref;
    });
    const refs = new Map(resources.map(ref => [ref.id, ref]));
    const bridgeRef = refs.get('bridge');
    if (!bridgeRef || !refs.has('provenance') || refs.get(index.primaryView)?.kind !== 'view') throw new TypeError('Incomplete Frontend graph');
    const bridge = json(bridgeRef.path);
    validateCompiledBridge(bridge, experienceContract);
    const visiting = new Set(), visited = new Set();
    const visit = id => {
        if (!refs.has(id)) throw new TypeError('Unknown exact Frontend resource: ' + id);
        if (visiting.has(id)) throw new TypeError('Cyclic Frontend resource graph');
        if (visited.has(id)) return;
        visiting.add(id); refs.get(id).dependencies.forEach(visit); visiting.delete(id); visited.add(id);
    };
    for (const ref of resources) {
        visit(ref.id);
        let dependencies = [];
        if (ref.kind !== 'asset' && ref.mediaType !== 'application/json') throw new TypeError('IR must be JSON');
        const ir = ref.kind === 'asset' ? null : json(ref.path);
        if (ref.kind === 'component') {
            if (ref.id !== 'component:' + ir.id) throw new TypeError('Component identity mismatch');
            dependencies = componentDependencies(ir, bridge);
        } else if (ref.kind === 'view') {
            fields(ir, ['format', 'version', 'id', 'root', 'surface']);
            identifier(ir.id); identifier(ir.root);
            if (ir.format !== 'atria-view-ir' || ir.version !== 3 || ref.id !== 'view:' + ir.id) throw new TypeError('Invalid View IR');
            if (!['app.root', 'chat.header', 'chat.footer', 'composer.before', 'composer.after', 'sidebar.left', 'sidebar.right', 'drawer', 'modal'].includes(ir.surface)
                || (['hybrid', 'full'].includes(mode) && ir.surface !== 'app.root')) throw new TypeError('Invalid View surface');
            dependencies = ['component:' + ir.root];
        } else if (ref.kind === 'style') {
            fields(ir, ['format', 'css']);
            if (ir.format !== 'atria-style') throw new TypeError('Invalid Style IR');
            dependencies = validateStyle(ir.css).map(id => 'asset:' + id).sort();
        } else if (ref.kind === 'asset') {
            if (!['image/png', 'image/jpeg', 'image/webp', 'font/woff', 'font/woff2'].includes(ref.mediaType)) throw new TypeError('Unsupported compiled asset');
        } else if (ref.kind === 'provenance') {
            fields(ir, ['format', 'version', 'spans', 'sources']);
            if (ir.format !== 'atria-frontend-provenance' || ir.version !== 1 || !Array.isArray(ir.spans) || ir.spans.length > FRONTEND_LIMITS.nodes * 4) throw new TypeError('Invalid Source Map');
            const sources = list(ir.sources, source => {
                fields(source, ['file', 'contentHash']); resourcePath(source.file);
                if (!/^[a-f0-9]{64}$/.test(source.contentHash)) throw new TypeError('Invalid source digest');
                return source;
            }, source => source.file);
            for (const span of ir.spans) {
                fields(span, ['kind', 'id', 'componentId', 'file', 'start', 'end']);
                if (!sources.some(source => source.file === span.file) || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end < span.start) throw new TypeError('Invalid source span');
            }
        }
        if (canonicalJson(dependencies) !== canonicalJson(ref.dependencies)) throw new TypeError('Frontend dependency closure mismatch');
    }
    return { index, resources, bridge };
}
