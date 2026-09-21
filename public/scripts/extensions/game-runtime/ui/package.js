import { loadGamePackageTextResource } from '../package-loader.js';
import { bindDeclarativeGameUi } from './declarative.js';
import { createResponsiveEnvironment } from './environment.js';
import {
    bindNativeGameComponents,
    createNativeComponentRegistry,
} from './native-components.js';

const BLOCKED_ELEMENTS = Object.freeze([
    'script',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'style',
]);

const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const SUPPORTED_STATIC_UI_MODES = new Set(['component', 'hybrid']);

function isUnsafeUrl(value) {
    const normalized = String(value || '').trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
    return /^(?:javascript|vbscript):/i.test(normalized)
        || /^data:text\/html/i.test(normalized);
}

export function sanitizeGameHtmlFragment(documentRef, html) {
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new Error('Game UI HTML sanitizer requires a document');
    }

    const template = documentRef.createElement('template');
    template.innerHTML = String(html ?? '');

    for (const selector of BLOCKED_ELEMENTS) {
        for (const element of template.content.querySelectorAll(selector)) {
            element.remove();
        }
    }

    for (const element of template.content.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith('on') || name === 'srcdoc') {
                element.removeAttribute(attribute.name);
                continue;
            }
            if (URL_ATTRIBUTES.has(name) && isUnsafeUrl(attribute.value)) {
                element.removeAttribute(attribute.name);
            }
        }
    }

    return template.content.cloneNode(true);
}

export async function loadGameComponentDefinition(packageState, options = {}) {
    const ui = packageState?.manifest?.ui;
    if (!ui || !SUPPORTED_STATIC_UI_MODES.has(ui.mode)) return null;

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game UI cannot load without a character package id');
    }

    const entry = String(ui.entry || '').trim();
    if (!entry.endsWith('.html')) {
        throw new Error(
            `${ui.mode === 'hybrid' ? 'Hybrid' : 'Component'} UI entry '${entry}' must be an .html file in the current R4 runtime`,
        );
    }
    if (ui.mode === 'hybrid' && (ui.surface || 'app.root') !== 'app.root') {
        throw new Error('Hybrid UI currently requires the app.root surface');
    }

    const html = await loadGamePackageTextResource(charId, entry, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    const documentRef = options.document || globalThis.document;
    const windowRef = options.window || globalThis.window;
    if (!documentRef) {
        throw new Error('Game UI requires a document');
    }

    return Object.freeze({
        id: ui.mode === 'hybrid' ? 'package.hybrid' : 'package.component',
        mode: ui.mode,
        surface: ui.surface || 'app.root',
        className: 'atria-game-package-' + ui.mode,
        async mount(context) {
            const fragment = sanitizeGameHtmlFragment(documentRef, html);
            const hasNativeSlots = Boolean(
                fragment.querySelector?.('[data-atria-native-component]'),
            );
            if (ui.mode === 'component' && hasNativeSlots) {
                throw new Error('Native component slots require Hybrid or Full UI mode');
            }

            if (typeof context.container.replaceChildren === 'function') {
                context.container.replaceChildren(fragment);
            } else {
                context.container.innerHTML = '';
                context.container.appendChild(fragment);
            }

            const cleanup = [];
            try {
                const responsive = createResponsiveEnvironment(context.container, {
                    window: windowRef,
                });
                cleanup.push(() => responsive.dispose());

                cleanup.push(bindDeclarativeGameUi(context.container, context));

                if (ui.mode === 'hybrid') {
                    const registry = createNativeComponentRegistry(documentRef);
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
