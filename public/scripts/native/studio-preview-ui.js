import { previewBridgeTransport } from './frontend/preview-bridge.js';
import { mountNativeFrontend } from './frontend/runtime.js';

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
    throw new TypeError('Preview requires a compiled Native Frontend graph');
}
