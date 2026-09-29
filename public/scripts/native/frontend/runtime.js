import { renderSafeProse } from '../../../shared/native-safe-prose.js';
import { createFrontendBridge } from './bridge.js';
import { assertPresentationContract, assertPresentationNode, assertValue, evaluate, valuePath, styleValue } from '../../../shared/native-frontend-presentation.js';
import { createFrontendResources } from './resources.js';
import { createFrameScheduler, createPresentationEnvironment, createNodeHandle, focusable } from './platform.js';

const SVG = new Set('svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath mask title desc use'.split(' '));
const clone = value => structuredClone(value);

// Only Host code calls this API. Packages supply validated IR and typed values,
// never callbacks, executable source, selectors, DOM objects or service objects.
export async function mountNativeFrontend(options) {
    const document = options.document ?? globalThis.document, window = options.window ?? document.defaultView;
    const resources = await createFrontendResources({ ...options, window });
    const scheduler = createFrameScheduler(window, document);
    const instances = new Map(), shared = {}, declarations = {}, views = [], overlays = [];
    let sequence = 0, disposed = false, renderCancel = null, rendering = false, rerender = false, navigation = 0, overlayRevision = 0, nodeCount = 0;
    const diagnostic = error => {
        if (disposed) return;
        options.onDiagnostic?.({ reasonCode: 'frontend_presentation_failed', message: error.message });
        const view = overlays.at(-1) ?? views.at(-1);
        if (view) { view.failure.hidden = false; view.failureText.textContent = 'Presentation error: ' + error.message; }
    };
    let recovering = null, recoveryFailure = null;
    const bridgeDescriptor = await resources.json('bridge', 'bridge');
    const bridge = await createFrontendBridge({ descriptor: bridgeDescriptor, transport: options.bridgeTransport, hostServices: options.hostServices,
        onEpoch: () => { void recover().catch(diagnostic); }, onRevision: options.onBridgeRevision,
        fixed: { prefs: () => shared.prefs ?? {}, environment: () => views.at(-1)?.environment.get() ?? {} } }).catch(error => { scheduler.dispose(); resources.dispose(); throw error; });
    const bridgeTimer = options.bridgeTransport ? window.setInterval(() => { void bridge.refresh().catch(diagnostic); }, 1000) : null;
    const active = () => !disposed;
    const context = (instance, item, event = {}) => ({ ...Object.fromEntries(['ui', 'draft', 'prefs'].map(scope => [scope, shared[scope] ?? {}])),
        bridge: instance.bridgeState, component: instance.state, view: instance.view.state, props: instance.props, item, event, env: instance.view.environment.get(), form: instance.form });
    function requestRender() {
        if (disposed) return;
        if (rendering) { rerender = true; return; }
        if (!renderCancel) renderCancel = scheduler.frame(() => { renderCancel = null; void render().catch(diagnostic); });
    }
    async function render() {
        if (rendering || disposed) return;
        rendering = true;
        try { for (const view of [...views.slice(-1), ...overlays]) await view.root?.update(); } finally { rendering = false; if (rerender) { rerender = false; requestRender(); } }
    }
    function stateDeclaration(instance, scope) { return scope === 'component' ? instance.contract.state.component : scope === 'view' ? instance.view.declaration : declarations[scope]; }
    function write(instance, target, value) {
        const [scope, ...path] = valuePath(target, true), declaration = stateDeclaration(instance, scope);
        if (!declaration) throw new TypeError('Undeclared presentation state: ' + scope);
        const original = scope === 'component' ? instance.state : scope === 'view' ? instance.view.state : shared[scope];
        const next = clone(original); let current = next;
        for (const key of path.slice(0, -1)) {
            if (!current || !Object.hasOwn(current, key) || typeof current[key] !== 'object') throw new TypeError('Unknown state field');
            current = current[key];
        }
        current[path.at(-1)] = clone(value); assertValue(next, declaration.schema);
        if (scope === 'component') instance.state = next;
        else if (scope === 'view') instance.view.state = next;
        else shared[scope] = next;
        if (scope === 'prefs') for (const [key, item] of Object.entries(next)) options.stateStorage?.write('prefs', key, 'player', item);
        requestRender();
    }
    function registerState(instance) {
        for (const [scope, declaration] of Object.entries(instance.contract.state)) {
            if (scope === 'component') continue;
            const previous = scope === 'view' ? instance.view.declaration : declarations[scope];
            if (previous && JSON.stringify(previous) !== JSON.stringify(declaration)) throw new TypeError('Conflicting shared state declaration');
            if (previous) continue;
            if (scope === 'view') { instance.view.declaration = declaration; instance.view.state = assertValue(instance.view.restoredState ?? declaration.initial, declaration.schema); } else {
                declarations[scope] = declaration; shared[scope] = clone(declaration.initial);
                if (scope === 'prefs') for (const key of Object.keys(shared[scope])) {
                    const saved = options.stateStorage?.read('prefs', key, 'player');
                    if (saved !== undefined) { const next = { ...shared[scope], [key]: saved }; try { assertValue(next, declaration.schema); shared[scope] = next; } catch { /* Invalid old presentation preferences use declared defaults. */ } }
                }
            }
        }
    }
    async function run(instance, id, item, event = {}, depth = 0) {
        if (disposed || instance.disposed) return;
        if (depth > 16) throw new Error('Interaction recursion budget exceeded');
        const actions = instance.contract.interactions[id]; if (!actions) throw new TypeError('Unknown local interaction');
        for (const action of actions) {
            if (disposed || instance.disposed) return;
            const ctx = context(instance, item, event), value = action.value === undefined ? undefined : evaluate(action.value, ctx);
            if (/^(read|action|operation)\./.test(action.kind)) {
                if (/^(action|operation)\./.test(action.kind) && action.kind !== 'operation.cancel' && ['queued', 'running', 'progress'].includes(instance.bridgeState[action.target]?.status)) continue;
                const cursor = action.cursor ? evaluate(action.cursor, ctx) : undefined, operationId = action.operationId ? evaluate(action.operationId, ctx) : undefined;
                const method = { 'read.snapshot': 'snapshot', 'read.page': 'page', 'action.invoke': 'invoke', 'operation.start': 'start', 'operation.cancel': 'cancel' }[action.kind];
                instance.bridgeState[action.target] = { status: 'running', data: instance.bridgeState[action.target]?.data ?? null }; requestRender();
                const result = method === 'cancel' ? await instance.bridge.cancel(action.target, operationId)
                    : await instance.bridge[method](action.target, value ?? {}, { cursor });
                if (!instance.disposed && !disposed && result.error?.code !== 'bridge_epoch_stale') {
                    instance.bridgeState[action.target] = result; requestRender();
                    if (action.kind === 'operation.start' && result.ok) instance.cleanups.add(instance.bridge.watchOperation(action.target, result.operationId, next => { if (!instance.disposed) { instance.bridgeState[action.target] = next; requestRender(); } }));
                }
            } else if (action.kind === 'set') write(instance, action.target, value);
            else if (action.kind === 'toggle') write(instance, action.target, !evaluate({ get: action.target }, ctx));
            else if (action.kind === 'emit') {
                if (!instance.contract.emits[action.target]) throw new TypeError('Undeclared emit');
                await instance.onEmit?.(action.target, assertValue(value, instance.contract.emits[action.target]), depth + 1);
            } else if (action.kind === 'focus') instance.nodes.get(action.target)?.focus();
            else if (action.kind === 'overlay.close') closeOverlay();
            else if (action.kind === 'overlay.open') await openOverlay(action.target);
            else if (action.kind === 'view.back') await back();
            else if (action.kind === 'view.push' || action.kind === 'view.replace') await navigate(action.target, action.kind === 'view.replace');
        }
    }
    function lifecycle(instance, name) {
        const id = instance.contract.lifecycle[name];
        if (id) return run(instance, id).catch(diagnostic);
    }
    async function activateInstance(instance) {
        if (instance.mounted || instance.disposed) return;
        instance.mounted = true;
        await lifecycle(instance, 'mount'); await lifecycle(instance, 'activate');
    }
    function propsFor(contract, input) {
        for (const key of Object.keys(input)) if (!Object.hasOwn(contract.props, key)) throw new TypeError('Undeclared Component prop');
        return Object.fromEntries(Object.entries(contract.props).map(([key, declaration]) => [key, assertValue(Object.hasOwn(input, key) ? input[key] : declaration.default, declaration.schema)]));
    }
    async function createInstance(id, view, props = {}, onEmit = null) {
        if (instances.size >= 512 || disposed) throw new Error('Component instance budget exceeded or disposed');
        const ir = await resources.json('component:' + id, 'component');
        if (disposed || view.disposed) throw new Error('Stale View load');
        const contract = assertPresentationContract(ir.presentation);
        const host = document.createElement('atri-component'); host.style.display = 'block'; host.dataset.component = id;
        const shadow = host.attachShadow({ mode: 'open' });
        const instance = { id: 'instance.' + (++sequence), ir, contract, view, host, shadow, props: propsFor(contract, props),
            bridgeState: Object.fromEntries(ir.uses.map(id => [id, null])), state: clone(contract.state.component?.initial ?? {}), form: { dirty: {}, touched: {}, errors: {}, busy: false }, nodes: new Map(), handles: new Map(), pointers: new Set(), cleanups: new Set(), onEmit, disposed: false };
        instance.bridge = bridge.scope(ir.id, ir.uses);
        instances.set(instance.id, instance);
        instance.dispose = () => {
            if (instance.disposed) return;
            if (instance.mounted) { void lifecycle(instance, 'deactivate'); void lifecycle(instance, 'unmount'); }
            instance.disposed = true; instance.bridge.dispose();
            instance.cleanups.forEach(clean => clean()); instance.cleanups.clear();
            instance.handles.forEach(handle => handle.dispose()); instance.handles.clear(); instances.delete(instance.id); host.remove();
        };
        let block;
        try {
            registerState(instance);
            for (const styleId of [...(resources.index.globalStyles ?? []), ...ir.styles]) {
                const style = document.createElement('style'); style.textContent = await resources.style(styleId); shadow.append(style);
            }
            if (disposed || view.disposed) throw new Error('Stale Component load');
            block = await createBlock(ir.root, instance, undefined, shadow);
        } catch (error) { instance.dispose(); throw error; }
        instance.update = async input => {
            if (instance.disposed) return;
            if (input && JSON.stringify(input) !== JSON.stringify(instance.props)) { instance.props = propsFor(contract, input); await lifecycle(instance, 'propsChanged'); }
            await block.update();
        };
        return instance;
    }
    async function createBlock(definition, instance, initialItem, parent) {
        if (disposed || instance.disposed || ++nodeCount > 20000) throw new Error('Presentation node budget exceeded or disposed');
        if (typeof definition === 'string') {
            const node = document.createTextNode(definition); parent.append(node);
            let gone = false;
            const dispose = () => { if (gone) return; gone = true; --nodeCount; node.remove(); instance.cleanups.delete(dispose); };
            instance.cleanups.add(dispose);
            return { update: async () => {}, dispose, node };
        }
        assertPresentationNode(definition);
        if (definition.each) return createRepeat(definition, instance, initialItem, parent);
        let item = initialItem, childInstance = null, gone = false;
        const node = definition.tag === 'component' ? document.createElement('div') : SVG.has(definition.tag)
            ? document.createElementNS('http://www.w3.org/2000/svg', definition.tag) : document.createElement(definition.tag);
        const disposers = [], children = []; let proseText = null;
        const dispose = () => {
            if (gone) return; gone = true; --nodeCount; childInstance?.dispose(); children.forEach(child => child.dispose()); disposers.forEach(clean => clean());
            if (instance.nodes.get(definition.id) === node) instance.nodes.delete(definition.id); node.remove(); instance.cleanups.delete(dispose);
        };
        instance.cleanups.add(dispose);
        node.dataset.nodeId = definition.id;
        for (const [key, value] of Object.entries(definition.attributes)) {
            if (['disabled', 'checked', 'selected', 'multiple', 'required', 'hidden', 'open'].includes(key)) node[key] = value === 'true' || value === '';
            else node.setAttribute(key, value);
        }
        if (definition.tag === 'button' && !definition.attributes.type) node.type = 'button';
        if (definition.tag === 'slot' && definition.slot && definition.slot !== 'default') node.name = definition.slot;
        parent.append(node); instance.nodes.set(definition.id, node);
        if (definition.asset) node.src = await resources.asset('asset:' + definition.asset);
        const readProps = () => Object.fromEntries(Object.entries(definition.props ?? {}).map(([key, value]) => [key, evaluate(value, context(instance, item))]));
        if (definition.component) {
            childInstance = await createInstance(definition.component, instance.view, readProps(), async (event, value, depth) => {
                const interaction = definition.events?.[event]; if (interaction) await run(instance, interaction, item, { value }, depth);
            });
            if (gone || instance.disposed) { childInstance.dispose(); throw new Error('Stale Component load'); }
            node.append(childInstance.host);
            if (instance.view.ready) await activateInstance(childInstance);
        }
        for (const child of definition.children) children.push(await createBlock(child, instance, item, childInstance?.host ?? node));
        if (definition.read) {
            const stop = instance.bridge.subscribe(definition.read, {}, result => { instance.bridgeState[definition.read] = result; requestRender(); });
            disposers.push(stop);
        }
        function listen(event, handler) { node.addEventListener(event, handler); disposers.push(() => node.removeEventListener(event, handler)); }
        if (definition.tag === 'form') listen('submit', event => event.preventDefault());
        if (definition.tag === 'a') listen('click', event => event.preventDefault());
        const eventValue = event => Object.freeze({ value: typeof node.value === 'string' ? node.value.slice(0, 65536) : '', checked: Boolean(node.checked),
            key: String(event.key ?? '').slice(0, 64), pointerId: Number(event.pointerId) || 0,
            altKey: Boolean(event.altKey), ctrlKey: Boolean(event.ctrlKey), metaKey: Boolean(event.metaKey), shiftKey: Boolean(event.shiftKey),
            button: Math.max(0, Math.min(4, event.button ?? 0)), pointerType: ['mouse', 'touch', 'pen'].includes(event.pointerType) ? event.pointerType : '',
            x: Math.max(0, Math.min(instance.view.frame.clientWidth, (event.clientX ?? 0) - instance.view.frame.getBoundingClientRect().left)),
            y: Math.max(0, Math.min(instance.view.frame.clientHeight, (event.clientY ?? 0) - instance.view.frame.getBoundingClientRect().top)),
            deltaY: Math.max(-10000, Math.min(10000, event.deltaY ?? 0)), isComposing: Boolean(event.isComposing),
            direction: ['left', 'right', 'up', 'down'].includes(event.detail?.direction) ? event.detail.direction : '',
            scale: Math.max(0.1, Math.min(10, event.detail?.scale ?? 1)) });
        listen('pointerdown', event => { if (instance.pointers.size < 16) instance.pointers.add(event.pointerId); });
        listen('pointerup', event => instance.pointers.delete(event.pointerId));
        listen('pointercancel', event => instance.pointers.delete(event.pointerId));
        if (definition.events?.drop) listen('dragover', event => event.preventDefault());
        const input = definition.bindings?.value ?? definition.bindings?.checked;
        if (input) {
            const change = () => {
                instance.form.dirty[definition.id] = true;
                let value = definition.bindings.checked ? node.checked : node.value;
                if (node.type === 'number' || node.type === 'range') value = node.value === '' ? null : Number(node.value);
                try { write(instance, input.get, value); delete instance.form.errors[definition.id]; node.setCustomValidity?.(''); } catch { instance.form.errors[definition.id] = 'invalid_value'; node.setCustomValidity?.('Invalid value'); requestRender(); }
            };
            listen('input', change); listen('change', change);
            listen('blur', () => { instance.form.touched[definition.id] = true; requestRender(); });
        }
        if (definition.action) listen('click', () => {
            if (instance.bridgeState[definition.action]?.status === 'running') return;
            instance.bridgeState[definition.action] = { status: 'running' }; requestRender();
            void instance.bridge.invoke(definition.action, {}).then(result => { if (!instance.disposed) { instance.bridgeState[definition.action] = result; requestRender(); } });
        });
        for (const [event, interaction] of Object.entries(definition.events ?? {})) {
            if (definition.component) continue;
            listen(event, e => {
                if (event === 'submit') { e.preventDefault(); if (!node.checkValidity()) { node.reportValidity(); return; } }
                const interrupt = instance.contract.interactions[interaction]?.every(action => {
                    const target = bridgeDescriptor.bindings.find(binding => binding.id === action.target)?.target;
                    return action.kind === 'action.invoke' && target?.service === 'host.conversation' && target.method === 'cancel';
                });
                if (instance.form.busy && !interrupt) return;
                if (!interrupt) instance.form.busy = true;
                void run(instance, interaction, item, eventValue(e)).catch(diagnostic).finally(() => { if (!interrupt) instance.form.busy = false; requestRender(); });
            });
        }
        // Gesture events contain only bounded presentation values; no authority.
        if (definition.events?.longpress || definition.events?.swipe || definition.events?.pinch) {
            const points = new Map(); let timer = null, pinchDistance = null;
            listen('pointerdown', event => {
                if (points.size >= 2) return;
                points.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (points.size === 1 && definition.events.longpress) timer = window.setTimeout(() => { timer = null; node.dispatchEvent(new window.Event('longpress')); }, 500);
                if (points.size === 2) { const [a, b] = [...points.values()]; pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); }
            });
            listen('pointermove', event => {
                const start = points.get(event.pointerId);
                if (start && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12) { window.clearTimeout(timer); timer = null; }
                if (start && points.size === 2 && pinchDistance > 0) {
                    start.x = event.clientX; start.y = event.clientY;
                    const [a, b] = [...points.values()];
                    node.dispatchEvent(new window.CustomEvent('pinch', { detail: { scale: Math.hypot(a.x - b.x, a.y - b.y) / pinchDistance } }));
                }
            });
            const end = event => {
                window.clearTimeout(timer); timer = null; const start = points.get(event.pointerId);
                if (event.type !== 'pointercancel' && start && !pinchDistance && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 40) {
                    const x = event.clientX - start.x, y = event.clientY - start.y;
                    node.dispatchEvent(new window.CustomEvent('swipe', { detail: { direction: Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up') } }));
                }
                points.delete(event.pointerId); pinchDistance = null;
            };
            listen('pointerup', end); listen('pointercancel', end); disposers.push(() => window.clearTimeout(timer));
        }
        async function update(nextItem = item) {
            if (gone || instance.disposed) return; item = nextItem;
            const ctx = context(instance, item);
            if (definition.condition) node.hidden = !evaluate(definition.condition, ctx);
            for (const [sink, expr] of Object.entries(definition.bindings ?? {})) {
                const value = evaluate(expr, ctx);
                if (sink === 'prose') { const text = String(value ?? ''); if (proseText !== text) { renderSafeProse(node, text, { openExternal: options.hostActions?.openExternal }); proseText = text; } } else if (sink === 'text') { if (children.length) throw new TypeError('Text binding cannot replace declared children'); node.textContent = String(value ?? ''); } else if (sink === 'value') { if (node.value !== String(value ?? '')) node.value = String(value ?? ''); } else if (['checked', 'disabled', 'hidden'].includes(sink)) node[sink] = Boolean(value);
                else node.setAttribute(sink, String(value ?? ''));
            }
            for (const [id, expr] of Object.entries(definition.styles ?? {})) {
                const declaration = instance.contract.dynamicStyles[id]; if (!declaration) throw new TypeError('Undeclared style sink');
                node.style.setProperty(declaration.property, styleValue(declaration, evaluate(expr, ctx)));
            }
            if (definition.read || definition.action) {
                const result = instance.bridgeState[definition.read ?? definition.action];
                node.dataset.bridgeStatus = result?.status ?? 'loading';
                if (definition.read && !definition.bindings?.text && !definition.children.length) node.textContent = result?.ok ? (typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data)) : result?.error?.code ?? 'Loading…';
                if (definition.action && 'disabled' in node) node.disabled = result?.status === 'running';
            }
            await childInstance?.update(readProps());
            for (const child of children) await child.update(item);
        }
        await update();
        return { node, update, dispose };
    }
    async function createRepeat(definition, instance, item, parent) {
        const node = document.createElement('div'); node.dataset.repeat = definition.id; parent.append(node);
        const rows = new Map(); let gone = false;
        const dispose = () => { if (gone) return; gone = true; --nodeCount; node.removeEventListener('scroll', onScroll); rows.forEach(row => row.dispose()); node.remove(); instance.cleanups.delete(dispose); };
        instance.cleanups.add(dispose);
        const virtual = definition.windowSize !== undefined;
        const top = document.createElement('div'), bottom = document.createElement('div');
        if (virtual) { node.style.cssText = 'overflow:auto;position:relative'; node.style.height = definition.windowSize * definition.rowHeight + 'px'; node.append(top, bottom); }
        const onScroll = () => requestRender(); if (virtual) node.addEventListener('scroll', onScroll);
        const rowDef = { ...definition }; delete rowDef.each; delete rowDef.key; delete rowDef.windowSize; delete rowDef.rowHeight;
        async function update(nextItem = item) {
            if (gone) return; item = nextItem;
            const values = evaluate(definition.each, context(instance, item)) ?? (definition.each.get?.startsWith('bridge.') ? [] : undefined);
            if (!Array.isArray(values) || values.length > 10000) throw new TypeError('Bounded array required for keyed list');
            const keys = values.map(value => value?.[definition.key]);
            if (keys.some(key => !['string', 'number'].includes(typeof key)) || new Set(keys).size !== keys.length) throw new TypeError('Unique stable list keys required');
            const start = virtual ? Math.max(0, Math.min(values.length, Math.floor(node.scrollTop / definition.rowHeight) - 2)) : 0;
            const end = virtual ? Math.min(values.length, start + definition.windowSize + 4) : values.length;
            if (!virtual && values.length > 512) throw new TypeError('Large lists require virtualization');
            const visible = new Set(keys.slice(start, end));
            for (const [key, row] of rows) if (!visible.has(key)) { row.dispose(); rows.delete(key); }
            let cursor = virtual ? top.nextSibling : node.firstChild;
            for (let index = start; index < end; index++) {
                const key = keys[index];
                if (!rows.has(key)) rows.set(key, await createBlock(rowDef, instance, values[index], node));
                const row = rows.get(key); await row.update(values[index]);
                if (row.node !== cursor) node.insertBefore(row.node, cursor ?? (virtual ? bottom : null));
                if (virtual) { row.node.style.height = definition.rowHeight + 'px'; row.node.style.boxSizing = 'border-box'; row.node.style.overflow = 'hidden'; }
                cursor = row.node.nextSibling;
            }
            if (virtual) { top.style.height = start * definition.rowHeight + 'px'; bottom.style.height = (values.length - end) * definition.rowHeight + 'px'; node.append(bottom); }
        }
        await update();
        return { node, update, dispose };
    }
    function closeOverlay() {
        ++overlayRevision;
        const view = overlays.pop(); if (!view) return false;
        disposeView(view);
        synchronizeInert();
        if (view.returnFocus?.isConnected) view.returnFocus.focus();
        return true;
    }
    function synchronizeInert() {
        if (views.at(-1)) views.at(-1).content.inert = overlays.length > 0;
        overlays.forEach((view, index) => { view.content.inert = index < overlays.length - 1; });
    }
    function deepFocus(root = document) { return root.activeElement?.shadowRoot ? deepFocus(root.activeElement.shadowRoot) : root.activeElement; }
    async function createView(id, overlay = false, state = null) {
        const ir = await resources.json('view:' + id, 'view');
        if (disposed) throw new Error('Stale View load');
        const previous = overlays.at(-1) ?? views.at(-1);
        const mount = overlay ? null : options.surfaceHost.mount(ir.surface, 'native-v3.' + (++sequence));
        if (overlay && !previous) throw new Error('Overlay requires a View');
        const frame = document.createElement('div'); frame.dataset.atriaFrontendBoundary = ir.id;
        // No Package stylesheet shares this ShadowRoot. Package :host rules
        // apply only to nested Component hosts, never this clipping frame.
        frame.style.cssText = 'position:relative;contain:layout paint style;isolation:isolate;overflow:hidden;transform:translateZ(0);box-sizing:border-box;min-width:0;min-height:200px;width:100%;height:100%;max-width:100%;max-height:100%';
        const shell = frame.attachShadow({ mode: 'open' }), content = document.createElement('div'), overlayRoot = document.createElement('div');
        content.style.cssText = 'height:100%;width:100%;overflow:auto;box-sizing:border-box';
        overlayRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
        shell.append(content, overlayRoot);
        const failure = document.createElement('div'), failureText = document.createElement('span'), retry = document.createElement('button');
        failure.hidden = true; failure.setAttribute('role', 'alert');
        failure.style.cssText = 'position:absolute;inset:0 auto auto 0;z-index:2;background:Canvas;color:CanvasText;padding:12px;max-width:100%;box-sizing:border-box';
        retry.type = 'button'; retry.textContent = 'Reload presentation';
        retry.onclick = () => { void recover().catch(diagnostic); };
        failure.append(failureText, retry);
        for (const [label, handler] of [['Stop', options.hostActions?.stopGeneration], ['Diagnostics', options.hostActions?.openDiagnostics], ['Exit', options.hostActions?.exitExperience]]) {
            if (!handler) continue; const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.onclick = () => { void Promise.resolve().then(handler).catch(diagnostic); }; failure.append(button);
        }
        shell.append(failure);
        const view = { id, frame, content, overlayRoot, failure, failureText, mount, state: {}, restoredState: state, declaration: null, root: null, disposed: false, returnFocus: deepFocus() };
        view.environment = createPresentationEnvironment(window, frame, requestRender);
        if (overlay) {
            frame.style.cssText += ';position:absolute;inset:0;pointer-events:auto;background:Canvas;color:CanvasText';
            frame.setAttribute('role', 'dialog'); frame.setAttribute('aria-modal', 'true'); frame.setAttribute('aria-label', id); frame.tabIndex = -1;
            previous.overlayRoot.append(frame); previous.content.inert = true;
        } else mount.container.append(frame);
        view.keydown = event => {
            if (!overlay || overlays.at(-1) !== view) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeOverlay(); }
            if (event.key === 'Tab') {
                const nodes = focusable(content), focused = deepFocus();
                if (!nodes.length) { event.preventDefault(); frame.focus(); } else if (event.shiftKey && (focused === nodes[0] || !nodes.includes(focused))) { event.preventDefault(); nodes.at(-1).focus(); } else if (!event.shiftKey && (focused === nodes.at(-1) || !nodes.includes(focused))) { event.preventDefault(); nodes[0].focus(); }
            }
        };
        frame.addEventListener('keydown', view.keydown, true);
        content.textContent = 'Loading…';
        try {
            view.root = await createInstance(ir.root, view); if (disposed) throw new Error('Stale View load');
            content.replaceChildren(view.root.host);
            view.ready = true;
            for (const instance of instances.values()) if (instance.view === view) await activateInstance(instance);
            return view;
        } catch (error) { disposeView(view); if (overlay && previous) previous.content.inert = false; throw error; }
    }
    function disposeView(view) { if (view.disposed) return; view.disposed = true; view.root?.dispose(); view.environment.dispose(); view.frame.removeEventListener('keydown', view.keydown, true); view.frame.remove(); view.mount?.unmount(); }
    async function navigate(id, replace = false) {
        if (!replace && views.length >= 64) throw new Error('Route history budget exceeded');
        const revision = ++navigation, next = await createView(id);
        if (disposed || revision !== navigation) { disposeView(next); return; }
        while (closeOverlay()) { /* revoke overlays before changing route */ }
        const old = views.at(-1);
        if (old) { disposeView(old); if (replace) views.pop(); }
        views.push(next); requestRender();
    }
    async function back() {
        if (views.length < 2) return false;
        const revision = ++navigation, previous = views.at(-2);
        const next = await createView(previous.id, false, previous.state);
        if (disposed || revision !== navigation) { disposeView(next); return false; }
        while (closeOverlay()) { /* revoke overlays */ }
        disposeView(views.pop()); views.pop(); views.push(next); requestRender(); return true;
    }
    async function openOverlay(id) {
        if (overlays.length >= 8) throw new Error('Overlay budget exceeded');
        const revision = ++overlayRevision, routeRevision = navigation;
        const view = await createView(id, true);
        if (disposed || revision !== overlayRevision || routeRevision !== navigation) {
            disposeView(view); synchronizeInert(); return null;
        }
        overlays.push(view);
        synchronizeInert();
        (focusable(view.content)[0] ?? view.frame).focus(); return view.id;
    }
    async function recover() {
        if (disposed) return;
        if (recovering) return recovering;
        recovering = (async () => {
            const id = views.at(-1)?.id ?? resources.index.primaryView.slice(5);
            ++navigation; ++overlayRevision;
            [...overlays, ...views].reverse().forEach(disposeView); overlays.length = 0; views.length = 0;
            for (const key of Object.keys(shared)) delete shared[key];
            for (const key of Object.keys(declarations)) delete declarations[key];
            await options.onBridgeEpoch?.();
            await bridge.reload();
            if (!disposed) { await navigate(id); recoveryFailure?.unmount(); recoveryFailure = null; }
        })().catch(async error => {
            if (!disposed && !views.length && !recoveryFailure) {
                const view = await resources.json('view:' + resources.index.primaryView.slice(5), 'view');
                recoveryFailure = options.surfaceHost.mount(view.surface, 'native-v3.failure');
                const panel = document.createElement('section'); panel.setAttribute('role', 'alert');
                panel.textContent = 'Presentation recovery failed. ';
                for (const [label, handler] of [['Reload presentation', recover], ['Stop', options.hostActions?.stopGeneration], ['Diagnostics', options.hostActions?.openDiagnostics], ['Exit', options.hostActions?.exitExperience]]) {
                    if (!handler) continue; const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
                    button.onclick = () => { void Promise.resolve().then(handler).catch(diagnostic); }; panel.append(button);
                }
                recoveryFailure.container.append(panel);
            }
            throw error;
        }).finally(() => { recovering = null; });
        return recovering;
    }
    try { await navigate(resources.index.primaryView.slice(5)); } catch (error) { disposed = true; window.clearInterval(bridgeTimer); bridge.dispose(); scheduler.dispose(); resources.dispose(); throw error; }
    return Object.freeze({ mode: options.mode, status: 'active', refresh() { requestRender(); return bridge.refresh(); }, getContributions: () => [], getRenderReceipts: () => [],
        navigate, back, openOverlay, closeOverlay,
        recover,
        getState() { return clone({ ...shared, view: views.at(-1)?.state ?? {} }); },
        setState(scope, path, value) { const root = views.at(-1)?.root; if (!root || !active()) throw new Error('Frontend unavailable'); write(root, scope + '.' + path, value); },
        getNodeRef(instanceId, nodeId) {
            const instance = instances.get(instanceId); if (!instance || !instance.contract.nodeRefs.includes(nodeId)) throw new TypeError('Undeclared NodeRef');
            if (!instance.handles.has(nodeId)) instance.handles.set(nodeId, createNodeHandle(instance.nodes.get(nodeId), instance.view.frame, { window, scheduler, active: () => active() && !instance.disposed, pointers: instance.pointers }));
            return instance.handles.get(nodeId).handle;
        },
        getInstances() { return [...instances.values()].map(instance => ({ id: instance.id, componentId: instance.ir.id })); },
        scheduler: Object.freeze({ frame: scheduler.frame }),
        dispose() { if (disposed) return; recoveryFailure?.unmount(); ++navigation; [...overlays, ...views].reverse().forEach(disposeView); disposed = true; window.clearInterval(bridgeTimer); bridge.dispose(); scheduler.dispose(); resources.dispose(); instances.clear(); },
    });
}
