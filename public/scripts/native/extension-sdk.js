import { extensionFileUrl } from './extensions-client.js';

// User-enabled page code, not a sandbox. Ownership covers SDK resources and
// registered cleanup; direct DOM/network/global side effects remain the author's responsibility.
export function createExtensionSdk({ plugin, context, document: doc, root, isCurrent, nativeApi, illustrationApi, subscribe, report = () => {} }) {
    const controller = new AbortController();
    const resources = new Set();
    let closed = false;
    const assertCurrent = () => { if (closed || !isCurrent()) throw new Error('atri_extension_disposed'); };
    const invoke = (callback, ...args) => {
        if (closed || !isCurrent()) return;
        try { Promise.resolve(callback(...args)).catch(report); } catch (error) { report(error); }
    };
    const own = cleanup => {
        assertCurrent();
        if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function');
        let live = true;
        const release = () => {
            if (!live) return;
            live = false; resources.delete(release);
            try { return Promise.resolve(cleanup()).catch(report); } catch (error) { report(error); }
        };
        resources.add(release);
        return release;
    };
    const mount = node => {
        assertCurrent();
        if (!node || node.ownerDocument !== doc || node.parentNode) throw new TypeError('Mount requires a new, unattached node');
        root.append(node);
        return own(() => node.remove());
    };
    const native = {};
    for (const name of ['getInformationProjection', 'getTemporalProjection', 'getActorAvailability', 'getContinuityProjection',
        'lifecycleCommand', 'continuityCommand', 'realmCommand', 'activityCommand', 'presentScene']) {
        native[name] = async (...args) => {
            assertCurrent();
            if (!context.sessionId) throw new Error('atri_extension_session_required');
            if (!context.ready) throw new Error('atri_extension_not_ready');
            const api = nativeApi();
            if (typeof api?.[name] !== 'function') throw new Error('atri_extension_capability_unavailable');
            const result = await api[name](...structuredClone(args));
            assertCurrent();
            return structuredClone(result);
        };
    }
    const illustrationCall = callback => async (...args) => {
        assertCurrent();
        const result = await callback(...structuredClone(args));
        assertCurrent(); return structuredClone(result);
    };
    const illustrations = illustrationApi && Object.freeze({
        snapshot: () => { assertCurrent(); return illustrationApi.snapshot(); },
        settings: Object.freeze({ read: illustrationCall(illustrationApi.settings.read), save: illustrationCall(illustrationApi.settings.save) }),
        toolbarInset: () => { assertCurrent(); return illustrationApi.toolbarInset?.(context) ?? 16; },
        selection: () => { assertCurrent(); return illustrationApi.selection(context); },
        setSelectionMode(enabled) { assertCurrent(); illustrationApi.selectionMode({ ...context, selectionOwner: plugin.id }, Boolean(enabled)); },
        onSurfacesChanged(callback) { assertCurrent(); if (typeof callback !== 'function') throw new TypeError('Listener must be a function'); return own(illustrationApi.subscribe(() => invoke(callback))); },
        command: illustrationCall((command, input) => {
            if (!context.sessionId || context.historical) throw new Error('atri_extension_session_readonly');
            return illustrationApi.command(context, command, input, controller.signal);
        }),
    });
    if (illustrationApi) own(() => illustrationApi.selectionMode({ ...context, selectionOwner: plugin.id }, false));
    return {
        sdk: Object.freeze({
            apiVersion: 1, context: Object.freeze({ ...context }), signal: controller.signal,
            onDispose: own,
            assetUrl: path => { assertCurrent(); return extensionFileUrl(plugin, path); },
            ui: Object.freeze({ mount, style(css) {
                assertCurrent();
                if (typeof css !== 'string') throw new TypeError('CSS must be text');
                const node = doc.createElement('style'); node.textContent = css;
                return mount(node);
            } }),
            events: Object.freeze({ on(type, callback) {
                assertCurrent();
                if (typeof callback !== 'function') throw new TypeError('Listener must be a function');
                return own(subscribe(type, event => invoke(callback, event)));
            }, listen(target, type, callback, options) {
                assertCurrent();
                if (typeof callback !== 'function') throw new TypeError('Listener must be a function');
                const guarded = event => invoke(callback, event);
                target.addEventListener(type, guarded, options);
                return own(() => target.removeEventListener(type, guarded, options));
            } }),
            timers: Object.freeze({ timeout(callback, ms) {
                assertCurrent();
                const id = setTimeout(() => { release(); invoke(callback); }, ms);
                const release = own(() => clearTimeout(id)); return release;
            }, interval(callback, ms) {
                assertCurrent();
                const id = setInterval(() => invoke(callback), ms);
                return own(() => clearInterval(id));
            } }),
            native: Object.freeze(native),
            ...(illustrations ? { illustrations } : {}),
        }),
        dispose() {
            if (closed) return Promise.resolve();
            closed = true; controller.abort();
            const pending = [...resources].reverse().map(release => release());
            root.remove();
            return Promise.allSettled(pending);
        },
    };
}
