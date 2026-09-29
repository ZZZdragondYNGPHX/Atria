import { fields, identifier, list, FRONTEND_LIMITS } from './native-frontend-contract.js';
import { compileDataSchema } from '../scripts/native/experience/ui/message-templates.js';
import { validateSchemaValue } from '../scripts/native/experience/world/schema.js';

export const DOM_TAGS = new Set('div span main section article aside header footer nav p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd button label input textarea select option optgroup form fieldset legend table caption colgroup col thead tbody tfoot tr th td img picture figure figcaption strong em small b i u s sub sup pre code blockquote abbr address time br hr details summary progress meter output a svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath mask title desc use component slot audio video canvas'.split(' '));
export const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'col']);
export const DOM_ATTRIBUTES = new Set('boundary-loading boundary-error boundary-retry controls loop muted preload playsinline id class title role tabindex type name value placeholder disabled checked selected multiple required min max step rows cols alt width height for inputmode enterkeyhint autocomplete spellcheck hidden open dir lang draggable slot colspan rowspan scope datetime viewBox d fill stroke stroke-width cx cy r rx ry x y x1 y1 x2 y2 points transform opacity offset stop-color stop-opacity preserveAspectRatio clip-path fill-rule stroke-linecap stroke-linejoin'.split(' '));
export const EVENTS = new Set('click dblclick contextmenu pointerdown pointerup pointermove pointerenter pointerleave pointercancel keydown keyup focus blur focusin focusout beforeinput compositionstart compositionupdate compositionend input change submit scroll wheel dragstart drag dragend dragenter dragleave dragover drop animationstart animationend animationiteration transitionend longpress swipe pinch'.split(' '));
const ROOTS = ['component', 'view', 'ui', 'draft', 'prefs', 'props', 'event', 'item', 'env', 'form', 'bridge'];
const presentationSchema = schema => compileDataSchema(schema, 0, { nodes: 0, maxArrayItems: 10000 });
const WRITABLE = ['component', 'view', 'ui', 'draft', 'prefs'];
export function valuePath(path, writable = false) {
    if (typeof path !== 'string' || path.length > 256) throw new TypeError('Invalid presentation path');
    const parts = path.split('.');
    if (!(writable ? WRITABLE : ROOTS).includes(parts[0]) || (writable && parts.length < 2)) throw new TypeError('Invalid presentation scope');
    parts.slice(1).forEach(identifier);
    return parts;
}
export function expression(value, depth = 0) {
    if (depth > 16) throw new TypeError('Expression depth exceeded');
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
    if (Array.isArray(value)) { if (value.length > 256) throw new TypeError('Expression budget'); return value.map(item => expression(item, depth + 1)); }
    if (value?.object !== undefined) { fields(value, ['object']); fields(value.object, Object.keys(value.object)); for (const [key, item] of Object.entries(value.object)) { identifier(key); expression(item, depth + 1); } return value; }
    if (value?.get !== undefined) { fields(value, ['get']); valuePath(value.get); return value; }
    if (value?.op !== undefined) {
        fields(value, ['op', 'args']);
        if (!['add', 'subtract', 'multiply', 'divide', 'eq', 'not', 'and', 'or', 'gt', 'lt', 'concat', 'choose'].includes(value.op)
            || !Array.isArray(value.args) || value.args.length > 16) throw new TypeError('Invalid expression operator');
        value.args.forEach(item => expression(item, depth + 1)); return value;
    }
    throw new TypeError('Only typed declarative expressions are supported');
}
export function evaluate(value, context) {
    if (Array.isArray(value)) return value.map(item => evaluate(item, context));
    if (!value || typeof value !== 'object') return value;
    if (value.object) return Object.fromEntries(Object.entries(value.object).map(([key, item]) => [key, evaluate(item, context)]));
    if (value.get) {
        const path = valuePath(value.get);
        const select = (current, key) => current != null && Object.hasOwn(current, key) ? current[key] : undefined;
        if (path[0] === 'bridge') {
            for (let end = path.length; end > 1; end--) {
                const id = path.slice(1, end).join('.');
                if (Object.hasOwn(context.bridge ?? {}, id)) return path.slice(end).reduce(select, context.bridge[id]);
            }
        }
        return path.reduce(select, context);
    }
    const args = value.args.map(item => evaluate(item, context));
    switch (value.op) {
        case 'add': return args.reduce((a, b) => Number(a) + Number(b), 0);
        case 'subtract': return Number(args[0]) - Number(args[1]);
        case 'multiply': return args.reduce((a, b) => Number(a) * Number(b), 1);
        case 'divide': return Number(args[0]) / Number(args[1]);
        case 'eq': return args[0] === args[1];
        case 'not': return !args[0];
        case 'and': return args.every(Boolean);
        case 'or': return args.some(Boolean);
        case 'gt': return args[0] > args[1];
        case 'lt': return args[0] < args[1];
        case 'concat': return args.map(item => String(item ?? '')).join('');
        case 'choose': return args[0] ? args[1] : args[2];
        default: throw new TypeError('Invalid expression');
    }
}
export function assertValue(value, schema) {
    if (!validateSchemaValue(value, schema).ok) throw new TypeError('Presentation value does not match declared schema');
    return structuredClone(value);
}
export function assertPresentationContract(value = {}) {
    fields(value, ['props', 'emits', 'slots', 'state', 'interactions', 'lifecycle', 'nodeRefs', 'dynamicStyles']);
    const out = { props: {}, emits: {}, slots: [], state: {}, interactions: {}, lifecycle: {}, nodeRefs: [], dynamicStyles: {} };
    const record = (raw, transform) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 128) throw new TypeError('Invalid presentation declaration');
        return Object.fromEntries(Object.entries(raw).map(([id, item]) => [identifier(id), transform(item)]));
    };
    out.props = record(value.props ?? {}, item => {
        fields(item, ['schema', 'default']); const schema = presentationSchema(item.schema);
        return { schema, ...(Object.hasOwn(item, 'default') ? { default: assertValue(item.default, schema) } : {}) };
    });
    out.emits = record(value.emits ?? {}, presentationSchema);
    out.slots = list(value.slots ?? [], identifier, id => id);
    fields(value.state ?? {}, WRITABLE);
    for (const [scope, item] of Object.entries(value.state ?? {})) {
        fields(item, ['schema', 'initial']); const schema = presentationSchema(item.schema);
        if (schema.type !== 'object') throw new TypeError('State requires closed object schema');
        out.state[scope] = { schema, initial: assertValue(item.initial, schema) };
    }
    out.interactions = record(value.interactions ?? {}, actions => {
        if (!Array.isArray(actions) || actions.length > 32) throw new TypeError('Interaction budget exceeded');
        return actions.map(action => {
            fields(action, ['kind', 'target', 'value', 'cursor', 'operationId']);
            if (action.cursor !== undefined) expression(action.cursor);
            if (action.operationId !== undefined) expression(action.operationId);
            if (['set', 'toggle'].includes(action.kind)) valuePath(action.target, true);
            else if (['emit', 'view.push', 'view.replace', 'overlay.open', 'focus', 'read.snapshot', 'read.page', 'action.invoke', 'operation.start', 'operation.cancel'].includes(action.kind)) identifier(action.target);
            else if (!['view.back', 'overlay.close', 'locale.set', 'announce'].includes(action.kind)) throw new TypeError('Unknown presentation action');
            if (action.value !== undefined) expression(action.value);
            if (action.kind === 'set' && action.value === undefined) throw new TypeError('Set requires a value');
            return action;
        });
    });
    fields(value.lifecycle ?? {}, ['mount', 'unmount', 'activate', 'deactivate', 'propsChanged']);
    for (const [event, id] of Object.entries(value.lifecycle ?? {})) {
        if (!Object.hasOwn(out.interactions, id)) throw new TypeError('Unknown lifecycle interaction');
        out.lifecycle[event] = id;
    }
    out.nodeRefs = list(value.nodeRefs ?? [], identifier, id => id);
    out.dynamicStyles = record(value.dynamicStyles ?? {}, declaration => {
        fields(declaration, ['property', 'type', 'tokens']);
        if (typeof declaration.property !== 'string' || !/^(?:--[a-z][a-z0-9-]*|opacity|width|height|gap|color|background-color|font-size|transform)$/.test(declaration.property)
            || !['number', 'integer', 'length', 'percentage', 'angle', 'color', 'opacity', 'token', 'translateX', 'rotate'].includes(declaration.type)) throw new TypeError('Invalid typed style declaration');
        if (declaration.type === 'token') list(declaration.tokens, token => { if (typeof token !== 'string' || !/^[a-zA-Z0-9 _-]{1,64}$/.test(token)) throw new TypeError('Invalid style token'); return token; }, token => token);
        return declaration;
    });
    return out;
}
export function styleValue(declaration, value) {
    const type = declaration.type;
    if (['number', 'integer', 'length', 'percentage', 'angle', 'opacity', 'translateX', 'rotate'].includes(type)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6 || (type === 'integer' && !Number.isInteger(value))) throw new TypeError('Invalid numeric style');
        if (type === 'opacity' && (value < 0 || value > 1)) throw new TypeError('Invalid opacity');
        if (type === 'translateX') return 'translateX(' + value + 'px)';
        if (type === 'rotate') return 'rotate(' + value + 'deg)';
        return String(value) + ({ length: 'px', percentage: '%', angle: 'deg' }[type] ?? '');
    }
    if (type === 'color' && typeof value === 'string' && /^(?:#[a-fA-F0-9]{3,8}|[a-zA-Z]{1,24})$/.test(value)) return value;
    if (type === 'token' && declaration.tokens.includes(value)) return value;
    throw new TypeError('Invalid typed style value');
}
export function assertPresentationNode(node) {
    fields(node, ['id', 'tag', 'attributes', 'children', 'read', 'action', 'component', 'asset', 'bindings', 'events', 'props', 'styles', 'each', 'key', 'windowSize', 'rowHeight', 'condition', 'slot', 'media', 'message', 'messageArgs', 'boundary']);
    identifier(node.id);
    if (!DOM_TAGS.has(node.tag)) throw new TypeError('Unsupported semantic element: ' + node.tag);
    if (!node.attributes || Array.isArray(node.attributes)) throw new TypeError('Invalid DOM attributes');
    for (const [name, value] of Object.entries(node.attributes)) {
        if ((!DOM_ATTRIBUTES.has(name) && !/^aria-[a-z-]+$/.test(name)) || typeof value !== 'string' || value.length > 4096) throw new TypeError('Unsupported DOM attribute: ' + name);
        if (['fill', 'stroke', 'clip-path'].includes(name) && (value.includes('\\') || (/url\s*\(/i.test(value) && !/^url\(#[a-zA-Z][\w-]*\)$/.test(value)))) throw new TypeError('SVG resource must be local fragment');
    }
    if (node.tag === 'input' && ['file', 'image'].includes(node.attributes.type?.toLowerCase())) throw new TypeError('Unsupported input type');
    if (node.tag === 'canvas') for (const key of ['width', 'height']) if (node.attributes[key] !== undefined && (!/^\d+$/.test(node.attributes[key]) || Number(node.attributes[key]) < 1 || Number(node.attributes[key]) > 2048)) throw new TypeError('Canvas dimensions exceed budget');
    for (const key of ['read', 'action', 'component', 'asset', 'slot', 'media', 'message']) if (node[key] !== undefined) identifier(node[key]);
    if ((node.tag === 'component') !== (node.component !== undefined)) throw new TypeError('Invalid Component reference');
    if (node.asset !== undefined && !['img', 'audio', 'video'].includes(node.tag)) throw new TypeError('Asset sink requires image/audio/video');
    if (node.media && (node.tag !== 'img' || node.asset || node.bindings?.media)) throw new TypeError('Invalid declared media sink');
    if (node.bindings?.media && (!['img', 'audio', 'video'].includes(node.tag) || node.asset)) throw new TypeError('Invalid typed media sink');
    if (node.message && (node.children.length || node.bindings?.text || node.bindings?.prose)) throw new TypeError('Localized message owns text');
    for (const [key, expr] of Object.entries(node.messageArgs ?? {})) { identifier(key); expression(expr); }
    if (node.boundary !== undefined && !['local', 'required'].includes(node.boundary)) throw new TypeError('Invalid Boundary');
    if (!Array.isArray(node.children) || node.children.length > FRONTEND_LIMITS.nodes || (VOID_TAGS.has(node.tag) && node.children.length)) throw new TypeError('Invalid element children');
    for (const [name, value] of Object.entries(node.bindings ?? {})) {
        if (!['media', 'text', 'prose', 'value', 'checked', 'disabled', 'hidden', 'class', 'title', 'aria-label'].includes(name)) throw new TypeError('Unsupported binding sink');
        expression(value);
        if (name === 'prose' && (node.children.length || node.bindings.text)) throw new TypeError('Prose owns its inert children');
    }
    for (const [event, id] of Object.entries(node.events ?? {})) { if (node.tag !== 'component' && !EVENTS.has(event)) throw new TypeError('Unsupported event'); identifier(event); identifier(id); }
    for (const record of [node.props ?? {}, node.styles ?? {}]) for (const [id, value] of Object.entries(record)) { identifier(id); expression(value); }
    if (node.condition) expression(node.condition);
    if (node.each) { expression(node.each); identifier(node.key); }
    if (node.windowSize !== undefined && (!node.each || !Number.isInteger(node.windowSize) || node.windowSize < 1 || node.windowSize > 200 || !Number.isFinite(node.rowHeight) || node.rowHeight < 16 || node.rowHeight > 1000)) throw new TypeError('Invalid virtual list window');
    return node;
}
