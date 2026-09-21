const HIDDEN_TARGET_IDS = Object.freeze([
    'sheld',
    'top-bar',
    'top-settings-holder',
]);

function saveElementState(element) {
    return {
        element,
        display: element.style.display,
        ariaHidden: element.getAttribute('aria-hidden'),
        hiddenMarker: element.dataset.atriaGameFullHidden,
    };
}

function hideElement(state) {
    state.element.dataset.atriaGameFullHidden = 'true';
    state.element.style.display = 'none';
    state.element.setAttribute('aria-hidden', 'true');
}

function restoreElement(state) {
    state.element.style.display = state.display;
    if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
    else state.element.setAttribute('aria-hidden', state.ariaHidden);

    if (state.hiddenMarker === undefined) delete state.element.dataset.atriaGameFullHidden;
    else state.element.dataset.atriaGameFullHidden = state.hiddenMarker;
}

function makeButton(documentRef, action, label) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.dataset.atriaGameRecoveryAction = action;
    button.className = 'atria-game-recovery-action';
    button.textContent = label;
    return button;
}

export function createFullGameHost(documentRef = globalThis.document, options = {}) {
    if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
        throw new Error('Full Game Host requires a document with a body');
    }

    const existing = documentRef.getElementById('atria-game-full-root');
    if (existing) {
        throw new Error('A Full Game UI is already active');
    }

    const root = documentRef.createElement('main');
    root.id = 'atria-game-full-root';
    root.dataset.atriaGameFullRoot = 'true';
    root.setAttribute('role', 'main');
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '4900';
    root.style.overflow = 'auto';
    root.style.boxSizing = 'border-box';
    root.style.paddingTop = 'var(--atria-game-safe-area-top, env(safe-area-inset-top, 0px))';
    root.style.paddingRight = 'var(--atria-game-safe-area-right, env(safe-area-inset-right, 0px))';
    root.style.paddingBottom = 'var(--atria-game-safe-area-bottom, env(safe-area-inset-bottom, 0px))';
    root.style.paddingLeft = 'var(--atria-game-safe-area-left, env(safe-area-inset-left, 0px))';

    const recovery = documentRef.createElement('div');
    recovery.id = 'atria-game-full-recovery';
    recovery.dataset.atriaGameHostRecovery = 'true';
    recovery.setAttribute('role', 'toolbar');
    recovery.setAttribute('aria-label', 'Game UI recovery');
    recovery.style.position = 'fixed';
    recovery.style.top = 'max(8px, env(safe-area-inset-top, 0px))';
    recovery.style.right = 'max(8px, env(safe-area-inset-right, 0px))';
    recovery.style.zIndex = '5000';
    recovery.style.display = 'flex';
    recovery.style.gap = '6px';

    const actions = [
        ['exit', 'Exit Game UI', options.onExit],
        ['stop', 'Stop generation', options.onStopGeneration],
        ['disable', 'Disable package', options.onDisablePackage],
        ['diagnostics', 'Diagnostics', options.onDiagnostics],
    ];

    for (const [action, label, handler] of actions) {
        if (typeof handler !== 'function') continue;
        const button = makeButton(documentRef, action, label);
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void Promise.resolve(handler()).catch(error => {
                console.error('[game-runtime] Full UI recovery action failed', {
                    action,
                    error,
                });
            });
        });
        recovery.appendChild(button);
    }

    documentRef.body.appendChild(root);
    documentRef.body.appendChild(recovery);

    const hidden = [];
    let active = false;
    let disposed = false;

    const onEscape = event => {
        if (!active || event.key !== 'Escape') return;
        if (event.defaultPrevented) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (typeof options.onExit === 'function') {
            void Promise.resolve(options.onExit()).catch(error => {
                console.error('[game-runtime] Full UI Escape recovery failed', error);
            });
        }
    };

    function activate() {
        if (disposed) throw new Error('Full Game Host is disposed');
        if (active) return false;

        for (const id of HIDDEN_TARGET_IDS) {
            const element = documentRef.getElementById(id);
            if (!element || element === root || root.contains(element)) continue;
            const state = saveElementState(element);
            hidden.push(state);
            hideElement(state);
        }

        documentRef.addEventListener('keydown', onEscape, true);
        documentRef.body.dataset.atriaGameFullActive = 'true';
        active = true;
        return true;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        active = false;
        documentRef.removeEventListener('keydown', onEscape, true);

        for (const state of hidden.splice(0).reverse()) {
            restoreElement(state);
        }

        delete documentRef.body.dataset.atriaGameFullActive;
        recovery.remove();
        root.remove();
    }

    return Object.freeze({
        root,
        recovery,
        activate,
        dispose,
        isActive: () => active,
    });
}
