import { EXPERIENCE_SURFACES } from './component-model.js';
import { compileState } from './v2-state.js';
import { compileMessageBlocks, MESSAGE_ROOTS, MESSAGE_ACTION_POLICIES } from './message-templates.js';
import { fields, id, json, text, valueTemplate, expression, UI_ROOTS } from './v2-values.js';

const TYPES = ['container', 'stack', 'grid', 'scroll', 'separator', 'text', 'badge', 'progress', 'button', 'details', 'form', 'input', 'textarea', 'select', 'checkbox', 'range', 'repeat', 'native-slot'];
const OPS = {
    'ui.set': ['path', 'value'], 'ui.toggle': ['path'], 'ui.reset': ['path'],
    'command.dispatch': ['commandId', 'args'], 'command.simulate': ['commandId', 'args'],
    'composer.set': ['value'], 'composer.append': ['value'], 'composer.clear': [], 'composer.focus': [], 'composer.submit': [],
    'surface.open': ['view'], 'surface.close': ['view'],
    'action.compensate': ['actionId'],
    'opening.next': [], 'opening.back': [], 'opening.confirm': [],
};
export function compileUiDocument(raw, { mode, message = false, actionPolicy = 'ui-only' } = {}) {
    raw = json(raw);
    fields(raw, ['schemaVersion', 'stateVersion', 'localState', 'preferences', 'selectors', 'actions', 'views', 'opening', 'messageBlocks', 'conversation'], 'UI Document');
    if (raw.schemaVersion !== 2 || !Number.isSafeInteger(raw.stateVersion) || raw.stateVersion < 1) throw new Error('UI Document requires schemaVersion 2 and positive stateVersion');
    if (message && ['messageBlocks', 'conversation', 'opening', 'selectors'].some(key => Object.hasOwn(raw, key))) throw new Error('Message document cannot declare messageBlocks, conversation, opening or selectors');
    if (message && !MESSAGE_ACTION_POLICIES.includes(actionPolicy)) throw new Error('Unknown message actionPolicy');
    const roots = message ? MESSAGE_ROOTS : UI_ROOTS;
    const localState = compileState(raw.localState, message ? ['mount'] : undefined);
    const preferences = compileState(raw.preferences, ['player', 'device']);
    const statePath = path => {
        const [root, key, extra] = String(path).split('.');
        const defs = root === 'ui' ? localState : root === 'prefs' ? preferences : {};
        if (extra !== undefined || !Object.hasOwn(defs, key)) throw new Error('Undeclared model/state path');
        return path;
    };
    const selectors = {};
    fields(raw.selectors ?? {}, Object.keys(raw.selectors ?? {}), 'UI selectors');
    for (const [key, source] of Object.entries(raw.selectors ?? {})) selectors[id(key)] = expression(source, roots);
    const actions = {};
    fields(raw.actions ?? {}, Object.keys(raw.actions ?? {}), 'UI actions');
    for (const [key, action] of Object.entries(raw.actions ?? {})) {
        id(key);
        fields(action, ['steps', 'constraints', 'idempotency', 'compensation'], 'UI action');
        if (!Array.isArray(action.steps) || !action.steps.length || action.steps.length > 32) throw new Error('Action requires 1..32 steps');
        if (action.idempotency !== undefined && !['request', 'revision'].includes(action.idempotency)) throw new Error('Unknown idempotency scope');
        if (message && action.compensation !== undefined) throw new Error('Message actions cannot declare compensation');
        if (action.compensation !== undefined) text(action.compensation, 64);
        let writes = 0;
        const steps = action.steps.map(step => {
            if (!Object.hasOwn(OPS, step?.op)) throw new Error('Unknown Action operation');
            fields(step, ['op', 'when', ...OPS[step.op]], 'Action step');
            if (message && !step.op.startsWith('ui.') && (actionPolicy === 'ui-only' || (step.op !== 'command.dispatch' && !step.op.startsWith('composer.')))) throw new Error('Message actionPolicy disallows ' + step.op);
            for (const required of OPS[step.op]) if (step[required] === undefined && required !== 'args') throw new Error('Missing Action field ' + required);
            if (step.path !== undefined) statePath(step.path);
            if (step.commandId !== undefined && (typeof step.commandId !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(step.commandId))) throw new Error('Invalid command id');
            if (['command.dispatch', 'action.compensate'].includes(step.op)) writes++;
            return Object.freeze({ ...step, when: step.when === undefined ? null : expression(step.when, roots),
                value: step.value === undefined ? null : valueTemplate(step.value, roots), args: valueTemplate(step.args ?? {}, roots) });
        });
        if (writes > 1) throw new Error('Use one typed Command for atomic authority writes');
        if (action.compensation !== undefined && (!/^[a-z][a-z0-9._-]{0,63}$/.test(action.compensation) || !steps.some(step => step.op === 'command.dispatch'))) throw new Error('Compensation requires a typed Command');
        if (action.constraints !== undefined && (!Array.isArray(action.constraints) || action.constraints.length > 64)) throw new Error('Invalid constraints');
        const constraints = (action.constraints ?? []).map(rule => {
            fields(rule, ['when', 'status', 'reasonCode', 'playerMessage'], 'Constraint');
            if (!['allowed', 'advisory', 'confirm_required', 'blocked'].includes(rule.status)) throw new Error('Unknown constraint status');
            return { ...rule, when: expression(rule.when, roots), reasonCode: text(rule.reasonCode, 128), playerMessage: text(rule.playerMessage, 1024) };
        });
        actions[key] = Object.freeze({ steps, constraints, idempotency: action.idempotency ?? 'request', compensation: action.compensation ?? null });
    }
    const nodeIds = new Set(); let nodes = 0;
    function node(rawNode, depth = 0, inRepeat = false, inForm = false) {
        if (++nodes > 512 || depth > 24) throw new Error('UI component budget exceeded');
        fields(rawNode, ['id', 'type', 'props', 'bindings', 'model', 'events', 'children', 'source', 'key', 'pageSize', 'emptyText'], 'UI node');
        id(rawNode.id);
        if (nodeIds.has(rawNode.id)) throw new Error('Duplicate UI node id');
        nodeIds.add(rawNode.id);
        if (!TYPES.includes(rawNode.type)) throw new Error('Unknown v2 node type');
        if (rawNode.type === 'native-slot' && (message || mode === 'component' || inRepeat)) throw new Error('Native slot ownership is invalid');
        if (rawNode.type === 'form' && inForm) throw new Error('Nested forms are invalid');
        const props = rawNode.props ?? {};
        fields(props, ['text', 'label', 'placeholder', 'disabled', 'component', 'options', 'submit', 'max', 'value'], 'UI props');
        for (const key of ['text', 'label', 'placeholder']) if (props[key] !== undefined) text(props[key]);
        for (const key of ['disabled', 'submit']) if (props[key] !== undefined && typeof props[key] !== 'boolean') throw new Error('Invalid UI boolean');
        if (props.submit !== undefined && rawNode.type !== 'button') throw new Error('Unexpected submit property');
        for (const key of ['max', 'value']) if (props[key] !== undefined && (rawNode.type !== 'progress' || typeof props[key] !== 'number' || !Number.isFinite(props[key]) || props[key] < 0)) throw new Error('Invalid progress property');
        if (props.max === 0 || props.value > (props.max ?? 100)) throw new Error('Invalid progress range');
        if (rawNode.type === 'native-slot' && !['conversation', 'composer'].includes(props.component)) throw new Error('Unknown Native slot');
        if (props.component !== undefined && rawNode.type !== 'native-slot') throw new Error('Unexpected Native component');
        if (props.options !== undefined) {
            if (rawNode.type !== 'select' || !Array.isArray(props.options) || props.options.length > 256) throw new Error('Invalid select options');
            for (const option of props.options) { fields(option, ['value', 'label'], 'Select option'); text(option.value); text(option.label); }
        }
        const controls = ['input', 'textarea', 'select', 'checkbox', 'range'];
        if (controls.includes(rawNode.type)) {
            if (inRepeat) throw new Error('Collection item templates cannot share form models');
            if (!props.label) throw new Error('Form fields require visible labels');
            statePath(rawNode.model);
            if (!rawNode.model.startsWith('ui.')) throw new Error('Form models only write Local UI State');
            const type = localState[rawNode.model.slice(3)].type;
            if ((rawNode.type === 'checkbox') !== (type === 'boolean')) throw new Error('Checkbox model type mismatch');
            if (rawNode.type === 'range' && !['number', 'integer'].includes(type)) throw new Error('Range requires numeric model');
            if (['textarea', 'select'].includes(rawNode.type) && type !== 'string') throw new Error('Text control requires string model');
        } else if (rawNode.model !== undefined) throw new Error('Unexpected model binding');
        const bindings = {};
        fields(rawNode.bindings ?? {}, ['text', 'value', 'checked', 'disabled', 'hidden', 'ariaLabel'], 'Bindings');
        if (rawNode.bindings?.text !== undefined && !['text', 'button', 'badge'].includes(rawNode.type)) throw new Error('Text binding requires a leaf text control');
        if (rawNode.model && (rawNode.bindings?.value !== undefined || rawNode.bindings?.checked !== undefined)) throw new Error('Model cannot have a second value authority');
        for (const [key, value] of Object.entries(rawNode.bindings ?? {})) bindings[key] = valueTemplate(value, roots);
        const events = rawNode.events ?? {};
        fields(events, ['click', 'input', 'change', 'submit'], 'UI events');
        if (events.submit !== undefined && rawNode.type !== 'form') throw new Error('Submit requires a Form');
        for (const action of Object.values(events)) if (!Object.hasOwn(actions, action)) throw new Error('Unknown action reference');
        const children = rawNode.children ?? [];
        if (!Array.isArray(children)) throw new Error('Children must be an array');
        if ([...controls, 'text', 'badge', 'progress', 'separator', 'native-slot', 'button'].includes(rawNode.type) && children.length) throw new Error('Leaf controls cannot have children');
        const repeat = rawNode.type === 'repeat';
        if (repeat && (inRepeat || children.length !== 1)) throw new Error('Repeat requires one template and cannot nest');
        if (!repeat && ['source', 'key', 'pageSize', 'emptyText'].some(key => rawNode[key] !== undefined)) throw new Error('Unexpected collection field');
        if (repeat && (!Number.isSafeInteger(rawNode.pageSize) || rawNode.pageSize < 1 || rawNode.pageSize > 100)) throw new Error('Invalid collection pageSize');
        return Object.freeze({ ...rawNode, props, bindings, events, children: children.map(child => node(child, depth + 1, inRepeat || repeat, inForm || rawNode.type === 'form')),
            ...(repeat ? { source: expression(rawNode.source, roots), key: expression(rawNode.key, roots), emptyText: text(rawNode.emptyText ?? '') } : {}) });
    }
    if (!Array.isArray(raw.views) || !raw.views.length || raw.views.length > 16) throw new Error('UI requires 1..16 views');
    if (message && raw.views.length !== 1) throw new Error('Message document requires a single view');
    const views = raw.views.map(view => {
        fields(view, ['id', 'surface', 'mount', 'root'], 'UI view'); id(view.id);
        if (!EXPERIENCE_SURFACES.includes(view.surface) || !['always', 'on-demand'].includes(view.mount)) throw new Error('Invalid view surface/mount');
        if (message && (view.surface !== 'chat.footer' || view.mount !== 'always')) throw new Error('Message view requires chat.footer and always mount');
        if (mode === 'component' && view.surface === 'app.root') throw new Error('Component v2 cannot own app.root');
        if (view.mount === 'on-demand' && !['modal', 'drawer'].includes(view.surface)) throw new Error('On-demand views require modal/drawer');
        return Object.freeze({ ...view, root: node(view.root) });
    });
    if (new Set(views.map(view => view.id)).size !== views.length) throw new Error('Duplicate view id');
    if (views.filter(view => view.surface === 'app.root').length > 1) throw new Error('Only one primary app.root view is allowed');
    if (['hybrid', 'full'].includes(mode) && views.filter(view => view.surface === 'app.root' && view.mount === 'always').length !== 1) throw new Error('Hybrid/Full require one primary app.root view');
    for (const action of Object.values(actions)) for (const step of action.steps) {
        if (step.view !== undefined && !views.some(view => view.id === step.view && view.mount === 'on-demand')) throw new Error('Unknown on-demand view');
        if (step.op === 'action.compensate' && !actions[step.actionId]?.compensation) throw new Error('Action has no declared compensator');
    }
    let opening = null;
    if (raw.opening !== undefined) {
        fields(raw.opening, ['initial', 'steps', 'confirmAction'], 'Opening');
        if (!Array.isArray(raw.opening.steps) || !raw.opening.steps.length || raw.opening.steps.length > 32) throw new Error('Invalid Opening steps');
        const steps = raw.opening.steps.map(step => {
            fields(step, ['id', 'view', 'fields', 'next'], 'Opening step'); id(step.id);
            if (!views.some(view => view.id === step.view && view.mount === 'always')) throw new Error('Unknown Opening view');
            if (!Array.isArray(step.fields) || !Array.isArray(step.next)) throw new Error('Invalid Opening fields/transitions');
            step.fields.forEach(path => { statePath(path); if (!path.startsWith('ui.')) throw new Error('Opening validates local drafts only'); });
            return { ...step, next: step.next.map(edge => { fields(edge, ['when', 'to'], 'Opening transition'); return { to: id(edge.to), when: expression(edge.when, roots) }; }) };
        });
        if (new Set(steps.map(step => step.id)).size !== steps.length || !steps.some(step => step.id === raw.opening.initial)) throw new Error('Invalid Opening identity');
        for (const step of steps) for (const edge of step.next) if (!steps.some(target => target.id === edge.to)) throw new Error('Unknown Opening target');
        if (!Object.hasOwn(actions, raw.opening.confirmAction) || actions[raw.opening.confirmAction].steps.some(step => step.op.startsWith('opening.'))) throw new Error('Invalid Opening confirm action');
        opening = { initial: raw.opening.initial, steps, confirmAction: raw.opening.confirmAction };
    }
    if (!opening && Object.values(actions).some(action => action.steps.some(step => step.op.startsWith('opening.')))) throw new Error('Opening actions require an Opening');
    const messageBlocks = compileMessageBlocks(raw.messageBlocks, compileUiDocument);
    const profile = raw.conversation === undefined ? {} : raw.conversation;
    fields(profile, ['mode', 'profile'], 'Conversation');
    const conversation = Object.freeze({ mode: profile.mode === undefined ? 'feed' : profile.mode, profile: profile.profile === undefined ? 'default' : profile.profile });
    if (!['feed', 'latest', 'reader'].includes(conversation.mode) || !['default', 'novel', 'dialogue'].includes(conversation.profile)) throw new Error('Unknown conversation mode/profile');
    return Object.freeze({ schemaVersion: 2, stateVersion: raw.stateVersion, localState, preferences, selectors, actions, views, opening, messageBlocks, conversation });
}
