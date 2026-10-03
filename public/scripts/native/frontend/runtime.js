import { createMediaResolver } from './media.js';
import { createScriptSupervisor } from './script.js';
import { createCanvasSurface } from './canvas.js';
import { createLocalization } from '../../../shared/native-frontend-localization.js';
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
    const localization = createLocalization(resources.refs.has('localization') ? await resources.json('localization', 'localization') : { version: 1, defaultLocale: 'en', catalogs: { en: { direction: 'ltr', messages: {} } } }, options.locale, options.onDiagnostic);
    const advisoryDiagnostics = resources.refs.has('diagnostics') ? await resources.json('diagnostics', 'diagnostics') : [];
    const scheduler = createFrameScheduler(window, document);
    const canvasBudget = new Map();
    const scripts = createScriptSupervisor({ window, scheduler, onDiagnostic: options.onDiagnostic, workerFactory: options.scriptWorkerFactory });
    const composing = new Set();
    const instances = new Map(), shared = {}, declarations = {}, views = [], overlays = [];
    let sequence = 0, disposed = false, renderCancel = null, rendering = false, rerender = false, navigation = 0, overlayRevision = 0, nodeCount = 0;
    const diagnostic = error => {
        if (disposed) return;
        options.onDiagnostic?.({ reasonCode: 'frontend_presentation_failed', message: 'Presentation could not be completed.' });
        const view = overlays.at(-1) ?? views.at(-1);
        if (view) { view.failure.hidden = false; view.failureText.textContent = 'Presentation could not be completed.'; }
    };
    const media = await createMediaResolver({ resources, window, fetchImage: options.fetchImage, enabled: options.remoteMediaEnabled === true, changed: () => { instances.forEach(instance => instance.revokeScriptMedia?.()); requestRender(); } });
    if (media.required && !media.enabled && media.origins.length) {
        const consent = await (options.confirmRemoteMedia?.(media.origins) ?? window.confirm?.('Enable remote images from ' + media.origins.join(', ') + '? These sites can observe your IP address, image choices and request timing.'));
        if (!consent) { scripts.dispose(); scheduler.dispose(); resources.dispose(); media.dispose(); throw new Error('media_permission_denied'); }
        media.setEnabled(true);
    }
    let recovering = null, recoveryFailure = null;
    const bridgeDescriptor = await resources.json('bridge', 'bridge');
    const hostServices = { supports: target => ['host.media', 'host.presentation'].includes(target.service) || Boolean(options.hostServices), async invoke(target, input, revision) {
        if (target.service === 'host.media' && target.method === 'resolve') {
            const result = await media.resolve(input.ref, input.type); result.release?.();
            return { ref: clone(input.ref), status: result.status, reasonCode: result.reasonCode };
        }
        if (target.service === 'host.presentation') {
            if (target.method === 'setLocale') setLocale(input.locale);
            if (['locale', 'setLocale'].includes(target.method)) return { locale: localization.locale, direction: localization.direction };
            if (target.method === 'announce') { announce(input.text); return {}; }
        }
        if (!options.hostServices) throw new Error('bridge_host_local_required');
        return options.hostServices.invoke(target, input, revision);
    } };
    const bridge = await createFrontendBridge({ descriptor: bridgeDescriptor, transport: options.bridgeTransport, hostServices,
        onEpoch: () => { void recover().catch(diagnostic); }, onRevision: options.onBridgeRevision,
        fixed: { prefs: () => shared.prefs ?? {}, environment: () => views.at(-1)?.environment.get() ?? {} } }).catch(error => { scripts.dispose(); scheduler.dispose(); media.dispose(); resources.dispose(); throw error; });
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
        if (rendering || disposed || composing.size) return;
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
            } else if (action.kind === 'locale.set') setLocale(String(value));
            else if (action.kind === 'announce') announce(String(value ?? ''));
            else if (action.kind === 'set') write(instance, action.target, value);
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
        if (id) return run(instance, id).catch(instance.failBoundary ?? diagnostic);
    }
    async function activateInstance(instance) {
        if (instance.mounted || instance.disposed) return;
        instance.mounted = true;
        await lifecycle(instance, 'mount'); await lifecycle(instance, 'activate');
        if (instance.ir.controller) await startController(instance);
    }
    function nodeHandle(instance, id) {
        if (!instance.contract.nodeRefs.includes(id)) throw new TypeError('Undeclared NodeRef');
        if (!instance.handles.has(id)) instance.handles.set(id, createNodeHandle(instance.nodes.get(id), instance.view.frame, { window, scheduler, active: () => active() && !instance.disposed, pointers: instance.pointers }));
        return instance.handles.get(id).handle;
    }
    async function startController(instance) {
        const images = new Map(), canvases = new Map(); let revision = 0, loadingImages = 0;
        const revoke = () => { revision++; images.forEach(item => item.release?.()); images.clear(); canvases.forEach(item => item.dispose()); canvases.clear(); };
        instance.revokeScriptMedia = revoke;
        instance.cleanups.add(revoke);
        const controller = await (async () => scripts.attach({ artifact: await resources.json(instance.ir.controller.resource, 'script'), required: instance.ir.controller.required,
            snapshot: () => ({ props: instance.props, state: instance.state, env: instance.view.environment.get(), time: Date.now() }),
            failure: error => {
                if (!error.scriptFatal && instance.failBoundary) instance.failBoundary(error);
                else { instance.view.failure.hidden = false; instance.view.failureText.textContent = 'Required Controller unavailable. Reload presentation to recover.'; }
            }, revoked: () => { revoke(); instance.handles.forEach(handle => handle.dispose()); instance.handles.clear(); },
            capability: async (method, args) => {
                if (disposed || instance.disposed) throw new Error('script_revoked');
                if (method === 'bridge') return instance.bridge[args[0]](...args.slice(1));
                if (method === 'state') { if (typeof args[0] !== 'string' || !args[0].startsWith('component.')) throw new Error('script_state_scope'); write(instance, args[0], args[1]); } else if (method === 'emit') {
                    if (!Object.hasOwn(instance.contract.emits, args[0])) throw new Error('script_emit_denied');
                    await instance.onEmit?.(args[0], assertValue(args[1], instance.contract.emits[args[0]]), 1);
                } else if (method === 'node') {
                    const handle = nodeHandle(instance, args[0]);
                    if (!['measure', 'focus', 'capturePointer', 'releasePointer'].includes(args[1])) throw new Error('script_node_method');
                    return handle[args[1]](args[2]);
                } else if (method === 'media') {
                    const token = revision, mediaEpoch = media.epoch;
                    const binding = bridgeDescriptor.bindings.find(binding => binding.id === args[0]);
                    if (!instance.ir.uses.includes(args[0]) || binding?.target?.service !== 'host.media' || binding.target.method !== 'resolve') throw new Error('script_media_scope');
                    const authorization = await instance.bridge.snapshot(args[0], { ref: args[1], type: 'image' });
                    if (!authorization.ok || instance.disposed || token !== revision || media.epoch !== mediaEpoch) throw new Error('script_media_denied');
                    if (images.size + loadingImages >= 32) throw new Error('script_media_budget');
                    loadingImages++;
                    try {
                        const result = await media.resolve(args[1], 'image');
                        if (token !== revision || instance.disposed || media.epoch !== mediaEpoch) { result.release?.(); throw new Error('script_media_revoked'); }
                        const image = new window.Image(); image.src = result.url;
                        try { await image.decode(); } catch (error) { result.release?.(); throw error; }
                        if (token !== revision || instance.disposed || media.epoch !== mediaEpoch) { result.release?.(); throw new Error('script_media_revoked'); }
                        const handle = 'image.' + window.crypto.randomUUID(); images.set(handle, { image, release: result.release, mediaEpoch }); return handle;
                    } finally { loadingImages--; }
                } else if (method === 'canvas') {
                    const id = args[0], node = instance.nodes.get(id);
                    if (!instance.contract.nodeRefs.includes(id) || node?.localName !== 'canvas') throw new Error('script_canvas_denied');
                    if (!canvases.has(id)) canvases.set(id, createCanvasSurface(node, scheduler, handle => { const item = images.get(handle); return item?.mediaEpoch === media.epoch ? item.image : null; }, canvasBudget, instance.failBoundary ?? diagnostic));
                    canvases.get(id).submit(args[1]);
                }
            } }))().catch(error => {
            options.onDiagnostic?.({ category: 'script', reasonCode: 'script_unavailable', sourceId: instance.ir.id, message: 'Controller resource or capacity unavailable.' });
            if (instance.ir.controller.required) {
                if (instance.failBoundary) instance.failBoundary(error);
                else { instance.view.failure.hidden = false; instance.view.failureText.textContent = 'Required Controller unavailable. Reload presentation to recover.'; }
            }
            return { status: 'unavailable', dispose() {}, invoke() {} };
        });
        if (disposed || instance.disposed) controller.dispose(); else instance.controller = controller;
    }
    function propsFor(contract, input) {
        for (const key of Object.keys(input)) if (!Object.hasOwn(contract.props, key)) throw new TypeError('Undeclared Component prop');
        return Object.fromEntries(Object.entries(contract.props).map(([key, declaration]) => [key, assertValue(Object.hasOwn(input, key) ? input[key] : declaration.default, declaration.schema)]));
    }
    async function createInstance(id, view, props = {}, onEmit = null, failBoundary = null, attachTo = null) {
        if (instances.size >= 512 || disposed) throw new Error('Component instance budget exceeded or disposed');
        const ir = await resources.json('component:' + id, 'component');
        if (disposed || view.disposed) throw new Error('Stale View load');
        const contract = assertPresentationContract(ir.presentation);
        const host = document.createElement('atri-component'); host.style.display = 'block'; host.dataset.component = id;
        const shadow = host.attachShadow({ mode: 'open' }); attachTo?.append(host);
        const instance = { id: 'instance.' + (++sequence), ir, contract, view, host, shadow, props: propsFor(contract, props),
            bridgeState: Object.fromEntries(ir.uses.map(id => [id, null])), state: clone(contract.state.component?.initial ?? {}), form: { dirty: {}, touched: {}, errors: {}, busy: false }, nodes: new Map(), handles: new Map(), pointers: new Set(), cleanups: new Set(), onEmit, failBoundary, disposed: false };
        instance.bridge = bridge.scope(ir.id, ir.uses);
        instances.set(instance.id, instance);
        instance.dispose = () => {
            if (instance.disposed) return;
            if (instance.mounted) { void lifecycle(instance, 'deactivate'); void lifecycle(instance, 'unmount'); }
            instance.disposed = true; instance.controller?.dispose(); instance.bridge.dispose();
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
            if (input && JSON.stringify(input) !== JSON.stringify(instance.props)) { instance.props = propsFor(contract, input); await lifecycle(instance, 'propsChanged'); await instance.controller?.invoke('update'); }
            await block.update();
        };
        return instance;
    }
    async function createBlock(definition, instance, initialItem, parent, insideBoundary = false) {
        if (!insideBoundary && typeof definition === 'object' && (definition.component || definition.boundary || definition.asset || definition.media || definition.bindings?.media)) return createBoundary(definition, instance, initialItem, parent);
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
        let item = initialItem, childInstance = null, gone = false, mediaKey = null, mediaRequest = 0, mediaRelease = null;
        const node = definition.tag === 'component' ? document.createElement('div') : SVG.has(definition.tag)
            ? document.createElementNS('http://www.w3.org/2000/svg', definition.tag) : document.createElement(definition.tag);
        const disposers = [], children = []; let proseText = null;
        const dispose = () => {
            if (gone) return; gone = true; composing.delete(node); ++mediaRequest; mediaRelease?.(); --nodeCount; childInstance?.dispose(); children.forEach(child => child.dispose()); disposers.forEach(clean => clean());
            if (instance.nodes.get(definition.id) === node) instance.nodes.delete(definition.id); node.remove(); instance.cleanups.delete(dispose);
        };
        instance.cleanups.add(dispose);
        node.dataset.nodeId = definition.id;
        for (const [key, value] of Object.entries(definition.attributes)) {
            if (['disabled', 'checked', 'selected', 'multiple', 'required', 'hidden', 'open', 'controls', 'loop', 'muted', 'playsinline'].includes(key)) node[key === 'playsinline' ? 'playsInline' : key] = value === 'true' || value === '';
            else node.setAttribute(key, value);
        }
        if (definition.tag === 'button' && !definition.attributes.type) node.type = 'button';
        if (definition.tag === 'slot' && definition.slot && definition.slot !== 'default') node.name = definition.slot;
        parent.append(node); instance.nodes.set(definition.id, node);
        if (['audio', 'video'].includes(definition.tag)) {
            node.preload = 'metadata'; node.controls = true;
            const pause = () => { if (document.hidden || instance.view.content.inert) node.pause(); };
            document.addEventListener('visibilitychange', pause); disposers.push(() => { document.removeEventListener('visibilitychange', pause); node.pause(); node.removeAttribute('src'); });
        }
        const readProps = () => Object.fromEntries(Object.entries(definition.props ?? {}).map(([key, value]) => [key, evaluate(value, context(instance, item))]));
        if (definition.component) {
            childInstance = await createInstance(definition.component, instance.view, readProps(), async (event, value, depth) => {
                const interaction = definition.events?.[event]; if (interaction) await run(instance, interaction, item, { value }, depth);
            }, instance.failBoundary, node);
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
            deltaY: Math.max(-10000, Math.min(10000, event.deltaY ?? 0)), isComposing: Boolean(event.isComposing || composing.has(node)),
            inputType: String(event.inputType ?? '').slice(0, 64), data: String(event.data ?? '').slice(0, 4096),
            selectionStart: Math.max(0, Math.min(65536, node.selectionStart ?? 0)), selectionEnd: Math.max(0, Math.min(65536, node.selectionEnd ?? 0)),
            direction: ['left', 'right', 'up', 'down'].includes(event.detail?.direction) ? event.detail.direction : '',
            scale: Math.max(0.1, Math.min(10, event.detail?.scale ?? 1)) });
        listen('pointerdown', event => { if (instance.pointers.size < 16) instance.pointers.add(event.pointerId); });
        listen('pointerup', event => instance.pointers.delete(event.pointerId));
        listen('pointercancel', event => instance.pointers.delete(event.pointerId));
        if (instance.ir.controller && instance.contract.nodeRefs.includes(definition.id)) for (const type of ['click', 'pointerdown', 'pointermove', 'pointerup', 'keydown', 'keyup', 'input', 'change']) listen(type, event => {
            if ((event.isComposing || composing.has(node)) && ['keydown', 'keyup', 'input'].includes(type)) return;
            void instance.controller?.invoke('event', { ...eventValue(event), type, node: definition.id });
        });
        if (definition.events?.drop) listen('dragover', event => event.preventDefault());
        if (definition.tag === 'img') listen('error', () => {
            if (node.dataset.mediaStatus === 'available' && !definition.asset) {
                node.dataset.mediaStatus = 'unavailable'; node.dataset.mediaReason = 'media_decode_failed';
                const ref = definition.media ?? evaluate(definition.bindings.media, context(instance, item)); const request = mediaRequest;
                void media.fallback(ref).then(url => { if (!gone && request === mediaRequest) node.src = url; }).catch(instance.failBoundary ?? diagnostic);
            } else if (definition.boundary === 'required') (instance.failBoundary ?? diagnostic)(new Error('media_decode_failed'));
        });
        const input = definition.tag === 'option' ? null : definition.bindings?.value ?? definition.bindings?.checked;
        if (input) {
            const change = () => {
                if (composing.has(node)) return;
                instance.form.dirty[definition.id] = true;
                let value = definition.bindings.checked ? node.checked : node.value;
                if (node.type === 'number' || node.type === 'range') value = node.value === '' ? null : Number(node.value);
                try { write(instance, input.get, value); delete instance.form.errors[definition.id]; node.setCustomValidity?.(''); } catch { instance.form.errors[definition.id] = 'invalid_value'; node.setCustomValidity?.('Invalid value'); requestRender(); }
            };
            listen('compositionstart', () => composing.add(node));
            listen('compositionend', () => { composing.delete(node); change(); requestRender(); });
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
                if ((e.isComposing || composing.size) && ['submit', 'keydown', 'keyup'].includes(event)) { if (event === 'submit') e.preventDefault(); return; }
                if (event === 'submit') { e.preventDefault(); if (!node.checkValidity()) { node.reportValidity(); return; } }
                const interrupt = instance.contract.interactions[interaction]?.every(action => {
                    const target = bridgeDescriptor.bindings.find(binding => binding.id === action.target)?.target;
                    return action.kind === 'action.invoke' && target?.service === 'host.conversation' && target.method === 'cancel';
                });
                if (instance.form.busy && !interrupt) return;
                if (!interrupt) instance.form.busy = true;
                void run(instance, interaction, item, eventValue(e)).catch(instance.failBoundary ?? diagnostic).finally(() => { if (!interrupt) instance.form.busy = false; requestRender(); });
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
                if (sink === 'media') continue;
                if (sink === 'prose') { const text = String(value ?? ''); if (proseText !== text) { renderSafeProse(node, text, { openExternal: options.hostActions?.openExternal }); proseText = text; } } else if (sink === 'text') { if (children.length) throw new TypeError('Text binding cannot replace declared children'); node.textContent = String(value ?? ''); } else if (sink === 'value') { if (!composing.has(node) && node.value !== String(value ?? '')) node.value = String(value ?? ''); } else if (['checked', 'disabled', 'hidden'].includes(sink)) node[sink] = Boolean(value);
                else node.setAttribute(sink, String(value ?? ''));
            }
            if (definition.message) node.textContent = localization.text(definition.message, Object.fromEntries(Object.entries(definition.messageArgs ?? {}).map(([key, expr]) => [key, evaluate(expr, ctx)])));
            const mediaRef = definition.asset ? { kind: 'exact', id: definition.asset } : definition.media ?? (definition.bindings?.media ? evaluate(definition.bindings.media, ctx) : null);
            if (mediaRef) {
                const key = media.epoch + ':' + JSON.stringify(mediaRef);
                if (key !== mediaKey) {
                    mediaRelease?.(); mediaRelease = null; mediaKey = key; const request = ++mediaRequest; node.dataset.mediaStatus = 'loading';
                    try {
                        const result = await media.resolve(mediaRef, definition.tag === 'img' ? 'image' : definition.tag);
                        if (gone || instance.disposed || request !== mediaRequest) { result.release?.(); return; }
                        mediaRelease = result.release;
                        node.src = result.url; node.dataset.mediaStatus = result.status; node.dataset.mediaReason = result.reasonCode;
                        if (definition.tag === 'img') { node.referrerPolicy = 'no-referrer'; node.loading = 'lazy'; }
                    } catch (error) { mediaKey = null; if (gone || instance.disposed) return; if (!key.startsWith(media.epoch + ':')) { requestRender(); return; } throw error; }
                }
            } else if (mediaKey) { ++mediaRequest; mediaRelease?.(); mediaRelease = null; mediaKey = null; node.removeAttribute('src'); }
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
            if (['audio', 'video'].includes(definition.tag) && (document.hidden || instance.view.content.inert || node.closest('[hidden]'))) node.pause();
            await childInstance?.update(readProps());
            for (const child of children) await child.update(item);
            // Dynamic options must exist before synchronizing the selected identity.
            if (definition.tag === 'select' && definition.bindings?.value && !composing.has(node)) {
                const value = String(evaluate(definition.bindings.value, ctx) ?? '');
                if (node.value !== value) node.value = value;
            }
        }
        await update();
        return { node, update, dispose };
    }
    async function createBoundary(definition, instance, initialItem, parent) {
        const node = document.createElement('div'), content = document.createElement('div'), surface = document.createElement('div');
        node.style.display = 'contents'; content.style.display = 'contents';
        node.dataset.boundary = definition.id; surface.setAttribute('role', 'status'); node.append(content, surface); parent.append(node);
        let block = null, item = initialItem, pending = false, gone = false, epoch = 0, failed = false;
        const owned = new Set();
        const scoped = new Proxy(instance, { get(target, key) { return key === 'cleanups' ? owned : key === 'failBoundary' ? report : Reflect.get(target, key); }, set(target, key, value) { return Reflect.set(target, key, value); } });
        const cleanup = () => { block?.dispose(); block = null; owned.forEach(clean => clean()); owned.clear(); content.replaceChildren(); };
        const dispose = () => { if (gone) return; gone = true; ++epoch; cleanup(); node.remove(); instance.cleanups.delete(dispose); };
        instance.cleanups.add(dispose);
        const report = () => {
            if (gone || instance.disposed) return;
            ++epoch; failed = true; pending = false; cleanup(); node.dataset.boundaryStatus = 'error';
            surface.hidden = false; surface.setAttribute('role', 'alert'); surface.textContent = definition.attributes['boundary-error'] ?? 'This section is unavailable. ';
            const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = definition.attributes['boundary-retry'] ?? 'Retry section';
            retry.onclick = () => { void start(); }; surface.append(retry);
            options.onDiagnostic?.({ category: 'presentation', reasonCode: 'frontend_boundary_failed', retryable: true, sourceId: instance.ir.id + ':' + definition.id, diagnosticRef: definition.id, message: 'This section could not be displayed.' });
        };
        async function start() {
            if (gone || pending || instance.disposed) return;
            const revision = ++epoch; pending = true; failed = false;
            if (definition.read) instance.bridgeState[definition.read] = null;
            surface.hidden = false; surface.setAttribute('role', 'status'); surface.textContent = definition.attributes['boundary-loading'] ?? 'Loading…'; node.dataset.boundaryStatus = 'loading';
            try {
                const next = await createBlock(definition, scoped, item, content, true);
                if (gone || revision !== epoch || instance.disposed) { next.dispose(); return; }
                block = next; surface.hidden = true; node.dataset.boundaryStatus = 'content';
            } catch {
                if (revision === epoch) report();
            } finally { if (revision === epoch) pending = false; }
        }
        async function update(nextItem = item) {
            item = nextItem; if (gone || pending || failed || !block) return;
            try {
                const read = definition.read && instance.bridgeState[definition.read];
                if (read && !read.ok && ['failed', 'error'].includes(read.status)) throw new Error('read_failed');
                await block.update(item);
            } catch { report(); }
        }
        await start();
        return { node, update, dispose };
    }
    async function createRepeat(definition, instance, item, parent) {
        // A div inside select is not an option container. Keep repeated options
        // directly in their native select/optgroup between inert range markers.
        const options = definition.tag === 'option';
        const node = options ? document.createComment('options:' + definition.id) : document.createElement('div');
        if (!options) node.dataset.repeat = definition.id;
        parent.append(node);
        const endMarker = options ? document.createComment('/options') : null;
        if (endMarker) parent.append(endMarker);
        const container = options ? parent : node;
        const rows = new Map(); let gone = false;
        const dispose = () => { if (gone) return; gone = true; --nodeCount; node.removeEventListener('scroll', onScroll); rows.forEach(row => row.dispose()); endMarker?.remove(); node.remove(); instance.cleanups.delete(dispose); };
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
            let cursor = options ? node.nextSibling : virtual ? top.nextSibling : node.firstChild;
            for (let index = start; index < end; index++) {
                const key = keys[index];
                if (!rows.has(key)) rows.set(key, await createBlock(rowDef, instance, values[index], container));
                const row = rows.get(key); await row.update(values[index]);
                if (row.node !== cursor) container.insertBefore(row.node, cursor ?? (options ? endMarker : virtual ? bottom : null));
                if (virtual) { row.node.style.height = definition.rowHeight + 'px'; row.node.style.boxSizing = 'border-box'; row.node.style.overflow = 'hidden'; }
                cursor = row.node.nextSibling;
            }
            if (virtual) { top.style.height = start * definition.rowHeight + 'px'; bottom.style.height = (values.length - end) * definition.rowHeight + 'px'; node.append(bottom); }
        }
        await update();
        return { node, update, dispose };
    }
    function setLocale(locale) { localization.setLocale(locale); for (const view of [...views, ...overlays]) { view.frame.lang = localization.locale; view.frame.dir = localization.direction; view.environment.update(); } requestRender(); }
    function announce(text) { const live = (overlays.at(-1) ?? views.at(-1))?.live; if (live) live.textContent = String(text).slice(0, 4096); }
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
        frame.style.cssText = 'display:flex;flex-direction:column;position:relative;contain:layout paint style;isolation:isolate;overflow:hidden;transform:translateZ(0);box-sizing:border-box;min-width:0;min-height:200px;width:100%;height:100%;max-width:100%;max-height:100%';
        const shell = frame.attachShadow({ mode: 'open' }), content = document.createElement('div'), overlayRoot = document.createElement('div');
        content.style.cssText = 'flex:1;min-height:0;height:100%;width:100%;overflow:auto;box-sizing:border-box';
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
        let previousInset = 0;
        view.environment = createPresentationEnvironment(window, frame, environment => {
            requestRender();
            if (environment.keyboardInset > previousInset) scheduler.frame(() => { if (!view.disposed) deepFocus()?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); });
            previousInset = environment.keyboardInset;
        }, { locale: () => localization.locale, direction: () => localization.direction, textScale: options.textScale, uiScale: options.uiScale });
        frame.lang = localization.locale; frame.dir = localization.direction;
        const live = document.createElement('div'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)'; shell.append(live); view.live = live;
        if (media.origins.length) {
            const permission = document.createElement('details'), label = document.createElement('summary'), description = document.createElement('p'), toggle = document.createElement('button');
            permission.dir = document.documentElement.dir || 'ltr'; permission.lang = document.documentElement.lang || 'en';
            permission.style.cssText = 'flex:none;max-height:35%;overflow:auto;padding:8px;box-sizing:border-box;background:Canvas;color:CanvasText';
            label.style.cssText = 'width:max-content;max-width:55%;cursor:pointer'; toggle.style.minHeight = '44px';
            label.textContent = 'Remote images'; description.textContent = media.origins.join(', ') + '. These sites can observe your IP address, image choices and request timing. You can disable remote images at any time.';
            toggle.type = 'button'; const sync = () => { toggle.textContent = media.enabled ? 'Disable remote images' : 'Enable remote images'; }; sync();
            toggle.onclick = () => { media.setEnabled(!media.enabled); sync(); }; permission.append(label, description, toggle); shell.prepend(permission);
        }
        content.style.paddingBottom = 'var(--atria-keyboard-inset, 0px)';
        content.style.scrollPaddingBottom = 'calc(var(--atria-keyboard-inset, 0px) + 16px)';
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
            content.replaceChildren();
            view.root = await createInstance(ir.root, view, {}, null, null, content); if (disposed) throw new Error('Stale View load');
            content.replaceChildren(view.root.host);
            view.ready = true;
            for (const instance of instances.values()) if (instance.view === view) await activateInstance(instance);
            return view;
        } catch (error) {
            if (disposed || view.disposed) { disposeView(view); throw error; }
            content.replaceChildren(); view.failure.hidden = false; view.failureText.textContent = 'This View could not be displayed. ';
            options.onDiagnostic?.({ category: 'presentation', reasonCode: 'frontend_view_failed', retryable: true, sourceId: id, message: 'This View could not be displayed.' });
            return view;
        }
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
            ++navigation; ++overlayRevision; media.reset(); composing.clear();
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
    try { await navigate(resources.index.primaryView.slice(5)); } catch (error) { disposed = true; window.clearInterval(bridgeTimer); bridge.dispose(); scripts.dispose(); scheduler.dispose(); media.dispose(); resources.dispose(); throw error; }
    return Object.freeze({ mode: options.mode, status: 'active', refresh() { requestRender(); return bridge.refresh(); }, getContributions: () => [], getRenderReceipts: () => [],
        navigate, back, openOverlay, closeOverlay,
        recover, setLocale, announce, issueMedia: media.issue, setRemoteMediaEnabled: media.setEnabled,
        getDiagnostics() {
            const result = clone(advisoryDiagnostics);
            for (const instance of instances.values()) for (const [id, node] of instance.nodes) {
                if (!node.matches('button,input,select,textarea,[role=button]') || !node.isConnected || node.hidden) continue;
                const rect = node.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) result.push({ category: 'accessibility', reasonCode: 'a11y_touch_target', sourceId: instance.ir.id + ':' + id });
            }
            return result.slice(0, 4096);
        },
        getState() { return clone({ ...shared, view: views.at(-1)?.state ?? {} }); },
        setState(scope, path, value) { const root = views.at(-1)?.root; if (!root || !active()) throw new Error('Frontend unavailable'); write(root, scope + '.' + path, value); },
        getNodeRef(instanceId, nodeId) {
            const instance = instances.get(instanceId); if (!instance) throw new TypeError('Undeclared NodeRef');
            return nodeHandle(instance, nodeId);
        },
        getInstances() { return [...instances.values()].map(instance => ({ id: instance.id, componentId: instance.ir.id, ...(instance.ir.controller ? { script: instance.controller?.status ?? 'loading' } : {}) })); },
        scheduler: Object.freeze({ frame: scheduler.frame }),
        dispose() { if (disposed) return; recoveryFailure?.unmount(); ++navigation; [...overlays, ...views].reverse().forEach(disposeView); disposed = true; window.clearInterval(bridgeTimer); bridge.dispose(); scripts.dispose(); scheduler.dispose(); media.dispose(); resources.dispose(); instances.clear(); },
    });
}
