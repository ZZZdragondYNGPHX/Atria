import { fields, identifier } from './native-frontend-contract.js';
import { assertPresentationContract, assertPresentationNode } from './native-frontend-presentation.js';
import { bridgeValue } from './native-frontend-bridge.js';

export const A2UI_VERSION = 'v0.9.1';
// The official v0_9_1 schema retains the v0_9 basic catalog identity.
export const A2UI_CATALOG = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const fail = reason => { throw new TypeError('A2UI ' + reason); };
const string = (value, max = 4096) => { if (typeof value !== 'string' || value.length > max) fail('text budget/type'); return value; };
const literal = value => value && typeof value === 'object' && !Array.isArray(value)
    ? { object: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, literal(item)])) }
    : Array.isArray(value) ? value.map(literal) : value;
function data(value, depth = 0) {
    if (depth > 8) fail('data depth');
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return string(value);
    if (Array.isArray(value)) { if (value.length > 64) fail('data budget'); return value.map(item => data(item, depth + 1)); }
    fields(value, Object.keys(value ?? {}), 'A2UI data');
    if (Object.keys(value).length > 64) fail('data budget');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => { identifier(key); return [key, data(item, depth + 1)]; }));
}

// A build-time, author-approved import. It lowers only public protocol data to
// the existing IR; no dynamic code, remote catalog fetch or new writer exists.
// The Source Index owns the allowed event -> Bridge mapping, separately from
// the external message bytes. Context values cannot read Native/Host state.
export function parseA2uiComponent(source, file, policy, bridge = null) {
    if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > 65536) fail('source budget');
    const messages = JSON.parse(source);
    if (!Array.isArray(messages) || !messages.length || messages.length > 32) fail('message budget');
    const actions = policy?.actions ?? {}, components = new Map();
    let surfaceId = null, model = {}, deleted = false;
    const resolve = value => {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'path')) return data(value);
        fields(value, ['path'], 'A2UI binding');
        if (typeof value.path !== 'string' || !/^\/[a-zA-Z][a-zA-Z0-9._-]*(?:\/[a-zA-Z][a-zA-Z0-9._-]*)*$/.test(value.path)) fail('binding path');
        let result = model;
        for (const key of value.path.slice(1).split('/')) {
            identifier(key);
            if (!result || typeof result !== 'object' || !Object.hasOwn(result, key)) fail('binding unavailable');
            result = result[key];
        }
        return data(result);
    };
    for (const message of messages) {
        fields(message, ['version', 'createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'], 'A2UI message');
        if (message.version !== A2UI_VERSION || Object.keys(message).length !== 2) fail('version/message');
        const kind = Object.keys(message).find(key => key !== 'version'), value = message[kind];
        if (kind === 'createSurface') {
            fields(value, ['surfaceId', 'catalogId'], 'A2UI surface');
            if (surfaceId || value.catalogId !== A2UI_CATALOG) fail('surface/catalog');
            surfaceId = identifier(value.surfaceId);
        } else {
            if (!surfaceId || deleted || value?.surfaceId !== surfaceId) fail('surface lifecycle');
            if (kind === 'updateComponents') {
                fields(value, ['surfaceId', 'components']);
                if (!Array.isArray(value.components) || !value.components.length || value.components.length > 64) fail('component budget');
                const seen = new Set();
                for (const component of value.components) {
                    identifier(component?.id);
                    if (['atriaA2uiHost', 'atriaA2uiStatus'].includes(component.id)) fail('reserved component identity');
                    if (seen.has(component.id)) fail('duplicate component'); seen.add(component.id);
                    const allowed = { Column: ['children'], Text: ['text', 'variant'], Button: ['child', 'action', 'variant'] }[component.component];
                    if (!allowed) fail('unknown component');
                    fields(component, ['id', 'component', ...allowed], 'A2UI component');
                    components.set(component.id, component);
                }
                if (components.size > 64) fail('component budget');
            } else if (kind === 'updateDataModel') {
                fields(value, ['surfaceId', 'path', 'value']);
                model = updateModel(model, value.path, value.value);
            } else if (kind === 'deleteSurface') { fields(value, ['surfaceId']); deleted = true; } else fail('unknown message');
        }
    }
    if (!surfaceId) fail('surface missing');
    const uses = new Set(), interactions = {}, visited = new Set(), visiting = new Set();
    const render = (id, depth = 0, buttonLabel = false) => {
        identifier(id);
        if (depth > 16 || visiting.has(id) || visited.has(id)) fail('tree depth/cycle/shared child');
        const component = components.get(id);
        if (!component) fail('missing component');
        visiting.add(id); visited.add(id);
        const node = { id, tag: 'div', attributes: {}, children: [] };
        if (component.component === 'Column') {
            if (buttonLabel || !Array.isArray(component.children) || component.children.length > 64) fail('column children');
            node.children = component.children.map(child => render(child, depth + 1));
        } else if (component.component === 'Text') {
            if (component.variant !== undefined && !['h1', 'h2', 'h3', 'h4', 'h5', 'caption', 'body'].includes(component.variant)) fail('text variant');
            node.tag = buttonLabel ? 'span' : /^h[1-5]$/.test(component.variant) ? component.variant : component.variant === 'caption' ? 'small' : 'p';
            node.children = [string(resolve(component.text))];
        } else {
            if (buttonLabel || component.variant !== undefined && !['default', 'primary', 'borderless'].includes(component.variant)) fail('button variant');
            fields(component.action, ['event'], 'A2UI action');
            fields(component.action.event, ['name', 'context'], 'A2UI event');
            const name = identifier(component.action.event.name), target = actions[name];
            if (!target) fail('event not allowed');
            // Native presentation paths use dot-separated segments. Decline
            // dotted binding IDs instead of silently losing busy/error state.
            if (typeof target !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(target)) fail('binding identity unsupported');
            const context = component.action.event.context ?? {};
            fields(context, Object.keys(context), 'A2UI event context');
            const input = Object.fromEntries(Object.entries(context).map(([key, value]) => { identifier(key); return [key, resolve(value)]; }));
            if (JSON.stringify(input).length > 4096) fail('action input budget');
            if (bridge) {
                const binding = bridge.bindings.find(binding => binding.id === target && binding.kind === 'action');
                if (!binding) fail('action binding unavailable');
                bridgeValue(input, binding.inputSchema);
            }
            if (components.get(component.child)?.component !== 'Text') fail('button requires Text label');
            node.children = [render(component.child, depth + 1, true)];
            if (!node.children[0].children[0].trim()) fail('button requires visible label');
            node.tag = policy.interactive === false ? 'p' : 'button';
            if (policy.interactive !== false) {
                if (!policy.feedback?.pending?.trim() || !policy.feedback?.failed?.trim()) fail('interaction feedback required');
                uses.add(target);
                const interaction = 'a2ui.' + id;
                interactions[interaction] = [{ kind: 'action.invoke', target, value: literal(input) }];
                node.attributes.type = 'button'; node.events = { click: interaction };
                node.bindings = { disabled: { op: 'eq', args: [{ get: 'bridge.' + target + '.status' }, 'running'] } };
            }
        }
        visiting.delete(id); assertPresentationNode(node); return node;
    };
    let root = deleted ? { id: 'root', tag: 'p', attributes: {}, children: [policy.fallbackText] } : render('root');
    if (!deleted && policy.stream !== true && visited.size !== components.size) fail('unreachable component');
    if (uses.size) {
        const anyStatus = status => ({ op: 'or', args: [...uses].map(target => ({ op: 'eq', args: [{ get: 'bridge.' + target + '.status' }, status] })) });
        root = { id: 'atriaA2uiHost', tag: 'div', attributes: {}, children: [root,
            { id: 'atriaA2uiStatus', tag: 'output', attributes: { role: 'status', 'aria-live': 'polite' }, children: [],
                bindings: { text: { op: 'choose', args: [anyStatus('running'), policy.feedback.pending,
                    { op: 'choose', args: [anyStatus('failed'), policy.feedback.failed, ''] }] } } },
        ] };
    }
    assertPresentationNode(root);
    return { cst: { source, blocks: [] }, ast: { root, uses: [...uses], presentation: assertPresentationContract({ interactions }) },
        spans: [...visited].map(id => ({ kind: 'node', id, file, start: 0, end: source.length, readOnly: true })), style: null,
        protocol: { version: A2UI_VERSION, surfaceId, interactive: policy.interactive !== false, deleted } };
}

function updateModel(model, path, value) {
    if (path === undefined || path === '/') return value === undefined ? {} : data(value);
    if (typeof path !== 'string' || !/^\/[a-zA-Z][a-zA-Z0-9._-]*(?:\/[a-zA-Z][a-zA-Z0-9._-]*)*$/.test(path)) fail('data path');
    const parts = path.slice(1).split('/'); parts.forEach(identifier);
    const next = structuredClone(model); let target = next;
    for (const key of parts.slice(0, -1)) {
        if (!target || typeof target !== 'object' || Array.isArray(target) || !Object.hasOwn(target, key)) fail('data path unavailable');
        target = target[key];
    }
    if (!target || typeof target !== 'object' || Array.isArray(target)) fail('data path unavailable');
    if (value === undefined) delete target[parts.at(-1)]; else target[parts.at(-1)] = data(value);
    return data(next);
}

// Materializes a bounded public surface. Invalid updates cannot replace the
// last valid projection or alter the author's event/Bridge allowlist.
export class A2uiProjection {
    constructor(messages, policy, bridge) {
        parseA2uiComponent(JSON.stringify(messages), 'initial.a2ui.json', policy, bridge);
        this.policy = policy; this.bridge = bridge; this.messages = [];
        for (const message of messages) this.push(message);
        this.surfaceId = this.messages[0]?.createSurface?.surfaceId;
    }
    push(message) {
        fields(message, ['version', 'createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'], 'A2UI stream message');
        if (message.version !== A2UI_VERSION || Object.keys(message).length !== 2) fail('version/message');
        const kind = Object.keys(message).find(key => key !== 'version'), value = message[kind];
        let next = structuredClone(this.messages);
        if (kind === 'createSurface') {
            fields(value, ['surfaceId', 'catalogId']); identifier(value.surfaceId);
            if (value.catalogId !== A2UI_CATALOG || this.surfaceId && value.surfaceId !== this.surfaceId) fail('surface/catalog');
            next = [message];
        } else {
            const surfaceId = next[0]?.createSurface?.surfaceId;
            if (!surfaceId || value?.surfaceId !== surfaceId || next.some(item => item.deleteSurface)) fail('surface lifecycle');
            if (kind === 'updateComponents') {
                fields(value, ['surfaceId', 'components']);
                if (!Array.isArray(value.components) || !value.components.length || value.components.length > 64) fail('component budget');
                const old = next.find(item => item.updateComponents)?.updateComponents.components ?? [];
                const components = new Map(old.map(item => [item.id, item]));
                const ids = new Set();
                for (const item of value.components) { identifier(item.id); if (ids.has(item.id)) fail('duplicate component'); ids.add(item.id); components.set(item.id, item); }
                next = next.filter(item => !item.updateComponents);
                next.push({ version: A2UI_VERSION, updateComponents: { surfaceId, components: [...components.values()] } });
            } else if (kind === 'updateDataModel') {
                fields(value, ['surfaceId', 'path', 'value']);
                const old = next.find(item => item.updateDataModel)?.updateDataModel.value ?? {};
                next = next.filter(item => !item.updateDataModel);
                next.splice(1, 0, { version: A2UI_VERSION, updateDataModel: { surfaceId, value: updateModel(old, value.path, value.value) } });
            } else if (kind === 'deleteSurface') { fields(value, ['surfaceId']); next.push(message); } else fail('unknown message');
        }
        let parsed = null;
        if (next.some(item => item.updateComponents || item.deleteSurface)) parsed = parseA2uiComponent(JSON.stringify(next), 'live.a2ui.json', this.policy, this.bridge);
        this.messages = structuredClone(next); return parsed;
    }
}

export async function consumeA2uiJsonLines(body, onMessage, { signal, maxBytes = 524288, maxMessages = 256 } = {}) {
    signal?.throwIfAborted();
    const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '', bytes = 0, count = 0;
    const deliver = async line => {
        if (!line.trim()) return;
        if (++count > maxMessages || new TextEncoder().encode(line).byteLength > 65536) fail('stream budget');
        signal?.throwIfAborted(); await onMessage(JSON.parse(line)); signal?.throwIfAborted();
    };
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            signal?.throwIfAborted(); const next = await reader.read();
            if (next.done) { buffer += decoder.decode(); break; }
            bytes += next.value.byteLength; if (bytes > maxBytes) fail('stream budget');
            buffer += decoder.decode(next.value, { stream: true });
            let index; while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1); await deliver(line); }
        }
        signal?.throwIfAborted(); await deliver(buffer); return { messages: count, bytes };
    } finally { signal?.removeEventListener('abort', abort); try { await reader.cancel(); } finally { reader.releaseLock(); } }
}
