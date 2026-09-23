import { loadGamePackageJsonResource } from '../package-loader.js';
import {
    applyResponsiveComponentVisibility,
    compileExperienceComponentModel,
    renderExperienceComponentModel,
} from './component-model.js';
import { bindDeclarativeGameUi } from './declarative.js';
import { createResponsiveEnvironment } from './environment.js';
import {
    bindNativeGameComponents,
    createNativeComponentRegistry,
} from './native-components.js';

const SUPPORTED_COMPONENT_MODES = new Set(['component', 'hybrid', 'full']);

export async function loadGameComponentDefinition(packageState, options = {}) {
    const experience = packageState?.runtime?.experience;
    const mode = String(experience?.mode || '').trim();
    if (!SUPPORTED_COMPONENT_MODES.has(mode)) return null;

    const entry = String(experience?.component || '').trim();
    if (!entry) {
        throw new Error(`${mode} Experience requires a declarative Component Model resource`);
    }
    if (!entry.endsWith('.json')) {
        throw new Error(`${mode} Experience component resource must be declarative .json`);
    }

    const surface = String(experience?.surface || 'app.root').trim();
    if (['hybrid', 'full'].includes(mode) && surface !== 'app.root') {
        throw new Error(`${mode} Experience requires the app.root surface`);
    }

    const raw = await loadGamePackageJsonResource(packageState, entry, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    const compiled = compileExperienceComponentModel(raw, { mode });

    const documentRef = options.document || globalThis.document;
    const windowRef = options.window || globalThis.window;
    if (!documentRef) throw new Error('Component Model requires a document');

    return Object.freeze({
        id: 'experience.' + mode,
        mode,
        surface,
        className: 'atria-experience-' + mode,
        componentResource: entry,
        async mount(context) {
            const root = renderExperienceComponentModel(documentRef, compiled);
            if (typeof context.container.replaceChildren === 'function') {
                context.container.replaceChildren(root);
            } else {
                context.container.innerHTML = '';
                context.container.appendChild(root);
            }

            const cleanup = [];
            try {
                const responsive = createResponsiveEnvironment(context.container, {
                    window: windowRef,
                });
                const syncResponsive = environment => (
                    applyResponsiveComponentVisibility(context.container, environment)
                );
                syncResponsive(responsive.get());
                cleanup.push(responsive.subscribe(syncResponsive));
                cleanup.push(() => responsive.dispose());

                cleanup.push(bindDeclarativeGameUi(context.container, context));

                if (compiled.usesNativeComponents) {
                    const registry = createNativeComponentRegistry(documentRef, {
                        nativePlayHost: options.nativePlayHost,
                    });
                    cleanup.push(bindNativeGameComponents(context.container, registry));
                }
            } catch (error) {
                for (const dispose of cleanup.splice(0).reverse()) dispose();
                throw error;
            }

            let disposed = false;
            return () => {
                if (disposed) return;
                disposed = true;
                for (const dispose of cleanup.splice(0).reverse()) dispose();
            };
        },
    });
}
