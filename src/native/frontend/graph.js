import { fields, identifier, list, resourcePath, FRONTEND_LIMITS } from '../../../public/shared/native-frontend-contract.js';
import { assertNode } from './aui-parser.js';
import { canonicalJson, hash, validateCompiledBridge } from './bridge.js';
import { validateCompiledStyle } from './styles.js';
import { assertPresentationContract, valuePath } from '../../../public/shared/native-frontend-presentation.js';

export function componentDependencies(ir, bridge) {
    fields(ir, ['format', 'version', 'id', 'root', 'uses', 'styles', 'presentation']);
    const presentation = assertPresentationContract(ir.presentation);
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
    const walk = (node, depth, repeated = false) => {
        if (++count > FRONTEND_LIMITS.nodes || depth > FRONTEND_LIMITS.depth) throw new TypeError('Component tree exceeds limits');
        if (typeof node === 'string') {
            if (node.length > FRONTEND_LIMITS.bytes) throw new TypeError('Text exceeds limits');
            return;
        }
        assertNode(node);
        repeated ||= Boolean(node.each);
        if (repeated && presentation.nodeRefs.includes(node.id)) throw new TypeError('NodeRef requires unique non-repeated node');
        if (node.bindings?.text && node.children.length) throw new TypeError('Text binding cannot replace children');
        if (!node.component && Object.keys(node.props ?? {}).length) throw new TypeError('Props require Component');
        for (const id of Object.values(node.events ?? {})) if (!Object.hasOwn(presentation.interactions, id)) throw new TypeError('Unknown local interaction');
        for (const id of Object.keys(node.styles ?? {})) if (!Object.hasOwn(presentation.dynamicStyles, id)) throw new TypeError('Undeclared dynamic style sink');
        if (node.tag === 'slot' && !presentation.slots.includes(node.slot ?? 'default')) throw new TypeError('Undeclared Component slot');
        if (node.bindings?.value || node.bindings?.checked) {
            const path = node.bindings.value?.get ?? node.bindings.checked?.get;
            valuePath(path, true);
            if (!['input', 'textarea', 'select'].includes(node.tag)) throw new TypeError('Form model requires an input element');
        }
        if (ids.has(node.id)) throw new TypeError('Duplicate Node identity');
        ids.add(node.id);
        for (const [key, kind] of [['read', 'read'], ['action', 'action']]) {
            if (node[key] && (!uses.includes(node[key]) || !bridge.bindings.some(binding => binding.id === node[key] && binding.kind === kind))) throw new TypeError('Invalid Node Binding kind or scope');
        }
        if (node.component) deps.add('component:' + node.component);
        if (node.asset) deps.add('asset:' + node.asset);
        node.children.forEach(child => walk(child, depth + 1, repeated));
    };
    if (!ir.root || typeof ir.root !== 'object') throw new TypeError('Component requires root element');
    walk(ir.root, 0);
    for (const id of presentation.nodeRefs) if (!ids.has(id)) throw new TypeError('Unknown declared NodeRef');
    for (const actions of Object.values(presentation.interactions)) for (const action of actions) {
        if (/^(read|action|operation)\./.test(action.kind) && (!uses.includes(action.target) || !bridge.bindings.some(binding => binding.id === action.target && binding.kind === action.kind.split('.')[0]))) throw new TypeError('Invalid interaction Binding kind or scope');
        if (action.kind === 'emit' && !Object.hasOwn(presentation.emits, action.target)) throw new TypeError('Undeclared emit');
        if (action.kind === 'focus' && !presentation.nodeRefs.includes(action.target)) throw new TypeError('Focus requires declared NodeRef');
        if (action.kind === 'set' || action.kind === 'toggle') {
            const [scope, ...path] = valuePath(action.target, true);
            let schema = presentation.state[scope]?.schema;
            if (scope === 'component' && !schema) throw new TypeError('Undeclared Component state');
            if (schema) {
                for (const key of path) schema = schema?.properties?.[key];
                if (!schema || (action.kind === 'toggle' && schema.type !== 'boolean')) throw new TypeError('Invalid state write target');
            }
        }
    }
    // Lifecycle must not recursively mount/reroute itself. Explicit user
    // interactions own routing; lifecycle remains local presentation work.
    for (const id of Object.values(presentation.lifecycle)) if (presentation.interactions[id].some(action => /^(view\.|overlay\.)/.test(action.kind))) throw new TypeError('Lifecycle cannot navigate');
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
    fields(index, ['format', 'version', 'primaryView', 'resources', 'globalStyles']);
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
    list(index.globalStyles ?? [], id => { if (refs.get(id)?.kind !== 'style') throw new TypeError('Unknown global style'); return id; }, id => id);
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
            dependencies = validateCompiledStyle(ir).map(id => 'asset:' + id).sort();
        } else if (ref.kind === 'asset') {
            if (!['image/png', 'image/jpeg', 'image/webp', 'font/woff', 'font/woff2', 'font/ttf', 'font/otf'].includes(ref.mediaType)) throw new TypeError('Unsupported compiled asset');
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
    const components = new Map(resources.filter(ref => ref.kind === 'component').map(ref => [ref.id.slice(10), json(ref.path)]));
    const sharedState = {};
    for (const component of components.values()) for (const scope of ['ui', 'draft', 'prefs']) {
        const declaration = component.presentation?.state?.[scope];
        if (!declaration) continue;
        if (sharedState[scope] && canonicalJson(sharedState[scope]) !== canonicalJson(declaration)) throw new TypeError('Conflicting shared state declaration');
        sharedState[scope] = declaration;
    }
    for (const ir of components.values()) {
        const contract = assertPresentationContract(ir.presentation);
        for (const actions of Object.values(contract.interactions)) for (const action of actions) {
            if (['view.push', 'view.replace', 'overlay.open'].includes(action.kind) && refs.get('view:' + action.target)?.kind !== 'view') throw new TypeError('Unknown route View');
        }
        const walk = node => {
            if (typeof node === 'string') return;
            if (node.component) {
                const child = assertPresentationContract(components.get(node.component).presentation);
                for (const key of Object.keys(node.props ?? {})) if (!Object.hasOwn(child.props, key)) throw new TypeError('Undeclared Component prop');
                for (const [key, value] of Object.entries(child.props)) if (!Object.hasOwn(value, 'default') && !Object.hasOwn(node.props ?? {}, key)) throw new TypeError('Missing required Component prop');
                for (const key of Object.keys(node.events ?? {})) if (!Object.hasOwn(child.emits, key)) throw new TypeError('Undeclared Component event');
                for (const content of node.children) {
                    if (typeof content === 'string' && !content.trim()) continue;
                    if (!child.slots.includes(content.attributes?.slot ?? 'default')) throw new TypeError('Undeclared supplied Component slot');
                }
            }
            node.children.forEach(walk);
        };
        walk(ir.root);
    }
    for (const ref of resources.filter(ref => ref.kind === 'view')) {
        const view = json(ref.path), root = components.get(view.root), reachable = new Set();
        const collect = id => { if (reachable.has(id)) return; reachable.add(id); refs.get('component:' + id).dependencies.filter(dep => dep.startsWith('component:')).forEach(dep => collect(dep.slice(10))); };
        collect(view.root);
        const state = { ...sharedState };
        for (const id of reachable) {
            const declaration = components.get(id).presentation?.state?.view;
            if (!declaration) continue;
            if (state.view && canonicalJson(state.view) !== canonicalJson(declaration)) throw new TypeError('Conflicting View state declaration');
            state.view = declaration;
        }
        for (const prop of Object.values(root.presentation?.props ?? {})) if (!Object.hasOwn(prop, 'default')) throw new TypeError('View root requires default props');
        for (const id of reachable) {
            const contract = assertPresentationContract(components.get(id).presentation);
            const checkWrite = target => {
                const [scope, ...path] = valuePath(target, true);
                let schema = (scope === 'component' ? contract.state.component : state[scope])?.schema;
                for (const key of path) schema = schema?.properties?.[key];
                if (!schema) throw new TypeError('Undeclared state write path');
            };
            for (const actions of Object.values(contract.interactions)) for (const action of actions) if (['set', 'toggle'].includes(action.kind)) checkWrite(action.target);
            const walk = node => {
                if (typeof node === 'string') return;
                for (const sink of ['value', 'checked']) if (node.bindings?.[sink]) checkWrite(node.bindings[sink].get);
                node.children.forEach(walk);
            };
            walk(components.get(id).root);
        }
    }
    return { index, resources, bridge };
}
