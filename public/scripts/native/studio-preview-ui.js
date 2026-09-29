import { previewBridgeTransport } from './frontend/preview-bridge.js';
import { compileExperienceComponentModel, renderExperienceComponentModel } from './experience/ui/component-model.js';
import { compileUiDocument } from './experience/ui/v2-document.js';
import { mountUiDocument } from './experience/ui/v2-runtime.js';
import { createIsolatedExperienceSlots } from './isolated-experience-slots.js';
import { translateShellText as t } from '../atria-shell/localization.js';
import { mountNativeFrontend } from './frontend/runtime.js';

export function compileStudioUi(model, mode, expectedVersion = undefined) {
    if (expectedVersion !== undefined && (model?.schemaVersion === 2 ? 2 : 1) !== expectedVersion) throw new TypeError('UI version change requires an explicit migration');
    return model?.schemaVersion === 2 ? compileUiDocument(model, { mode }) : compileExperienceComponentModel(model, { mode });
}

// The production renderer owns local state, forms and disposal. Preview has no
// Session transport, provider, persistence, Shared identity or authority writer.
export function mountStudioPreviewUi(document, root, model, mode, onDiagnostic = () => {}, artifacts = null) {
    if (model?.format === 'atria-frontend-index') {
        const decode = path => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(artifacts.files[path]), char => char.charCodeAt(0))));
        const descriptor = decode(model.resources.find(item => item.kind === 'bridge').path);
        const scopes = Object.fromEntries(model.resources.filter(item => item.kind === 'component').map(item => { const ir = decode(item.path); return [ir.id, ir.uses]; }));
        return mountNativeFrontend({ document, window: document.defaultView, mode, onDiagnostic, entry: artifacts.entry,
            bridgeTransport: previewBridgeTransport({ descriptor, scopes, projections: artifacts.bridgeProjections }),
            loadBytes: async path => {
                if (!Object.hasOwn(artifacts.files, path)) throw new TypeError('Undeclared Preview resource');
                return Uint8Array.from(atob(artifacts.files[path]), char => char.charCodeAt(0));
            }, surfaceHost: { mount(surface) {
                const container = document.createElement('section'); container.dataset.previewSurface = surface;
                container.style.height = '100%'; root.append(container);
                return { container, unmount: () => container.remove() };
            } },
        });
    }
    const compiled = compileStudioUi(model, mode);
    if (model?.schemaVersion !== 2) {
        const node = renderExperienceComponentModel(document, compiled);
        root.append(node);
        return { dispose: () => node.remove() };
    }
    return mountUiDocument(compiled, {
        document, window: document.defaultView, environmentRoot: root, onDiagnostic,
        nativePlayHost: createIsolatedExperienceSlots(document),
        presentation: {
            mountScene(element, sceneId) {
                const note = document.createElement('p'); note.textContent = sceneId + ' · ' + t('Scene playback requires an active scoped session.'); element.append(note);
                return { dispose: () => note.remove() };
            },
            presentScene() { throw new Error('Scene playback requires an active scoped session.'); },
        },
        surfaceHost: { mount(surface) {
            const container = document.createElement('section');
            container.dataset.previewSurface = surface;
            container.setAttribute('aria-label', surface);
            root.append(container);
            return { container, unmount: () => container.remove() };
        } },
    });
}
