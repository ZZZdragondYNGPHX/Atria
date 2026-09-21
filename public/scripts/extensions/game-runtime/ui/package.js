import { loadGamePackageTextResource } from '../package-loader.js';

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
    if (!ui || ui.mode !== 'component') return null;

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game UI cannot load without a character package id');
    }

    const entry = String(ui.entry || '').trim();
    if (!entry.endsWith('.html')) {
        throw new Error(
            `Component UI entry '${entry}' must be an .html file in the current R4 runtime`,
        );
    }

    const html = await loadGamePackageTextResource(charId, entry, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    const documentRef = options.document || globalThis.document;
    if (!documentRef) {
        throw new Error('Component UI requires a document');
    }

    return Object.freeze({
        id: 'package.component',
        surface: ui.surface || 'app.root',
        className: 'atria-game-package-component',
        async mount(context) {
            const fragment = sanitizeGameHtmlFragment(documentRef, html);
            if (typeof context.container.replaceChildren === 'function') {
                context.container.replaceChildren(fragment);
            } else {
                context.container.innerHTML = '';
                context.container.appendChild(fragment);
            }
        },
    });
}
