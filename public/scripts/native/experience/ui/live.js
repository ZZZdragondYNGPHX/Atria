import { assertFrontendExperience } from '../../../../shared/native-frontend-contract.js';
import { createHeadlessConversation } from '../../frontend/conversation.js';
import { frontendHttpTransport } from '../../frontend/bridge.js';
import { createPackageRuntimeContributionRegistry } from './plugin-contributions.js';
import { createFullGameHost } from './full-host.js';
import { createAtriaSurfaceAdapter } from './host-surfaces.js';
import { createSurfaceHost } from './surfaces.js';
import { mountNativeFrontend } from '../../frontend/runtime.js';
import { loadFrontendBytes } from '../package-loader.js';

const EXPERIENCE_MODES = new Set(['text', 'component', 'hybrid', 'full']);

function createTextExperienceSession(contributions) {
    let disposed = false;
    return Object.freeze({
        mode: 'text',
        status: 'active',
        mountId: null,
        recoveryActive: false,
        getContributions(query = {}) {
            return contributions.list(query);
        },
        refresh() {
            return [];
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
        },
    });
}

export async function activateNativeExperienceRuntime(packageState, worldSession, options = {}) {
    const experience = assertFrontendExperience(packageState?.runtime?.experience);
    const mode = String(experience?.mode || '').trim();
    if (!EXPERIENCE_MODES.has(mode)) {
        throw new Error(`Unsupported Native Experience mode '${mode}'`);
    }

    options.assertCurrent?.();
    const contributions = createPackageRuntimeContributionRegistry(packageState?.runtime?.plugins || []);

    // Text remains the A3 host ABI. It participates in the same Experience
    // dispatcher, but A4 does not replace Native Conversation / Composer.
    if (mode === 'text') return createTextExperienceSession(contributions);

    const documentRef = options.document || globalThis.document;
    if (!documentRef) {
        throw new Error('Native Experience UI activation requires a document');
    }

    const shellFoundation = options.shell || globalThis.Atria?.shell || null;
    const nativePlayHost = options.nativePlayHost || shellFoundation?.getPlayHost?.() || null;
    if (experience.frontend?.version === 3) {
        const adapter = createAtriaSurfaceAdapter(documentRef, { mode, shell: shellFoundation, nativePlayHost });
        let runtime;
        const fullHost = mode === 'full' ? createFullGameHost(documentRef, {
            shell: shellFoundation, nativePlayHost,
            getCapabilities: options.hostActions?.getCapabilities,
            onExit: options.hostActions?.exitExperience,
            onStopGeneration: options.hostActions?.stopGeneration,
            onSave: options.hostActions?.save,
            onDiagnostics: options.hostActions?.openDiagnostics,
            onRecover: () => runtime?.recover(),
            onBeforeEscape: () => runtime?.closeOverlay(),
        }) : null;
        const surfaceHost = createSurfaceHost({
            resolveSurface: id => fullHost && id === 'app.root' ? fullHost.root : adapter.resolveSurface(id),
            createElement: tag => documentRef.createElement(tag),
        });
        const cleanup = () => { runtime?.dispose(); surfaceHost.unmountAll(); fullHost?.dispose(); adapter.destroy(); };
        try {
            runtime = await mountNativeFrontend({ ...options, document: documentRef, window: options.window ?? documentRef.defaultView,
                mode, surfaceHost, entry: experience.frontend.entry,
                hostServices: options.hostServices ?? createHeadlessConversation({ runtime: () => globalThis.Atria?.nativeSessionRuntime, composer: options.composer ?? nativePlayHost?.product?.composerApi, generate: type => globalThis.Atria?.getContext?.()?.generate?.(type), stop: options.hostActions?.stopGeneration, actions: options.hostActions }),
                bridgeTransport: options.bridgeTransport ?? frontendHttpTransport({ sessionId: packageState.sessionId, fetchImpl: options.fetchImpl, headers: options.headers }),
                stateStorage: options.createStateStorage?.({ stateVersion: 3 }, packageState),
                loadBytes: (path, signal) => loadFrontendBytes(packageState, path, { ...options, signal }),
            });
            options.assertCurrent?.(); fullHost?.activate();
            return Object.freeze({ ...runtime, getContributions: query => contributions.list(query),
                get recoveryActive() { return fullHost?.isActive() ?? false; }, dispose: cleanup });
        } catch (error) { cleanup(); throw error; }
    }
    throw new TypeError('Non-Text Experience requires native@3');
}
