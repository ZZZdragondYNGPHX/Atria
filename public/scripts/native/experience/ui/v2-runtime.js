import { translateShellText as tl } from '../../../atria-shell/localization.js';
import { createUiState, fieldErrors } from './v2-state.js';
import { copy, json } from './v2-values.js';
import { createNativeComponentRegistry } from './native-components.js';
import { createResponsiveEnvironment } from './environment.js';
import { displayInformation } from '../../../../shared/native-information-runtime.js';

const TAGS = { text: 'span', badge: 'span', progress: 'progress', button: 'button', details: 'details', form: 'form', input: 'input', textarea: 'textarea', select: 'select', checkbox: 'input', range: 'input', separator: 'hr' };
const rank = { allowed: 0, advisory: 1, confirm_required: 2, blocked: 3 };

export function mountUiDocument(definition, options) {
    const doc = options.document;
    const lifecycle = definition.opening ? options.lifecycle : null;
    const savedOpening = lifecycle?.getSnapshot()?.states?.atri_lifecycle?.opening;
    const state = createUiState(definition, lifecycle ? {
        read: (root, key, scope) => root === 'ui' ? savedOpening?.values?.[key] : options.stateStorage?.read?.(root, key, scope),
        write: (root, key, scope, value) => { if (root !== 'ui') options.stateStorage?.write?.(root, key, scope, value); },
    } : options.stateStorage);
    // Mount-scoped setup values also resume from the existing Session snapshot.
    if (lifecycle) for (const [key, value] of Object.entries(savedOpening?.values ?? {})) {
        if (Object.hasOwn(definition.localState, key)) state.set('ui.' + key, value);
    }
    const views = new Map();
    const activeActions = new Map();
    const attempts = new Map();
    const confirmations = new Set();
    const native = createNativeComponentRegistry(doc, { nativePlayHost: options.nativePlayHost });
    const nodeBudget = options.nodeBudget || { nodes: 0, limit: 2048 };
    let disposed = false; let openingStep = definition.opening?.initial;
    if (savedOpening?.step != null) {
        if (!definition.opening.steps.some(step => step.id === savedOpening.step)) throw new Error('Saved Opening step is unavailable');
        openingStep = savedOpening.step;
    }
    const openingHistory = [...(savedOpening?.history ?? [])]; let openingComplete = savedOpening?.completed === true;
    if (openingHistory.some(id => !definition.opening.steps.some(step => step.id === id))) throw new Error('Saved Opening history is unavailable');
    const environment = createResponsiveEnvironment(options.environmentRoot || doc.createElement('div'), { window: options.window });
    const openingVariant = savedOpening?.variant ?? null;
    let openingTimer = null;
    let openingWrite = Promise.resolve();
    let pendingProgress = null;
    let openingBusy = null;
    const listeners = new Set();
    const receipts = new Map();
    const context = (extra = {}) => {
        const result = { ...state.snapshot(), world: options.presentationContext ? {} : options.worldSession?.getState?.() ?? {}, data: options.data ?? {}, env: environment.get(), selectors: options.selectors?.snapshot?.() ?? {}, ...options.presentationContext, ...extra };
        result.projection = options.presentationContext ? {} : (options.sharedClient ? options.sharedClient.getProjection() : displayInformation(options.getSnapshot?.()));
        result.temporal = options.presentationContext ? {} : options.getTemporalProjection?.() ?? {};
        result.shared = options.presentationContext ? {} : options.sharedClient?.getSnapshot() ?? {};
        result.realm = options.presentationContext ? {} : options.sharedClient?.getSnapshot()?.realm ?? options.getSnapshot?.()?.realmViews ?? {};
        result.continuity = options.presentationContext ? {} : options.getSnapshot?.()?.continuityViews ?? {};
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
        if (lifecycle?.getSnapshot()?.states?.atri_lifecycle?.opening?.completed) openingComplete = true;
        updateOpeningVisibility();
        for (const listener of listeners) listener();
    }
    function openingPayload() {
        return { kind: 'opening.progress', step: openingStep, history: [...openingHistory], values: state.snapshot().ui, variant: openingVariant };
    }
    function persistOpening(payload = openingPayload()) {
        if (!lifecycle) return Promise.resolve();
        clearTimeout(openingTimer);
        const write = async () => {
            if (disposed) throw new Error('Experience disposed');
            if (openingComplete) return;
            // Replay an uncertain earlier write before publishing a newer draft.
            if (pendingProgress) {
                const previous = pendingProgress;
                await lifecycle.command(previous); pendingProgress = null;
                if (JSON.stringify(previous) === JSON.stringify(payload)) return;
            }
            pendingProgress = payload;
            await lifecycle.command(payload);
            pendingProgress = null;
        };
        openingWrite = openingWrite.catch(() => {}).then(write);
        return openingWrite;
    }
    const unsubscribe = state.subscribe(() => {
        refresh();
        if (lifecycle && !openingComplete && lifecycle.isWritable()) {
            clearTimeout(openingTimer);
            openingTimer = setTimeout(() => { void persistOpening().catch(error => options.onDiagnostic?.({ status: 'failed', message: error.message })); }, 150);
        }
    });
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
    function planOpening(action, extra) {
        const draft = state.snapshot(); const steps = [];
        const command = { kind: 'opening.complete', preferences: copy(state.snapshot().prefs) };
        let composerText = null;
        for (const step of action.steps) {
            const ctx = context({ ...extra, ...draft });
            const allowed = step.when ? step.when.read(ctx) : true;
            if (typeof allowed !== 'boolean') throw new Error('Action when requires a boolean');
            const value = allowed ? step.value?.read(ctx) : undefined;
            steps.push({ allowed, value });
            if (!allowed) continue;
            if (step.op.startsWith('ui.')) {
                const { root, key, definition: field } = state.resolve(step.path);
                draft[root][key] = step.op === 'ui.set' ? value : step.op === 'ui.toggle' ? !draft[root][key] : copy(field.default);
                fieldErrors(field, draft[root][key]);
            } else if (step.op === 'command.dispatch') command.confirmation = { commandId: step.commandId, args: json(step.args.read(ctx)) };
            else if (step.op === 'action.compensate' || step.op.startsWith('continuity.') || step.op.startsWith('realm.') || step.op.startsWith('shared.')) throw new Error('Opening requires a declared confirmation Command');
            else if (step.op === 'composer.set') composerText = value;
            else if (step.op === 'composer.clear') composerText = '';
            else if (step.op === 'composer.append') {
                if (composerText === null) throw new Error('Opening submission requires a declared Composer draft');
                composerText += value;
            } else if (step.op === 'composer.submit') {
                if (command.submission || typeof composerText !== 'string' || !composerText.trim()) throw new Error('Opening requires one declared Composer submission');
                command.submission = { text: composerText.trim() };
            }
        }
        if (command.submission && typeof options.composer?.submitCommitted !== 'function') throw new Error('Committed Native Composer submission is unavailable');
        return { command, steps };
    }
    async function execute(actionId, extra = {}, request = {}) {
        if (disposed) throw new Error('Experience disposed');
        if (activeActions.has(actionId)) return activeActions.get(actionId);
        const action = definition.actions[actionId];
        if (!action) throw new Error('Unknown UI action');
        const attempt = attempts.get(actionId) || { index: 0, base: options.worldSession?.getRevisionId?.(), results: [] };
        const requestId = request.idempotencyKey || attempt.requestId || options.actionKey?.(actionId) || (action.idempotency === 'revision' ? actionId + ':' + attempt.base
            : Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''));
        attempt.requestId = requestId;
        const run = async () => {
            const intercepted = await options.beforeAction?.(actionId, action, extra, { state: state.snapshot(), confirm, resuming: attempts.has(actionId) });
            if (intercepted?.handled) return intercepted.result;
            if (disposed) throw new Error('Experience disposed');
            const constraint = constraints(action, context(extra));
            if (constraint.status === 'blocked') throw new Error(constraint.playerMessage);
            if (constraint.status === 'confirm_required' && !await confirm(constraint.playerMessage)) return { status: 'cancelled' };
            if (constraint.playerMessage) options.onDiagnostic?.(constraint);
            if (request.opening && lifecycle && !attempt.openingPrepared) {
                attempt.openingPlan = planOpening(action, extra);
                await persistOpening();
                attempt.openingPrepared = true;
                attempts.set(actionId, attempt);
            }
            if (request.opening && lifecycle && !attempt.openingCommitted) {
                try { attempt.openingSnapshot = await lifecycle.command(attempt.openingPlan.command); } catch (error) {
                    if (error.status >= 400 && error.status < 500) attempts.delete(actionId);
                    throw error;
                }
                attempt.openingCommitted = true;
                openingComplete = true;
            }
            const results = attempt.results;
            for (let index = attempt.index; index < action.steps.length; index++) {
                if (disposed) throw new Error('Experience disposed');
                const step = action.steps[index]; const ctx = context(extra);
                const planned = attempt.openingPlan?.steps[index];
                if (planned || step.when) {
                    const allowed = planned ? planned.allowed : step.when.read(ctx);
                    if (typeof allowed !== 'boolean') throw new Error('Action when requires a boolean');
                    if (!allowed) continue;
                }
                const value = planned ? planned.value : step.value?.read(ctx);
                if (step.op === 'ui.set') state.set(step.path, value);
                else if (step.op === 'ui.toggle') state.toggle(step.path);
                else if (step.op === 'ui.reset') state.reset(step.path);
                else if (step.op === 'command.dispatch') {
                    attempt.command ||= { actionId, commandId: step.commandId, args: json(step.args.read(ctx)), expectedRevisionId: attempt.base,
                        idempotencyKey: requestId, compensation: action.compensation };
                    attempts.set(actionId, attempt);
                    let result;
                    try {
                        if (request.opening && lifecycle) {
                            result = attempt.openingSnapshot;
                        } else result = await options.worldSession.dispatchAction(attempt.command);
                    } catch (error) {
                        // Known pre-publication failures can accept an edited draft;
                        // uncertain commit failures retain the exact replay request.
                        if (error.code && error.code !== 'COMMIT_FAILED' && !request.opening) attempts.delete(actionId);
                        throw error;
                    }
                    receipts.set(actionId, result); results.push(result);
                } else if (step.op === 'application.command') {
                    if (!options.lifecycle || options.presentationContext || request.opening) throw new Error('Session Application Host unavailable for this surface');
                    attempt.applicationCommand ||= {
                        kind: 'app.command',
                        domainId: step.domainId,
                        commandId: step.commandId,
                        recordId: step.recordId?.read(ctx) ?? ('ui-' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')),
                        args: json(step.args.read(ctx)),
                    };
                    attempts.set(actionId, attempt);
                    try {
                        results.push(await options.lifecycle.command(attempt.applicationCommand));
                    } catch (error) {
                        if (error.status >= 400 && error.status < 500) attempts.delete(actionId);
                        throw error;
                    }
                } else if (step.op === 'command.simulate') results.push(await options.worldSession.simulateCommandInternal(step.commandId, json(step.args.read(ctx))));
                else if (step.op === 'action.compensate') {
                    const receipt = receipts.get(step.actionId) || options.worldSession.getActionReceipts().findLast(item => item.actionId === step.actionId && item.compensation);
                    if (!receipt) throw new Error('No compensatable Action receipt');
                    results.push(await options.worldSession.compensateAction(receipt));
                } else if (step.op.startsWith('shared.')) {
                    if (!options.sharedClient || options.presentationContext || request.opening) throw new Error('Shared Host unavailable for this surface');
                    const kinds = { 'shared.open': 'turn.open', 'shared.submit': 'turn.submit', 'shared.commit': 'turn.commit', 'shared.cancel': 'turn.cancel' };
                    results.push(await options.sharedClient.command({ ...json(step.args.read(ctx)), kind: kinds[step.op] }));
                } else if (step.op.startsWith('realm.')) {
                    if (!options.realm || options.presentationContext || request.opening) throw new Error('Realm Host unavailable for this surface');
                    const kinds = { 'realm.command': 'command', 'realm.transfer': 'transfer', 'realm.resume': 'transfer.resume', 'realm.cancel': 'transfer.cancel' };
                    results.push(await options.realm({ ...json(step.args.read(ctx)), kind: kinds[step.op] }));
                } else if (step.op.startsWith('continuity.')) {
                    if (!options.continuity) throw new Error('Continuity Host unavailable');
                    attempts.set(actionId, attempt);
                    const kinds = { 'continuity.command': 'command', 'continuity.transfer': 'transfer', 'continuity.resume': 'transfer.resume', 'continuity.cancel': 'transfer.cancel' };
                    results.push(await options.continuity({ ...json(step.args.read(ctx)), kind: kinds[step.op] }));
                } else if (step.op.startsWith('activity.')) {
                    if (!options.presentation) throw new Error('Activity Host unavailable');
                    attempts.set(actionId, attempt);
                    results.push(await options.presentation.activity(step.op, json(step.args.read(ctx))));
                } else if (['host.fullscreen', 'host.focus', 'scene.show'].includes(step.op)) {
                    if (!options.presentation) throw new Error('Presentation Host unavailable');
                    if (step.op === 'host.fullscreen') await options.presentation.fullscreen(step.sceneId);
                    else if (step.op === 'host.focus') options.presentation.focus(step.sceneId);
                    else options.presentation.presentScene(step.sceneId);
                } else if (step.op.startsWith('composer.')) {
                    const composer = options.composer;
                    if (!composer) throw new Error('Native Composer is unavailable');
                    if (step.op === 'composer.set') composer.setDraft(value);
                    if (step.op === 'composer.append') composer.appendDraft(value);
                    if (step.op === 'composer.clear') composer.clearDraft();
                    if (step.op === 'composer.focus') composer.focus();
                    if (step.op === 'composer.submit') results.push(await (request.opening && lifecycle
                        ? composer.submitCommitted(attempt.openingSnapshot) : composer.submit()));
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
    function advanceOpening(op, extra) {
        if (openingBusy) return openingBusy;
        openingBusy = advanceOpeningOnce(op, extra).finally(() => { openingBusy = null; });
        return openingBusy;
    }
    async function advanceOpeningOnce(op, extra) {
        if (!definition.opening || (openingComplete && !attempts.has(definition.opening.confirmAction))) throw new Error('No active Opening');
        if (lifecycle && !lifecycle.isWritable()) throw new Error('Opening requires the active writable Session');
        const nextHistory = [...openingHistory];
        let nextStep = openingStep;
        if (op === 'opening.back') nextStep = nextHistory.pop() || openingStep;
        else {
            const step = definition.opening.steps.find(item => item.id === openingStep);
            if (validatePaths(step.fields).length) throw new Error(tl('Check the highlighted fields.'));
            if (op === 'opening.confirm') {
                if (step.next.some(edge => edge.when.read(context(extra)))) throw new Error('Opening is not at its confirmation step');
                const result = await execute(definition.opening.confirmAction, extra, { opening: true });
                if (result.status === 'completed') openingComplete = true;
                syncOpening(); return;
            }
            const edge = step.next.find(item => item.when.read(context(extra)) === true);
            if (!edge) throw new Error('No matching Opening transition');
            if (nextHistory.length >= 64) throw new Error('Opening navigation limit exceeded');
            nextHistory.push(openingStep); nextStep = edge.to;
        }
        await persistOpening({ ...openingPayload(), step: nextStep, history: nextHistory });
        if (disposed) throw new Error('Experience disposed');
        openingHistory.splice(0, openingHistory.length, ...nextHistory); openingStep = nextStep;
        syncOpening();
    }
    function renderNode(node, getExtra, cleanup, instance = '') {
        if (nodeBudget.nodes >= nodeBudget.limit) throw new Error('Rendered UI node budget exceeded');
        nodeBudget.nodes++; cleanup.push(() => { nodeBudget.nodes--; });
        const element = doc.createElement(node.type === 'media-cue' ? ({ image: 'img', audio: 'audio', video: 'video' }[node.props.cue.kind]) : node.type === 'speech-cue' ? 'button' : TAGS[node.type] || 'div');
        element.className = 'atri-ui-node atri-ui-' + node.type;
        element.dataset.atriaComponentId = node.id;
        element.id = 'atri-ui-' + (options.instanceId ? options.instanceId + '-' : '') + node.id + instance;
        const props = node.props;
        if (node.type === 'scene') {
            if (!options.presentation) throw new Error('Scene Host unavailable');
            const scene = options.presentation.mountScene(element, props.sceneId); cleanup.push(() => scene.dispose());
        }
        if (node.type === 'media-cue') cleanup.push(options.presentation.bindMedia(element, props.cue, options.onDiagnostic));
        if (node.type === 'speech-cue') {
            element.type = 'button'; element.textContent = props.cue.text;
            element.addEventListener('click', () => { try { options.presentation.speak(props.cue); } catch (error) { options.onDiagnostic?.({ code: error.code ?? 'native_speech_unavailable' }); } });
        }
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
                if ('disabled' in element) element.disabled = props.disabled === true || Boolean(node.bindings.disabled?.read(ctx)) || busy || condition.status === 'blocked' || options.actionDisabled?.(actionId, definition.actions[actionId], attempts.has(actionId)) === true;
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
    function updateOpeningVisibility() {
        if (!definition.opening) return;
        const target = definition.opening.steps.find(step => step.id === openingStep)?.view;
        for (const step of definition.opening.steps) {
            const view = views.get(step.view); if (view) view.mount.container.hidden = openingComplete || step.view !== target;
        }
    }
    function syncOpening() {
        updateOpeningVisibility();
        if (!openingComplete) {
            const target = definition.opening?.steps.find(step => step.id === openingStep)?.view;
            views.get(target)?.mount.container.querySelector('input, button, select, textarea')?.focus();
        }
        refresh();
    }
    try { for (const view of definition.views) if (view.mount === 'always') mountView(view.id); syncOpening(); } catch (error) { for (const key of [...views.keys()]) unmountView(key); unsubscribe(); unsubscribeEnv(); environment.dispose(); throw error; }
    return Object.freeze({
        state, execute, refresh,
        flushOpening: () => persistOpening(),
        getReceipt: actionId => copy(receipts.get(actionId)),
        async compensate(actionId) { const receipt = receipts.get(actionId); if (!receipt?.compensation) throw new Error('Action is not compensatable'); return options.worldSession.compensateAction(receipt); },
        dispose() { disposed = true; clearTimeout(openingTimer); for (const cancel of confirmations) cancel(); attempts.clear(); unsubscribe(); unsubscribeEnv(); environment.dispose(); for (const key of [...views.keys()]) unmountView(key); },
    });
}
