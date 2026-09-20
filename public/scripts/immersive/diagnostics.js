function makeButton(documentRef, label, className) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
}

export function createImmersiveDiagnostics({
    document: documentRef = globalThis.document,
    translate = value => value,
    retry = () => {},
    openDiagnostics = () => {},
    onWake = () => {},
} = {}) {
    const sendForm = documentRef?.getElementById('send_form');
    if (!sendForm) {
        return { setEnabled() {}, reportFailure() {}, clear() {}, close: () => false, hasOpen: () => false, dispose() {} };
    }

    const root = documentRef.createElement('div');
    root.id = 'atriaImmersiveFailure';
    root.className = 'atria-immersive-failure';
    root.hidden = true;
    root.setAttribute('role', 'alert');

    const text = documentRef.createElement('span');
    text.className = 'atria-immersive-failure-text';
    text.textContent = translate('Response did not complete');
    text.setAttribute('data-i18n', 'Response did not complete');

    const retryButton = makeButton(documentRef, translate('Retry'), 'atria-immersive-failure-action');
    const reasonButton = makeButton(documentRef, translate('View reason'), 'atria-immersive-failure-action');
    const dismissButton = makeButton(documentRef, translate('Keep'), 'atria-immersive-failure-action atria-immersive-failure-dismiss');
    retryButton.setAttribute('data-i18n', 'Retry');
    reasonButton.setAttribute('data-i18n', 'View reason');
    dismissButton.setAttribute('data-i18n', 'Keep;[aria-label]Dismiss failure notice');
    dismissButton.setAttribute('aria-label', translate('Dismiss failure notice'));

    root.append(text, retryButton, reasonButton, dismissButton);
    sendForm.prepend(root);

    let enabled = false;
    let lastFailure = null;

    const clear = () => {
        lastFailure = null;
        root.hidden = true;
    };

    const reportFailure = failure => {
        if (!enabled) return;
        lastFailure = {
            message: String(failure?.message || ''),
            owner: failure?.owner ? String(failure.owner) : '',
            at: Date.now(),
        };
        root.hidden = false;
        onWake();
        retryButton.focus({ preventScroll: true });
    };

    retryButton.addEventListener('click', () => {
        clear();
        retry();
    });
    reasonButton.addEventListener('click', () => {
        onWake();
        openDiagnostics(lastFailure);
    });
    dismissButton.addEventListener('click', clear);

    return {
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            if (!enabled) clear();
        },
        reportFailure,
        clear,
        close() {
            if (root.hidden) return false;
            clear();
            return true;
        },
        hasOpen: () => !root.hidden,
        getLastFailure: () => lastFailure ? { ...lastFailure } : null,
        dispose() {
            root.remove();
        },
    };
}
