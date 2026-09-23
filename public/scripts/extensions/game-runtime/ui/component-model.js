export const EXPERIENCE_SURFACES = Object.freeze([
    'app.root',
    'chat.header',
    'chat.footer',
    'composer.before',
    'composer.after',
    'sidebar.left',
    'sidebar.right',
    'drawer',
    'modal',
]);

export const EXPERIENCE_COMPONENT_TYPES = Object.freeze([
    'container',
    'text',
    'button',
    'input',
    'native-slot',
]);

const TYPE_SET = new Set(EXPERIENCE_COMPONENT_TYPES);
const DEVICE_SET = new Set(['mobile', 'tablet', 'desktop']);
const ORIENTATION_SET = new Set(['portrait', 'landscape']);
const NATIVE_COMPONENT_SET = new Set(['conversation', 'composer']);
const ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const SELECTOR_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const COMMAND_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const MAX_COMPONENT_NODES = 512;
const MAX_COMPONENT_DEPTH = 32;
const BLOCKED_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function plain(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(label + ' must be an object');
    }
    return value;
}

function knownFields(value, allowed, label) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new Error(label + ` contains unknown field '${key}'`);
    }
}

function json(value, state, depth = 0) {
    state.nodes += 1;
    if (state.nodes > 1024) throw new Error('Component action arguments exceed maximum complexity');
    if (depth > 16) throw new Error('Component action arguments exceed maximum depth');
    if (
        value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
    ) return;
    if (Array.isArray(value)) {
        for (const item of value) json(item, state, depth + 1);
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            if (BLOCKED_JSON_KEYS.has(key)) throw new Error(`Component action arguments contain blocked key '${key}'`);
            json(item, state, depth + 1);
        }
        return;
    }
    throw new Error('Component action arguments must contain JSON values only');
}

function selectorId(value, label) {
    const id = String(value || '').trim();
    if (!SELECTOR_PATTERN.test(id)) throw new Error(label + ' requires a valid selector id');
    return id;
}

function stringList(values, allowed, label) {
    if (!Array.isArray(values) || values.length === 0) throw new Error(label + ' must be a non-empty array');
    const result = values.map(value => String(value || '').trim());
    if (new Set(result).size !== result.length || result.some(value => !allowed.has(value))) {
        throw new Error(label + ' contains unsupported or duplicate values');
    }
    return result;
}

function compileProps(raw, type, label) {
    if (raw === undefined) return Object.freeze({});
    const value = plain(raw, label + '.props');
    knownFields(value, new Set([
        'className',
        'text',
        'value',
        'placeholder',
        'disabled',
        'ariaLabel',
        'role',
        'component',
    ]), label + '.props');
    const output = {};
    for (const key of ['className', 'text', 'value', 'placeholder', 'ariaLabel', 'role']) {
        if (value[key] !== undefined) {
            if (typeof value[key] !== 'string') throw new Error(label + '.props.' + key + ' must be a string');
            output[key] = value[key];
        }
    }
    if (value.disabled !== undefined) {
        if (typeof value.disabled !== 'boolean') throw new Error(label + '.props.disabled must be a boolean');
        output.disabled = value.disabled;
    }
    if (type === 'native-slot') {
        const component = String(value.component || '').trim();
        if (!NATIVE_COMPONENT_SET.has(component)) {
            throw new Error(label + '.props.component must be conversation or composer');
        }
        output.component = component;
    } else if (value.component !== undefined) {
        throw new Error(label + '.props.component is only valid for native-slot');
    }
    return Object.freeze(output);
}

function compileBindings(raw, label) {
    if (raw === undefined) return Object.freeze({});
    const value = plain(raw, label + '.bindings');
    knownFields(value, new Set(['text', 'value', 'hidden']), label + '.bindings');
    const output = {};
    for (const key of ['text', 'value', 'hidden']) {
        if (value[key] !== undefined) output[key] = selectorId(value[key], label + '.bindings.' + key);
    }
    return Object.freeze(output);
}

function compileActions(raw, label) {
    if (raw === undefined) return Object.freeze({});
    const value = plain(raw, label + '.actions');
    knownFields(value, new Set(['click']), label + '.actions');
    if (value.click === undefined) return Object.freeze({});
    const action = plain(value.click, label + '.actions.click');
    knownFields(action, new Set(['commandId', 'mode', 'args']), label + '.actions.click');
    const commandId = String(action.commandId || '').trim();
    if (!COMMAND_PATTERN.test(commandId)) throw new Error(label + '.actions.click.commandId is invalid');
    const mode = String(action.mode || 'dispatch').trim();
    if (!['dispatch', 'simulate'].includes(mode)) throw new Error(label + '.actions.click.mode is unsupported');
    const args = action.args === undefined ? {} : structuredClone(action.args);
    plain(args, label + '.actions.click.args');
    json(args, { nodes: 0 });
    return Object.freeze({
        click: Object.freeze({ commandId, mode, args: Object.freeze(args) }),
    });
}

function compileVisibility(raw, label) {
    if (raw === undefined) return null;
    const value = plain(raw, label + '.visibility');
    knownFields(value, new Set(['selector', 'when']), label + '.visibility');
    const when = String(value.when || 'truthy').trim();
    if (!['truthy', 'falsy'].includes(when)) throw new Error(label + '.visibility.when is unsupported');
    return Object.freeze({
        selector: selectorId(value.selector, label + '.visibility.selector'),
        when,
    });
}

function compileResponsive(raw, label) {
    if (raw === undefined) return null;
    const value = plain(raw, label + '.responsive');
    knownFields(value, new Set(['devices', 'orientations']), label + '.responsive');
    if (value.devices === undefined && value.orientations === undefined) {
        throw new Error(label + '.responsive must declare devices or orientations');
    }
    return Object.freeze({
        ...(value.devices === undefined ? {} : {
            devices: Object.freeze(stringList(value.devices, DEVICE_SET, label + '.responsive.devices')),
        }),
        ...(value.orientations === undefined ? {} : {
            orientations: Object.freeze(stringList(value.orientations, ORIENTATION_SET, label + '.responsive.orientations')),
        }),
    });
}

export function compileExperienceComponentModel(raw, options = {}) {
    const mode = String(options.mode || '').trim();
    if (!['component', 'hybrid', 'full'].includes(mode)) {
        throw new Error('Component Model requires Component, Hybrid, or Full Experience mode');
    }

    const seen = new Set();
    const state = { nodes: 0, usesNativeComponents: false };

    function compileNode(input, depth, label) {
        if (depth > MAX_COMPONENT_DEPTH) throw new Error('Component Model exceeds maximum depth');
        state.nodes += 1;
        if (state.nodes > MAX_COMPONENT_NODES) throw new Error('Component Model exceeds maximum node count');

        const node = plain(input, label);
        knownFields(node, new Set([
            'id',
            'type',
            'props',
            'bindings',
            'actions',
            'visibility',
            'responsive',
            'children',
        ]), label);

        const id = String(node.id || '').trim();
        if (!ID_PATTERN.test(id)) throw new Error(label + '.id is invalid');
        if (seen.has(id)) throw new Error(`Duplicate Component Model id '${id}'`);
        seen.add(id);

        const type = String(node.type || '').trim();
        if (!TYPE_SET.has(type)) throw new Error(label + '.type is unsupported');
        if (type === 'native-slot') {
            if (mode === 'component') throw new Error('Component Experience cannot claim Native Conversation/Composer slots');
            state.usesNativeComponents = true;
        }

        const children = node.children === undefined ? [] : node.children;
        if (!Array.isArray(children)) throw new Error(label + '.children must be an array');
        if (type === 'input' && children.length) throw new Error(label + '.children are not supported for input');
        if (type === 'native-slot' && children.length) throw new Error(label + '.children are not supported for native-slot');

        return Object.freeze({
            id,
            type,
            props: compileProps(node.props, type, label),
            bindings: compileBindings(node.bindings, label),
            actions: compileActions(node.actions, label),
            visibility: compileVisibility(node.visibility, label),
            responsive: compileResponsive(node.responsive, label),
            children: Object.freeze(children.map((child, index) => compileNode(
                child,
                depth + 1,
                label + '.children[' + index + ']',
            ))),
        });
    }

    const root = compileNode(raw, 0, 'ComponentModel');
    return Object.freeze({
        root,
        nodeCount: state.nodes,
        usesNativeComponents: state.usesNativeComponents,
    });
}

function tagFor(type) {
    if (type === 'text') return 'span';
    if (type === 'button') return 'button';
    if (type === 'input') return 'input';
    return 'div';
}

export function setComponentHiddenReason(element, reason, hidden) {
    if (!element?.dataset) return;
    const key = 'atriaHidden' + String(reason || '')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    if (!key || key === 'atriaHidden') throw new Error('Component hidden reason is invalid');
    element.dataset[key] = hidden ? 'true' : 'false';
    element.hidden = Object.entries(element.dataset).some(
        ([name, value]) => name.startsWith('atriaHidden') && value === 'true',
    );
}

export function applyResponsiveComponentVisibility(root, environment) {
    if (!root?.querySelectorAll) return;
    for (const element of root.querySelectorAll('[data-atria-responsive-devices], [data-atria-responsive-orientations]')) {
        const devices = String(element.dataset.atriaResponsiveDevices || '').split(',').filter(Boolean);
        const orientations = String(element.dataset.atriaResponsiveOrientations || '').split(',').filter(Boolean);
        const hidden = (devices.length > 0 && !devices.includes(environment.device))
            || (orientations.length > 0 && !orientations.includes(environment.orientation));
        setComponentHiddenReason(element, 'responsive', hidden);
    }
}

export function renderExperienceComponentModel(documentRef, compiled) {
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new Error('Component Model renderer requires a document');
    }
    if (!compiled?.root) throw new Error('Component Model renderer requires a compiled model');

    function render(node) {
        const element = documentRef.createElement(tagFor(node.type));
        element.dataset.atriaComponentId = node.id;
        element.dataset.atriaComponentType = node.type;

        if (node.type === 'button') element.type = 'button';
        if (node.type === 'native-slot') {
            element.dataset.atriaNativeComponent = node.props.component;
        }

        if (node.props.className) element.className = node.props.className;
        if (node.props.text !== undefined) element.textContent = node.props.text;
        if (node.props.value !== undefined && 'value' in element) element.value = node.props.value;
        if (node.props.placeholder !== undefined && 'placeholder' in element) element.placeholder = node.props.placeholder;
        if (node.props.disabled !== undefined && 'disabled' in element) element.disabled = node.props.disabled;
        if (node.props.ariaLabel !== undefined) element.setAttribute('aria-label', node.props.ariaLabel);
        if (node.props.role !== undefined) element.setAttribute('role', node.props.role);

        for (const [binding, selector] of Object.entries(node.bindings)) {
            element.setAttribute('data-atria-bind-' + binding, selector);
        }
        if (node.actions.click) {
            element.dataset.atriaCommand = node.actions.click.commandId;
            element.dataset.atriaCommandMode = node.actions.click.mode;
            element.dataset.atriaCommandArgs = JSON.stringify(node.actions.click.args);
        }
        if (node.visibility) {
            element.dataset.atriaVisibleSelector = node.visibility.selector;
            element.dataset.atriaVisibleWhen = node.visibility.when;
        }
        if (node.responsive?.devices) {
            element.dataset.atriaResponsiveDevices = node.responsive.devices.join(',');
        }
        if (node.responsive?.orientations) {
            element.dataset.atriaResponsiveOrientations = node.responsive.orientations.join(',');
        }

        for (const child of node.children) element.appendChild(render(child));
        return element;
    }

    return render(compiled.root);
}
