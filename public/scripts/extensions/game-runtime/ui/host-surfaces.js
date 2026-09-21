const SURFACE_ANCHOR_ATTRIBUTE = 'data-atria-game-host-surface';

function createAnchor(documentRef, surfaceId) {
    const anchor = documentRef.createElement('div');
    anchor.setAttribute(SURFACE_ANCHOR_ATTRIBUTE, surfaceId);
    anchor.className = 'atria-game-host-surface';
    return anchor;
}

function insertBefore(parent, anchor, reference) {
    if (!parent || !reference || reference.parentNode !== parent) return false;
    parent.insertBefore(anchor, reference);
    return true;
}

function insertAfter(parent, anchor, reference) {
    if (!parent || !reference || reference.parentNode !== parent) return false;
    if (reference.nextSibling) parent.insertBefore(anchor, reference.nextSibling);
    else parent.appendChild(anchor);
    return true;
}

export function createAtriaSurfaceAdapter(documentRef = globalThis.document, options = {}) {
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new Error('Atria Surface Adapter requires a document');
    }

    const anchors = new Map();
    const mode = String(options.mode || 'component').trim();
    const shellFoundation = options.shell || null;
    const shell = shellFoundation?.getShell?.() || shellFoundation;
    const nativePlayHost = options.nativePlayHost || shellFoundation?.getPlayHost?.() || null;
    let stageOwnership = null;

    function findExisting(surfaceId) {
        return documentRef.querySelector?.(
            '[' + SURFACE_ANCHOR_ATTRIBUTE + '="' + surfaceId + '"]',
        ) || null;
    }

    function ensureAnchor(surfaceId) {
        if (anchors.has(surfaceId)) return anchors.get(surfaceId);
        const existing = findExisting(surfaceId);
        if (existing) {
            anchors.set(surfaceId, existing);
            return existing;
        }

        const sheld = documentRef.getElementById?.('sheld');
        const chat = documentRef.getElementById?.('chat');
        const formSheld = documentRef.getElementById?.('form_sheld');
        const sendForm = documentRef.getElementById?.('send_form');
        const leftPanel = documentRef.getElementById?.('left-nav-panel');
        const rightPanel = documentRef.getElementById?.('right-nav-panel');
        const body = documentRef.body;
        const anchor = createAnchor(documentRef, surfaceId);
        let inserted = false;

        if (
            surfaceId === 'app.root'
            && mode === 'hybrid'
            && shell?.slots?.stage
            && typeof nativePlayHost?.acquireStageOwnership === 'function'
        ) {
            stageOwnership ||= nativePlayHost.acquireStageOwnership('game-runtime:hybrid');
            anchor.classList.add('atria-game-host-surface--stage');
            shell.slots.stage.appendChild(anchor);
            inserted = true;
        } else if (surfaceId === 'app.root') {
            inserted = insertBefore(sheld, anchor, chat);
        } else if (surfaceId === 'chat.header') {
            inserted = insertBefore(sheld, anchor, chat);
        } else if (surfaceId === 'chat.footer') {
            inserted = insertBefore(sheld, anchor, formSheld);
        } else if (surfaceId === 'composer.before') {
            inserted = insertBefore(formSheld, anchor, sendForm);
        } else if (surfaceId === 'composer.after') {
            inserted = insertAfter(formSheld, anchor, sendForm);
        } else if (surfaceId === 'sidebar.left') {
            if (leftPanel) {
                leftPanel.appendChild(anchor);
                inserted = true;
            }
        } else if (surfaceId === 'sidebar.right') {
            const semanticDock = shell?.slots?.dock;
            if (semanticDock) {
                anchor.classList.add('atria-game-host-surface--dock');
                semanticDock.appendChild(anchor);
                shell?.setDockOpen?.(true);
                inserted = true;
            } else if (rightPanel) {
                rightPanel.appendChild(anchor);
                inserted = true;
            }
        } else if (surfaceId === 'drawer' || surfaceId === 'modal') {
            const semanticTransient = shell?.slots?.transient;
            if (semanticTransient) {
                anchor.classList.add('atria-game-host-surface--transient');
                semanticTransient.appendChild(anchor);
                inserted = true;
            } else if (body) {
                body.appendChild(anchor);
                inserted = true;
            }
        }

        if (!inserted) return null;
        anchors.set(surfaceId, anchor);
        return anchor;
    }

    return Object.freeze({
        resolveSurface: ensureAnchor,
        destroy() {
            for (const anchor of anchors.values()) {
                anchor.remove?.();
            }
            anchors.clear();
            stageOwnership?.release?.();
            stageOwnership = null;
        },
        getAnchors() {
            return [...anchors.entries()].map(([surface, anchor]) => ({ surface, anchor }));
        },
    });
}
