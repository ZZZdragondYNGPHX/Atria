import { translateShellText as tl } from '../../../atria-shell/localization.js';
import { createUiState, fieldErrors } from './v2-state.js';
import { copy, json } from './v2-values.js';
import { createNativeComponentRegistry } from './native-components.js';
import { createResponsiveEnvironment } from './environment.js';

const TAGS = { text: 'span', badge: 'span', progress: 'progress', button: 'button', details: 'details', form: 'form', input: 'input', textarea: 'textarea', select: 'select', checkbox: 'input', range: 'input', separator: 'hr' };
const rank = { allowed: 0, advisory: 1, confirm_required: 2, blocked: 3 };

export function mountUiDocument(definition, options) {
    const doc = options.document;
    const state = createUiState(definition, options.stateStorage);
    const views = new Map();
    const activeActions = new Map();
    const attempts = new Map();
    const confirmations = new Set();
    const native = createNativeComponentRegistry(doc, { nativePlayHost: options.nativePlayHost });
    const environment = createResponsiveEnvironment(options.environmentRoot || doc.createElement('div'), { window: options.window });
    let disposed = false; let renderedNodes = 0; let openingStep = definition.opening?.initial;
    const openingHistory = []; let openingComplete = false;
    const listeners = new Set();
    const receipts = new Map();
    const context = (extra = {}) => {
        const result = { ...state.snapshot(), world: options.worldSession?.getState?.() ?? {}, data: options.data ?? {}, env: environment.get(), selectors: options.selectors?.snapshot?.() ?? {}, ...extra };
        const pending = new Set(); const evaluated = new Set();
        const own = { ...result.selectors };
        for (const [key, expression] of Object.entries(definition.selectors)) Object.defineProperty(own, key, { enumerable: true, get() {
            if (pending.has(key)) throw new Error('Cyclic UI selector');
            if (evaluated.has(key)) return result.selectors[key];
            pending.add(key); const value = expression.read({ ...result, selectors: own }); pending.delete(key);
            result.selectors[key] = value; evaluated.add(key); return value;
        } });
        for (const key of Object.keys(own)) result.selectors[key] = own[key];
        return result;
    };
    function refresh() {
        if (disposed) return;
        for (const listener of listeners) listener();
    }
    const unsubscribe = state.subscribe(refresh);
    const unsubscribeEnv = environment.subscribe(refresh);
    function constraints(action, ctx) {
        let result = { status: 'allowed', reasonCode: '', playerMessage: '' };
        for (const rule of action.constraints) {
            const applies = rule.when.read(ctx);
            if (typeof applies !== 'boolean') throw new Error('Constraint requires a boolean');
            if (applies && rank[rule.status] >= rank[result.status]) result = { status: rule.status, reasonCode: rule.reasonCode, playerMessage: rule.playerMessage };
        }
        return result;
    }
    function validatePaths(paths) {
        const snapshot = state.snapshot();
        return paths.flatMap(path => {
            const { root, key, definition: field } = state.resolve(path);
            return fieldErrors(field, snapshot[root][key]).map(reason => ({ path, reason }));
        });
    }
    async function execute(actionId, extra = {}, request = {}) {
        if (disposed) throw new Error('Experience disposed');
        if (activeActions.has(actionId)) return activeActions.get(actionId);
        const action = definition.actions[actionId];
        if (!action) throw new Error('Unknown UI action');
        const attempt = attempts.get(actionId) || { index: 0, base: options.worldSession?.getRevisionId?.(), results: [] };
        const requestId = request.idempotencyKey || attempt.requestId || (action.idempotency === 'revision' ? actionId + ':' + attempt.base
            : Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''));
        attempt.requestId = requestId;
        const run = async () => {
            const constraint = constraints(action, context(extra));
            if (constraint.status === 'blocked') throw new Error(constraint.playerMessage);
            if (constraint.status === 'confirm_required' && !await confirm(constraint.playerMessage)) return { status: 'cancelled' };
            if (constraint.playerMessage) options.onDiagnostic?.(constraint);
            const results = attempt.results;
            for (let index = attempt.index; index < action.steps.length; index++) {
                if (disposed) throw new Error('Experience disposed');
                const step = action.steps[index]; const ctx = context(extra);
                if (step.when) {
                    const allowed = step.when.read(ctx);
                    if (typeof allowed !== 'boolean') throw new Error('Action when requires a boolean');
                    if (!allowed) continue;
                }
                const value = step.value?.read(ctx);
                if (step.op === 'ui.set') state.set(step.path, value);
                else if (step.op === 'ui.toggle') state.toggle(step.path);
                else if (step.op === 'ui.reset') state.reset(step.path);
                else if (step.op === 'command.dispatch') {
                    attempt.command ||= { actionId, commandId: step.commandId, args: json(step.args.read(ctx)), expectedRevisionId: attempt.base,
                        idempotencyKey: requestId, compensation: action.compensation };
                    attempts.set(actionId, attempt);
                    let result;
                    try { result = await options.worldSession.dispatchAction(attempt.command); } catch (error) {
                        // Known pre-publication failures can accept an edited draft;
                        // uncertain commit failures retain the exact replay request.
                        if (error.code && error.code !== 'COMMIT_FAILED') attempts.delete(actionId);
                        throw error;
                    }
                    receipts.set(actionId, result); results.push(result);
                } else if (step.op === 'command.simulate') results.push(await options.worldSession.simulateCommandInternal(step.commandId, json(step.args.read(ctx))));
                else if (step.op === 'action.compensate') {
                    const receipt = receipts.get(step.actionId) || options.worldSession.getActionReceipts().findLast(item => item.actionId === step.actionId && item.compensation);
                    if (!receipt) throw new Error('No compensatable Action receipt');
                    results.push(await options.worldSession.compensateAction(receipt));
                } else if (step.op.startsWith('composer.')) {
                    const composer = options.composer;
                    if (!composer) throw new Error('Native Composer is unavailable');
                    if (step.op === 'composer.set') composer.setDraft(value);
                    if (step.op === 'composer.append') composer.appendDraft(value);
                    if (step.op === 'composer.clear') composer.clearDraft();
                    if (step.op === 'composer.focus') composer.focus();
                    if (step.op === 'composer.submit') results.push(await composer.submit());
                } else if (step.op === 'surface.open') mountView(step.view);
                else if (step.op === 'surface.close') unmountView(step.view);
                else if (step.op.startsWith('opening.')) await advanceOpening(step.op, extra);
                attempt.index = index + 1;
            }
            attempts.delete(actionId);
            return { status: 'completed', results };
        };
        // Defer execution until the busy slot exists, including purely local actions.
        const pending = Promise.resolve().then(run).finally(() => { activeActions.delete(actionId); refresh(); });
        activeActions.set(actionId, pending); refresh();
        return pending;
    }
    function confirm(message) {
        if (options.confirm) return options.confirm(message);
        return new Promise(resolve => {
            const dialog = doc.createElement('dialog'); dialog.className = 'atri-ui-confirm';
            const finish = accepted => { confirmations.delete(cancel); dialog.close(); dialog.remove(); resolve(accepted); };
            const cancel = () => finish(false); confirmations.add(cancel);
            const label = doc.createElement('p'); label.textContent = message; dialog.append(label);
            for (const [name, accepted] of [['Cancel', false], ['Confirm', true]]) {
                const button = doc.createElement('button'); button.type = 'button'; button.textContent = tl(name);
                button.onclick = () => finish(accepted); dialog.append(button);
            }
            dialog.addEventListener('cancel', cancel, { once: true });
            doc.body.append(dialog); dialog.showModal();
        });
    }
    async function advanceOpening(op, extra) {
        if (!definition.opening || openingComplete) throw new Error('No active Opening');
        if (op === 'opening.back') { openingStep = openingHistory.pop() || openingStep; syncOpening(); return; }
        const step = definition.opening.steps.find(item => item.id === openingStep);
        if (validatePaths(step.fields).length) throw new Error(tl('Check the highlighted fields.'));
        if (op === 'opening.confirm') {
            if (step.next.some(edge => edge.when.read(context(extra)))) throw new Error('Opening is not at its confirmation step');
            const result = await execute(definition.opening.confirmAction, extra);
            if (result.status === 'completed') openingComplete = true;
        } else {
            const edge = step.next.find(item => item.when.read(context(extra)) === true);
            if (!edge) throw new Error('No matching Opening transition');
            if (openingHistory.length >= 64) throw new Error('Opening navigation limit exceeded');
            openingHistory.push(openingStep); openingStep = edge.to;
        }
        syncOpening();
    }
    function renderNode(node, getExtra, cleanup, instance = '') {
        if (renderedNodes >= 2048) throw new Error('Rendered UI node budget exceeded');
        renderedNodes++; cleanup.push(() => { renderedNodes--; });
        const element = doc.createElement(TAGS[node.type] || 'div');
        element.className = 'atri-ui-node atri-ui-' + node.type;
        element.id = 'atri-ui-' + node.id + instance;
        const props = node.props;
        if (props.text !== undefined) element.textContent = props.text;
        if (props.placeholder !== undefined) element.placeholder = props.placeholder;
        if (node.type === 'button') element.type = props.submit ? 'submit' : 'button';
        if (node.type === 'form') element.noValidate = true;
        if (node.type === 'progress') { element.max = props.max ?? 100; element.value = props.value ?? 0; }
        if (node.type === 'details') { const summary = doc.createElement('summary'); summary.textContent = props.label ?? ''; element.prepend(summary); }
        if (node.type === 'native-slot') { const handle = native.mount(props.component, element); cleanup.push(() => handle.restore()); }
        if (node.type === 'select') for (const option of props.options ?? []) { const entry = doc.createElement('option'); entry.value = option.value; entry.textContent = option.label; element.append(entry); }
        const wrapper = node.model ? doc.createElement('label') : element;
        const error = doc.createElement('span'); error.id = element.id + '-error'; error.className = 'atri-ui-error';
        if (node.model) {
            const label = doc.createElement('span'); label.textContent = props.label; wrapper.className = 'atri-ui-field'; wrapper.append(label, element, error);
            element.setAttribute('aria-describedby', error.id); element.dataset.model = node.model;
            const field = state.resolve(node.model).definition;
            if (node.type === 'input') element.type = ['number', 'integer'].includes(field.type) ? 'number' : 'text';
            if (['checkbox', 'range'].includes(node.type)) element.type = node.type;
            for (const key of ['min', 'max', 'step', 'minLength', 'maxLength']) if (field[key] !== undefined) element[key] = field[key];
            element.addEventListener('input', () => {
                const value = field.type === 'boolean' ? element.checked : ['number', 'integer'].includes(field.type) ? element.valueAsNumber : element.value;
                try { state.set(node.model, value); error.textContent = ''; element.setAttribute('aria-invalid', 'false'); } catch (failure) { error.textContent = failure.message; element.setAttribute('aria-invalid', 'true'); }
            });
        }
        const status = doc.createElement('div'); status.className = 'atri-ui-feedback'; status.setAttribute('role', 'status');
        if (Object.keys(node.events).length) {
            if (node.type === 'form') element.append(status); else cleanup.push(() => status.remove());
            for (const [eventName, actionId] of Object.entries(node.events)) element.addEventListener(eventName, async event => {
                if (eventName === 'click' && event.target.closest('button') !== element && node.type !== 'button') return;
                event.preventDefault(); event.stopPropagation();
                const form = {};
                if (eventName === 'submit') {
                    const inputs = [...element.querySelectorAll('[data-model]')];
                    let first = null;
                    for (const input of inputs) {
                        const path = input.dataset.model; const field = state.resolve(path); const value = state.snapshot()[field.root][field.key];
                        form[field.key] = value;
                        const invalid = validatePaths([path]).length > 0 || input.getAttribute('aria-invalid') === 'true';
                        input.setAttribute('aria-invalid', String(invalid));
                        const inline = doc.getElementById(input.getAttribute('aria-describedby'));
                        if (inline) inline.textContent = invalid ? tl('Check this field.') : '';
                        if (invalid) first ||= input;
                    }
                    if (first) { status.textContent = tl('Check the highlighted fields.'); status.setAttribute('role', 'alert'); first.focus(); return; }
                }
                try {
                    status.textContent = tl('Working…');
                    if (!status.isConnected) element.after(status);
                    const result = await execute(actionId, { ...getExtra(), form, event: { value: node.model ? element.value : null, checked: Boolean(element.checked) } });
                    status.textContent = result.status === 'cancelled' ? tl('Cancelled') : '';
                } catch (failure) { status.textContent = failure.message; status.setAttribute('role', 'alert'); options.onDiagnostic?.({ status: 'failed', actionId, message: failure.message }); }
            });
        }
        function update() {
            const ctx = context(getExtra());
            if (node.model) {
                const { root, key, definition: field } = state.resolve(node.model); const value = ctx[root][key];
                if (field.type === 'boolean') element.checked = value;
                else if (element.value !== String(value) && element.getAttribute('aria-invalid') !== 'true') element.value = String(value);
            }
            for (const [key, binding] of Object.entries(node.bindings)) {
                const value = binding.read(ctx);
                if (key === 'text') { if (element.textContent !== String(value ?? '')) element.textContent = String(value ?? ''); } else if (key === 'ariaLabel') element.setAttribute('aria-label', String(value ?? ''));
                else if (['hidden', 'disabled', 'checked'].includes(key)) element[key] = Boolean(value);
                else if (element.value !== String(value ?? '') && element !== doc.activeElement) element.value = value ?? '';
            }
            if (node.events.click || node.events.submit) {
                const actionId = node.events.click || node.events.submit; const condition = constraints(definition.actions[actionId], ctx);
                const busy = activeActions.has(actionId);
                element.setAttribute('aria-busy', String(busy));
                if ('disabled' in element) element.disabled = props.disabled === true || Boolean(node.bindings.disabled?.read(ctx)) || busy || condition.status === 'blocked';
                if (condition.playerMessage) { status.textContent = condition.playerMessage; if (!status.isConnected) element.after(status); }
            }
        }
        listeners.add(update); cleanup.push(() => { listeners.delete(update); });
        if (node.type === 'repeat') {
            const entries = new Map(); let limit = node.pageSize;
            const empty = doc.createElement('p'); empty.textContent = node.emptyText;
            const more = doc.createElement('button'); more.type = 'button'; more.textContent = tl('Load more'); element.append(empty, more);
            const sync = () => {
                const ctx = context(getExtra()); const items = node.source.read(ctx);
                if (!Array.isArray(items) || items.length > 10000) throw new Error('Collection source must be a bounded array');
                const keys = items.map((item, index) => node.key.read({ ...ctx, item, index }));
                if (keys.some(key => !['string', 'number'].includes(typeof key)) || new Set(keys.map(String)).size !== keys.length) throw new Error('Collection requires unique stable keys');
                const wanted = new Set(keys.slice(0, limit).map(String));
                for (const [key, entry] of entries) if (!wanted.has(key)) { entry.cleanup.reverse().forEach(fn => fn()); entry.root.remove(); entries.delete(key); }
                let previous = empty;
                items.slice(0, limit).forEach((item, index) => {
                    const key = String(keys[index]); let entry = entries.get(key);
                    if (!entry) {
                        entry = { extra: { ...getExtra(), item, index }, cleanup: [] };
                        try { entry.root = renderNode(node.children[0], () => entry.extra, entry.cleanup, '-' + encodeURIComponent(key)); } catch (error) { entry.cleanup.reverse().forEach(fn => fn()); throw error; }
                        entries.set(key, entry);
                    }
                    entry.extra = { ...getExtra(), item, index };
                    if (previous.nextSibling !== entry.root) element.insertBefore(entry.root, previous.nextSibling);
                    previous = entry.root;
                });
                empty.hidden = items.length !== 0; more.hidden = items.length <= limit;
            };
            more.onclick = () => {
                try { limit = Math.min(limit + node.pageSize, 10000); sync(); refresh(); } catch (error) { more.disabled = true; options.onDiagnostic?.({ status: 'failed', message: error.message }); }
            };
            listeners.add(sync); cleanup.push(() => { listeners.delete(sync); for (const entry of entries.values()) entry.cleanup.reverse().forEach(fn => fn()); }); sync();
        } else for (const child of node.children) element.append(renderNode(child, getExtra, cleanup, instance));
        update(); return wrapper;
    }
    function mountView(id) {
        if (views.has(id)) {
            const host = views.get(id).mount.container.parentElement;
            if (typeof host?.showModal === 'function' && !host.open) host.showModal();
            return;
        }
        const view = definition.views.find(item => item.id === id);
        const mount = options.surfaceHost.mount(view.surface, 'v2.' + definition.views.indexOf(view), { className: 'atri-ui-document' });
        const cleanup = [];
        try { mount.container.append(renderNode(view.root, () => ({}), cleanup)); } catch (error) { cleanup.reverse().forEach(fn => fn()); mount.unmount(); throw error; }
        views.set(id, { mount, cleanup });
    }
    function unmountView(id) { const view = views.get(id); if (!view) return; view.cleanup.reverse().forEach(fn => fn()); view.mount.unmount(); views.delete(id); }
    function syncOpening() {
        if (!definition.opening) return;
        const target = definition.opening.steps.find(step => step.id === openingStep)?.view;
        for (const step of definition.opening.steps) {
            const view = views.get(step.view); if (view) view.mount.container.hidden = openingComplete || step.view !== target;
        }
        views.get(target)?.mount.container.querySelector('input, button, select, textarea')?.focus();
        refresh();
    }
    try { for (const view of definition.views) if (view.mount === 'always') mountView(view.id); syncOpening(); } catch (error) { for (const key of [...views.keys()]) unmountView(key); unsubscribe(); unsubscribeEnv(); environment.dispose(); throw error; }
    return Object.freeze({
        state, execute, refresh,
        getReceipt: actionId => copy(receipts.get(actionId)),
        async compensate(actionId) { const receipt = receipts.get(actionId); if (!receipt?.compensation) throw new Error('Action is not compensatable'); return options.worldSession.compensateAction(receipt); },
        dispose() { disposed = true; for (const cancel of confirmations) cancel(); attempts.clear(); unsubscribe(); unsubscribeEnv(); environment.dispose(); for (const key of [...views.keys()]) unmountView(key); },
    });
}
